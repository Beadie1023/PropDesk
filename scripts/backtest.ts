// Backtest of the Lorentzian signals on exported 30-minute candles.
//   npx tsx scripts/backtest.ts path/to/time_series-GBP_AUD-30min.csv
//
// Rules (fixed in advance, nothing is tuned to the data):
//   - a signal is read at the CLOSE of a bar and traded at the OPEN of the next bar
//   - stop = k x ATR(14), target = rr x stop, one trade at a time, 96-bar time limit
//   - if the stop and target are both inside one bar the STOP is assumed hit first
//   - costs (spread + commission) are charged in pips and converted to R
//   - the classifier only ever sees data up to the signal bar (no look-ahead)
// Headline config, chosen before looking at results: k=1.5, rr=2 (your 1:2 minimum), cost=3 pips.
import { readFileSync } from 'node:fs';
import type { Candle } from '../src/lib/marketData';
import { computeLorentzianSeries } from '../src/lib/lorentzian';

const PIP = 0.0001;
const MAX_BARS = 96;
const MIN_STOP_PIPS = 5;

// ---------- data ----------
function loadCsv(path: string): Candle[] {
  const lines = readFileSync(path, 'utf8').trim().split(/\r?\n/);
  const out: Candle[] = [];
  for (const line of lines.slice(1)) {
    const [dt, o, h, l, c] = line.split(';');
    const time = Date.parse(dt.replace(' ', 'T') + 'Z') / 1000;
    out.push({ time, open: +o, high: +h, low: +l, close: +c });
  }
  return out.sort((a, b) => a.time - b.time);
}

/** Drop the weekly closure: Friday 21:00 UTC -> Sunday 21:00 UTC. */
function marketHoursOnly(c: Candle[]): Candle[] {
  return c.filter((bar) => {
    const d = new Date(bar.time * 1000);
    const dow = d.getUTCDay(); // 0 Sun .. 6 Sat
    const h = d.getUTCHours();
    if (dow === 6) return false;
    if (dow === 5 && h >= 21) return false;
    if (dow === 0 && h < 21) return false;
    return true;
  });
}

// ---------- ATR ----------
function atrSeries(c: Candle[], period = 14): number[] {
  const out = new Array<number>(c.length).fill(NaN);
  let prev = NaN;
  let sum = 0;
  for (let i = 0; i < c.length; i++) {
    const tr = i === 0 ? c[i].high - c[i].low : Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close));
    if (i < period) {
      sum += tr;
      if (i === period - 1) {
        prev = sum / period;
        out[i] = prev;
      }
    } else {
      prev = (prev * (period - 1) + tr) / period;
      out[i] = prev;
    }
  }
  return out;
}

// ---------- engine ----------
type Params = { k: number; rr: number; costPips: number };
type Trade = { bar: number; time: number; dir: 1 | -1; stopPips: number; grossR: number; netR: number; reason: 'target' | 'stop' | 'time' };

function simulate(c: Candle[], atr: number[], sig: Int8Array, from: number, p: Params): Trade[] {
  const trades: Trade[] = [];
  let b = from;
  while (b < c.length - 2) {
    const dir = sig[b] as -1 | 0 | 1;
    if (dir === 0 || Number.isNaN(atr[b])) {
      b++;
      continue;
    }
    const entryBar = b + 1;
    const entry = c[entryBar].open;
    const stopDist = Math.max(p.k * atr[b], MIN_STOP_PIPS * PIP);
    const stop = entry - dir * stopDist;
    const target = entry + dir * stopDist * p.rr;
    let exitBar = Math.min(c.length - 1, entryBar + MAX_BARS);
    let grossR = (c[exitBar].close - entry) * dir / stopDist;
    let reason: Trade['reason'] = 'time';
    for (let j = entryBar; j <= Math.min(c.length - 1, entryBar + MAX_BARS); j++) {
      const hitStop = dir === 1 ? c[j].low <= stop : c[j].high >= stop;
      const hitTarget = dir === 1 ? c[j].high >= target : c[j].low <= target;
      if (hitStop) {
        grossR = -1;
        reason = 'stop';
        exitBar = j;
        break;
      }
      if (hitTarget) {
        grossR = p.rr;
        reason = 'target';
        exitBar = j;
        break;
      }
    }
    const stopPips = stopDist / PIP;
    trades.push({ bar: entryBar, time: c[entryBar].time, dir, stopPips, grossR, netR: grossR - p.costPips / stopPips, reason });
    b = exitBar + 1;
  }
  return trades;
}

// ---------- stats ----------
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

