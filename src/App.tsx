import { ConsistencyTracker } from '@/components/ConsistencyTracker';
import { SessionJournal } from '@/components/SessionJournal';

// Daily PnL array - grows with each trade logged
const dailyPnL = [
 { date: 'August 6, 2026', grossPnL: 1.11 },
];

const totalGrossProfit = dailyPnL.reduce((sum, d) => sum + d.grossPnL, 0);

export default function App() {
 return (
 <main className="...">
 <AccountDashboard />
 <TradeCalculator />
 <ChartPanel />
 <NewsGuard />

 {/ Consistency sits above journal so violation shows before logging /}
 <ConsistencyTracker
 dailyPnL={dailyPnL}
 totalGrossProfit={totalGrossProfit}
 consistencyCap={0.20}
 />

 <SessionJournal />
 </main>
 );
}
