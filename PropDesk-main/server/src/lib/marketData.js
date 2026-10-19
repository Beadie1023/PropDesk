// Backend Twelve Data fetching for the signal poller. Mirrors the logic in
// src/lib/marketData.ts (frontend) — kept as a separate plain-JS copy
// since the backend has no TypeScript/Vite build step. If you change the
// fetch/retry logic on one side, update the other to match.

const TWELVEDATA_URL = 'https://api.twelvedata.com/time_series';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches OHLC candles for a Twelve Data symbol (e.g. "GBP/AUD"). Throws
 * on failure rather than returning fabricated data — the poller must
 * skip a cycle on failure, never invent a signal from missing data.
 */
export async function fetchTwelveDataCandles(symbol, interval = '1h', outputsize = 100) {
  const apiKey = process.env.TWELVEDATA_KEY;
  if (!apiKey) {
    throw new Error('TWELVEDATA_KEY is not set in the server environment');
  }

  const params = new URLSearchParams({
    symbol,
    interval,
    outputsize: String(outputsize),
    timezone: 'UTC',
    apikey: apiKey,
  });

  const maxAttempts = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(`${TWELVEDATA_URL}?${params.toString()}`);

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

    const data = await response.json();
    if (data.status !== 'ok' || !Array.isArray(data.values) || data.values.length === 0) {
      throw new Error(
        data.status === 'error' ? data.message || `Twelve Data error for ${symbol}` : `No data returned for ${symbol}`,
      );
    }

    const candles = data.values
      .map((v) => ({
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

  throw lastError || new Error(`Twelve Data request failed for ${symbol}`);
}

/**
 * Fetches multiple symbols one at a time with a short delay between each,
 * instead of firing them all simultaneously — avoids bursting the
 * free-tier rate limit.
 */
export async function fetchCandlesSequential(requests, staggerMs = 350) {
  const results = [];
  for (let i = 0; i < requests.length; i++) {
    const { symbol, interval = '1h', outputsize = 100 } = requests[i];
    results.push(await fetchTwelveDataCandles(symbol, interval, outputsize));
    if (i < requests.length - 1) {
      await sleep(staggerMs);
    }
  }
  return results;
}
