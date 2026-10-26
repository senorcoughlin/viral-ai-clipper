'use client';
import { useEffect, useState, useCallback } from 'react';

const api = async (path, opts = {}) => {
  const r = await fetch(path, { cache: 'no-store', ...opts, headers: { 'Content-Type': 'application/json', 'x-admin-csrf': '1', ...(opts.headers || {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || `Error ${r.status}`), { status: r.status });
  return d;
};
const when = (t) => (t ? new Date(t).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET' : '–');
const card = 'rounded-xl border border-zinc-800 bg-zinc-950 p-4';
const input = 'w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white placeholder-zinc-500';
const btn = 'rounded-lg bg-lime-400 px-4 py-2 font-semibold text-black disabled:opacity-50';
const btn2 = 'rounded-lg border border-zinc-600 px-3 py-1.5 text-sm text-white';

function Login({ onIn }) {
  const [u, setU] = useState(''); const [p, setP] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ username: u, password: p }) }); setP(''); onIn(); }
    catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={go} className={`${card} mx-auto mt-16 max-w-sm space-y-3`}>
      <h1 className="text-xl font-bold text-white">Admin sign-in</h1>
      <p className="text-sm text-zinc-400">Staff only. This is separate from customer accounts.</p>
      <input className={input} placeholder="Username" autoComplete="username" value={u} onChange={e => setU(e.target.value)} />
      <input className={input} placeholder="Password" type="password" autoComplete="current-password" value={p} onChange={e => setP(e.target.value)} />
      {err && <p className="text-sm text-red-400" role="alert">{err}</p>}
      <button className={`${btn} w-full`} disabled={busy || !u || !p}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );
}

function useView(view, q) {
  const [d, setD] = useState(null); const [err, setErr] = useState('');
  const load = useCallback(() => { setErr(''); api(`/api/admin/data?view=${view}${q ? `&q=${encodeURIComponent(q)}` : ''}`).then(setD).catch(e => setErr(e.message)); }, [view, q]);
  useEffect(() => { load(); }, [load]);
  return [d, err, load];
}

function Act({ label, run, children }) {
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  return (
    <div className={`${card} space-y-2`}>
      <h3 className="font-semibold text-white">{label}</h3>
      {children}
      <div className="flex items-center gap-3">
        <button className={btn} disabled={busy} onClick={async () => { setBusy(true); setMsg(''); try { const r = await run(); setMsg('Done ' + (r?.result ? JSON.stringify(r.result) : '')); } catch (e) { setMsg(e.message); } finally { setBusy(false); } }}>Apply</button>
        {msg && <span className="text-sm text-zinc-300">{msg}</span>}
      </div>
    </div>
  );
}
const act = (body) => api('/api/admin/action', { method: 'POST', body: JSON.stringify(body) });

function Users() {
  const [q, setQ] = useState(''); const [d, err, load] = useView('users', q);
  const [email, setEmail] = useState(''); const [amt, setAmt] = useState('10');
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Act label="Grant credits" run={async () => { const r = await act({ action: 'grant_credits', email, amount: Number(amt) }); load(); return r; }}>
          <input className={input} placeholder="user@email.com" value={email} onChange={e => setEmail(e.target.value)} />
          <input className={input} type="number" min="1" max="1000" value={amt} onChange={e => setAmt(e.target.value)} />
        </Act>
        <div className={`${card} space-y-2`}>
          <h3 className="font-semibold text-white">Pro access</h3>
          <input className={input} placeholder="user@email.com" value={email} onChange={e => setEmail(e.target.value)} />
          <div className="flex gap-2">
            <button className={btn} onClick={() => act({ action: 'set_pro', email, on: true }).then(load).catch(e => alert(e.message))}>Grant Pro</button>
            <button className={btn2} onClick={() => act({ action: 'set_pro', email, on: false }).then(load).catch(e => alert(e.message))}>Remove Pro</button>
          </div>
          <p className="text-xs text-zinc-500">Applies when the person signs in with this email.</p>
        </div>
      </div>
      <div className={card}>
        <div className="mb-3 flex gap-2"><input className={input} placeholder="Search email" value={q} onChange={e => setQ(e.target.value)} /><button className={btn2} onClick={load}>Refresh</button></div>
        {err && <p className="text-red-400">{err}</p>}
        {d && <p className="mb-2 text-sm text-zinc-400">{d.total} accounts with billing records · {d.pro} Pro</p>}
        <div className="overflow-x-auto"><table className="w-full text-left text-sm text-zinc-200">
          <thead className="text-zinc-500"><tr><th className="py-1 pr-3">Email</th><th className="pr-3">Pro</th><th className="pr-3">Credits</th><th className="pr-3">Stripe</th><th>Updated</th></tr></thead>
          <tbody>{d?.users?.map(u => <tr key={u.email} className="border-t border-zinc-800"><td className="py-1 pr-3"><button className="underline" onClick={() => setEmail(u.email)}>{u.email}</button></td><td className="pr-3">{u.pro ? 'Yes' : '–'}</td><td className="pr-3">{u.credits}</td><td className="pr-3">{u.stripeCustomer ? 'linked' : '–'}</td><td>{when(u.updated)}</td></tr>)}</tbody>
        </table></div>
      </div>
    </div>
  );
}

