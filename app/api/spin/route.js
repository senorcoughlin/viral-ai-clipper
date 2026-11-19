export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { kvEnabled, kvCommand } from '../../../lib/kv';
import { paidEmail, getSession, readCookie } from '../../../lib/session';
import { clientIp, nyDay, allowAttempt } from '../../../lib/ratelimit';
import { addCredits, getEntitlement, grantProDays } from '../../../lib/billing';
import { emailOwner } from '../../../lib/alerts';
import { odds as oddsList, drawPrize, prizeById, emailHash, nextNyMidnight, PRO_DAYS } from '../../../lib/spin';

const DEV_COOKIE = 'vac_dev';
const TTL = String(60 * 60 * 26);
const IP_MAX = Number(process.env.SPIN_IP_DAILY_MAX || 2); // households / shared Wi-Fi
const odds = oddsList();
// Stored per-day value is the prize id ('c5', 'pro'); legacy values are plain numbers.
const pub = (v) => { const p = v ? prizeById(v) : null; return p ? { todayPrize: p.pro ? 'pro' : p.clips, todayPrizeId: p.id } : { todayPrize: null }; };
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
  return { ...base, signedIn: true, verified: true, email, pro: !!ent.pro, credits: ent.credits, proUntil: ent.proUntil || null, available: !prize, ...pub(prize) };
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
  const won = await kvCommand(['SET', userKey, prize.id, 'NX', 'EX', TTL]);
  if (won !== 'OK') {
    const had = await kvCommand(['GET', userKey]).catch(() => null);
    return reply({ success: false, already: true, ...pub(had), nextAt, message: 'You already spun today. Come back tomorrow!' }, 409, dev);
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
  if (prize.pro) {
    const g = await grantProDays(email, PRO_DAYS, `spin ${day}`);
    const at = new Date();
    await emailOwner(`[Viral AI Clipper] Spin wheel Pro winner: ${email}`,
      `Someone won 1 month of Pro on the daily spin wheel.\n\nWinner email: ${email}\nPrize: 1 month of Pro (${PRO_DAYS} days, no renewal), granted automatically\nPro active until: ${new Date(g.proUntil).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET\nWon at: ${at.toLocaleString('en-US', { timeZone: 'America/New_York' })} ET (${at.toISOString()})`);
    const ent = await getEntitlement(email).catch(() => ({ credits: 0 }));
    return reply({ success: true, prize: 'pro', prizeId: 'pro', pro: true, proUntil: g.proUntil, credits: ent.credits, nextAt }, 200, dev);
  }
  const r = await addCredits(email, prize.clips, `spin:${day}`);
  return reply({ success: true, prize: prize.clips, prizeId: prize.id, credits: r.credits, nextAt }, 200, dev);
}
