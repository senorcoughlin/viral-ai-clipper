'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import SimpleHeader from '../../components/SimpleHeader';
import { useCredit, creditLine, autoCreditOn, setAutoCredit, REUSE_URL } from '../../components/PostCheck';

const YPP_URL = 'https://support.google.com/youtube/answer/72851';
const load = k => { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch { return {}; } };

function Guide() {
  const q = useSearchParams();
  const clipId = q.get('clip') || 'general';
  const source = q.get('src') || '';
  const title = q.get('title') || '';
  const credit = useCredit(source);
  const key = 'viral_monetize_' + clipId;
  const [done, setDone] = useState({});
  const [path, setPath] = useState('pro');
  const [creditOn, setCreditOn] = useState(true);
  const [check, setCheck] = useState({ captions: false, hook: false, commentary: false });
  useEffect(() => { const d = load(key); setDone(d.done || {}); if (d.path) setPath(d.path); setCreditOn(autoCreditOn()); }, [key]);
  const save = (nd, np = path) => { setDone(nd); setPath(np); try { localStorage.setItem(key, JSON.stringify({ done: nd, path: np })); } catch {} };
  const toggle = s => save({ ...done, [s]: !done[s] });
  const back = '/#clips';
  const permHref = `/permissions?${new URLSearchParams({ name: credit?.author || '', url: credit?.authorUrl || '' })}`;
  const risky = !check.captions && !check.hook && !check.commentary;

  const steps = [
    { id: 'perm', title: 'Check you have permission', body: <>Make sure {credit?.author || 'the streamer'} allows clipping, and log their terms and any revenue split.</>,
      action: <a href={permHref} className="btn-ghost h-9 px-3 text-xs leading-9">Open Permissions{credit?.author ? ` for ${credit.author}` : ''}</a> },
    { id: 'transform', title: 'Make it transformative', body: <>Add captions, a hook overlay, a facecam reaction, or your own commentary. In Your clips, tap <b>Edit</b> on the clip, then use the <b>Transform</b> section (hook text, facecam upload, AI commentary script).</>,
      action: <a href={back} className="btn-ghost h-9 px-3 text-xs leading-9">Go to my clip</a> },
    { id: 'credit', title: 'Add credit', body: <>Credit the streamer in your caption and description. {credit ? <span className="text-soft">{creditLine(credit)}</span> : 'We add it automatically for YouTube sources.'}</>,
      action: <label className="flex items-center gap-2 text-xs text-soft"><input type="checkbox" checked={creditOn} onChange={e => { setCreditOn(e.target.checked); setAutoCredit(e.target.checked); }} /> Auto-add credit when posting</label> },
    { id: 'check', title: 'Run the pre-upload check', body: <>What does this clip have?
      <span className="mt-2 flex flex-wrap gap-3">{[['captions', 'Captions'], ['hook', 'Hook text or facecam'], ['commentary', 'My commentary']].map(([k, l]) => (
        <label key={k} className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={check[k]} onChange={e => setCheck({ ...check, [k]: e.target.checked })} />{l}</label>))}</span>
      <span className={`mt-2 block text-xs ${risky ? 'text-yellow-300' : 'text-lime'}`}>{risky ? 'High reused-content risk: this is mostly unedited footage. YouTube may not monetize it and Content ID may claim it.' : 'Looks transformative. Keep adding your own value.'} <a href={REUSE_URL} target="_blank" rel="noreferrer" className="text-lime">Reused content policy →</a></span></> },
    { id: 'post', title: 'Post it', body: <>Use the <b>Shorts</b>, <b>TikTok</b>, <b>Reels</b> or <b>X</b> buttons on the clip. Shorts runs the pre-upload check again and uploads as private for you to review.</>,
      action: <a href={back} className="btn-ghost h-9 px-3 text-xs leading-9">Go post</a> },
    { id: 'paid', title: 'Get paid', body: path === 'creator'
      ? <>Grow your own channel into the YouTube Partner Program. YouTube&apos;s official page lists the ad-revenue thresholds as <b>1,000 subscribers</b> plus either <b>4,000 qualified watch hours in the last 12 months</b> or <b>10 million qualified Shorts views in the last 90 days</b>. Your channel also has to follow YouTube&apos;s monetization policies, including the reused content rules. <a href={YPP_URL} target="_blank" rel="noreferrer" className="text-lime">Check the current requirements →</a></>
      : <>This is how big clipping channels earn. Join an official clipping campaign or a streamer&apos;s own clip program, follow its rules, and post across TikTok, Reels and Shorts. Campaigns usually pay per view at their own rates. Track each clip&apos;s views and submit your links to the campaign before its deadline.</>,
      action: path === 'creator' ? <a href={YPP_URL} target="_blank" rel="noreferrer" className="btn-ghost h-9 px-3 text-xs leading-9">YouTube Partner Program</a> : <a href="/programs" className="btn-ghost h-9 px-3 text-xs leading-9">Browse clipping programs</a> },
  ];
  const count = steps.filter(s => done[s.id]).length;

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-10">
      <span className="eyebrow">Step by step</span>
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-white md:text-[44px]">Monetize this clip</h1>
      {title && <p className="text-sm text-soft">Clip: <span className="text-white">{title}</span></p>}
      <div className="flex gap-2">
        {[['pro', 'Pro clipper path'], ['creator', 'Creator path']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => save(done, k)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${path === k ? 'border-lime text-lime' : 'border-line2 text-soft'}`}>{l}</button>))}
      </div>
      <p className="text-xs text-muted">{count} of {steps.length} steps done. Progress is saved on this device.</p>
      <ol className="flex flex-col gap-3">
        {steps.map((s, i) => (
          <li key={s.id} className={`card flex gap-3 p-4 ${done[s.id] ? 'border-lime/60' : ''}`}>
            <button type="button" aria-label={done[s.id] ? 'Mark not done' : 'Mark done'} onClick={() => toggle(s.id)}
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-sm font-bold ${done[s.id] ? 'border-lime bg-lime text-ink' : 'border-line2 text-muted'}`}>{done[s.id] ? '✓' : i + 1}</button>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <span className="font-semibold text-white">{s.title}</span>
              <div className="text-sm text-soft">{s.body}</div>
              {s.action && <div className="flex flex-wrap gap-2">{s.action}</div>}
            </div>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted">We don&apos;t promise any earnings. Payouts are set by YouTube or each program.</p>
    </section>
  );
}

export default function MonetizePage() {
  return (
    <main className="min-h-screen bg-ink text-fg">
      <SimpleHeader />
      <Suspense fallback={null}><Guide /></Suspense>
    </main>
  );
}
