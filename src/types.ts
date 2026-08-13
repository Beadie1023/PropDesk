export type Account = {
  id: string;
  name: string;
  firm: string;
  type: string;
  balance: number;
  startingBalance: number;
  highWaterMark: number;
  floorBalance: number;
  maxDrawdownPercent: number;
  profitSplit: number;
  minTradingDays: number;
  consistencyLimit: number;
  phase: string;
  startDate: string;
  status: 'active' | 'inactive' | 'breached';
  lots: number;
  pipValue: number;
};

export type Trade = {
  id: string;
  trade_date: string;
  pair: string;
  direction: 'long' | 'short';
  rr_used: string;
  entry_price: number;
  sl: number;
  tp1: number;
  tp2: number;
  result: 'win' | 'loss';
  dollar_amount: number;
  notes: string;
  account_name: string;
  close_price?: number;
  lots?: number;
  source?: 'manual' | 'mt5_import';
  // Broker-side costs, from MT5's Commission/Swap columns. Undefined for
  // manually-logged trades (no fee data available for those).
  commission?: number;
  swap?: number;
  // Full ISO datetimes, when available (MT5 CSV imports only — manual
  // entries have no time-of-day). Needed to compute hold duration.
  open_time?: string;
  close_time?: string;
};

export type RiskStatus = 'green' | 'yellow' | 'red';

export type RRKey = '1:2' | '1:3' | '1:4';

export type PayoutEstimate = {
  accountId: string;
  accountName: string;
  grossProfit: number;
  netProfit: number;
  splitAmount: number;
  eligible: boolean;
};
