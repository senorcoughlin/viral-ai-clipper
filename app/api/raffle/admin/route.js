import { requireRaffleAdmin, json, noStore } from '../../../../lib/raffleadmin';
import { audit } from '../../../../lib/adminauth';
import { raffleMonth, parseMonth, listEntries, stats, toCsv, getWinner, drawMonth, removeEntry, closeAt, PRIZE_DAYS } from '../../../../lib/raffle';
import { awardWinner } from '../../../../lib/raffleaward';
import { grantProDays } from '../../../../lib/billing';

export const dynamic = 'force-dynamic';

// GET ?month=YYYY-MM[&format=csv] -> entries for a month (JSON or CSV download).
export async function GET(request) {
  const denied = await requireRaffleAdmin(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const month = url.searchParams.get('month') || raffleMonth();
  if (!parseMonth(month)) return json({ error: 'month must be YYYY-MM' }, 400);
  const entries = await listEntries(month);
  await audit(request, 'raffle.list', { month, n: entries.length });
  if (url.searchParams.get('format') === 'csv') {
    return new Response(toCsv(entries), { headers: { ...noStore, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="raffle-${month}.csv"` } });
  }
  const s = await stats(month);
  const paidCents = entries.reduce((t, e) => t + (Number(e.amountCents) || 0), 0);
  return json({ month, closesAt: new Date(closeAt(month)).toISOString(), ...s, paidUsd: (paidCents / 100).toFixed(2), winner: await getWinner(month), entries });
}

// POST { action: 'draw', month, early? } | { action: 'grant', email, days? } | { action: 'remove', month, id } | { action: 'notify', month }
export async function POST(request) {
  const denied = await requireRaffleAdmin(request, { write: true });
  if (denied) return denied;
  const b = await request.json().catch(() => ({}));
  const month = b.month || raffleMonth();
  if (b.action !== 'grant' && !parseMonth(month)) return json({ error: 'month must be YYYY-MM' }, 400);
  try {
    if (b.action === 'draw') {
      const r = await drawMonth(month, { early: b.early === true });
      if (r.error) return json(r, 409);
      const award = b.award === false ? null : await awardWinner(month, { notify: b.notify !== false });
      await audit(request, 'raffle.draw', { month, already: r.already, winner: r.winner?.winner?.id || null });
      return json({ already: r.already, result: award?.winner || r.winner });
    }
    if (b.action === 'notify') return json(await awardWinner(month));
    if (b.action === 'grant') {
      const g = await grantProDays(String(b.email || '').toLowerCase(), Number(b.days) || PRIZE_DAYS, 'raffle manual grant');
      await audit(request, 'raffle.grant', { email: g.email, days: Number(b.days) || PRIZE_DAYS });
      return json({ ok: true, ...g, proUntilIso: new Date(g.proUntil).toISOString() });
    }
    if (b.action === 'remove') {
      if (await getWinner(month)) return json({ error: 'Month already drawn; entries are frozen.' }, 409);
      const r = await removeEntry(month, String(b.id || ''));
      await audit(request, 'raffle.remove', { month, id: b.id, removed: r.removed });
      return json(r);
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
