// Lorentzian Classification, configured to match the TradingView settings string
//   "close 8 2000 5 1 -0.1 20 | RSI 14 1 | WT 10 11 | CCI 20 1 | ADX 20 2 | RSI 9 1 | 200 200 | 8 8 25 2 0"
//
//   - 5 features: RSI(14,1), WaveTrend(10,11), CCI(20,1), ADX(20,2), RSI(9,1)
//   - 8 neighbours, up to 2000 bars of history, label = price direction 4 bars later
//   - Filters: volatility, regime (-0.1), ADX (> 20), 200 EMA, 200 SMA
//   - "Trade with Kernel" on (kernel rate of change must agree)
//
// HONESTY NOTE: this is a re-implementation of the published, open-source
// algorithm written from the author's understanding of it. It is NOT a copy of the
// TradingView script, so it will not match your chart bar-for-bar. The regime-filter
// constants and the kernel "regression level 25" setting are approximations.
// Check it against your TradingView chart before trusting it, and backtest it.
//
// This file must stay self-contained (type-only import below) because the backend
// gets an auto-generated plain-JS copy of it: server/src/lib/lorentzian.js.
// After editing this file, regenerate that copy (see docs/PROBABILITY_GATE.md).

import type { Candle } from './marketData';

export type LorentzianDirection = 'bullish' | 'bearish' | 'neutral';

export type LorentzianResult = {
  /** Final read after ALL filters (classifier + 200 EMA/SMA + kernel). */
  direction: LorentzianDirection;
  /** The classifier's own state before the EMA/SMA/kernel trade filters. */
  rawDirection: LorentzianDirection;
  /** Share of the nearest neighbours that voted bullish, 0-100. */
  confidence: number;
  nearestBars: number;
  /** Sum of neighbour votes (+1 up / -1 down). Range is -neighbors..+neighbors. */
  prediction: number;
  /** Plain-English reasons the trade filters turned a raw signal into neutral. */
  blockedBy: string[];
};

export type LorentzianSettings = {
  neighbors: number;
  maxBarsBack: number;
  lookahead: number;
  regimeThreshold: number;
  adxThreshold: number;
  emaPeriod: number;
  smaPeriod: number;
  useVolatilityFilter: boolean;
  useRegimeFilter: boolean;
  useAdxFilter: boolean;
  useEmaFilter: boolean;
  useSmaFilter: boolean;
  useKernelFilter: boolean;
  kernelLookback: number;
  kernelRelativeWeighting: number;
  /** How many of the most recent bars to replay so the signal "state" carries forward. */
  replayBars: number;
};

export const TV_SETTINGS: LorentzianSettings = {
  neighbors: 8,
  maxBarsBack: 2000,
  lookahead: 4,
  regimeThreshold: -0.1,
  adxThreshold: 20,
  emaPeriod: 200,
  smaPeriod: 200,
  useVolatilityFilter: true,
  useRegimeFilter: true,
  useAdxFilter: true,
  useEmaFilter: true,
  useSmaFilter: true,
  useKernelFilter: true,
  kernelLookback: 8,
  kernelRelativeWeighting: 8,
  replayBars: 60,
};

/** Needs the 200-bar averages plus some warm-up and training history. */
export const LORENTZIAN_MIN_CANDLES = 300;

// ---------------------------------------------------------------------------
// Small indicator helpers (arrays are aligned with the candle array; NaN = not ready)
// ---------------------------------------------------------------------------

function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  const alpha = 2 / (period + 1);
  let prev = NaN;
  for (let i = 0; i < values.length; i++) {
    const x = values[i];
    if (Number.isNaN(x)) continue;
    prev = Number.isNaN(prev) ? x : alpha * x + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

function sma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < values.length; i++) {
    const x = values[i];
    if (Number.isNaN(x)) {
      sum = 0;
      count = 0;
      continue;
    }
    sum += x;
    count++;
    if (count > period) sum -= values[i - period];
    if (count >= period) out[i] = sum / period;
  }
  return out;
}

/** Wilder smoothing (Pine's ta.rma): seeded with an SMA, then alpha = 1/period. */
function rma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  let prev = NaN;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < values.length; i++) {
    const x = values[i];
    if (Number.isNaN(x)) continue;
    if (Number.isNaN(prev)) {
      sum += x;
      count++;
      if (count === period) {
        prev = sum / period;
        out[i] = prev;
      }
    } else {
      prev = (prev * (period - 1) + x) / period;
      out[i] = prev;
    }
  }
  return out;
}

