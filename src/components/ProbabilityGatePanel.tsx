import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Copy, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { Panel } from '@/components/ui';
import { fetchTwelveDataCandles } from '@/lib/marketData';
import { buildMarketContext, contextLevels, type Direction, type MarketContext } from '@/lib/bias';
import { evaluateGate, type GateMode } from '@/lib/probabilityFactor';
import { lotsForRisk } from '@/lib/structuralRisk';
import { scalingDecision } from '@/lib/scaling';
import { PIP, RR_OPTIONS, drawdownBufferRemaining, formatCurrency, formatPrice, rrRatio } from '@/lib/trading';
import type { Account, RRKey, Trade } from '@/types';

const SYMBOL = 'GBP/AUD';
// ~2000 hourly bars ≈ 80+ forex sessions: enough for SMA(50) + swing levels in ONE request.
const HOURLY_BARS = 2000;
const REFRESH_MS = 5 * 60 * 1000;
// Never risk more than this share of the remaining drawdown buffer on one trade (untuned).
const BUFFER_RISK_CAP = 0.1;

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; ctx: MarketContext; fetchedAt: Date };

const MODE_STYLE: Record<GateMode, { label: string; cls: string }> = {
  full: { label: 'FULL SIZE', cls: 'bg-bull-500/15 text-bull-400 border-bull-500/30' },
  reduced: { label: 'REDUCED', cls: 'bg-warn-500/15 text-warn-400 border-warn-500/30' },
  scalp: { label: 'SCALP ONLY', cls: 'bg-warn-500/15 text-warn-400 border-warn-500/30' },
  blocked: { label: 'BLOCKED', cls: 'bg-bear-500/15 text-bear-400 border-bear-500/30' },
};

