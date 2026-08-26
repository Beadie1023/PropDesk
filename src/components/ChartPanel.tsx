import { useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  LineSeries,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { Loader2, LineChart } from 'lucide-react';
import { Panel } from '@/components/ui';
import { fetchTwelveDataCandles, type Candle } from '@/lib/marketData';
import { computeSupportResistance } from '@/lib/levels';
import { computeKernelRegression } from '@/lib/kernelRegression';
import { computeATR, computeTrendFilter } from '@/lib/trendFilter';
import { computeLorentzianSignal } from '@/lib/signals';

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

const RESISTANCE_COLOR = '#f87171';
const SUPPORT_COLOR = '#4ade80';
const ENTRY_COLOR = '#e2e8f0';
const TREND_FILTER_THRESHOLD = -0.1;
const RISK_REWARD_RATIO = 3; // 1:3 — SL distance × 3 = TP distance
// Bars back to compare when deciding the kernel line's color — matches
// computeKernelRegression's default `lookback` (its own smoothing
// window), so color changes track sustained moves rather than
// per-bar noise. See drawKernelRegression for why this isn't 1.
const KERNEL_COLOR_SPAN = 8;

export function ChartPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const kernelUpSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const kernelDownSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const positionLinesRef = useRef<IPriceLine[]>([]);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  const [loading, setLoading] = useState(true);
  const [usingSampleData, setUsingSampleData] = useState(false);

  // Draws the kernel regression trend line from RAW candles — same
  // reasoning as support/resistance: this should reflect real price
  // smoothing, not a second layer of smoothing on top of Heikin Ashi.
  function drawKernelRegression(rawCandles: Candle[]) {
    const upSeries = kernelUpSeriesRef.current;
    const downSeries = kernelDownSeriesRef.current;
    if (!upSeries || !downSeries) return;

    const points = computeKernelRegression(rawCandles);

    // Colors the line by the plotted (lagged) line's own slope, but
    // compared across KERNEL_COLOR_SPAN bars rather than just the
    // previous bar — comparing bar-to-bar is sensitive enough to normal
    // price noise that it flips direction every few bars (tested at
    // ~1 flip per 6 bars), which reads as clutter rather than a trend
    // change. Comparing across the same window the kernel itself uses
    // to smooth (KERNEL_LOOKBACK) cuts that roughly in half and tracks
    // sustained moves instead of noise.
    //
    // Two overlapping series (green/red) simulate a single color-
    // changing line, since lightweight-charts line series can't change
    // color mid-line; on a direction change, the prior point is
    // duplicated into the new segment so the two colors meet without a
    // visual gap.
    const upData: { time: UTCTimestamp; value: number }[] = [];
    const downData: { time: UTCTimestamp; value: number }[] = [];
    let prevDir: 'up' | 'down' | null = null;

    points.forEach((p, i) => {
      if (i < KERNEL_COLOR_SPAN) return;

      const time = p.time as UTCTimestamp;
      const dir: 'up' | 'down' = p.value >= points[i - KERNEL_COLOR_SPAN].value ? 'up' : 'down';
      const target = dir === 'up' ? upData : downData;

      if (prevDir !== null && dir !== prevDir) {
        const prev = points[i - 1];
        target.push({ time: prev.time as UTCTimestamp, value: prev.value });
      }
      target.push({ time, value: p.value });
      prevDir = dir;
    });

    upSeries.setData(upData);
    downSeries.setData(downData);
  }

  // Redraws support/resistance lines, clearing any previously drawn ones
  // first — otherwise re-fetches would keep stacking new lines on top of
  // stale ones instead of replacing them.
  function drawSupportResistance(rawCandles: Candle[]) {
    const series = seriesRef.current;
    if (!series) return;

    priceLinesRef.current.forEach((line) => series.removePriceLine(line));
    priceLinesRef.current = [];

    // Computed from the RAW candles, never the Heikin Ashi-transformed
    // ones — HA intentionally smooths/lags price, which would blur
    // exactly the price reactions this is meant to find.
    const levels = computeSupportResistance(rawCandles);

    for (const level of levels) {
      const line = series.createPriceLine({
        price: level.price,
        color: level.type === 'resistance' ? RESISTANCE_COLOR : SUPPORT_COLOR,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `${level.type === 'resistance' ? 'R' : 'S'} (${level.touches}x)`,
      });
      priceLinesRef.current.push(line);
    }
  }

  // Trend filter (-0.1 threshold, matching the reference indicator's
  // settings) gates whether a Lorentzian classification is trusted enough
  // to show a position marker. When both agree, draws a marker on the
  // latest bar plus Entry/SL/TP price lines sized to a 1:3 risk:reward
  // ratio via ATR — never auto-traded, purely a visual "if you were to
  // take this setup" reference.
  function drawPositionMarker(rawCandles: Candle[]) {
    const series = seriesRef.current;
    const markersPlugin = markersPluginRef.current;
    if (!series || !markersPlugin) return;

    positionLinesRef.current.forEach((line) => series.removePriceLine(line));
    positionLinesRef.current = [];
    markersPlugin.setMarkers([]);

    const lorentzian = computeLorentzianSignal(rawCandles);
    const trend = computeTrendFilter(rawCandles, 20, TREND_FILTER_THRESHOLD);

    if (!lorentzian || !trend || !trend.trending || lorentzian.direction === 'neutral') {
      return;
    }

    const atr = computeATR(rawCandles, 14);
    if (!atr || atr <= 0) return;

    const lastCandle = rawCandles[rawCandles.length - 1];
    const isBullish = lorentzian.direction === 'bullish';
    const entry = lastCandle.close;
    const slDistance = atr;
    const sl = isBullish ? entry - slDistance : entry + slDistance;
    const tp = isBullish ? entry + slDistance * RISK_REWARD_RATIO : entry - slDistance * RISK_REWARD_RATIO;

    const entryLine = series.createPriceLine({
      price: entry,
      color: ENTRY_COLOR,
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: 'Entry',
    });
    const slLine = series.createPriceLine({
      price: sl,
      color: RESISTANCE_COLOR,
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: true,
      title: 'SL (1R)',
    });
    const tpLine = series.createPriceLine({
      price: tp,
      color: SUPPORT_COLOR,
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: true,
      title: `TP (1:${RISK_REWARD_RATIO})`,
    });
    positionLinesRef.current = [entryLine, slLine, tpLine];

    markersPlugin.setMarkers([
      {
        time: lastCandle.time as UTCTimestamp,
        position: isBullish ? 'belowBar' : 'aboveBar',
        shape: isBullish ? 'arrowUp' : 'arrowDown',
        color: isBullish ? SUPPORT_COLOR : RESISTANCE_COLOR,
        text: `Trend ✓ 1:${RISK_REWARD_RATIO}`,
      },
    ]);
  }

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
      priceFormat: { type: 'price', precision: 5, minMove: 0.00001 },
    });

    const kernelUpSeries = chart.addSeries(LineSeries, {
      color: SUPPORT_COLOR,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    const kernelDownSeries = chart.addSeries(LineSeries, {
      color: RESISTANCE_COLOR,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    const markersPlugin = createSeriesMarkers(series, []);

    chartRef.current = chart;
    seriesRef.current = series;
    kernelUpSeriesRef.current = kernelUpSeries;
    kernelDownSeriesRef.current = kernelDownSeries;
    markersPluginRef.current = markersPlugin;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      kernelUpSeriesRef.current = null;
      kernelDownSeriesRef.current = null;
      markersPluginRef.current = null;
      priceLinesRef.current = [];
      positionLinesRef.current = [];
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
        drawSupportResistance(candles);
        drawKernelRegression(candles);
        drawPositionMarker(candles);
        chartRef.current?.timeScale().fitContent();
        setUsingSampleData(false);
      })
      .catch(() => {
        if (cancelled) return;
        const sample = generateSampleCandles();
        seriesRef.current?.setData(toChartData(toHeikinAshi(sample)));
        drawSupportResistance(sample);
        drawKernelRegression(sample);
        drawPositionMarker(sample);
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
          ? 'Heikin Ashi candles + support/resistance — sample data (Twelve Data unavailable)'
          : 'Heikin Ashi candles + support/resistance — live 1H data from Twelve Data'
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
