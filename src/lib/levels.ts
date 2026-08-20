// Support/resistance detection — an original implementation of the
// standard swing-point-clustering technique (not tied to any specific
// proprietary indicator). Finds local price extremes, groups nearby ones
// into zones, and ranks zones by how many times price actually touched
// them — more touches means a more significant level.

import type { Candle } from './marketData';

export type SRLevel = {
  price: number;
  type: 'support' | 'resistance';
  touches: number;
};

type SwingPoint = { price: number; index: number };

/**
 * A bar is a swing high if its high is the highest point within
 * `lookback` bars on both sides — a swing low is the mirror case for
 * lows. This is the standard definition used across most swing-based
 * technical analysis, not specific to any one indicator.
 */
function findSwingPoints(candles: Candle[], lookback: number): { highs: SwingPoint[]; lows: SwingPoint[] } {
  const highs: SwingPoint[] = [];
  const lows: SwingPoint[] = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    const window = candles.slice(i - lookback, i + lookback + 1);
    const isSwingHigh = window.every((c) => c.high <= candles[i].high);
    const isSwingLow = window.every((c) => c.low >= candles[i].low);

    if (isSwingHigh) highs.push({ price: candles[i].high, index: i });
    if (isSwingLow) lows.push({ price: candles[i].low, index: i });
  }

  return { highs, lows };
}

/**
 * Groups swing points that are within `tolerancePercent` of each other
 * into a single zone (real price reactions cluster near a level rather
 * than hitting one exact price every time), then returns each zone's
 * average price and how many swing points fell into it.
 */
function clusterLevels(points: SwingPoint[], tolerancePercent: number): { price: number; touches: number }[] {
  if (points.length === 0) return [];

  const sorted = [...points].sort((a, b) => a.price - b.price);
  const clusters: SwingPoint[][] = [[sorted[0]]];

  for (let i = 1; i < sorted.length; i++) {
    const point = sorted[i];
    const currentCluster = clusters[clusters.length - 1];
    const clusterAvg = currentCluster.reduce((sum, p) => sum + p.price, 0) / currentCluster.length;

    if (Math.abs(point.price - clusterAvg) / clusterAvg <= tolerancePercent / 100) {
      currentCluster.push(point);
    } else {
      clusters.push([point]);
    }
  }

  return clusters.map((cluster) => ({
    price: cluster.reduce((sum, p) => sum + p.price, 0) / cluster.length,
    touches: cluster.length,
  }));
}

export type SupportResistanceOptions = {
  lookback?: number; // bars on each side to qualify as a swing point
  tolerancePercent?: number; // how close prices need to be to count as the same level
  minTouches?: number; // a level needs at least this many swing points to count
  maxLevelsPerSide?: number; // cap how many support/resistance lines to return, each side
};

/**
 * Computes support and resistance levels from real OHLC candles (never
 * from a smoothed/derived series like Heikin Ashi — that would blur
 * exactly the price reactions this is meant to find). Returns the
 * strongest levels (most swing-point touches) on each side, capped to
 * avoid cluttering a chart with marginal levels.
 */
export function computeSupportResistance(candles: Candle[], options: SupportResistanceOptions = {}): SRLevel[] {
  const { lookback = 3, tolerancePercent = 0.08, minTouches = 2, maxLevelsPerSide = 3 } = options;

  if (candles.length < lookback * 2 + 5) return [];

  const { highs, lows } = findSwingPoints(candles, lookback);

  const resistanceZones = clusterLevels(highs, tolerancePercent)
    .filter((z) => z.touches >= minTouches)
    .sort((a, b) => b.touches - a.touches)
    .slice(0, maxLevelsPerSide);

  const supportZones = clusterLevels(lows, tolerancePercent)
    .filter((z) => z.touches >= minTouches)
    .sort((a, b) => b.touches - a.touches)
    .slice(0, maxLevelsPerSide);

  const levels: SRLevel[] = [
    ...resistanceZones.map((z) => ({ price: z.price, type: 'resistance' as const, touches: z.touches })),
    ...supportZones.map((z) => ({ price: z.price, type: 'support' as const, touches: z.touches })),
  ];

  return levels.sort((a, b) => b.price - a.price);
}
