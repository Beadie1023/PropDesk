// "Wall Street raise" scaling ladder: grow size slowly, only while consistent.
//   - +bumpPct to lot size for every +stepPct of account growth (compounding)
//   - locked unless at least minGreen of the last windowDays trading days were green
//   - size is computed from CURRENT balance, so a drawdown steps size back down
// Conservative on purpose; defaults mirror the video's hypothetical (10% / 10%, 3 of 5).

export type TradeLike = {
  account_name: string;
  trade_date: string;
  dollar_amount: number;
  commission?: number;
  swap?: number;
};

export function dailyPnl(trades: TradeLike[], accountName: string): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const t of trades) {
    if (t.account_name !== accountName) continue;
    const pnl = t.dollar_amount + (t.commission ?? 0) + (t.swap ?? 0);
    byDay.set(t.trade_date, (byDay.get(t.trade_date) ?? 0) + pnl);
  }
  return byDay;
}

export function greenDays(
  trades: TradeLike[],
  accountName: string,
  windowDays = 5,
): { green: number; considered: number } {
  const days = [...dailyPnl(trades, accountName).entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-windowDays);
  return { green: days.filter(([, pnl]) => pnl > 0).length, considered: days.length };
}

export type ScalingOptions = {
  stepPct?: number;
  bumpPct?: number;
  windowDays?: number;
  minGreen?: number;
  lotStep?: number;
};

export type ScalingDecision = {
  growthPct: number;
  steps: number;
  uncappedLots: number;
  lots: number;
  unlocked: boolean;
  green: number;
  considered: number;
  reason: string;
};

export function scalingDecision(
  baseLots: number,
  startingBalance: number,
  balance: number,
  trades: TradeLike[],
  accountName: string,
  options: ScalingOptions = {},
): ScalingDecision {
  const { stepPct = 10, bumpPct = 10, windowDays = 5, minGreen = 3, lotStep = 0.01 } = options;

  const growthPct = startingBalance > 0 ? ((balance - startingBalance) / startingBalance) * 100 : 0;
  const steps = Math.max(Math.floor(growthPct / stepPct), 0);
  const floorToStep = (v: number) => Math.round(Math.floor(v / lotStep + 1e-9) * lotStep * 1e6) / 1e6;
  const uncappedLots = floorToStep(baseLots * Math.pow(1 + bumpPct / 100, steps));

  const { green, considered } = greenDays(trades, accountName, windowDays);
  const unlocked = considered >= windowDays && green >= minGreen;

  let lots = baseLots;
  let reason: string;
  if (steps === 0) {
    reason = 'No growth step reached — base size.';
  } else if (unlocked) {
    lots = uncappedLots;
    reason = `${steps} growth step${steps > 1 ? 's' : ''} and ${green}/${considered} green days — scaled.`;
  } else {
    reason = `Growth earns ${uncappedLots} lots but consistency isn't met (${green}/${considered} green, need ${minGreen} of ${windowDays}) — held at base.`;
  }

  return { growthPct, steps, uncappedLots, lots, unlocked, green, considered, reason };
}
