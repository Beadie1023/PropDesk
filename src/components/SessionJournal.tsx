import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Plus,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
  X,
} from 'lucide-react';
import { Panel } from '@/components/ui';
import { RR_OPTIONS, formatCurrency, formatPrice } from '@/lib/trading';
import { parseMT5Csv, type ParsedImportResult } from '@/lib/csvImport';
import type { Account, OrderType, Trade, TradeSetupPrefill } from '@/types';

export function SessionJournal({
  trades,
  accounts,
  onAddTrade,
  onDeleteTrade,
  onImportTrades,
  setupPrefill,
  onSetupPrefillConsumed,
}: {
  trades: Trade[];
  accounts: Account[];
  onAddTrade: (trade: Omit<Trade, 'id'>) => Promise<void>;
  onDeleteTrade: (id: string) => Promise<void>;
  onImportTrades: (trades: Omit<Trade, 'id'>[], accountId: string) => Promise<void>;
  // Set when the trader clicks "Log This Trade" on the chart — opens
  // the Add Trade form pre-filled with the setup shown there.
  setupPrefill?: TradeSetupPrefill | null;
  onSetupPrefillConsumed?: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [importResult, setImportResult] = useState<ParsedImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (setupPrefill) setShowForm(true);
  }, [setupPrefill]);

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

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setImportResult(parseMT5Csv(text));
    };
    reader.readAsText(file);
  };

  return (
    <Panel
      title="Session Journal"
      subtitle="Trade log with running win rate and P&L analytics"
      icon={<BookOpen className="h-5 w-5" />}
      action={
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileSelected}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn-ghost"
          >
            <Upload className="h-4 w-4" />
            Import MT5 CSV
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary"
          >
            <Plus className="h-4 w-4" />
            Log Trade
          </button>
        </div>
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
              <th className="text-right font-medium px-3 py-3">Close</th>
              <th className="text-right font-medium px-3 py-3">Lots</th>
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
                <td colSpan={15} className="text-center py-12 text-steel-400 text-sm">
                  No trades logged yet. Click "Log Trade" or "Import MT5 CSV" to add your first entry.
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
                  {trade.source === 'mt5_import' ? '—' : trade.rr_used}
                </td>
                <td className="px-3 py-3 text-right stat-value text-slate-300">
                  {formatPrice(trade.entry_price)}
                </td>
                <td className="px-3 py-3 text-right stat-value text-slate-300">
                  {trade.close_price !== undefined ? formatPrice(trade.close_price) : '—'}
                </td>
                <td className="px-3 py-3 text-right stat-value text-slate-300">
                  {trade.lots !== undefined ? trade.lots.toFixed(2) : '—'}
                </td>
                <td className="px-3 py-3 text-right stat-value text-bear-400/80">
                  {trade.source === 'mt5_import' ? '—' : formatPrice(trade.sl)}
                </td>
                <td className="px-3 py-3 text-right stat-value text-bull-400/80">
                  {trade.source === 'mt5_import' ? '—' : formatPrice(trade.tp1)}
                </td>
                <td className="px-3 py-3 text-right stat-value text-bull-400/80">
                  {trade.source === 'mt5_import' ? '—' : formatPrice(trade.tp2)}
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
          prefill={setupPrefill}
          onClose={() => {
            setShowForm(false);
            onSetupPrefillConsumed?.();
          }}
          onSubmit={async (trade) => {
            await onAddTrade(trade);
            setShowForm(false);
            onSetupPrefillConsumed?.();
          }}
        />
      )}

      {importResult && (
        <ImportCsvModal
          result={importResult}
          accounts={accounts}
          onClose={() => setImportResult(null)}
          onConfirm={async (accountId, accountName) => {
            const tradesWithAccount = importResult.trades.map((t) => ({
              ...t,
              account_name: accountName,
            }));
            await onImportTrades(tradesWithAccount, accountId);
            setImportResult(null);
          }}
        />
      )}
    </Panel>
  );
}

