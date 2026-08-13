export type Candle = {
 time: number;
 open: number;
 high: number;
 low: number;
 close: number;
 volume: number;
};

const TWELVE_DATA_KEY = import.meta.env.VITE_TWELVE_DATA_API_KEY || '';

export async function fetchTwelveDataCandles(
 symbol: string,
 interval: string,
 count: number,
): Promise<Candle> {
 if (!TWELVE_DATA_KEY) return;
 const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=${interval}&outputsize=${count}&apikey=${TWELVE_DATA_KEY}&format=JSON`;
 const res = await fetch(url);
 const data = await res.json();
 if (!data.values) return;
 return data.values.map((v: Record<string, string>) => ({
 time: new Date(v.datetime).getTime(),
 open: parseFloat(v.open),
 high: parseFloat(v.high),
 low: parseFloat(v.low),
 close: parseFloat(v.close),
 volume: parseFloat(v.volume ?? '0'),
 }));
}

export async function fetchCandles(
 symbol: string,
 interval: string,
): Promise<Candle> {
 return fetchTwelveDataCandles(symbol, interval, 100);
}

export async function getLivePrice(symbol: string): Promise<number | null> {
 if (!TWELVE_DATA_KEY) return null;
 const url = `https://api.twelvedata.com/price?symbol=${symbol}&apikey=${TWELVE_DATA_KEY}`;
 const res = await fetch(url);
 const data = await res.json();
 return data.price ? parseFloat(data.price) : null;
}
