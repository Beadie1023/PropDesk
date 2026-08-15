import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { Panel } from '@/components/ui';
import { fetchCandlesSequential, fetchTwelveDataCandles, type Candle } from '@/lib/marketData';
import {
  CURRENCY_STRENGTH_PAIRS,
  combineSignals,
  computeCurrencyStrength,
  computeLorentzianSignal,
  type CurrencyStrengthResult,
  type LorentzianSignal,
  type OverallSignal,
} from '@/lib/signals';

const PAIR_SYMBOL = 'GBP/AUD';

type SignalState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ok';
      lorentzian: LorentzianSignal | null;
      currencyStrength: CurrencyStrengthResult | null;
      overall: OverallSignal;
      computedAt: Date;
    };

const OVERALL_LABEL: Record<OverallSignal, string> = {
  strong_buy: 'Strong Buy',
  buy: 'Buy',
  neutral: 'Neutral',
  sell: 'Sell',
  strong_sell: 'Strong Sell',
  conflicting: 'Conflicting',
};

const OVERALL_COLOR: Record<OverallSignal, string> = {
  strong_buy: 'text-bull-400',
  buy: 'text-bull-400',
  neutral: 'text-steel-300',
  sell: 'text-bear-400',
  strong_sell: 'text-bear-400',
  conflicting: 'text-warn-400',
};

const OVERALL_BG: Record<OverallSignal, string> = {
  strong_buy: 'bg-bull-500/15 border-bull-500/30',
  buy: 'bg-bull-500/10 border-bull-500/20',
  neutral: 'bg-ink-900/40 border-ink-600/40',
  sell: 'bg-bear-500/10 border-bear-500/20',
  strong_sell: 'bg-bear-500/15 border-bear-500/30',
  conflicting: 'bg-warn-500/15 border-warn-500/30',
};

export function SignalPanel() {
  const [state, setState] = useState<SignalState>({ status: 'loading' });

  const runAnalysis = useCallback(async () => {
    setState({ status: 'loading' });

    try {
      // GBP/AUD first — ChartPanel likely already fetched this exact
      // symbol/interval/outputsize, so this is often a cache hit. The
      // basket (genuinely distinct symbols, can't be cached away) is
      // fetched with a small stagger instead of all at once, to avoid
      // bursting the free-tier rate limit.
      const gbpaud = await fetchTwelveDataCandles(PAIR_SYMBOL, '1h', 150);
      const basket = await fetchCandlesSequential(
        CURRENCY_STRENGTH_PAIRS.map((symbol) => ({ symbol, interval: '1h', outputsize: 40 })),
      );

      const candlesByPair: Partial<Record<(typeof CURRENCY_STRENGTH_PAIRS)[number], Candle[]>> = {};
      CURRENCY_STRENGTH_PAIRS.forEach((symbol, i) => {
        candlesByPair[symbol] = basket[i];
      });

      const lorentzian = computeLorentzianSignal(gbpaud);
      const currencyStrength = computeCurrencyStrength(candlesByPair);
      const overall = combineSignals(lorentzian, currencyStrength);

      setState({ status: 'ok', lorentzian, currencyStrength, overall, computedAt: new Date() });
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to compute signal',
      });
    }
  }, []);

  useEffect(() => {
    runAnalysis();
  }, [runAnalysis]);

  return (
    <Panel
      title="Signal Generator"
      subtitle="GBP/AUD · Lorentzian classification + currency strength — for your review, not auto-traded"
      icon={<Sparkles className="h-5 w-5" />}
      action={
        <button
          onClick={runAnalysis}
          disabled={state.status === 'loading'}
          className="btn-ghost"
        >
          <RefreshCw className={`h-4 w-4 ${state.status === 'loading' ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      }
    >
      <div className="p-5 space-y-4">
        {/* Standing disclaimer — always visible, not just on error */}
        <div className="flex items-start gap-2.5 rounded-lg border border-ink-600/40 bg-ink-900/40 p-3">
          <AlertTriangle className="h-4 w-4 text-steel-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-steel-400 leading-relaxed">
            Heuristic signal only, no verified track record. Upcomers doesn't permit automated
            execution on this account — review and place trades manually. Not financial advice.
          </p>
        </div>

        {state.status === 'loading' && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-steel-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Computing signal…
          </div>
        )}

        {state.status === 'error' && (
          <div className="rounded-lg border border-bear-500/30 bg-bear-500/10 p-4">
            <p className="text-sm text-bear-300">Couldn't compute a signal: {state.message}</p>
            <p className="text-[11px] text-bear-400/70 mt-1">
              No fallback signal is shown — treat this as "unavailable," not "neutral."
            </p>
          </div>
        )}

        {state.status === 'ok' && (
          <>
            {/* Overall */}
            <div className={`rounded-xl border p-4 text-center ${OVERALL_BG[state.overall]}`}>
              <p className="text-[11px] text-steel-400 uppercase tracking-wider mb-1">Overall Signal</p>
              <p className={`stat-value text-3xl font-bold ${OVERALL_COLOR[state.overall]}`}>
                {OVERALL_LABEL[state.overall]}
              </p>
              <p className="text-[11px] text-steel-500 mt-1">
                Computed {state.computedAt.toLocaleTimeString()}
              </p>
            </div>

            {/* Breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg border border-ink-600/40 bg-ink-900/30 p-3.5">
                <p className="text-[11px] text-steel-400 uppercase tracking-wider mb-2">
                  Lorentzian Classification
                </p>
                {state.lorentzian ? (
                  <>
                    <p
                      className={`stat-value text-lg font-semibold ${
                        state.lorentzian.direction === 'bullish'
                          ? 'text-bull-400'
                          : state.lorentzian.direction === 'bearish'
                            ? 'text-bear-400'
                            : 'text-steel-300'
                      }`}
                    >
                      {state.lorentzian.direction === 'bullish'
                        ? 'Bullish'
                        : state.lorentzian.direction === 'bearish'
                          ? 'Bearish'
                          : 'Neutral'}
                    </p>
                    <p className="text-[11px] text-steel-500 mt-1">
                      {state.lorentzian.confidence.toFixed(0)}% of {state.lorentzian.neighborsUsed} nearest
                      historical bars agreed
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-steel-500">Not enough history to classify</p>
                )}
              </div>

              <div className="rounded-lg border border-ink-600/40 bg-ink-900/30 p-3.5">
                <p className="text-[11px] text-steel-400 uppercase tracking-wider mb-2">Currency Strength</p>
                {state.currencyStrength ? (
                  <>
                    <p
                      className={`stat-value text-lg font-semibold ${
                        state.currencyStrength.direction === 'bullish'
                          ? 'text-bull-400'
                          : state.currencyStrength.direction === 'bearish'
                            ? 'text-bear-400'
                            : 'text-steel-300'
                      }`}
                    >
                      {state.currencyStrength.direction === 'bullish'
                        ? 'GBP > AUD'
                        : state.currencyStrength.direction === 'bearish'
                          ? 'AUD > GBP'
                          : 'Balanced'}
                    </p>
                    <p className="text-[11px] text-steel-500 mt-1">
                      GBP {state.currencyStrength.gbpScore.toFixed(0)} · AUD{' '}
                      {state.currencyStrength.audScore.toFixed(0)} (0-100 scale)
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-steel-500">Basket data unavailable</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}
