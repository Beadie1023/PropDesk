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

## Reward:risk rules (added)

- Minimum **1:2**, default target **1:3** (`MIN_RR`, `TARGET_RR` in `src/lib/probabilityFactor.ts`).
- The gate blocks a trade when the planned RR is under 1:2 (this includes counter-trend 1R scalps) or when the next opposing level is under 2R from the stop. Set `ENFORCE_MIN_RR = false` to warn instead of block.
- The journal tag ends with `minRR:ok` or `minRR:fail`.

## Signal generator aligned to the TradingView settings (added)

`src/lib/lorentzian.ts` re-implements the Lorentzian Classification with the settings from the chart:
5 features (RSI 14, WaveTrend 10/11, CCI 20, ADX 20, RSI 9), 8 neighbours, 2000 bars back,
volatility + regime (-0.1) + ADX (>20) filters, 200 EMA and 200 SMA trade filters, and the kernel-rate filter.

- It is an independent re-implementation, not the TradingView code, so it will not match your chart bar-for-bar. The regime-filter constants and the kernel "regression level 25" are approximations. Compare it to your chart and backtest it before trusting it.
- It needs about 2000 hourly bars. The Signal Generator, AI panel, chart marker and Probability Gate all request the same 2000 bars, so they share one cached API call.
- If the classifier has a raw signal but price is on the wrong side of the 200 EMA/SMA, or the kernel disagrees, the result is shown as neutral with the reason ("blocked by...").
- The position marker now uses the gate's structural stop and a 1:3 target (`src/lib/gatedMarker.ts`). If the gate blocks the trade, no levels are drawn on the chart and the reason is shown.
- The backend poller uses an auto-generated copy: `server/src/lib/lorentzian.js`. After editing `lorentzian.ts`, run `npm run sync:lorentzian`.
- Tests: `npm test` (29 tests).
