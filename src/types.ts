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
  // Note: commission and swap are removed from here as they do not exist in your MT5 logs
};

export type RiskStatus = 'green' | 'yellow' | 'red';

export type RRKey = '1:2' | '1:3' | '1:4';

export type PayoutEstimate = {
  accountId: string;
  accountName: string;
  grossProfit: number;
  netProfit: number; // Added to avoid TS2353 object literal restrictions
  splitAmount: number;
  eligible: boolean;
};
