// AUTO-GENERATED from src/lib/lorentzian.ts - do not edit by hand. Regenerate with: npm run sync:lorentzian
const TV_SETTINGS = {
  neighbors: 8,
  maxBarsBack: 2e3,
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
  replayBars: 60
};
const LORENTZIAN_MIN_CANDLES = 300;
function ema(values, period) {
  const out = new Array(values.length).fill(NaN);
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
function sma(values, period) {
  const out = new Array(values.length).fill(NaN);
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
function rma(values, period) {
  const out = new Array(values.length).fill(NaN);
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
function trueRange(c) {
  return c.map((bar, i) => {
    if (i === 0) return bar.high - bar.low;
    const pc = c[i - 1].close;
    return Math.max(bar.high - bar.low, Math.abs(bar.high - pc), Math.abs(bar.low - pc));
  });
}
function rsi(closes, period) {
  const gains = closes.map((x, i) => i === 0 ? NaN : Math.max(x - closes[i - 1], 0));
  const losses = closes.map((x, i) => i === 0 ? NaN : Math.max(closes[i - 1] - x, 0));
  const ag = rma(gains, period);
  const al = rma(losses, period);
  return closes.map((_, i) => {
    if (Number.isNaN(ag[i]) || Number.isNaN(al[i])) return NaN;
    return al[i] === 0 ? 100 : 100 - 100 / (1 + ag[i] / al[i]);
  });
}
function cci(src, period) {
  const mean = sma(src, period);
  return src.map((x, i) => {
    if (Number.isNaN(mean[i])) return NaN;
    let dev = 0;
    for (let j = i - period + 1; j <= i; j++) dev += Math.abs(src[j] - mean[i]);
    dev /= period;
    return dev === 0 ? 0 : (x - mean[i]) / (0.015 * dev);
  });
}
function waveTrend(c, n1, n2) {
  const ap = c.map((b) => (b.high + b.low + b.close) / 3);
  const esa = ema(ap, n1);
  const d = ema(
    ap.map((x, i) => Math.abs(x - esa[i])),
    n1
  );
  const ci = ap.map((x, i) => d[i] === 0 || Number.isNaN(d[i]) ? NaN : (x - esa[i]) / (0.015 * d[i]));
  const wt1 = ema(ci, n2);
  const wt2 = sma(wt1, 4);
  return wt1.map((x, i) => Number.isNaN(x) || Number.isNaN(wt2[i]) ? NaN : x - wt2[i]);
}
function adx(c, length) {
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
    const plus = 100 * plusSm[i] / trSm[i];
    const minus = 100 * minusSm[i] / trSm[i];
    const sum = plus + minus;
    return 100 * Math.abs(plus - minus) / (sum === 0 ? 1 : sum);
  });
  return rma(dx, length);
}
function normalizeRunning(values) {
  let lo = Infinity;
  let hi = -Infinity;
  return values.map((x) => {
    if (Number.isNaN(x)) return NaN;
    lo = Math.min(lo, x);
    hi = Math.max(hi, x);
    return (x - lo) / Math.max(hi - lo, 1e-9);
  });
}
function regimeOk(c, threshold) {
  const n = c.length;
  const absSlope = new Array(n).fill(NaN);
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
    if (Number.isNaN(s) || Number.isNaN(avg[i]) || avg[i] === 0) return true;
    return (s - avg[i]) / avg[i] >= threshold;
  });
}
function kernelEstimateAt(closes, i, lookback, alpha) {
  let num = 0;
  let den = 0;
  const start = Math.max(0, i - lookback * 3);
  for (let j = start; j <= i; j++) {
    const d = i - j;
    const w = Math.pow(1 + d * d / (2 * alpha * lookback * lookback), -alpha);
    num += closes[j] * w;
    den += w;
  }
  return den > 0 ? num / den : closes[i];
}
function lorentzianDistance(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.log(1 + Math.abs(a[i] - b[i]));
  return s;
}
function computeLorentzian(input, overrides = {}) {
  const s = { ...TV_SETTINGS, ...overrides };
  if (input.length < LORENTZIAN_MIN_CANDLES) return null;
  const c = [...input].sort((a, b) => a.time - b.time);
  const n = c.length;
  const closes = c.map((b) => b.close);
  const f1 = normalizeRunning(ema(rsi(closes, 14), 1).map((v) => v / 100));
  const f2 = normalizeRunning(ema(waveTrend(c, 10, 11), 1));
  const f3 = normalizeRunning(ema(cci(closes, 20), 1));
  const f4 = adx(c, 20).map((v) => v / 100);
  const f5 = normalizeRunning(ema(rsi(closes, 9), 1).map((v) => v / 100));
  const feats = closes.map((_, i) => [f1[i], f2[i], f3[i], f4[i], f5[i]]);
  const valid = feats.map((f) => f.every((v) => !Number.isNaN(v)));
  const firstValid = valid.findIndex(Boolean);
  if (firstValid < 0 || n - firstValid < 120) return null;
  const labels = closes.map(
    (x, i) => i + s.lookahead < n ? Math.sign(closes[i + s.lookahead] - x) : 0
  );
  const tr = trueRange(c);
  const atr10 = rma(tr, 10);
  const adx14 = adx(c, 14);
  const regime = regimeOk(c, s.regimeThreshold);
  const ema200 = ema(closes, s.emaPeriod);
  const sma200 = sma(closes, s.smaPeriod);
  const filtersPass = (b) => {
    if (s.useVolatilityFilter && !(Number.isNaN(atr10[b]) || tr[b] > atr10[b])) return false;
    if (s.useRegimeFilter && !regime[b]) return false;
    if (s.useAdxFilter && !(Number.isNaN(adx14[b]) || adx14[b] > s.adxThreshold)) return false;
    return true;
  };
  const classify = (b) => {
    const start = Math.max(firstValid, b - s.maxBarsBack + 1);
    const end = b - s.lookahead;
    let lastDistance = -1;
    const dists = [];
    const preds = [];
    for (let t = start; t <= end; t++) {
      if (t % 4 === 0 || !valid[t]) continue;
      const d = lorentzianDistance(feats[b], feats[t]);
      if (d >= lastDistance) {
        lastDistance = d;
        dists.push(d);
        preds.push(labels[t]);
        if (preds.length > s.neighbors) {
          lastDistance = dists[Math.round(s.neighbors * 3 / 4)];
          dists.shift();
          preds.shift();
        }
      }
    }
    return { prediction: preds.reduce((a, v) => a + v, 0), votes: preds };
  };
  let state = 0;
  const from = Math.max(firstValid + 50, n - s.replayBars);
  for (let b = from; b < n; b++) {
    const { prediction: prediction2 } = classify(b);
    const pass = filtersPass(b);
    if (prediction2 > 0 && pass) state = 1;
    else if (prediction2 < 0 && pass) state = -1;
  }
  const last = n - 1;
  const { prediction, votes } = classify(last);
  const bullishVotes = votes.filter((v) => v > 0).length;
  const confidence = votes.length ? bullishVotes / votes.length * 100 : 50;
  const rawDirection = state === 1 ? "bullish" : state === -1 ? "bearish" : "neutral";
  const blockedBy = [];
  if (rawDirection !== "neutral") {
    const up = rawDirection === "bullish";
    const px = closes[last];
    if (s.useEmaFilter && !Number.isNaN(ema200[last]) && (up ? px <= ema200[last] : px >= ema200[last]))
      blockedBy.push(`price is ${up ? "below" : "above"} the ${s.emaPeriod} EMA`);
    if (s.useSmaFilter && !Number.isNaN(sma200[last]) && (up ? px <= sma200[last] : px >= sma200[last]))
      blockedBy.push(`price is ${up ? "below" : "above"} the ${s.smaPeriod} SMA`);
    if (s.useKernelFilter) {
      const now = kernelEstimateAt(closes, last, s.kernelLookback, s.kernelRelativeWeighting);
      const prev = kernelEstimateAt(closes, last - 1, s.kernelLookback, s.kernelRelativeWeighting);
      if (up ? !(now > prev) : !(now < prev)) blockedBy.push(`kernel is not ${up ? "rising" : "falling"}`);
    }
  }
  return {
    direction: blockedBy.length ? "neutral" : rawDirection,
    rawDirection,
    confidence,
    nearestBars: votes.length,
    prediction,
    blockedBy
  };
}
export {
  LORENTZIAN_MIN_CANDLES,
  TV_SETTINGS,
  computeLorentzian
};
