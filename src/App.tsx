{/* ... remaining layout logic remains identical ... */}

{/* Content */}
<main className="mx-auto max-w-[1600px] px-6 py-6">
  {error && (
    <div className="mb-5 rounded-xl border border-bear-500/40 bg-bear-500/10 px-5 py-3 text-sm text-bear-300">
      Connection issue: {error}. Data may be incomplete.
    </div>
  )}

  {view === 'overview' && (
    <div className="space-y-6">
      <AccountDashboard accounts={accounts} trades={trades} />
      <div className="grid grid-cols-2 gap-6">
        <TradeCalculator accounts={accounts} />
        <RiskAlertPanel accounts={accounts} trades={trades} />
      </div>
      <ChartPanel />
      <PayoutTracker accounts={accounts} />
      
      {/* Consistency sits above journal so violations show before logging */}
      <ConsistencyTracker 
        dailyPnL={dailyPnL} 
        totalGrossProfit={totalGrossProfit} 
        consistencyCap={0.20} 
      />

      {/* Removed local props since the component handles its own data array */}
      <SessionJournal />
    </div>
  )}

  {view === 'calculator' && (
    <TradeCalculator accounts={accounts} />
  )}

  {view === 'payouts' && <PayoutTracker accounts={accounts} />}

  {view === 'accounts' && <AccountDashboard accounts={accounts} trades={trades} />}

  {view === 'risk' && <RiskAlertPanel accounts={accounts} trades={trades} />}

  {view === 'journal' && (
    <div className="space-y-6">
      <ConsistencyTracker 
        dailyPnL={dailyPnL} 
        totalGrossProfit={totalGrossProfit} 
        consistencyCap={0.20} 
      />
      {/* Removed local props since the component handles its own data array */}
      <SessionJournal />
    </div>
  )}
</main>

{/* ... rest of the file layout ... */}
