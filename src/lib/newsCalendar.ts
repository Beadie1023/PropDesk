// Free-tier economic calendar via Finnhub. Filtered to GBP and AUD (the
// currencies behind PropDesk's traded pair, GBP/AUD) and high-impact
// events only.
//
// Honesty requirement: on any failure — missing key, network error,
// unexpected response shape — this returns an explicit error/unconfigured
// state. It must NEVER fall back to fabricated events or a silent "no
// news" result, since a false "all clear" here could lead to a real trade
// placed right before a market-moving release.

export type NewsEvent = {
  time: string; // ISO datetime
  currency: string;
  event: string;
  impact: 'high' | 'medium' | 'low' | 'unknown';
};

export type NewsCalendarResult =
  | { status: 'ok'; events: NewsEvent[] }
  | { status: 'error'; message: string }
  | { status: 'unconfigured' };

const RELEVANT_CURRENCIES = ['GBP', 'AUD'];
const FINNHUB_URL = 'https://finnhub.io/api/v1/calendar/economic';

type FinnhubEconomicEvent = {
  time?: unknown;
  country?: unknown;
  event?: unknown;
  impact?: unknown;
};

/**
 * Fetches high-impact GBP/AUD economic events over the next `hoursAhead`
 * hours. Requires VITE_FINNHUB_API_KEY — this is a market-data key (not a
 * trading credential), safe to call directly from the browser the same
 * way the Twelve Data key is used.
 */
export async function fetchUpcomingHighImpactNews(hoursAhead = 48): Promise<NewsCalendarResult> {
  const apiKey = import.meta.env.VITE_FINNHUB_API_KEY;
  if (!apiKey) {
    return { status: 'unconfigured' };
  }

  const from = new Date();
  const to = new Date(from.getTime() + hoursAhead * 60 * 60 * 1000);
  const params = new URLSearchParams({
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    token: apiKey,
  });

  try {
    const res = await fetch(`${FINNHUB_URL}?${params.toString()}`);
    if (!res.ok) {
      return { status: 'error', message: `Finnhub request failed with status ${res.status}` };
    }

    const data = (await res.json()) as { economicCalendar?: unknown };
    if (!Array.isArray(data.economicCalendar)) {
      return { status: 'error', message: 'Unexpected response shape from Finnhub.' };
    }

    const events = (data.economicCalendar as FinnhubEconomicEvent[])
      .map((e): NewsEvent => ({
        time: typeof e.time === 'string' ? e.time : '',
        currency: typeof e.country === 'string' ? e.country.toUpperCase() : '',
        event: typeof e.event === 'string' ? e.event : 'Economic event',
        impact:
          typeof e.impact === 'string' && ['high', 'medium', 'low'].includes(e.impact.toLowerCase())
            ? (e.impact.toLowerCase() as 'high' | 'medium' | 'low')
            : 'unknown',
      }))
      .filter((e) => e.time !== '' && RELEVANT_CURRENCIES.includes(e.currency))
      .filter((e) => e.impact === 'high')
      .sort((a, b) => a.time.localeCompare(b.time));

    return { status: 'ok', events };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Unknown error' };
  }
}
