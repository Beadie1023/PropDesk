// Thin client for the AI Market Advisor backend endpoint.
import { API_BASE as METAAPI_BASE, apiHeaders } from '@/lib/metaapi';
import type { Candle } from '@/lib/marketData';
import type { CurrencyStrengthResult, LorentzianSignal } from '@/lib/signals';

const AI_API_BASE =
  import.meta.env.VITE_AI_BACKEND_URL ||
  (METAAPI_BASE.endsWith('/api/metaapi')
    ? METAAPI_BASE.replace(/\/api\/metaapi$/, '/api/ai')
    : '/api/ai');

export type AIAnalysisResult =
  | { status: 'ok'; analysis: string }
  | { status: 'error'; message: string };

export function buildAnalysisPayload(
  candles: Candle[],
  lorentzian: LorentzianSignal | null,
  currencyStrength: CurrencyStrengthResult | null,
) {
  const closes = candles.map((c) => c.close);
  const current = closes[closes.length - 1];
  const dayAgoIdx = Math.max(0, closes.length - 25);
  const weekAgoIdx = Math.max(0, closes.length - 121);
  const dayAgo = closes[dayAgoIdx];
  const weekAgo = closes[weekAgoIdx];

  const recentWindow = candles.slice(-48);
  const recentHigh = recentWindow.length
    ? Math.max(...recentWindow.map((c) => c.high))
    : current;
  const recentLow = recentWindow.length
    ? Math.min(...recentWindow.map((c) => c.low))
    : current;

  return {
    pair: 'GBP/AUD',
    currentPrice: current,
    changeLast24hPercent: dayAgo ? ((current - dayAgo) / dayAgo) * 100 : null,
    changeLast5dPercent: weekAgo ? ((current - weekAgo) / weekAgo) * 100 : null,
    recentHigh48h: recentHigh,
    recentLow48h: recentLow,
    lorentzianClassification: lorentzian
      ? {
          direction: lorentzian.direction,
          confidencePercent: lorentzian.confidence * 100,
        }
      : null,
    currencyStrength: currencyStrength
      ? {
          direction: currencyStrength.direction,
          gbpScore: currencyStrength.gbpScore,
          audScore: currencyStrength.audScore,
        }
      : null,
  };
}

export async function analyzeMarket(
  candles: Candle[],
  lorentzian: LorentzianSignal | null,
  currencyStrength: CurrencyStrengthResult | null,
): Promise<AIAnalysisResult> {
  try {
    const payload = buildAnalysisPayload(candles, lorentzian, currencyStrength);
    const res = await fetch(`${AI_API_BASE}/analyze`, {
      method: 'POST',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });

    const rawText = await res.text();

    if (!rawText) {
      return {
        status: 'error',
        message: `Backend returned an empty response (status ${res.status}). If the backend has been idle, it may be waking up — try again in ~30 seconds.`,
      };
    }

    let data: { message?: string; analysis?: string };
    try {
      data = JSON.parse(rawText);
    } catch {
      return {
        status: 'error',
        message: `Backend returned a non-JSON response (status ${res.status}): ${rawText.slice(0, 150)}`,
      };
    }

    if (!res.ok) {
      return {
        status: 'error',
        message: data.message ?? `Analysis request failed with status ${res.status}`,
      };
    }

    if (typeof data.analysis !== 'string') {
      return {
        status: 'error',
        message: 'Unexpected response shape from analysis backend.',
      };
    }

    return { status: 'ok', analysis: data.analysis };
  } catch (err) {
    console.error('AI market analysis failed:', err);
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
