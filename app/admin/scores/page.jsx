import { cookies } from 'next/headers';
import { verifySession, SESSION_COOKIE } from '../../../lib/session';
import { loadRuns } from '../../../lib/metrics';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Score dashboard', robots: { index: false, follow: false } };

const ADMINS = (process.env.ADMIN_EMAILS || 'senorcoughlin@gmail.com').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const num = (k) => (process.env[k] ? Number(process.env[k]) : null);
const fmt = (n, d = 1) => (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : '–');

function allowed(searchParams) {
  const key = process.env.PRO_ADMIN_KEY;
  if (key && searchParams?.key === key) return true;
  const s = verifySession(cookies().get(SESSION_COOKIE)?.value);
  return !!(s?.verified && ADMINS.includes(s.email));
}

export default async function ScoreDashboard({ searchParams }) {
  if (!allowed(searchParams)) {
    return <main className="mx-auto max-w-xl p-10 text-soft">Not authorized. Sign in with an admin email (or use the admin key).</main>;
  }
  const runs = await loadRuns();
  const live = runs.filter(r => !r.cached);
  const clips = runs.flatMap(r => r.clips || []);
  const scored = clips.filter(c => c.scored && c.score > 0).map(c => c.score);
  const buckets = Array.from({ length: 10 }, (_, i) => ({ lo: i * 10, hi: i * 10 + 9, n: 0 }));
  scored.forEach(s => { buckets[Math.min(9, Math.floor(s / 10))].n++; });
  const maxB = Math.max(1, ...buckets.map(b => b.n));
  const sorted = [...scored].sort((a, b) => a - b);
  const pct = (p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : NaN);
  const mean = sorted.reduce((a, b) => a + b, 0) / (sorted.length || 1);

  // Usage totals from per-run meters (raw counts; prices only if env unit costs are set).
  const t = { jobs: 0, jobMs: 0, jobBytes: 0, failedJobs: 0, gCalls: 0, gIn: 0, gOut: 0, gThink: 0, wSec: 0, wCalls: 0 };
  for (const r of live) {
    const m = r.meter || {};
    for (const j of m.renderio || []) { t.jobs++; t.jobMs += j.ms || 0; t.jobBytes += j.bytes || 0; if (String(j.kind).includes('failed')) t.failedJobs++; }
    for (const g of m.gemini || []) { t.gCalls++; t.gIn += g.prompt || 0; t.gOut += g.out || 0; t.gThink += g.thoughts || 0; }
    t.wSec += m.whisperSec || 0; t.wCalls += m.whisperCalls || 0;
  }
  const liveClips = live.reduce((a, r) => a + (r.clips?.length || 0), 0);
  const per = (v, n) => (n ? v / n : NaN);
  const unit = { job: num('COST_RENDERIO_JOB'), jobSec: num('COST_RENDERIO_SEC'), gIn: num('COST_GEMINI_IN_PER_1M'), gOut: num('COST_GEMINI_OUT_PER_1M'), wHour: num('COST_WHISPER_PER_HOUR') };
  const hasCost = Object.values(unit).some(v => v !== null);
  const cost = (unit.job || 0) * t.jobs + (unit.jobSec || 0) * t.jobMs / 1000 + (unit.gIn || 0) * t.gIn / 1e6 + (unit.gOut || 0) * (t.gOut + t.gThink) / 1e6 + (unit.wHour || 0) * t.wSec / 3600;

  const Row = ({ k, total, run, clip }) => (
    <tr className="border-t border-line"><td className="py-1.5 pr-4 text-soft">{k}</td><td className="pr-4 font-mono">{total}</td><td className="pr-4 font-mono">{run}</td><td className="font-mono">{clip}</td></tr>
  );

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 p-6 text-fg">
      <h1 className="font-display text-3xl font-extrabold">Score dashboard</h1>
      <p className="text-sm text-muted">{runs.length} runs logged ({live.length} live, {runs.length - live.length} from cache) · {clips.length} clips · {scored.length} scored · {clips.length - scored.length} not scored</p>

      <section className="card flex flex-col gap-3 p-5">
        <h2 className="font-semibold">Viral score distribution</h2>
        <p className="text-sm text-soft">Mean {fmt(mean)} · p10 {fmt(pct(0.1), 0)} · median {fmt(pct(0.5), 0)} · p90 {fmt(pct(0.9), 0)} · 90+ share {fmt(per(scored.filter(s => s >= 90).length * 100, scored.length))}%</p>
        <div className="flex h-48 items-end gap-2">
          {buckets.map(b => (
            <div key={b.lo} className="flex flex-1 flex-col items-center gap-1">
              <span className="font-mono text-[11px] text-muted">{b.n}</span>
              <div className="w-full rounded-t bg-lime" style={{ height: `${(b.n / maxB) * 150}px` }} />
              <span className="font-mono text-[10px] text-muted">{b.lo}–{b.hi}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card flex flex-col gap-3 p-5">
        <h2 className="font-semibold">Usage (live runs only)</h2>
        <table className="text-sm">
          <thead><tr className="text-left text-xs text-muted"><th className="pr-4">Metric</th><th className="pr-4">Total</th><th className="pr-4">Per run</th><th>Per clip</th></tr></thead>
          <tbody>
            <Row k="RenderIO jobs" total={fmt(t.jobs, 0)} run={fmt(per(t.jobs, live.length))} clip={fmt(per(t.jobs, liveClips))} />
            <Row k="RenderIO job seconds" total={fmt(t.jobMs / 1000)} run={fmt(per(t.jobMs / 1000, live.length))} clip={fmt(per(t.jobMs / 1000, liveClips))} />
            <Row k="RenderIO failed jobs" total={fmt(t.failedJobs, 0)} run={fmt(per(t.failedJobs, live.length), 2)} clip="" />
            <Row k="RenderIO output MB (when reported)" total={fmt(t.jobBytes / 1e6)} run={fmt(per(t.jobBytes / 1e6, live.length))} clip={fmt(per(t.jobBytes / 1e6, liveClips))} />
            <Row k="Gemini calls" total={fmt(t.gCalls, 0)} run={fmt(per(t.gCalls, live.length))} clip={fmt(per(t.gCalls, liveClips))} />
            <Row k="Gemini prompt tokens" total={fmt(t.gIn, 0)} run={fmt(per(t.gIn, live.length), 0)} clip={fmt(per(t.gIn, liveClips), 0)} />
            <Row k="Gemini output tokens" total={fmt(t.gOut, 0)} run={fmt(per(t.gOut, live.length), 0)} clip={fmt(per(t.gOut, liveClips), 0)} />
            <Row k="Gemini thinking tokens" total={fmt(t.gThink, 0)} run={fmt(per(t.gThink, live.length), 0)} clip={fmt(per(t.gThink, liveClips), 0)} />
            <Row k="Whisper audio minutes" total={fmt(t.wSec / 60)} run={fmt(per(t.wSec / 60, live.length))} clip={fmt(per(t.wSec / 60, liveClips))} />
            {hasCost && <Row k="Estimated cost (env unit prices)" total={`$${fmt(cost, 3)}`} run={`$${fmt(per(cost, live.length), 3)}`} clip={`$${fmt(per(cost, liveClips), 3)}`} />}
          </tbody>
        </table>
        {!hasCost && <p className="text-xs text-muted">Set COST_RENDERIO_JOB, COST_RENDERIO_SEC, COST_GEMINI_IN_PER_1M, COST_GEMINI_OUT_PER_1M or COST_WHISPER_PER_HOUR in Vercel to show estimated dollars.</p>}
      </section>

      <section className="card flex flex-col gap-2 p-5">
        <h2 className="font-semibold">Recent runs</h2>
        <table className="text-xs">
          <thead><tr className="text-left text-muted"><th className="pr-3">When (ET)</th><th className="pr-3">Video</th><th className="pr-3">Scores</th><th className="pr-3">Transcript</th><th className="pr-3">Jobs</th><th>Secs</th></tr></thead>
          <tbody>
            {runs.slice(0, 50).map((r, i) => (
              <tr key={i} className="border-t border-line">
                <td className="pr-3 font-mono">{new Date(r.at).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                <td className="pr-3 font-mono">{r.video}</td>
                <td className="pr-3 font-mono">{(r.clips || []).map(c => (c.scored ? c.score : '–')).join(', ') || 'none'}{r.cached ? ' (cache)' : ''}</td>
                <td className="pr-3">{r.transcript || '–'}</td>
                <td className="pr-3 font-mono">{r.meter?.renderio?.length ?? 0}</td>
                <td className="font-mono">{fmt((r.ms || 0) / 1000, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
