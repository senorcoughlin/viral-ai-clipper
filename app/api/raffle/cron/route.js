import { cronOk, json } from '../../../../lib/raffleadmin';
import { reportError } from '../../../../lib/alerts';
import { raffleMonth, prevMonth, closeAt, getWinner, drawMonth, stats } from '../../../../lib/raffle';
import { awardWinner } from '../../../../lib/raffleaward';

export const dynamic = 'force-dynamic';

// Daily Vercel Cron (late evening ET). Draws any month whose entries have closed and that has no winner yet:
// on the last day of the month after 10 PM ET, the just-closed month; otherwise a missed previous month.
export async function GET(request) {
  if (!cronOk(request)) return json({ error: 'Forbidden' }, 403);
  const out = [];
  try {
    const cur = raffleMonth(); // after close this is already next month
    for (const m of [prevMonth(cur), cur]) {
      if (Date.now() < closeAt(m)) continue;
      if (await getWinner(m)) { out.push({ month: m, status: 'already drawn' }); continue; }
      if (!(await stats(m)).votes) { out.push({ month: m, status: 'no entries, skipped' }); continue; }
      const r = await drawMonth(m);
      if (r.error) { out.push({ month: m, error: r.error }); continue; }
      const a = await awardWinner(m);
      out.push({ month: m, status: 'drawn', winner: a.winner?.winner ? a.winner.winner.id : null });
    }
    return json({ ok: true, out });
  } catch (e) {
    await reportError('raffle-cron', e);
    return json({ error: e.message }, 500);
  }
}
