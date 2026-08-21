
import type { Candle } from '@/lib/marketData';

// --- Currency Strength Pairs ---

export const CURRENCY_STRENGTH_PAIRS = [
  'EUR/USD',
  'GBP/USD',
  'AUD/USD',
  'USD/JPY',
  'USD/CHF',
  'USD/CAD',
  'NZD/USD',
  'EUR/GBP',
] as const;

// --- Lorentzian Classification ---

export type LorentzianSignal = {
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  nearestBars: number;
  bullishCount: number;
  bearishCount: number;
};

function rsi(closes: number[], period: number): number {
  if (closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const rs = gains / (losses || 1);
  return 100 - 100 / (1 + rs);
}

function cci(candles: Candle[], period: number): number {
  if (candles.length < period) return 0;
  const slice = candles.slice(-period);
  const typicals = slice.map((c) => (c.high + c.low + c.close) / 3);
  const mean = typicals.reduce((a, b) => a + b, 0) / period;
  const meanDev = typicals.reduce((a, b) => a + Math.abs(b - mean), 0) / period;
  return (typicals[typicals.length - 1] - mean) / (0.015 * (meanDev || 1));
}

function adx(candles: Candle[], period: number): number {
  if (candles.length < period + 1) return 0;
  const slice = candles.slice(-(period + 1));
  let plusDM = 0;
  let minusDM = 0;
  let trSum = 0;
  for (let i = 1; i < slice.length; i++) {
    const high = slice[i].high - slice[i - 1].high;
    const low = slice[i - 1].low - slice[i].low;
    plusDM += high > low && high > 0 ? high : 0;
    minusDM += low > high && low > 0 ? low : 0;
    trSum += Math.max(
      slice[i].high - slice[i].low,
      Math.abs(slice[i].high - slice[i - 1].close),
      Math.abs(slice[i].low - slice[i - 1].close),
    );
  }
  const plusDI = (plusDM / (trSum || 1)) * 100;
  const minusDI = (minusDM / (trSum || 1)) * 100;
  const dx = (Math.abs(plusDI - minusDI) / ((plusDI + minusDI) || 1)) * 100;
  return dx;
}

function wt(closes: number[], channelLen: number, avgLen: number): number {
  if (closes.length < channelLen + avgLen) return 0;
  const slice = closes.slice(-channelLen);
  const esa = slice.reduce((a, b) => a + b, 0) / channelLen;
  const d = slice.reduce((a, b) => a + Math.abs(b - esa), 0) / channelLen;
  const ci = (closes[closes.length - 1] - esa) / (0.015 * (d || 1));
  return ci;
}

function lorentzianDistance(a: number[], b: number[]): number {
  return a.reduce((sum, val, i) => sum + Math.log(1 + Math.abs(val - b[i])), 0);
}

export function computeLorentzianSignal(candles: Candle[]): LorentzianSignal {
  if (candles.length < 50) {
    return {
      direction: 'neutral',
      confidence: 0,
      nearestBars: 0,
      bullishCount: 0,
      bearishCount: 0,
    };
  }

  const closes = candles.map((c) => c.close);
  const NEIGHBORS = 20;

  const currentFeatures = [
    rsi(closes, 14),
    wt(closes, 10, 11),
    cci(candles, 20),
    adx(candles, 20),
    rsi(closes, 9),
  ];

  const distances: Array<{ dist: number; label: 'bullish' | 'bearish' }> = [];

  for (let i = 20; i < candles.length - 1; i++) {
    const historicalCloses = closes.slice(0, i + 1);
    const historicalCandles = candles.slice(0, i + 1);
    const features = [
      rsi(historicalCloses, 14),
      wt(historicalCloses, 10, 11),
      cci(historicalCandles, 20),
      adx(historicalCandles, 20),
      rsi(historicalCloses, 9),
    ];
    const dist = lorentzianDistance(currentFeatures, features);
    const label = closes[i + 1] > closes[i] ? 'bullish' : 'bearish';
    distances.push({ dist, label });
  }

  distances.sort((a, b) => a.dist - b.dist);
  const nearest = distances.slice(0, NEIGHBORS);
  const bullishCount = nearest.filter((n) => n.label === 'bullish').length;
  const bearishCount = nearest.filter((n) => n.label === 'bearish').length;
  const direction =
    bullishCount > bearishCount
      ? 'bullish'
      : bearishCount > bullishCount
      ? 'bearish'
      : 'neutral';
  const confidence = Math.max(bullishCount, bearishCount) / NEIGHBORS;

  return {
    direction,
    confidence,
    nearestBars: NEIGHBORS,
    bullishCount,
    bearishCount,
  };
}

// --- Currency Strength ---

export type CurrencyStrengthResult = {
  GBP: number;
  AUD: number;
  raw: Partial<Record<(typeof CURRENCY_STRENGTH_PAIRS)[number], number>>;
};

export function computeCurrencyStrength(
  candlesByPair: Partial<Record<(typeof CURRENCY_STRENGTH_PAIRS)[number], Candle[]>>,
): CurrencyStrengthResult {
  const changes: Partial<Record<(typeof CURRENCY_STRENGTH_PAIRS)[number], number>> = {};

  for (const pair of CURRENCY_STRENGTH_PAIRS) {
    const candles = candlesByPair[pair];
    if (!candles || candles.length < 2) continue;
    const last = candles[candles.length - 1].close;
    const prev = candles[candles.length - 2].close;
    changes[pair] = (last - prev) / prev;
  }

  const gbpChange =
    (changes['GBP/USD'] ?? 0) +
    (changes['EUR/GBP'] !== undefined ? -(changes['EUR/GBP'] ?? 0) : 0);

  const audChange = changes['AUD/USD'] ?? 0;

  const normalize = (val: number) => Math.min(100, Math.max(0, 50 + val * 5000));

  return {
    GBP: normalize(gbpChange),
    AUD: normalize(audChange),
    raw: changes,
  };
}

// --- Nadaraya-Watson Kernel Regression ---

const KERNEL_H = 8;
const KERNEL_R = 8;
const KERNEL_X0 = 25;
const KERNEL_LAG = 2;
const TREND_FILTER_THRESHOLD = -0.1;

function rationalQuadraticKernel(
  candles: Candle[],
  h: number,
  r: number,
  x0: number,
): number[] {
  const n = candles.length;
  const closes = candles.map((c) => c.close);
  const estimates: number[] = [];

  for (let i = 0; i < n; i++) {
    let weightSum = 0;
    let valueSum = 0;
    for (let j = 0; j <= Math.min(i, x0 - 1); j++) {
      const w = Math.pow(1 + (j * j) / (2 * r * h * h), -r);
      weightSum += w;
      valueSum += w * closes[i - j];
    }
    estimates.push(valueSum / (weightSum || 1));
  }

  return estimates;
}

export type KernelResult = {
  estimate: number;
  laggedEstimate: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  trendFilterPassed: boolean;
  trendValue: number;
};

export function computeKernelRegression(candles: Candle[]): KernelResult {
  if (candles.length < KERNEL_X0 + KERNEL_LAG) {
    return {
      estimate: candles[candles.length - 1]?.close ?? 0,
      laggedEstimate: candles[candles.length - 1]?.close ?? 0,
      direction: 'neutral',
      trendFilterPassed: false,
      trendValue: 0,
    };
  }

  const estimates = rationalQuadraticKernel(candles, KERNEL_H, KERNEL_R, KERNEL_X0);
  const last = estimates[estimates.length - 1];
  const lagged = estimates[estimates.length - 1 - KERNEL_LAG];
  const prev = estimates[estimates.length - 2];

  const trendValue = last - prev;
  const trendFilterPassed = trendValue > TREND_FILTER_THRESHOLD;
  const direction =
    last > lagged ? 'bullish' : last < lagged ? 'bearish' : 'neutral';

  return {
    estimate: last,
    laggedEstimate: lagged,
    direction,
    trendFilterPassed,
    trendValue,
  };
}

// --- Position Marker ---

const DEFAULT_STOP_PIPS = 0.0024;
const RR_RATIO = 3;

export type PositionMarker = {
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskAmount: number;
  rewardAmount: number;
  ratio: '1:3';
};

export function computePositionMarker(
  entry: number,
  direction: 'bullish' | 'bearish',
  stopPips: number = DEFAULT_STOP_PIPS,
): PositionMarker {
  const riskAmount = stopPips;
  const rewardAmount = stopPips * RR_RATIO;

  const stopLoss =
    direction === 'bullish' ? entry - riskAmount : entry + riskAmount;
  const takeProfit =
    direction === 'bullish' ? entry + rewardAmount : entry - rewardAmount;

  return {
    entry,
    stopLoss,
    takeProfit,
    riskAmount,
    rewardAmount,
    ratio: '1:3',
  };
}, // Thin client for the AI Market Advisor backend endpoint. Uses the same
// x-api-key auth as the MetaApi client — same Express app, same shared
// secret protecting every route.

import { API_BASE as METAAPI_BASE, apiHeaders } from '@/lib/metaapi';
import type { Candle } from '@/lib/marketData';
import type { CurrencyStrengthResult, LorentzianSignal } from '@/lib/signals';

// Reuses the SAME backend host as the MetaApi client by default, since
// both routes live on the same Express app — only VITE_METAAPI_BACKEND_URL
// needs to be set, not a second AI-specific variable pointing at the same
// place. VITE_AI_BACKEND_URL remains available as an explicit override for
// anyone who genuinely hosts AI analysis on a different service.
const AI_API_BASE =
  import.meta.env.VITE_AI_BACKEND_URL ||
  (METAAPI_BASE.endsWith('/api/metaapi') ? METAAPI_BASE.replace(/\/api\/metaapi$/, '/api/ai') : '/api/ai');

export type AIAnalysisResult =
  | { status: 'ok'; analysis: string }
  | { status: 'error'; message: string };

/**
 * Builds a compact, plain-language summary from candles + the already-
 * computed signal outputs — not the raw candle array. Keeps the request
 * small and keeps the model focused on what actually matters rather than
 * re-deriving indicators itself.
 */
export function buildAnalysisPayload(
  candles: Candle[],
  lorentzian: LorentzianSignal | null,
  currencyStrength: CurrencyStrengthResult | null,
) {
  const closes = candles.map((c) => c.close);
  const current = closes[closes.length - 1];
  const dayAgoIdx = Math.max(0, closes.length - 25); // ~24 hourly bars back
  const weekAgoIdx = Math.max(0, closes.length - 121); // ~5 trading days of hourly bars
  const dayAgo = closes[dayAgoIdx];
  const weekAgo = closes[weekAgoIdx];

  const recentWindow = candles.slice(-48);
  const recentHigh = Math.max(...recentWindow.map((c) => c.high));
  const recentLow = Math.min(...recentWindow.map((c) => c.low));

  return {
    pair: 'GBP/AUD',
    currentPrice: current,
    changeLast24hPercent: dayAgo ? ((current - dayAgo) / dayAgo) * 100 : null,
    changeLast5dPercent: weekAgo ? ((current - weekAgo) / weekAgo) * 100 : null,
    recentHigh48h: recentHigh,
    recentLow48h: recentLow,
    lorentzianClassification: lorentzian
      ? { direction: lorentzian.direction, confidencePercent: lorentzian.confidence }
      : null,
    currencyStrength: currencyStrength
      ? {
          direction: currencyStrength.direction,
          gbpScore: currencyStrength.gbpScore,
          audScore: currencyStrength.audScore,
        }
      : null,
  };
}

export async function analyzeMarket(
  candles: Candle[],
  lorentzian: LorentzianSignal | null,
  currencyStrength: CurrencyStrengthResult | null,
): Promise<AIAnalysisResult> {
  try {
    const payload = buildAnalysisPayload(candles, lorentzian, currencyStrength);
    const res = await fetch(${AI_API_BASE}/analyze, {
      method: 'POST',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });

    // Read as text first — an empty or non-JSON body (e.g. the backend
    // waking up from a Render free-tier sleep, or a proxy timeout page)
    // should give a clear diagnostic, not a raw "Unexpected end of JSON
    // input" parse error with no context.
    const rawText = await res.text();
    if (!rawText) {
      return {
        status: 'error',
        message: Backend returned an empty response (status ${res.status}). If the backend has been idle, it may be waking up — try again in ~30 seconds.,
      };
    }

    let data: { message?: string; analysis?: string };
    try {
      data = JSON.parse(rawText);
    } catch {
      return {
        status: 'error',
        message: Backend returned a non-JSON response (status ${res.status}): ${rawText.slice(0, 150)},
      };
    }

    if (!res.ok) {
      return { status: 'error', message: data.message ?? Analysis request failed with status ${res.status} };
    }
    if (typeof data.analysis !== 'string') {
      return { status: 'error', message: 'Unexpected response shape from analysis backend.' };
    }

    return { status: 'ok', analysis: data.analysis };
  } catch (err) {
    console.error('AI market analysis failed:', err);
    return { status: 'error', message: err instanceof Error ? err.message : 'Unknown error' };
  }
}


Analysis paused

{
  "name": "vite-react-typescript-starter",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "typecheck": "tsc -b --noEmit"
  },
  "dependencies": {
    "lightweight-charts": "^5.2.0",
    "lucide-react": "^0.344.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@eslint/js": "^9.9.1",
    "@types/node": "^20.11.0",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.18",
    "eslint": "^9.9.1",
    "eslint-plugin-react-hooks": "^5.1.0-rc.0",
    "eslint-plugin-react-refresh": "^0.4.11",
    "globals": "^15.9.0",
    "postcss": "^8.4.35",
    "tailwindcss": "^3.4.1",
    "typescript": "^5.5.3",
    "typescript-eslint": "^8.3.0",
    "vite": "^5.4.2"
  }
}

