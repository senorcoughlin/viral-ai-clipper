// Upstash quota hardening (Nov 25): fail fast + fall back when Redis is over quota, and keep the
// commands-per-request low (every Redis command is billed on Upstash).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db, cmdLog } from './fake-kv.mjs';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-1234567890';

const kv = await import('../lib/kv.js');
const { incr, checkLimit } = await import('../lib/ratelimit.js');
const { getSiteConfig } = await import('../lib/siteconfig.js');
const { reserveRenderio, BudgetError } = await import('../lib/capacity.js');
const { createJob, beatJob, readJob, touchJob } = await import('../lib/jobs.js');
const { POST: eventPost } = await import('../app/api/event/route.js');

const QUOTA = JSON.stringify({ error: 'ERR max requests limit exceeded. Limit: 500000, Usage: 500000.' });

async function withQuotaBlock(fn) {
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://fake-kv.test')) { calls++; return new Response(QUOTA, { status: 400 }); }
    return real(url, init);
  };
  kv._resetKvBreakerForTests();
  try { return await fn(() => calls); } finally { globalThis.fetch = real; kv._resetKvBreakerForTests(); }
}

test('quota errors trip a cool-off so later calls fail fast without hitting Redis', async () => {
  await withQuotaBlock(async (calls) => {
    await assert.rejects(kv.kvCommand(['GET', 'x']), (e) => e.kvQuota === true);
    assert.equal(kv.kvHealthy(), false);
    const before = calls();
    for (let i = 0; i < 5; i++) await assert.rejects(kv.kvCommand(['GET', 'x']), (e) => e.kvSkipped === true);
    assert.equal(calls(), before, 'no network calls while cooling off');
  });
  assert.equal(kv.kvHealthy(), true);
});

test('rate limits fail open to memory, site config keeps defaults, RenderIO falls back to local ffmpeg', async () => {
  await withQuotaBlock(async () => {
    assert.equal(await incr('rl:test:quota', 60), 1);
    assert.equal(await incr('rl:test:quota', 60), 2);
    const lim = await checkLimit('9.9.9.9', 'free');
    assert.equal(lim.ok, true);
    const cfg = await getSiteConfig(true);
    assert.equal(cfg.flags.pause_generation, false);
    await assert.rejects(reserveRenderio(), (e) => e instanceof BudgetError);
  });
});

test('/api/event costs 2 commands for a repeat event and 4 for a repeat page view', async () => {
  kv._resetKvBreakerForTests();
  const mk = (name) => new Request('https://x.test/api/event', { method: 'POST', headers: { 'user-agent': 'Mozilla/5.0 Safari', 'x-forwarded-for': '5.5.5.5', 'x-vercel-ip-city': 'Pooler', 'x-vercel-ip-country-region': 'GA', 'x-vercel-ip-country': 'US' }, body: JSON.stringify({ name }) });
  await eventPost(mk('landing_view')); // first one also sets TTLs / city list
  const n0 = cmdLog.length;
  await eventPost(mk('landing_view'));
  assert.equal(cmdLog.length - n0, 4, cmdLog.slice(n0).join(' | '));
  const n1 = cmdLog.length;
  await eventPost(mk('url_pasted')); await eventPost(mk('url_pasted'));
  const first = cmdLog.slice(n1);
  const n2 = cmdLog.length;
  await eventPost(mk('url_pasted'));
  assert.equal(cmdLog.length - n2, 2);
  assert.ok(first.length <= 6);
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  assert.equal(Number(db.get(`ev:${day}:landing_view`)), 2);
  assert.equal(Number(db.get(`ev:${day}:url_pasted`)), 3);
});

test('job heartbeat is one command and keeps a live job from looking stale', async () => {
  kv._resetKvBreakerForTests();
  await createJob('abcdef123456', { slotKey: null });
  // Make the job record old, as it is now that heartbeats no longer rewrite it.
  const meta = JSON.parse(db.get('job:abcdef123456:meta'));
  meta.hb = Date.now() - 5 * 60 * 1000; meta.startedAt = meta.hb;
  db.set('job:abcdef123456:meta', JSON.stringify(meta));
  db.delete('job:abcdef123456:lock');
  assert.equal((await readJob('abcdef123456')).stale, true, 'no beat, old record: stale');
  const n = cmdLog.length;
  await beatJob('abcdef123456');
  assert.equal(cmdLog.length - n, 1);
  assert.equal((await readJob('abcdef123456')).stale, false, 'fresh beat: not stale');
  await touchJob('abcdef123456', { done: true });
  assert.equal((await readJob('abcdef123456')).done, true);
});

test('sign-in links still work (signed, 15 min) when Redis is over quota', async () => {
  const { createMagicToken, consumeMagicToken } = await import('../lib/magic.js');
  // Normal path: single use.
  const t1 = await createMagicToken('a@example.com');
  assert.equal(await consumeMagicToken(t1), 'a@example.com');
  assert.equal(await consumeMagicToken(t1), null);
  // Quota path: fallback token verifies without Redis, and tampering is still rejected.
  await withQuotaBlock(async () => {
    const t2 = await createMagicToken('b@example.com');
    assert.equal(await consumeMagicToken(t2), 'b@example.com');
    const [p, sig] = t2.split('.');
    const forged = Buffer.from(JSON.stringify({ e: 'evil@example.com', n: 'x', x: Date.now() + 1e6, s: 1 })).toString('base64url') + '.' + sig;
    assert.equal(await consumeMagicToken(forged), null);
    assert.ok(p);
  });
});