type Stats = { n: number; win: number; avgR: number; totalR: number; pf: number; maxDD: number; ciLo: number; ciHi: number };
function stats(trades: Trade[], rnd: () => number): Stats {
  const r = trades.map((t) => t.netR);
  const n = r.length;
  const wins = r.filter((x) => x > 0).length;
  const gp = r.filter((x) => x > 0).reduce((a, b) => a + b, 0);
  const gl = -r.filter((x) => x < 0).reduce((a, b) => a + b, 0);
  let eq = 0, peak = 0, dd = 0;
  for (const x of r) {
    eq += x;
    peak = Math.max(peak, eq);
    dd = Math.max(dd, peak - eq);
  }
  const boots: number[] = [];
  if (n >= 5) for (let i = 0; i < 2000; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += r[Math.floor(rnd() * n)];
    boots.push(s / n);
  }
  boots.sort((a, b) => a - b);
  return {
    n,
    win: n ? wins / n : NaN,
    avgR: mean(r),
    totalR: r.reduce((a, b) => a + b, 0),
    pf: gl > 0 ? gp / gl : Infinity,
    maxDD: dd,
    ciLo: boots.length ? boots[Math.floor(boots.length * 0.025)] : NaN,
    ciHi: boots.length ? boots[Math.floor(boots.length * 0.975)] : NaN,
  };
}

function randomBaseline(c: Candle[], atr: number[], from: number, p: Params, tradeCount: number, runs = 300) {
  const rnd = mulberry32(12345);
  const avgs: number[] = [];
  const prob = Math.min(0.5, tradeCount / Math.max(1, c.length - from) * 1.6);
  for (let r = 0; r < runs; r++) {
    const sig = new Int8Array(c.length);
    for (let i = from; i < c.length; i++) if (rnd() < prob) sig[i] = rnd() < 0.5 ? 1 : -1;
    const t = simulate(c, atr, sig, from, p);
    if (t.length) avgs.push(mean(t.map((x) => x.netR)));
  }
  avgs.sort((a, b) => a - b);
  return { median: avgs[Math.floor(avgs.length / 2)], p5: avgs[Math.floor(avgs.length * 0.05)], p95: avgs[Math.floor(avgs.length * 0.95)], avgs };
}

// ---------- signal sets ----------
function eventsFrom(dirs: ('bullish' | 'bearish' | 'neutral')[], offset: number, len: number, invert = false): Int8Array {
  const sig = new Int8Array(len);
  for (let i = 1; i < dirs.length; i++) {
    if (dirs[i] !== dirs[i - 1] && dirs[i] !== 'neutral') sig[offset + i] = (dirs[i] === 'bullish' ? 1 : -1) * (invert ? -1 : 1);
  }
  return sig;
}


// ---------- fixed-hold check (how the TradingView indicator scores its own "win rate") ----------
function fixedHold(c: Candle[], sig: Int8Array, from: number, hold: number, costPips: number) {
  const pips: number[] = [];
  let busyUntil = -1;
  for (let b = from; b < c.length - hold - 1; b++) {
    if (sig[b] === 0 || b <= busyUntil) continue;
    const entry = c[b + 1].open;
    pips.push((sig[b] * (c[b + hold].close - entry)) / PIP - costPips);
    busyUntil = b + hold;
  }
  const wins = pips.filter((x) => x > 0).length;
  return { n: pips.length, win: pips.length ? wins / pips.length : NaN, avgPips: mean(pips) };
}

function holdReport(c: Candle[], sets: Record<string, Int8Array>, off: number) {
  console.log(`\nFixed-hold check (no stop, exit at the close N bars later, like the TradingView win-rate stat):`);
  console.log('| Signal | Hold | Trades | Win % (no cost) | Avg pips (no cost) | Win % (3-pip cost) | Avg pips (3-pip cost) |');
  console.log('|---|---|---|---|---|---|---|');
  for (const [name, s] of Object.entries(sets)) for (const hold of [4, 8]) {
    const g = fixedHold(c, s, off, hold, 0), n = fixedHold(c, s, off, hold, 3);
    console.log(`| ${name} | ${hold} bars | ${g.n} | ${pct(g.win)} | ${f(g.avgPips, 1)} | ${pct(n.win)} | ${f(n.avgPips, 1)} |`);
  }
  // direction accuracy over every bar where the signal is not neutral (state-based)
}

const f = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');
const pct = (x: number) => (Number.isFinite(x) ? (x * 100).toFixed(0) + '%' : 'n/a');

