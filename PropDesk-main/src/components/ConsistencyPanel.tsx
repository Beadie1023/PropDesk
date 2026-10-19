import { AlertTriangle, CheckCircle, ShieldCheck } from 'lucide-react';
import { Panel } from '@/components/ui';
import { checkConsistency, formatCurrency } from '@/lib/trading';
import type { Account, Trade } from '@/types';

export function ConsistencyPanel({ accounts, trades }: { accounts: Account[]; trades: Trade[] }) {
  return (
    <Panel
      title="Consistency Tracker"
      subtitle="Best single day vs. total net profit, against each account's real consistency limit"
      icon={<ShieldCheck className="h-5 w-5" />}
    >
      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {accounts.map((account) => (
          <ConsistencyCard key={account.id} account={account} trades={trades} />
        ))}
      </div>
    </Panel>
  );
}

function ConsistencyCard({ account, trades }: { account: Account; trades: Trade[] }) {
  const check = checkConsistency(account, trades);

  const scoreColor = check.breached
    ? 'text-bear-400'
    : check.maxDayPercent > check.limit - 5
      ? 'text-warn-400'
      : 'text-bull-400';

  const borderColor = check.breached
    ? 'border-bear-500/60'
    : check.maxDayPercent > check.limit - 5
      ? 'border-warn-500/60'
      : 'border-bull-500/30';

  const barColor = check.breached ? 'bg-bear-500' : check.maxDayPercent > check.limit - 5 ? 'bg-warn-500' : 'bg-bull-500';

  return (
    <div className={`rounded-xl border p-4 bg-ink-800/50 transition-all duration-300 ${borderColor}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-slate-100">{account.name}</span>
        <span className="text-[11px] text-steel-500">
          {account.firm} · {account.consistencyLimit}% Cap
        </span>
      </div>

      {/* Violation Banner */}
      {check.breached && (
        <div className="flex items-center gap-2 bg-bear-500/10 border border-bear-500/30 rounded-lg p-3 mb-4">
          <AlertTriangle className="h-4 w-4 text-bear-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-bear-300">Consistency Rule Violated</p>
            <p className="text-[11px] text-bear-400/70 mt-0.5">
              Best day exceeds {account.consistencyLimit}% of net profit — payout may be rejected
            </p>
          </div>
        </div>
      )}

      {/* Score Display */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-ink-900/60 rounded-lg p-3 text-center">
          <p className="text-[10px] text-steel-500 uppercase tracking-wide mb-1">Best Day</p>
          <p className={`stat-value text-lg font-bold ${scoreColor}`}>{formatCurrency(check.maxDayProfit)}</p>
          <p className="text-[10px] text-steel-600 mt-0.5">{check.maxDayDate ?? '—'}</p>
        </div>

        <div className="bg-ink-900/60 rounded-lg p-3 text-center">
          <p className="text-[10px] text-steel-500 uppercase tracking-wide mb-1">Score</p>
          <p className={`stat-value text-lg font-bold ${scoreColor}`}>
            {check.maxDayPercent > 0 ? `${check.maxDayPercent.toFixed(1)}%` : '—'}
          </p>
          <p className="text-[10px] text-steel-600 mt-0.5">of net profit</p>
        </div>

        <div className="bg-ink-900/60 rounded-lg p-3 text-center">
          <p className="text-[10px] text-steel-500 uppercase tracking-wide mb-1">Total Net</p>
          <p className="stat-value text-lg font-bold text-steel-300">{formatCurrency(check.totalProfit)}</p>
          <p className="text-[10px] text-steel-600 mt-0.5">all days</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div>
        <div className="flex justify-between text-[10px] text-steel-500 mb-1">
          <span>Consistency Usage</span>
          <span>
            {check.maxDayPercent.toFixed(1)}% / {check.limit}% cap
          </span>
        </div>
        <div className="h-2 bg-ink-900 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${Math.min(check.maxDayPercent, 100)}%` }}
          />
        </div>
        {!check.breached && check.totalProfit > 0 && (
          <div className="flex items-center gap-1 mt-2">
            <CheckCircle className="h-3 w-3 text-bull-400" />
            <span className="text-[10px] text-bull-400">Within {account.firm} consistency rules</span>
          </div>
        )}
      </div>
    </div>
  );
}
