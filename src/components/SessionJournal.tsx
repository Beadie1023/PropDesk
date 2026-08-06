import { useState } from 'react';
import { BookOpen, Plus, TrendingUp, TrendingDown, Clock } from 'lucide-react';

interface TradeEntry {
 id: string;
 date: string;
 openTime: string;
 closeTime: string;
 direction: 'BUY' | 'SELL';
 entryPrice: number;
 exitPrice: number;
 stopLoss: number;
 takeProfit: number;
 lotSize: number;
 grossPnL: number;
 commission: number;
 netPnL: number;
 rrAchieved: number;
 rrTarget: number;
 conditions: {
 currencyStrength: boolean;
 zoneConfirmed: boolean;
 lorentzian: boolean;
 momentum: boolean;
 };
 notes?: string;
 validDay: boolean;
}

// Seed with your first live trade
const INITIAL_TRADES: TradeEntry[] = [
 {
 id: '13071341',
 date: 'August 6, 2026',
 openTime: '13:08:22',
 closeTime: '14:49:48',
 direction: 'BUY',
 entryPrice: 1.91197,
 exitPrice: 1.91355,
 stopLoss: 1.91055,
 takeProfit: 1.91355,
 lotSize: 0.01,
 grossPnL: 1.11,
 commission: -0.05,
 netPnL: 1.06,
 rrAchieved: 1.11,
 rrTarget: 3,
 conditions: {
 currencyStrength: true,
 zoneConfirmed: true,
 lorentzian: true,
 momentum: true,
 },
 notes: 'First live trade on Ember account. TP hit exactly.',
 validDay: false, // Upcomers showing Not Counted - confirm with support
 },
];

interface SessionJournalProps {
 onTradeAdded?: (trade: TradeEntry) => void;
}

