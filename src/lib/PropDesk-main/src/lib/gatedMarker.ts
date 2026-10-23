// Position marker driven by the Probability Gate instead of a fixed 1-ATR stop.
//
//   stop   = the gate's structural stop (tucked behind a real level)
//   target = entry +/- TARGET_RR x stop distance (default 1:3)
//   allowed only if the gate does NOT block the trade (min RR 1:2, ATR left, etc.)
//
// When the trade is blocked, `allowed` is false and `reasons` says why, so the UI can
// show "no valid setup" instead of drawing lines you shouldn't trade.

import type { Candle } from './marketData';
import { buildMarketContext, type Direction } from './bias';
import { TARGET_RR, evaluateGate, type GateMode } from './probabilityFactor';

export type GatedMarker = {
  direction: Direction;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskAmount: number; // price units
  rewardAmount: number; // price units
  ratio: number;
  stopPips: number;
  mode: GateMode;
  score: 0 | 1 | 2 | 3;
  /** False when the gate blocks the trade (including reward:risk below the minimum). */
  allowed: boolean;
  reasons: string[];
  tag: string;
};

export function computeGatedMarker(
  hourlyCandles: Candle[],
  direction: Direction,
  rr: number = TARGET_RR,
): GatedMarker | null {
  const ctx = buildMarketContext(hourlyCandles);
  if (!ctx) return null;

  const gate = evaluateGate({ ctx, direction, rr });
  const risk = Math.abs(gate.entry - gate.stop);
  if (risk <= 0) return null;

  const sign = direction === 'long' ? 1 : -1;
  return {
    direction,
    entry: gate.entry,
    stopLoss: gate.stop,
    takeProfit: gate.entry + sign * risk * rr,
    riskAmount: risk,
    rewardAmount: risk * rr,
    ratio: rr,
    stopPips: gate.stopPips,
    mode: gate.mode,
    score: gate.score,
    allowed: gate.mode !== 'blocked',
    reasons: gate.reasons,
    tag: gate.tag,
  };
}
