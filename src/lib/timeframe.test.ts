// Run with: npx tsx --test src/lib/timeframe.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_TIMEFRAME,
  barsPerHour,
  chartBarsFor,
  getTimeframe,
  setTimeframe,
  signalBarsFor,
  subscribeTimeframe,
  timeframeLabel,
} from './timeframe';

describe('timeframe setting', () => {
  it('defaults to 30 minutes, matching the chart you trade', () => {
    assert.equal(DEFAULT_TIMEFRAME, '30min');
    assert.equal(getTimeframe(), '30min');
  });

  it('asks for enough history for the 200-bar filters and the 50-session gate context', () => {
    assert.ok(signalBarsFor('30min') >= 2000 + 200);
    assert.ok(signalBarsFor('30min') / 48 >= 60); // ~48 half-hours per session
    assert.ok(signalBarsFor('1h') / 24 >= 60);
  });

  it('keeps the 24h / 5d / 48h windows true on both timeframes', () => {
    assert.equal(barsPerHour('30min'), 2);
    assert.equal(barsPerHour('1h'), 1);
    assert.ok(chartBarsFor('30min') > chartBarsFor('1h'));
    assert.equal(timeframeLabel('30min'), '30-minute');
  });

  it('notifies subscribers once per real change and stops after unsubscribe', () => {
    let calls = 0;
    const off = subscribeTimeframe(() => calls++);
    setTimeframe('1h');
    setTimeframe('1h'); // no change, no notification
    assert.equal(calls, 1);
    assert.equal(getTimeframe(), '1h');
    off();
    setTimeframe('30min');
    assert.equal(calls, 1);
    assert.equal(getTimeframe(), '30min');
  });
});
