// Monthly "Win Pro for a month" raffle. Entries live in Upstash Redis per ET calendar month.
// Paid entries: $1 = 1 entry, $4 = 5 entries (Stripe Checkout). Free entry: 1 per email per month.
// Every entry ("vote") has the same chance. Drawing is a crypto-random pick weighted by entries.
import crypto from 'crypto';
import { kvEnabled, kvCommand } from './kv';

export const TZ = 'America/New_York';
export const CLOSE_HOUR = 22; // entries close at 10:00 PM ET on the last day of the month
export const PRIZE_DAYS = 31;
export const PACKS = {
  one: { cents: 100, votes: 1, label: '1 entry' },
  five: { cents: 400, votes: 5, label: '5 entries' },
};
export const DESCRIPTION = 'Viral AI Clipper monthly raffle';

// ---------- time helpers (America/New_York) ----------
export function etParts(ms = Date.now()) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).filter(x => x.type !== 'literal').map(x => [x.type, Number(x.value)]));
  return { y: p.year, m: p.month, d: p.day, h: p.hour % 24, mi: p.minute, s: p.second };
}
// Wall-clock ET -> epoch ms (handles DST by correcting the offset twice).
export function etToMs(y, m, d, h = 0, mi = 0) {
  const want = Date.UTC(y, m - 1, d, h, mi);
  let t = want;
  for (let i = 0; i < 3; i++) {
    const p = etParts(t);
    const got = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
    t += want - got;
  }
  return t;
}
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const monthKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
export function parseMonth(s) {
  const mt = /^(\d{4})-(\d{2})$/.exec(String(s || ''));
  if (!mt) return null;
  const y = Number(mt[1]), m = Number(mt[2]);
  return m >= 1 && m <= 12 ? { y, m } : null;
}
export function nextMonth(key) { const { y, m } = parseMonth(key); return m === 12 ? monthKey(y + 1, 1) : monthKey(y, m + 1); }
export function prevMonth(key) { const { y, m } = parseMonth(key); return m === 1 ? monthKey(y - 1, 12) : monthKey(y, m - 1); }
// Entries close at 10:00 PM ET on the month's last day.
export function closeAt(key) { const { y, m } = parseMonth(key); return etToMs(y, m, daysIn(y, m), CLOSE_HOUR, 0); }
// The raffle month an entry received at `ms` belongs to (after close it rolls into next month).
export function raffleMonth(ms = Date.now()) {
  const p = etParts(ms);
  const k = monthKey(p.y, p.m);
  return ms >= closeAt(k) ? nextMonth(k) : k;
}
export function monthLabel(key) {
  const { y, m } = parseMonth(key);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// ---------- input helpers ----------
export const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
export const cleanEmail = (s) => String(s || '').trim().toLowerCase().slice(0, 200);
export const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e) && e.length <= 200;
// Canonical form for the one-free-entry-per-person rule (strip +tags; gmail ignores dots).
export function canonicalEmail(e) {
  let [u, d] = cleanEmail(e).split('@');
  if (!d) return cleanEmail(e);
  u = u.split('+')[0];
  if (d === 'googlemail.com') d = 'gmail.com';
  if (d === 'gmail.com') u = u.replace(/\./g, '');
  return `${u}@${d}`;
}
export const emailTag = (e) => crypto.createHash('sha256').update(canonicalEmail(e)).digest('hex').slice(0, 24);

// ---------- storage ----------
const K = (month) => ({
  entries: `raffle:${month}:entries`, // HASH id -> JSON entry
  votes: `raffle:${month}:votes`,     // integer total entries ("votes")
  winner: `raffle:${month}:winner`,   // JSON
  lock: `raffle:${month}:drawlock`,
});
const sessKey = (id) => `raffle:sess:${id}`;

function need() { if (!kvEnabled) throw new Error('Raffle storage is not configured'); }

