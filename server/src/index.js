import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import { connectAccount, getAccountInfo, placeOrder, isConnected } from './metaapiClient.js';

const app = express();

// Needed to get the real client IP (not the proxy's) when this server runs
// behind a reverse proxy — which is the case on Render and most PaaS hosts.
// Without this, req.ip would always report the proxy's address and IP
// allowlisting below would either block everyone or allow everyone.
app.set('trust proxy', true);

app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));
app.use(express.json());

// Strips the "::ffff:" prefix Node sometimes adds to IPv4 addresses on
// dual-stack sockets (e.g. "::ffff:127.0.0.1" -> "127.0.0.1") so it
// compares equal to a plain IPv4 entry in ALLOWED_IPS.
function normalizeIp(ip) {
  return typeof ip === 'string' && ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

// First line of defense: reject requests from any IP not explicitly
// allowlisted, before the API key is even checked. Fails closed — if
// ALLOWED_IPS isn't set, every request is rejected rather than allowed
// through unfiltered.
function requireAllowedIP(req, res, next) {
  const raw = process.env.ALLOWED_IPS;

  if (!raw) {
    console.error('ALLOWED_IPS is not set in the server environment — refusing all requests.');
    res.status(403).json({ message: 'Forbidden' });
    return;
  }

  const allowedIps = raw
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean);

  const clientIp = normalizeIp(req.ip);

  if (!allowedIps.includes(clientIp)) {
    res.status(403).json({ message: 'Forbidden' });
    return;
  }

  next();
}

app.use(requireAllowedIP);

// Every request must present the correct x-api-key header. Uses a
// timing-safe comparison so response time can't leak how many characters
// of a guessed key were correct.
function requireApiKey(req, res, next) {
  const expected = process.env.METAAPI_API_KEY;

  if (!expected) {
    console.error('METAAPI_API_KEY is not set in the server environment — refusing all requests.');
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const provided = req.header('x-api-key');
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided || '');

  const matches =
    providedBuf.length === expectedBuf.length && crypto.timingSafeEqual(providedBuf, expectedBuf);

  if (!matches) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  next();
}

app.use(requireApiKey);

let connectionError = null;

async function connectOnStartup() {
  const token = process.env.METAAPI_TOKEN;
  const accountId = process.env.METAAPI_ACCOUNT_ID;

  if (!token || !accountId) {
    connectionError = 'METAAPI_TOKEN or METAAPI_ACCOUNT_ID is not set in the server environment.';
    console.error(connectionError);
    return;
  }

  try {
    const result = await connectAccount(accountId, token);
    connectionError = null;
    console.log(`MetaApi connected: account ${result.accountId} on ${result.server}.`);
  } catch (err) {
    connectionError = err instanceof Error ? err.message : 'Unknown MetaApi connection error';
    console.error('MetaApi connection failed:', err);
  }
}

// Current connection state — the frontend polls this to render its badge.
app.get('/api/metaapi/status', (_req, res) => {
  res.json({ connected: isConnected(), error: connectionError });
});

// Re-attempts connection on demand (also called automatically on server boot).
app.post('/api/metaapi/connect', async (_req, res) => {
  await connectOnStartup();
  res.json({ connected: isConnected(), error: connectionError });
});

app.get('/api/metaapi/account-info', async (_req, res) => {
  try {
    const info = await getAccountInfo();
    res.json(info);
  } catch (err) {
    res.status(503).json({ message: err instanceof Error ? err.message : 'MetaApi not connected' });
  }
});

app.post('/api/metaapi/place-order', async (req, res) => {
  const { pair, direction, lots, stopLoss, takeProfit } = req.body || {};

  if (!direction || !lots || !stopLoss || !takeProfit) {
    res.status(400).json({ message: 'Missing required order fields: direction, lots, stopLoss, takeProfit.' });
    return;
  }

  try {
    const result = await placeOrder(pair, direction, lots, stopLoss, takeProfit);
    res.json({ orderId: result.orderId ?? result.positionId ?? null, raw: result });
  } catch (err) {
    res.status(502).json({ message: err instanceof Error ? err.message : 'Order failed' });
  }
});

const PORT = process.env.PORT || 4000;

connectOnStartup().finally(() => {
  app.listen(PORT, () => {
    console.log(`PropDesk MetaApi backend listening on port ${PORT}`);
  });
});