export function SessionJournal({ onTradeAdded }: SessionJournalProps) {
 const [trades, setTrades] = useState<TradeEntry[]>(INITIAL_TRADES);
 const [showForm, setShowForm] = useState(false);
 const [expandedId, setExpandedId] = useState<string | null>(null);

 // Daily PnL summary
 const todayTrades = trades.filter(t => t.date === 'August 6, 2026');
 const todayGross = todayTrades.reduce((sum, t) => sum + t.grossPnL, 0);
 const todayNet = todayTrades.reduce((sum, t) => sum + t.netPnL, 0);
 const todayWins = todayTrades.filter(t => t.netPnL > 0).length;
 const validDays = trades.filter(t => t.validDay).length;

 // RR color
 function rrColor(achieved: number, target: number) {
 if (achieved >= target) return 'text-bull-400';
 if (achieved >= target * 0.6) return 'text-warn-400';
 return 'text-bear-400';
 }

 return (
 <div className="rounded-xl border border-ink-700/60 bg-ink-800/50 p-4">

 {/* Header */}
 <div className="flex items-center justify-between mb-4">
 <div className="flex items-center gap-2">
 <BookOpen className="h-4 w-4 text-steel-400" />
 <span className="text-sm font-semibold text-slate-100">
 Session Journal
 </span>
 </div>
 <button
 onClick={() => setShowForm(!showForm)}
 className="flex items-center gap-1 text-[11px] bg-accent-500/20 hover:bg-accent-500/30 text-accent-300 border border-accent-500/30 rounded-lg px-3 py-1.5 transition font-semibold"
 >
 <Plus className="h-3 w-3" />
 Log Trade
 </button>
 </div>

 {/* Today Summary Bar */}
 <div className="grid grid-cols-4 gap-2 mb-4">
 <div className="bg-ink-900/60 rounded-lg p-2.5 text-center">
 <p className="text-[10px] text-steel-500 uppercase tracking-wide">Today P&L</p>
 <p className={`text-sm font-bold mt-0.5 ${todayNet >= 0 ? 'text-bull-400' : 'text-bear-400'}`}>
 ${todayNet.toFixed(2)}
 </p>
 </div>
 <div className="bg-ink-900/60 rounded-lg p-2.5 text-center">
 <p className="text-[10px] text-steel-500 uppercase tracking-wide">Trades</p>
 <p className="text-sm font-bold text-slate-200 mt-0.5">{todayTrades.length}</p>
 </div>
 <div className="bg-ink-900/60 rounded-lg p-2.5 text-center">
 <p className="text-[10px] text-steel-500 uppercase tracking-wide">Win Rate</p>
 <p className="text-sm font-bold text-bull-400 mt-0.5">
 {todayTrades.length ? Math.round((todayWins / todayTrades.length) * 100) : 0}%
 </p>
 </div>
 <div className="bg-ink-900/60 rounded-lg p-2.5 text-center">
 <p className="text-[10px] text-steel-500 uppercase tracking-wide">Valid Days</p>
 <p className="text-sm font-bold text-steel-300 mt-0.5">{validDays}/5</p>
 </div>
 </div>

 {/* Trade List */}
 <div className="space-y-2">
 {trades.map((trade) => (
 <div
 key={trade.id}
 className="border border-ink-700/40 rounded-lg overflow-hidden"
 >
 {/* Trade Row */}
 <button
 onClick={() => setExpandedId(expandedId === trade.id ? null : trade.id)}
 className="w-full flex items-center justify-between p-3 hover:bg-ink-700/30 transition text-left"
 >
 <div className="flex items-center gap-3">
 {trade.direction === 'BUY'
 ? <TrendingUp className="h-4 w-4 text-bull-400" />
 : <TrendingDown className="h-4 w-4 text-bear-400" />
 }
 <div>
 <p className="text-sm font-semibold text-slate-200">
 {trade.direction} GBP/AUD
 </p>
 <p className="text-[10px] text-steel-500">
 #{trade.id} · {trade.openTime} - {trade.closeTime}
 </p>
 </div>
 </div>

 <div className="flex items-center gap-4">
 {/* RR Badge */}
 <div className="text-right">
 <p className={`text-sm font-bold ${rrColor(trade.rrAchieved, trade.rrTarget)}`}>
 1:{trade.rrAchieved.toFixed(1)}
 </p>
 <p className="text-[10px] text-steel-600">target 1:{trade.rrTarget}</p>
 </div>

 {/* Net PnL */}
 <div className="text-right min-w-[60px]">
 <p className={`text-sm font-bold ${trade.netPnL >= 0 ? 'text-bull-400' : 'text-bear-400'}`}>
 {trade.netPnL >= 0 ? '+' : ''}${trade.netPnL.toFixed(2)}
 </p>
 <p className="text-[10px] text-steel-600">net</p>
 </div>
 </div>
 </button>

 {/* Expanded Detail */}
 {expandedId === trade.id && (
 <div className="border-t border-ink-700/40 p-3 bg-ink-900/40 space-y-3">

 {/* Price Details */}
 <div className="grid grid-cols-3 gap-2 text-center">
 <div>
 <p className="text-[10px] text-steel-500">Entry</p>
 <p className="text-sm font-semibold text-slate-200">{trade.entryPrice}</p>
 </div>
 <div>
 <p className="text-[10px] text-steel-500">Exit</p>
 <p className="text-sm font-semibold text-slate-200">{trade.exitPrice}</p>
 </div>
 <div>
 <p className="text-[10px] text-steel-500">Lot Size</p>
 <p className="text-sm font-semibold text-slate-200">{trade.lotSize}</p>
 </div>
 </div>

 {/* SL / TP */}
 <div className="grid grid-cols-2 gap-2 text-center">
 <div className="bg-bear-500/10 rounded-lg p-2">
 <p className="text-[10px] text-bear-400">Stop Loss</p>
 <p className="text-sm font-semibold text-bear-300">{trade.stopLoss}</p>
 </div>
 <div className="bg-bull-500/10 rounded-lg p-2">
 <p className="text-[10px] text-bull-400">Take Profit</p>
 <p className="text-sm font-semibold text-bull-300">{trade.takeProfit}</p>
 </div>
 </div>

 {/* PnL Breakdown */}
 <div className="grid grid-cols-3 gap-2 text-center">
 <div>
 <p className="text-[10px] text-steel-500">Gross</p>
 <p className="text-sm font-semibold text-bull-400">+${trade.grossPnL.toFixed(2)}</p>
 </div>
 <div>
 <p className="text-[10px] text-steel-500">Commission</p>
 <p className="text-sm font-semibold text-bear-400">${trade.commission.toFixed(2)}</p>
 </div>
 <div>
 <p className="text-[10px] text-steel-500">Net</p>
 <p className="text-sm font-semibold text-bull-400">+${trade.netPnL.toFixed(2)}</p>
 </div>
 </div>

 {/* Conditions */}
 <div>
 <p className="text-[10px] text-steel-500 uppercase tracking-wide mb-1.5">
 Conditions Present
 </p>
 <div className="grid grid-cols-2 gap-1.5">
 {[
 { key: 'currencyStrength', label: 'Currency Strength' },
 { key: 'zoneConfirmed', label: 'Zone Confirmed' },
 { key: 'lorentzian', label: 'Lorentzian Arrow' },
 { key: 'momentum', label: 'Momentum Strong' },
 ].map(({ key, label }) => (
 <div
 key={key}
 className={`flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium ${
 trade.conditions[key as keyof typeof trade.conditions]
 ? 'bg-bull-500/10 text-bull-400'
 : 'bg-ink-700/40 text-steel-600'
 }`}
 >
 <span>{trade.conditions[key as keyof typeof trade.conditions] ? '✅' : '⬜'}</span>
 {label}
 </div>
 ))}
 </div>
 </div>

 {/* Valid Day Flag */}
 <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-semibold ${
 trade.validDay
 ? 'bg-bull-500/10 text-bull-400 border border-bull-500/20'
 : 'bg-warn-500/10 text-warn-400 border border-warn-500/20'
 }`}>
 <Clock className="h-3 w-3" />
 {trade.validDay
 ? 'Valid Trading Day - Counts toward payout'
 : 'Pending - Confirm valid day status with Upcomers'
 }
 </div>

 {/* Notes */}
 {trade.notes && (
 <div className="bg-ink-700/30 rounded-lg p-2">
 <p className="text-[10px] text-steel-500 mb-0.5">Notes</p>
 <p className="text-[11px] text-slate-300">{trade.notes}</p>
 </div>
 )}
 </div>
 )}
 </div>
 ))}
 </div>
 </div>
 );
}
