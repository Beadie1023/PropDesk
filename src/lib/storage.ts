import type { Account, Trade } from '@/types';

const ACCOUNTS_KEY = 'propdesk:accounts';
const TRADES_KEY = 'propdesk:trades';
const SEED_FLAG_KEY = 'propdesk:seeded';

// Bump this whenever the Account/Trade shape changes. Anyone with older
// cached localStorage data (e.g. from before the drawdown-model rewrite)
// gets reseeded automatically instead of crashing on missing fields.
const SCHEMA_VERSION = '4';

const SEED_ACCOUNTS: Account[] = [
  {
    id: 'ember-upcomers',
    name: 'Ember',
    firm: 'Upcomers',
    type: 'Instant Funded',
    // Matches the real Upcomers dashboard snapshot (2026-08-13): current
    // balance $2,002.44, high-water mark $2,002.44. Starting balance and
    // floorBalance stay as the account's original seed values — the real
    // stop-out floor is now computed live via currentFloorBalance() in
    // trading.ts, which tracks the high-water mark as it moves.
    balance: 2002.44,
    startingBalance: 2000,
    highWaterMark: 2002.44,
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

// Real trades from MT5 history (added manually — no CSV export available
// at the time). Verified: net profit ($1.06 + $1.38 = $2.44) matches the
// real account's Current Profit exactly, and the consistency % this
// produces (56.56%) matches Upcomers' own dashboard exactly.
const SEED_TRADES: Trade[] = [
  {
    id: 'ember-real-1',
    trade_date: '2026-08-06',
    pair: 'GBPAUD',
    direction: 'long',
    rr_used: '',
    entry_price: 1.91197,
    sl: 1.91055,
    tp1: 1.91355,
    tp2: 1.91355,
    close_price: 1.91355,
    lots: 0.01,
    result: 'win',
    dollar_amount: 1.11,
    commission: -0.05,
    swap: 0,
    open_time: '2026-08-06T13:08:22Z',
    close_time: '2026-08-06T14:49:48Z',
    notes: 'Real trade — added manually from MT5 history (no CSV export available)',
    account_name: 'Ember',
    source: 'manual',
  },
  {
    id: 'ember-real-2',
    trade_date: '2026-08-13',
    pair: 'GBPAUD',
    direction: 'long',
    rr_used: '',
    entry_price: 1.91230,
    sl: 1.91032,
    tp1: 1.91432,
    tp2: 1.91432,
    close_price: 1.91432,
    lots: 0.01,
    result: 'win',
    dollar_amount: 1.43,
    commission: -0.05,
    swap: 0,
    open_time: '2026-08-13T03:21:26Z',
    close_time: '2026-08-13T06:22:41Z',
    notes: 'Real trade — added manually from MT5 history (no CSV export available)',
    account_name: 'Ember',
    source: 'manual',
  },
];

export const genId = (): string =>
  `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const isValidAccount = (a: unknown): a is Account => {
  if (typeof a !== 'object' || a === null) return false;
  const acc = a as Record<string, unknown>;
  return (
    typeof acc.floorBalance === 'number' &&
    typeof acc.highWaterMark === 'number' &&
    typeof acc.maxDrawdownPercent === 'number' &&
    typeof acc.consistencyLimit === 'number' &&
    typeof acc.lots === 'number' &&
    typeof acc.pipValue === 'number'
  );
};

export const loadAccounts = (): Account[] => {
  ensureSeed();
  const raw = localStorage.getItem(ACCOUNTS_KEY);
  if (!raw) return [...SEED_ACCOUNTS];
  try {
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(isValidAccount)) {
      saveAccounts(SEED_ACCOUNTS);
      return [...SEED_ACCOUNTS];
    }
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
  if (flagged === SCHEMA_VERSION) return;
  // Schema changed (or first run) — reseed both accounts and trades so
  // stale/incompatible cached data doesn't linger.
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(SEED_ACCOUNTS));
  localStorage.setItem(TRADES_KEY, JSON.stringify(SEED_TRADES));
  localStorage.setItem(SEED_FLAG_KEY, SCHEMA_VERSION);
};