function Stats() {
  const [d, err, load] = useView('stats'); const [id, setId] = useState('');
  return (
    <div className="space-y-4">
      {err && <p className="text-red-400">{err}</p>}
      {d && <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[['Runs (24h)', d.runs24h], ['Clips (24h)', d.clips24h], ['Failed (24h)', d.failed24h], ['Avg run (24h)', d.avgSec24h != null ? d.avgSec24h + 's' : '–'], ['Runs (7d)', d.runs7d], ['Clips (7d)', d.clips7d], ['Failed (7d)', d.failed7d], ['RenderIO this cycle', `${d.renderio.used ?? '–'} / ${d.renderio.cap}`]].map(([k, v]) => <div key={k} className={card}><div className="text-xs text-zinc-500">{k}</div><div className="text-2xl font-bold text-white">{v}</div></div>)}
      </div>}
      <Act label="Reset a daily limit" run={async () => { const r = await act({ action: 'reset_limit', id }); load(); return r; }}>
        <input className={input} placeholder="IP / id from the table below" value={id} onChange={e => setId(e.target.value)} />
      </Act>
      {d && <div className={card}>
        <h3 className="mb-2 font-semibold text-white">Today's usage ({d.limits.today}) · free {d.limits.freePerDay}/day · Pro {d.limits.proPerDay}/day</h3>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm text-zinc-200"><thead className="text-zinc-500"><tr><th className="pr-3">Id</th><th className="pr-3">Tier</th><th>Used</th></tr></thead>
          <tbody>{d.limits.usage.map(l => <tr key={l.tier + l.id} className="border-t border-zinc-800"><td className="py-1 pr-3"><button className="underline" onClick={() => setId(l.id)}>{l.id}</button></td><td className="pr-3">{l.tier}</td><td>{l.used}</td></tr>)}</tbody></table></div>
      </div>}
    </div>
  );
}

function Errors() {
  const [d, err, load] = useView('errors');
  return (
    <div className="space-y-4">
      <button className={btn2} onClick={load}>Refresh</button>
      {err && <p className="text-red-400">{err}</p>}
      <div className={card}><h3 className="mb-2 font-semibold text-white">Recent errors</h3>
        {d?.errors?.length ? d.errors.map(e => <div key={e.route} className="border-t border-zinc-800 py-2 text-sm"><div className="text-white">{e.route} <span className="text-zinc-500">· {when(e.at)} · {e.todayUtc} today</span></div><div className="break-words text-zinc-400">{e.msg}</div></div>) : <p className="text-sm text-zinc-500">None recorded.</p>}
      </div>
      <div className={card}><h3 className="mb-2 font-semibold text-white">Recent runs</h3>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm text-zinc-200"><thead className="text-zinc-500"><tr><th className="pr-3">When</th><th className="pr-3">Video</th><th className="pr-3">Clips</th><th className="pr-3">Failed</th><th className="pr-3">Time</th><th>Tier</th></tr></thead>
          <tbody>{d?.runs?.map((r, i) => <tr key={i} className="border-t border-zinc-800"><td className="py-1 pr-3 whitespace-nowrap">{when(r.at)}</td><td className="max-w-[16rem] truncate pr-3">{r.video}</td><td className="pr-3">{r.made}/{r.requested}</td><td className="pr-3">{r.failed}</td><td className="pr-3">{r.sec}s</td><td>{r.tier}{r.cached ? ' (cached)' : ''}</td></tr>)}</tbody></table></div>
      </div>
      <div className={card}><h3 className="mb-2 font-semibold text-white">Jobs (last 6h)</h3>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm text-zinc-200"><thead className="text-zinc-500"><tr><th className="pr-3">Started</th><th className="pr-3">Job</th><th className="pr-3">Status</th><th>Tier</th></tr></thead>
          <tbody>{d?.jobs?.map(j => <tr key={j.id} className="border-t border-zinc-800"><td className="py-1 pr-3 whitespace-nowrap">{when(j.startedAt)}</td><td className="pr-3 font-mono text-xs">{j.id.slice(0, 10)}</td><td className="pr-3">{j.done ? 'done' : j.lost ? 'lost' : 'running'}{j.continued ? ' (handed off)' : ''}{j.error ? ` · ${j.error}` : ''}</td><td>{j.tier}</td></tr>)}</tbody></table></div>
      </div>
    </div>
  );
}

