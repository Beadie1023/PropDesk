// Shared Twelve Data OHLC fetching — used by ChartPanel and the signal
// engine. One real implementation instead of one per feature.

export type Candle = {
  time: number; // unix seconds, UTC
  open: number;
  high: number;
  low: number;
  close: number;
};

const TWELVEDATA_URL = 'https://api.twelvedata.com/time_series';

type TwelveDataValue = {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
};

type TwelveDataResponse =
  | { status: 'ok'; values: TwelveDataValue[] }
  | { status: 'error'; code?: number; message?: string };

/**
 * Fetches OHLC candles for a Twelve Data symbol (e.g. "GBP/AUD"). Throws
 * on any failure — callers decide how to handle that (sample-data
 * fallback for the chart, a clear "unavailable" state for signals; never
 * silently substitute fabricated data where it could look like a real
 * trading signal).
 */
export async function fetchTwelveDataCandles(
  symbol: string,
  interval: string = '1h',
  outputsize: number = 100,
): Promise<Candle[]> {
  const apiKey = import.meta.env.VITE_TWELVEDATA_KEY;
  if (!apiKey) {
    throw new Error('VITE_TWELVEDATA_KEY is not set');
  }

  const params = new URLSearchParams({
    symbol,
    interval,
    outputsize: String(outputsize),
    timezone: 'UTC',
    apikey: apiKey,
  });

  const response = await fetch(`${TWELVEDATA_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Twelve Data request failed with status ${response.status} for ${symbol}`);
  }

  const data = (await response.json()) as TwelveDataResponse;
  if (data.status !== 'ok' || !Array.isArray(data.values) || data.values.length === 0) {
    throw new Error(
      data.status === 'error' ? (data.message ?? `Twelve Data error for ${symbol}`) : `No data returned for ${symbol}`,
    );
  }

  // Twelve Data returns most-recent-first; ascending order is needed for
  // charting and for any indicator computed as a running series.
  const candles = data.values
    .map((v): Candle => ({
      time: Math.floor(new Date(`${v.datetime.replace(' ', 'T')}Z`).getTime() / 1000),
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
    }))
    .filter((c) => Number.isFinite(c.time) && Number.isFinite(c.close))
    .sort((a, b) => a.time - b.time);

  if (candles.length === 0) {
    throw new Error(`Twelve Data returned no parseable candles for ${symbol}`);
  }

  return candles;
}
