'use client';
import { useEffect, useState } from 'react';
import SimpleHeader from '../../components/SimpleHeader';

const EMPTY = { name: '', channelUrl: '', status: 'pending', terms: '', split: '', notes: '' };
const BADGE = { allowed: 'text-lime border-lime', pending: 'text-yellow-300 border-yellow-300', no: 'text-red-400 border-red-400' };
const LABEL = { allowed: 'Allowed', pending: 'Pending', no: 'Not allowed' };
const inp = 'rounded-input border border-line2 bg-ink px-3 py-2 text-sm text-fg outline-none focus:border-lime';

export default function PermissionsPage() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [signedIn, setSignedIn] = useState(true);
  const [msg, setMsg] = useState('');

  const apply = d => { if (d?.success) { setItems(d.items || []); if ('signedIn' in d) setSignedIn(d.signedIn); } else setMsg(d?.message || 'Something went wrong'); };
  useEffect(() => { fetch('/api/permissions').then(r => r.json()).then(apply).catch(() => setMsg('Could not load')); }, []);

  async function submit(e) {
    e.preventDefault(); setMsg('');
    const r = await fetch('/api/permissions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, id: editId || undefined }) });
    const d = await r.json(); apply(d);
    if (d.success) { setForm(EMPTY); setEditId(null); }
  }
  async function remove(id) {
    if (!confirm('Delete this streamer?')) return;
    apply(await (await fetch('/api/permissions?id=' + encodeURIComponent(id), { method: 'DELETE' })).json());
  }
  const set = k => e => setForm({ ...form, [k]: e.target.value });

  return (
    <main className="min-h-screen bg-ink text-fg">
      <SimpleHeader />
      <section className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-10">
        <span className="eyebrow">Monetize the right way</span>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-white md:text-[44px]">Clipping permissions</h1>
        <p className="text-sm text-soft">Keep track of which streamers let you clip them, their rules, and any revenue split you agreed. Save screenshots of their approval somewhere safe too.</p>
        {!signedIn && <p className="rounded-lg border border-line2 px-3 py-2 text-xs text-muted">You aren't signed in, so this list is saved to this browser only. Sign in from the ⚡ menu to keep it on your account.</p>}
        <form onSubmit={submit} className="card flex flex-col gap-3 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <input required value={form.name} onChange={set('name')} placeholder="Streamer name" className={inp} />
            <input value={form.channelUrl} onChange={set('channelUrl')} placeholder="Channel URL (https://…)" className={inp} />
            <select value={form.status} onChange={set('status')} className={inp}>
              <option value="allowed">Allowed</option><option value="pending">Pending</option><option value="no">Not allowed</option>
            </select>
            <input type="number" min="0" max="100" value={form.split} onChange={set('split')} placeholder="Your revenue split %" className={inp} />
          </div>
          <textarea value={form.terms} onChange={set('terms')} rows={2} placeholder="Their terms (e.g. credit in title, no clips over 60s, use #ad)" className={inp} />
          <textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="Notes (where they gave permission, contact, etc.)" className={inp} />
          <div className="flex gap-2">
            <button type="submit" className="btn-lime h-10 px-5 text-sm">{editId ? 'Save changes' : 'Add streamer'}</button>
            {editId && <button type="button" onClick={() => { setEditId(null); setForm(EMPTY); }} className="btn-ghost h-10 px-4 text-sm">Cancel</button>}
          </div>
          {msg && <p role="status" className="text-xs text-red-400">{msg}</p>}
        </form>
        <div className="flex flex-col gap-3">
          {!items.length && <p className="text-sm text-muted">No streamers yet.</p>}
          {items.map(it => (
            <div key={it.id} className="card flex flex-col gap-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">{it.name}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] ${BADGE[it.status]}`}>{LABEL[it.status]}</span>
                  {it.split != null && <span className="text-xs text-soft">{it.split}% to you</span>}
                </div>
                <div className="flex gap-3 text-xs">
                  <button type="button" onClick={() => { setEditId(it.id); setForm({ ...EMPTY, ...it, split: it.split ?? '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="text-soft hover:text-lime">Edit</button>
                  <button type="button" onClick={() => remove(it.id)} className="text-soft hover:text-red-400">Delete</button>
                </div>
              </div>
              {it.channelUrl && <a href={it.channelUrl} target="_blank" rel="noreferrer" className="text-xs text-lime">{it.channelUrl}</a>}
              {it.terms && <p className="text-xs text-soft"><b>Terms:</b> {it.terms}</p>}
              {it.notes && <p className="text-xs text-muted">{it.notes}</p>}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