function ImportCsvModal({
  result,
  accounts,
  onClose,
  onConfirm,
}: {
  result: ParsedImportResult;
  accounts: Account[];
  onClose: () => void;
  onConfirm: (accountId: string, accountName: string) => Promise<void>;
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [importing, setImporting] = useState(false);

  const netProfit = result.trades.reduce((s, t) => s + t.dollar_amount, 0);
  const selectedAccount = accounts.find((a) => a.id === accountId);

  const handleConfirm = async () => {
    if (!selectedAccount || result.trades.length === 0) return;
    setImporting(true);
    await onConfirm(selectedAccount.id, selectedAccount.name);
    setImporting(false);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/80 backdrop-blur-sm p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-ink-600/60 bg-ink-850 shadow-2xl animate-slideIn"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-700/50">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-700/60 text-accent-400">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Import MT5 CSV</h3>
              <p className="text-xs text-steel-400">Review before adding to the journal</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-steel-400 hover:text-slate-100 hover:bg-ink-700/60 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {result.trades.length > 0 ? (
            <div className="flex items-start gap-2.5 rounded-lg border border-bull-500/30 bg-bull-500/10 p-3.5">
              <CheckCircle2 className="h-4 w-4 text-bull-400 mt-0.5 shrink-0" />
              <p className="text-xs text-bull-300 leading-relaxed">
                Parsed <span className="stat-value font-semibold">{result.trades.length}</span> trade
                {result.trades.length === 1 ? '' : 's'} · net{' '}
                <span className="stat-value font-semibold">{formatCurrency(netProfit)}</span>
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 rounded-lg border border-bear-500/30 bg-bear-500/10 p-3.5">
              <AlertTriangle className="h-4 w-4 text-bear-400 mt-0.5 shrink-0" />
              <p className="text-xs text-bear-300 leading-relaxed">
                No importable trades found in this file.
              </p>
            </div>
          )}

          {result.skippedRows > 0 && (
            <div className="flex items-start gap-2.5 rounded-lg border border-warn-500/30 bg-warn-500/10 p-3.5">
              <AlertTriangle className="h-4 w-4 text-warn-400 mt-0.5 shrink-0" />
              <p className="text-xs text-warn-300 leading-relaxed">
                Skipped {result.skippedRows} row{result.skippedRows === 1 ? '' : 's'} (headers, balance
                operations, or rows that couldn't be parsed).
              </p>
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="rounded-lg border border-ink-600/40 bg-ink-900/40 p-3 max-h-32 overflow-y-auto scrollbar-thin">
              {result.errors.map((err, i) => (
                <p key={i} className="text-[11px] text-steel-500 leading-relaxed">
                  {err}
                </p>
              ))}
            </div>
          )}

          {result.trades.length > 0 && (
            <Field label="Import Into Account">
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="input-field"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-ink-700/50">
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={result.trades.length === 0 || !accountId || importing}
            className="btn-primary"
          >
            {importing ? 'Importing…' : `Import ${result.trades.length} Trade${result.trades.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
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
  dollar_amount: '', // gross P&L, before commission/swap
  commission: '', // optional — negative for a fee, e.g. -0.05
  swap: '', // optional — can be positive or negative
  notes: '',
  account_name: '',
  // Optional — power the Order Types / Intraday / Duration stats.
  // Left blank, these trades just get excluded from those specific
  // breakdowns rather than skewing them.
  order_type: '' as '' | OrderType,
  entry_time: '', // HH:MM, paired with trade_date to build open_time
  exit_time: '', // HH:MM, paired with trade_date to build close_time
};

function AddTradeModal({
  accounts,
  prefill,
  onClose,
  onSubmit,
}: {
  accounts: Account[];
  prefill?: TradeSetupPrefill | null;
  onClose: () => void;
  onSubmit: (trade: Omit<Trade, 'id'>) => Promise<void>;
}) {
  const [form, setForm] = useState(() =>
    prefill
      ? {
          ...EMPTY_FORM,
          trade_date: prefill.trade_date,
          pair: prefill.pair,
          direction: prefill.direction,
          rr_used: prefill.rr_used,
          entry_price: prefill.entry_price.toFixed(5),
          sl: prefill.sl.toFixed(5),
          tp1: prefill.tp1.toFixed(5),
        }
      : { ...EMPTY_FORM },
  );
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
    // Combine the trade date with the optional HH:MM time-of-day inputs
    // into full ISO datetimes — same shape the MT5 importer produces —
    // so manually-logged trades can feed Intraday/Duration stats too.
    // Left undefined when no time was entered, not defaulted to
    // midnight, so those trades are correctly excluded rather than
    // silently miscounted into the 00:00 hour.
    const open_time = form.entry_time ? `${form.trade_date}T${form.entry_time}:00Z` : undefined;
    const close_time = form.exit_time ? `${form.trade_date}T${form.exit_time}:00Z` : undefined;

    const commission = form.commission ? parseFloat(form.commission) : 0;
    const swap = form.swap ? parseFloat(form.swap) : 0;
    // dollar_amount is the account's actual balance impact (gross P&L +
    // commission + swap) — matching upcomers.com's Balance line, not
    // just the raw Profit line — so this figure reconciles with the
    // broker statement and every downstream stat (drawdown, consistency,
    // payout estimate) reflects real account movement.
    const balanceImpact = parseFloat(form.dollar_amount) + commission + swap;

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
      dollar_amount: balanceImpact,
      notes: form.notes.trim(),
      account_name: form.account_name,
      order_type: form.order_type || undefined,
      commission: form.commission ? commission : undefined,
      swap: form.swap ? swap : undefined,
      open_time,
      close_time,
    });
    setSubmitting(false);
  };

  return createPortal(
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
          {prefill && (
            <div className="flex items-start gap-2.5 rounded-lg border border-accent-500/30 bg-accent-500/10 p-3.5">
              <Target className="h-4 w-4 text-accent-400 mt-0.5 shrink-0" />
              <p className="text-xs text-accent-300 leading-relaxed">
                Pre-filled from the chart's active setup. Come back and fill in{' '}
                <span className="font-semibold">Result</span> and{' '}
                <span className="font-semibold">P&amp;L</span> once the trade closes.
              </p>
            </div>
          )}
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
            <Field label="Order Type (optional)">
              <select
                value={form.order_type}
                onChange={(e) => set('order_type', e.target.value as typeof form.order_type)}
                className="input-field"
              >
                <option value="">— Unspecified —</option>
                <option value="market">Market</option>
                <option value="limit">Limit</option>
                <option value="stop">Stop</option>
              </select>
            </Field>
            <Field label="Entry Time (optional)">
              <input
                type="time"
                value={form.entry_time}
                onChange={(e) => set('entry_time', e.target.value)}
                className="input-field"
              />
            </Field>
            <Field label="Exit Time (optional)">
              <input
                type="time"
                value={form.exit_time}
                onChange={(e) => set('exit_time', e.target.value)}
                className="input-field"
              />
            </Field>
          </div>

          <div className="grid grid-cols-4 gap-4">
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
            <Field label="Gross P&L ($)">
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
            <Field label="Commission (optional)">
              <input
                type="number"
                step="0.01"
                value={form.commission}
                onChange={(e) => set('commission', e.target.value)}
                placeholder="-0.05"
                className="input-field"
              />
            </Field>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <Field label="Swap (optional)">
              <input
                type="number"
                step="0.01"
                value={form.swap}
                onChange={(e) => set('swap', e.target.value)}
                placeholder="0.00"
                className="input-field"
              />
            </Field>
            {(form.commission || form.swap) && form.dollar_amount && (
              <div className="col-span-3 flex items-center justify-between rounded-lg bg-ink-900/60 border border-ink-700/40 px-4">
                <span className="text-xs text-steel-400">
                  Balance Impact (Gross + Commission + Swap) — this is what gets saved
                </span>
                <span
                  className={`stat-value text-sm font-bold ${
                    parseFloat(form.dollar_amount) + (parseFloat(form.commission) || 0) + (parseFloat(form.swap) || 0) >= 0
                      ? 'text-bull-400'
                      : 'text-bear-400'
                  }`}
                >
                  {formatCurrency(
                    parseFloat(form.dollar_amount) + (parseFloat(form.commission) || 0) + (parseFloat(form.swap) || 0),
                  )}
                </span>
              </div>
            )}
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
    </div>,
    document.body,
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
