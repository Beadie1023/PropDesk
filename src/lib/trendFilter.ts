// Trend/regime detection — an original implementation of the general
// "is the market trending or ranging" concept, NOT a reproduction of any
// specific published indicator's internal formula (the real Lorentzian
// Classification indicator's exact regime-filter math isn't public).
//
// Honesty note: the -0.1 threshold matches what's visible in the
// reference indicator's settings string, but this implementation's
// internal scale is our own (documented below) — it is calibrated to
// behave sensibly with that threshold, not verified to numerically match
// the closed-source original bar-for-bar.

import type { Candle } from './marketData';

export type TrendFilterResult = {
  value: number;
  trending: boolean;
  threshold: number;
};

const DEFAULT_LOOKBACK = 20;
const DEFAULT_THRESHOLD = -0.1;

/**
 * Fits a simple least-squares line to the last `lookback` closes, then
 * expresses that slope in units of "typical single-bar movement" (the
 * average absolute bar-to-bar change over the same window). A value of
 * 0 means no meaningful drift relative to normal noise; positive values
 * mean a clean uptrend; negative values a clean downtrend; magnitude
 * indicates how strong the trend is relative to typical volatility.
 *
 * `threshold` gates whether the market is considered "trending enough"
 * to trust a directional read — the default -0.1 is fairly permissive,
 * filtering out only a persistent adverse drift, not just any noise.
 */
export function computeTrendFilter(
  candles: Candle[],
  lookback: number = DEFAULT_LOOKBACK,
  threshold: number = DEFAULT_THRESHOLD,
): TrendFilterResult | null {
  if (candles.length < lookback + 1) return null;

  const window = candles.slice(-lookback);
  const closes = window.map((c) => c.close);
  const n = closes.length;

  const xMean = (n - 1) / 2;
  const yMean = closes.reduce((sum, v) => sum + v, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (closes[i] - yMean);
    den += (i - xMean) * (i - xMean);
  }
  const slope = den !== 0 ? num / den : 0;

  let avgAbsChange = 0;
  for (let i = 1; i < n; i++) {
    avgAbsChange += Math.abs(closes[i] - closes[i - 1]);
  }
  avgAbsChange /= n - 1;

  const value = avgAbsChange > 0 ? slope / avgAbsChange : 0;

  // Magnitude-based, not signed: a strong trend in EITHER direction
  // should pass this filter — only a weak/choppy market (|value| below
  // the threshold's magnitude) should be rejected. Comparing the raw
  // signed value against a negative threshold would incorrectly treat a
  // strong downtrend as "not trending," which defeats the filter's
  // purpose — verified against a synthetic clean-downtrend test case.
  const trending = Math.abs(value) >= Math.abs(threshold);

  return { value, trending, threshold };
}

/**
 * Average True Range over `period` bars — standard volatility measure,
 * used here to size the SL/TP distance for the position marker so it
 * scales with current market conditions instead of a fixed pip count.
 */
export function computeATR(candles: Candle[], period: number = 14): number | null {
  if (candles.length < period + 1) return null;

  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trueRanges.push(tr);
  }

  const recent = trueRanges.slice(-period);
  return recent.reduce((sum, v) => sum + v, 0) / recent.length;
}
