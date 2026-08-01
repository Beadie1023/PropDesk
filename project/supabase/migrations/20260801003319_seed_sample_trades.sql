/*
# Seed sample trades for the Session Journal

1. New Tables
- None.

2. Changes
- Inserts a handful of representative journal rows across the four accounts so the
  Session Journal (Module 5) is not empty on first load: a mix of wins and losses,
  long/short, different R:R settings, and notes.

3. Security
- No changes. Trades table RLS already allows anon CRUD.
*/

INSERT INTO trades (trade_date, pair, direction, rr_used, entry_price, sl, tp1, tp2, result, dollar_amount, notes, account_name)
VALUES
  ('2026-08-01', 'EUR/USD', 'long',  '1:3', 1.0850, 1.0840, 1.0870, 1.0880, 'win',  120.00, 'London breakout, clean move',         'Ember'),
  ('2026-08-01', 'GBP/USD', 'short', '1:2', 1.2720, 1.2730, 1.2700, 1.2690, 'loss', -50.00, 'Stop hit, news spike reversed entry',  'Alpha Capital'),
  ('2026-08-01', 'USD/JPY', 'long',  '1:4', 149.80, 149.70, 150.00, 150.10, 'win',  200.00, 'Tokyo session continuation',           'Blue Guardian'),
  ('2026-08-01', 'XAU/USD', 'long',  '1:3', 2385.0, 2375.0, 2405.0, 2415.0, 'win',  135.00, 'Gold momentum, partial at TP1',        'Ember'),
  ('2026-08-01', 'AUD/USD', 'short', '1:2', 0.6550, 0.6560, 0.6530, 0.6520, 'loss', -40.00, 'False breakdown, stopped out',         'FundedNext'),
  ('2026-07-31', 'EUR/GBP', 'long',  '1:3', 0.8520, 0.8510, 0.8540, 0.8550, 'win',  75.00,  'Range continuation',                   'Alpha Capital'),
  ('2026-07-31', 'USD/CAD', 'short', '1:4', 1.3780, 1.3790, 1.3760, 1.3750, 'win',  180.00, 'Oil-driven CAD strength',              'Blue Guardian'),
  ('2026-07-31', 'NZD/USD', 'long',  '1:2', 0.5980, 0.5970, 0.6000, 0.6010, 'loss', -50.00, 'RBNZ reaction faded',                  'FundedNext')
ON CONFLICT DO NOTHING;
