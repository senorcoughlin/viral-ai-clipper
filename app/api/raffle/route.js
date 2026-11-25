import { NextResponse } from 'next/server';
import { raffleMonth, closeAt, stats, getWinner, prevMonth, publicName, monthLabel, sessionMonth } from '../../../lib/raffle';

export const dynamic = 'force-dynamic';

// Public raffle status: real entry counts for the current month, closing time, last winner (first name + initial).
// Public counts are cached 45s per instance (3 Redis commands to build); the CDN also caches the response.
let memo = { at: 0, month: '', body: null };
export async function GET(request) {
  const url = new URL(request.url);
  const month = raffleMonth();
  let body = memo.month === month && Date.now() - memo.at < 45000 ? memo.body : null;
  if (!body) {
  const [s, last] = await Promise.all([stats(month), getWinner(prevMonth(month))]);
  body = {
    month,
    monthLabel: monthLabel(month),
    closesAt: closeAt(month),
    entrants: s.entrants,
    entries: s.votes,
    lastWinner: last?.winner ? { month: last.month, monthLabel: monthLabel(last.month), name: publicName(last.winner.name) } : null,
  };
  memo = { at: Date.now(), month, body };
  }
  const sid = url.searchParams.get('session');
  if (sid) body = { ...body, session: { logged: !!(await sessionMonth(sid)) } };
  return NextResponse.json(body, { headers: { 'Cache-Control': sid ? 'no-store' : 'public, s-maxage=15, stale-while-revalidate=30' } });
}
