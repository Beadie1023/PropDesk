export type Candle = {
 time: number;
 open: number;
 high: number;
 low: number;
 close: number;
 volume: number;
};

export async function fetchCandles(symbol: string, interval: string): Promise<Candle> {
 return;
}

export async function getLivePrice(symbol: string): Promise<number | null> {
 return null;
}