// Adds an entry exactly once (by id). Returns { added, entry, month }.
export async function addEntry(month, entry) {
  need();
  const row = { ...entry, month, at: entry.at || Date.now() };
  const ok = Number(await kvCommand(['HSETNX', K(month).entries, row.id, JSON.stringify(row)]));
  if (!ok) return { added: false, month, entry: row };
  await kvCommand(['INCRBY', K(month).votes, String(row.votes)]);
  return { added: true, month, entry: row };
}

// Paid entry from a completed Checkout Session. Idempotent on the session id across months.
export async function logPaidEntry(session, receivedMs = Date.now()) {
  need();
  const md = session.metadata || {};
  const votes = Number(md.raffle_votes) || 0;
  if (!votes || session.payment_status !== 'paid') return { added: false, reason: 'not paid' };
  const id = `stripe:${session.id}`;
  // One session -> one month, even if Stripe retries the webhook after a month rolls over.
  let month = raffleMonth(receivedMs);
  const claimed = await kvCommand(['SET', sessKey(session.id), month, 'NX', 'EX', String(400 * 86400)]);
  if (claimed !== 'OK') {
    month = (await kvCommand(['GET', sessKey(session.id)])) || month;
  }
  if (Number(await kvCommand(['HEXISTS', K(month).entries, id]))) return { added: false, month, duplicate: true };
  // If that month was already drawn (late webhook), the entry goes to the next open month.
  if (await getWinner(month)) {
    let guard = 0;
    do { month = nextMonth(month); } while (++guard < 24 && await getWinner(month));
    await kvCommand(['SET', sessKey(session.id), month, 'EX', String(400 * 86400)]);
  }
  return addEntry(month, {
    id,
    kind: 'paid',
    name: cleanName(md.raffle_name || session.customer_details?.name),
    email: cleanEmail(md.raffle_email || session.customer_details?.email || session.customer_email),
    amountCents: Number(session.amount_total) || 0,
    currency: session.currency || 'usd',
    votes,
    sessionId: session.id,
    paymentIntent: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || null,
    at: receivedMs,
  });
}

export async function sessionMonth(sessionId) {
  if (!kvEnabled || !/^cs_[A-Za-z0-9_]+$/.test(String(sessionId || ''))) return null;
  return (await kvCommand(['GET', sessKey(sessionId)]).catch(() => null)) || null;
}

export const etDay = (ms = Date.now()) => { const p = etParts(ms); return `${monthKey(p.y, p.m)}-${String(p.d).padStart(2, '0')}`; };

// One free entry per person (canonical email) per ET calendar day.
export async function logFreeEntry({ name, email, ip, now = Date.now() }) {
  need();
  const month = raffleMonth(now);
  const day = etDay(now);
  const tag = emailTag(email);
  const claim = await kvCommand(['SET', `raffle:freeday:${day}:${tag}`, month, 'NX', 'EX', String(3 * 86400)]);
  if (claim !== 'OK') return { added: false, month, duplicate: true };
  return addEntry(month, {
    id: `free:${day}:${tag}`,
    kind: 'free',
    name: cleanName(name),
    email: cleanEmail(email),
    amountCents: 0,
    votes: 1,
    ipTag: ip ? crypto.createHash('sha256').update('raffle-ip:' + ip).digest('hex').slice(0, 12) : null,
  });
}

export async function listEntries(month) {
  need();
  const flat = (await kvCommand(['HGETALL', K(month).entries])) || [];
  const out = [];
  for (let i = 1; i < flat.length; i += 2) { try { out.push(JSON.parse(flat[i])); } catch {} }
  return out.sort((a, b) => (a.at - b.at) || String(a.id).localeCompare(String(b.id)));
}

export async function stats(month) {
  if (!kvEnabled) return { entrants: 0, votes: 0 };
  const [entrants, votes] = await Promise.all([
    kvCommand(['HLEN', K(month).entries]).catch(() => 0),
    kvCommand(['GET', K(month).votes]).catch(() => 0),
  ]);
  return { entrants: Number(entrants) || 0, votes: Number(votes) || 0 };
}

