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

  const btn = 'btn-ghost h-9 px-3 text-xs leading-9';
  const S = {
    perm: { title: 'Check you have permission', body: <>Make sure {credit?.author || 'the streamer'} allows clipping, and log their terms and any revenue split.</>,
      action: <a href={permHref} className={btn}>Open Permissions{credit?.author ? ` for ${credit.author}` : ''}</a> },
    transform: { title: 'Make it transformative', body: <>Add captions, a hook overlay, a facecam reaction, or your own commentary. In Your clips, tap <b>Edit</b> on the clip, then use the <b>Transform</b> section.</>,
      action: <a href={back} className={btn}>Go to my clip</a> },
    credit: { title: 'Add credit', body: <>Credit the streamer in your caption and description. {credit ? <span className="text-soft">{creditLine(credit)}</span> : 'We add it automatically for YouTube sources.'}</>,
      action: <label className="flex items-center gap-2 text-xs text-soft"><input type="checkbox" checked={creditOn} onChange={e => { setCreditOn(e.target.checked); setAutoCredit(e.target.checked); }} /> Auto-add credit when posting</label> },
    check: { title: 'Run the pre-upload check', body: <>What does this clip have?
      <span className="mt-2 flex flex-wrap gap-3">{[['captions', 'Captions'], ['hook', 'Hook text or facecam'], ['commentary', 'My commentary']].map(([k, l]) => (
        <label key={k} className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={check[k]} onChange={e => setCheck({ ...check, [k]: e.target.checked })} />{l}</label>))}</span>
      <span className={`mt-2 block text-xs ${risky ? 'text-yellow-300' : 'text-lime'}`}>{risky ? 'High reused-content risk: this is mostly unedited footage. YouTube may not monetize it and Content ID may claim it.' : 'Looks transformative. Keep adding your own value.'} <a href={REUSE_URL} target="_blank" rel="noreferrer" className="text-lime">Reused content policy →</a></span></> },
  };
  const PRO = [
    { id: 'p_join', title: 'Join a clipping campaign', body: <>Big clipping channels get paid by campaigns: streamers, creators or brands pay clippers per view. Pick an official campaign or a streamer&apos;s own clip program.</>, action: <a href="/programs" className={btn}>Browse clipping programs</a> },
    { id: 'p_rules', title: 'Read the campaign rules', body: <>Each campaign sets which streamer to clip, required tags or links, allowed platforms, minimum length and the deadline. Log the terms so you don&apos;t forget them.</>, action: <a href={permHref} className={btn}>Log campaign terms</a> },
    { id: 'p_pick', title: 'Clip the moments the campaign wants', body: <>Paste the streamer&apos;s latest videos into Clip a channel and keep the clips with the highest viral scores.</>, action: <a href="/channel" className={btn}>Open Clip a channel</a> },
    { id: 'transform', ...S.transform },
    { id: 'credit', ...S.credit, title: 'Add the required tags and credit' },
    { id: 'p_post', title: 'Post everywhere', body: <>Post the same clip to TikTok, Reels and Shorts. Campaigns usually count views from every platform, so more platforms means more paid views.</>, action: <a href={back} className={btn}>Go post</a> },
    { id: 'p_submit', title: 'Submit links and get paid', body: <>Track each clip&apos;s views and submit the post links in the campaign dashboard before the deadline. The campaign pays out at its own rate.</>, action: <a href="/programs" className={btn}>Back to programs</a> },
  ];
  const CREATOR = [
    { id: 'perm', ...S.perm },
    { id: 'transform', ...S.transform, body: <>On your own channel, YouTube only pays for content that adds your own value. Lean on commentary: tap <b>Edit</b>, then <b>Transform</b>, and use the AI commentary script to record your take.</> },
    { id: 'credit', ...S.credit },
    { id: 'check', ...S.check },
    { id: 'c_post', title: 'Post on your own channel consistently', body: <>Use the <b>Shorts</b> button (it uploads as private for review). Post on a steady schedule and use <b>Post at best time</b>.</>, action: <a href={back} className={btn}>Go post</a> },
    { id: 'c_ypp', title: 'Reach the Partner Program and apply', body: <>YouTube&apos;s official page lists the ad-revenue thresholds as <b>1,000 subscribers</b> plus either <b>4,000 qualified watch hours in the last 12 months</b> or <b>10 million qualified Shorts views in the last 90 days</b>. Then apply in YouTube Studio.</>, action: <a href={YPP_URL} target="_blank" rel="noreferrer" className={btn}>Check the current requirements</a> },
  ];
  const steps = path === 'creator' ? CREATOR : PRO;
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
      <p className="text-sm text-soft">{path === 'creator' ? 'Grow your own channel and earn YouTube ad revenue.' : 'Earn the way big clipping channels do: get paid per view by clipping campaigns.'}</p>
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
      <p className="mx-auto max-w-3xl px-5 pt-4 text-sm text-soft">New to this? See the full path from <a href="/tutorial#earn" className="font-semibold text-lime">choosing a campaign to getting paid →</a></p>
      <Suspense fallback={null}><Guide /></Suspense>
    </main>
  );
}
