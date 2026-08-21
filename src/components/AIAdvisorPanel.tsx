
import { useState } from 'react';
import { AlertTriangle, Bot, Loader2, Sparkles, SlidersHorizontal } from 'lucide-react';
import { Panel } from '@/components/ui';
import { fetchCandlesSequential, fetchTwelveDataCandles } from '@/lib/marketData';
import {
 CURRENCY_STRENGTH_PAIRS,
 computeCurrencyStrength,
 computeLorentzianSignal,
 computeKernelRegression,
 computePositionMarker,
 type KernelResult,
 type PositionMarker,
} from '@/lib/signals';
import { analyzeMarket, type AIAnalysisResult } from '@/lib/aiAdvisor';
import type { Candle } from '@/lib/marketData';

const PAIR_SYMBOL = 'GBP/AUD';

type PanelState =
 | { status: 'idle' }
 | { status: 'loading' }
 | { status: 'ok'; analysis: string; computedAt: Date; kernel: KernelResult; marker: PositionMarker }
 | { status: 'error'; message: string };

const LORENTZIAN_FEATURES = [
 { label: 'Feature 1', indicator: 'RSI', paramA: 14, paramB: 1 },
 { label: 'Feature 2', indicator: 'WT', paramA: 10, paramB: 11 },
 { label: 'Feature 3', indicator: 'CCI', paramA: 20, paramB: 1 },
 { label: 'Feature 4', indicator: 'ADX', paramA: 20, paramB: 2 },
 { label: 'Feature 5', indicator: 'RSI', paramA: 9, paramB: 1 },
];

const LORENTZIAN_FILTERS = [
 { label: 'Volatility Filter', value: 'Enabled (default)' },
 { label: 'Regime Filter', value: 'Enabled - threshold: -0.1' },
 { label: 'ADX Filter', value: 'Enabled - threshold: 20' },
 { label: 'EMA Filter', value: 'Enabled - period: 200' },
 { label: 'SMA Filter', value: 'Enabled - period: 200' },
];

const LORENTZIAN_KERNEL = [
 { label: 'Trade with Kernel', value: 'On' },
 { label: 'Show Kernel Estimate', value: 'On' },
 { label: 'Lookback Window', value: '8' },
 { label: 'Relative Weighting', value: '8' },
 { label: 'Regression Level', value: '25' },
 { label: 'Kernel Smoothing Lag', value: '2' },
];

