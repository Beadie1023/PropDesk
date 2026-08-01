/*
# Create accounts and trades tables for PropDesk

1. New Tables
- `accounts` — the four funded prop-trading accounts. Stores lot size, pip value,
  daily loss limit, current/starting balance, daily P&L, payout rules (split %,
  cycle, flat fee, crypto fee %), funded date, and a configurable projected profit
  per payout cycle used by the Payout Tracker.
- `trades` — the Session Journal trade log. One row per trade with date, pair,
  direction, R:R used, entry/SL/TP prices, result, dollar amount, notes, and the
  account the trade was placed on.

2. Security
- Enable RLS on both tables.
- Single-tenant app with no sign-in, so CRUD is open to anon + authenticated
  (the data is intentionally shared / operator-owned).

3. Notes
- Seed data inserts the four accounts with the lot sizes, pip values, daily loss
  limits, and payout rules specified for PropDesk. Daily P&L values are set to
  demonstrate green / yellow / red states across the dashboard and risk panel.
- Uses ON CONFLICT DO NOTHING so re-running the migration does not duplicate rows.
*/

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  lots numeric NOT NULL DEFAULT 0,
  pip_value numeric NOT NULL DEFAULT 0,
  daily_loss_limit numeric NOT NULL DEFAULT 0,
  starting_balance numeric NOT NULL DEFAULT 0,
  balance numeric NOT NULL DEFAULT 0,
  daily_pnl numeric NOT NULL DEFAULT 0,
  payout_split numeric NOT NULL DEFAULT 1.0,
  payout_cycle text NOT NULL DEFAULT 'every_5_days',
  payout_flat_fee numeric NOT NULL DEFAULT 0,
  payout_crypto_fee_pct numeric NOT NULL DEFAULT 0,
  funded_date date NOT NULL DEFAULT '2026-08-04',
  projected_profit numeric NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_accounts" ON accounts;
CREATE POLICY "anon_select_accounts" ON accounts FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_accounts" ON accounts;
CREATE POLICY "anon_insert_accounts" ON accounts FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_accounts" ON accounts;
CREATE POLICY "anon_update_accounts" ON accounts FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_accounts" ON accounts;
CREATE POLICY "anon_delete_accounts" ON accounts FOR DELETE
  TO anon, authenticated USING (true);


CREATE TABLE IF NOT EXISTS trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_date date NOT NULL DEFAULT CURRENT_DATE,
  pair text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('long', 'short')),
  rr_used text NOT NULL,
  entry_price numeric NOT NULL,
  sl numeric NOT NULL,
  tp1 numeric NOT NULL,
  tp2 numeric NOT NULL,
  result text NOT NULL CHECK (result IN ('win', 'loss')),
  dollar_amount numeric NOT NULL,
  notes text NOT NULL DEFAULT '',
  account_name text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE trades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_trades" ON trades;
CREATE POLICY "anon_select_trades" ON trades FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_trades" ON trades;
CREATE POLICY "anon_insert_trades" ON trades FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_trades" ON trades;
CREATE POLICY "anon_update_trades" ON trades FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_trades" ON trades;
CREATE POLICY "anon_delete_trades" ON trades FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_trades_date ON trades (trade_date DESC);

-- Seed the four funded accounts
INSERT INTO accounts (name, lots, pip_value, daily_loss_limit, starting_balance, balance, daily_pnl, payout_split, payout_cycle, payout_flat_fee, payout_crypto_fee_pct, funded_date, projected_profit, sort_order)
VALUES
  ('Ember',          0.16, 8.00, 80,  10000, 10250, -55,  0.99, 'every_5_days',  19.90, 0.0249, '2026-08-04', 600, 1),
  ('Alpha Capital',  0.05, 2.50, 75,  10000, 10100, -30,  0.80, 'every_5_days',  0,     0,      '2026-08-04', 500, 2),
  ('Blue Guardian',  0.10, 5.00, 200, 10000, 10800, -160, 0.90, 'weekly',        0,     0,      '2026-08-04', 700, 3),
  ('FundedNext',     0.10, 5.00, 200, 10000, 9800,  -200, 0.90, 'every_14_days', 0,     0,      '2026-08-04', 900, 4)
ON CONFLICT (name) DO NOTHING;