function CheckRow({ pass, title, detail }: { pass: boolean | null; title: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-ink-700/50 bg-ink-900/40 p-3">
      <div
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
          pass === null
            ? 'bg-ink-600 text-steel-400'
            : pass
              ? 'bg-bull-500/20 text-bull-400'
              : 'bg-bear-500/20 text-bear-400'
        }`}
      >
        {pass ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-100">{title}</p>
        <p className="text-xs text-steel-400 leading-relaxed">{detail}</p>
      </div>
    </div>
  );
}

export function ProbabilityGatePanel({ accounts, trades }: { accounts: Account[]; trades: Trade[] }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [direction, setDirection] = useState<Direction>('short');
  const [rr, setRr] = useState<RRKey>('1:3');
  const [entryInput, setEntryInput] = useState('');
  const [stopInput, setStopInput] = useState('');
  const [riskPct, setRiskPct] = useState('0.25');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const candles = await fetchTwelveDataCandles(SYMBOL, '1h', HOURLY_BARS);
      const ctx = buildMarketContext(candles);
      if (!ctx) throw new Error('Not enough hourly history to build the daily context');
      setState({ status: 'ok', ctx, fetchedAt: new Date() });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load market data';
      // Keep showing the last good context if a background refresh fails.
      setState((prev) => (prev.status === 'ok' ? prev : { status: 'error', message }));
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const ctx = state.status === 'ok' ? state.ctx : null;

  const entry = parseFloat(entryInput) || undefined;
  const stop = parseFloat(stopInput) || undefined;

  const gate = useMemo(
    () => (ctx ? evaluateGate({ ctx, direction, entry, stop, rr: rrRatio(rr) }) : null),
    [ctx, direction, entry, stop, rr],
  );

  const ladder = useMemo(() => {
    if (!ctx) return [];
    const rows: { key: string; label: string; price: number; isPrice?: boolean }[] = contextLevels(ctx);
    rows.push({ key: 'price', label: 'Price', price: gate?.entry ?? ctx.price, isPrice: true });
    return rows.sort((a, b) => b.price - a.price);
  }, [ctx, gate?.entry]);

  const sizing = useMemo(() => {
    if (!gate) return [];
    const pct = parseFloat(riskPct) || 0;
    return accounts
      .filter((a) => a.status === 'active' && a.lots > 0 && a.pipValue > 0)
      .map((a) => {
        const buffer = drawdownBufferRemaining(a);
        const budget = Math.min((a.balance * pct) / 100, buffer * BUFFER_RISK_CAP) * gate.sizeMultiplier;
        const fit = lotsForRisk({
          riskUsd: budget,
          stopPips: gate.stopPips,
          pipValuePerLot: a.pipValue / a.lots,
        });
        const scale = scalingDecision(a.lots, a.startingBalance, a.balance, trades, a.name);
        const use = gate.mode === 'blocked' ? 0 : Math.min(fit.lots, scale.lots);
        return { account: a, budget, fit, scale, use };
      });
  }, [accounts, trades, gate, riskPct]);

  const copyTag = async () => {
    if (!gate) return;
    try {
      await navigator.clipboard.writeText(gate.tag);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — tag is still visible on screen */
    }
  };

  const pips = (a: number, b: number) => Math.abs(a - b) / PIP;

  return (
    <Panel
      title="Probability Gate"
      subtitle={`${SYMBOL} · trend bias + liquidity zone + ATR feasibility — a checklist, not a prediction`}
      icon={<ShieldCheck className="h-5 w-5" />}
      action={
        <button onClick={load} className="btn-ghost" title="Refetch hourly candles">
          <RefreshCw className={`h-4 w-4 ${state.status === 'loading' ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      }
    >
      <div className="p-5 space-y-5">
        {state.status === 'loading' && <p className="text-sm text-steel-400">Loading daily context…</p>}
        {state.status === 'error' && (
          <div className="rounded-lg border border-bear-500/40 bg-bear-500/10 p-3 text-sm text-bear-300">
            Couldn't build the gate: {state.message}
          </div>
        )}

        {ctx && gate && (
          <>
            {/* Controls */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-steel-400 mb-2">Direction</label>
                <div className="flex gap-1.5 rounded-lg bg-ink-900/70 border border-ink-600/50 p-1">
                  {(['long', 'short'] as Direction[]).map((d) => (
                    <button
                      key={d}
                      onClick={() => setDirection(d)}
                      className={`flex-1 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                        direction === d
                          ? d === 'long'
                            ? 'bg-bull-500 text-ink-950'
                            : 'bg-bear-500 text-ink-950'
                          : 'text-steel-400 hover:text-slate-200'
                      }`}
                    >
                      {d === 'long' ? 'Long' : 'Short'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-steel-400 mb-2">Reward : risk</label>
                <div className="flex gap-1.5 rounded-lg bg-ink-900/70 border border-ink-600/50 p-1">
                  {RR_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setRr(opt)}
                      className={`flex-1 px-2 py-1.5 rounded-md text-xs font-semibold font-mono transition ${
                        rr === opt ? 'bg-accent-500 text-ink-950' : 'text-steel-400 hover:text-slate-200'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-steel-400 mb-2">
                  Entry (blank = live {formatPrice(ctx.price)})
                </label>
                <input
                  type="number"
                  step="0.0001"
                  className="input-field"
                  value={entryInput}
                  placeholder={formatPrice(ctx.price)}
                  onChange={(e) => setEntryInput(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-steel-400 mb-2">
                  Stop (blank = structural {formatPrice(gate.stop)})
                </label>
                <input
                  type="number"
                  step="0.0001"
                  className="input-field"
                  value={stopInput}
                  placeholder={formatPrice(gate.stop)}
                  onChange={(e) => setStopInput(e.target.value)}
                />
              </div>
            </div>

            {/* Verdict */}
            <div className="flex flex-wrap items-center gap-3">
              <span className={`chip border ${MODE_STYLE[gate.mode].cls}`}>{MODE_STYLE[gate.mode].label}</span>
              <span className="stat-value text-2xl text-slate-100">{gate.score}/3</span>
              <span className="text-xs text-steel-400">
                stop {gate.stopPips.toFixed(0)} pips · {gate.stopIsStructural ? 'structural' : 'not structural'} · size ×
                {gate.sizeMultiplier}
              </span>
              <button onClick={copyTag} className="btn-ghost ml-auto" title="Copy a tag for your journal note">
                <Copy className="h-4 w-4" />
                {copied ? 'Copied' : 'Copy journal tag'}
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <CheckRow
                pass={ctx.bias === null ? null : gate.biasPoint}
                title="Trend bias"
                detail={
                  ctx.sma50 === null
                    ? 'Fewer than 50 completed sessions — bias unknown.'
                    : `Price ${ctx.price >= ctx.sma50 ? 'above' : 'below'} SMA50 (${formatPrice(ctx.sma50)}) → ${
                        ctx.bias === 'long' ? 'buyers' : 'sellers'
                      } in control.${gate.counterTrend ? ' This trade is counter-trend.' : ''}`
                }
              />
              <CheckRow
                pass={gate.zonePoint}
                title="Liquidity zone"
                detail={
                  gate.zoneFavors
                    ? `Location favours ${gate.zoneFavors}s.`
                    : 'Mid-range or beyond the levels — location gives no edge.'
                }
              />
              <CheckRow
                pass={gate.feasible}
                title="Range value"
                detail={`${gate.atrUsedPct.toFixed(0)}% of daily ATR (${(ctx.atr / PIP).toFixed(0)} pips) used since the open. Target needs ${(
                  gate.requiredMove / PIP
                ).toFixed(0)} pips (${gate.effectiveRR}R); ${(gate.remainingMove / PIP).toFixed(0)} remain.`}
              />
            </div>

            <ul className="text-xs text-steel-400 space-y-1 list-disc pl-5">
              {gate.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
              {gate.target && (
                <li>
                  Next opposing liquidity: {gate.target.label} at {formatPrice(gate.target.price)}
                  {gate.structuralRR !== null && ` (${gate.structuralRR.toFixed(1)}R from your stop)`}.
                </li>
              )}
            </ul>

            {/* Level ladder */}
            <div>
              <h3 className="text-xs font-medium text-steel-400 mb-2">Levels (daily sessions rolling 17:00 New York)</h3>
              <div className="rounded-lg border border-ink-700/50 divide-y divide-ink-700/40">
                {ladder.map((row) => (
                  <div
                    key={row.key}
                    className={`flex items-center justify-between px-3 py-1.5 text-xs ${
                      row.isPrice ? 'bg-accent-500/10 text-accent-300' : 'text-slate-300'
                    }`}
                  >
                    <span>{row.label}</span>
                    <span className="stat-value">
                      {formatPrice(row.price)}
                      {!row.isPrice && (
                        <span className="ml-3 text-steel-500">
                          {row.price > (gate.entry ?? ctx.price) ? '+' : '−'}
                          {pips(row.price, gate.entry).toFixed(0)}p
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Sizing */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-steel-400">Position size per account</h3>
                <label className="flex items-center gap-2 text-xs text-steel-400">
                  Risk % of balance
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    className="input-field !w-20 !py-1"
                    value={riskPct}
                    onChange={(e) => setRiskPct(e.target.value)}
                  />
                </label>
              </div>
              <div className="overflow-x-auto rounded-lg border border-ink-700/50">
                <table className="w-full text-xs">
                  <thead className="text-steel-400">
                    <tr className="text-left border-b border-ink-700/50">
                      <th className="px-3 py-2 font-medium">Account</th>
                      <th className="px-3 py-2 font-medium">Risk budget</th>
                      <th className="px-3 py-2 font-medium">Fits</th>
                      <th className="px-3 py-2 font-medium">Scaling ceiling</th>
                      <th className="px-3 py-2 font-medium">Use</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sizing.map(({ account, budget, fit, scale, use }) => (
                      <tr key={account.id} className="border-b border-ink-700/30 last:border-0">
                        <td className="px-3 py-2 text-slate-200">{account.name}</td>
                        <td className="px-3 py-2 stat-value">{formatCurrency(budget)}</td>
                        <td className="px-3 py-2 stat-value">
                          {fit.belowMin ? 'below min lot' : `${fit.lots.toFixed(2)} lots`}
                        </td>
                        <td className="px-3 py-2 stat-value" title={scale.reason}>
                          {scale.lots.toFixed(2)} lots
                        </td>
                        <td className="px-3 py-2 stat-value text-accent-400">{use.toFixed(2)} lots</td>
                      </tr>
                    ))}
                    {sizing.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-3 text-steel-400">
                          No active accounts with lots and pip value set.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] text-steel-500">
                Use = smaller of what fits the risk budget and the scaling ceiling (hover for why). Budget is also capped
                at {BUFFER_RISK_CAP * 100}% of each account's remaining drawdown buffer.
              </p>
            </div>

            <div className="flex items-start gap-2.5 rounded-lg border border-ink-600/40 bg-ink-900/40 p-3">
              <AlertTriangle className="h-4 w-4 text-steel-400 mt-0.5 shrink-0" />
              <p className="text-[11px] text-steel-400 leading-relaxed">
                Rules come from a trading video; none are backtested here. Paste the journal tag into every trade note, then
                compare win rate and average R by score before trusting the gate. Data updated{' '}
                {state.status === 'ok' ? state.fetchedAt.toLocaleTimeString() : ''}. Not financial advice.
              </p>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}