function run(label: string, raw: Candle[]) {
  const c = raw;
  const ser = computeLorentzianSeries(c);
  if (!ser) {
    console.log(`\n### ${label}: not enough data`);
    return;
  }
  const atr = atrSeries(c);
  const off = ser.startIndex;
  const tv = ser.points.map((p) => p.direction);
  const rawDir = ser.points.map((p) => p.rawDirection);
  const sets: Record<string, Int8Array> = {
    'A. Lorentzian, TradingView filters (EMA/SMA/kernel)': eventsFrom(tv, off, c.length),
    'B. Lorentzian raw (no EMA/SMA/kernel filters)': eventsFrom(rawDir, off, c.length),
    'C. A inverted (fade it)': eventsFrom(tv, off, c.length, true),
  };
  const first = new Date(c[off].time * 1000).toISOString().slice(0, 10);
  const last = new Date(c[c.length - 1].time * 1000).toISOString().slice(0, 10);
  console.log(`\n## ${label}`);
  console.log(`bars: ${c.length}, tested from ${first} to ${last} (${c.length - off} bars after warm-up)`);
  for (const [name, s] of Object.entries(sets)) console.log(`  signal events - ${name}: ${s.reduce((a, v) => a + (v !== 0 ? 1 : 0), 0)}`);

  const head: Params = { k: 1.5, rr: 2, costPips: 3 };
  console.log(`\nHeadline (stop 1.5xATR, target 1:2, cost 3 pips round trip):`);
  console.log('| Signal | Trades | Win % | Avg R | 95% CI of avg R | Total R | Profit factor | Max drawdown (R) |');
  console.log('|---|---|---|---|---|---|---|---|');
  const rnd = mulberry32(99);
  const headTrades: Record<string, Trade[]> = {};
  for (const [name, s] of Object.entries(sets)) {
    const t = simulate(c, atr, s, off, head);
    headTrades[name] = t;
    const st = stats(t, rnd);
    console.log(`| ${name} | ${st.n} | ${pct(st.win)} | ${f(st.avgR, 3)} | ${f(st.ciLo, 2)} to ${f(st.ciHi, 2)} | ${f(st.totalR, 1)} | ${f(st.pf)} | ${f(st.maxDD, 1)} |`);
  }
  const aKey = Object.keys(sets)[0];
  const rb = randomBaseline(c, atr, off, head, headTrades[aKey].length);
  const aAvg = mean(headTrades[aKey].map((x) => x.netR));
  const beat = rb.avgs.filter((x) => x < aAvg).length / rb.avgs.length;
  console.log(`\nRandom entries, same exits and costs (300 runs): median avg R ${f(rb.median, 3)}, 90% range ${f(rb.p5, 3)} to ${f(rb.p95, 3)}. Signal A beats ${pct(beat)} of random runs.`);

  // first half vs second half
  const A = headTrades[aKey];
  const half = Math.floor(A.length / 2);
  const s1 = stats(A.slice(0, half), rnd), s2 = stats(A.slice(half), rnd);
  console.log(`Signal A first half: ${s1.n} trades, avg R ${f(s1.avgR, 3)} | second half: ${s2.n} trades, avg R ${f(s2.avgR, 3)}`);
  const longs = stats(A.filter((t) => t.dir === 1), rnd), shorts = stats(A.filter((t) => t.dir === -1), rnd);
  console.log(`Signal A longs: ${longs.n} trades, avg R ${f(longs.avgR, 3)} | shorts: ${shorts.n} trades, avg R ${f(shorts.avgR, 3)}`);
  const stopsP = A.map((t) => t.stopPips).sort((a, b) => a - b);
  console.log(`Typical stop distance (1.5 x ATR): median ${f(stopsP[Math.floor(stopsP.length / 2)], 1)} pips`);
  console.log(`Exits: target ${A.filter((t) => t.reason === 'target').length}, stop ${A.filter((t) => t.reason === 'stop').length}, time ${A.filter((t) => t.reason === 'time').length}`);

  holdReport(c, sets, off);

  // grid for signal A (all shown, not just the best)
  console.log(`\nSignal A, avg R per trade across settings (net of costs; cost 0 pips -> 3 pips):`);
  console.log('| Stop (xATR) | Target RR | Trades | Win % | Avg R, no cost | Avg R, 3 pips |');
  console.log('|---|---|---|---|---|---|');
  for (const k of [1, 1.5, 2]) for (const rr of [1, 2, 3]) {
    const t0 = simulate(c, atr, sets[aKey], off, { k, rr, costPips: 0 });
    const t3 = simulate(c, atr, sets[aKey], off, { k, rr, costPips: 3 });
    console.log(`| ${k} | 1:${rr} | ${t3.length} | ${pct(t3.filter((x) => x.netR > 0).length / (t3.length || 1))} | ${f(mean(t0.map((x) => x.netR)), 3)} | ${f(mean(t3.map((x) => x.netR)), 3)} |`);
  }
  return { headTrades };
}

const path = process.argv[2];
if (!path) {
  console.error('usage: npx tsx scripts/backtest.ts <csv>');
  process.exit(1);
}
const all = loadCsv(path);
run('Market hours only (weekend closure removed)', marketHoursOnly(all));
run('All bars as exported (includes weekend candles)', all);
