// Backend signal computation for the poller. Mirrors src/lib/signals.ts
// (frontend) exactly, including the tanh-based currency strength scaling
// fix — kept as a separate plain-JS copy since the backend has no
// TypeScript build step. If you change the algorithm on one side, update
// the other to match, or the two panels and the phone notifications could
// disagree with each other.

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

export function combineSignals(lorentzian, currencyStrength) {
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
