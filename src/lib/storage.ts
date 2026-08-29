import type { Account, Trade } from '@/types';
import { supabase } from '@/lib/supabaseClient';

// --- Legacy localStorage keys ----------------------------------------------
// These are read-only now, purely to migrate whatever's sitting in a
// browser's localStorage (from before this file moved to Supabase) up
// to the database exactly once. New data never gets written here.
const LEGACY_ACCOUNTS_KEY = 'propdesk:accounts';
const LEGACY_TRADES_KEY = 'propdesk:trades';
const MIGRATION_FLAG_KEY = 'propdesk:migrated-to-supabase';

const SEED_ACCOUNTS: Account[] = [
  {
    id: 'ember-upcomers',
    name: 'Ember',
    firm: 'Upcomers',
    type: 'Instant Funded',
    // Matches the real Upcomers dashboard snapshot (2026-08-19): current
    // balance $2,001.31, high-water mark $2,002.48 (still the 2026-08-13
    // peak — no new high since). Starting balance and floorBalance stay
    // as the account's original seed values — the real stop-out floor is
    // computed live via currentFloorBalance() in trading.ts, which
    // tracks the high-water mark as it moves.
    balance: 2001.31,
    startingBalance: 2000,
    highWaterMark: 2002.48,
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
// produces (56.56%) matches Upcomers' own dashboard exactly. Used only
// as the seed for a brand-new (empty) Supabase project — see
// migrateLegacyDataIfNeeded below.
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
  {
    id: 'ember-real-3',
    trade_date: '2026-08-14',
    pair: 'GBPAUD',
    direction: 'long',
    rr_used: '',
    entry_price: 1.91184,
    sl: 1.91037,
    tp1: 1.91435,
    tp2: 1.91435,
    close_price: 1.91032,
    lots: 0.01,
    result: 'loss',
    dollar_amount: -1.07,
    commission: -0.05,
    swap: 0,
    open_time: '2026-08-14T03:38:14Z',
    close_time: '2026-08-14T07:50:29Z',
    notes: 'Real trade — added manually from MT5 history (no CSV export available)',
    account_name: 'Ember',
    source: 'manual',
  },
  {
    id: 'ember-real-4',
    trade_date: '2026-08-19',
    pair: 'GBPAUD',
    direction: 'short',
    rr_used: '',
    entry_price: 1.91198,
    sl: 1.91435,
    tp1: 1.91037,
    tp2: 1.91037,
    close_price: 1.91193,
    lots: 0.01,
    result: 'loss',
    dollar_amount: 0.04,
    commission: -0.05,
    swap: 0,
    open_time: '2026-08-19T15:12:39Z',
    close_time: '2026-08-19T16:31:50Z',
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

/**
 * Reads whatever this browser's localStorage has under the old keys, if
 * anything. Returns null for a piece of data that's missing or invalid —
 * callers fall back to the hardcoded seed in that case, same as the old
 * localStorage-only implementation did.
 */
const readLegacyLocalData = (): { accounts: Account[] | null; trades: Trade[] | null } => {
  let accounts: Account[] | null = null;
  let trades: Trade[] | null = null;

  try {
    const raw = localStorage.getItem(LEGACY_ACCOUNTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown[];
      if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(isValidAccount)) {
        accounts = parsed;
      }
    }
  } catch {
    // Leave accounts as null — falls back to seed.
  }

  try {
    const raw = localStorage.getItem(LEGACY_TRADES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Trade[];
      if (Array.isArray(parsed)) trades = parsed;
    }
  } catch {
    // Leave trades as null — falls back to seed.
  }

  return { accounts, trades };
};

/**
 * Runs once per browser. If the Supabase tables are empty, pushes up
 * whatever this browser's localStorage has (or the hardcoded seed, if
 * this is a genuinely fresh browser) so existing data isn't lost when
 * switching over from the old localStorage-only version of this app.
 * Marks itself done in localStorage afterward so it never re-runs and
 * never re-uploads/duplicates rows on a later visit.
 *
 * Deliberately checks "is Supabase empty" rather than "have I migrated
 * before" as the actual safety condition — if another browser/device
 * already populated the database, this browser's local copy (which
 * could be stale) is never pushed over it.
 */
const migrateLegacyDataIfNeeded = async (): Promise<void> => {
  if (localStorage.getItem(MIGRATION_FLAG_KEY) === '1') return;

  const { count, error: countError } = await supabase
    .from('accounts')
    .select('id', { count: 'exact', head: true });

  if (countError) {
    // Can't confirm the table is empty — skip migration this run rather
    // than risk a duplicate push once connectivity is back. Will retry
    // on the next load since the flag isn't set yet.
    return;
  }

  if (count === 0) {
    const legacy = readLegacyLocalData();
    const accountsToSeed = legacy.accounts ?? SEED_ACCOUNTS;
    const tradesToSeed = legacy.trades ?? SEED_TRADES;

    const { error: accountsError } = await supabase.from('accounts').insert(accountsToSeed);
    const { error: tradesError } = await supabase.from('trades').insert(tradesToSeed);

    if (accountsError || tradesError) {
      // Leave the flag unset so this is retried on the next load rather
      // than silently leaving Supabase half-seeded.
      return;
    }
  }

  localStorage.setItem(MIGRATION_FLAG_KEY, '1');
};

export const loadAccounts = async (): Promise<Account[]> => {
  await migrateLegacyDataIfNeeded();

  const { data, error } = await supabase.from('accounts').select('*');
  if (error) throw new Error(`Failed to load accounts: ${error.message}`);
  return (data ?? []) as Account[];
};

export const saveAccounts = async (accounts: Account[]): Promise<void> => {
  const { error } = await supabase.from('accounts').upsert(accounts, { onConflict: 'id' });
  if (error) throw new Error(`Failed to save accounts: ${error.message}`);
};

export const loadTrades = async (): Promise<Trade[]> => {
  await migrateLegacyDataIfNeeded();

  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .order('trade_date', { ascending: false });
  if (error) throw new Error(`Failed to load trades: ${error.message}`);
  return (data ?? []) as Trade[];
};

export const saveTrades = async (trades: Trade[]): Promise<void> => {
  const { error } = await supabase.from('trades').upsert(trades, { onConflict: 'id' });
  if (error) throw new Error(`Failed to save trades: ${error.message}`);
};

/**
 * Deletes a single trade by id. This is the correct removal path —
 * saveTrades only upserts, so it can't remove a row Supabase already
 * has.
 */
export const deleteTradeById = async (id: string): Promise<void> => {
  const { error } = await supabase.from('trades').delete().eq('id', id);
  if (error) throw new Error(`Failed to delete trade: ${error.message}`);
};

/**
 * Wipes both tables and reseeds them. Useful for testing/debugging —
 * not wired to any UI button by default.
 */
export const resetToSeed = async (): Promise<void> => {
  await supabase.from('trades').delete().neq('id', '');
  await supabase.from('accounts').delete().neq('id', '');
  await supabase.from('accounts').insert(SEED_ACCOUNTS);
  await supabase.from('trades').insert(SEED_TRADES);
  localStorage.setItem(MIGRATION_FLAG_KEY, '1');
};
