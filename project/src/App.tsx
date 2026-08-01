import { useMemo, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  BookOpen,
  CalendarDays,
  LayoutGrid,
  LineChart,
} from 'lucide-react';
import { usePropDeskData } from '@/hooks/usePropDeskData';
import { LoadingBlock, Panel } from '@/components/ui';
import { formatCurrency } from '@/lib/trading';
import { TradeCalculator } from '@/components/TradeCalculator';
import { PayoutTracker } from '@/components/PayoutTracker';
import { AccountDashboard } from '@/components/AccountDashboard';
import { RiskAlertPanel } from '@/components/RiskAlertPanel';
import { SessionJournal } from '@/components/SessionJournal';

type View = 'overview' | 'calculator' | 'payouts' | 'accounts' | 'risk' | 'journal';

const NAV: { key: View; label: string; icon: typeof Activity }[] = [
  { key: 'overview', label: 'Overview', icon: LayoutGrid },
  { key: 'calculator', label: 'Trade Calculator', icon: LineChart },
  { key: 'payouts', label: 'Payout Tracker', icon: CalendarDays },
  { key: 'accounts', label: 'Account Dashboard', icon: Activity },
  { key: 'risk', label: 'Risk Alerts', icon: AlertOctagon },
  { key: 'journal', label: 'Session Journal', icon: BookOpen },
];

function App() {
  const { accounts, trades, loading, error, addTrade, deleteTrade } =
    usePropDeskData();
  const [view, setView] = useState<View>('overview');

  const portfolioBalance = useMemo(
    () => accounts.reduce((s, a) => s + a.balance, 0),
    [accounts],
  );
  const portfolioPnl = useMemo(
    () => accounts.reduce((s, a) => s + a.daily_pnl, 0),
    [accounts],
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-ink-950 grid-bg flex items-center justify-center">
        <LoadingBlock label="Loading PropDesk…" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink-950 grid-bg">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-ink-700/50 bg-ink-900/80 backdrop-blur-md">
        <div className="mx-auto max-w-[1600px] px-6">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-500/15 border border-accent-500/30 shadow-glow">
                <LineChart className="h-5 w-5 text-accent-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-50 tracking-tight">
                  Prop<span className="text-accent-400">Desk</span>
                </h1>
                <p className="text-[11px] text-steel-400 -mt-0.5">
                  Forex Prop Trading Command Center
                </p>
              </div>
            </div>

            {/* Portfolio ticker */}
            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="text-[10px] text-steel-400 uppercase tracking-wider">
                  Portfolio Balance
                </p>
                <p className="stat-value text-sm font-semibold text-slate-100">
                  {formatCurrency(portfolioBalance)}
                </p>
              </div>
              <div className="h-8 w-px bg-ink-600/50" />
              <div className="text-right">
                <p className="text-[10px] text-steel-400 uppercase tracking-wider">
                  Daily P&amp;L
                </p>
                <p
                  className={`stat-value text-sm font-semibold ${
                    portfolioPnl >= 0 ? 'text-bull-400' : 'text-bear-400'
                  }`}
                >
                  {portfolioPnl >= 0 ? '+' : '-'}{formatCurrency(Math.abs(portfolioPnl))}
                </p>
              </div>
              <div className="h-8 w-px bg-ink-600/50" />
              <div className="text-right">
                <p className="text-[10px] text-steel-400 uppercase tracking-wider">
                  Accounts
                </p>
                <p className="stat-value text-sm font-semibold text-slate-100">
                  {accounts.length} Funded
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Nav */}
      <nav className="sticky top-16 z-30 border-b border-ink-700/40 bg-ink-900/50 backdrop-blur-sm">
        <div className="mx-auto max-w-[1600px] px-6">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = view === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setView(item.key)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap ${
                    active
                      ? 'border-accent-500 text-accent-400'
                      : 'border-transparent text-steel-400 hover:text-slate-200'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="mx-auto max-w-[1600px] px-6 py-6">
        {error && (
          <div className="mb-5 rounded-xl border border-bear-500/40 bg-bear-500/10 px-5 py-3 text-sm text-bear-300">
            Connection issue: {error}. Data may be incomplete.
          </div>
        )}

        {view === 'overview' && (
          <div className="space-y-6">
            <AccountDashboard accounts={accounts} />
            <div className="grid grid-cols-2 gap-6">
              <TradeCalculator accounts={accounts} />
              <RiskAlertPanel accounts={accounts} />
            </div>
            <PayoutTracker accounts={accounts} />
            <SessionJournal
              trades={trades}
              accounts={accounts}
              onAddTrade={addTrade}
              onDeleteTrade={deleteTrade}
            />
          </div>
        )}

        {view === 'calculator' && (
          <TradeCalculator accounts={accounts} />
        )}

        {view === 'payouts' && <PayoutTracker accounts={accounts} />}

        {view === 'accounts' && <AccountDashboard accounts={accounts} />}

        {view === 'risk' && <RiskAlertPanel accounts={accounts} />}

        {view === 'journal' && (
          <SessionJournal
            trades={trades}
            accounts={accounts}
            onAddTrade={addTrade}
            onDeleteTrade={deleteTrade}
          />
        )}
      </main>

      <footer className="border-t border-ink-700/40 mt-6">
        <div className="mx-auto max-w-[1600px] px-6 py-4 flex items-center justify-between text-xs text-steel-500">
          <span>PropDesk — Prop Trading Management</span>
          <span className="stat-value">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </span>
        </div>
      </footer>
    </div>
  );
}

export default App;
