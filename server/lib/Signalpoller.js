// Runs the signal check on its own schedule, independent of any browser
// tab being open — this is what lets a notification reach your phone
// even when PropDesk isn't loaded anywhere. Mirrors the same computation
// SignalPanel.tsx does client-side (see the note in signals.js).

import { fetchCandlesSequential, fetchTwelveDataCandles } from './marketData.js';
import { CURRENCY_STRENGTH_PAIRS, combineSignals, computeCurrencyStrength, computeLorentzianSignal } from './signals.js';
import { sendNtfyNotification } from './notify.js';

const PAIR_SYMBOL = 'GBP/AUD';
const POLL_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes — matches the frontend's own polling cadence

// Tracks the last signal we already notified about, so a poll that keeps
// returning the same Strong Buy/Sell doesn't re-notify every cycle — only
// a genuinely new crossing fires a notification.
let lastNotifiedSignal = null;

const OVERALL_LABEL = {
  strong_buy: 'Strong Buy',
  strong_sell: 'Strong Sell',
};

async function runSignalCheck() {
  try {
    const gbpaud = await fetchTwelveDataCandles(PAIR_SYMBOL, '1h', 150);
    const basket = await fetchCandlesSequential(
      CURRENCY_STRENGTH_PAIRS.map((symbol) => ({ symbol, interval: '1h', outputsize: 40 })),
    );

    const candlesByPair = {};
    CURRENCY_STRENGTH_PAIRS.forEach((symbol, i) => {
      candlesByPair[symbol] = basket[i];
    });

    const lorentzian = computeLorentzianSignal(gbpaud);
    const currencyStrength = computeCurrencyStrength(candlesByPair);
    const overall = combineSignals(lorentzian, currencyStrength);

    const isStrongSignal = overall === 'strong_buy' || overall === 'strong_sell';
    const isNewCrossing = isStrongSignal && lastNotifiedSignal !== overall;

    if (isNewCrossing) {
      await sendNtfyNotification({
        title: `PropDesk: ${OVERALL_LABEL[overall]} signal`,
        message: `GBP/AUD — Lorentzian + currency strength both ${
          overall === 'strong_buy' ? 'bullish' : 'bearish'
        }. Review before trading manually.`,
        priority: 'high',
        tags: overall === 'strong_buy' ? ['chart_with_upwards_trend'] : ['chart_with_downwards_trend'],
      });
      console.log(`Signal poller: sent notification for ${overall}`);
    }

    if (isStrongSignal) {
      lastNotifiedSignal = overall;
    } else if (overall !== 'buy' && overall !== 'sell') {
      // Reset once the signal clearly leaves strong territory, so a
      // later return to the same strong state notifies again.
      lastNotifiedSignal = null;
    }
  } catch (err) {
    // Never crash the backend over a failed poll — log and try again
    // next cycle. A missed check is fine; a crashed backend is not.
    console.error('Signal poller cycle failed:', err instanceof Error ? err.message : err);
  }
}

/**
 * Starts the background polling loop. No-ops (with a log line) if the
 * required env vars aren't set, rather than crashing the server or
 * silently doing nothing unexplained.
 */
export function startSignalPolling() {
  if (!process.env.TWELVEDATA_KEY || !process.env.NTFY_TOPIC) {
    console.log('Signal poller disabled — set TWELVEDATA_KEY and NTFY_TOPIC to enable phone notifications.');
    return;
  }

  console.log(`Signal poller starting — checking every ${POLL_INTERVAL_MS / 60000} minutes.`);
  runSignalCheck();
  setInterval(runSignalCheck, POLL_INTERVAL_MS);
}
