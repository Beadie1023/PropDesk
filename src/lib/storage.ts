import type { Account, Trade } from '@/types';

const ACCOUNTS_KEY = 'propdesk:accounts';
const TRADES_KEY = 'propdesk:trades';
const SEED_FLAG_KEY = 'propdesk:seeded';

const SEED_ACCOUNTS: Account[] = [
  {
    id: 'acc-ember',
    name: 'Ember',
    lots: 0.16,
    pip_value: 8.0,
    daily_loss_limit: 80,
    starting_balance: 10000,
    balance: 10250,
    daily_pnl: -55,
    payout_split: 0.99,
    payout_cycle: 'every_5_days',
    payout_flat_fee: 19.9,
    payout_crypto_fee_pct: 0.0249,
    funded_date: '2026-08-04',
    projected_profit: 600,
    sort_order: 1,
  },
  {
    id: 'acc-alpha',
    name: 'Alpha Capital',
    lots: 0.05,
    pip_value: 2.5,
    daily_loss_limit: 75,
    starting_balance: 10000,
    balance: 10100,
    daily_pnl: -30,
    payout_split: 0.8,
    payout_cycle: 'every_5_days',
    payout_flat_fee: 0,
    payout_crypto_fee_pct: 0,
    funded_date: '2026-08-04',
    projected_profit: 500,
    sort_order: 2,
  },
  {
    id: 'acc-blueguardian',
    name: 'Blue Guardian',
    lots: 0.1,
    pip_value: 5.0,
    daily_loss_limit: 200,
    starting_balance: 10000,
    balance: 10800,
    daily_pnl: -160,
    payout_split: 0.9,
    payout_cycle: 'weekly',
    payout_flat_fee: 0,
    payout_crypto_fee_pct: 0,
    funded_date: '2026-08-04',
    projected_profit: 700,
    sort_order: 3,
  },
  {
    id: 'acc-fundednext',
    name: 'FundedNext',
    lots: 0.1,
    pip_value: 5.0,
    daily_loss_limit: 200,
    starting_balance: 10000,
    balance: 9800,
    daily_pnl: -200,
    payout_split: 0.9,
    payout_cycle: 'every_14_days',
    payout_flat_fee: 0,
    payout_crypto_fee_pct: 0,
    funded_date: '2026-08-04',
    projected_profit: 900,
    sort_order: 4,
  },
];

const SEED_TRADES: Trade[] = [
  {
    id: 'seed-1',
    trade_date: '2026-08-01',
    pair: 'EUR/USD',
    direction: 'long',
    rr_used: '1:3',
    entry_price: 1.085,
    sl: 1.084,
    tp1: 1.087,
    tp2: 1.088,
    result: 'win',
    dollar_amount: 120,
    notes: 'London breakout, clean move',
    account_name: 'Ember',
  },
  {
    id: 'seed-2',
    trade_date: '2026-08-01',
    pair: 'GBP/USD',
    direction: 'short',
    rr_used: '1:2',
    entry_price: 1.272,
    sl: 1.273,
    tp1: 1.27,
    tp2: 1.269,
    result: 'loss',
    dollar_amount: -50,
    notes: 'Stop hit, news spike reversed entry',
    account_name: 'Alpha Capital',
  },
  {
    id: 'seed-3',
    trade_date: '2026-08-01',
    pair: 'USD/JPY',
    direction: 'long',
    rr_used: '1:4',
    entry_price: 149.8,
    sl: 149.7,
    tp1: 150.0,
    tp2: 150.1,
    result: 'win',
    dollar_amount: 200,
    notes: 'Tokyo session continuation',
    account_name: 'Blue Guardian',
  },
  {
    id: 'seed-4',
    trade_date: '2026-08-01',
    pair: 'XAU/USD',
    direction: 'long',
    rr_used: '1:3',
    entry_price: 2385,
    sl: 2375,
    tp1: 2405,
    tp2: 2415,
    result: 'win',
    dollar_amount: 135,
    notes: 'Gold momentum, partial at TP1',
    account_name: 'Ember',
  },
  {
    id: 'seed-5',
    trade_date: '2026-08-01',
    pair: 'AUD/USD',
    direction: 'short',
    rr_used: '1:2',
    entry_price: 0.655,
    sl: 0.656,
    tp1: 0.653,
    tp2: 0.652,
    result: 'loss',
    dollar_amount: -40,
    notes: 'False breakdown, stopped out',
    account_name: 'FundedNext',
  },
  {
    id: 'seed-6',
    trade_date: '2026-07-31',
    pair: 'EUR/GBP',
    direction: 'long',
    rr_used: '1:3',
    entry_price: 0.852,
    sl: 0.851,
    tp1: 0.854,
    tp2: 0.855,
    result: 'win',
    dollar_amount: 75,
    notes: 'Range continuation',
    account_name: 'Alpha Capital',
  },
  {
    id: 'seed-7',
    trade_date: '2026-07-31',
    pair: 'USD/CAD',
    direction: 'short',
    rr_used: '1:4',
    entry_price: 1.378,
    sl: 1.379,
    tp1: 1.376,
    tp2: 1.375,
    result: 'win',
    dollar_amount: 180,
    notes: 'Oil-driven CAD strength',
    account_name: 'Blue Guardian',
  },
  {
    id: 'seed-8',
    trade_date: '2026-07-31',
    pair: 'NZD/USD',
    direction: 'long',
    rr_used: '1:2',
    entry_price: 0.598,
    sl: 0.597,
    tp1: 0.6,
    tp2: 0.601,
    result: 'loss',
    dollar_amount: -50,
    notes: 'RBNZ reaction faded',
    account_name: 'FundedNext',
  },
];

export const genId = (): string =>
  `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const loadAccounts = (): Account[] => {
  ensureSeed();
  const raw = localStorage.getItem(ACCOUNTS_KEY);
  if (!raw) return [...SEED_ACCOUNTS];
  try {
    const parsed = JSON.parse(raw) as Account[];
    return parsed.sort((a, b) => a.sort_order - b.sort_order);
  } catch {
    return [...SEED_ACCOUNTS];
  }
};

export const saveAccounts = (accounts: Account[]): void => {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
};

export const loadTrades = (): Trade[] => {
  ensureSeed();
  const raw = localStorage.getItem(TRADES_KEY);
  if (!raw) return [...SEED_TRADES];
  try {
    const parsed = JSON.parse(raw) as Trade[];
    return sortTrades(parsed);
  } catch {
    return [...SEED_TRADES];
  }
};

export const saveTrades = (trades: Trade[]): void => {
  localStorage.setItem(TRADES_KEY, JSON.stringify(trades));
};

export const resetToSeed = (): void => {
  localStorage.removeItem(ACCOUNTS_KEY);
  localStorage.removeItem(TRADES_KEY);
  localStorage.removeItem(SEED_FLAG_KEY);
  ensureSeed();
};

const sortTrades = (trades: Trade[]): Trade[] =>
  [...trades].sort((a, b) => {
    if (a.trade_date !== b.trade_date) {
      return a.trade_date < b.trade_date ? 1 : -1;
    }
    return 0;
  });

const ensureSeed = (): void => {
  const flagged = localStorage.getItem(SEED_FLAG_KEY);
  if (flagged === '1') return;
  if (!localStorage.getItem(ACCOUNTS_KEY)) {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(SEED_ACCOUNTS));
  }
  if (!localStorage.getItem(TRADES_KEY)) {
    localStorage.setItem(TRADES_KEY, JSON.stringify(SEED_TRADES));
  }
  localStorage.setItem(SEED_FLAG_KEY, '1');
};
