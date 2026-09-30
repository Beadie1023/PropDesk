// Backend signal computation for the poller. Mirrors src/lib/signals.ts
// (frontend) exactly, including the tanh-based currency strength scaling
// fix and the Trend Meter confirmation filter — kept as a separate
// plain-JS copy since the backend has no TypeScript build step. If you
// change the algorithm on one side, update the other to match, or the two
// panels and the phone notifications could disagree with each other.

function computeRSI(closes, period) {
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

function computeROC(closes, period) {
  const roc = new Array(closes.length).fill(NaN);
  for (let i = period; i < closes.length; i++) {
    const past = closes[i - period];
    if (past !== 0) roc[i] = ((closes[i] - past) / past) * 100;
  }
  return roc;
}

function lorentzianDistance(a, b) {
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

export function computeLorentzianSignal(candles) {
  const MIN_CANDLES = 60;
  if (candles.length < MIN_CANDLES) return null;

  const closes = candles.map((c) => c.close);
  const rsi14 = computeRSI(closes, 14);
  const rsi9 = computeRSI(closes, 9);
  const roc10 = computeROC(closes, 10);

  const points = [];
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

  let direction = 'neutral';
  if (confidence >= BULLISH_THRESHOLD) direction = 'bullish';
  else if (confidence <= BEARISH_THRESHOLD) direction = 'bearish';

  return { direction, confidence, neighborsUsed: neighbors.length };
}

export const CURRENCY_STRENGTH_PAIRS = ['GBP/USD', 'AUD/USD'];

const STRENGTH_LOOKBACK_BARS = 24;
const STRENGTH_DIFFERENTIAL_THRESHOLD = 10;
const TYPICAL_DAILY_MOVE_PERCENT = 0.3;

function scoreFromChange(changePercent) {
  return 50 + 50 * Math.tanh(changePercent / TYPICAL_DAILY_MOVE_PERCENT);
}

function pctChangeOverLookback(candles) {
  if (candles.length < STRENGTH_LOOKBACK_BARS + 1) return null;
  const recent = candles[candles.length - 1].close;
  const past = candles[candles.length - 1 - STRENGTH_LOOKBACK_BARS].close;
  if (past === 0) return null;
  return ((recent - past) / past) * 100;
}

export function computeCurrencyStrength(candlesByPair) {
  const gbpusd = pctChangeOverLookback(candlesByPair['GBP/USD'] || []);
  const audusd = pctChangeOverLookback(candlesByPair['AUD/USD'] || []);

  if (gbpusd === null || audusd === null) {
    return null;
  }

  const gbpScore = scoreFromChange(gbpusd);
  const audScore = scoreFromChange(audusd);
  const differential = gbpScore - audScore;

  let direction = 'neutral';
  if (differential >= STRENGTH_DIFFERENTIAL_THRESHOLD) direction = 'bullish';
  else if (differential <= -STRENGTH_DIFFERENTIAL_THRESHOLD) direction = 'bearish';

  return { gbpScore, audScore, differential, direction };
}

// --- Trend Meter (MACD / RSI / Stochastic) ---------------------------------
// Mirrors computeTrendMeterSignal in src/lib/signals.ts.
// Three oscillator votes on the latest candle:
//   1. MACD(8,21,5): MACD line above its signal line
//   2. RSI(13): above 50
//   3. Stochastic %K(14): above 50
// 3/3 bullish => bullish, 0/3 => bearish, otherwise neutral (mixed).
// NOTE: needs candles with numeric high/low fields, not just close.

const TM_MACD_FAST = 8;
const TM_MACD_SLOW = 21;
const TM_MACD_SIGNAL = 5;
const TM_RSI_PERIOD = 13;
const TM_STOCH_PERIOD = 14;
const TM_MIN_CANDLES = 50;

function computeEMA(values, period) {
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

function computeMACD(closes, fast, slow, signal) {
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

function computeStochasticK(candles, period) {
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

export function computeTrendMeterSignal(candles) {
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

  const direction = bullishCount === 3 ? 'bullish' : bullishCount === 0 ? 'bearish' : 'neutral';

  return { direction, bullishCount };
}

export function combineSignals(lorentzian, currencyStrength, trendMeter = null) {
  if (!lorentzian || !currencyStrength) return 'neutral';

  const l = lorentzian.direction;
  const c = currencyStrength.direction;

  let base;
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
