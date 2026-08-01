export type Account = {
  id: string;
  name: string;
  lots: number;
  pip_value: number;
  daily_loss_limit: number;
  starting_balance: number;
  balance: number;
  daily_pnl: number;
  payout_split: number;
  payout_cycle: 'every_5_days' | 'weekly' | 'every_14_days';
  payout_flat_fee: number;
  payout_crypto_fee_pct: number;
  funded_date: string;
  projected_profit: number;
  sort_order: number;
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
};

export type RiskStatus = 'green' | 'yellow' | 'red';

export type RRKey = '1:2' | '1:3' | '1:4';

export type PayoutEntry = {
  date: Date;
  accountName: string;
  gross: number;
  net: number;
  fee: number;
  splitAmount: number;
};
