import type { Account, Trade } from '@/types';

const ACCOUNTS_KEY = 'propdesk:accounts';
const TRADES_KEY = 'propdesk:trades';
const SEED_FLAG_KEY = 'propdesk:seeded';

const SEED_ACCOUNTS: Account[] = [
  {
    id: 'ember-upcomers',
    name: 'Ember',
    firm: 'Upcomers',
    type: 'Instant Funded',
    balance: 2000,
    startingBalance: 2000,
    highWaterMark: 2000,
    floorBalance: 1920,
    maxDrawdownPercent: 4,
    profitSplit: 80,
    minTradingDays: 5,
    consistencyLimit: 20,
    phase: 'Ongoing',
    startDate: '2026-07-30',
    status: 'active',
    lots: 0.01,
    pipValue: 0.1,
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
];

export const genId = (): string =>
  `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const loadAccounts = (): Account[] => {
  ensureSeed();
  const raw = localStorage.getItem(ACCOUNTS_KEY);
  if (!raw) return [...SEED_ACCOUNTS];
  try {
    const parsed = JSON.parse(raw) as Account[];
    return parsed;
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
