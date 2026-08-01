import { useMemo } from 'react';
import { LayoutGrid } from 'lucide-react';
import { Panel, StatusBadge, StatusDot } from '@/components/ui';
import {
  drawdownPct,
  formatCurrency,
  formatCurrencyShort,
  riskStatus,
} from '@/lib/trading';
import type { Account } from '@/types';

export function AccountDashboard({ accounts }: { accounts: Account[] }) {
  const portfolioPnl = useMemo(
    () => accounts.reduce((sum, a) => sum + a.daily_pnl, 0),
    [accounts],
  );

  return (
    <Panel
      title="Account Dashboard"
      subtitle="Live balance, daily P&L and drawdown across four funded accounts"
      icon={<LayoutGrid className="h-5 w-5" />}
      action={
        <div className="flex items-center gap-2 rounded-lg bg-ink-900/70 border border-ink-600/50 px-3 py-1.5">
          <span className="text-xs text-steel-400">Portfolio Today</span>
          <span
            className={`stat-value text-sm font-semibold ${
              portfolioPnl >= 0 ? 'text-bull-400' : 'text-bear-400'
            }`}
          >
            {portfolioPnl >= 0 ? '+' : '-'}{formatCurrencyShort(Math.abs(portfolioPnl))}
          </span>
        </div>
      }
    >
      <div className="p-5 grid grid-cols-4 gap-4">
        {accounts.map((account) => (
          <AccountCard key={account.id} account={account} />
        ))}
      </div>
    </Panel>
  );
}

function AccountCard({ account }: { account: Account }) {
  const status = riskStatus(account.daily_pnl, account.daily_loss_limit);
  const ddPct = drawdownPct(account.daily_pnl, account.daily_loss_limit);
  const usedAmount = Math.min(Math.abs(account.daily_pnl), account.daily_loss_limit);
  const remaining = Math.max(account.daily_loss_limit - usedAmount, 0);
  const pnlPositive = account.daily_pnl >= 0;

  const barColor =
    status === 'red'
      ? 'bg-bear-500'
      : status === 'yellow'
        ? 'bg-warn-500'
        : 'bg-bull-500';

  const cardBorder =
    status === 'red'
      ? 'border-bear-500/40 shadow-glow-bear'
      : status === 'yellow'
        ? 'border-warn-500/40 shadow-glow-warn'
        : 'border-ink-700/60';

  return (
    <div
      className={`relative overflow-hidden rounded-xl border ${cardBorder} bg-ink-800/50 p-4 transition hover:bg-ink-750/50`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">{account.name}</h3>
          <p className="text-[11px] text-steel-500 mt-0.5">
            {account.lots.toFixed(2)} lots · ${account.pip_value.toFixed(2)}/pip
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Balance */}
      <div className="mb-4">
        <p className="text-[11px] text-steel-400 uppercase tracking-wider mb-1">
          Current Balance
        </p>
        <div className="flex items-baseline gap-2">
          <span className="stat-value text-2xl font-bold text-slate-50">
            {formatCurrency(account.balance)}
          </span>
          <span className="text-xs text-steel-500">
            / {formatCurrencyShort(account.starting_balance)}
          </span>
        </div>
      </div>

      {/* Daily P&L */}
      <div className="mb-4">
        <p className="text-[11px] text-steel-400 uppercase tracking-wider mb-1">
          Daily P&amp;L
        </p>
        <div
          className={`stat-value text-lg font-semibold ${
            pnlPositive ? 'text-bull-400' : 'text-bear-400'
          }`}
        >
          {pnlPositive ? '+' : '-'}{formatCurrency(Math.abs(account.daily_pnl))}
        </div>
      </div>

      {/* Drawdown meter */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] text-steel-400 uppercase tracking-wider">
            Drawdown
          </span>
          <span className="text-[11px] stat-value text-steel-300">
            {ddPct.toFixed(0)}% / 100%
          </span>
        </div>
        <div className="relative h-2.5 rounded-full bg-ink-900 overflow-hidden">
          <div
            className={`absolute inset-y-0 left-0 rounded-full ${barColor} transition-all duration-500`}
            style={{ width: `${ddPct}%` }}
          />
          {/* 75% threshold marker */}
          <div className="absolute inset-y-0 left-[75%] w-px bg-ink-950/80" />
        </div>
        <div className="flex items-center justify-between mt-2 text-[11px]">
          <span className="text-steel-500">
            Limit {formatCurrencyShort(account.daily_loss_limit)}
          </span>
          <span
            className={`stat-value ${
              remaining <= 0 ? 'text-bear-400' : 'text-steel-400'
            }`}
          >
            {remaining <= 0 ? 'Exhausted' : `${formatCurrencyShort(remaining)} left`}
          </span>
        </div>
      </div>
    </div>
  );
}
