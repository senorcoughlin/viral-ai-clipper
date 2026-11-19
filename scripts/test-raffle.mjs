import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// In-memory fake of the Upstash REST API (only the commands the raffle uses).
process.env.KV_REST_API_URL = 'https://fake-kv.test';
process.env.KV_REST_API_TOKEN = 'fake';
const db = new Map();
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (!String(url).startsWith('https://fake-kv.test')) return realFetch(url, init);
  const [cmd, ...a] = JSON.parse(init.body);
  const h = (k) => { if (!db.has(k)) db.set(k, new Map()); return db.get(k); };
  let result = null;
  switch (cmd.toUpperCase()) {
    case 'GET': result = db.has(a[0]) ? db.get(a[0]) : null; break;
    case 'SET': { const nx = a.includes('NX'); if (nx && db.has(a[0])) result = null; else { db.set(a[0], a[1]); result = 'OK'; } break; }
    case 'DEL': result = db.delete(a[0]) ? 1 : 0; break;
    case 'INCRBY': db.set(a[0], String(Number(db.get(a[0]) || 0) + Number(a[1]))); result = Number(db.get(a[0])); break;
    case 'DECRBY': db.set(a[0], String(Number(db.get(a[0]) || 0) - Number(a[1]))); result = Number(db.get(a[0])); break;
    case 'HSETNX': { const m = h(a[0]); if (m.has(a[1])) result = 0; else { m.set(a[1], a[2]); result = 1; } break; }
    case 'HGET': result = db.get(a[0])?.get(a[1]) ?? null; break;
    case 'HEXISTS': result = db.get(a[0])?.has(a[1]) ? 1 : 0; break;
    case 'HDEL': result = db.get(a[0])?.delete(a[1]) ? 1 : 0; break;
    case 'HLEN': result = db.get(a[0])?.size || 0; break;
    case 'HGETALL': result = [...(db.get(a[0]) || new Map())].flat(); break;
    default: throw new Error('fake kv: unsupported ' + cmd);
  }
  return new Response(JSON.stringify({ result }), { status: 200 });
};

const R = await import('../lib/raffle.js');

test('ET month boundaries and 10 PM close', () => {
  // Nov 30 2026 21:59 ET (EST, UTC-5) -> Nov; 22:00 ET -> Dec
  assert.equal(R.raffleMonth(Date.UTC(2026, 11, 1, 2, 59)), '2026-11');
  assert.equal(R.raffleMonth(Date.UTC(2026, 11, 1, 3, 0)), '2026-12');
  assert.equal(R.closeAt('2026-11'), Date.UTC(2026, 11, 1, 3, 0));
  // EDT month: Jul 31 22:00 EDT = Aug 1 02:00 UTC
  assert.equal(R.closeAt('2027-07'), Date.UTC(2027, 7, 1, 2, 0));
  // Feb (leap year) last day
  assert.equal(R.closeAt('2028-02'), Date.UTC(2028, 2, 1, 3, 0));
  // Daily cron at 03:10 UTC is after close in both EST and EDT, and on the last ET day.
  assert.equal(R.raffleMonth(Date.UTC(2026, 11, 1, 3, 10)), '2026-12');
  assert.equal(R.etParts(Date.UTC(2027, 7, 1, 3, 10)).d, 31);
  assert.equal(R.nextMonth('2026-12'), '2027-01');
  assert.equal(R.prevMonth('2027-01'), '2026-12');
});

test('canonical email for one-free-entry rule', () => {
  assert.equal(R.canonicalEmail('Jane.Doe+raffle@GMail.com'), 'janedoe@gmail.com');
  assert.equal(R.canonicalEmail('j.d+x@example.com'), 'j.d@example.com');
  assert.equal(R.emailTag('a.b@gmail.com'), R.emailTag('ab+1@googlemail.com'));
});

test('weighted pick is deterministic per seed and proportional to entries', () => {
  const entries = [{ id: 'a', votes: 1 }, { id: 'b', votes: 5 }, { id: 'c', votes: 4 }];
  const seed = 'ab'.repeat(32);
  assert.deepEqual(R.pickWinner(entries, seed), R.pickWinner(entries, seed));
  const n = 20000, counts = { a: 0, b: 0, c: 0 };
  for (let i = 0; i < n; i++) counts[R.pickWinner(entries, crypto.randomBytes(32).toString('hex')).entry.id]++;
  assert.ok(Math.abs(counts.a / n - 0.1) < 0.02, JSON.stringify(counts));
  assert.ok(Math.abs(counts.b / n - 0.5) < 0.02, JSON.stringify(counts));
  assert.equal(R.pickWinner([], seed), null);
});