Good — this gives enough to fix the TypeScript failures properly.

The 2 npm vulnerabilities are separate from the build failure. Your package.json does not show anything that requires npm audit fix --force just to compile. I would not use --force yet because it can upgrade packages across breaking-version boundaries.

I fixed the API mismatch between your signals.ts, SignalPanel.tsx, and aiAdvisor.ts:

Added combineSignals.

Added the missing OverallSignal type.

Added direction, gbpScore, and audScore to CurrencyStrengthResult.

Kept GBP and AUD too, so existing code using those names doesn't break.

Added neighborsUsed compatibility to LorentzianSignal.

Fixed SignalPanel to use the actual nearestBars field.

Fixed the PositionMarker React error — React can't render the whole object directly, so it now displays entry/stop/target/R:R.

Kept the existing 1-hour GBP/AUD logic.

Your supplied SignalPanel was explicitly importing combineSignals and OverallSignal, which explains those compiler errors. 

 The panel was also reading neighborsUsed even though the supplied signal type defines nearestBars. 


Files to replace
Download signals.ts — corrected

Download SignalPanel.tsx — corrected

Download aiAdvisor.ts — corrected

Download AIAdvisorPanel.tsx — corrected

Then deploy
Replace the corresponding files in:

src/lib/signals.ts
src/lib/aiAdvisor.ts
src/components/SignalPanel.tsx
src/components/AIAdvisorPanel.tsx
Then run:

