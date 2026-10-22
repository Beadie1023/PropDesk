// Frontend signal computation. The backend poller keeps a separate plain-JS
// copy at server/lib/signals.js for the Lorentzian + currency-strength math
// (it has no TypeScript build step) — if you change that algorithm here,
// update the backend copy to match, or the panels and the phone
// notifications could disagree with each other. The Trend Meter (MACD /
// RSI / Stochastic) and its role in combineSignals ALSO need mirroring
// there. Everything below the "Kernel regression" marker is frontend-only
// display logic and has no backend counterpart.

import type { Candle } from './marketData';
import { computeKernelRegression as computeKernelPoints } from './kernelRegression';
import { computeATR, computeTrendFilter } from './trendFilter';

export type SignalDirection = 'bullish' | 'bearish' | 'neutral';

function computeRSI(closes: number[], period: number): number[] {
  const rsi = new Array(closes.length).fill(NaN);
  if (closes.length <= period) return rsi;

  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}

function computeROC(closes: number[], period: number): number[] {
  const roc = new Array(closes.length).fill(NaN);
  for (let i = period; i < closes.length; i++) {
    const past = closes[i - period];
    if (past !== 0) roc[i] = ((closes[i] - past) / past) * 100;
  }
  return roc;
}

function lorentzianDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += Math.log(1 + Math.abs(a[i] - b[i]));
  }
  return sum;
}

const LOOKAHEAD_BARS = 4;
const K_NEIGHBORS = 20;
const BULLISH_THRESHOLD = 60;
const BEARISH_THRESHOLD = 40;

export type LorentzianSignal = {
  direction: SignalDirection;
  confidence: number;
  nearestBars: number;
};

export function computeLorentzianSignal(candles: Candle[]): LorentzianSignal | null {
  const MIN_CANDLES = 60;
  if (candles.length < MIN_CANDLES) return null;

  const closes = candles.map((c) => c.close);
  const rsi14 = computeRSI(closes, 14);
  const rsi9 = computeRSI(closes, 9);
  const roc10 = computeROC(closes, 10);

  const points: { features: number[]; label: number }[] = [];
  const minIdx = 15;
  const maxIdx = closes.length - 1 - LOOKAHEAD_BARS;

  for (let i = minIdx; i <= maxIdx; i++) {
    if (Number.isNaN(rsi14[i]) || Number.isNaN(rsi9[i]) || Number.isNaN(roc10[i])) continue;
    const future = closes[i + LOOKAHEAD_BARS];
    const label = future > closes[i] ? 1 : 0;
    points.push({ features: [rsi14[i], rsi9[i], roc10[i]], label });
  }

  if (points.length < K_NEIGHBORS) return null;

  const lastIdx = closes.length - 1;
  if (Number.isNaN(rsi14[lastIdx]) || Number.isNaN(rsi9[lastIdx]) || Number.isNaN(roc10[lastIdx])) {
    return null;
  }
  const current = [rsi14[lastIdx], rsi9[lastIdx], roc10[lastIdx]];

  const distances = points
    .map((p) => ({ d: lorentzianDistance(current, p.features), label: p.label }))
    .sort((a, b) => a.d - b.d);

  const neighbors = distances.slice(0, K_NEIGHBORS);
  const bullishVotes = neighbors.filter((n) => n.label === 1).length;
  const confidence = (bullishVotes / neighbors.length) * 100;

  let direction: SignalDirection = 'neutral';
  if (confidence >= BULLISH_THRESHOLD) direction = 'bullish';
  else if (confidence <= BEARISH_THRESHOLD) direction = 'bearish';

  return { direction, confidence, nearestBars: neighbors.length };
}

// Each currency is scored against TWO reference currencies (USD and EUR) so a
// USD-specific move can't masquerade as GBP or AUD strength. Per reference,
// the reading is RSI(14) of hourly closes, flipped (100 - RSI) when the
// currency is the QUOTE side of the pair (EUR/GBP up = GBP weaker).
// GBP and AUD scores are each the average of their two readings.
export const CURRENCY_STRENGTH_PAIRS = ['GBP/USD', 'AUD/USD', 'EUR/GBP', 'EUR/AUD'] as const;
export type CurrencyStrengthPair = (typeof CURRENCY_STRENGTH_PAIRS)[number];

