// Shared Twelve Data OHLC fetching — used by ChartPanel, SignalPanel, and
// AIAdvisorPanel. One real implementation instead of one per feature, with
// caching and in-flight deduplication so multiple components asking for
// the same symbol don't multiply the request count against the free-tier
// rate limit.

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

// How long a fetched result stays valid before a fresh request is allowed
// for the same symbol/interval/outputsize combination. Short enough that
// data isn't stale for long, long enough that ChartPanel + SignalPanel
// mounting together (both wanting GBP/AUD) share one network call.
const CACHE_TTL_MS = 60_000;

type CacheEntry = { candles: Candle[]; fetchedAt: number };
const cache = new Map<string, CacheEntry>();

// Requests currently in flight, keyed the same way as the cache. If a
// second caller asks for the same key while a fetch is already running,
// it awaits the same promise instead of firing a duplicate request —
// this is what actually collapses ChartPanel and SignalPanel's
// simultaneous-on-mount GBP/AUD calls into one.
const inFlight = new Map<string, Promise<Candle[]>>();

function cacheKey(symbol: string, interval: string, outputsize: number): string {
  return `${symbol}|${interval}|${outputsize}`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchFromTwelveData(symbol: string, interval: string, outputsize: number): Promise<Candle[]> {
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

  const maxAttempts = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(`${TWELVEDATA_URL}?${params.toString()}`);

    // Rate-limited: back off and retry rather than failing immediately —
    // this is the actual fix for bursts of simultaneous requests tripping
    // the free-tier per-minute cap.
    if (response.status === 429) {
      lastError = new Error(`Twelve Data rate limit hit for ${symbol}`);
      if (attempt < maxAttempts) {
        await sleep(attempt * 1500);
        continue;
      }
      throw lastError;
    }

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

  throw lastError ?? new Error(`Twelve Data request failed for ${symbol}`);
}

/**
 * Fetches OHLC candles for a Twelve Data symbol (e.g. "GBP/AUD"). Throws
 * on any failure — callers decide how to handle that (sample-data
 * fallback for the chart, a clear "unavailable" state for signals; never
 * silently substitute fabricated data where it could look like a real
 * trading signal).
 *
 * Cached for CACHE_TTL_MS, and concurrent requests for the same
 * symbol/interval/outputsize share a single in-flight fetch.
 */
export async function fetchTwelveDataCandles(
  symbol: string,
  interval: string = '1h',
  outputsize: number = 100,
): Promise<Candle[]> {
  const key = cacheKey(symbol, interval, outputsize);

  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.candles;
  }

  const existing = inFlight.get(key);
  if (existing) {
    return existing;
  }

  const promise = fetchFromTwelveData(symbol, interval, outputsize)
    .then((candles) => {
      cache.set(key, { candles, fetchedAt: Date.now() });
      return candles;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}

/**
 * Fetches multiple symbols one at a time with a short delay between each,
 * instead of firing them all simultaneously via Promise.all — spreads out
 * a multi-symbol request (like the currency-strength basket) so it's less
 * likely to trip a burst/per-minute rate limit than an instant burst of
 * parallel calls would be. Cached/in-flight-deduped symbols resolve
 * immediately regardless (no artificial delay added for cache hits).
 */
export async function fetchCandlesSequential(
  requests: { symbol: string; interval?: string; outputsize?: number }[],
  staggerMs: number = 350,
): Promise<Candle[][]> {
  const results: Candle[][] = [];
  for (let i = 0; i < requests.length; i++) {
    const { symbol, interval = '1h', outputsize = 100 } = requests[i];
    results.push(await fetchTwelveDataCandles(symbol, interval, outputsize));
    if (i < requests.length - 1) {
      await sleep(staggerMs);
    }
  }
  return results;
}
