# Probability Gate — how to add it to PropDesk

These files are already in this repo and wired into `App.tsx` (Overview tab, under the chart).

```
src/lib/bias.ts               daily sessions, SMA50 bias, ATR, range/swing levels
src/lib/structuralRisk.ts     structural stop, target, lot sizing from $ risk
src/lib/probabilityFactor.ts  the 3-point gate + mode (full/reduced/scalp/blocked)
src/lib/scaling.ts            +10% size per +10% growth, locked unless 3/5 green days
src/lib/gate.test.ts          17 tests (node:test)
src/components/ProbabilityGatePanel.tsx
```

## 1. Run the tests

```bash
npm test
```

## 2. Use it

1. Pick Long/Short and RR. Leave Entry/Stop blank to use live price + structural stop.
2. Read the verdict: FULL / REDUCED / SCALP ONLY / BLOCKED.
3. Click "Copy journal tag" and paste it into the trade's Notes field.
   After ~30+ trades, compare win rate and average R by `gate:N/3` and `mode:`.

## Things to check / change

- `account.pipValue / account.lots` is treated as $ per pip per 1.0 lot. Your seed data
  has 0.1 for 0.01 lots (= $10/pip/lot). GBP/AUD is quoted in AUD, so real value is nearer
  ~$6.5 — verify against your broker and fix the account values.
- Session roll is 17:00 New York (`SessionMode` in bias.ts). Pass `{ mode: 'utc' }` to
  `buildMarketContext` if you prefer midnight UTC.
- Untuned constants: SIZE_MULTIPLIER, ZONE_EDGE, SCALP_RR (probabilityFactor.ts),
  atZoneAtrFrac / bufferAtrFrac (structuralRisk.ts), BUFFER_RISK_CAP (panel).
- The gate does not generate entries. It only filters/sizes trades you already want.
- Not added to the backend poller (`server/src/lib/signals.js`). Mirror only if you
  want phone alerts from it later.