const session = (id, votes, extra = {}) => ({
  id, payment_status: 'paid', amount_total: votes === 5 ? 400 : 100, currency: 'usd', payment_intent: 'pi_' + id,
  metadata: { type: 'raffle', raffle_votes: String(votes), raffle_name: 'Jane Doe', raffle_email: 'jane@example.com' }, ...extra,
});

test('paid entries are idempotent and free entry is once per email per month', async () => {
  const t = Date.UTC(2026, 10, 20, 15);
  const a = await R.logPaidEntry(session('cs_test_1', 5), t);
  assert.equal(a.added, true); assert.equal(a.month, '2026-11');
  const again = await R.logPaidEntry(session('cs_test_1', 5), t);
  assert.equal(again.added, false);
  assert.equal((await R.logPaidEntry(session('cs_test_2', 1, { payment_status: 'unpaid' }), t)).added, false);
  await R.logPaidEntry(session('cs_test_3', 1), t);
  const month = R.raffleMonth();
  const f1 = await R.logFreeEntry({ name: 'Free Person', email: 'free.person+1@gmail.com', ip: '1.2.3.4' });
  const f2 = await R.logFreeEntry({ name: 'Free Person', email: 'freeperson@gmail.com', ip: '1.2.3.4' });
  assert.equal(f1.added, true); assert.equal(f2.added, false);
  // Next ET day: the same person can enter free again (counted in whatever month that day belongs to).
  const tomorrow = await R.logFreeEntry({ name: 'Free Person', email: 'freeperson@gmail.com', ip: '1.2.3.4', now: Date.now() + 86400000 });
  assert.equal(tomorrow.added, true);
  await R.removeEntry(tomorrow.month, tomorrow.entry.id);
  const s = await R.stats('2026-11');
  assert.equal(s.entrants, month === '2026-11' ? 3 : 2);
  assert.equal(s.votes, month === '2026-11' ? 7 : 6);
  const csv = R.toCsv(await R.listEntries('2026-11'));
  assert.match(csv, /^month,at_iso,kind,name,email,votes,amount_usd/);
  assert.match(csv, /cs_test_1/);
  assert.equal(await R.sessionMonth('cs_test_1'), '2026-11');
});

test('draw is idempotent, refuses open months, and late webhooks roll forward', async () => {
  const open = await R.drawMonth('2026-11', { now: Date.UTC(2026, 10, 25) });
  assert.ok(open.error);
  const d1 = await R.drawMonth('2026-11', { now: Date.UTC(2026, 11, 1, 3, 10) });
  assert.equal(d1.already, false);
  assert.ok(d1.winner.winner);
  assert.equal(d1.winner.seed.length, 64);
  const d2 = await R.drawMonth('2026-11', { now: Date.UTC(2026, 11, 1, 4) });
  assert.equal(d2.already, true);
  assert.equal(d2.winner.seed, d1.winner.seed);
  // Replaying the draw from the recorded seed reproduces the winner.
  const replay = R.pickWinner(await R.listEntries('2026-11'), d1.winner.seed);
  assert.equal(replay.entry.id, d1.winner.winner.id);
  // A retry of an already-logged session after the draw must not duplicate it.
  assert.equal((await R.logPaidEntry(session('cs_test_1', 5), Date.UTC(2026, 10, 20, 15))).added, false);
  // A brand-new late webhook for the drawn month goes to the current open month.
  const late = await R.logPaidEntry(session('cs_test_late', 1), Date.UTC(2026, 10, 30, 12));
  assert.equal(late.added, true);
  assert.notEqual(late.month, '2026-11');
  assert.equal(R.publicName('jane van doe'), 'jane D.');
});

test('awarding a raffle winner grants 31 days of Pro and emails the winner and the owner once', async () => {
  process.env.RESEND_API_KEY = 'test-resend';
  const sent = [];
  const prev = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://api.resend.com')) { sent.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }); }
    return prev(url, init);
  };
  const month = '2026-09';
  await R.addEntry(month, { id: 'free:x', kind: 'free', name: 'Win Ner', email: 'winner@example.com', votes: 1, amountCents: 0 });
  const d = await R.drawMonth(month, { now: Date.UTC(2026, 9, 1, 3, 10) });
  assert.equal(d.winner.winner.email, 'winner@example.com');
  const { awardWinner } = await import('../lib/raffleaward.js');
  const a = await awardWinner(month);
  assert.equal(a.winner.granted, true);
  assert.ok(a.winner.proUntil > Date.now() + 30 * 86400000);
  const { getEntitlement } = await import('../lib/billing.js');
  assert.equal((await getEntitlement('winner@example.com')).pro, true);
  assert.deepEqual(sent.map(m => m.to[0]).sort(), ['senorcoughlin@gmail.com', 'winner@example.com']);
  await awardWinner(month); // idempotent: no second grant or emails
  assert.equal(sent.length, 2);
  globalThis.fetch = prev;
});
