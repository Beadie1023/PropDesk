import type { Candle } from '@/lib/marketData';

// --- Lorentzian Classification ---

export type LorentzianSignal = {
 direction: 'bullish' | 'bearish' | 'neutral';
 confidence: number;
 nearestBars: number;
 bullishCount: number;
 bearishCount: number;
};

function rsi(closes: number, period: number): number {
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

function cci(candles: Candle, period: number): number {
 if (candles.length < period) return 0;
 const slice = candles.slice(-period);
 const typicals = slice.map((c) => (c.high + c.low + c.close) / 3);
 const mean = typicals.reduce((a, b) => a + b, 0) / period;
 const meanDev = typicals.reduce((a, b) => a + Math.abs(b - mean), 0) / period;
 return (typicals[typicals.length - 1] - mean) / (0.015 * (meanDev || 1));
}

function adx(candles: Candle, period: number): number {
 if (candles.length < period + 1) return 0;
 const slice = candles.slice(-(period + 1));
 let plusDM = 0;
 let minusDM = 0;
 let trSum = 0;
 for (let i = 1; i < slice.length; i++) {
 const high = slice[i].high - slice[i - 1].high;
 const low = slice[i - 1].low - slice[i].low;
 plusDM += high > low && high > 0? high : 0;
 minusDM += low > high && low > 0? low : 0;
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

function wt(closes: number, channelLen: number, avgLen: number): number {
 if (closes.length < channelLen + avgLen) return 0;
 const slice = closes.slice(-channelLen);
 const esa = slice.reduce((a, b) => a + b, 0) / channelLen;
 const d = slice.reduce((a, b) => a + Math.abs(b - esa), 0) / channelLen;
 const ci = (closes[closes.length - 1] - esa) / (0.015 * (d || 1));
 return ci;
}

function lorentzianDistance(a: number, b: number): number {
 return a.reduce((sum, val, i) => sum + Math.log(1 + Math.abs(val - b[i])), 0);
}

export function computeLorentzianSignal(candles: Candle): LorentzianSignal {
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

 const distances: Array<{ dist: number; label: 'bullish' | 'bearish' }> = ;

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
 const label = closes[i + 1] > closes[i]? 'bullish' : 'bearish';
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

// --- Currency Strength (derived directly from GBP/AUD, no basket needed) ---

export type CurrencyStrengthResult = {
 GBP: number;
 AUD: number;
};

export function computeCurrencyStrength(
 candles: Candle,
 lookback: number = 20,
): CurrencyStrengthResult {
 if (candles.length < lookback + 1) {
 return { GBP: 50, AUD: 50 };
 }

 const recent = candles.slice(-(lookback + 1));
 const start = recent[0].close;
 const end = recent[recent.length - 1].close;
 const pctChange = (end - start) / start;

 // GBP/AUD rising means GBP strengthening against AUD, and vice versa
 const normalize = (val: number) => Math.min(100, Math.max(0, 50 + val * 5000));

 return {
 GBP: normalize(pctChange),
 AUD: normalize(-pctChange),
 };
}

// --- Nadaraya-Watson Kernel Regression ---

const KERNEL_H = 8;
const KERNEL_R = 8;
const KERNEL_X0 = 25;
const KERNEL_LAG = 2;
const TREND_FILTER_THRESHOLD = -0.1;

function rationalQuadraticKernel(
 candles: Candle,
 h: number,
 r: number,
 x0: number,
): number {
 const n = candles.length;
 const closes = candles.map((c) => c.close);
 const estimates: number = ;

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

export function computeKernelRegression(candles: Candle): KernelResult {
 if (candles.length < KERNEL_X0 + KERNEL_LAG) {
 return {
 estimate: candles[candles.length - 1]?.close?? 0,
 laggedEstimate: candles[candles.length - 1]?.close?? 0,
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
 last > lagged? 'bullish' : last < lagged? 'bearish' : 'neutral';

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
 direction === 'bullish'? entry - riskAmount : entry + riskAmount;
 const takeProfit =
 direction === 'bullish'? entry + rewardAmount : entry - rewardAmount;

 return {
 entry,
 stopLoss,
 takeProfit,
 riskAmount,
 rewardAmount,
 ratio: '1:3',
 };
}
