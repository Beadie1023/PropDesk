// Original signal-generation engine — NOT a port of any specific
// TradingView author's script. Implements the general published concepts
// (Lorentzian-distance KNN classification; multi-pair currency strength)
// from scratch.
//
// This is a heuristic tool with no verified track record. It generates a
// signal for you to evaluate and act on manually — it is never wired to
// order placement.

import type { Candle } from './marketData';

// ---------------------------------------------------------------------------
// Indicators
// ---------------------------------------------------------------------------

function computeRSI(closes: number[], period: number): number[] {
  const rsi: number[] = new Array(closes.length).fill(NaN);
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
  const roc: number[] = new Array(closes.length).fill(NaN);
  for (let i = period; i < closes.length; i++) {
    const past = closes[i - period];
    if (past !== 0) roc[i] = ((closes[i] - past) / past) * 100;
  }
  return roc;
}

// ---------------------------------------------------------------------------
// Lorentzian-distance KNN classifier
// ---------------------------------------------------------------------------

// Lorentzian distance: sum of log(1 + |a_i - b_i|) per feature. Compresses
// large feature differences into log-space, making the nearest-neighbor
// search less dominated by any single volatile feature than Euclidean
// distance would be.
function lorentzianDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += Math.log(1 + Math.abs(a[i] - b[i]));
  }
  return sum;
}

export type LorentzianSignal = {
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number; // 0-100, % of nearest neighbors that were bullish
  neighborsUsed: number;
};

// How many bars ahead a historical point's outcome is measured over.
const LOOKAHEAD_BARS = 4;
// How many nearest neighbors vote on the current bar's classification.
const K_NEIGHBORS = 20;
// Confidence thresholds for calling a direction rather than "neutral".
const BULLISH_THRESHOLD = 60;
const BEARISH_THRESHOLD = 40;

/**
 * Classifies the most recent bar as bullish/bearish/neutral by finding the
 * K historical bars with the most similar RSI(14)/RSI(9)/ROC(10) feature
 * vector (by Lorentzian distance) and taking a majority vote of what
 * price did LOOKAHEAD_BARS after each of those historical bars.
 *
 * Returns null if there isn't enough history to compute a reliable
 * result — callers must treat null as "no signal", never as neutral.
 */
export function computeLorentzianSignal(candles: Candle[]): LorentzianSignal | null {
  const MIN_CANDLES = 60;
  if (candles.length < MIN_CANDLES) return null;

  const closes = candles.map((c) => c.close);
  const rsi14 = computeRSI(closes, 14);
  const rsi9 = computeRSI(closes, 9);
  const roc10 = computeROC(closes, 10);

  type Point = { features: number[]; label: 0 | 1 };
  const points: Point[] = [];

  const minIdx = 15;
  const maxIdx = closes.length - 1 - LOOKAHEAD_BARS;

  for (let i = minIdx; i <= maxIdx; i++) {
    if (Number.isNaN(rsi14[i]) || Number.isNaN(rsi9[i]) || Number.isNaN(roc10[i])) continue;
    const future = closes[i + LOOKAHEAD_BARS];
    const label: 0 | 1 = future > closes[i] ? 1 : 0;
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

  let direction: LorentzianSignal['direction'] = 'neutral';
  if (confidence >= BULLISH_THRESHOLD) direction = 'bullish';
  else if (confidence <= BEARISH_THRESHOLD) direction = 'bearish';

  return { direction, confidence, neighborsUsed: neighbors.length };
}

// ---------------------------------------------------------------------------
// Currency strength (5-step)
// ---------------------------------------------------------------------------

// Basket needed to derive GBP and AUD strength against a common USD
// reference, plus EUR/JPY for a wider comparison basket.
export const CURRENCY_STRENGTH_PAIRS = ['GBP/USD', 'AUD/USD', 'EUR/USD', 'USD/JPY'] as const;

export type CurrencyStrengthResult = {
  gbpScore: number;
  audScore: number;
  differential: number; // gbpScore - audScore
  direction: 'bullish' | 'bearish' | 'neutral'; // for GBP/AUD specifically
};

const STRENGTH_LOOKBACK_BARS = 24; // ~1 day of hourly bars
const STRENGTH_DIFFERENTIAL_THRESHOLD = 10; // on the normalized 0-100 scale

function pctChangeOverLookback(candles: Candle[]): number | null {
  if (candles.length < STRENGTH_LOOKBACK_BARS + 1) return null;
  const recent = candles[candles.length - 1].close;
  const past = candles[candles.length - 1 - STRENGTH_LOOKBACK_BARS].close;
  if (past === 0) return null;
  return ((recent - past) / past) * 100;
}

/**
 * 5-step currency strength:
 *  1. Basket of pairs (CURRENCY_STRENGTH_PAIRS) covering GBP, AUD, EUR,
 *     JPY, all against USD as a common reference.
 *  2. % price change over STRENGTH_LOOKBACK_BARS for each pair.
 *  3. Convert each pair's change into a per-CURRENCY score (inverting
 *     USD/JPY since USD is the base currency in that pair).
 *  4. Normalize all scores onto a 0-100 scale across the basket.
 *  5. Differential = GBP score − AUD score → direction for GBP/AUD.
 *
 * Returns null if any required pair's data is missing/insufficient.
 */
export function computeCurrencyStrength(
  candlesByPair: Partial<Record<(typeof CURRENCY_STRENGTH_PAIRS)[number], Candle[]>>,
): CurrencyStrengthResult | null {
  const gbpusd = pctChangeOverLookback(candlesByPair['GBP/USD'] ?? []);
  const audusd = pctChangeOverLookback(candlesByPair['AUD/USD'] ?? []);
  const eurusd = pctChangeOverLookback(candlesByPair['EUR/USD'] ?? []);
  const usdjpy = pctChangeOverLookback(candlesByPair['USD/JPY'] ?? []);

  if (gbpusd === null || audusd === null || eurusd === null || usdjpy === null) {
    return null;
  }

  const rawScores: Record<string, number> = {
    USD: 0,
    GBP: gbpusd,
    AUD: audusd,
    EUR: eurusd,
    JPY: -usdjpy, // USD/JPY rising means USD strengthened, JPY weakened
  };

  const values = Object.values(rawScores);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const normalize = (v: number) => ((v - min) / range) * 100;

  const gbpScore = normalize(rawScores.GBP);
  const audScore = normalize(rawScores.AUD);
  const differential = gbpScore - audScore;

  let direction: CurrencyStrengthResult['direction'] = 'neutral';
  if (differential >= STRENGTH_DIFFERENTIAL_THRESHOLD) direction = 'bullish';
  else if (differential <= -STRENGTH_DIFFERENTIAL_THRESHOLD) direction = 'bearish';

  return { gbpScore, audScore, differential, direction };
}

// ---------------------------------------------------------------------------
// Combined signal
// ---------------------------------------------------------------------------

export type OverallSignal = 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell' | 'conflicting';

/**
 * Confluence of both sub-indicators. "conflicting" means they actively
 * disagree (one bullish, one bearish) — treated as its own state, not
 * averaged away to neutral, since that disagreement is itself meaningful
 * information (lower confidence in either read).
 */
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
