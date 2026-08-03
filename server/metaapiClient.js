import MetaApi from 'metaapi.cloud-sdk/esm-node';

// PropDesk's Ember account is provisioned on this MT5 server in the
// MetaApi dashboard. This is informational/validation only — the server
// name is set when the account is provisioned with MetaApi, not passed
// per-connection.
const EXPECTED_SERVER = 'Upcomers-Server';

// PropDesk trades a single pair — hardcoded everywhere, including here.
const PAIR = 'GBPAUD';

let api = null;
let account = null;
let connection = null;

/**
 * Connects to the MT5 account on Upcomers-Server via MetaApi.
 * Deploys the account if it isn't already deployed, waits for it to come
 * online, then opens and synchronizes an RPC connection.
 */
export async function connectAccount(accountId, token) {
  api = new MetaApi(token);
  account = await api.metatraderAccountApi.getAccount(accountId);

  if (account.server && account.server !== EXPECTED_SERVER) {
    console.warn(
      `MetaApi account ${accountId} is provisioned on server "${account.server}", expected "${EXPECTED_SERVER}".`,
    );
  }

  if (account.state !== 'DEPLOYED') {
    await account.deploy();
  }

  if (account.connectionStatus !== 'CONNECTED') {
    await account.waitConnected();
  }

  connection = account.getRPCConnection();
  await connection.connect();
  await connection.waitSynchronized();

  return { connected: true, accountId, server: account.server ?? EXPECTED_SERVER };
}

function ensureConnected() {
  if (!connection) {
    throw new Error('MetaApi is not connected. Call connectAccount first.');
  }
}

/**
 * Returns current balance, equity, and margin for the connected account.
 */
export async function getAccountInfo() {
  ensureConnected();
  const info = await connection.getAccountInformation();
  return {
    balance: info.balance,
    equity: info.equity,
    margin: info.margin,
  };
}

/**
 * Sends a market order on the connected account. The pair argument is
 * accepted for interface compatibility but ignored in favor of the
 * hardcoded PAIR — this app only ever trades GBPAUD.
 */
export async function placeOrder(pair, direction, lots, stopLoss, takeProfit) {
  ensureConnected();

  if (pair && pair !== PAIR) {
    console.warn(`placeOrder received pair "${pair}", overriding to hardcoded "${PAIR}".`);
  }

  const result =
    direction === 'sell'
      ? await connection.createMarketSellOrder(PAIR, lots, stopLoss, takeProfit)
      : await connection.createMarketBuyOrder(PAIR, lots, stopLoss, takeProfit);

  return result;
}

export function isConnected() {
  return connection !== null;
}
