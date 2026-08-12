import type { Account, PayoutEstimate, RRKey, RiskStatus, Trade } from '@/types';

export const PIP = 0.0001;

export const RR_OPTIONS: RRKey[] = ['1:2', '1:3', '1:4'];

export const rrRatio = (rr: RRKey): number => {
  const map: Record<RRKey, number> = { '1:2': 2, '1:3': 3, '1:4': 4 };
  return map[rr];
};

export const roundToPip = (value: number): number => {
  const decimals = value >= 100 ? 2 : 4;
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
};

export const formatPrice = (value: number): string => {
  return value.toFixed(value >= 100 ? 2 : 4);
};

export const formatCurrency = (value: number): string => {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const formatCurrencyShort = (value: number): string => {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
};

export const formatPercent = (value: number): string => {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
};

export type CalcResult = {
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  pipDistanceSL: number;
  pipDistanceTP1: number;
  pipDistanceTP2: number;
  pipDistanceTP3: number;
  perAccount: {
    account: Account;
    winAtTP1: number;
    winAtTP2: number;
    winAtTP3: number;
    lossAtSL: number;
    rrMultiple: number;
  }[];
  totalWin: number;
  totalLoss: number;
};

export const calculateTrade = (
  entryPrice: number,
  rr: RRKey,
  accounts: Account[],
): CalcResult => {
  const ratio = rrRatio(rr);
  const sl = roundToPip(entryPrice - 10 * PIP);
  const tp1 = roundToPip(entryPrice + 20 * PIP);
  const tp2 = roundToPip(entryPrice + 30 * PIP);
  const tp3 = roundToPip(entryPrice + 40 * PIP);

  const pipDistanceSL = 10;
  const pipDistanceTP1 = 20;
  const pipDistanceTP2 = 30;
  const pipDistanceTP3 = 40;

  const perAccount = accounts.map((account) => {
    const winAtTP1 = pipDistanceTP1 * account.pipValue;
    const winAtTP2 = pipDistanceTP2 * account.pipValue;
    const winAtTP3 = pipDistanceTP3 * account.pipValue;
    const lossAtSL = pipDistanceSL * account.pipValue;
    const rrMultiple = ratio;
    return { account, winAtTP1, winAtTP2, winAtTP3, lossAtSL, rrMultiple };
  });

  const totalWin = perAccount.reduce((sum, a) => sum + a.winAtTP3, 0);
  const totalLoss = perAccount.reduce((sum, a) => sum + a.lossAtSL, 0);

  return {
    sl,
    tp1,
    tp2,
    tp3,
    pipDistanceSL,
    pipDistanceTP1,
    pipDistanceTP2,
    pipDistanceTP3,
    perAccount,
    totalWin,
    totalLoss,
  };
};

/**
 * Drawdown risk is measured against the account's floor balance (the stop-out
 * line), relative to the buffer between the high-water mark and that floor.
 */
export const riskStatus = (account: Account): RiskStatus => {
  if (account.balance <= account.floorBalance) return 'red';
  const totalBuffer = account.highWaterMark - account.floorBalance;
  if (totalBuffer <= 0) return 'green';
  const used = account.highWaterMark - account.balance;
  const usedRatio = used / totalBuffer;
  if (usedRatio >= 0.75) return 'yellow';
  return 'green';
};

export const drawdownPct = (account: Account): number => {
  const totalBuffer = account.highWaterMark - account.floorBalance;
  if (totalBuffer <= 0) return 0;
  const used = Math.max(account.highWaterMark - account.balance, 0);
  return Math.min(used / totalBuffer, 1) * 100;
};

export const drawdownBufferRemaining = (account: Account): number =>
  Math.max(account.balance - account.floorBalance, 0);

/**
 * Upcomers-style accounts pay out on-demand rather than on a fixed cycle.
 * This estimates what a payout request right now would be worth.
 *
 * grossProfit is raw price P&L only (sum of dollar_amount). netProfit
 * subtracts broker commission and swap — the actual amount that affects
 * real balance and what's really payable. Eligibility and the split
 * amount are based on netProfit, not gross: a trade can show a positive
 * gross result but a near-zero or negative net result once fees are
 * counted, and that net figure is what actually matters for payout.
 */
export const estimatePayout = (account: Account, trades: Trade[]): PayoutEstimate => {
  const accountTrades = trades.filter((t) => t.account_name === account.name);

  const grossProfit = accountTrades.reduce((sum, t) => sum + t.dollar_amount, 0);
  const netProfit = accountTrades.reduce(
    (sum, t) => sum + t.dollar_amount + (t.commission ?? 0) + (t.swap ?? 0),
    0,
  );

  const splitAmount = Math.max(netProfit, 0) * (account.profitSplit / 100);

  return {
    accountId: account.id,
    accountName: account.name,
    grossProfit,
    netProfit,
    splitAmount,
    eligible: netProfit > 0,
  };
};

export const cumulativePayoutTotal = (entries: PayoutEstimate[]): number =>
  entries.reduce((sum, e) => sum + e.splitAmount, 0);

/**
 * Recomputes an account's balance from scratch as startingBalance plus the
 * sum of every logged trade's net effect (dollar_amount + commission + swap)
 * for that account. Commission/swap are typically already-signed costs in
 * MT5 data (negative), so summing them alongside dollar_amount gives the
 * real balance — the same figure the live MT5 account would show. Used
 * after bulk operations like CSV import so balance stays consistent with
 * the log.
 */
export const recalculateBalance = (account: Account, trades: Trade[]): number => {
  const total = trades
    .filter((t) => t.account_name === account.name)
    .reduce((sum, t) => sum + t.dollar_amount + (t.commission ?? 0) + (t.swap ?? 0), 0);
  return account.startingBalance + total;
};

/**
 * Counts distinct calendar dates on which the account logged at least one
 * trade. Reads straight from the trades in storage — not a stored counter.
 */
export const tradingDaysCompleted = (accountName: string, trades: Trade[]): number => {
  const dates = new Set(
    trades.filter((t) => t.account_name === accountName).map((t) => t.trade_date),
  );
  return dates.size;
};

export type ConsistencyCheck = {
  accountName: string;
  totalProfit: number;
  maxDayProfit: number;
  maxDayDate: string | null;
  maxDayPercent: number;
  limit: number;
  breached: boolean;
};

/**
 * Consistency rule: no single calendar day's profit may account for more
 * than the account's consistencyLimit percentage of total profit across all
 * trading days. Recompute this after every trade is logged.
 */
export const checkConsistency = (account: Account, trades: Trade[]): ConsistencyCheck => {
  const accountTrades = trades.filter((t) => t.account_name === account.name);

  const dailyTotals = new Map<string, number>();
  for (const t of accountTrades) {
    dailyTotals.set(t.trade_date, (dailyTotals.get(t.trade_date) ?? 0) + t.dollar_amount);
  }

  const totalProfit = [...dailyTotals.values()].reduce((sum, v) => sum + v, 0);

  let maxDayProfit = 0;
  let maxDayDate: string | null = null;
  for (const [date, profit] of dailyTotals.entries()) {
    if (profit > maxDayProfit) {
      maxDayProfit = profit;
      maxDayDate = date;
    }
  }

  const maxDayPercent = totalProfit > 0 ? (maxDayProfit / totalProfit) * 100 : 0;
  const breached = totalProfit > 0 && maxDayPercent > account.consistencyLimit;

  return {
    accountName: account.name,
    totalProfit,
    maxDayProfit,
    maxDayDate,
    maxDayPercent,
    limit: account.consistencyLimit,
    breached,
  };
};

export type ConsistencyStatus = 'safe' | 'warning' | 'breached' | 'early';

/**
 * Maps a ConsistencyCheck onto a graduated display state (used by both the
 * Account Dashboard cards and the Payout Tracker) — the single place that
 * decides what counts as "safe" vs "warning" vs "breached". No consistency
 * math lives here, only the display-state thresholds.
 */
export const consistencyDisplayStatus = (
  check: ConsistencyCheck,
  dayCount: number,
): ConsistencyStatus => {
  if (check.totalProfit <= 0) return 'early';
  if (check.breached) return 'breached';
  const warningThreshold = check.limit - 5;
  if (check.maxDayPercent >= warningThreshold) return 'warning';
  if (dayCount < 2) return 'early';
  return 'safe';
};

// Length of a reference period cycle, counted from the account's start
// date. Upcomers' exact reference-period length wasn't specified — 30
// days is the most common convention for this kind of rule at prop
// firms, used here as the default. Adjust this constant if your actual
// agreement specifies a different length.
export const REFERENCE_PERIOD_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type ReferencePeriodStatus = {
  cycleNumber: number;
  cycleStartDate: string;
  cycleEndDate: string;
  daysRemaining: number;
  daysElapsed: number;
};

/**
 * The reference period is a recurring window (REFERENCE_PERIOD_DAYS long)
 * counted from the account's start date — cycle 1 is days 0-30, cycle 2 is
 * days 30-60, and so on. Returns which cycle "today" falls in and how many
 * days remain in it.
 */
export const referencePeriodStatus = (account: Account, today: Date = new Date()): ReferencePeriodStatus => {
  const start = new Date(`${account.startDate}T00:00:00Z`);
  const daysSinceStart = Math.max(0, Math.floor((today.getTime() - start.getTime()) / MS_PER_DAY));

  const cycleNumber = Math.floor(daysSinceStart / REFERENCE_PERIOD_DAYS) + 1;
  const daysElapsed = daysSinceStart % REFERENCE_PERIOD_DAYS;
  const daysRemaining = REFERENCE_PERIOD_DAYS - daysElapsed;

  const cycleStart = new Date(start.getTime() + (cycleNumber - 1) * REFERENCE_PERIOD_DAYS * MS_PER_DAY);
  const cycleEnd = new Date(cycleStart.getTime() + REFERENCE_PERIOD_DAYS * MS_PER_DAY);

  return {
    cycleNumber,
    cycleStartDate: cycleStart.toISOString().slice(0, 10),
    cycleEndDate: cycleEnd.toISOString().slice(0, 10),
    daysRemaining,
    daysElapsed,
  };
};

export type FirstWithdrawalStatus = {
  firstTradeDate: string | null;
  eligibleDate: string | null;
  daysRemaining: number | null;
  eligible: boolean;
};

// Days after the first logged trade before a first withdrawal can be
// requested, per the stated rule.
export const FIRST_WITHDRAWAL_WAIT_DAYS = 14;

/**
 * First withdrawal eligibility: FIRST_WITHDRAWAL_WAIT_DAYS after the
 * account's very first logged trade (not the account start date — the
 * clock only starts once trading actually begins). Returns nulls if no
 * trades have been logged yet, since there's no date to count from.
 */
export const firstWithdrawalStatus = (
  accountName: string,
  trades: Trade[],
  today: Date = new Date(),
): FirstWithdrawalStatus => {
  const accountTrades = trades.filter((t) => t.account_name === accountName);
  if (accountTrades.length === 0) {
    return { firstTradeDate: null, eligibleDate: null, daysRemaining: null, eligible: false };
  }

  const firstTradeDate = accountTrades.reduce(
    (earliest, t) => (t.trade_date < earliest ? t.trade_date : earliest),
    accountTrades[0].trade_date,
  );

  const firstTrade = new Date(`${firstTradeDate}T00:00:00Z`);
  const eligible = new Date(firstTrade.getTime() + FIRST_WITHDRAWAL_WAIT_DAYS * MS_PER_DAY);
  const daysRemaining = Math.max(0, Math.ceil((eligible.getTime() - today.getTime()) / MS_PER_DAY));

  return {
    firstTradeDate,
    eligibleDate: eligible.toISOString().slice(0, 10),
    daysRemaining,
    eligible: daysRemaining <= 0,
  };
};

/**
 * Hold duration in seconds, or null if either timestamp is missing —
 * manually-logged trades have no time-of-day, only CSV-imported ones do.
 */
export const holdSeconds = (trade: Trade): number | null => {
  if (!trade.open_time || !trade.close_time) return null;
  const open = new Date(trade.open_time).getTime();
  const close = new Date(trade.close_time).getTime();
  if (Number.isNaN(open) || Number.isNaN(close)) return null;
  return Math.max(0, (close - open) / 1000);
};

// Trades held under this many seconds are flagged as a possible
// prohibited scalping strategy.
export const PROHIBITED_HOLD_SECONDS = 60;

/**
 * True if a trade's hold time is below the prohibited threshold. Null
 * (not true/false) when hold time can't be determined — this must never
 * be treated as "not prohibited" by a caller, only as "unknown."
 */
export const isProhibitedHoldTime = (trade: Trade): boolean | null => {
  const seconds = holdSeconds(trade);
  if (seconds === null) return null;
  return seconds < PROHIBITED_HOLD_SECONDS;
};
