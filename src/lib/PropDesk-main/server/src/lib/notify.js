// Sends phone push notifications via ntfy.sh (https://ntfy.sh) — a free,
// simple notification relay. NTFY_TOPIC acts as a shared secret: anyone
// who knows it can both receive AND publish to it, so it should be a
// long, unguessable string, not something like "propdesk".

const DEFAULT_NTFY_SERVER = 'https://ntfy.sh';

/**
 * Sends a push notification. Throws on failure so the caller can log it —
 * never silently swallows a failed send.
 */
export async function sendNtfyNotification({ title, message, priority = 'default', tags = [] }) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) {
    throw new Error('NTFY_TOPIC is not set in the server environment.');
  }

  const server = process.env.NTFY_SERVER || DEFAULT_NTFY_SERVER;
  const url = `${server.replace(/\/$/, '')}/${topic}`;

  const response = await fetch(url, {
    method: 'POST',
    body: message,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      Title: title,
      Priority: priority,
      ...(tags.length > 0 ? { Tags: tags.join(',') } : {}),
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`ntfy publish failed with status ${response.status}: ${body.slice(0, 200)}`);
  }
}
