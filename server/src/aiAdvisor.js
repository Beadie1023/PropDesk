// AI market analysis — calls the Gemini API server-side (free tier).
// GEMINI_API_KEY stays here, never in the frontend (same reasoning as the
// MetaApi token: a VITE_-prefixed key would be bundled into public JS and
// anyone loading the site could use up your free-tier quota).
//
// This is framed honestly to the end user as an AI-generated technical
// read of the visible price data — not a claim of verified professional
// credentials or a profitable track record, since it has neither. It never
// recommends a specific trade size, and every response should reinforce
// that this supports manual review, not automated execution (Upcomers
// doesn't permit EA trading on this account).

const GEMINI_MODEL = 'gemini-3.6-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_PROMPT = `You are a technical market analysis assistant embedded in a personal trading journal app called PropDesk. You analyze recent GBP/AUD price action and indicator readings the app provides you, and give the trader a clear, honest read of what the chart is showing.

Ground rules:
- You are an AI reading patterns in recent price data, not a professional trader, financial advisor, or verified authority. Never claim credentials, a track record, or certainty you don't have.
- Describe what the data shows (trend, momentum, volatility, key levels, how the two computed indicators agree or disagree) in plain language.
- Never tell the trader to place a specific trade, size, or timing — describe the situation and let them decide. This account does not permit automated execution; a human places every trade.
- Flag disagreement or low-confidence signals honestly rather than picking a side to sound decisive.
- Keep it concise: a short read of current conditions, not a long report.
- This is not financial advice, and you should say so briefly if the trader appears to be treating your read as a guarantee.`;

/**
 * Calls Gemini to analyze recent price/indicator data. `payload` is a
 * plain-language summary object built by the caller (not raw candle
 * arrays — keeps requests small and keeps the analysis focused on what
 * actually matters).
 */
export async function analyzeMarket(payload) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set in the server environment.');
  }

  const userMessage = `Here's the current GBP/AUD market data:\n\n${JSON.stringify(payload, null, 2)}\n\nGive me a short read on current conditions.`;

  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userMessage }],
        },
      ],
      generationConfig: {
        maxOutputTokens: 500,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Gemini API request failed with status ${response.status}: ${errorBody.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (typeof text !== 'string' || text.length === 0) {
    // A common non-error case: the response was blocked by safety
    // filters or truncated for hitting maxOutputTokens before any text
    // was produced — surface that distinctly rather than a generic
    // "unexpected shape" message.
    const finishReason = data?.candidates?.[0]?.finishReason;
    if (finishReason) {
      throw new Error(`Gemini did not return text (finishReason: ${finishReason}).`);
    }
    throw new Error('Gemini API returned an unexpected response shape.');
  }

  return text;
}
