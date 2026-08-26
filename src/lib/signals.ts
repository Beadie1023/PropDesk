// Frontend signal computation. The backend poller keeps a separate plain-JS
// copy at server/lib/signals.js for the Lorentzian + currency-strength math
// (it has no TypeScript build step) — if you change that algorithm here,
// update the backend copy to match, or the panels and the phone
// notifications could disagree with each other. Everything below that
// point (kernel regression / position marker) is frontend-only display
// logic and has no backend counterpart.

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

export const CURRENCY_STRENGTH_PAIRS = ['GBP/USD', 'AUD/USD'] as const;
export type CurrencyStrengthPair = (typeof CURRENCY_STRENGTH_PAIRS)[number];

const STRENGTH_LOOKBACK_BARS = 24;
const STRENGTH_DIFFERENTIAL_THRESHOLD = 10;
const TYPICAL_DAILY_MOVE_PERCENT = 0.3;

function scoreFromChange(changePercent: number): number {
  return 50 + 50 * Math.tanh(changePercent / TYPICAL_DAILY_MOVE_PERCENT);
}

function pctChangeOverLookback(candles: Candle[]): number | null {
  if (candles.length < STRENGTH_LOOKBACK_BARS + 1) return null;
  const recent = candles[candles.length - 1].close;
  const past = candles[candles.length - 1 - STRENGTH_LOOKBACK_BARS].close;
  if (past === 0) return null;
  return ((recent - past) / past) * 100;
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
  const gbpusd = pctChangeOverLookback(candlesByPair['GBP/USD'] || []);
  const audusd = pctChangeOverLookback(candlesByPair['AUD/USD'] || []);

  if (gbpusd === null || audusd === null) {
    return null;
  }

  const gbpScore = scoreFromChange(gbpusd);
  const audScore = scoreFromChange(audusd);
  const differential = gbpScore - audScore;

  let direction: SignalDirection = 'neutral';
  if (differential >= STRENGTH_DIFFERENTIAL_THRESHOLD) direction = 'bullish';
  else if (differential <= -STRENGTH_DIFFERENTIAL_THRESHOLD) direction = 'bearish';

  return { gbpScore, audScore, differential, direction };
}

export type OverallSignal = 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell' | 'conflicting';

export function combineSignals(
  lorentzian: LorentzianSignal | null,
  currencyStrength: CurrencyStrengthResult | null,
): OverallSignal {
  if (!lorentzian || !currencyStrength) return 'neutral';

  const l = lorentzian.direction;
  const c = currencyStrength.direction;

  if (l === 'bullish' && c === 'bullish') return 'strong_buy';
  if (l === 'bearish' && c === 'bearish') return 'strong_sell';
  if ((l === 'bullish' && c === 'bearish') || (l === 'bearish' && c === 'bullish')) return 'conflicting';
  if (l === 'bullish' || c === 'bullish') return 'buy';
  if (l === 'bearish' || c === 'bearish') return 'sell';
  return 'neutral';
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
