export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { kvEnabled, kvCommand } from '../../../lib/kv';
import { paidEmail, getSession, readCookie } from '../../../lib/session';
import { clientIp, nyDay, allowAttempt } from '../../../lib/ratelimit';
import { addCredits, getEntitlement } from '../../../lib/billing';
import { PRIZES, drawPrize, emailHash, nextNyMidnight } from '../../../lib/spin';

const DEV_COOKIE = 'vac_dev';
const TTL = String(60 * 60 * 26);
const IP_MAX = Number(process.env.SPIN_IP_DAILY_MAX || 2); // households / shared Wi-Fi
const odds = PRIZES.map(p => ({ clips: p.clips, pct: p.weight / 100 }));
const noStore = { 'Cache-Control': 'no-store' };

function device(request) {
  const d = readCookie(request, DEV_COOKIE);
  return /^[a-f0-9]{32}$/.test(d || '') ? { id: d, fresh: false } : { id: crypto.randomBytes(16).toString('hex'), fresh: true };
}
function reply(body, status, dev) {
  const res = NextResponse.json(body, { status, headers: noStore });
  if (dev?.fresh) res.cookies.set(DEV_COOKIE, dev.id, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
  return res;
}

async function status(request) {
  const email = paidEmail(request);
  const base = { success: true, odds, nextAt: nextNyMidnight() };
  if (!email) {
    const s = getSession(request);
    return { ...base, signedIn: !!s, verified: false, email: s?.email || '', available: false, needEmail: true };
  }
  const prize = kvEnabled ? await kvCommand(['GET', `spin:${emailHash(email)}:${nyDay()}`]).catch(() => null) : null;
  const ent = await getEntitlement(email).catch(() => ({ pro: false, credits: 0 }));
  return { ...base, signedIn: true, verified: true, email, pro: !!ent.pro, credits: ent.credits, available: !prize, todayPrize: prize ? Number(prize) : null };
}

export async function GET(request) {
  const dev = device(request);
  return reply(await status(request), 200, dev);
}

export async function POST(request) {
  const dev = device(request);
  if (!kvEnabled) return reply({ success: false, message: 'Spin is not available right now.' }, 503, dev);
  const ip = clientIp(request);
  if (!(await allowAttempt(`spin:burst:${ip}`, 20, 600).catch(() => true))) return reply({ success: false, message: 'Too many tries. Wait a few minutes.' }, 429, dev);
  const email = paidEmail(request);
  if (!email) {
    const s = getSession(request);
    return reply({ success: false, needEmail: true, email: s?.email || '', message: 'Confirm your email to spin. We\'ll send you a sign-in link.' }, 401, dev);
  }
  const day = nyDay();
  const nextAt = nextNyMidnight();
  const userKey = `spin:${emailHash(email)}:${day}`;
  const prize = drawPrize();
  // Atomic claim: only the first request today for this email wins.
  const won = await kvCommand(['SET', userKey, String(prize), 'NX', 'EX', TTL]);
  if (won !== 'OK') {
    const had = await kvCommand(['GET', userKey]).catch(() => null);
    return reply({ success: false, already: true, todayPrize: had ? Number(had) : null, nextAt, message: 'You already spun today. Come back tomorrow!' }, 409, dev);
  }
  // Anti-farming: one spin per device and a small cap per IP per day.
  const devKey = `spin:dev:${dev.id}:${day}`;
  const ipKey = `spin:ip:${ip}:${day}`;
  const devOk = await kvCommand(['SET', devKey, emailHash(email), 'NX', 'EX', TTL]);
  const ipN = Number(await kvCommand(['INCR', ipKey])); await kvCommand(['EXPIRE', ipKey, TTL]);
  if (devOk !== 'OK' || ipN > IP_MAX) {
    await kvCommand(['DEL', userKey]);
    if (devOk === 'OK') await kvCommand(['DEL', devKey]);
    await kvCommand(['DECR', ipKey]);
    return reply({ success: false, limited: true, nextAt, message: 'Today\'s spin was already used on this device or network. Come back tomorrow!' }, 429, dev);
  }
  const r = await addCredits(email, prize, `spin:${day}`);
  return reply({ success: true, prize, index: PRIZES.findIndex(p => p.clips === prize), credits: r.credits, nextAt }, 200, dev);
}
