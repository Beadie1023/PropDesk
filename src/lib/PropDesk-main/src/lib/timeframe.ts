// The timeframe the signals, chart and position marker run on.
//
// Default is 30 minutes, to match the 30-minute TradingView chart you trade.
// Pick 1 hour to get the previous behaviour. The choice is remembered in the browser.
//
// The Probability Gate panel always uses 1-hour candles: its job is the DAILY context
// (50-day average, daily range, session levels), and 2000 hourly bars cover ~80 sessions
// in one request, whereas 30-minute bars would need ~5000.

export type Timeframe = '30min' | '1h';

export const TIMEFRAMES: { value: Timeframe; label: string }[] = [
  { value: '30min', label: '30m' },
  { value: '1h', label: '1H' },
];

export const DEFAULT_TIMEFRAME: Timeframe = '30min';
const STORAGE_KEY = 'propdesk.timeframe';

function isTimeframe(v: unknown): v is Timeframe {
  return v === '30min' || v === '1h';
}

function readStored(): Timeframe {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_TIMEFRAME;
    const v = localStorage.getItem(STORAGE_KEY);
    return isTimeframe(v) ? v : DEFAULT_TIMEFRAME;
  } catch {
    return DEFAULT_TIMEFRAME;
  }
}

let current: Timeframe = readStored();
const listeners = new Set<() => void>();

export function getTimeframe(): Timeframe {
  return current;
}

export function setTimeframe(next: Timeframe): void {
  if (next === current) return;
  current = next;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* storage unavailable: still works for this session */
  }
  listeners.forEach((l) => l());
}

export function subscribeTimeframe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Candles to request for the signals. The classifier looks back 2000 bars and the gate
 * context needs ~50+ daily sessions: 5000 x 30m is ~100 sessions; 2000 x 1h is ~80.
 */
export function signalBarsFor(tf: Timeframe): number {
  return tf === '30min' ? 5000 : 2000;
}

/** Candles drawn on the chart (about 5 days for 30m, 6 days for 1h). */
export function chartBarsFor(tf: Timeframe): number {
  return tf === '30min' ? 240 : 150;
}

export function barsPerHour(tf: Timeframe): number {
  return tf === '30min' ? 2 : 1;
}

export function timeframeLabel(tf: Timeframe): string {
  return tf === '30min' ? '30-minute' : '1-hour';
}
