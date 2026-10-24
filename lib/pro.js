import { put, list } from '@vercel/blob';

const BLOB_PATH = 'pro-users.json';

export async function loadProUsers() {
  try {
    const { blobs } = await list({ prefix: BLOB_PATH });
    const match = blobs.find(b => b.pathname === BLOB_PATH);
    if (!match) return new Set();
    const res = await fetch(match.url, { cache: 'no-store', headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` } });
    const data = await res.json();
    return new Set(data.emails || []);
  } catch {
    return new Set();
  }
}

export async function saveProUsers(users) {
  const body = JSON.stringify({ emails: Array.from(users), updated: Date.now() });
  await put(BLOB_PATH, body, { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
}

export async function markPro({ email, customerId }) {
  const users = await loadProUsers();
  if (email) users.add(String(email).toLowerCase());
  if (customerId) users.add(String(customerId));
  await saveProUsers(users);
  return users.size;
}

export async function isProEmail(email) {
  const clean = String(email || '').trim().toLowerCase();
  if (!clean) return false;
  const { getEntitlement } = await import('./billing');
  return (await getEntitlement(clean)).pro;
}
