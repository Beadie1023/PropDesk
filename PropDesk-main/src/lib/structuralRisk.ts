// Structural stop placement + position sizing.
//
// Core idea from the video: dollar risk is fixed, but the STOP must sit where
// the trade idea is invalidated (beyond a level), not wherever $X happens to
// land. So: pick the structural stop first, then size the lots to fit the
// dollar risk — never the other way round.

import { contextLevels, type Direction, type MarketContext } from './bias';

export const DEFAULT_PIP_SIZE = 0.0001;

export type StopSuggestion = {
  price: number;
  distance: number; // price units
  pips: number;
  /** The level the stop is tucked behind, if any. */
  levelLabel: string | null;
  structural: boolean;
  note: string;
};

export type StopOptions = {
  pipSize?: number;
  /** Buffer beyond the level, as a fraction of daily ATR (min 2 pips). */
  bufferAtrFrac?: number;
  /** "At a zone" = nearest adverse level within this fraction of ATR of entry. */
  atZoneAtrFrac?: number;
  /** Stops tighter than this are treated as noise and rejected. */
  minStopPips?: number;
  /** Used only when no usable structure exists. */
  fallbackAtrFrac?: number;
};

/**
 * Stop rules:
 *  1. Entry AT a zone (nearest adverse-side level is close): stop just beyond
 *     that level. This is "sell at the swing high, stop right above it".
 *  2. Otherwise (entry mid-range / chasing): stop beyond the session extreme
 *     on the adverse side — "below the low of the day". That stop is usually
 *     wide, which is exactly why chasing trades fail the feasibility check.
 *  3. If neither is usable, fall back to a fraction of ATR and say so.
 */
export function suggestStop(
  direction: Direction,
  entry: number,
  ctx: MarketContext,
  options: StopOptions = {},
): StopSuggestion {
  const {
    pipSize = DEFAULT_PIP_SIZE,
    bufferAtrFrac = 0.05,
    atZoneAtrFrac = 0.25,
    minStopPips = 5,
    fallbackAtrFrac = 0.5,
  } = options;

  const buffer = Math.max(ctx.atr * bufferAtrFrac, 2 * pipSize);
  const levels = contextLevels(ctx);
  const sign = direction === 'long' ? -1 : 1; // stop side: below for long, above for short

  const adverse = levels
    .filter((l) => (direction === 'long' ? l.price <= entry : l.price >= entry))
    .sort((a, b) => Math.abs(a.price - entry) - Math.abs(b.price - entry));

  const build = (levelPrice: number, label: string, note: string): StopSuggestion => {
    const price = levelPrice + sign * buffer;
    const distance = Math.abs(entry - price);
    return { price, distance, pips: distance / pipSize, levelLabel: label, structural: true, note };
  };

  // Rule 1: at a zone
  const nearest = adverse[0];
  if (nearest && Math.abs(nearest.price - entry) <= ctx.atr * atZoneAtrFrac) {
    const s = build(nearest.price, nearest.label, `Tucked behind ${nearest.label}`);
    if (s.pips >= minStopPips) return s;
  }

  // Rule 2: beyond the session extreme
  const extreme =
    direction === 'long' ? Math.min(ctx.sessionLow, entry) : Math.max(ctx.sessionHigh, entry);
  const s2 = build(
    extreme,
    direction === 'long' ? 'Session low' : 'Session high',
    'Entry is mid-range, so the structural stop is beyond the session extreme',
  );
  if (s2.pips >= minStopPips) return s2;

  // Rule 3: fallback
  const distance = ctx.atr * fallbackAtrFrac;
  return {
    price: entry + sign * distance,
    distance,
    pips: distance / pipSize,
    levelLabel: null,
    structural: false,
    note: 'No usable structure — ATR fallback stop (not structural)',
  };
}

/** Nearest opposing liquidity level in the profit direction, if any. */
export function suggestTarget(
  direction: Direction,
  entry: number,
  ctx: MarketContext,
): { price: number; label: string } | null {
  const candidates = contextLevels(ctx)
    .filter((l) => (direction === 'long' ? l.price > entry : l.price < entry))
    .sort((a, b) => Math.abs(a.price - entry) - Math.abs(b.price - entry));
  return candidates[0] ? { price: candidates[0].price, label: candidates[0].label } : null;
}

export type SizingInput = {
  riskUsd: number;
  stopPips: number;
  /** Dollars per pip for ONE standard lot (account.pipValue / account.lots in PropDesk). */
  pipValuePerLot: number;
  lotStep?: number;
  minLots?: number;
  maxLots?: number;
};

export type SizingResult = {
  lots: number;
  actualRiskUsd: number;
  /** True when even the minimum lot would risk more than riskUsd. */
  belowMin: boolean;
};

/** lots = riskUsd / (stopPips × $/pip/lot), rounded DOWN to the lot step. */
export function lotsForRisk(input: SizingInput): SizingResult {
  const { riskUsd, stopPips, pipValuePerLot, lotStep = 0.01, minLots = 0.01, maxLots } = input;
  if (!(riskUsd > 0) || !(stopPips > 0) || !(pipValuePerLot > 0)) {
    return { lots: 0, actualRiskUsd: 0, belowMin: false };
  }
  const raw = riskUsd / (stopPips * pipValuePerLot);
  let lots = Math.floor(raw / lotStep + 1e-9) * lotStep;
  lots = Math.round(lots * 1e6) / 1e6;
  if (maxLots !== undefined) lots = Math.min(lots, maxLots);
  if (lots < minLots) return { lots: 0, actualRiskUsd: 0, belowMin: true };
  return { lots, actualRiskUsd: lots * stopPips * pipValuePerLot, belowMin: false };
}
