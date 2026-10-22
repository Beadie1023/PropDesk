// Run with Node's built-in test runner (no extra deps):
//   npx tsx --test src/lib/gate.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { Candle } from './marketData';
import { aggregateToSessions, buildMarketContext, computeSMA, sessionKey, type MarketContext } from './bias';
import { evaluateGate, zoneFavors } from './probabilityFactor';
import { lotsForRisk, suggestStop } from './structuralRisk';
import { scalingDecision } from './scaling';

const HOUR = 3600;
const DAY = 24 * HOUR;
const START = Date.UTC(2026, 0, 5) / 1000; // a Monday 00:00 UTC

/** n days of 24 hourly candles; each day closes `drift` above the last. */
function synthetic(days: number, drift: number, base = 100): Candle[] {
  const out: Candle[] = [];
  let price = base;
  for (let d = 0; d < days; d++) {
    for (let h = 0; h < 24; h++) {
      const open = price;
      const close = price + drift / 24 + (h % 2 === 0 ? 0.05 : -0.05);
      out.push({
        time: START + d * DAY + h * HOUR,
        open,
        high: Math.max(open, close) + 0.1,
        low: Math.min(open, close) - 0.1,
        close,
      });
      price = close;
    }
  }
  return out;
}

describe('sessions', () => {
  it('aggregates hourly candles into daily OHLC', () => {
    const s = aggregateToSessions(synthetic(3, 1), 'utc');
    assert.equal(s.length, 3);
    assert.ok(s[0].high >= s[0].open && s[0].low <= s[0].close);
  });

  it('ny17 merges Sunday-evening bars into Monday (EDT, rollover 21:00 UTC)', () => {
    const t = (iso: string) => Date.parse(iso) / 1000;
    const fri = sessionKey(t('2026-10-02T20:00:00Z'));
    const sun = sessionKey(t('2026-10-04T22:00:00Z'));
    const mon = sessionKey(t('2026-10-05T10:00:00Z'));
    assert.equal(fri, '2026-10-02');
    assert.equal(sun, mon);
    assert.equal(mon, '2026-10-05');
  });
});

describe('indicators', () => {
  it('SMA of last N values', () => {
    assert.equal(computeSMA([1, 2, 3, 4, 5], 5), 3);
    assert.equal(computeSMA([1, 2], 5), null);
  });

  it('bias follows price vs SMA50', () => {
    const up = buildMarketContext(synthetic(70, 1), { mode: 'utc' });
    const down = buildMarketContext(synthetic(70, -1, 200), { mode: 'utc' });
    assert.equal(up?.bias, 'long');
    assert.equal(down?.bias, 'short');
  });

  it('returns null with too little data', () => {
    assert.equal(buildMarketContext(synthetic(5, 1), { mode: 'utc' }), null);
  });

  it('bias is null (not guessed) when under 50 completed sessions', () => {
    const ctx = buildMarketContext(synthetic(30, 1), { mode: 'utc' });
    assert.ok(ctx);
    assert.equal(ctx?.bias, null);
  });
});

// Mirrors the video's TSLL example (scaled: pipSize 0.01 so "pips" are cents).
const tsll: MarketContext = {
  price: 100,
  sessionOpen: 99.67,
  sessionHigh: 100.05,
  sessionLow: 99.5,
  sma50: 105,
  bias: 'short',
  atr: 0.7,
  prevHigh: 100.1,
  prevLow: 98,
  swingHigh: 100.4,
  swingLow: 97,
  completedSessions: 60,
};
const opts = { pipSize: 0.01 };

describe('probability gate', () => {
  it('zone favours shorts near the top of the range', () => {
    assert.equal(zoneFavors(tsll), 'short');
  });

  it('structural stop tucks behind the nearby level', () => {
    const s = suggestStop('short', 100, tsll, opts);
    assert.ok(s.structural);
    assert.ok(s.price > 100.05 && s.price < 100.2);
  });

  it('blocks the chase-long (counter-trend, unreachable target)', () => {
    const g = evaluateGate({ ctx: tsll, direction: 'long', rr: 2, stopOptions: opts });
    assert.equal(g.mode, 'blocked');
    assert.equal(g.feasible, false);
  });

  it('allows the structural short at full size', () => {
    const g = evaluateGate({ ctx: tsll, direction: 'short', rr: 3, stopOptions: opts });
    assert.equal(g.score, 3);
    assert.equal(g.mode, 'full');
    assert.ok(g.structuralRR !== null && g.structuralRR > 3);
  });

  it('counter-trend but feasible becomes a scalp', () => {
    const ctx = { ...tsll, bias: 'long' as const, sma50: 90 };
    const g = evaluateGate({ ctx, direction: 'short', rr: 3, stopOptions: opts });
    assert.equal(g.mode, 'scalp');
    assert.equal(g.effectiveRR, 1);
  });

  it('zero-distance stop is never feasible', () => {
    const g = evaluateGate({ ctx: tsll, direction: 'short', rr: 3, stop: 100, stopOptions: opts });
    assert.equal(g.mode, 'blocked');
  });
});

describe('sizing', () => {
  it('rounds lots DOWN so risk never exceeds the budget', () => {
    // $50 / (30 pips × $10) = 0.1666 → 0.16
    const r = lotsForRisk({ riskUsd: 50, stopPips: 30, pipValuePerLot: 10 });
    assert.equal(r.lots, 0.16);
    assert.ok(r.actualRiskUsd <= 50);
  });

  it('flags when the minimum lot is already too big', () => {
    const r = lotsForRisk({ riskUsd: 1, stopPips: 100, pipValuePerLot: 10 });
    assert.equal(r.lots, 0);
    assert.equal(r.belowMin, true);
  });
});

describe('scaling', () => {
  const day = (d: number, pnl: number) => ({ account_name: 'A', trade_date: `2026-09-0${d}`, dollar_amount: pnl });

  it('scales +10% per +10% growth when 3 of 5 days are green', () => {
    const trades = [day(1, 5), day(2, 5), day(3, -2), day(4, 5), day(5, -1)];
    const r = scalingDecision(1, 5000, 5500, trades, 'A');
    assert.equal(r.unlocked, true);
    assert.equal(r.lots, 1.1);
  });

  it('holds at base size without consistency', () => {
    const trades = [day(1, -5), day(2, -5), day(3, 2), day(4, -5), day(5, -1)];
    const r = scalingDecision(1, 5000, 5500, trades, 'A');
    assert.equal(r.unlocked, false);
    assert.equal(r.lots, 1);
  });

  it('steps back down when the balance falls', () => {
    const r = scalingDecision(1, 5000, 4800, [], 'A');
    assert.equal(r.steps, 0);
    assert.equal(r.lots, 1);
  });
});