npm install
npm run typecheck
npm run build
If typecheck passes, your Render build command:

npm install && npm run build
should get past the errors shown in your log.

One important correction: I would not blindly run npm audit fix --force. Get the TypeScript build green first. Then run:

npm audit
and we can identify the specific moderate and high vulnerabilities and decide whether they actually need a dependency upgrade. 


signals.fixed.ts
Code


SignalPanel.fixed.tsx
Code


aiAdvisor.fixed.ts
Code

1 more

Library
/
signals.fixed.ts


import type { Candle } from '@/lib/marketData';

// --- Currency Strength Pairs ---

export const CURRENCY_STRENGTH_PAIRS = [
  'EUR/USD',
  'GBP/USD',
  'AUD/USD',
  'USD/JPY',
  'USD/CHF',
  'USD/CAD',
  'NZD/USD',
  'EUR/GBP',
] as const;

// --- Lorentzian Classification ---

export type LorentzianSignal = {
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  nearestBars: number;
  /** Backward-compatible name used by SignalPanel. */
  neighborsUsed: number;
  bullishCount: number;
  bearishCount: number;
};

function rsi(closes: number[], period: number): number {
  if (closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const rs = gains / (losses || 1);
  return 100 - 100 / (1 + rs);
}

function cci(candles: Candle[], period: number): number {
  if (candles.length < period) return 0;
  const slice = candles.slice(-period);
  const typicals = slice.map((c) => (c.high + c.low + c.close) / 3);
  const mean = typicals.reduce((a, b) => a + b, 0) / period;
  const meanDev = typicals.reduce((a, b) => a + Math.abs(b - mean), 0) / period;
  return (typicals[typicals.length - 1] - mean) / (0.015 * (meanDev || 1));
}

function adx(candles: Candle[], period: number): number {
  if (candles.length < period + 1) return 0;
  const slice = candles.slice(-(period + 1));
  let plusDM = 0;
  let minusDM = 0;
  let trSum = 0;
  for (let i = 1; i < slice.length; i++) {
    const high = slice[i].high - slice[i - 1].high;
    const low = slice[i - 1].low - slice[i].low;
    plusDM += high > low && high > 0 ? high : 0;
    minusDM += low > high && low > 0 ? low : 0;
    trSum += Math.max(
      slice[i].high - slice[i - 1].low,
      Math.abs(slice[i].high - slice[i - 1].close),
      Math.abs(slice[i].low - slice[i - 1].close),
    );
  }
  const plusDI = (plusDM / (trSum || 1)) * 100;
  const minusDI = (minusDM / (trSum || 1)) * 100;
  const dx = (Math.abs(plusDI - minusDI) / ((plusDI + minusDI) || 1)) * 100;
  return dx;
}

function wt(closes: number[], channelLen: number, avgLen: number): number {
  if (closes.length < channelLen + avgLen) return 0;
  const slice = closes.slice(-channelLen);
  const esa = slice.reduce((a, b) => a + b, 0) / channelLen;
  const d = slice.reduce((a, b) => a + Math.abs(b - esa), 0) / channelLen;
  const ci = (closes[closes.length - 1] - esa) / (0.015 * (d || 1));
  return ci;
}

function lorentzianDistance(a: number[], b: number[]): number {
  return a.reduce((sum, val, i) => sum + Math.log(1 + Math.abs(val - b[i])), 0);
}

export function computeLorentzianSignal(candles: Candle[]): LorentzianSignal {
  const NEIGHBORS = 20;

  if (candles.length < 50) {
    return {
      direction: 'neutral',
      confidence: 0,
      nearestBars: 0,
      neighborsUsed: 0,
      bullishCount: 0,
      bearishCount: 0,
    };
  }

  const closes = candles.map((c) => c.close);

  const currentFeatures = [
    rsi(closes, 14),
    wt(closes, 10, 11),
    cci(candles, 20),
    adx(candles, 20),
    rsi(closes, 9),
  ];

  const distances: Array<{ dist: number; label: 'bullish' | 'bearish' }> = [];

  for (let i = 20; i < candles.length - 1; i++) {
    const historicalCloses = closes.slice(0, i + 1);
    const historicalCandles = candles.slice(0, i + 1);
    const features = [
      rsi(historicalCloses, 14),
      wt(historicalCloses, 10, 11),
      cci(historicalCandles, 20),
      adx(historicalCandles, 20),
      rsi(historicalCloses, 9),
    ];
    const dist = lorentzianDistance(currentFeatures, features);
    const label = closes[i + 1] > closes[i] ? 'bullish' : 'bearish';
    distances.push({ dist, label });
  }

  distances.sort((a, b) => a.dist - b.dist);
  const nearest = distances.slice(0, NEIGHBORS);
  const bullishCount = nearest.filter((n) => n.label === 'bullish').length;
  const bearishCount = nearest.filter((n) => n.label === 'bearish').length;
  const direction =
    bullishCount > bearishCount
      ? 'bullish'
      : bearishCount > bullishCount
        ? 'bearish'
        : 'neutral';
  const confidence = nearest.length
    ? Math.max(bullishCount, bearishCount) / nearest.length
    : 0;

  return {
    direction,
    confidence,
    nearestBars: nearest.length,
    neighborsUsed: nearest.length,
    bullishCount,
    bearishCount,
  };
}

// --- Currency Strength ---

export type CurrencyStrengthResult = {
  GBP: number;
  AUD: number;
  /** Names expected by the current UI and AI payload. */
  gbpScore: number;
  audScore: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  raw: Partial<Record<(typeof CURRENCY_STRENGTH_PAIRS)[number], number>>;
};

export function computeCurrencyStrength(
  candlesByPair: Partial<Record<(typeof CURRENCY_STRENGTH_PAIRS)[number], Candle[]>>,
): CurrencyStrengthResult {
  const changes: Partial<Record<(typeof CURRENCY_STRENGTH_PAIRS)[number], number>> = {};

  for (const pair of CURRENCY_STRENGTH_PAIRS) {
    const candles = candlesByPair[pair];
    if (!candles || candles.length < 2) continue;
    const last = candles[candles.length - 1].close;
    const prev = candles[candles.length - 2].close;
    if (prev !== 0) changes[pair] = (last - prev) / prev;
  }

  const gbpChange =
    (changes['GBP/USD'] ?? 0) -
    (changes['EUR/GBP'] ?? 0);

  const audChange = changes['AUD/USD'] ?? 0;

  const normalize = (val: number) =>
    Math.min(100, Math.max(0, 50 + val * 5000));

  const gbpScore = normalize(gbpChange);
  const audScore = normalize(audChange);
  const difference = gbpScore - audScore;

  const direction =
    difference > 1
      ? 'bullish'
      : difference < -1
        ? 'bearish'
        : 'neutral';

  return {
    GBP: gbpScore,
    AUD: audScore,
    gbpScore,
    audScore,
    direction,
    raw: changes,
  };
}

// --- Overall Signal ---

export type OverallSignal =
  | 'strong_buy'
  | 'buy'
  | 'neutral'
  | 'sell'
  | 'strong_sell'
  | 'conflicting';

export function combineSignals(
  lorentzian: LorentzianSignal | null,
  currencyStrength: CurrencyStrengthResult | null,
): OverallSignal {
  const l = lorentzian?.direction ?? 'neutral';
  const c = currencyStrength?.direction ?? 'neutral';

  if (l !== 'neutral' && c !== 'neutral' && l !== c) return 'conflicting';
  if (l === 'bullish' && c === 'bullish') return 'strong_buy';
  if (l === 'bearish' && c === 'bearish') return 'strong_sell';
  if (l === 'bullish' || c === 'bullish') return 'buy';
  if (l === 'bearish' || c === 'bearish') return 'sell';
  return 'neutral';
}

// --- Nadaraya-Watson Kernel Regression ---

const KERNEL_H = 8;
const KERNEL_R = 8;
const KERNEL_X0 = 25;
const KERNEL_LAG = 2;
const TREND_FILTER_THRESHOLD = -0.1;

function rationalQuadraticKernel(
  candles: Candle[],
  h: number,
  r: number,
  x0: number,
): number[] {
  const n = candles.length;
  const closes = candles.map((c) => c.close);
  const estimates: number[] = [];

  for (let i = 0; i < n; i++) {
    let weightSum = 0;
    let valueSum = 0;
    for (let j = 0; j <= Math.min(i, x0 - 1); j++) {
      const w = Math.pow(1 + (j * j) / (2 * r * h * h), -r);
      weightSum += w;
      valueSum += w * closes[i - j];
    }
    estimates.push(valueSum / (weightSum || 1));
  }

  return estimates;
}

export type KernelResult = {
  estimate: number;
  laggedEstimate: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  trendFilterPassed: boolean;
  trendValue: number;
};

export function computeKernelRegression(candles: Candle[]): KernelResult {
  const fallback = candles[candles.length - 1]?.close ?? 0;

  if (candles.length < KERNEL_X0 + KERNEL_LAG) {
    return {
      estimate: fallback,
      laggedEstimate: fallback,
      direction: 'neutral',
      trendFilterPassed: false,
      trendValue: 0,
    };
  }

  const estimates = rationalQuadraticKernel(candles, KERNEL_H, KERNEL_R, KERNEL_X0);
  const last = estimates[estimates.length - 1];
  const lagged = estimates[estimates.length - 1 - KERNEL_LAG];
  const prev = estimates[estimates.length - 2];

  const trendValue = last - prev;
  const trendFilterPassed = trendValue > TREND_FILTER_THRESHOLD;
  const direction =
    last > lagged ? 'bullish' : last < lagged ? 'bearish' : 'neutral';

  return {
    estimate: last,
    laggedEstimate: lagged,
    direction,
    trendFilterPassed,
    trendValue,
  };
}

// --- Position Marker ---

const DEFAULT_STOP_PIPS = 0.0024;
const RR_RATIO = 3;

export type PositionMarker = {
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskAmount: number;
  rewardAmount: number;
  ratio: '1:3';
};

export function computePositionMarker(
  entry: number,
  direction: 'bullish' | 'bearish',
  stopPips: number = DEFAULT_STOP_PIPS,
): PositionMarker {
  const riskAmount = stopPips;
  const rewardAmount = stopPips * RR_RATIO;

  const stopLoss =
    direction === 'bullish' ? entry - riskAmount : entry + riskAmount;
  const takeProfit =
    direction === 'bullish' ? entry + rewardAmount : entry - rewardAmount;

  return {
    entry,
    stopLoss,
    takeProfit,
    riskAmount,
    rewardAmount,
    ratio: '1:3',
  };
}
