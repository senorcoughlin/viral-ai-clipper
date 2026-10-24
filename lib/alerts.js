// Owner alerts: count failures per route in Redis and email the owner via Resend,
// at most once per hour per alert key. Never throws.
import { kvEnabled, kvCommand } from './kv';

const OWNER = process.env.ALERT_EMAIL_TO || 'senorcoughlin@gmail.com';
const FROM = process.env.ALERT_EMAIL_FROM || 'Viral AI Clipper Alerts <alerts@viralaiclipper.com>';

async function sendEmail(subject, text) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [OWNER], subject, text }),
      cache: 'no-store',
    });
    return r.ok;
  } catch { return false; }
}

// Returns true if this caller won the hourly slot for `key`.
async function claimHourly(key, ttl = 3600) {
  if (!kvEnabled) return false; // no Redis = no throttle = don't spam
  try { return (await kvCommand(['SET', `alert:sent:${key}`, '1', 'NX', 'EX', String(ttl)])) === 'OK'; } catch { return false; }
}

export async function reportError(route, err, extra = '') {
  try {
    const msg = String(err?.message || err || 'unknown error').slice(0, 500);
    let count = null;
    if (kvEnabled) {
      const day = new Date().toISOString().slice(0, 10);
      const k = `errors:${route}:${day}`;
      count = Number(await kvCommand(['INCR', k]).catch(() => null));
      if (count === 1) kvCommand(['EXPIRE', k, String(14 * 86400)]).catch(() => {});
      kvCommand(['SET', `errors:last:${route}`, JSON.stringify({ at: Date.now(), msg }), 'EX', String(14 * 86400)]).catch(() => {});
    }
    if (await claimHourly(`err:${route}`)) {
      await sendEmail(
        `[Viral AI Clipper] ${route} is failing`,
        `An error happened in ${route} at ${new Date().toISOString()}.\n\nError: ${msg}\n${extra ? `\nDetails: ${String(extra).slice(0, 500)}\n` : ''}${count ? `\nFailures in ${route} today (UTC): ${count}\n` : ''}\nYou'll get at most one email per hour for this route.`
      );
    }
  } catch {}
}

// Email once per cycle when RenderIO usage crosses 80% and 95% of the cap.
export async function checkUsageThreshold(used, cap, cycle) {
  try {
    if (!cap || !used) return;
    const pct = (used / cap) * 100;
    const level = pct >= 95 ? 95 : pct >= 80 ? 80 : 0;
    if (!level) return;
    if (!(await claimHourly(`rio:${cycle}:${level}`, 40 * 86400))) return;
    await sendEmail(
      `[Viral AI Clipper] RenderIO usage at ${level}% (${used}/${cap})`,
      `RenderIO has used ${used} of ${cap} commands (${Math.round(pct)}%) this billing cycle (started ${cycle}).\n\nAt ${cap} the site shows an "at capacity" message and stops processing until the cycle resets. To raise it, upgrade RenderIO and update RENDERIO_MONTHLY_CAP in Vercel.`
    );
  } catch {}
}
