// AI market analysis — calls the Claude API server-side. ANTHROPIC_API_KEY
// stays here, never in the frontend (same reasoning as the MetaApi token:
// a VITE_-prefixed key would be bundled into public JS and anyone loading
// the site could rack up API usage on it).
//
// This is framed honestly to the end user as an AI-generated technical
// read of the visible price data — not a claim of verified professional
// credentials or a profitable track record, since it has neither. It never
// recommends a specific trade size, and every response should reinforce
// that this supports manual review, not automated execution (Upcomers
// doesn't permit EA trading on this account).

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-5';

const SYSTEM_PROMPT = `You are a technical market analysis assistant embedded in a personal trading journal app called PropDesk. You analyze recent GBP/AUD price action and indicator readings the app provides you, and give the trader a clear, honest read of what the chart is showing.

Ground rules:
- You are an AI reading patterns in recent price data, not a professional trader, financial advisor, or verified authority. Never claim credentials, a track record, or certainty you don't have.
- Describe what the data shows (trend, momentum, volatility, key levels, how the two computed indicators agree or disagree) in plain language.
- Never tell the trader to place a specific trade, size, or timing — describe the situation and let them decide. This account does not permit automated execution; a human places every trade.
- Flag disagreement or low-confidence signals honestly rather than picking a side to sound decisive.
- Keep it concise: a short read of current conditions, not a long report.
- This is not financial advice, and you should say so briefly if the trader appears to be treating your read as a guarantee.`;

/**
 * Calls Claude to analyze recent price/indicator data. `payload` is a
 * plain-language summary object built by the caller (not raw candle
 * arrays — keeps requests small and keeps the analysis focused on what
 * actually matters).
 */
export async function analyzeMarket(payload) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set in the server environment.');
  }

  const userMessage = `Here's the current GBP/AUD market data:\n\n${JSON.stringify(payload, null, 2)}\n\nGive me a short read on current conditions.`;

  const response = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Claude API request failed with status ${response.status}: ${errorBody.slice(0, 200)}`);
  }

  const data = await response.json();
  const textBlock = Array.isArray(data.content) ? data.content.find((b) => b.type === 'text') : null;

  if (!textBlock || typeof textBlock.text !== 'string') {
    throw new Error('Claude API returned an unexpected response shape.');
  }

  return textBlock.text;
}
