import { NextResponse } from 'next/server';
import { routeGuard, allowAttempt, clientIp } from '../../../../lib/ratelimit';
import { reportError } from '../../../../lib/alerts';
import { cleanName, cleanEmail, validEmail, logFreeEntry, monthLabel } from '../../../../lib/raffle';

// Free entry (no purchase necessary): 1 entry per person (email) per month.
export async function POST(request) {
  const limited = await routeGuard(request, 'raffle-free', 6, 3600);
  if (limited) return limited;
  try {
    const body = await request.json().catch(() => ({}));
    // Honeypot + minimum fill time: bots fill hidden fields or submit instantly.
    if (body.website || (Number(body.elapsed) || 0) < 1500) {
      return NextResponse.json({ error: 'Please try again.' }, { status: 400 });
    }
    const name = cleanName(body.name);
    const email = cleanEmail(body.email);
    if (name.length < 2) return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 });
    if (!validEmail(email)) return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    if (body.agree !== true) return NextResponse.json({ error: 'Please confirm you are 18+ and agree to the Official Rules.' }, { status: 400 });
    const ip = clientIp(request);
    if (!(await allowAttempt(`raffle-free-ip-day:${ip}`, 3, 86400).catch(() => true))) {
      return NextResponse.json({ error: 'Too many free entries from this network today.' }, { status: 429 });
    }
    const r = await logFreeEntry({ name, email, ip });
    if (!r.added) {
      return NextResponse.json({ ok: true, duplicate: true, message: `You already have your free entry for the ${monthLabel(r.month)} drawing. Come back next month!` });
    }
    return NextResponse.json({ ok: true, month: r.month, message: `You're in! 1 free entry for the ${monthLabel(r.month)} drawing.` });
  } catch (e) {
    console.error(e);
    await reportError('raffle-free', e);
    return NextResponse.json({ error: 'Could not save your entry. Please try again.' }, { status: 500 });
  }
}
