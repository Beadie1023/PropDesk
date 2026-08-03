import { useEffect, useRef } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { LineChart } from 'lucide-react';
import { Panel } from '@/components/ui';

export const PAIRS = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'GBPJPY'] as const;
export type Pair = (typeof PAIRS)[number];

// Base price used to seed generated candles per pair. There is no live
// market-data feed connected to this app, so the chart renders deterministic
// sample candles instead of real quotes — see generateCandles below.
const BASE_PRICE: Record<Pair, number> = {
  EURUSD: 1.085,
  GBPUSD: 1.272,
  USDJPY: 149.8,
  XAUUSD: 2385,
  GBPJPY: 190.5,
};

type Candle = {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
};

// Deterministic PRNG seeded per pair so the same pair always renders the
// same candles instead of reshuffling on every re-render.
function mulberry32(seed: number) {
  let s = seed;
  return function random() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h;
}

function generateCandles(pair: Pair, count = 180): Candle[] {
  const random = mulberry32(seedFromString(pair));
  const basePrice = BASE_PRICE[pair];
  const volatility = basePrice * 0.0025;
  const dayInSeconds = 86400;
  const startTime = Math.floor(Date.now() / 1000) - count * dayInSeconds;

  let price = basePrice;
  const candles: Candle[] = [];

  for (let i = 0; i < count; i++) {
    const time = (startTime + i * dayInSeconds) as UTCTimestamp;
    const open = price;
    const drift = (random() - 0.5) * volatility;
    const close = Math.max(open + drift, open * 0.5);
    const high = Math.max(open, close) + random() * volatility * 0.6;
    const low = Math.min(open, close) - random() * volatility * 0.6;
    candles.push({ time, open, high, low, close });
    price = close;
  }

  return candles;
}

export function ChartPanel({
  pair,
  onPairChange,
}: {
  pair: Pair;
  onPairChange: (pair: Pair) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  // Create the chart once and let it resize with its container.
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.08)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.08)' },
      },
      timeScale: {
        borderColor: 'rgba(148, 163, 184, 0.15)',
      },
      rightPriceScale: {
        borderColor: 'rgba(148, 163, 184, 0.15)',
      },
      crosshair: {
        mode: 1,
      },
      autoSize: true,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#4ade80',
      downColor: '#f87171',
      borderUpColor: '#4ade80',
      borderDownColor: '#f87171',
      wickUpColor: '#4ade80',
      wickDownColor: '#f87171',
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Repopulate candles whenever the selected pair changes.
  useEffect(() => {
    if (!seriesRef.current) return;
    seriesRef.current.setData(generateCandles(pair));
    chartRef.current?.timeScale().fitContent();
  }, [pair]);

  return (
    <Panel
      title="Price Chart"
      subtitle="Candlestick view — sample data, not a live market feed"
      icon={<LineChart className="h-5 w-5" />}
      action={
        <select
          value={pair}
          onChange={(e) => onPairChange(e.target.value as Pair)}
          className="input-field w-32"
        >
          {PAIRS.map((p) => (
            <option key={p} value={p}>
              {p.slice(0, 3)}/{p.slice(3)}
            </option>
          ))}
        </select>
      }
    >
      <div className="p-5">
        <div ref={containerRef} className="w-full h-[400px]" />
      </div>
    </Panel>
  );
}