const STRENGTH_RSI_PERIOD = 14;
const STRENGTH_DIFFERENTIAL_THRESHOLD = 10; // untuned starting point on the 0-100 RSI scale

function lastRSI(candles: Candle[]): number | null {
  if (candles.length <= STRENGTH_RSI_PERIOD) return null;
  const rsi = computeRSI(candles.map((c) => c.close), STRENGTH_RSI_PERIOD);
  const value = rsi[rsi.length - 1];
  return Number.isNaN(value) ? null : value;
}

export type CurrencyStrengthResult = {
  gbpScore: number;
  audScore: number;
  differential: number;
  direction: SignalDirection;
};

export function computeCurrencyStrength(
  candlesByPair: Partial<Record<CurrencyStrengthPair, Candle[]>>,
): CurrencyStrengthResult | null {
  const gbpUsd = lastRSI(candlesByPair['GBP/USD'] || []);
  const audUsd = lastRSI(candlesByPair['AUD/USD'] || []);
  const eurGbp = lastRSI(candlesByPair['EUR/GBP'] || []);
  const eurAud = lastRSI(candlesByPair['EUR/AUD'] || []);

  if (gbpUsd === null || audUsd === null || eurGbp === null || eurAud === null) {
    return null;
  }

  const gbpScore = (gbpUsd + (100 - eurGbp)) / 2;
  const audScore = (audUsd + (100 - eurAud)) / 2;
  const differential = gbpScore - audScore;

  let direction: SignalDirection = 'neutral';
  if (differential >= STRENGTH_DIFFERENTIAL_THRESHOLD) direction = 'bullish';
  else if (differential <= -STRENGTH_DIFFERENTIAL_THRESHOLD) direction = 'bearish';

  return { gbpScore, audScore, differential, direction };
}

// --- Trend Meter (MACD / RSI / Stochastic) ---------------------------------
// Three oscillator "votes", each bullish or bearish on the latest candle:
//   1. MACD(8,21,5): MACD line above its signal line
//   2. RSI(13): above 50
//   3. Stochastic %K(14): above 50
// 3/3 bullish => bullish, 0/3 => bearish, anything else => neutral (mixed).
// Used in combineSignals as a confirmation filter on strong signals only.
// No verified edge — see the forward-outcome test before relying on it.

const TM_MACD_FAST = 8;
const TM_MACD_SLOW = 21;
const TM_MACD_SIGNAL = 5;
const TM_RSI_PERIOD = 13;
const TM_STOCH_PERIOD = 14;
const TM_MIN_CANDLES = 50;

function computeEMA(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(NaN);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function computeMACD(closes: number[], fast: number, slow: number, signal: number) {
  const emaFast = computeEMA(closes, fast);
  const emaSlow = computeEMA(closes, slow);
  const macd = closes.map((_, i) =>
    Number.isNaN(emaFast[i]) || Number.isNaN(emaSlow[i]) ? NaN : emaFast[i] - emaSlow[i],
  );
  const signalLine = new Array(closes.length).fill(NaN);
  const first = macd.findIndex((v) => !Number.isNaN(v));
  if (first >= 0) {
    computeEMA(macd.slice(first), signal).forEach((v, j) => {
      signalLine[first + j] = v;
    });
  }
  return { macd, signalLine };
}

function computeStochasticK(candles: Candle[], period: number): number[] {
  const out = new Array(candles.length).fill(NaN);
  for (let i = period - 1; i < candles.length; i++) {
    let highest = -Infinity;
    let lowest = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      highest = Math.max(highest, candles[j].high);
      lowest = Math.min(lowest, candles[j].low);
    }
    out[i] = highest === lowest ? 50 : ((candles[i].close - lowest) / (highest - lowest)) * 100;
  }
  return out;
}

export type TrendMeterSignal = {
  direction: SignalDirection;
  bullishCount: number; // 0-3 oscillators currently bullish
};

