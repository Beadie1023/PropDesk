import { useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { Loader2, LineChart } from 'lucide-react';
import { Panel } from '@/components/ui';
import { fetchTwelveDataCandles, type Candle } from '@/lib/marketData';

// This chart is hardcoded to a single pair — no selector.
const PAIR = 'GBPAUD';
const PAIR_LABEL = 'GBP/AUD';
const TWELVEDATA_SYMBOL = 'GBP/AUD';

// ---------------------------------------------------------------------------
// Heikin Ashi conversion
// HA Close = (O + H + L + C) / 4
// HA Open  = (previous HA Open + previous HA Close) / 2 — seeded from the
//            first real candle's own open/close for the very first bar.
// HA High  = max(H, HA Open, HA Close)
// HA Low   = min(L, HA Open, HA Close)
// ---------------------------------------------------------------------------

function toHeikinAshi(candles: Candle[]): Candle[] {
  if (candles.length === 0) return [];

  const result: Candle[] = [];
  let prevHaOpen = candles[0].open;
  let prevHaClose = candles[0].close;

  candles.forEach((c, i) => {
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen = i === 0 ? (c.open + c.close) / 2 : (prevHaOpen + prevHaClose) / 2;
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);

    result.push({ time: c.time, open: haOpen, high: haHigh, low: haLow, close: haClose });

    prevHaOpen = haOpen;
    prevHaClose = haClose;
  });

  return result;
}

// ---------------------------------------------------------------------------
// Sample-data fallback (used when no API key is set, or the Twelve Data
// request fails). Deterministic so it doesn't reshuffle on re-render.
// ---------------------------------------------------------------------------

const BASE_PRICE = 1.95; // approx GBP/AUD

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

function generateSampleCandles(count = 100): Candle[] {
  const random = mulberry32(seedFromString(PAIR));
  const volatility = BASE_PRICE * 0.0025;
  const hourInSeconds = 3600;
  const startTime = Math.floor(Date.now() / 1000) - count * hourInSeconds;

  let price = BASE_PRICE;
  const candles: Candle[] = [];

  for (let i = 0; i < count; i++) {
    const time = startTime + i * hourInSeconds;
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

// ---------------------------------------------------------------------------

/**
 * lightweight-charts requires its own branded UTCTimestamp type. The
 * shared Candle type (used across chart + signal code) just uses plain
 * numbers, so this cast only happens right at the chart library boundary.
 */
function toChartData(candles: Candle[]) {
  return candles.map((c) => ({ ...c, time: c.time as UTCTimestamp }));
}

export function ChartPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  const [loading, setLoading] = useState(true);
  const [usingSampleData, setUsingSampleData] = useState(false);

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
        timeVisible: true,
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

  // Fetch real OHLC data on mount, convert to Heikin Ashi, fall back to
  // generated sample candles (also converted) if Twelve Data is unavailable.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchTwelveDataCandles(TWELVEDATA_SYMBOL, '1h', 150)
      .then((candles) => {
        if (cancelled) return;
        seriesRef.current?.setData(toChartData(toHeikinAshi(candles)));
        chartRef.current?.timeScale().fitContent();
        setUsingSampleData(false);
      })
      .catch(() => {
        if (cancelled) return;
        seriesRef.current?.setData(toChartData(toHeikinAshi(generateSampleCandles())));
        chartRef.current?.timeScale().fitContent();
        setUsingSampleData(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Panel
      title={`${PAIR_LABEL} Price Chart`}
      subtitle={
        usingSampleData
          ? 'Heikin Ashi candles — sample data (Twelve Data unavailable)'
          : 'Heikin Ashi candles — live 1H data from Twelve Data'
      }
      icon={<LineChart className="h-5 w-5" />}
    >
      <div className="p-5">
        <div className="relative w-full h-[400px]">
          <div ref={containerRef} className="w-full h-full" />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-ink-900/60 backdrop-blur-sm rounded-lg text-sm text-steel-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading {PAIR_LABEL}…
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