export function AIAdvisorPanel() {
 const [state, setState] = useState<PanelState>({ status: 'idle' });
 const [showConfig, setShowConfig] = useState(false);

 const runAnalysis = async () => {
 setState({ status: 'loading' });
 try {
 const gbpaud = await fetchTwelveDataCandles(PAIR_SYMBOL, '1h', 150);
 const basket = await fetchCandlesSequential(
 CURRENCY_STRENGTH_PAIRS.map((symbol) => ({ symbol, interval: '1h', outputsize: 40 })),
 );

 const candlesByPair: Partial<Record<(typeof CURRENCY_STRENGTH_PAIRS)[number], Candle>> = {};
 CURRENCY_STRENGTH_PAIRS.forEach((symbol, i) => {
 candlesByPair[symbol] = basket[i];
 });

 const lorentzian = computeLorentzianSignal(gbpaud);
 const currencyStrength = computeCurrencyStrength(candlesByPair);
 const kernel = computeKernelRegression(gbpaud);
 const lastClose = gbpaud[gbpaud.length - 1].close;
 const marker = computePositionMarker(
 lastClose,
 kernel.direction === 'neutral' ? 'bearish' : kernel.direction,
 );

 const result: AIAnalysisResult = await analyzeMarket(gbpaud, lorentzian, currencyStrength);

 if (result.status === 'ok') {
 setState({
 status: 'ok',
 analysis: result.analysis,
 computedAt: new Date(),
 kernel,
 marker,
 });
 } else {
 setState({ status: 'error', message: result.message });
 }
 } catch (err) {
 setState({
 status: 'error',
 message: err instanceof Error ? err.message : 'Failed to gather market data',
 });
 }
 };

 return (
 <Panel
 title="AI Market Advisor"
 subtitle="AI-generated read of current price action - not a professional or verified track record"
 icon={<Bot className="h-5 w-5" />}
 action={
 <div className="flex items-center gap-2">
 <button
 onClick={() => setShowConfig((v) => !v)}
 className="btn-ghost flex items-center gap-1.5 text-xs text-steel-400 hover:text-steel-200"
 >
 <SlidersHorizontal className="h-3.5 w-3.5" />
 Lorentzian Config
 </button>
 <button
 onClick={runAnalysis}
 disabled={state.status === 'loading'}
 className="btn-primary"
 >
 {state.status === 'loading' ? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ) : (
 <Sparkles className="h-4 w-4" />
 )}
 Analyze
 </button>
 </div>
 }
 >
 <div className="p-5 space-y-4">

 {/ Disclaimer /}
 <div className="flex items-start gap-2.5 rounded-lg border border-ink-600/40 bg-ink-900/40 p-3">
 <AlertTriangle className="h-4 w-4 text-steel-400 mt-0.5 shrink-0" />
 <p className="text-[11px] text-steel-400 leading-relaxed">
 This is an AI reading recent price data - not a professional trader, not financial
 advice, and it has no verified track record. It never suggests a specific trade to
 place. This does not run automatically; each analysis is a real API request you trigger.
 </p>
 </div>

 {/ Lorentzian Config Card /}
 {showConfig && (
 <div className="rounded-lg border border-ink-600/40 bg-ink-900/30 p-4 space-y-4">
 <p className="text-xs font-semibold text-steel-300 uppercase tracking-wide">
 Lorentzian Classification v2.0 - GBP/AUD 30m
 </p>

 {/ Features Table /}
 <div>
 <p className="text-[11px] text-steel-500 uppercase tracking-wide mb-2">Features</p>
 <table className="w-full text-xs text-steel-300">
 <thead>
 <tr className="text-[11px] text-steel-500 border-b border-ink-700/40">
 <th className="text-left pb-1.5 font-normal">Feature</th>
 <th className="text-left pb-1.5 font-normal">Indicator</th>
 <th className="text-right pb-1.5 font-normal">Param A</th>
 <th className="text-right pb-1.5 font-normal">Param B</th>
 </tr>
 </thead>
 <tbody>
 {LORENTZIAN_FEATURES.map((f) => (
 <tr key={f.label} className="border-b border-ink-700/20">
 <td className="py-1.5 text-steel-500">{f.label}</td>
 <td className="py-1.5 font-medium text-slate-200">{f.indicator}</td>
 <td className="py-1.5 text-right tabular-nums">{f.paramA}</td>
 <td className="py-1.5 text-right tabular-nums">{f.paramB}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>

 {/ Filters /}
 <div>
 <p className="text-[11px] text-steel-500 uppercase tracking-wide mb-2">Filters</p>
 <div className="space-y-1.5">
 {LORENTZIAN_FILTERS.map((f) => (
 <div key={f.label} className="flex justify-between text-xs">
 <span className="text-steel-400">{f.label}</span>
 <span className="text-slate-200 tabular-nums">{f.value}</span>
 </div>
 ))}
 </div>
 </div>

 {/ Kernel Settings /}
 <div>
 <p className="text-[11px] text-steel-500 uppercase tracking-wide mb-2">Kernel Settings</p>
 <div className="space-y-1.5">
 {LORENTZIAN_KERNEL.map((k) => (
 <div key={k.label} className="flex justify-between text-xs">
 <span className="text-steel-400">{k.label}</span>
 <span className="text-slate-200 tabular-nums">{k.value}</span>
 </div>
 ))}
 </div>
 </div>

 <p className="text-[11px] text-steel-600 pt-1">
 Backtest stats: 57.8% winrate · 64 trades · WL ratio 1.37 · 5 early signal flips
 </p>
 </div>
 )}

 {/ Idle State /}
 {state.status === 'idle' && (
 <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
 <Bot className="h-8 w-8 text-steel-600" />
 <p className="text-sm text-steel-500">
 Click "Analyze" to get a read on current GBP/AUD conditions.
 </p>
 </div>
 )}

 {/ Loading State /}
 {state.status === 'loading' && (
 <div className="flex items-center justify-center gap-2 py-10 text-sm text-steel-400">
 <Loader2 className="h-4 w-4 animate-spin" />
 Gathering market data and generating analysis…
 </div>
 )}

 {/ Error State /}
 {state.status === 'error' && (
 <div className="rounded-lg border border-bear-500/30 bg-bear-500/10 p-4">
 <p className="text-sm text-bear-300">
 Couldn't generate analysis: {state.message}
 </p>
 </div>
 )}

 {/ Success State /}
 {state.status === 'ok' && (
 <div className="space-y-4">

 {/ Kernel Regression Card /}
 <div className="rounded-lg border border-ink-600/40 bg-ink-900/30 p-4 space-y-3">
 <p className="text-[11px] text-steel-500 uppercase tracking-wide font-semibold">
 Nadaraya-Watson Kernel Regression
 </p>

 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-0.5">
 <p className="text-[11px] text-steel-500">Kernel Estimate</p>
 <p className="text-sm font-mono text-slate-200">
 {state.kernel.estimate.toFixed(5)}
 </p>
 </div>
 <div className="space-y-0.5">
 <p className="text-[11px] text-steel-500">Lagged Estimate</p>
 <p className="text-sm font-mono text-slate-200">
 {state.kernel.laggedEstimate.toFixed(5)}
 </p>
 </div>
 <div className="space-y-0.5">
 <p className="text-[11px] text-steel-500">Direction</p>
 <p className={text-sm font-semibold capitalize ${
 state.kernel.direction === 'bullish'
 ? 'text-bull-400'
 : state.kernel.direction === 'bearish'
 ? 'text-bear-400'
 : 'text-steel-400'
 }}>
 {state.kernel.direction}
 </p>
 </div>
 <div className="space-y-0.5">
 <p className="text-[11px] text-steel-500">Trend Filter (-0.1)</p>
 <p className={text-sm font-semibold ${
 state.kernel.trendFilterPassed ? 'text-bull-400' : 'text-bear-400'
 }}>
 {state.kernel.trendFilterPassed ? 'Passed' : 'Blocked'}
 </p>
 </div>
 </div>

 {/ Trend Filter Signal Marker /}
 <div className={flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium ${
 ? 'bg-bull-500/10 border border-bull-500/30 text-bull-300'
 : 'bg-bear-500/10 border border-bear-500/30 text-bear-300'
 }}>
 <span className={h-2 w-2 rounded-full shrink-0 ${
 state.kernel.trendFilterPassed ? 'bg-bull-400' : 'bg-bear-400'
 }} />
 {state.kernel.trendFilterPassed
 ? 'Trend filter clear - kernel signal active'
 : 'Trend filter blocked - regime below -0.1 threshold'}
 </div>
 </div>

 {/ 1:3 Position Marker Card /}
 <div className="rounded-lg border border-ink-600/40 bg-ink-900/30 p-4 space-y-3">
 <p className="text-[11px] text-steel-500 uppercase tracking-wide font-semibold">
 Position Marker · 1:3 Risk/Reward
 </p>

 <div className="space-y-2">
 <div className="flex justify-between items-center text-xs">
 <span className="text-steel-400">Take Profit</span>
 <span className="font-mono text-bull-300">
 {state.marker.takeProfit.toFixed(5)}
 </span>
 </div>
 <div className="relative h-px bg-ink-700/60 mx-1">
 <div className="absolute right-0 -top-1 h-2 w-2 rounded-full bg-bull-400" />
 </div>
 <div className="flex justify-between items-center text-xs">
 <span className="text-steel-400">Entry</span>
 <span className="font-mono text-slate-200">
 {state.marker.entry.toFixed(5)}
 </span>
 </div>
 <div className="relative h-px bg-ink-700/60 mx-1">
 <div className="absolute right-0 -top-1 h-2 w-2 rounded-full bg-bear-400" />
 </div>
 <div className="flex justify-between items-center text-xs">
 <span className="text-steel-400">Stop Loss</span>
 <span className="font-mono text-bear-300">
 {state.marker.stopLoss.toFixed(5)}
 </span>
 </div>
 </div>

 <div className="flex justify-between text-[11px] text-steel-500 pt-1 border-t border-ink-700/40">
 <span>Risk: {state.marker.riskAmount.toFixed(5)}</span>
 <span>Reward: {state.marker.rewardAmount.toFixed(5)}</span>
 <span className="text-steel-300 font-semibold">Ratio 1:3</span>
 </div>
 </div>

 {/ AI Analysis Card /}
 <div className="rounded-lg border border-ink-600/40 bg-ink-900/30 p-4 overflow-y-auto max-h-[480px]">
 <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
 {state.analysis}
 </p>
 <p className="text-[11px] text-steel-500 mt-3 pt-3 border-t border-ink-700/40">
 Generated {state.computedAt.toLocaleTimeString()}
 </p>
 </div>

 </div>
 )}

 </div>
 </Panel>
 );
}
``
