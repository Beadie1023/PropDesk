import { useMemo, useState } from 'react';
import {
  BookOpen,
  Plus,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { Panel } from '@/components/ui';
import { RR_OPTIONS, formatCurrency, formatPrice } from '@/lib/trading';
import type { Account, Trade } from '@/types';

export function SessionJournal({
  trades,
  accounts,
  onAddTrade,
  onDeleteTrade,
}: {
  trades: Trade[];
  accounts: Account[];
  onAddTrade: (trade: Omit<Trade, 'id'>) => Promise<void>;
  onDeleteTrade: (id: string) => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);

  const stats = useMemo(() => {
    const wins = trades.filter((t) => t.result === 'win');
    const losses = trades.filter((t) => t.result === 'loss');
    const totalPnl = trades.reduce((s, t) => s + t.dollar_amount, 0);
    const winRate =
      trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
    const grossWin = wins.reduce((s, t) => s + t.dollar_amount, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.dollar_amount, 0));
    const avgWin = wins.length > 0 ? grossWin / wins.length : 0;
    const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
    return {
      total: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate,
      totalPnl,
      grossWin,
      grossLoss,
      avgWin,
      avgLoss,
      profitFactor,
    };
  }, [trades]);

  return (
    <Panel
      title="Session Journal"
      subtitle="Trade log with running win rate and P&L analytics"
      icon={<BookOpen className="h-5 w-5" />}
      action={
        <button
          onClick={() => setShowForm(true)}
          className="btn-primary"
        >
          <Plus className="h-4 w-4" />
          Log Trade
        </button>
      }
    >
      {/* Summary stats */}
      <div className="grid grid-cols-6 gap-px bg-ink-700/40 border-b border-ink-700/50">
        <StatCell
          label="Total P&L"
          value={`${stats.totalPnl >= 0 ? '+' : '-'}${formatCurrency(Math.abs(stats.totalPnl))}`}
          tone={stats.totalPnl >= 0 ? 'bull' : 'bear'}
          big
        />
        <StatCell
          label="Win Rate"
          value={`${stats.winRate.toFixed(1)}%`}
          tone={stats.winRate >= 50 ? 'bull' : 'bear'}
          big
        />
        <StatCell label="Trades" value={String(stats.total)} />
        <StatCell label="Wins" value={String(stats.wins)} tone="bull" />
        <StatCell label="Losses" value={String(stats.losses)} tone="bear" />
        <StatCell
          label="Profit Factor"
          value={
            stats.profitFactor === Infinity
              ? '∞'
              : stats.profitFactor.toFixed(2)
          }
          tone={stats.profitFactor >= 1 ? 'bull' : 'bear'}
        />
      </div>

      {/* Trade table */}
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-ink-900/60 text-steel-400 text-xs uppercase tracking-wider sticky top-0">
              <th className="text-left font-medium px-4 py-3">Date</th>
              <th className="text-left font-medium px-3 py-3">Pair</th>
              <th className="text-left font-medium px-3 py-3">Dir</th>
              <th className="text-center font-medium px-3 py-3">R:R</th>
              <th className="text-right font-medium px-3 py-3">Entry</th>
              <th className="text-right font-medium px-3 py-3">SL</th>
              <th className="text-right font-medium px-3 py-3">TP1</th>
              <th className="text-right font-medium px-3 py-3">TP2</th>
              <th className="text-center font-medium px-3 py-3">Result</th>
              <th className="text-right font-medium px-3 py-3">P&amp;L</th>
              <th className="text-left font-medium px-3 py-3">Account</th>
              <th className="text-left font-medium px-3 py-3">Notes</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-700/40">
            {trades.length === 0 && (
              <tr>
                <td colSpan={13} className="text-center py-12 text-steel-400 text-sm">
                  No trades logged yet. Click "Log Trade" to add your first entry.
                </td>
              </tr>
            )}
            {trades.map((trade) => (
              <tr
                key={trade.id}
                className="hover:bg-ink-800/40 transition group"
              >
                <td className="px-4 py-3 stat-value text-slate-300 whitespace-nowrap">
                  {new Date(trade.trade_date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </td>
                <td className="px-3 py-3 font-semibold text-slate-100">
                  {trade.pair}
                </td>
                <td className="px-3 py-3">
                  <span
                    className={`chip ${
                      trade.direction === 'long'
                        ? 'bg-bull-500/15 text-bull-400'
                        : 'bg-bear-500/15 text-bear-400'
                    }`}
                  >
                    {trade.direction === 'long' ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {trade.direction.toUpperCase()}
                  </span>
                </td>
                <td className="px-3 py-3 text-center stat-value text-slate-300">
                  {trade.rr_used}
                </td>
                <td className="px-3 py-3 text-right stat-value text-slate-300">
                  {formatPrice(trade.entry_price)}
                </td>
                <td className="px-3 py-3 text-right stat-value text-bear-400/80">
                  {formatPrice(trade.sl)}
                </td>
                <td className="px-3 py-3 text-right stat-value text-bull-400/80">
                  {formatPrice(trade.tp1)}
                </td>
                <td className="px-3 py-3 text-right stat-value text-bull-400/80">
                  {formatPrice(trade.tp2)}
                </td>
                <td className="px-3 py-3 text-center">
                  <span
                    className={`chip ${
                      trade.result === 'win'
                        ? 'bg-bull-500/15 text-bull-400'
                        : 'bg-bear-500/15 text-bear-400'
                    }`}
                  >
                    {trade.result.toUpperCase()}
                  </span>
                </td>
                <td
                  className={`px-3 py-3 text-right stat-value font-semibold ${
                    trade.dollar_amount >= 0 ? 'text-bull-400' : 'text-bear-400'
                  }`}
                >
                  {trade.dollar_amount >= 0 ? '+' : '-'}{formatCurrency(Math.abs(trade.dollar_amount))}
                </td>
                <td className="px-3 py-3 text-xs text-steel-400 whitespace-nowrap">
                  {trade.account_name || '—'}
                </td>
                <td className="px-3 py-3 text-xs text-steel-400 max-w-[220px] truncate">
                  {trade.notes || '—'}
                </td>
                <td className="px-3 py-3 text-right">
                  <button
                    onClick={() => onDeleteTrade(trade.id)}
                    className="opacity-0 group-hover:opacity-100 text-steel-500 hover:text-bear-400 transition"
                    title="Delete trade"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <AddTradeModal
          accounts={accounts}
          onClose={() => setShowForm(false)}
          onSubmit={async (trade) => {
            await onAddTrade(trade);
            setShowForm(false);
          }}
        />
      )}
    </Panel>
  );
}

function StatCell({
  label,
  value,
  tone,
  big = false,
}: {
  label: string;
  value: string;
  tone?: 'bull' | 'bear';
  big?: boolean;
}) {
  const color =
    tone === 'bull'
      ? 'text-bull-400'
      : tone === 'bear'
        ? 'text-bear-400'
        : 'text-slate-100';
  return (
    <div className="bg-ink-850/60 px-4 py-3.5">
      <p className="text-[11px] text-steel-400 uppercase tracking-wider mb-1">
        {label}
      </p>
      <p
        className={`stat-value font-semibold ${color} ${big ? 'text-xl' : 'text-base'}`}
      >
        {value}
      </p>
    </div>
  );
}

const EMPTY_FORM = {
  trade_date: new Date().toISOString().slice(0, 10),
  pair: '',
  direction: 'long' as 'long' | 'short',
  rr_used: '1:3',
  entry_price: '',
  sl: '',
  tp1: '',
  tp2: '',
  result: 'win' as 'win' | 'loss',
  dollar_amount: '',
  notes: '',
  account_name: '',
};

function AddTradeModal({
  accounts,
  onClose,
  onSubmit,
}: {
  accounts: Account[];
  onClose: () => void;
  onSubmit: (trade: Omit<Trade, 'id'>) => Promise<void>;
}) {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const canSubmit =
    form.pair.trim() &&
    form.entry_price &&
    form.sl &&
    form.tp1 &&
    form.tp2 &&
    form.dollar_amount;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    await onSubmit({
      trade_date: form.trade_date,
      pair: form.pair.trim().toUpperCase(),
      direction: form.direction,
      rr_used: form.rr_used,
      entry_price: parseFloat(form.entry_price),
      sl: parseFloat(form.sl),
      tp1: parseFloat(form.tp1),
      tp2: parseFloat(form.tp2),
      result: form.result,
      dollar_amount: parseFloat(form.dollar_amount),
      notes: form.notes.trim(),
      account_name: form.account_name,
    });
    setSubmitting(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/80 backdrop-blur-sm p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-ink-600/60 bg-ink-850 shadow-2xl animate-slideIn"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-700/50">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-700/60 text-accent-400">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Log a Trade</h3>
              <p className="text-xs text-steel-400">
                Record entry, exits, result and notes
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-steel-400 hover:text-slate-100 hover:bg-ink-700/60 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-3 gap-4">
            <Field label="Date">
              <input
                type="date"
                value={form.trade_date}
                onChange={(e) => set('trade_date', e.target.value)}
                className="input-field"
              />
            </Field>
            <Field label="Pair">
              <input
                type="text"
                value={form.pair}
                onChange={(e) => set('pair', e.target.value)}
                placeholder="EUR/USD"
                className="input-field"
              />
            </Field>
            <Field label="Account">
              <select
                value={form.account_name}
                onChange={(e) => set('account_name', e.target.value)}
                className="input-field"
              >
                <option value="">— Select —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.name}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <Field label="Direction">
              <div className="flex gap-1.5">
                {(['long', 'short'] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => set('direction', d)}
                    className={`flex-1 rounded-lg px-3 py-2.5 text-xs font-semibold uppercase transition ${
                      form.direction === d
                        ? d === 'long'
                          ? 'bg-bull-500/20 text-bull-400 border border-bull-500/40'
                          : 'bg-bear-500/20 text-bear-400 border border-bear-500/40'
                        : 'bg-ink-900 text-steel-400 border border-ink-600/50 hover:text-slate-200'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="R:R Used">
              <select
                value={form.rr_used}
                onChange={(e) => set('rr_used', e.target.value)}
                className="input-field"
              >
                {RR_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Result">
              <div className="flex gap-1.5">
                {(['win', 'loss'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => set('result', r)}
                    className={`flex-1 rounded-lg px-3 py-2.5 text-xs font-semibold uppercase transition ${
                      form.result === r
                        ? r === 'win'
                          ? 'bg-bull-500/20 text-bull-400 border border-bull-500/40'
                          : 'bg-bear-500/20 text-bear-400 border border-bear-500/40'
                        : 'bg-ink-900 text-steel-400 border border-ink-600/50 hover:text-slate-200'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="P&L ($)">
              <input
                type="number"
                step="0.01"
                value={form.dollar_amount}
                onChange={(e) => set('dollar_amount', e.target.value)}
                placeholder="120.00"
                className={`input-field ${
                  form.result === 'loss' ? 'text-bear-400' : 'text-bull-400'
                }`}
              />
            </Field>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <Field label="Entry Price">
              <input
                type="number"
                step="0.0001"
                value={form.entry_price}
                onChange={(e) => set('entry_price', e.target.value)}
                placeholder="1.0850"
                className="input-field"
              />
            </Field>
            <Field label="Stop Loss">
              <input
                type="number"
                step="0.0001"
                value={form.sl}
                onChange={(e) => set('sl', e.target.value)}
                placeholder="1.0840"
                className="input-field text-bear-400"
              />
            </Field>
            <Field label="TP1">
              <input
                type="number"
                step="0.0001"
                value={form.tp1}
                onChange={(e) => set('tp1', e.target.value)}
                placeholder="1.0870"
                className="input-field text-bull-400"
              />
            </Field>
            <Field label="TP2">
              <input
                type="number"
                step="0.0001"
                value={form.tp2}
                onChange={(e) => set('tp2', e.target.value)}
                placeholder="1.0880"
                className="input-field text-bull-400"
              />
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Setup, session, observations…"
              rows={2}
              className="input-field resize-none font-sans"
            />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-ink-700/50">
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="btn-primary"
          >
            {submitting ? 'Saving…' : 'Save Trade'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-steel-400 mb-2 uppercase tracking-wider">
        {label}
      </label>
      {children}
    </div>
  );
}
