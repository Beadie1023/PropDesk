// Nadaraya-Watson kernel regression with a rational quadratic kernel — an
// original implementation of this general, well-documented statistical
// smoothing technique (not a port of any specific published indicator's
// code). This is the same general method the real Lorentzian
// Classification indicator's "Kernel Settings" section uses for its
// smoothed trend line, reproduced here from the underlying math rather
// than copied from anyone's script.

import type { Candle } from './marketData';

export type KernelRegressionOptions = {
  lookback?: number; // h — bandwidth: how far back each point's estimate looks
  relativeWeighting?: number; // r (alpha) — higher values behave more like a simple average, lower values track recent price more closely
  lag?: number; // shifts the estimate this many bars back, trading smoothness for responsiveness
};

export type KernelPoint = {
  time: number;
  value: number;
};

/**
 * Rational quadratic kernel: weights nearby points highly and distant
 * points progressively less, with `relativeWeighting` (alpha) controlling
 * how quickly that falloff happens.
 */
function rationalQuadraticWeight(distance: number, lookback: number, relativeWeighting: number): number {
  return Math.pow(1 + (distance * distance) / (2 * relativeWeighting * lookback * lookback), -relativeWeighting);
}

/**
 * Computes a kernel-regression-smoothed line from real close prices.
 * Every point's estimate is a weighted average of nearby closes, weighted
 * by the rational quadratic kernel — closer bars count more, and how
 * quickly that influence fades is controlled by lookback/relativeWeighting.
 *
 * `lag` shifts the whole estimate back by that many bars, which is how
 * the reference indicator trades smoothness against how current the line
 * looks — higher lag = smoother but staler.
 */
export function computeKernelRegression(candles: Candle[], options: KernelRegressionOptions = {}): KernelPoint[] {
  const { lookback = 8, relativeWeighting = 8, lag = 2 } = options;

  const closes = candles.map((c) => c.close);
  const n = closes.length;
  if (n === 0) return [];

  const estimates: number[] = new Array(n);

  for (let i = 0; i < n; i++) {
    let weightedSum = 0;
    let weightTotal = 0;

    // Kernel regression looks backward from each point — only bars up to
    // and including i contribute, matching how the reference indicator
    // avoids using future data at each point in the series.
    const windowStart = Math.max(0, i - lookback * 3);
    for (let j = windowStart; j <= i; j++) {
      const distance = i - j;
      const weight = rationalQuadraticWeight(distance, lookback, relativeWeighting);
      weightedSum += closes[j] * weight;
      weightTotal += weight;
    }

    estimates[i] = weightTotal > 0 ? weightedSum / weightTotal : closes[i];
  }

  // Apply lag: shift the estimate series back by `lag` bars, holding the
  // earliest value flat for the first `lag` points rather than leaving
  // them undefined.
  const lagged: number[] = estimates.map((_, i) => estimates[Math.max(0, i - lag)]);

  return candles.map((c, i) => ({ time: c.time, value: lagged[i] }));
}
