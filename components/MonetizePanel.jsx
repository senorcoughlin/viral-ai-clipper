'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

// Monetization Studio, phase 1: goal onboarding, one next step per clip,
// a campaign card with a rules checklist and submission tracking, and
// account sync of the whole project. Earnings are always split into an
// "estimate" the user types and "actual" payouts they log. Never a promise.

const GOALS = [
  ['grow', 'Grow my channel'],
  ['campaign', 'Paid clipping campaigns'],
  ['affiliate', 'Affiliate / product links'],
  ['client', 'Client work'],
];
const PLATFORMS = [['youtube', 'YouTube'], ['tiktok', 'TikTok'], ['instagram', 'Instagram'], ['x', 'X']];
const LS = 'vac_monetize_v1';
const EMPTY = { goal: '', platforms: [], campaign: null, submissions: [], dismissed: {}, clipState: {}, rpm: '' };

const tagsOf = (s) => (String(s || '').match(/#[\w]+/g) || []).map(t => t.toLowerCase());
const money = (n) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;

export function campaignIssues(campaign, st) {
  if (!campaign) return [];
  const out = [];
  const have = tagsOf(`${st?.hashtags || ''} ${st?.description || ''}`);
  const missing = tagsOf(campaign.tags).filter(t => !have.includes(t));
  if (missing.length) out.push({ k: 'tags', text: `Add campaign tag${missing.length > 1 ? 's' : ''} ${missing.join(' ')}`, patch: { hashtags: `${st?.hashtags || ''} ${missing.join(' ')}`.trim() } });
  if (campaign.credit && !String(st?.credit || '').toLowerCase().includes(String(campaign.credit).toLowerCase().replace(/^@/, ''))) out.push({ k: 'credit', text: `Credit line must include "${campaign.credit}"`, patch: { creditOn: true, credit: `Clip from ${campaign.credit}` } });
  if (campaign.deadline && new Date(campaign.deadline + 'T23:59:59') < new Date()) out.push({ k: 'deadline', text: 'Campaign deadline has passed' });
  return out;
}

function nextStep(clip, st, campaign, goal, dismissed) {
  if (dismissed) return null;
  const issues = campaignIssues(campaign, st);
  if (issues[0]?.patch) return { ...issues[0], action: 'accept' };
  if (!st?.reviewed) return { k: 'review', text: 'Review the captions (fix any wrong words) and the hook', action: 'adjust' };
  if (!st?.published) return { k: 'publish', text: goal === 'campaign' ? 'Publish it, then paste the post link into the campaign card' : 'Publish it: YouTube direct upload, or TikTok/Reels with caption copied', action: 'publish' };
  if (campaign && !st?.submitted) return { k: 'submit', text: 'Submit the post link to the campaign', action: 'submit' };
  return { k: 'done', text: 'All set for this clip', done: true };
}

export default function MonetizePanel({ clips = [], onRestoreClips }) {
  const [p, setP] = useState(EMPTY);
  const [signedIn, setSignedIn] = useState(false);
  const [sync, setSync] = useState('');
  const [editCampaign, setEditCampaign] = useState(false);
  const [draft, setDraft] = useState({ name: '', deadline: '', tags: '', credit: '', allowed: '', link: '' });
  const [sub, setSub] = useState({ url: '', views: '', paid: '' });
  const [collapsed, setCollapsed] = useState(false);
  const loaded = useRef(false);
  const saveT = useRef(null);
  const clipsRef = useRef(clips);
  clipsRef.current = clips;

  // Load local first, then the account copy (newer wins).
  useEffect(() => {
    let local = null;
    try { local = JSON.parse(localStorage.getItem(LS) || 'null'); } catch {}
    if (local) setP({ ...EMPTY, ...local });
    fetch('/api/projects', { cache: 'no-store' }).then(r => r.json()).then(d => {
      setSignedIn(!!d.signedIn);
      const remote = d.project;
      if (remote && (!local || (remote.updatedAt || 0) > (local.updatedAt || 0))) {
        setP({ ...EMPTY, ...remote });
        if (Array.isArray(remote.clips) && remote.clips.length && !clipsRef.current.length) onRestoreClips?.(remote.clips);
        setSync('Synced from your account');
      }
    }).catch(() => {}).finally(() => { loaded.current = true; });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (next) => {
    const v = { ...next, updatedAt: Date.now() };
    setP(v);
    try { localStorage.setItem(LS, JSON.stringify(v)); } catch {}
    if (!signedIn) return;
    clearTimeout(saveT.current);
    saveT.current = setTimeout(() => {
      const body = JSON.stringify({ ...v, clips: clipsRef.current.slice(0, 24).map(c => ({ id: c.id, title: c.title, videoUrl: c.videoUrl, source: c.source, startSec: c.startSec, endSec: c.endSec, duration: c.duration, format: c.format, hashtags: c.hashtags, socialCaption: c.socialCaption, caption: c.caption, hook: c.hook, hooks: c.hooks, viralScore: c.viralScore, score: c.score, scored: c.scored, reason: c.reason, reasons: c.reasons, words: Array.isArray(c.words) ? c.words.slice(0, 2500) : undefined, subtitlesEnabled: c.subtitlesEnabled })) });
      fetch('/api/projects', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body })
        .then(r => r.json()).then(d => setSync(d.success ? 'Saved to your account' : (d.message || 'Not synced'))).catch(() => setSync('Not synced (offline)'));
    }, 1200);
  };
  const latest = useRef(p); latest.current = p;
  const patch = (x) => save({ ...latest.current, ...x });

  // Clip edits and publish results reported by each StudioClip.
  useEffect(() => {
    const on = (e) => {
      const { id, ...rest } = e.detail || {};
      if (!id) return;
      const cur = latest.current;
      patch({ clipState: { ...cur.clipState, [id]: { ...(cur.clipState[id] || {}), ...rest } } });
    };
    window.addEventListener('vac:clip-state', on);
    return () => window.removeEventListener('vac:clip-state', on);
  }, [signedIn]); // eslint-disable-line react-hooks/exhaustive-deps
  // Save the clip list when a new run finishes.
  useEffect(() => { if (loaded.current && clips.length) patch({}); }, [clips.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const steps = useMemo(() => clips.map(c => ({ clip: c, step: nextStep(c, p.clipState[c.id], p.campaign, p.goal, p.dismissed[c.id]) })).filter(x => x.step), [clips, p]);

  const apply = (clip, step) => {
    if (step.patch) window.dispatchEvent(new CustomEvent('vac:clip-apply', { detail: { id: clip.id, patch: step.patch } }));
    else if (step.action === 'adjust' || step.action === 'publish') window.dispatchEvent(new CustomEvent('vac:clip-open', { detail: { id: clip.id, panel: step.action === 'publish' ? 'publish' : 'edit' } }));
    else if (step.action === 'submit') { setCollapsed(false); document.getElementById('campaign-card')?.scrollIntoView({ behavior: 'smooth' }); setSub(s => ({ ...s, url: p.clipState[clip.id]?.postUrl || '' })); }
    if (step.action === 'adjust') patch({ clipState: { ...p.clipState, [clip.id]: { ...(p.clipState[clip.id] || {}), reviewed: true } } });
  };

  const est = p.submissions.reduce((a, s) => a + (Number(s.views) || 0), 0) / 1000 * (Number(p.rpm) || 0);
  const actual = p.submissions.reduce((a, s) => a + (Number(s.paid) || 0), 0);
  const chip = (on) => `chip shrink-0 ${on ? 'chip-on' : ''}`;
  const input = 'w-full rounded-input border border-line2 bg-ink px-3 py-2 text-sm text-fg outline-none focus:border-lime';

  if (!p.goal) {
    return (
      <section className="card flex flex-col gap-3 p-4" data-monetize-onboarding>
        <span className="eyebrow">Monetization Studio</span>
        <h2 className="font-display text-xl font-extrabold text-white">What are you clipping for?</h2>
        <div className="flex flex-wrap gap-2">{GOALS.map(([k, l]) => <button key={k} type="button" onClick={() => patch({ goal: k })} className={chip(false)}>{l}</button>)}</div>
        <p className="text-xs text-muted">We use this to suggest one next step per clip. You can change it any time.</p>
      </section>
    );
  }

  return (
    <section className="card flex flex-col gap-4 p-4" data-monetize>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="eyebrow">Your next step</span>
          <span className="text-xs text-muted">Goal: {GOALS.find(g => g[0] === p.goal)?.[1]} · <button type="button" className="text-lime" onClick={() => patch({ goal: '' })}>change</button>{sync && <> · {sync}</>}{!signedIn && <> · sign in (Account) to sync across devices</>}</span>
        </div>
        <button type="button" onClick={() => setCollapsed(v => !v)} className="btn-ghost h-8 px-3 text-xs">{collapsed ? 'Show' : 'Hide'}</button>
      </div>
      {!collapsed && <>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Platforms</span>
          {PLATFORMS.map(([k, l]) => <button key={k} type="button" aria-pressed={p.platforms.includes(k)} onClick={() => patch({ platforms: p.platforms.includes(k) ? p.platforms.filter(x => x !== k) : [...p.platforms, k] })} className={chip(p.platforms.includes(k))}>{l}</button>)}
        </div>
        {clips.length === 0 ? <p className="text-sm text-soft">Generate clips and each one gets a concrete next step here.</p> : (
          <ul className="flex flex-col gap-2">
            {steps.map(({ clip, step }) => (
              <li key={clip.id} className="flex flex-col gap-2 rounded-input border border-line2 p-3 sm:flex-row sm:items-center sm:justify-between" data-next-step={step.k}>
                <div className="min-w-0">
                  <p className="truncate text-xs text-muted">{clip.title || 'Clip'}</p>
                  <p className={`text-sm ${step.done ? 'text-lime' : 'text-white'}`}>{step.done ? '✓ ' : ''}{step.text}</p>
                </div>
                {!step.done && (
                  <div className="flex shrink-0 gap-1.5">
                    {step.k !== 'deadline' && <button type="button" onClick={() => apply(clip, step)} className="btn-lime h-8 px-3 text-xs">{step.patch ? 'Accept' : step.action === 'publish' ? 'Publish' : step.action === 'submit' ? 'Log it' : 'Review'}</button>}
                    <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('vac:clip-open', { detail: { id: clip.id, panel: 'edit' } }))} className="btn-ghost h-8 px-3 text-xs">Adjust</button>
                    <button type="button" onClick={() => patch({ dismissed: { ...p.dismissed, [clip.id]: true } })} className="btn-ghost h-8 px-3 text-xs">Dismiss</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <div id="campaign-card" className="flex flex-col gap-3 rounded-input border border-line2 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-white">{p.campaign?.name || 'Campaign'}</span>
            <button type="button" onClick={() => { setDraft({ name: '', deadline: '', tags: '', credit: '', allowed: '', link: '', ...(p.campaign || {}) }); setEditCampaign(v => !v); }} className="btn-ghost h-8 px-3 text-xs">{p.campaign ? 'Edit rules' : 'Add campaign rules'}</button>
          </div>
          {editCampaign && (
            <div className="grid gap-2 sm:grid-cols-2">
              <input className={input} placeholder="Campaign name" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
              <label className="flex items-center gap-2 text-xs text-muted">Deadline<input type="date" className={input} value={draft.deadline} onChange={e => setDraft({ ...draft, deadline: e.target.value })} /></label>
              <input className={input} placeholder="Required tags, e.g. #ad #brandname" value={draft.tags} onChange={e => setDraft({ ...draft, tags: e.target.value })} />
              <input className={input} placeholder="Required credit, e.g. @creator" value={draft.credit} onChange={e => setDraft({ ...draft, credit: e.target.value })} />
              <textarea className={`${input} sm:col-span-2`} rows={2} placeholder="Allowed content / rules (paste from the campaign page)" value={draft.allowed} onChange={e => setDraft({ ...draft, allowed: e.target.value })} />
              <input className={`${input} sm:col-span-2`} placeholder="Submission link (where you submit posts)" value={draft.link} onChange={e => setDraft({ ...draft, link: e.target.value })} />
              <div className="flex gap-2 sm:col-span-2">
                <button type="button" onClick={() => { patch({ campaign: { ...draft, link: /^https?:\/\//.test(draft.link) ? draft.link : '' } }); setEditCampaign(false); }} className="btn-lime h-9 px-4 text-xs">Save rules</button>
                {p.campaign && <button type="button" onClick={() => { patch({ campaign: null }); setEditCampaign(false); }} className="btn-ghost h-9 px-4 text-xs">Remove campaign</button>}
              </div>
            </div>
          )}
          {p.campaign && !editCampaign && (
            <div className="flex flex-col gap-1 text-xs text-soft">
              {p.campaign.deadline && <span>Deadline: {p.campaign.deadline}</span>}
              {p.campaign.tags && <span>Required tags: <span className="text-lime">{p.campaign.tags}</span></span>}
              {p.campaign.credit && <span>Credit: {p.campaign.credit}</span>}
              {p.campaign.allowed && <span className="whitespace-pre-wrap">Rules: {p.campaign.allowed}</span>}
              {p.campaign.link && <a href={p.campaign.link} target="_blank" rel="noreferrer" className="font-semibold text-lime">Open submission page →</a>}
              <span className="mt-1 font-semibold text-white">Checklist</span>
              {clips.length ? clips.map(c => { const iss = campaignIssues(p.campaign, p.clipState[c.id]); return <span key={c.id} className={iss.length ? 'text-[#FFB64D]' : 'text-lime'}>{iss.length ? '✗' : '✓'} {(c.title || 'Clip').slice(0, 40)}{iss.length ? `: ${iss.map(i => i.text).join('; ')}` : ''}</span>; }) : <span>No clips yet.</span>}
            </div>
          )}
          <div className="flex flex-col gap-2 border-t border-line2 pt-2">
            <span className="text-xs font-semibold text-white">Submitted posts</span>
            {p.submissions.map((s, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 text-xs text-soft">
                <a href={s.url} target="_blank" rel="noreferrer" className="max-w-[220px] truncate text-lime">{s.url}</a>
                <span>{Number(s.views) || 0} views</span>
                <span>{s.paid ? `paid ${money(Number(s.paid))}` : 'not paid yet'}</span>
                <button type="button" className="text-muted" onClick={() => patch({ submissions: p.submissions.filter((_, j) => j !== i) })}>remove</button>
              </div>
            ))}
            <div className="grid grid-cols-[1fr_80px_80px_auto] gap-1.5">
              <input className={input} placeholder="Post link" value={sub.url} onChange={e => setSub({ ...sub, url: e.target.value })} />
              <input className={input} inputMode="numeric" placeholder="Views" value={sub.views} onChange={e => setSub({ ...sub, views: e.target.value.replace(/[^\d]/g, '') })} />
              <input className={input} inputMode="decimal" placeholder="$ paid" value={sub.paid} onChange={e => setSub({ ...sub, paid: e.target.value.replace(/[^\d.]/g, '') })} />
              <button type="button" disabled={!/^https?:\/\//.test(sub.url)} onClick={() => { patch({ submissions: [...p.submissions, { ...sub, at: Date.now() }] }); setSub({ url: '', views: '', paid: '' }); }} className="btn-lime h-9 px-3 text-xs disabled:opacity-50">Add</button>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <label className="flex items-center gap-1.5 text-muted">Campaign rate $<input className="w-16 rounded-input border border-line2 bg-ink px-2 py-1 text-fg" inputMode="decimal" value={p.rpm} onChange={e => patch({ rpm: e.target.value.replace(/[^\d.]/g, '') })} /> per 1k views</label>
              <span className="text-soft">Estimated: <b className="text-white">{money(est)}</b> <span className="text-muted">(your rate × logged views, not a promise)</span></span>
              <span className="text-soft">Actually paid: <b className="text-lime">{money(actual)}</b></span>
            </div>
          </div>
        </div>
        <p className="text-[11px] leading-snug text-muted">Publishing: YouTube uploads directly (Google review pending, so you may see an "unverified app" screen). TikTok and Instagram: we download the clip and open the app with your caption copied. Direct TikTok/Instagram posting needs their approvals and is planned.</p>
      </>}
    </section>
  );
}