export async function removeEntry(month, id) {
  need();
  const raw = await kvCommand(['HGET', K(month).entries, id]);
  if (!raw) return { removed: false };
  const e = JSON.parse(raw);
  const n = Number(await kvCommand(['HDEL', K(month).entries, id]));
  if (n) await kvCommand(['DECRBY', K(month).votes, String(Number(e.votes) || 0)]);
  return { removed: !!n, entry: e };
}

export async function getWinner(month) {
  if (!kvEnabled) return null;
  const v = await kvCommand(['GET', K(month).winner]).catch(() => null);
  return v ? JSON.parse(v) : null;
}

// Pure weighted pick. `seedHex` -> SHA-256 -> big integer mod total entries.
// Anyone with the seed and the entry list (sorted by time, then id) can reproduce the result.
export function pickWinner(entries, seedHex) {
  const total = entries.reduce((s, e) => s + (Number(e.votes) || 0), 0);
  if (!total) return null;
  const digest = crypto.createHash('sha256').update(Buffer.from(seedHex, 'hex')).digest('hex');
  let ticket = Number(BigInt('0x' + digest) % BigInt(total)); // bias ~ total/2^256, negligible
  const index = ticket;
  for (const e of entries) {
    const v = Number(e.votes) || 0;
    if (ticket < v) return { entry: e, ticket: index, total };
    ticket -= v;
  }
  return null;
}

export function entriesHash(entries) {
  return crypto.createHash('sha256').update(entries.map(e => `${e.id}:${e.votes}`).join('\n')).digest('hex');
}

// Runs the drawing for `month` once. Returns { winner, already }.
export async function drawMonth(month, { early = false, now = Date.now() } = {}) {
  need();
  const existing = await getWinner(month);
  if (existing) return { already: true, winner: existing };
  if (!early && now < closeAt(month)) return { error: `Entries for ${month} are still open until ${new Date(closeAt(month)).toISOString()}` };
  const got = await kvCommand(['SET', K(month).lock, '1', 'NX', 'EX', '120']);
  if (got !== 'OK') return { error: 'A drawing for this month is already running' };
  try {
    const again = await getWinner(month);
    if (again) return { already: true, winner: again };
    const entries = await listEntries(month);
    const seed = crypto.randomBytes(32).toString('hex');
    const pick = pickWinner(entries, seed);
    const rec = {
      month,
      drawnAt: now,
      seed,
      entriesHash: entriesHash(entries),
      entrants: entries.length,
      totalVotes: pick?.total || 0,
      ticket: pick ? pick.ticket : null,
      winner: pick ? { id: pick.entry.id, name: pick.entry.name, email: pick.entry.email, kind: pick.entry.kind, votes: pick.entry.votes } : null,
      granted: false,
      notified: false,
    };
    await kvCommand(['SET', K(month).winner, JSON.stringify(rec), 'NX']);
    return { already: false, winner: (await getWinner(month)) || rec };
  } finally {
    await kvCommand(['DEL', K(month).lock]).catch(() => {});
  }
}

export async function updateWinner(month, patch) {
  const w = await getWinner(month);
  if (!w) return null;
  const next = { ...w, ...patch };
  await kvCommand(['SET', K(month).winner, JSON.stringify(next)]);
  return next;
}

// "Jane D." — safe to show publicly.
export function publicName(name) {
  const parts = cleanName(name).split(' ').filter(Boolean);
  if (!parts.length) return 'A lucky entrant';
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
}

export function toCsv(entries) {
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const cols = ['month', 'at_iso', 'kind', 'name', 'email', 'votes', 'amount_usd', 'session_id', 'payment_intent', 'id'];
  const rows = entries.map(e => [e.month, new Date(e.at).toISOString(), e.kind, e.name, e.email, e.votes, ((Number(e.amountCents) || 0) / 100).toFixed(2), e.sessionId || '', e.paymentIntent || '', e.id]);
  return [cols, ...rows].map(r => r.map(esc).join(',')).join('\n') + '\n';
}
