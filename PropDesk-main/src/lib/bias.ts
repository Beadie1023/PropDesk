// Daily-context builder for the "probability factor" gate.
//
// Builds everything the gate needs from ONE fetch of 1h candles:
//   - session (daily) candles, aggregated locally so the day boundary is
//     under our control (forex has no single "open" like US equities)
//   - SMA(50) trend bias, daily ATR, previous-session high/low
//   - swing high / swing low beyond the previous session's range
//   - today's open / high / low (for "how much of the ATR is used up")
//
// Pure functions, no network, no React — easy to test. Import types only
// from ./marketData so this file also compiles outside the Vite alias setup.

import type { Candle } from './marketData';
import { computeATR } from './trendFilter';

export type Direction = 'long' | 'short';

/**
 * Where a "day" starts.
 *  - 'ny17': forex convention, rolls at 17:00 New York (DST-aware). Sunday
 *            evening bars merge into Monday instead of making a sliver.
 *  - 'utc' : rolls at 00:00 UTC.
 */
export type SessionMode = 'ny17' | 'utc';

const nyDateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function sessionKey(timeSec: number, mode: SessionMode = 'ny17'): string {
  if (mode === 'utc') return new Date(timeSec * 1000).toISOString().slice(0, 10);
  // Shift +7h so 17:00 New York becomes 00:00 of the next NY calendar date.
  return nyDateFmt.format(new Date((timeSec + 7 * 3600) * 1000));
}

/** Collapses intraday candles into one candle per session. Output is ascending. */
export function aggregateToSessions(candles: Candle[], mode: SessionMode = 'ny17'): Candle[] {
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const sessions = new Map<string, Candle>();

  for (const c of sorted) {
    const key = sessionKey(c.time, mode);
    const existing = sessions.get(key);
    if (!existing) {
      sessions.set(key, { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close });
    } else {
      existing.high = Math.max(existing.high, c.high);
      existing.low = Math.min(existing.low, c.low);
      existing.close = c.close;
    }
  }
  return [...sessions.values()];
}

/** Simple moving average of the LAST `period` values, or null if too short. */
export function computeSMA(values: number[], period: number): number | null {
  if (period <= 0 || values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) sum += values[i];
  return sum / period;
}

type Pivot = { index: number; price: number };

/** A pivot high/low: strictly the extreme within `lookback` bars on both sides. */
function findPivots(days: Candle[], lookback: number): { highs: Pivot[]; lows: Pivot[] } {
  const highs: Pivot[] = [];
  const lows: Pivot[] = [];
  for (let i = lookback; i < days.length - lookback; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (days[j].high >= days[i].high) isHigh = false;
      if (days[j].low <= days[i].low) isLow = false;
    }
    if (isHigh) highs.push({ index: i, price: days[i].high });
    if (isLow) lows.push({ index: i, price: days[i].low });
  }
  return { highs, lows };
}

export type MarketContext = {
  price: number;
  sessionOpen: number;
  sessionHigh: number;
  sessionLow: number;
  /** SMA(50) of COMPLETED sessions (today's unfinished bar excluded). Null if < 50 sessions. */
  sma50: number | null;
  /** Price vs SMA50. Null when SMA50 isn't available yet. */
  bias: Direction | null;
  /** Daily ATR over completed sessions (same unit as price). */
  atr: number;
  prevHigh: number;
  prevLow: number;
  /** Nearest daily pivot high above BOTH the previous high and current price. */
  swingHigh: number | null;
  /** Nearest daily pivot low below BOTH the previous low and current price. */
  swingLow: number | null;
  completedSessions: number;
};

export type ContextOptions = {
  mode?: SessionMode;
  smaPeriod?: number;
  atrPeriod?: number;
  pivotLookback?: number; // sessions on each side for a daily pivot
  swingLookbackSessions?: number; // how far back to search for swing levels
};

/**
 * Builds the gate's market context from 1h candles (ascending or not).
 * Needs at least atrPeriod + 2 completed sessions (~3 weeks of hourly data);
 * ~2000 hourly bars covers 50+ sessions for the SMA.
 */
export function buildMarketContext(
  hourly: Candle[],
  options: ContextOptions = {},
): MarketContext | null {
  const {
    mode = 'ny17',
    smaPeriod = 50,
    atrPeriod = 14,
    pivotLookback = 2,
    swingLookbackSessions = 60,
  } = options;

  if (hourly.length === 0) return null;
  const sessions = aggregateToSessions(hourly, mode);
  if (sessions.length < atrPeriod + 2) return null;

  const today = sessions[sessions.length - 1];
  const completed = sessions.slice(0, -1);
  const prev = completed[completed.length - 1];

  const lastCandle = [...hourly].sort((a, b) => a.time - b.time).slice(-1)[0];
  const price = lastCandle.close;

  const atr = computeATR(completed, atrPeriod);
  if (atr === null || atr <= 0) return null;

  const sma50 = computeSMA(
    completed.map((d) => d.close),
    smaPeriod,
  );
  const bias: Direction | null = sma50 === null ? null : price >= sma50 ? 'long' : 'short';

  const recent = completed.slice(-swingLookbackSessions);
  const { highs, lows } = findPivots(recent, pivotLookback);

  const aboveBar = Math.max(prev.high, price);
  const belowBar = Math.min(prev.low, price);

  const highCandidates = highs.map((p) => p.price).filter((p) => p > aboveBar);
  const lowCandidates = lows.map((p) => p.price).filter((p) => p < belowBar);

  return {
    price,
    sessionOpen: today.open,
    sessionHigh: today.high,
    sessionLow: today.low,
    sma50,
    bias,
    atr,
    prevHigh: prev.high,
    prevLow: prev.low,
    swingHigh: highCandidates.length ? Math.min(...highCandidates) : null,
    swingLow: lowCandidates.length ? Math.max(...lowCandidates) : null,
    completedSessions: completed.length,
  };
}

export type Level = { key: string; label: string; price: number };

/** Every liquidity level in the context, sorted high → low. */
export function contextLevels(ctx: MarketContext): Level[] {
  const levels: Level[] = [
    { key: 'swingHigh', label: 'Swing high', price: ctx.swingHigh ?? NaN },
    { key: 'prevHigh', label: 'Range high (prev day)', price: ctx.prevHigh },
    { key: 'sessionHigh', label: 'Session high', price: ctx.sessionHigh },
    { key: 'sessionLow', label: 'Session low', price: ctx.sessionLow },
    { key: 'prevLow', label: 'Range low (prev day)', price: ctx.prevLow },
    { key: 'swingLow', label: 'Swing low', price: ctx.swingLow ?? NaN },
  ];
  return levels.filter((l) => Number.isFinite(l.price)).sort((a, b) => b.price - a.price);
}
