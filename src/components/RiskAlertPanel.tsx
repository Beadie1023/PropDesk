import { useMemo } from 'react';
import { AlertOctagon, AlertTriangle, ShieldCheck, Square } from 'lucide-react';
import { Panel, StatusDot } from '@/components/ui';
import { drawdownBufferRemaining, drawdownPct, formatCurrency, riskStatus } from '@/lib/trading';
import type { Account } from '@/types';

export function RiskAlertPanel({ accounts }: { accounts: Account[] }) {
  const alerts = useMemo(
    () =>
      accounts.map((a) => ({
        account: a,
        status: riskStatus(a),
        ddPct: drawdownPct(a),
      })),
    [accounts],
  );

  const stopCount = alerts.filter((a) => a.status === 'red').length;
  const cautionCount = alerts.filter((a) => a.status === 'yellow').length;
  const allClear = stopCount === 0 && cautionCount === 0;

  return (
    <Panel
      title="Risk Alert Panel"
      subtitle="Automated warnings at 75% and 100% of the drawdown buffer"
      icon={<AlertOctagon className="h-5 w-5" />}
      action={
        <div
          className={`chip border ${
            allClear
              ? 'bg-bull-500/15 text-bull-400 border-bull-500/30'
              : stopCount > 0
                ? 'bg-bear-500/15 text-bear-400 border-bear-500/30'
                : 'bg-warn-500/15 text-warn-400 border-warn-500/30'
          }`}
        >
          <StatusDot status={stopCount > 0 ? 'red' : cautionCount > 0 ? 'yellow' : 'green'} pulse />
          {allClear ? 'ALL CLEAR' : `${stopCount + cautionCount} ACTIVE`}
        </div>
      }
    >
      <div className="p-5 space-y-4">
        {/* Master pause indicator */}
        <div
          className={`flex items-center justify-between rounded-xl border p-4 transition ${
            stopCount > 0
              ? 'border-bear-500/40 bg-bear-500/10 shadow-glow-bear'
              : 'border-ink-600/40 bg-ink-900/40'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                stopCount > 0 ? 'bg-bear-500/20 text-bear-400' : 'bg-ink-700/60 text-steel-400'
              }`}
            >
              {stopCount > 0 ? (
                <Square className="h-5 w-5 fill-current" />
              ) : (
                <ShieldCheck className="h-5 w-5" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Master Pause Indicator
              </h3>
              <p className="text-xs text-steel-400">
                {stopCount > 0
                  ? `STOP TRADING — ${stopCount} account${stopCount > 1 ? 's' : ''} hit the drawdown floor`
                  : 'No accounts at the drawdown floor — trading permitted'}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div
              className={`stat-value text-2xl font-bold ${
                stopCount > 0 ? 'text-bear-400' : 'text-bull-400'
              }`}
            >
              {stopCount}/{accounts.length}
            </div>
            <p className="text-[11px] text-steel-500">accounts paused</p>
          </div>
        </div>

        {/* Per-account banners */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {alerts.map(({ account, status, ddPct }) => {
            const isRed = status === 'red';
            const isYellow = status === 'yellow';
            const isGreen = status === 'green';
            const remaining = drawdownBufferRemaining(account);

            return (
              <div
                key={account.id}
                className={`relative overflow-hidden rounded-lg border p-3.5 transition ${
                  isRed
                    ? 'border-bear-500/40 bg-bear-500/10 animate-slideIn'
                    : isYellow
                      ? 'border-warn-500/40 bg-warn-500/10 animate-slideIn'
                      : 'border-ink-600/40 bg-ink-900/40'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {isRed ? (
                      <Square className="h-4 w-4 text-bear-400 fill-current" />
                    ) : isYellow ? (
                      <AlertTriangle className="h-4 w-4 text-warn-400" />
                    ) : (
                      <ShieldCheck className="h-4 w-4 text-bull-500/70" />
                    )}
                    <span className="text-sm font-semibold text-slate-100">
                      {account.name}
                    </span>
                  </div>
                  <StatusDot status={status} pulse={status !== 'green'} />
                </div>

                <p
                  className={`text-xs leading-relaxed ${
                    isRed
                      ? 'text-bear-300'
                      : isYellow
                        ? 'text-warn-300'
                        : 'text-steel-400'
                  }`}
                >
                  {isRed &&
                    `STOP. Drawdown floor of ${formatCurrency(account.floorBalance)} reached. Halt all trading on this account immediately.`}
                  {isYellow &&
                    `CAUTION. ${ddPct.toFixed(0)}% of the drawdown buffer consumed. Only ${formatCurrency(remaining)} remains above the floor of ${formatCurrency(account.floorBalance)}.`}
                  {isGreen &&
                    `Within normal risk. ${formatCurrency(remaining)} of buffer remaining above the floor.`}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}
