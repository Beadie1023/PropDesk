import { useMemo } from 'react';
import { CalendarDays, CheckCircle2, Coins, TrendingUp } from 'lucide-react';
import { Panel } from '@/components/ui';
import {
  checkConsistency,
  consistencyDisplayStatus,
  cumulativePayoutTotal,
  estimatePayout,
  firstWithdrawalStatus,
  formatCurrency,
  formatCurrencyShort,
  referencePeriodStatus,
  tradingDaysCompleted,
} from '@/lib/trading';
import type { Account, Trade } from '@/types';

const ACCOUNT_COLORS: Record<string, string> = {
  Ember: 'bg-accent-500',
};

const ACCOUNT_DOT: Record<string, string> = {
  Ember: 'text-accent-400',
};

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PayoutTracker({ accounts, trades }: { accounts: Account[]; trades: Trade[] }) {
  const estimates = useMemo(() => accounts.map((a) => estimatePayout(a, trades)), [accounts, trades]);
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
                Est. Payout Now (Net)
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
            return <PayoutAccountCard key={a.id} account={a} trades={trades} estimate={est} />;
          })}
        </div>
      </div>
    </Panel>
  );
}

function PayoutAccountCard({
  account,
  trades,
  estimate,
}: {
  account: Account;
  trades: Trade[];
  estimate: ReturnType<typeof estimatePayout> | undefined;
}) {
  const daysCompleted = tradingDaysCompleted(account.name, trades);
  const consistency = checkConsistency(account, trades);
  const status = consistencyDisplayStatus(consistency, daysCompleted);
  const referencePeriod = referencePeriodStatus(account);
  const firstWithdrawal = firstWithdrawalStatus(account.name, trades);

  const statusLabel =
    status === 'breached' ? 'Breached' : status === 'warning' ? 'Watch' : status === 'early' ? 'Building' : 'Safe';
  const statusColor =
    status === 'breached'
      ? 'text-bear-400'
      : status === 'warning'
        ? 'text-warn-400'
        : status === 'early'
          ? 'text-steel-400'
          : 'text-bull-400';

  const readyForPayout =
    daysCompleted >= account.minTradingDays &&
    !consistency.breached &&
    firstWithdrawal.eligible &&
    (estimate?.netProfit ?? 0) > 0;
  const daysToMin = Math.max(0, account.minTradingDays - daysCompleted);

  // Real average-based projection: extrapolates from this account's actual
  // average NET profit per trading day so far. Zero trading days so far
  // means zero basis to project from — shown as $0 rather than guessed.
  const avgDailyNetProfit = daysCompleted > 0 ? (estimate?.netProfit ?? 0) / daysCompleted : 0;
  const projected5Day = Math.max(avgDailyNetProfit, 0) * 5 * (account.profitSplit / 100);
  const projected20Day = Math.max(avgDailyNetProfit, 0) * 20 * (account.profitSplit / 100);

  // Today's session, from real logged trades only.
  const today = todayKey();
  const todayTrades = trades.filter((t) => t.account_name === account.name && t.trade_date === today);
  const todayProfit = todayTrades.reduce((sum, t) => sum + t.dollar_amount, 0);
  const todayWins = todayTrades.filter((t) => t.result === 'win').length;
  const todayWinRate = todayTrades.length > 0 ? (todayWins / todayTrades.length) * 100 : 0;

  const feesTotal = (estimate?.grossProfit ?? 0) - (estimate?.netProfit ?? 0);

  return (
    <div className="rounded-lg border border-ink-600/40 bg-ink-900/30 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${ACCOUNT_COLORS[account.name] ?? 'bg-accent-500'}`} />
        <span className="text-sm font-semibold text-slate-200">{account.name}</span>
        {readyForPayout ? (
          <span className="text-[11px] stat-value ml-auto flex items-center gap-1 text-bull-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Ready for payout
          </span>
        ) : (
          <span className={`text-[11px] stat-value ml-auto ${ACCOUNT_DOT[account.name] ?? 'text-accent-400'}`}>
            {estimate?.eligible ? 'Eligible' : 'Not yet eligible'}
          </span>
        )}
      </div>

      {/* Core payout figures — net drives the actual payable amount */}
      <div className="space-y-1.5 text-[11px] text-steel-400">
        <div className="flex justify-between">
          <span>Profit split</span>
          <span className="text-slate-300">{account.profitSplit}%</span>
        </div>
        <div className="flex justify-between">
          <span>Gross profit</span>
          <span className="text-slate-300">{formatCurrency(estimate?.grossProfit ?? 0)}</span>
        </div>
        <div className="flex justify-between">
          <span>Commission + swap</span>
          <span className="text-slate-300">{formatCurrency(-feesTotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-300 font-semibold">Net profit</span>
          <span className="stat-value text-slate-200 font-semibold">
            {formatCurrency(estimate?.netProfit ?? 0)}
          </span>
        </div>
        <div className="flex justify-between pt-1.5 border-t border-ink-700/40">
          <span>Est. payout now</span>
          <span className="stat-value text-accent-400">{formatCurrency(estimate?.splitAmount ?? 0)}</span>
        </div>
      </div>

      {/* Trading days progress */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] text-steel-400 uppercase tracking-wider">Trading Days</span>
          <span className="text-[11px] stat-value text-steel-300">
            {daysCompleted} / {account.minTradingDays}
          </span>
        </div>
        <div className="relative h-2 rounded-full bg-ink-900 overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-bull-500 transition-all duration-500"
            style={{ width: `${Math.min((daysCompleted / account.minTradingDays) * 100, 100)}%` }}
          />
        </div>
        {daysToMin > 0 && (
          <p className="text-[11px] text-steel-500 mt-1">{daysToMin} day{daysToMin === 1 ? '' : 's'} to minimum</p>
        )}
      </div>

      {/* Consistency */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] text-steel-400 uppercase tracking-wider">Consistency</span>
          <span className={`text-[11px] stat-value font-semibold ${statusColor}`}>{statusLabel}</span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-steel-500">
            Best day {formatCurrencyShort(consistency.maxDayProfit)} · Total{' '}
            {formatCurrencyShort(consistency.totalProfit)}
          </span>
          <span className={`stat-value ${statusColor}`}>
            {consistency.maxDayPercent > 0 ? `${consistency.maxDayPercent.toFixed(1)}%` : '—'} / {consistency.limit}%
          </span>
        </div>
      </div>

      {/* Reference period */}
      <div className="flex items-center justify-between text-[11px] pt-3 border-t border-ink-700/40">
        <span className="text-steel-400 uppercase tracking-wider">
          Reference Period <span className="text-steel-500 normal-case">(cycle {referencePeriod.cycleNumber})</span>
        </span>
        <span className="stat-value text-steel-300">
          {referencePeriod.daysRemaining}d left · ends {referencePeriod.cycleEndDate}
        </span>
      </div>

      {/* First withdrawal eligibility */}
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-steel-400 uppercase tracking-wider">First Withdrawal</span>
        {firstWithdrawal.firstTradeDate === null ? (
          <span className="stat-value text-steel-500">No trades logged yet</span>
        ) : firstWithdrawal.eligible ? (
          <span className="stat-value text-bull-400">Eligible since {firstWithdrawal.eligibleDate}</span>
        ) : (
          <span className="stat-value text-steel-300">
            {firstWithdrawal.daysRemaining}d left · eligible {firstWithdrawal.eligibleDate}
          </span>
        )}
      </div>

      {/* Today's session */}
      <div className="pt-3 border-t border-ink-700/40">
        <p className="text-[11px] text-steel-400 uppercase tracking-wider mb-1.5">Today</p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="stat-value text-sm font-semibold text-slate-200">{todayTrades.length}</p>
            <p className="text-[10px] text-steel-500">trades</p>
          </div>
          <div>
            <p className="stat-value text-sm font-semibold text-slate-200">
              {todayTrades.length > 0 ? `${todayWinRate.toFixed(0)}%` : '—'}
            </p>
            <p className="text-[10px] text-steel-500">win rate</p>
          </div>
          <div>
            <p className={`stat-value text-sm font-semibold ${todayProfit >= 0 ? 'text-bull-400' : 'text-bear-400'}`}>
              {todayTrades.length > 0 ? formatCurrency(todayProfit) : '—'}
            </p>
            <p className="text-[10px] text-steel-500">P&amp;L</p>
          </div>
        </div>
      </div>

      {/* Projections — derived from this account's own real net average, not a fixed hypothetical */}
      <div className="pt-3 border-t border-ink-700/40">
        <p className="text-[11px] text-steel-400 uppercase tracking-wider mb-1.5">
          Projected Net Payout <span className="text-steel-500 normal-case">(at current average)</span>
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-ink-900/50 p-2.5 text-center">
            <p className="stat-value text-sm font-semibold text-accent-400">{formatCurrency(projected5Day)}</p>
            <p className="text-[10px] text-steel-500">5 trading days</p>
          </div>
          <div className="rounded-lg bg-ink-900/50 p-2.5 text-center">
            <p className="stat-value text-sm font-semibold text-accent-400">{formatCurrency(projected20Day)}</p>
            <p className="text-[10px] text-steel-500">20 trading days</p>
          </div>
        </div>
      </div>
    </div>
  );
}