function trueRange(c: Candle[]): number[] {
  return c.map((bar, i) => {
    if (i === 0) return bar.high - bar.low;
    const pc = c[i - 1].close;
    return Math.max(bar.high - bar.low, Math.abs(bar.high - pc), Math.abs(bar.low - pc));
  });
}

function rsi(closes: number[], period: number): number[] {
  const gains = closes.map((x, i) => (i === 0 ? NaN : Math.max(x - closes[i - 1], 0)));
  const losses = closes.map((x, i) => (i === 0 ? NaN : Math.max(closes[i - 1] - x, 0)));
  const ag = rma(gains, period);
  const al = rma(losses, period);
  return closes.map((_, i) => {
    if (Number.isNaN(ag[i]) || Number.isNaN(al[i])) return NaN;
    return al[i] === 0 ? 100 : 100 - 100 / (1 + ag[i] / al[i]);
  });
}

function cci(src: number[], period: number): number[] {
  const mean = sma(src, period);
  return src.map((x, i) => {
    if (Number.isNaN(mean[i])) return NaN;
    let dev = 0;
    for (let j = i - period + 1; j <= i; j++) dev += Math.abs(src[j] - mean[i]);
    dev /= period;
    return dev === 0 ? 0 : (x - mean[i]) / (0.015 * dev);
  });
}

/** WaveTrend oscillator difference (wt1 - wt2). */
function waveTrend(c: Candle[], n1: number, n2: number): number[] {
  const ap = c.map((b) => (b.high + b.low + b.close) / 3);
  const esa = ema(ap, n1);
  const d = ema(
    ap.map((x, i) => Math.abs(x - esa[i])),
    n1,
  );
  const ci = ap.map((x, i) => (d[i] === 0 || Number.isNaN(d[i]) ? NaN : (x - esa[i]) / (0.015 * d[i])));
  const wt1 = ema(ci, n2);
  const wt2 = sma(wt1, 4);
  return wt1.map((x, i) => (Number.isNaN(x) || Number.isNaN(wt2[i]) ? NaN : x - wt2[i]));
}

function adx(c: Candle[], length: number): number[] {
  const tr = trueRange(c);
  const plusDm = c.map((b, i) => {
    if (i === 0) return NaN;
    const up = b.high - c[i - 1].high;
    const down = c[i - 1].low - b.low;
    return up > down && up > 0 ? up : 0;
  });
  const minusDm = c.map((b, i) => {
    if (i === 0) return NaN;
    const up = b.high - c[i - 1].high;
    const down = c[i - 1].low - b.low;
    return down > up && down > 0 ? down : 0;
  });
  const trSm = rma(tr, length);
  const plusSm = rma(plusDm, length);
  const minusSm = rma(minusDm, length);
  const dx = c.map((_, i) => {
    if ([trSm[i], plusSm[i], minusSm[i]].some((v) => Number.isNaN(v)) || trSm[i] === 0) return NaN;
    const plus = (100 * plusSm[i]) / trSm[i];
    const minus = (100 * minusSm[i]) / trSm[i];
    const sum = plus + minus;
    return (100 * Math.abs(plus - minus)) / (sum === 0 ? 1 : sum);
  });
  return rma(dx, length);
}

/** Scales a series to 0..1 using the running (no look-ahead) min and max. */
function normalizeRunning(values: number[]): number[] {
  let lo = Infinity;
  let hi = -Infinity;
  return values.map((x) => {
    if (Number.isNaN(x)) return NaN;
    lo = Math.min(lo, x);
    hi = Math.max(hi, x);
    return (x - lo) / Math.max(hi - lo, 1e-9);
  });
}

// ---------------------------------------------------------------------------
// Regime filter: Kalman-style slope-decline test (approximation, see header note)
// ---------------------------------------------------------------------------

function regimeOk(c: Candle[], threshold: number): boolean[] {
  const n = c.length;
  const absSlope = new Array<number>(n).fill(NaN);
  let v1 = 0;
  let v2 = 0;
  let klmf = c[0].close;
  for (let i = 1; i < n; i++) {
    v1 = 0.2 * (c[i].close - c[i - 1].close) + 0.8 * v1;
    v2 = 0.1 * (c[i].high - c[i].low) + 0.8 * v2;
    const omega = v2 === 0 ? 0 : Math.abs(v1 / v2);
    const alpha = (-omega * omega + Math.sqrt(omega ** 4 + 16 * omega * omega)) / 8;
    const next = alpha * c[i].close + (1 - alpha) * klmf;
    absSlope[i] = Math.abs(next - klmf);
    klmf = next;
  }
  const avg = ema(absSlope, 200);
  return absSlope.map((s, i) => {
    if (Number.isNaN(s) || Number.isNaN(avg[i]) || avg[i] === 0) return true; // not enough data: don't block
    return (s - avg[i]) / avg[i] >= threshold;
  });
}

