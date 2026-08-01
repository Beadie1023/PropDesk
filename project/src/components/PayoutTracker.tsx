import { useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Coins,
  TrendingUp,
} from 'lucide-react';
import { Panel } from '@/components/ui';
import {
  addDays,
  cumulativeTotal,
  dayNumber,
  formatDate,
  formatCurrency,
  generatePayouts,
  isWeekend,
  monthName,
} from '@/lib/trading';
import type { Account, PayoutEntry } from '@/types';

const ACCOUNT_COLORS: Record<string, string> = {
  Ember: 'bg-accent-500',
  'Alpha Capital': 'bg-sky-500',
  'Blue Guardian': 'bg-cyan-500',
  'FundedNext': 'bg-amber-500',
};

const ACCOUNT_DOT: Record<string, string> = {
  Ember: 'text-accent-400',
  'Alpha Capital': 'text-sky-400',
  'Blue Guardian': 'text-cyan-400',
  'FundedNext': 'text-amber-400',
};

export function PayoutTracker({ accounts }: { accounts: Account[] }) {
  const startDate = useMemo(() => new Date('2026-08-04'), []);
  const [viewMonth, setViewMonth] = useState(new Date('2026-08-01'));

  const allPayouts = useMemo(
    () => generatePayouts(accounts, startDate, 90),
    [accounts, startDate],
  );

  const totalNet = useMemo(() => cumulativeTotal(allPayouts), [allPayouts]);

  const payoutsByDate = useMemo(() => {
    const map = new Map<string, PayoutEntry[]>();
    for (const p of allPayouts) {
      const key = p.date.toDateString();
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    return map;
  }, [allPayouts]);

  const calendarDays = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startPad = firstOfMonth.getDay();
    const start = addDays(firstOfMonth, -startPad);
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) days.push(addDays(start, i));
    return days;
  }, [viewMonth]);

  const rangeStart = startDate;
  const rangeEnd = addDays(startDate, 90);

  const payoutsThisMonth = useMemo(
    () =>
      allPayouts.filter((p) => {
        const m = p.date.getMonth();
        const y = p.date.getFullYear();
        return m === viewMonth.getMonth() && y === viewMonth.getFullYear();
      }),
    [allPayouts, viewMonth],
  );

  const monthNet = useMemo(
    () => payoutsThisMonth.reduce((s, p) => s + p.net, 0),
    [payoutsThisMonth],
  );

  const monthLabel = viewMonth.toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const goPrevMonth = () =>
    setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const goNextMonth = () =>
    setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  return (
    <Panel
      title="Payout Tracker"
      subtitle="90-day projection starting Aug 4, 2026"
      icon={<CalendarDays className="h-5 w-5" />}
      action={
        <div className="flex items-center gap-2">
          <button
            onClick={goPrevMonth}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-700/50 border border-ink-600/50 text-steel-400 hover:text-slate-100 hover:bg-ink-600/60 transition"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-slate-100 min-w-[140px] text-center">
            {monthLabel}
          </span>
          <button
            onClick={goNextMonth}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-700/50 border border-ink-600/50 text-steel-400 hover:text-slate-100 hover:bg-ink-600/60 transition"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      }
    >
      <div className="p-5 space-y-5">
        {/* Top stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-accent-500/20 bg-gradient-to-br from-accent-500/10 to-transparent p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <Coins className="h-4 w-4 text-accent-400" />
              <span className="text-xs font-semibold text-accent-400 uppercase tracking-wider">
                90-Day Cumulative Net
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
                This Month ({monthName(viewMonth)})
              </span>
            </div>
            <div className="stat-value text-2xl font-bold text-slate-100">
              {formatCurrency(monthNet)}
            </div>
          </div>
          <div className="rounded-xl border border-ink-600/40 bg-ink-900/40 p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <CalendarDays className="h-4 w-4 text-slate-300" />
              <span className="text-xs font-semibold text-steel-400 uppercase tracking-wider">
                Total Payout Events
              </span>
            </div>
            <div className="stat-value text-2xl font-bold text-slate-100">
              {allPayouts.length}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-5">
          {/* Calendar */}
          <div className="col-span-2">
            <div className="grid grid-cols-7 gap-1.5 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div
                  key={d}
                  className="text-center text-[11px] font-semibold text-steel-500 uppercase tracking-wider py-1"
                >
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {calendarDays.map((date, idx) => {
                const inMonth = date.getMonth() === viewMonth.getMonth();
                const inRange = date >= rangeStart && date <= rangeEnd;
                const dayPayouts = payoutsByDate.get(date.toDateString()) ?? [];
                const hasPayouts = dayPayouts.length > 0;
                const weekend = isWeekend(date);

                return (
                  <div
                    key={idx}
                    className={`relative min-h-[78px] rounded-lg border p-1.5 transition ${
                      inMonth
                        ? 'bg-ink-800/40 border-ink-700/50'
                        : 'bg-ink-900/30 border-ink-700/30 opacity-40'
                    } ${
                      inRange && inMonth
                        ? 'ring-1 ring-accent-500/10'
                        : ''
                    } ${weekend && inMonth ? 'bg-ink-900/50' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`text-xs font-semibold ${
                          inMonth ? 'text-slate-300' : 'text-steel-600'
                        }`}
                      >
                        {dayNumber(date)}
                      </span>
                      {hasPayouts && (
                        <span className="text-[9px] font-mono text-accent-400/70">
                          {dayPayouts.length}p
                        </span>
                      )}
                    </div>
                    {hasPayouts && (
                      <div className="space-y-1">
                        {dayPayouts.map((p, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-1 rounded bg-ink-900/70 px-1 py-0.5"
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${ACCOUNT_COLORS[p.accountName] ?? 'bg-accent-500'}`}
                            />
                            <span className="text-[9px] font-mono text-slate-300 truncate">
                              {formatCurrency(p.net).replace('$', '')}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend & upcoming */}
          <div className="space-y-4">
            <div className="rounded-xl border border-ink-600/40 bg-ink-900/40 p-4">
              <h4 className="text-xs font-semibold text-steel-400 uppercase tracking-wider mb-3">
                Account Legend
              </h4>
              <div className="space-y-2.5">
                {accounts.map((a) => {
                  const accountPayouts = allPayouts.filter(
                    (p) => p.accountName === a.name,
                  );
                  const accountNet = accountPayouts.reduce((s, p) => s + p.net, 0);
                  return (
                    <div key={a.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${ACCOUNT_COLORS[a.name] ?? 'bg-accent-500'}`}
                        />
                        <span className="text-xs text-slate-200 truncate">
                          {a.name}
                        </span>
                      </div>
                      <span
                        className={`text-xs stat-value ${ACCOUNT_DOT[a.name] ?? 'text-accent-400'}`}
                      >
                        {formatCurrency(accountNet)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-ink-600/40 bg-ink-900/40 p-4">
              <h4 className="text-xs font-semibold text-steel-400 uppercase tracking-wider mb-3">
                Upcoming Payouts
              </h4>
              <div className="space-y-2 max-h-[260px] overflow-y-auto scrollbar-thin">
                {allPayouts.slice(0, 12).map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-ink-700/40 last:border-0"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${ACCOUNT_COLORS[p.accountName] ?? 'bg-accent-500'}`}
                      />
                      <div className="min-w-0">
                        <div className="text-slate-300 truncate">
                          {p.accountName}
                        </div>
                        <div className="text-[10px] text-steel-500">
                          {formatDate(p.date)}
                        </div>
                      </div>
                    </div>
                    <span className="stat-value text-accent-400 shrink-0">
                      {formatCurrency(p.net)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Payout rules summary */}
        <div className="grid grid-cols-4 gap-3">
          {accounts.map((a) => (
            <div
              key={a.id}
              className="rounded-lg border border-ink-600/40 bg-ink-900/30 p-3"
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`h-2 w-2 rounded-full ${ACCOUNT_COLORS[a.name] ?? 'bg-accent-500'}`}
                />
                <span className="text-xs font-semibold text-slate-200">
                  {a.name}
                </span>
              </div>
              <div className="space-y-1 text-[11px] text-steel-400">
                <div className="flex justify-between">
                  <span>Cycle</span>
                  <span className="text-slate-300">
                    {a.payout_cycle === 'every_5_days'
                      ? 'Every 5 days'
                      : a.payout_cycle === 'weekly'
                        ? 'Weekly'
                        : 'Every 14 days'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Split</span>
                  <span className="text-slate-300">
                    {(a.payout_split * 100).toFixed(0)}%
                  </span>
                </div>
                {a.payout_flat_fee > 0 && (
                  <div className="flex justify-between">
                    <span>Flat fee</span>
                    <span className="text-bear-400">-${a.payout_flat_fee.toFixed(2)}</span>
                  </div>
                )}
                {a.payout_crypto_fee_pct > 0 && (
                  <div className="flex justify-between">
                    <span>Crypto fee</span>
                    <span className="text-bear-400">
                      {(a.payout_crypto_fee_pct * 100).toFixed(2)}%
                    </span>
                  </div>
                )}
                <div className="flex justify-between pt-1 border-t border-ink-700/40">
                  <span>Per payout</span>
                  <span className="stat-value text-accent-400">
                    {formatCurrency(a.projected_profit)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
