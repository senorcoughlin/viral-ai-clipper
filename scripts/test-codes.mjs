import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sent, db } from './fake-kv.mjs';
process.env.SESSION_SECRET = 'test-session-secret-1234567890';
process.env.RESEND_API_KEY = 'test-resend';

const C = await import('../lib/codes.js');
const { getEntitlement } = await import('../lib/billing.js');
const { signSession } = await import('../lib/session.js');
const { POST } = await import('../app/api/codes/redeem/route.js');
const admin = await import('../app/api/codes/admin/route.js');
process.env.RAFFLE_ADMIN_KEY = 'test-admin-key';

const req = (body, email, verified = true, ip = '9.9.9.' + Math.floor(Math.random() * 250)) => new Request('https://viralaiclipper.com/api/codes/redeem', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...(email ? { cookie: `vac_session=${encodeURIComponent(signSession({ email, verified }))}` } : {}) },
  body: JSON.stringify(body),
});

test('NathanRules (any case) grants 31 days of Pro once per account and emails the owner', async () => {
  sent.length = 0;
  const r1 = await POST(req({ code: '  nathanrules ' }, 'tester@example.com'));
  const d1 = await r1.json();
  assert.equal(r1.status, 200, JSON.stringify(d1));
  assert.equal(d1.success, true);
  assert.equal(d1.pro, true);
  assert.ok(d1.proUntil > Date.now() + 30.9 * 86400000 && d1.proUntil < Date.now() + 31.1 * 86400000);
  assert.match(d1.message, /won't renew/);
  assert.equal((await getEntitlement('tester@example.com')).pro, true);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].to, ['senorcoughlin@gmail.com']);
  assert.match(sent[0].subject, /NATHANRULES redeemed by tester@example.com/);
  assert.match(sent[0].text, /Reward: 31 days of Pro/);
  assert.match(sent[0].text, /Time: .* ET/);
  const r2 = await POST(req({ code: 'NathanRules' }, 'tester@example.com'));
  assert.equal(r2.status, 409);
  assert.equal(sent.length, 1);
  assert.equal((await C.listRedemptions()).length, 1);
});

test('requires a signed-in, verified account and rejects unknown codes', async () => {
  assert.equal((await POST(req({ code: 'NathanRules' }, null))).status, 401);
  const unv = await POST(req({ code: 'NathanRules' }, 'new@example.com', false));
  assert.equal(unv.status, 401);
  assert.match((await unv.json()).message, /confirm your email/i);
  const bad = await POST(req({ code: 'NOPE123' }, 'x@example.com'));
  assert.equal(bad.status, 400);
  assert.equal((await getEntitlement('new@example.com')).pro, false);
});

test('codes table: Redis codes with max uses, expiry, disabling', async () => {
  await C.setCodeDef('bonus10', { reward: { type: 'credits', n: 10 }, maxUses: 1 });
  const a = await POST(req({ code: 'Bonus10' }, 'a@example.com'));
  assert.equal(a.status, 200);
  assert.equal((await getEntitlement('a@example.com')).credits, 10);
  assert.equal((await POST(req({ code: 'bonus10' }, 'b@example.com'))).status, 410);
  await C.setCodeDef('OLD', { reward: { type: 'pro', days: 7 }, expiresAt: '2020-01-01T00:00:00Z' });
  assert.equal((await POST(req({ code: 'old' }, 'c@example.com'))).status, 400);
  await C.setCodeDef('NATHANRULES', { active: false });
  assert.equal((await POST(req({ code: 'nathanrules' }, 'd@example.com'))).status, 400);
  await C.setCodeDef('NATHANRULES', { active: true });
});

test('admin can remove a test redemption and revoke its Pro grant', async () => {
  const unauth = await admin.POST(new Request('https://viralaiclipper.com/api/codes/admin', { method: 'POST', body: '{}' }));
  assert.ok([401, 403].includes(unauth.status));
  const r = await admin.POST(new Request('https://viralaiclipper.com/api/codes/admin', {
    method: 'POST', headers: { 'x-raffle-admin-key': 'test-admin-key', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'remove-redemption', code: 'NathanRules', email: 'tester@example.com', revoke: true }),
  }));
  const d = await r.json();
  assert.equal(d.removed, true);
  assert.equal(d.logRemoved, 1);
  assert.equal((await getEntitlement('tester@example.com')).pro, false);
  // The account can redeem again after the undo.
  assert.equal((await POST(req({ code: 'NATHANRULES' }, 'tester@example.com'))).status, 200);
});
