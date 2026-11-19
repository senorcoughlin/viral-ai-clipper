// After a drawing: grant the winner 1 month of Pro and email them (and the owner). Idempotent.
import { getWinner, updateWinner, monthLabel, PRIZE_DAYS } from './raffle';
import { grantProDays } from './billing';

const OWNER = process.env.ALERT_EMAIL_TO || 'senorcoughlin@gmail.com';
const FROM = process.env.RESEND_FROM || 'Viral AI Clipper <login@viralaiclipper.com>';

async function send(to, subject, text) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject, text }),
      cache: 'no-store',
    });
    return r.ok;
  } catch { return false; }
}

export async function awardWinner(month, { notify = true } = {}) {
  let w = await getWinner(month);
  if (!w) return { error: 'No drawing recorded for ' + month };
  if (!w.winner) {
    if (notify && !w.ownerNotified) {
      await send(OWNER, `[Viral AI Clipper] ${monthLabel(month)} raffle: no entries`, `The ${monthLabel(month)} raffle drawing ran with no entries, so there is no winner.`);
      w = await updateWinner(month, { ownerNotified: true });
    }
    return { winner: w };
  }
  if (!w.granted) {
    const g = await grantProDays(w.winner.email, PRIZE_DAYS, `raffle ${month}`);
    w = await updateWinner(month, { granted: true, grantedAt: Date.now(), proUntil: g.proUntil });
  }
  if (notify && !w.notified) {
    const until = new Date(w.proUntil).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric' });
    const ok = await send(w.winner.email, `You won 1 month of Viral AI Clipper Pro!`,
`Hi ${w.winner.name || 'there'},

Congratulations! You were drawn as the winner of the ${monthLabel(month)} Viral AI Clipper raffle.

Your prize, 1 month of Pro, is already active on this email address (${w.winner.email}) until ${until}. That's unlimited clipping (fair use, up to 200 generations a day), no watermark, and every Pro feature.

To use it, go to https://viralaiclipper.com, tap Sign in, and use this same email address.

Your Pro month does not renew and you will not be charged.

Questions? Just reply or email support@viralaiclipper.com.

Viral AI Clipper`);
    if (ok) w = await updateWinner(month, { notified: true, notifiedAt: Date.now() });
  }
  if (notify && !w.ownerNotified) {
    const ok = await send(OWNER, `[Viral AI Clipper] ${monthLabel(month)} raffle winner: ${w.winner.name}`,
`The ${monthLabel(month)} raffle was drawn.

Winner: ${w.winner.name} <${w.winner.email}> (${w.winner.kind} entry, ${w.winner.votes} entries)
Total entries: ${w.totalVotes} from ${w.entrants} people
Winning ticket: #${w.ticket} · seed ${w.seed}
Pro granted until: ${new Date(w.proUntil).toISOString()}
Winner email sent: ${w.notified ? 'yes' : 'NO, please email them manually'}`);
    if (ok) w = await updateWinner(month, { ownerNotified: true });
  }
  return { winner: w };
}