// ---------------------------------------------------------------------------
// Kernel (Nadaraya-Watson, rational quadratic) - only the last two raw estimates
// ---------------------------------------------------------------------------

function kernelEstimateAt(closes: number[], i: number, lookback: number, alpha: number): number {
  let num = 0;
  let den = 0;
  const start = Math.max(0, i - lookback * 3);
  for (let j = start; j <= i; j++) {
    const d = i - j;
    const w = Math.pow(1 + (d * d) / (2 * alpha * lookback * lookback), -alpha);
    num += closes[j] * w;
    den += w;
  }
  return den > 0 ? num / den : closes[i];
}

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

function lorentzianDistance(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.log(1 + Math.abs(a[i] - b[i]));
  return s;
}

type Prepared = {
  c: Candle[];
  n: number;
  closes: number[];
  firstValid: number;
  settings: LorentzianSettings;
  classify: (b: number) => { prediction: number; votes: number[] };
  filtersPass: (b: number) => boolean;
  /** Reasons the 200 EMA / 200 SMA / kernel trade filters reject `raw` at bar b (empty = fine). */
  tradeFilters: (b: number, raw: LorentzianDirection) => string[];
};

/** Computes everything once (features, labels, filters); every bar's read then reuses it. */
function prepare(input: Candle[], overrides: Partial<LorentzianSettings>): Prepared | null {
  const s = { ...TV_SETTINGS, ...overrides };
  if (input.length < LORENTZIAN_MIN_CANDLES) return null;

  const c = [...input].sort((a, b) => a.time - b.time);
  const n = c.length;
  const closes = c.map((b) => b.close);

  // --- features (all scaled 0..1) ---
  const f1 = normalizeRunning(ema(rsi(closes, 14), 1).map((v) => v / 100));
  const f2 = normalizeRunning(ema(waveTrend(c, 10, 11), 1));
  const f3 = normalizeRunning(ema(cci(closes, 20), 1));
  const f4 = adx(c, 20).map((v) => v / 100);
  const f5 = normalizeRunning(ema(rsi(closes, 9), 1).map((v) => v / 100));
  const feats: number[][] = closes.map((_, i) => [f1[i], f2[i], f3[i], f4[i], f5[i]]);
  const valid = feats.map((f) => f.every((v) => !Number.isNaN(v)));
  const firstValid = valid.findIndex(Boolean);
  if (firstValid < 0 || n - firstValid < 120) return null;

  // --- training labels: where was price `lookahead` bars after each bar? ---
  const labels = closes.map((x, i) => (i + s.lookahead < n ? Math.sign(closes[i + s.lookahead] - x) : 0));

  // --- filters (all causal: each bar only uses data up to that bar) ---
  const tr = trueRange(c);
  const atr10 = rma(tr, 10);
  const adx14 = adx(c, 14);
  const regime = regimeOk(c, s.regimeThreshold);
  const ema200 = ema(closes, s.emaPeriod);
  const sma200 = sma(closes, s.smaPeriod);

  const filtersPass = (b: number): boolean => {
    if (s.useVolatilityFilter && !(Number.isNaN(atr10[b]) || tr[b] > atr10[b])) return false;
    if (s.useRegimeFilter && !regime[b]) return false;
    if (s.useAdxFilter && !(Number.isNaN(adx14[b]) || adx14[b] > s.adxThreshold)) return false;
    return true;
  };

  // --- approximate nearest-neighbour search (chronological, as in the original) ---
  const classify = (b: number): { prediction: number; votes: number[] } => {
    const start = Math.max(firstValid, b - s.maxBarsBack + 1);
    const end = b - s.lookahead; // the label must be known by bar b
    let lastDistance = -1;
    const dists: number[] = [];
    const preds: number[] = [];
    for (let t = start; t <= end; t++) {
      if (t % 4 === 0 || !valid[t]) continue;
      const d = lorentzianDistance(feats[b], feats[t]);
      if (d >= lastDistance) {
        lastDistance = d;
        dists.push(d);
        preds.push(labels[t]);
        if (preds.length > s.neighbors) {
          lastDistance = dists[Math.round((s.neighbors * 3) / 4)];
          dists.shift();
          preds.shift();
        }
      }
    }
    return { prediction: preds.reduce((a, v) => a + v, 0), votes: preds };
  };

  // --- trade filters: 200 EMA, 200 SMA, kernel direction ---
  const tradeFilters = (b: number, raw: LorentzianDirection): string[] => {
    const blockedBy: string[] = [];
    if (raw === 'neutral') return blockedBy;
    const up = raw === 'bullish';
    const px = closes[b];
    if (s.useEmaFilter && !Number.isNaN(ema200[b]) && (up ? px <= ema200[b] : px >= ema200[b]))
      blockedBy.push(`price is ${up ? 'below' : 'above'} the ${s.emaPeriod} EMA`);
    if (s.useSmaFilter && !Number.isNaN(sma200[b]) && (up ? px <= sma200[b] : px >= sma200[b]))
      blockedBy.push(`price is ${up ? 'below' : 'above'} the ${s.smaPeriod} SMA`);
    if (s.useKernelFilter && b >= 1) {
      const now = kernelEstimateAt(closes, b, s.kernelLookback, s.kernelRelativeWeighting);
      const prev = kernelEstimateAt(closes, b - 1, s.kernelLookback, s.kernelRelativeWeighting);
      if (up ? !(now > prev) : !(now < prev)) blockedBy.push(`kernel is not ${up ? 'rising' : 'falling'}`);
    }
    return blockedBy;
  };

  return { c, n, closes, firstValid, settings: s, classify, filtersPass, tradeFilters };
}

