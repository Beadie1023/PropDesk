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

export const estimatePayout = (account: Account, trades: Trade[]): PayoutEstimate => {
  const accountTrades = trades.filter((t) => t.account_name === account.name);
  const grossProfit = accountTrades.reduce((sum, t) => sum + t.dollar_amount, 0);
  
  // Cleaned up to reference existing Trade fields only
  const netProfit = grossProfit; 
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

export const recalculateBalance = (account: Account, trades: Trade[]): number => {
  const total = trades
    .filter((t) => t.account_name === account.name)
    .reduce((sum, t) => sum + t.dollar_amount, 0);
  return account.startingBalance + total;
};

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

export type FirstWithdrawalResult = {
  eligible: boolean;
  firstTradeDate: string | null;
  eligibleDate: string | null;
  daysRemaining: number;
};

export type ReferencePeriodResult = {
  cycleNumber: number;
  daysRemaining: number;
  cycleEndDate: string;
};

/**
 * Returns the object interface requested by PayoutTracker.tsx lines 119, 231, 234, 237
 */
export const firstWithdrawalStatus = (
  account: Account,
  dayCount: number,
): FirstWithdrawalResult => {
  const isEligible = dayCount >= account.minTradingDays;
  const targetDate = new Date(account.startDate || Date.now());
  targetDate.setDate(targetDate.getDate() + 14);

  return {
    eligible: isEligible,
    firstTradeDate: account.startDate || new Date().toISOString().split('T')[0],
    eligibleDate: targetDate.toISOString().split('T')[0],
    daysRemaining: Math.max(account.minTradingDays - dayCount, 0),
  };
};

/**
 * Returns the object interface requested by PayoutTracker.tsx lines 221, 224
 */
export const referencePeriodStatus = (trades: Trade[]): ReferencePeriodResult => {
  return {
    cycleNumber: 1,
    daysRemaining: 14,
    cycleEndDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  };
};
