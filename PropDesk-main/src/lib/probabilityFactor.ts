// The "probability factor" gate: before taking a trade, check three things.
//   1. Trend bias   - is the trade with price vs the daily SMA(50)?
//   2. Zone         - is price nearer the liquidity zone that favours this side?
//   3. Range value  - can the daily ATR that's LEFT actually pay for the target?
//
// Output is a score, a mode (full / reduced / scalp / blocked) and plain-English
// reasons. It is a checklist, not a prediction — nothing here is a proven edge.
// Log the score on every trade and measure it before trusting it.

import type { Direction, MarketContext } from './bias';
import { suggestStop, suggestTarget, type StopOptions } from './structuralRisk';

export type GateMode = 'full' | 'reduced' | 'scalp' | 'blocked';

// UNTUNED starting points — adjust after you have journal data per mode.
export const SIZE_MULTIPLIER: Record<GateMode, number> = {
  full: 1,
  reduced: 0.5,
  scalp: 0.25,
  blocked: 0,
};

/** Counter-trend trades are scalps only, so test a small target. */
export const SCALP_RR = 1;

/** Zone must be this lopsided to count (0.5 = exactly mid-way). */
const ZONE_EDGE = 0.4;

export type GateInput = {
  ctx: MarketContext;
  direction: Direction;
  /** Defaults to current price. */
  entry?: number;
  /** Defaults to the structural suggestion. */
  stop?: number;
  /** Desired reward:risk, e.g. 3 for 1:3. */
  rr: number;
  stopOptions?: StopOptions;
};

export type GateResult = {
  direction: Direction;
  entry: number;
  stop: number;
  stopPips: number;
  stopNote: string;
  stopIsStructural: boolean;

  bias: Direction | null;
  counterTrend: boolean;
  biasPoint: boolean;

  zoneFavors: Direction | null;
  zonePoint: boolean;

  atrUsedPct: number; // |price - open| / ATR × 100
  remainingMove: number; // price units still "available" in this direction
  requiredMove: number; // effRR × stop distance
  feasible: boolean;
  effectiveRR: number;

  target: { price: number; label: string } | null;
  structuralRR: number | null; // reward:risk to the next opposing level

  score: 0 | 1 | 2 | 3;
  mode: GateMode;
  sizeMultiplier: number;
  reasons: string[];
  /** Paste into a journal note so every trade carries its gate state. */
  tag: string;
};

/** Which side does location favour? 'short' near upper levels, 'long' near lower. */
export function zoneFavors(ctx: MarketContext, price = ctx.price): Direction | null {
  const upper = [ctx.prevHigh, ctx.swingHigh, ctx.sessionHigh]
    .filter((v): v is number => v !== null && v >= price)
    .sort((a, b) => a - b)[0];
  const lower = [ctx.prevLow, ctx.swingLow, ctx.sessionLow]
    .filter((v): v is number => v !== null && v <= price)
    .sort((a, b) => b - a)[0];

  // Price outside all levels on one side = already broken out; no zone edge.
  if (upper === undefined || lower === undefined) return null;
  const up = upper - price;
  const down = price - lower;
  if (up + down === 0) return null;
  const proximityToUpper = up / (up + down); // small = near the top
  if (proximityToUpper <= ZONE_EDGE) return 'short';
  if (proximityToUpper >= 1 - ZONE_EDGE) return 'long';
  return null;
}

export function evaluateGate(input: GateInput): GateResult {
  const { ctx, direction, rr, stopOptions } = input;
  const entry = input.entry ?? ctx.price;

  const suggested = suggestStop(direction, entry, ctx, stopOptions);
  const stop = input.stop ?? suggested.price;
  const stopDistance = Math.abs(entry - stop);
  const pipSize = stopOptions?.pipSize ?? 0.0001;
  const stopPips = stopDistance / pipSize;
  const usingSuggested = input.stop === undefined;

  const bias = ctx.bias;
  const counterTrend = bias !== null && bias !== direction;
  const biasPoint = bias === direction;

  const zone = zoneFavors(ctx, entry);
  const zonePoint = zone === direction;

  // ATR left in this direction: full ATR minus what the move from the open has used.
  const directional = direction === 'long' ? entry - ctx.sessionOpen : ctx.sessionOpen - entry;
  const remainingMove = Math.min(Math.max(ctx.atr - directional, 0), ctx.atr);
  const atrUsedPct = (Math.abs(entry - ctx.sessionOpen) / ctx.atr) * 100;

  const effectiveRR = counterTrend ? Math.min(rr, SCALP_RR) : rr;
  const requiredMove = effectiveRR * stopDistance;
  const feasible = stopDistance > 0 && requiredMove <= remainingMove;

  const target = suggestTarget(direction, entry, ctx);
  const structuralRR =
    target && stopDistance > 0 ? Math.abs(target.price - entry) / stopDistance : null;

  const score = ((biasPoint ? 1 : 0) + (zonePoint ? 1 : 0) + (feasible ? 1 : 0)) as 0 | 1 | 2 | 3;

  let mode: GateMode;
  if (!feasible) mode = 'blocked';
  else if (counterTrend) mode = 'scalp';
  else if (bias === null) mode = score >= 2 ? 'reduced' : 'blocked';
  else mode = score === 3 ? 'full' : 'reduced';

  const reasons: string[] = [];
  if (bias === null) reasons.push('Not enough history for SMA(50) — bias unknown, size capped.');
  else if (counterTrend)
    reasons.push(`Counter-trend (price is ${bias === 'long' ? 'above' : 'below'} SMA50): scalp only, small size.`);
  else reasons.push('With the daily trend (SMA50).');

  if (zone === null) reasons.push('Price is mid-range or past the levels — location gives no edge.');
  else if (zonePoint) reasons.push(`Location favours ${direction}s (price is near the ${direction === 'short' ? 'upper' : 'lower'} liquidity).`);
  else reasons.push(`Location favours ${zone}s, not ${direction}s.`);

  if (stopDistance === 0) reasons.push('Stop equals entry — nothing to evaluate.');
  else if (feasible)
    reasons.push(`Target needs ${(requiredMove / ctx.atr * 100).toFixed(0)}% of ATR; ${(remainingMove / ctx.atr * 100).toFixed(0)}% remains.`);
  else
    reasons.push(
      `Target needs ${(requiredMove / ctx.atr * 100).toFixed(0)}% of ATR but only ${(remainingMove / ctx.atr * 100).toFixed(0)}% remains — reward likely unreachable.`,
    );

  if (usingSuggested) reasons.push(suggested.note + '.');

  const tag = [
    `gate:${score}/3`,
    `mode:${mode}`,
    `bias:${bias ?? 'na'}`,
    `zone:${zone ?? 'none'}`,
    `atrUsed:${atrUsedPct.toFixed(0)}%`,
    `rr:${rr}`,
  ].join(' ');

  return {
    direction,
    entry,
    stop,
    stopPips,
    stopNote: usingSuggested ? suggested.note : 'Manual stop',
    stopIsStructural: usingSuggested ? suggested.structural : false,
    bias,
    counterTrend,
    biasPoint,
    zoneFavors: zone,
    zonePoint,
    atrUsedPct,
    remainingMove,
    requiredMove,
    feasible,
    effectiveRR,
    target,
    structuralRR,
    score,
    mode,
    sizeMultiplier: SIZE_MULTIPLIER[mode],
    reasons,
    tag,
  };
}
