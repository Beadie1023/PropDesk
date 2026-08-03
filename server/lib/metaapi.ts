// Thin client for PropDesk's MetaApi backend (see /server). The actual
// MetaApi token and account ID live ONLY on that backend's environment —
// never here. Any VITE_-prefixed variable is bundled into the public JS
// that ships to every visitor's browser, so a live trading credential
// must never be read from import.meta.env in this file.
//
// Note on VITE_METAAPI_API_KEY below: it gates out casual/opportunistic
// traffic hitting the backend directly, but — like any VITE_ var — it is
// visible in the bundled JS and in every request's Network tab. It is not
// a substitute for real user authentication if this is ever exposed
// beyond trusted use.

export type ConnectionStatus = 'connected' | 'disconnected';

export type AccountInfo = {
  balance: number;
  equity: number;
  margin: number;
};

export type OrderDirection = 'buy' | 'sell';

export type OrderResult = {
  success: boolean;
  orderId?: string;
  message?: string;
};

// PropDesk trades a single pair. Typing it as a literal means callers get
// a compile error if they ever try to pass anything else.
export type Pair = 'GBPAUD';

const API_BASE = import.meta.env.VITE_METAAPI_BACKEND_URL || '/api/metaapi';

const apiHeaders = (extra?: Record<string, string>): Record<string, string> => ({
  'x-api-key': import.meta.env.VITE_METAAPI_API_KEY || '',
  ...extra,
});

/**
 * Triggers (or re-triggers) the backend's connection to the MT5 account.
 * The backend also auto-connects on its own startup — this is for a
 * manual retry (e.g. a "Reconnect" button) or the initial status check
 * on app load.
 */
export async function connectAccount(): Promise<ConnectionStatus> {
  try {
    const res = await fetch(`${API_BASE}/connect`, { method: 'POST', headers: apiHeaders() });
    if (!res.ok) {
      throw new Error(`Connect request failed with status ${res.status}`);
    }
    const data = await res.json();
    return data.connected ? 'connected' : 'disconnected';
  } catch (err) {
    console.error('MetaApi connection failed:', err);
    return 'disconnected';
  }
}

/**
 * Reads current connection status without forcing a reconnect attempt.
 */
export async function getConnectionStatus(): Promise<ConnectionStatus> {
  try {
    const res = await fetch(`${API_BASE}/status`, { headers: apiHeaders() });
    if (!res.ok) {
      throw new Error(`Status request failed with status ${res.status}`);
    }
    const data = await res.json();
    return data.connected ? 'connected' : 'disconnected';
  } catch (err) {
    console.error('MetaApi status check failed:', err);
    return 'disconnected';
  }
}

/**
 * Returns current balance, equity, and margin for the connected account,
 * or null if the account info couldn't be retrieved (not connected, or
 * the request failed).
 */
export async function getAccountInfo(): Promise<AccountInfo | null> {
  try {
    const res = await fetch(`${API_BASE}/account-info`, { headers: apiHeaders() });
    if (!res.ok) {
      throw new Error(`Account info request failed with status ${res.status}`);
    }
    return (await res.json()) as AccountInfo;
  } catch (err) {
    console.error('Failed to fetch MetaApi account info:', err);
    return null;
  }
}

/**
 * Sends a market order on the connected account via the backend.
 */
export async function placeOrder(
  pair: Pair,
  direction: OrderDirection,
  lots: number,
  stopLoss: number,
  takeProfit: number,
): Promise<OrderResult> {
  try {
    const res = await fetch(`${API_BASE}/place-order`, {
      method: 'POST',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ pair, direction, lots, stopLoss, takeProfit }),
    });
    const data = await res.json();
    if (!res.ok) {
      return {
        success: false,
        message: data.message ?? `Order request failed with status ${res.status}`,
      };
    }
    return { success: true, orderId: data.orderId ?? undefined };
  } catch (err) {
    console.error('Failed to place MetaApi order:', err);
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
