// Run with: npx tsx --test src/lib/signals.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { Candle } from './marketData';
import { computeLorentzian, LORENTZIAN_MIN_CANDLES, TV_SETTINGS } from './lorentzian';
import { computeGatedMarker } from './gatedMarker';
import { MIN_RR, TARGET_RR } from './probabilityFactor';

/** Deterministic pseudo-random hourly candles. */
function series(n: number, drift: number, noise: number, seed = 1): Candle[] {
  let x = seed;
  const rnd = () => {
    x = (x * 16807) % 2147483647;
    return x / 2147483647 - 0.5;
  };
  const out: Candle[] = [];
  let p = 1.9;
  for (let i = 0; i < n; i++) {
    const open = p;
    const close = p + drift + rnd() * noise;
    out.push({
      time: 1_700_000_000 + i * 3600,
      open,
      high: Math.max(open, close) + Math.abs(rnd()) * noise * 0.5,
      low: Math.min(open, close) - Math.abs(rnd()) * noise * 0.5,
      close,
    });
    p = close;
  }
  return out;
}

describe('lorentzian classifier (TradingView settings)', () => {
  it('uses the TradingView settings', () => {
    assert.equal(TV_SETTINGS.neighbors, 8);
    assert.equal(TV_SETTINGS.maxBarsBack, 2000);
    assert.equal(TV_SETTINGS.emaPeriod, 200);
    assert.equal(TV_SETTINGS.smaPeriod, 200);
    assert.equal(TV_SETTINGS.adxThreshold, 20);
    assert.equal(TV_SETTINGS.regimeThreshold, -0.1);
  });

  it('returns null without enough history for the 200-bar filters', () => {
    assert.equal(computeLorentzian(series(LORENTZIAN_MIN_CANDLES - 1, 0.0002, 0.0015)), null);
  });

  it('a steady uptrend is never classed bearish, and a downtrend never bullish', () => {
    const up = computeLorentzian(series(1500, 0.0002, 0.0015));
    const down = computeLorentzian(series(1500, -0.0002, 0.0015));
    assert.ok(up && down);
    assert.notEqual(up.direction, 'bearish');
    assert.notEqual(down.direction, 'bullish');
  });

  it('the trade filters and the final direction stay consistent', () => {
    for (const [drift, seed] of [[0, 1], [0.0001, 2], [-0.0001, 3], [0, 4], [0.0003, 5]] as const) {
      const r = computeLorentzian(series(1200, drift, 0.0015, seed));
      assert.ok(r);
      assert.ok(r.confidence >= 0 && r.confidence <= 100);
      assert.ok(r.nearestBars <= TV_SETTINGS.neighbors);
      if (r.blockedBy.length > 0) assert.equal(r.direction, 'neutral');
      else assert.equal(r.direction, r.rawDirection);
      if (r.rawDirection !== 'neutral' && r.direction === 'neutral') assert.ok(r.blockedBy.length > 0);
    }
  });

  it('turning the EMA/SMA/kernel trade filters off never blocks a raw signal', () => {
    const r = computeLorentzian(series(1200, 0, 0.0015, 1), {
      useEmaFilter: false,
      useSmaFilter: false,
      useKernelFilter: false,
    });
    assert.ok(r);
    assert.deepEqual(r.blockedBy, []);
    assert.equal(r.direction, r.rawDirection);
  });
});

describe('gate-driven position marker', () => {
  const candles = series(2000, 0.00005, 0.002, 7);

  it('uses the gate stop and a 1:3 target, on the correct sides', () => {
    for (const dir of ['long', 'short'] as const) {
      const m = computeGatedMarker(candles, dir);
      assert.ok(m);
      assert.equal(m.ratio, TARGET_RR);
      assert.ok(Math.abs(m.rewardAmount - m.riskAmount * TARGET_RR) < 1e-9);
      if (dir === 'long') assert.ok(m.stopLoss < m.entry && m.takeProfit > m.entry);
      else assert.ok(m.stopLoss > m.entry && m.takeProfit < m.entry);
    }
  });

  it('is only allowed when the gate does not block it', () => {
    const m = computeGatedMarker(candles, 'long');
    assert.ok(m);
    assert.equal(m.allowed, m.mode !== 'blocked');
    assert.ok(m.tag.includes('minRR:'));
  });

  it('a planned RR below the minimum is never allowed', () => {
    const m = computeGatedMarker(candles, 'long', 1);
    assert.ok(m);
    assert.ok(1 < MIN_RR);
    assert.equal(m.allowed, false);
  });

  it('returns null when there is too little history for the gate', () => {
    assert.equal(computeGatedMarker(series(100, 0.0001, 0.0015), 'long'), null);
  });
});
