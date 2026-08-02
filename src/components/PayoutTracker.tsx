import { useMemo } from 'react';
import { CalendarDays, Coins, TrendingUp } from 'lucide-react';
import { Panel } from '@/components/ui';
import {
  cumulativePayoutTotal,
  estimatePayout,
  formatCurrency,
} from '@/lib/trading';
import type { Account } from '@/types';

const ACCOUNT_COLORS: Record<string, string> = {
  Ember: 'bg-accent-500',
};

const ACCOUNT_DOT: Record<string, string> = {
  Ember: 'text-accent-400',
};

export function PayoutTracker({ accounts }: { accounts: Account[] }) {
  const estimates = useMemo(() => accounts.map(estimatePayout), [accounts]);
  const totalNet = useMemo(() => cumulativePayoutTotal(estimates), [estimates]);
  const eligibleCount = estimates.filter((e) => e.eligible).length;

  return (
    <Panel
      title="Payout Tracker"
      subtitle="On-demand payouts — no fixed schedule, request any time once eligible"
      icon={<CalendarDays className="h-5 w-5" />}
    >
      <div className="p-5 space-y-5">
        {/* Top stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-accent-500/20 bg-gradient-to-br from-accent-500/10 to-transparent p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <Coins className="h-4 w-4 text-accent-400" />
              <span className="text-xs font-semibold text-accent-400 uppercase tracking-wider">
                Estimated Payout If Requested Now
              </span>
            </div>
            <div className="stat-value text-2xl font-bold text-accent-400">
              {formatCurrency(totalNet)}
            </div>
          </div>
          <div className="rounded-xl border border-ink-600/40 bg-ink-900/40 p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <TrendingUp className="h-4 w-4 text-slate-300" />
              <span className="text-xs font-semibold text-steel-400 uppercase tracking-wider">
                Accounts Eligible
              </span>
            </div>
            <div className="stat-value text-2xl font-bold text-slate-100">
              {eligibleCount} / {accounts.length}
            </div>
          </div>
          <div className="rounded-xl border border-ink-600/40 bg-ink-900/40 p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <CalendarDays className="h-4 w-4 text-slate-300" />
              <span className="text-xs font-semibold text-steel-400 uppercase tracking-wider">
                Payout Schedule
              </span>
            </div>
            <div className="stat-value text-lg font-bold text-slate-100">
              On-Demand
            </div>
          </div>
        </div>

        {/* Per-account payout detail */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {accounts.map((a) => {
            const est = estimates.find((e) => e.accountId === a.id);
            return (
              <div
                key={a.id}
                className="rounded-lg border border-ink-600/40 bg-ink-900/30 p-4"
              >
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className={`h-2 w-2 rounded-full ${ACCOUNT_COLORS[a.name] ?? 'bg-accent-500'}`}
                  />
                  <span className="text-sm font-semibold text-slate-200">
                    {a.name}
                  </span>
                  <span className={`text-[11px] stat-value ml-auto ${ACCOUNT_DOT[a.name] ?? 'text-accent-400'}`}>
                    {est?.eligible ? 'Eligible' : 'Not yet eligible'}
                  </span>
                </div>
                <div className="space-y-1.5 text-[11px] text-steel-400">
                  <div className="flex justify-between">
                    <span>Profit split</span>
                    <span className="text-slate-300">{a.profitSplit}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Min trading days</span>
                    <span className="text-slate-300">{a.minTradingDays} days</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Consistency limit</span>
                    <span className="text-slate-300">{a.consistencyLimit}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Current profit</span>
                    <span className="text-slate-300">
                      {formatCurrency(est?.grossProfit ?? 0)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t border-ink-700/40">
                    <span>Est. payout now</span>
                    <span className="stat-value text-accent-400">
                      {formatCurrency(est?.splitAmount ?? 0)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}
