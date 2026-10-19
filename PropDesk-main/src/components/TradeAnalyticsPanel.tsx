import { useMemo, useState } from 'react';
import { BarChart3, Calendar, Clock, PieChart, Target } from 'lucide-react';
import { Panel } from '@/components/ui';
import {
  computeDurationAnalysis,
  computeIntradayActivity,
  computeOrderTypeStats,
  computeTradingDays,
  computeWinRate,
  formatCurrency,
} from '@/lib/trading';
import type { Account, OrderType, Trade } from '@/types';

const ORDER_TYPE_COLORS: Record<OrderType, string> = {
  market: '#4ade80', // bull green
  limit: '#38bdf8', // accent blue
  stop: '#f87171', // bear red
};

function formatHour(hour: number): string {
  return `${hour.toString().padStart(2, '0')}:00`;
}

export function TradeAnalyticsPanel({ accounts, trades }: { accounts: Account[]; trades: Trade[] }) {
  const [accountFilter, setAccountFilter] = useState<string>('all');

  const filtered = useMemo(
    () => (accountFilter === 'all' ? trades : trades.filter((t) => t.account_name === accountFilter)),
    [trades, accountFilter],
  );

  const winRate = useMemo(() => computeWinRate(filtered), [filtered]);
  const orderTypes = useMemo(() => computeOrderTypeStats(filtered), [filtered]);
  const intraday = useMemo(() => computeIntradayActivity(filtered), [filtered]);
  const duration = useMemo(() => computeDurationAnalysis(filtered), [filtered]);
  const tradingDays = useMemo(() => computeTradingDays(filtered), [filtered]);

  return (
    <Panel
      title="Trade Analytics"
      subtitle="Win rate, order mix, time-of-day and hold-duration breakdowns across your logged trades"
      icon={<BarChart3 className="h-5 w-5" />}
      action={
        accounts.length > 1 && (
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="input-field !w-auto text-xs"
          >
            <option value="all">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>
        )
      }
    >
      <div className="p-5 space-y-5">
        {filtered.length === 0 ? (
          <p className="text-sm text-steel-400 text-center py-8">
            No trades logged yet — analytics will populate once you log a trade.
          </p>
        ) : (
          <>
            {/* Win Rate + Order Types */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-ink-700/60 bg-ink-800/50 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Target className="h-4 w-4 text-accent-400" />
                  <span className="text-[11px] text-steel-400 uppercase tracking-wider">Win Rate</span>
                </div>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="stat-value text-3xl font-bold text-slate-50">
                    {winRate.winRatePercent.toFixed(2)}%
                  </span>
                  <span className="text-xs text-steel-500">
                    {winRate.wins}W / {winRate.losses}L
                  </span>
                </div>
                <div className="flex h-2.5 rounded-full overflow-hidden bg-ink-900">
                  <div
                    className="bg-bull-500"
                    style={{ width: `${winRate.total > 0 ? (winRate.wins / winRate.total) * 100 : 0}%` }}
                  />
                  <div
                    className="bg-bear-500"
                    style={{ width: `${winRate.total > 0 ? (winRate.losses / winRate.total) * 100 : 0}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-2 text-[11px]">
                  <span className="text-bull-400">Win {winRate.total > 0 ? ((winRate.wins / winRate.total) * 100).toFixed(0) : 0}%</span>
                  <span className="text-bear-400">Loss {winRate.total > 0 ? ((winRate.losses / winRate.total) * 100).toFixed(0) : 0}%</span>
                </div>
              </div>

              <div className="rounded-xl border border-ink-700/60 bg-ink-800/50 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <PieChart className="h-4 w-4 text-accent-400" />
                  <span className="text-[11px] text-steel-400 uppercase tracking-wider">Order Types</span>
                </div>
                {orderTypes.tagged === 0 ? (
                  <p className="text-xs text-steel-500 py-4">
                    No trades have an order type set. New trades can specify one in the Log a Trade form.
                  </p>
                ) : (
                  <div className="flex items-center gap-4">
                    <OrderTypeDonut stats={orderTypes} />
                    <div className="flex-1 space-y-1.5">
                      {(['market', 'limit', 'stop'] as const).map((type) => (
                        <div key={type} className="flex items-center justify-between text-[11px]">
                          <span className="flex items-center gap-1.5 text-steel-400">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: ORDER_TYPE_COLORS[type] }}
                            />
                            {type[0].toUpperCase() + type.slice(1)}
                          </span>
                          <span className="stat-value text-slate-200">
                            {orderTypes.percents[type].toFixed(0)}%
                          </span>
                        </div>
                      ))}
                      {orderTypes.untagged > 0 && (
                        <p className="text-[10px] text-steel-600 pt-1">
                          {orderTypes.untagged} untagged trade{orderTypes.untagged === 1 ? '' : 's'} excluded
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Intraday Activity + Duration Analysis */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-ink-700/60 bg-ink-800/50 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="h-4 w-4 text-accent-400" />
                  <span className="text-[11px] text-steel-400 uppercase tracking-wider">Intraday Activity</span>
                </div>
                {intraday.hours.length === 0 ? (
                  <p className="text-xs text-steel-500 py-4">
                    No trades have an entry time set. New trades can add one (optional) in the Log a Trade
                    form.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 text-[11px]">
                    <StatBlock
                      label="Best Hour"
                      value={intraday.bestHour ? formatHour(intraday.bestHour.hour) : '—'}
                      sub={intraday.bestHour ? formatCurrency(intraday.bestHour.avgPnL) : undefined}
                      positive={intraday.bestHour ? intraday.bestHour.avgPnL >= 0 : undefined}
                    />
                    <StatBlock
                      label="Worst Hour"
                      value={intraday.worstHour ? formatHour(intraday.worstHour.hour) : '—'}
                      sub={intraday.worstHour ? formatCurrency(intraday.worstHour.avgPnL) : undefined}
                      positive={intraday.worstHour ? intraday.worstHour.avgPnL >= 0 : undefined}
                    />
                    <StatBlock
                      label="Busiest Hour"
                      value={intraday.busiestHour ? formatHour(intraday.busiestHour.hour) : '—'}
                      sub={intraday.busiestHour ? `${intraday.busiestHour.count} trades` : undefined}
                    />
                    <StatBlock label="Trades Timed" value={String(intraday.hours.reduce((s, h) => s + h.count, 0))} />
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-ink-700/60 bg-ink-800/50 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="h-4 w-4 text-accent-400" />
                  <span className="text-[11px] text-steel-400 uppercase tracking-wider">Duration Analysis</span>
                </div>
                {duration.buckets.length === 0 ? (
                  <p className="text-xs text-steel-500 py-4">
                    No trades have both an entry and exit time set — hold duration can't be computed yet.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 text-[11px]">
                    <StatBlock
                      label="Most Profitable"
                      value={duration.mostProfitable?.label ?? '—'}
                      sub={duration.mostProfitable ? formatCurrency(duration.mostProfitable.avgPnL) : undefined}
                      positive={duration.mostProfitable ? duration.mostProfitable.avgPnL >= 0 : undefined}
                    />
                    <StatBlock
                      label="Worst"
                      value={duration.worst?.label ?? '—'}
                      sub={duration.worst ? formatCurrency(duration.worst.avgPnL) : undefined}
                      positive={duration.worst ? duration.worst.avgPnL >= 0 : undefined}
                    />
                    <StatBlock
                      label="Most Common"
                      value={duration.mostCommon?.label ?? '—'}
                      sub={duration.mostCommon ? `${duration.mostCommon.count} trades` : undefined}
                    />
                    <StatBlock
                      label="Best Avg. P&L"
                      value={duration.mostProfitable ? formatCurrency(duration.mostProfitable.avgPnL) : '—'}
                      sub={duration.mostProfitable ? `${duration.mostProfitable.winRatePercent.toFixed(0)}% win rate` : undefined}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Trading Days table */}
            <div className="rounded-xl border border-ink-700/60 bg-ink-800/50">
              <div className="flex items-center gap-2 px-4 pt-4 pb-2">
                <Calendar className="h-4 w-4 text-accent-400" />
                <span className="text-[11px] text-steel-400 uppercase tracking-wider">Trading Days</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-steel-500 border-b border-ink-700/40">
                      <th className="text-left font-medium px-4 py-2">Date</th>
                      <th className="text-right font-medium px-4 py-2">Profit (USD)</th>
                      <th className="text-right font-medium px-4 py-2">Trades</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tradingDays.map((day) => (
                      <tr key={day.date} className="border-b border-ink-700/20 last:border-0">
                        <td className="px-4 py-2.5 text-slate-300">{day.date}</td>
                        <td
                          className={`px-4 py-2.5 text-right stat-value font-semibold ${
                            day.profitUSD >= 0 ? 'text-bull-400' : 'text-bear-400'
                          }`}
                        >
                          {day.profitUSD >= 0 ? '+' : ''}
                          {formatCurrency(day.profitUSD)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-steel-400">{day.tradeCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

function StatBlock({
  label,
  value,
  sub,
  positive,
}: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-lg bg-ink-900/60 border border-ink-700/40 p-2.5">
      <p className="text-steel-500 mb-1">{label}</p>
      <p className="stat-value text-sm font-semibold text-slate-100">{value}</p>
      {sub && (
        <p
          className={`text-[10px] mt-0.5 ${
            positive === undefined ? 'text-steel-500' : positive ? 'text-bull-400' : 'text-bear-400'
          }`}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

// Hand-rolled SVG donut — no charting library in this project, and one
// three-slice donut doesn't justify adding a dependency for it.
function OrderTypeDonut({ stats }: { stats: ReturnType<typeof computeOrderTypeStats> }) {
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const order: OrderType[] = ['market', 'limit', 'stop'];

  let cumulativePercent = 0;
  const segments = order
    .map((type) => {
      const percent = stats.percents[type];
      const segment = {
        type,
        percent,
        offset: cumulativePercent,
      };
      cumulativePercent += percent;
      return segment;
    })
    .filter((s) => s.percent > 0);

  return (
    <svg viewBox="0 0 80 80" className="h-20 w-20 shrink-0 -rotate-90">
      <circle cx="40" cy="40" r={radius} fill="none" stroke="#1e293b" strokeWidth="12" />
      {segments.map((s) => (
        <circle
          key={s.type}
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke={ORDER_TYPE_COLORS[s.type]}
          strokeWidth="12"
          strokeDasharray={`${(s.percent / 100) * circumference} ${circumference}`}
          strokeDashoffset={-(s.offset / 100) * circumference}
        />
      ))}
    </svg>
  );
}
