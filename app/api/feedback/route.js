export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { routeGuard } from '../../../lib/ratelimit';
import { kvEnabled, kvCommand } from '../../../lib/kv';

const TO = process.env.FEEDBACK_EMAIL_TO || process.env.ALERT_EMAIL_TO || 'senorcoughlin@gmail.com';
const FROM = process.env.FEEDBACK_EMAIL_FROM || 'Viral AI Clipper Feedback <feedback@viralaiclipper.com>';
const TYPES = { bug: 'Bug', feature: 'Feature idea', general: 'General' };
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export async function POST(request) {
  const limited = await routeGuard(request, 'feedback', 5, 3600);
  if (limited) return limited;
  let b;
  try { b = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  if (b?.website) return NextResponse.json({ ok: true }); // honeypot
  const type = TYPES[b?.type] ? b.type : 'general';
  const message = String(b?.message || '').trim();
  if (message.length < 3) return NextResponse.json({ error: 'Please write a short message.' }, { status: 400 });
  if (message.length > 2000) return NextResponse.json({ error: 'Message is too long (2000 characters max).' }, { status: 400 });
  const rating = Number.isInteger(Number(b?.rating)) && b.rating >= 1 && b.rating <= 5 ? Number(b.rating) : null;
  const email = String(b?.email || '').trim().slice(0, 254);
  if (email && !EMAIL_RE.test(email)) return NextResponse.json({ error: 'That email address looks off.' }, { status: 400 });
  const page = String(b?.page || '').slice(0, 500);
  const entry = { at: new Date().toISOString(), type, rating, message, email: email || null, page, ua: (request.headers.get('user-agent') || '').slice(0, 200) };

  let stored = false;
  if (kvEnabled) {
    try { await kvCommand(['LPUSH', 'feedback:all', JSON.stringify(entry)]); await kvCommand(['LTRIM', 'feedback:all', '0', '4999']); stored = true; } catch {}
  }
  let emailed = false;
  if (process.env.RESEND_API_KEY) {
    try {
      const payload = {
        from: FROM, to: [TO],
        subject: `[Feedback] ${TYPES[type]}${rating ? ` · ${rating}/5` : ''}: ${message.slice(0, 60).replace(/\s+/g, ' ')}`,
        text: `Type: ${TYPES[type]}\nRating: ${rating ? rating + '/5' : '—'}\nFrom: ${email || 'anonymous'}\nPage: ${page || '—'}\nTime: ${entry.at}\n\n${message}`,
      };
      if (email) payload.reply_to = email;
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), cache: 'no-store' });
      emailed = r.ok;
    } catch {}
  }
  if (!stored && !emailed) return NextResponse.json({ error: 'Could not send feedback right now. Please email support@viralaiclipper.com.' }, { status: 503 });
  return NextResponse.json({ ok: true });
}
