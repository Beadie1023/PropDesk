import { useMemo } from 'react';
import { AlertTriangle, CheckCircle, TrendingUp } from 'lucide-react';

interface DailyPnL {
 date: string;
 grossPnL: number;
}

interface ConsistencyTrackerProps {
 dailyPnL: DailyPnL;
 totalGrossProfit: number;
 consistencyCap?: number;
}

export function ConsistencyTracker({
 dailyPnL,
 totalGrossProfit,
 consistencyCap = 0.20,
}: ConsistencyTrackerProps) {
 const { bestDay, bestDayDate, consistencyScore, violated, allowedMax } = useMemo( => {
 if (!dailyPnL.length || totalGrossProfit <= 0) {
 return {
 bestDay: 0,
 bestDayDate: '-',
 consistencyScore: 0,
 violated: false,
 allowedMax: totalGrossProfit * consistencyCap,
 };
 }

 const best = dailyPnL.reduce((prev, curr) =>
 curr.grossPnL > prev.grossPnL ? curr : prev
 );

 const score = (best.grossPnL / totalGrossProfit) * 100;
 const allowed = totalGrossProfit * consistencyCap;

 return {
 bestDay: best.grossPnL,
 bestDayDate: best.date,
 consistencyScore: score,
 violated: score > consistencyCap * 100,
 allowedMax: allowed,
 };
 }, [dailyPnL, totalGrossProfit, consistencyCap]);

 const scoreColor = violated
 ? 'text-red-400'
 : consistencyScore > 15
 ? 'text-yellow-400'
 : 'text-green-400';

 const borderColor = violated
 ? 'border-red-500/60'
 : consistencyScore > 15
 ? 'border-yellow-500/60'
 : 'border-green-500/30';

 return (
 <div className={`rounded-xl border p-4 bg-gray-800/50 transition-all duration-300 ${borderColor}`}>

 {/* Header */}
 <div className="flex items-center justify-between mb-4">
 <div className="flex items-center gap-2">
 <TrendingUp className="h-4 w-4 text-gray-400" />
 <span className="text-sm font-semibold text-slate-100">
 Consistency Tracker
 </span>
 </div>
 <span className="text-[11px] text-gray-500">
 Upcomers · 20% Cap
 </span>
 </div>

 {/* Violation Banner */}
 {violated && (
 <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4">
 <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
 <div>
 <p className="text-sm font-semibold text-red-300">
 Consistency Rule Violated
 </p>
 <p className="text-[11px] text-red-400/70 mt-0.5">
 Best day exceeds 20% of total profit - payout may be rejected
 </p>
 </div>
 </div>
 )}

 {/* Score Display */}
 <div className="grid grid-cols-3 gap-3 mb-4">
 <div className="bg-gray-900/60 rounded-lg p-3 text-center">
 <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">
 Best Day
 </p>
 <p className={`text-lg font-bold ${scoreColor}`}>
 ${bestDay.toFixed(2)}
 </p>
 <p className="text-[10px] text-gray-600 mt-0.5">{bestDayDate}</p>
 </div>

 <div className="bg-gray-900/60 rounded-lg p-3 text-center">
 <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">
 Score
 </p>
 <p className={`text-lg font-bold ${scoreColor}`}>
 {consistencyScore.toFixed(1)}%
 </p>
 <p className="text-[10px] text-gray-600 mt-0.5">of total profit</p>
 </div>

 <div className="bg-gray-900/60 rounded-lg p-3 text-center">
 <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">
 Allowed Max
 </p>
 <p className="text-lg font-bold text-gray-300">
 ${allowedMax.toFixed(2)}
 </p>
 <p className="text-[10px] text-gray-600 mt-0.5">per day</p>
 </div>
 </div>

 {/* Progress Bar */}
 <div>
 <div className="flex justify-between text-[10px] text-gray-500 mb-1">
 <span>Consistency Usage</span>
 <span>{consistencyScore.toFixed(1)}% / 20% cap</span>
 </div>
 <div className="h-2 bg-gray-900 rounded-full overflow-hidden">
 <div
 className={`h-full rounded-full transition-all duration-500 ${
 violated
 ? 'bg-red-500'
 : consistencyScore > 15
 ? 'bg-yellow-500'
 : 'bg-green-500'
 }`}
 style={{ width: `${Math.min(consistencyScore, 100)}%` }}
 />
 </div>
 {!violated && (
 <div className="flex items-center gap-1 mt-2">
 <CheckCircle className="h-3 w-3 text-green-400" />
 <span className="text-[10px] text-green-400">
 Within Upcomers consistency rules
 </span>
 </div>
 )}
 </div>
 </div>
 );
}
