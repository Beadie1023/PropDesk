import { useMemo, useState } from 'react';
import { Calculator, Crosshair, Target, ShieldMinus, Wallet } from 'lucide-react';
import { Panel } from '@/components/ui';
import {
  RR_OPTIONS,
  calculateTrade,
  formatCurrency,
  formatPrice,
} from '@/lib/trading';
import type { Account, RRKey } from '@/types';

export function TradeCalculator({ accounts }: { accounts: Account[] }) {
  const [entryInput, setEntryInput] = useState('1.0850');
  const [rr, setRr] = useState<RRKey>('1:3');

  const entryPrice = parseFloat(entryInput) || 0;

  const calc = useMemo(
    () => calculateTrade(entryPrice, rr, accounts),
    [entryPrice, rr, accounts],
  );

  const rrMultiple = rr === '1:2' ? 2 : rr === '1:3' ? 3 : 4;

  return (
    <Panel
      title="Trade Calculator"
      subtitle="Simultaneous P&L across all funded accounts"
      icon={<Calculator className="h-5 w-5" />}
      action={
        <div className="flex items-center gap-1.5 rounded-lg bg-ink-900/70 border border-ink-600/50 p-1">
          {RR_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => setRr(opt)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold font-mono transition ${
                rr === opt
                  ? 'bg-accent-500 text-ink-950 shadow-glow'
                  : 'text-steel-400 hover:text-slate-200 hover:bg-ink-700/60'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      }
    >
      <div className="p-5 space-y-5">
        {/* Inputs */}
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-1">
            <label className="block text-xs font-medium text-steel-400 mb-2 uppercase tracking-wider">
              Entry Price
            </label>
            <div className="relative">
              <Crosshair className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-steel-500" />
              <input
                type="number"
                step="0.0001"
                value={entryInput}
                onChange={(e) => setEntryInput(e.target.value)}
                className="input-field pl-9 text-lg"
                placeholder="0.0000"
              />
            </div>
          </div>

          <div className="col-span-1">
            <label className="block text-xs font-medium text-steel-400 mb-2 uppercase tracking-wider">
              <span className="inline-flex items-center gap-1.5">
                <ShieldMinus className="h-3.5 w-3.5" /> Stop Loss (10 pips)
              </span>
            </label>
            <div className="input-field text-lg pl-9 relative bg-ink-900/60 text-bear-400 border-bear-500/30">
              <ShieldMinus className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-bear-500" />
              {formatPrice(calc.sl)}
            </div>
          </div>

          <div className="col-span-1">
            <label className="block text-xs font-medium text-steel-400 mb-2 uppercase tracking-wider">
              Risk : Reward
            </label>
            <div className="input-field text-lg font-mono bg-ink-900/60 text-accent-400 border-accent-500/30">
              1 : {rrMultiple}
            </div>
          </div>
        </div>

        {/* Take profit levels */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'TP1', pips: 20, value: calc.tp1, tone: 'text-bull-400' },
            { label: 'TP2', pips: 30, value: calc.tp2, tone: 'text-bull-400' },
            { label: 'TP3', pips: 40, value: calc.tp3, tone: 'text-bull-400' },
          ].map((tp) => (
            <div
              key={tp.label}
              className="rounded-lg border border-ink-600/40 bg-ink-900/40 px-4 py-3"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-steel-400 uppercase tracking-wider">
                  {tp.label}
                </span>
                <span className="text-[10px] font-mono text-steel-500">
                  {tp.pips} pips
                </span>
              </div>
              <div className={`flex items-center gap-2 stat-value text-base ${tp.tone}`}>
                <Target className="h-4 w-4 text-bull-500/70" />
                {formatPrice(tp.value)}
              </div>
            </div>
          ))}
        </div>

        {/* Per-account P&L matrix */}
        <div className="overflow-hidden rounded-lg border border-ink-600/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-ink-900/60 text-steel-400 text-xs uppercase tracking-wider">
                <th className="text-left font-medium px-4 py-2.5">Account</th>
                <th className="text-right font-medium px-3 py-2.5">Lots</th>
                <th className="text-right font-medium px-3 py-2.5">Pip Value</th>
                <th className="text-right font-medium px-3 py-2.5 text-bear-400">Loss @ SL</th>
                <th className="text-right font-medium px-3 py-2.5 text-bull-400">Win @ TP1</th>
                <th className="text-right font-medium px-3 py-2.5 text-bull-400">Win @ TP2</th>
                <th className="text-right font-medium px-3 py-2.5 text-bull-400">Win @ TP3</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/50">
              {calc.perAccount.map(({ account, winAtTP1, winAtTP2, winAtTP3, lossAtSL }) => (
                <tr
                  key={account.id}
                  className="hover:bg-ink-800/40 transition"
                >
                  <td className="px-4 py-3 font-medium text-slate-100">
                    {account.name}
                  </td>
                  <td className="px-3 py-3 text-right stat-value text-slate-300">
                    {account.lots.toFixed(2)}
                  </td>
                  <td className="px-3 py-3 text-right stat-value text-slate-300">
                    ${account.pipValue.toFixed(2)}
                  </td>
                  <td className="px-3 py-3 text-right stat-value text-bear-400">
                    -{formatCurrency(lossAtSL).replace('-', '')}
                  </td>
                  <td className="px-3 py-3 text-right stat-value text-bull-400">
                    {formatCurrency(winAtTP1)}
                  </td>
                  <td className="px-3 py-3 text-right stat-value text-bull-400">
                    {formatCurrency(winAtTP2)}
                  </td>
                  <td className="px-3 py-3 text-right stat-value text-bull-400">
                    {formatCurrency(winAtTP3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Portfolio totals */}
        <div className="grid grid-cols-2 gap-4">
          <div className="relative overflow-hidden rounded-xl border border-bull-500/20 bg-gradient-to-br from-bull-500/10 to-transparent p-5">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="h-4 w-4 text-bull-400" />
              <span className="text-xs font-semibold text-bull-400 uppercase tracking-wider">
                Total Portfolio Win (TP3)
              </span>
            </div>
            <div className="stat-value text-3xl font-bold text-bull-400">
              +{formatCurrency(calc.totalWin)}
            </div>
            <p className="text-xs text-steel-500 mt-1.5">
              If all accounts hit TP3 simultaneously
            </p>
          </div>

          <div className="relative overflow-hidden rounded-xl border border-bear-500/20 bg-gradient-to-br from-bear-500/10 to-transparent p-5">
            <div className="flex items-center gap-2 mb-2">
              <ShieldMinus className="h-4 w-4 text-bear-400" />
              <span className="text-xs font-semibold text-bear-400 uppercase tracking-wider">
                Total Portfolio Loss (SL)
              </span>
            </div>
            <div className="stat-value text-3xl font-bold text-bear-400">
              -{formatCurrency(calc.totalLoss)}
            </div>
            <p className="text-xs text-steel-500 mt-1.5">
              If all accounts stop out simultaneously
            </p>
          </div>
        </div>
      </div>
    </Panel>
  );
}
