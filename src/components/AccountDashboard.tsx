import { useEffect, useMemo, useState } from 'react';
import { LayoutGrid, Radio } from 'lucide-react';
import { Panel, StatusBadge } from '@/components/ui';
import {
 drawdownBufferRemaining,
 drawdownPct,
 formatCurrency,
 formatCurrencyShort,
 riskStatus,
 tradingDaysCompleted,
} from '@/lib/trading';
import { connectAccount, type ConnectionStatus } from '../lib/metaapi';
import type { Account, Trade } from '@/types';

export function AccountDashboard({
 accounts,
 trades,
}: {
 accounts: Account;
 trades: Trade;
}) {
 const portfolioUnrealized = useMemo(
  () => accounts.reduce((sum, a) => sum + (a.balance - a.startingBalance), 0),
  [accounts],
 );

 const [liveStatus, setLiveStatus] = useState<ConnectionStatus>('disconnected');

 useEffect(() => {
  let cancelled = false;
  connectAccount().then((status: ConnectionStatus) => {
   if (!cancelled) setLiveStatus(status);
  });
  return () => {
   cancelled = true;
  };
 }, []);

 return (
  <Panel
   title="Account Dashboard"
   subtitle="Live balance, drawdown buffer and evaluation status across funded accounts"
   icon={<LayoutGrid className="h-5 w-5" />}
   action={
    <div className="flex items-center gap-3">
     <div
      className={chip border ${
       liveStatus === 'connected'
        ? 'bg-bull-500/15 text-bull-400 border-bull-500/30'
        : 'bg-bear-500/15 text-bear-400 border-bear-500/30'
      }}
     >
      <Radio className="h-3 w-3" />
      {liveStatus === 'connected' ? 'Live Connected' : 'Disconnected'}
     </div>
     <div className="flex items-center gap-2 rounded-lg bg-ink-900/70 border border-ink-600/50 px-3 py-1.5">
      <span className="text-xs text-steel-400">Unrealized P&amp;L</span>
      <span
       className={stat-value text-sm font-semibold ${
        portfolioUnrealized >= 0 ? 'text-bull-400' : 'text-bear-400'
       }}
      >
       {portfolioUnrealized >= 0 ? '+' : '-'}
       {formatCurrencyShort(Math.abs(portfolioUnrealized))}
      </span>
     </div>
    </div>
   }
  >
   <div className="p-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
    {accounts.map((account) => (
     <AccountCard key={account.id} account={account} trades={trades} />
    ))}
   </div>
  </Panel>
 );
}

function AccountCard({ account, trades }: { account: Account; trades: Trade }) {
 const status = riskStatus(account);
 const ddPct = drawdownPct(account);
 const remaining = drawdownBufferRemaining(account);
 const unrealized = account.balance - account.startingBalance;
 const pnlPositive = unrealized >= 0;
 const daysCompleted = tradingDaysCompleted(account.name, trades);

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
   className={relative overflow-hidden rounded-xl border ${cardBorder} bg-ink-800/50 p-4 transition hover:bg-ink-750/50}
  >
   <div className="flex items-start justify-between mb-4">
    <div>
     <h3 className="text-sm font-semibold text-slate-100">{account.name}</h3>
     <p className="text-[11px] text-steel-500 mt-0.5">
      {account.firm} · {account.type}
     </p>
    </div>
    <StatusBadge status={status} />
   </div>

   <div className="mb-4">
    <p className="text-[11px] text-steel-400 uppercase tracking-wider mb-1">
     Current Balance
    </p>
    <div className="flex items-baseline gap-2">
     <span className="stat-value text-2xl font-bold text-slate-50">
      {formatCurrency(account.balance)}
     </span>
     <span className="text-xs text-steel-500">
      / {formatCurrencyShort(account.startingBalance)} start
     </span>
    </div>
   </div>

   <div className="mb-4">
    <p className="text-[11px] text-steel-400 uppercase tracking-wider mb-1">
     Unrealized P&amp;L
    </p>
    <div
     className={stat-value text-lg font-semibold ${
      pnlPositive ? 'text-bull-400' : 'text-bear-400'
     }}
    >
     {pnlPositive ? '+' : '-'}{formatCurrency(Math.abs(unrealized))}
    </div>
   </div>

   <div>
    <div className="flex items-center justify-between mb-2">
     <span className="text-[11px] text-steel-400 uppercase tracking-wider">
      Drawdown Buffer Used
     </span>
     <span className="text-[11px] stat-value text-steel-300">
      {ddPct.toFixed(0)}% / 100%
     </span>
    </div>
    <div className="relative h-2.5 rounded-full bg-ink-900 overflow-hidden">
     <div
      className={absolute inset-y-0 left-0 rounded-full ${barColor} transition-all duration-500}
      style={{ width: ${ddPct}% }}
     />
     <div className="absolute inset-y-0 left-[75%] w-px bg-ink-950/80" />
    </div>
    <div className="flex items-center justify-between mt-2 text-[11px]">
     <span className="text-steel-500">
      Floor {formatCurrencyShort(account.floorBalance)} · Max DD {account.maxDrawdownPercent}%
     </span>
     <span
      className={stat-value ${
       remaining <= 0 ? 'text-bear-400' : 'text-steel-400'
      }}
     >
      {remaining <= 0 ? 'Breached' : ${formatCurrencyShort(remaining)} left}
     </span>
    </div>
   </div>

   <div className="mt-3 pt-3 border-t border-ink-700/40 flex items-center justify-between text-[11px]">
    <span className="text-steel-500">{account.phase} · {account.profitSplit}% split</span>
    <span
     className={stat-value ${
      daysCompleted >= account.minTradingDays ? 'text-bull-400' : 'text-steel-400'
     }}
    >
     {daysCompleted}/{account.minTradingDays}d · {account.consistencyLimit}% consistency
    </span>
   </div>
  </div>
 );
}
