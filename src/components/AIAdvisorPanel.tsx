import { useState } from 'react';
import { AlertTriangle, Bot, Loader2, Sparkles } from 'lucide-react';
import { Panel } from '@/components/ui';
import { fetchTwelveDataCandles } from '@/lib/marketData';
import { CURRENCY_STRENGTH_PAIRS, computeCurrencyStrength, computeLorentzianSignal } from '@/lib/signals';
import { analyzeMarket, type AIAnalysisResult } from '@/lib/aiAdvisor';
import type { Candle } from '@/lib/marketData';

const PAIR_SYMBOL = 'GBP/AUD';

type PanelState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; analysis: string; computedAt: Date }
  | { status: 'error'; message: string };

export function AIAdvisorPanel() {
  const [state, setState] = useState<PanelState>({ status: 'idle' });

  const runAnalysis = async () => {
    setState({ status: 'loading' });

    try {
      const [gbpaud, ...basket] = await Promise.all([
        fetchTwelveDataCandles(PAIR_SYMBOL, '1h', 150),
        ...CURRENCY_STRENGTH_PAIRS.map((symbol: string) =>
          fetchTwelveDataCandles(symbol, '1h', 40)
        ),
      ]);

      // Using a string record safely bypasses the strict literal index type checking
      const candlesByPair: Record<string, Candle> = {};
      CURRENCY_STRENGTH_PAIRS.forEach((symbol: string, i: number) => {
        if (basket[i]) {
          candlesByPair[symbol] = basket[i];
        }
      });

      const lorentzian = computeLorentzianSignal(gbpaud);
      const currencyStrength = computeCurrencyStrength(candlesByPair);

      const result: AIAnalysisResult = await analyzeMarket(gbpaud, lorentzian, currencyStrength);

      if (result.status === 'ok') {
        setState({ status: 'ok', analysis: result.analysis, computedAt: new Date() });
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
      subtitle="AI-generated read of current price action"
      icon={<Bot className="h-5 w-5" />}
      action={
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
      }
    >
      <div className="p-5 space-y-4">
        <div className="flex items-start gap-2.5 rounded-lg border border-ink-600/40 bg-ink-900/40 p-3">
          <AlertTriangle className="h-4 w-4 text-steel-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-steel-400 leading-relaxed">
            This is an AI reading recent price data. It carries no verified track record
            and never suggests a specific trade to place. Each analysis triggers a real
            API request you initiate manually.
          </p>
        </div>

        {state.status === 'idle' && (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <Bot className="h-8 w-8 text-steel-600" />
            <p className="text-sm text-steel-500">
              Click Analyze to get a read on current GBP/AUD conditions.
            </p>
          </div>
        )}

        {state.status === 'loading' && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-steel-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Gathering market data and generating analysis...
          </div>
        )}

        {state.status === 'error' && (
          <div className="rounded-lg border border-bear-500/30 bg-bear-500/10 p-4">
            <p className="text-sm text-bear-300">
              Analysis failed: {state.message}
            </p>
          </div>
        )}

        {state.status === 'ok' && (
          <div className="rounded-lg border border-ink-600/40 bg-ink-900/30 p-4">
            <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
              {state.analysis}
            </p>
            <p className="text-[11px] text-steel-500 mt-3 pt-3 border-t border-ink-700/40">
              Generated {state.computedAt.toLocaleTimeString()}
            </p>
          </div>
        )}
      </div>
    </Panel>
  );
}
