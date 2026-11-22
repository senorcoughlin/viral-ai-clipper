import { cronOk, json } from '../../../../lib/raffleadmin';
import { reportError, emailUser } from '../../../../lib/alerts';
import { listDueBfReminders, markBfReminded } from '../../../../lib/billing';
import { etDate } from '../../../../lib/bftrial';

export const dynamic = 'force-dynamic';

function copy(rec) {
  const when = etDate(rec.trialEnd);
  const subject = `Your free Pro week ends on ${when}`;
  const text = `Your Viral AI Clipper Pro trial ends on ${when} (America/New_York). After that you’ll be billed $9.99/month unless you cancel first.

To cancel before you’re charged, use the link in the receipt Stripe emailed you, or email support@viralaiclipper.com.

If you want to keep Pro, you don’t need to do anything.

— Viral AI Clipper
https://viralaiclipper.com`;
  return { subject, text };
}

// Daily Vercel Cron: remind customers whose 7-day Pro trial ends within 48 hours.
export async function GET(request) {
  if (!cronOk(request)) return json({ error: 'Forbidden' }, 403);
  try {
    const due = await listDueBfReminders();
    const out = [];
    for (const rec of due) {
      const { subject, text } = copy(rec);
      const sent = await emailUser(rec.email, subject, text);
      if (sent) await markBfReminded(rec.email);
      out.push({ email: rec.email, sent, trialEnd: rec.trialEnd });
    }
    return json({ ok: true, sent: out.filter(x => x.sent).length, out });
  } catch (e) {
    await reportError('trial-remind', e);
    return json({ error: e.message }, 500);
  }
}

export { copy as reminderCopy };