function Site() {
  const [d, err, load] = useView('site'); const [text, setText] = useState(''); const [tone, setTone] = useState('info');
  useEffect(() => { if (d) { setText(d.banner?.text || ''); setTone(d.banner?.tone || 'info'); } }, [d]);
  return (
    <div className="space-y-4">
      {err && <p className="text-red-400">{err}</p>}
      <Act label="Site announcement banner" run={async () => { const r = await act({ action: 'set_banner', text, tone }); load(); return r; }}>
        <textarea className={input} rows={2} maxLength={280} placeholder="Leave empty to hide the banner" value={text} onChange={e => setText(e.target.value)} />
        <select className={input} value={tone} onChange={e => setTone(e.target.value)}><option value="info">Info (dark)</option><option value="promo">Promo (lime)</option><option value="warn">Warning (amber)</option></select>
      </Act>
      <div className={`${card} space-y-3`}><h3 className="font-semibold text-white">Feature flags</h3>
        {d && Object.entries(d.flagInfo).map(([k, desc]) => (
          <label key={k} className="flex items-center justify-between gap-3 text-sm text-zinc-200">
            <span><span className="font-mono text-lime-300">{k}</span><br /><span className="text-zinc-400">{desc}</span></span>
            <input type="checkbox" className="h-5 w-5" checked={!!d.flags[k]} onChange={e => act({ action: 'set_flag', flag: k, on: e.target.checked }).then(load).catch(x => alert(x.message))} />
          </label>
        ))}
      </div>
    </div>
  );
}

function Audit() {
  const [d, err, load] = useView('audit');
  return (
    <div className={card}><div className="mb-2 flex justify-between"><h3 className="font-semibold text-white">Audit log</h3><button className={btn2} onClick={load}>Refresh</button></div>
      {err && <p className="text-red-400">{err}</p>}
      {d?.audit?.map((a, i) => <div key={i} className="border-t border-zinc-800 py-1.5 text-sm text-zinc-300"><span className="text-zinc-500">{when(a.at)}</span> · <span className="text-white">{a.action}</span> · {a.user} · {a.ip} {a.detail && Object.keys(a.detail).length ? <span className="text-zinc-500">{JSON.stringify(a.detail)}</span> : null}</div>)}
    </div>
  );
}

const TABS = { Users, 'Usage & stats': Stats, 'Errors & jobs': Errors, 'Banner & flags': Site, 'Audit log': Audit };
export default function AdminPanel() {
  const [state, setState] = useState('loading'); const [tab, setTab] = useState('Users');
  const check = () => api('/api/admin/login').then(d => setState(d.admin ? 'in' : 'out')).catch(() => setState('out'));
  useEffect(() => { check(); }, []);
  if (state === 'loading') return <main className="min-h-screen bg-black p-10 text-zinc-400">Loading…</main>;
  if (state === 'out') return <main className="min-h-screen bg-black p-4"><Login onIn={() => setState('in')} /></main>;
  const T = TABS[tab];
  return (
    <main className="min-h-screen bg-black p-4 text-white md:p-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Viral AI Clipper admin</h1>
          <button className={btn2} onClick={() => api('/api/admin/login', { method: 'DELETE' }).finally(() => setState('out'))}>Sign out</button></div>
        <nav className="flex flex-wrap gap-2">{Object.keys(TABS).map(k => <button key={k} onClick={() => setTab(k)} className={`rounded-full px-3 py-1.5 text-sm ${tab === k ? 'bg-lime-400 text-black' : 'border border-zinc-700 text-zinc-300'}`}>{k}</button>)}</nav>
        <T />
      </div>
    </main>
  );
}
