import type { Account, PayoutEntry, RRKey, RiskStatus } from '@/types';

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
    const winAtTP1 = pipDistanceTP1 * account.pip_value;
    const winAtTP2 = pipDistanceTP2 * account.pip_value;
    const winAtTP3 = pipDistanceTP3 * account.pip_value;
    const lossAtSL = pipDistanceSL * account.pip_value;
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

export const riskStatus = (dailyPnl: number, dailyLossLimit: number): RiskStatus => {
  const loss = Math.min(dailyPnl, 0);
  const usedRatio = Math.abs(loss) / dailyLossLimit;
  if (usedRatio >= 1.0) return 'red';
  if (usedRatio >= 0.75) return 'yellow';
  return 'green';
};

export const drawdownPct = (dailyPnl: number, dailyLossLimit: number): number => {
  const loss = Math.min(dailyPnl, 0);
  return Math.min(Math.abs(loss) / dailyLossLimit, 1) * 100;
};

export const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

export const isWeekend = (date: Date): boolean => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

export const isTradingDay = (date: Date): boolean => !isWeekend(date);

const cycleDays = (cycle: Account['payout_cycle']): number => {
  switch (cycle) {
    case 'every_5_days':
      return 5;
    case 'weekly':
      return 7;
    case 'every_14_days':
      return 14;
    default:
      return 5;
  }
};

export const generatePayouts = (
  accounts: Account[],
  startDate: Date,
  dayCount = 90,
): PayoutEntry[] => {
  const entries: PayoutEntry[] = [];

  for (const account of accounts) {
    const funded = new Date(account.funded_date);
    const startCursor = funded < startDate ? new Date(startDate) : new Date(funded);
    const cycle = cycleDays(account.payout_cycle);
    const cycleLabel = account.payout_cycle;

    if (cycleLabel === 'weekly') {
      const firstPayout = addDays(funded, 7);
      let cursor = firstPayout;
      const end = addDays(startDate, dayCount);
      while (cursor <= end) {
        entries.push(buildPayout(account, new Date(cursor)));
        cursor = addDays(cursor, 7);
      }
    } else {
      // every N trading days after funded
      const firstPayout = nthTradingDayAfter(funded, cycle);
      let cursor = firstPayout;
      const end = addDays(startDate, dayCount);
      while (cursor <= end) {
        entries.push(buildPayout(account, new Date(cursor)));
        cursor = nthTradingDayAfter(cursor, cycle);
      }
    }
  }

  return entries.sort((a, b) => a.date.getTime() - b.date.getTime());
};

const nthTradingDayAfter = (from: Date, n: number): Date => {
  let cursor = new Date(from);
  let found = 0;
  while (found < n) {
    cursor = addDays(cursor, 1);
    if (isTradingDay(cursor)) found++;
  }
  return cursor;
};

const buildPayout = (account: Account, date: Date): PayoutEntry => {
  const gross = account.projected_profit;
  const splitAmount = gross * account.payout_split;
  const flatFee = account.payout_flat_fee;
  const cryptoFee = splitAmount * account.payout_crypto_fee_pct;
  const net = splitAmount - flatFee - cryptoFee;
  return {
    date,
    accountName: account.name,
    gross,
    net,
    fee: flatFee + cryptoFee,
    splitAmount,
  };
};

export const cumulativeTotal = (entries: PayoutEntry[]): number =>
  entries.reduce((sum, e) => sum + e.net, 0);

export const monthName = (date: Date): string =>
  date.toLocaleString('en-US', { month: 'short' });

export const dayNumber = (date: Date): number => date.getDate();

export const formatDate = (date: Date): string =>
  date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export const formatDateShort = (date: Date): string =>
  date.toLocaleString('en-US', { month: 'short', day: 'numeric' });