const directionOf = (state: number): LorentzianDirection =>
  state === 1 ? 'bullish' : state === -1 ? 'bearish' : 'neutral';

export function computeLorentzian(
  input: Candle[],
  overrides: Partial<LorentzianSettings> = {},
): LorentzianResult | null {
  const p = prepare(input, overrides);
  if (!p) return null;
  const { n, firstValid, settings: s, classify, filtersPass, tradeFilters } = p;

  // Replay the last few bars so the signal state (which persists until it flips) is right.
  let state = 0;
  const from = Math.max(firstValid + 50, n - s.replayBars);
  for (let b = from; b < n; b++) {
    const { prediction } = classify(b);
    const pass = filtersPass(b);
    if (prediction > 0 && pass) state = 1;
    else if (prediction < 0 && pass) state = -1;
  }

  const last = n - 1;
  const { prediction, votes } = classify(last);
  const bullishVotes = votes.filter((v) => v > 0).length;
  const confidence = votes.length ? (bullishVotes / votes.length) * 100 : 50;

  const rawDirection = directionOf(state);
  const blockedBy = tradeFilters(last, rawDirection);

  return {
    direction: blockedBy.length ? 'neutral' : rawDirection,
    rawDirection,
    confidence,
    nearestBars: votes.length,
    prediction,
    blockedBy,
  };
}

export type LorentzianSeriesPoint = {
  time: number;
  direction: LorentzianDirection;
  rawDirection: LorentzianDirection;
};

/**
 * The read at EVERY bar (for backtesting). Each point only uses data up to its own bar,
 * so it can be replayed without look-ahead. Entries before the warm-up are omitted
 * (index i of `points` is bar `startIndex + i` of `candles`).
 */
export function computeLorentzianSeries(
  input: Candle[],
  overrides: Partial<LorentzianSettings> = {},
): { candles: Candle[]; startIndex: number; points: LorentzianSeriesPoint[] } | null {
  const p = prepare(input, overrides);
  if (!p) return null;
  const { c, n, firstValid, classify, filtersPass, tradeFilters } = p;

  const startIndex = firstValid + 50;
  const points: LorentzianSeriesPoint[] = [];
  let state = 0;
  for (let b = startIndex; b < n; b++) {
    const { prediction } = classify(b);
    const pass = filtersPass(b);
    if (prediction > 0 && pass) state = 1;
    else if (prediction < 0 && pass) state = -1;
    const rawDirection = directionOf(state);
    const blocked = tradeFilters(b, rawDirection).length > 0;
    points.push({ time: c[b].time, rawDirection, direction: blocked ? 'neutral' : rawDirection });
  }
  return { candles: c, startIndex, points };
}