export function computeTrendMeterSignal(candles: Candle[]): TrendMeterSignal | null {
  if (candles.length < TM_MIN_CANDLES) return null;

  const closes = candles.map((c) => c.close);
  const { macd, signalLine } = computeMACD(closes, TM_MACD_FAST, TM_MACD_SLOW, TM_MACD_SIGNAL);
  const rsi = computeRSI(closes, TM_RSI_PERIOD);
  const stochK = computeStochasticK(candles, TM_STOCH_PERIOD);

  const last = closes.length - 1;
  if ([macd[last], signalLine[last], rsi[last], stochK[last]].some((v) => Number.isNaN(v))) {
    return null;
  }

  const bullishCount =
    (macd[last] > signalLine[last] ? 1 : 0) + (rsi[last] > 50 ? 1 : 0) + (stochK[last] > 50 ? 1 : 0);

  const direction: SignalDirection =
    bullishCount === 3 ? 'bullish' : bullishCount === 0 ? 'bearish' : 'neutral';

  return { direction, bullishCount };
}

export type OverallSignal = 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell' | 'conflicting';

export function combineSignals(
  lorentzian: LorentzianSignal | null,
  currencyStrength: CurrencyStrengthResult | null,
  trendMeter: TrendMeterSignal | null = null,
): OverallSignal {
  if (!lorentzian || !currencyStrength) return 'neutral';

  const l = lorentzian.direction;
  const c = currencyStrength.direction;

  let base: OverallSignal;
  if (l === 'bullish' && c === 'bullish') base = 'strong_buy';
  else if (l === 'bearish' && c === 'bearish') base = 'strong_sell';
  else if ((l === 'bullish' && c === 'bearish') || (l === 'bearish' && c === 'bullish')) base = 'conflicting';
  else if (l === 'bullish' || c === 'bullish') base = 'buy';
  else if (l === 'bearish' || c === 'bearish') base = 'sell';
  else base = 'neutral';

  // Trend Meter is a confirmation filter on strong signals only: a strong
  // signal needs all three oscillators to agree. Opposite reading =>
  // conflicting; merely mixed => downgraded to a plain buy/sell.
  // If the meter is unavailable (null), behavior is unchanged.
  if (trendMeter) {
    if (base === 'strong_buy' && trendMeter.direction !== 'bullish') {
      return trendMeter.direction === 'bearish' ? 'conflicting' : 'buy';
    }
    if (base === 'strong_sell' && trendMeter.direction !== 'bearish') {
      return trendMeter.direction === 'bullish' ? 'conflicting' : 'sell';
    }
  }

  return base;
}

// --- Kernel regression + position marker -----------------------------------
// Wraps the raw Nadaraya-Watson estimate from ./kernelRegression with the
// same trend-filter gating ChartPanel already draws on the chart, so the
// AI Advisor panel's numbers match what's actually shown on the candles.

const TREND_FILTER_THRESHOLD = -0.1;
const TREND_FILTER_LOOKBACK = 20;
const RISK_REWARD_RATIO = 3; // 1:3 — matches ChartPanel's SL/TP sizing

export type KernelResult = {
  estimate: number;
  laggedEstimate: number;
  direction: SignalDirection;
  trendFilterPassed: boolean;
};

export function computeKernelRegression(candles: Candle[]): KernelResult | null {
  const points = computeKernelPoints(candles);
  if (points.length === 0) return null;

  const last = points[points.length - 1];
  const estimate = last.rawValue;
  const laggedEstimate = last.value;

  let direction: SignalDirection = 'neutral';
  if (estimate > laggedEstimate) direction = 'bullish';
  else if (estimate < laggedEstimate) direction = 'bearish';

  const trend = computeTrendFilter(candles, TREND_FILTER_LOOKBACK, TREND_FILTER_THRESHOLD);
  const trendFilterPassed = trend?.trending ?? false;

  return { estimate, laggedEstimate, direction, trendFilterPassed };
}

export type PositionMarker = {
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskAmount: number;
  rewardAmount: number;
  ratio: number;
};

export function computePositionMarker(
  candles: Candle[],
  direction: Exclude<SignalDirection, 'neutral'>,
  riskRewardRatio: number = RISK_REWARD_RATIO,
): PositionMarker | null {
  const atr = computeATR(candles, 14);
  if (!atr || atr <= 0 || candles.length === 0) return null;

  const entry = candles[candles.length - 1].close;
  const isBullish = direction === 'bullish';
  const stopLoss = isBullish ? entry - atr : entry + atr;
  const takeProfit = isBullish ? entry + atr * riskRewardRatio : entry - atr * riskRewardRatio;

  return {
    entry,
    stopLoss,
    takeProfit,
    riskAmount: Math.abs(entry - stopLoss),
    rewardAmount: Math.abs(takeProfit - entry),
    ratio: riskRewardRatio,
  };
}
