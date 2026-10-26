'use client';
import FeedbackNudge from '../components/FeedbackNudge';
import ReferralCard from '../components/ReferralCard';

import { useState, useEffect, useRef, Suspense } from 'react';
import SeeItWork from '../components/SeeItWork';
import { useSearchParams } from 'next/navigation';
import ClipPlayer, { clipFileName, downloadHref } from '../components/ClipPlayer';
import { detectFaceBox, cropFromFace } from '../lib/face';
import ViralScoreMeter from '../components/ViralScoreMeter';
import AccountBar, { syncClips } from '../components/AccountBar';
import BoltMenu from '../components/BoltMenu';
import { parseLinks } from '../lib/links';
import { trackConversion, PLAN_VALUES } from '../lib/conversions';
import EasterEgg from '../components/EasterEgg';
import SpinWheel from '../components/SpinWheel';
import StudioClip from '../components/StudioClip';
import { funnel } from '../lib/funnel';

const SAMPLE_URL = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
const GUIDE_KEY = 'vac_gen_count';
const ACTIVE_JOB_KEY = 'vac_active_job';
const ft = (e, p) => funnel(e, p);

const FREE_DAILY_LIMIT = 3;

const FORMATS = [
  { value: 'shorts_9_16', label: '9:16' },
  { value: 'landscape_16_9', label: '16:9' },
  { value: 'square_1_1', label: '1:1' },
];
const PACKS = [
  { value: '', label: 'Default' },
  { value: 'bold', label: 'Bold captions' },
  { value: 'podcast', label: 'Podcast' },
  { value: 'gameplay', label: 'Gameplay zoom' },
];
const LENGTHS = [
  { value: 15, label: '15s' },
  { value: 30, label: '30s' },
  { value: 45, label: '45s' },
  { value: 60, label: '1m' },
  { value: 180, label: '3m' },
  { value: 300, label: '5m' },
  { value: 600, label: '10m' },
  { value: 900, label: '15m' },
];
const CLIP_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({ value: n, label: String(n) }));
const STREAM_STEPS = [
  { t: 'Pick a streamer and check their rules', d: 'Choose a niche you know (gaming, IRL, podcasts). Check the streamer\u2019s clipping rules first. Many allow fan clips, and some run their own paid clipper programs.', tools: [['Twitch', 'https://www.twitch.tv'], ['Kick', 'https://kick.com'], ['Permission template', '/permissions']] },
  { t: 'Find a paying clip campaign', d: 'Campaign platforms pay per 1,000 approved views on clips of a creator\u2019s content. Rates, platforms and rules vary by campaign, and most require you to be 18+.', tools: [['Content Rewards (Whop)', 'https://whop.com/contentrewards/'], ['Vyro', 'https://vyro.com'], ['Programs list', '/programs']] },
  { t: 'Grab the VOD or video link', d: 'Copy the link to a finished stream (VOD) or video. Twitch, YouTube and Kick replays all have a shareable link.', tools: [['Twitch VODs', 'https://www.twitch.tv'], ['YouTube', 'https://www.youtube.com']] },
  { t: 'Paste it into Viral AI Clipper', d: 'Paste up to 10 links at once. Pick 9:16, and we find the best moments with captions and a hook burned in.', tools: [['Paste a link \u2191', '#urls'], ['Twitch clipping guide', '/how-to-clip-twitch-streams']] },
  { t: 'Post consistently', d: 'Post to TikTok, YouTube Shorts and Instagram Reels. Many clippers aim for 3\u20135 clips a day. Add your own edits or commentary, since platforms may limit reposted content.', tools: [['TikTok', 'https://www.tiktok.com/upload'], ['YouTube Shorts', 'https://studio.youtube.com'], ['Reels', 'https://www.instagram.com']] },
  { t: 'Track views, submit and scale', d: 'Submit approved posts to your campaign for view payouts. As you grow, you may qualify for YouTube Partner Program Shorts revenue or TikTok Creator Rewards (1-min+ original videos). Check each program\u2019s eligibility. Go Pro for 200 generations a day.', tools: [['YouTube Partner Program', 'https://support.google.com/youtube/answer/72851'], ['TikTok Creator Rewards', 'https://www.tiktok.com/creator-academy/en/article/creator-rewards-program'], ['Go Pro', '#pricing']] },
];
const LIVE_MINUTES = [5, 10, 15];
// twitch.tv/<channel> (not a VOD or clip link): eligible for "clip the last X minutes".
const TWITCH_CHANNEL_RE = /^https?:\/\/(?:www\.|m\.)?twitch\.tv\/([a-zA-Z0-9_]{2,25})\/?(?:\?.*)?$/;
const twitchChannelOf = (u) => { const m = String(u || '').trim().match(TWITCH_CHANNEL_RE); return m && !['videos', 'directory', 'downloads', 'settings', 'search', 'p'].includes(m[1].toLowerCase()) ? m[1] : null; };
const PRICE = { monthly: { amount: '$19.99', per: '/mo', plan: 'pro_monthly' }, yearly: { amount: '$199.99', per: '/yr · about $16.67/mo', plan: 'pro_yearly' } };

/* ---------- small icons (inline SVG, no deps) ---------- */
const Bolt = ({ className = '', fill = '#0A0A0F', size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={className}><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" fill={fill} /></svg>
);
const Check = ({ color = '#C6FF3D' }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><path d="m5 12 5 5L20 7" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const Arrow = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const Link = ({ color = '#8A8AA0' }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" stroke={color} strokeWidth="2" strokeLinecap="round" /></svg>
);
const Sparkle = ({ color = '#7C5CFF' }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 3v4m0 10v4M3 12h4m10 0h4M6.3 6.3l2.8 2.8m5.8 5.8 2.8 2.8M6.3 17.7l2.8-2.8m5.8-5.8 2.8-2.8" stroke={color} strokeWidth="2" strokeLinecap="round" /></svg>
);
const Download = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="#FF4D6D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

function HomeInner({ studio = false }) {
  const [videoUrl, setVideoUrl] = useState('');
  const [promoHidden, setPromoHidden] = useState(true);
  useEffect(() => {
    try { setPromoHidden(Date.now() > 1793595540000 || localStorage.getItem('vac_promo_launch50') === '1'); } catch { setPromoHidden(false); }
  }, []);
  const [clipFormat, setClipFormat] = useState('shorts_9_16');
  const [aiStyle, setAiStyle] = useState('clean_viral');
  const [pack, setPack] = useState('');
  const [clipLength, setClipLength] = useState(30);
  const [clipCount, setClipCount] = useState(1);
  const [liveMinutes, setLiveMinutes] = useState(10);
  const [liveInfo, setLiveInfo] = useState(null); // { name, live, archive } for a pasted Twitch channel
  const liveChannel = (() => { const lines = String(videoUrl || '').split(/[\n,]/).map(x => x.trim()).filter(Boolean); return lines.length === 1 ? twitchChannelOf(lines[0]) : null; })();
  useEffect(() => {
    if (!liveChannel) { setLiveInfo(null); return; }
    let off = false;
    const t = setTimeout(() => {
      fetch('/api/stream?url=' + encodeURIComponent('https://www.twitch.tv/' + liveChannel)).then(r => r.json()).then(j => { if (!off) setLiveInfo(j?.data ? { ...j.data, login: liveChannel } : null); }).catch(() => {});
    }, 400);
    return () => { off = true; clearTimeout(t); };
  }, [liveChannel]);
  const [autoSubtitles, setAutoSubtitles] = useState(true);
  const [aiHook, setAiHook] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStep, setProgressStep] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [stage, setStage] = useState(0);
  const [clips, setClips] = useState([]);
  const [history, setHistory] = useState([]);
  const [showPricing, setShowPricing] = useState(false);
  const [dailyCount, setDailyCount] = useState(0);
  const [credits, setCredits] = useState(0);
  const [isPro, setIsPro] = useState(false); // later from auth/subscription
  const [billing, setBilling] = useState('yearly');
  const [justFinished, setJustFinished] = useState(false);
  const [error, setError] = useState(null); // { message, retry }
  const [notice, setNotice] = useState('');
  const [expected, setExpected] = useState(0);
  const [billingEmail, setBillingEmail] = useState('');
  const [uploading, setUploading] = useState(0);
  const [srcSecs, setSrcSecs] = useState({ url: "", secs: 0 }); // length of an uploaded file, for the short-source warning

  // Upload straight from the browser to Vercel Blob, then use the blob URL as the source.
  const handleUploadFile = async (file) => {
    setError(null);
    if (file.size > 500 * 1024 * 1024) { setError({ message: 'That file is over 500 MB. Trim it or export at a lower bitrate.' }); return; }
    const secs = await new Promise(res => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => { res(v.duration); URL.revokeObjectURL(v.src); };
      v.onerror = () => res(0);
      v.src = URL.createObjectURL(file);
    });
    if (secs > 120 * 60) { setError({ message: `That video is ${Math.round(secs / 60)} minutes long. The limit is 120 minutes.` }); return; }
    try {
      setUploading(1);
      const { upload } = await import('@vercel/blob/client');
      const blob = await upload(`uploads/${file.name.replace(/[^\w.-]+/g, '_')}`, file, {
        access: 'private',
        handleUploadUrl: '/api/upload',
        onUploadProgress: (p) => setUploading(Math.max(1, Math.round(p.percentage))),
      });
      setVideoUrl(blob.url);
      setSrcSecs({ url: blob.url, secs: secs > 0 ? secs : 0 });
    } catch (e) {
      setError({ message: e?.message || 'Upload failed. Try again.' });
    } finally {
      setUploading(0);
    }
  };
  const formRef = useRef(null);

  const searchParams = useSearchParams();
  useEffect(() => {
    const b = searchParams.get('billing');
    if (b === 'monthly' || b === 'yearly') setBilling(b);
    const preset = searchParams.get('url');
    if (preset) setVideoUrl(preset);
    const saved = localStorage.getItem('viral_clipper_history');
    if (saved) try { setHistory(JSON.parse(saved)); } catch {}

    const today = new Date().toDateString();
    const stored = localStorage.getItem('viral_daily');
    if (stored) {
      const data = JSON.parse(stored);
      if (data.date === today) setDailyCount(data.count || 0);
      else localStorage.setItem('viral_daily', JSON.stringify({ date: today, count: 0 }));
    }

    refreshBilling();
  }, []);

  useEffect(() => {
    if (history.length) {
      localStorage.setItem('viral_clipper_history', JSON.stringify(history));
      const flat = history.flatMap(h => (h.clips || []).map(c => ({ ...c, sourceUrl: h.url, createdAt: h.id })));
      syncClips(flat).catch(() => {});
    }
  }, [history]);

  // Progress UI follows the real status events streamed by /api/generate.
  useEffect(() => {
    setStage(Math.min(progressStep, 3));
    setStatusMessage(progressLabel);
  }, [progressStep, progressLabel]);

  useEffect(() => {
    if (!justFinished) return;
    const id = setTimeout(() => setJustFinished(false), 4000);
    return () => clearTimeout(id);
  }, [justFinished]);

  // Pro and credits come only from the server, keyed by the signed session cookie.
  const refreshBilling = () => fetch('/api/billing', { cache: 'no-store' }).then(r => r.json()).then(d => {
    if (!d?.success) return;
    setIsPro(!!d.pro);
    setCredits(Number(d.credits) || 0);
    setBillingEmail(d.signedIn && d.verified ? d.email : '');
    ['viral_pro', 'viral_credits', 'viral_pro_email'].forEach(k => localStorage.removeItem(k));
  }).catch(() => {});

  const incrementDaily = () => {
    const today = new Date().toDateString();
    const next = dailyCount + 1;
    setDailyCount(next);
    localStorage.setItem('viral_daily', JSON.stringify({ date: today, count: next }));
  };

  const lastRunRef = useRef(null);
  const [ytFlash, setYtFlash] = useState('');
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const y = q.get('youtube');
    if (!y) return;
    setYtFlash(y === 'connected' ? 'connected' : 'error');
    q.delete('youtube');
    const qs = q.toString();
    window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash);
  }, []);
  const [selectedIds, setSelectedIds] = useState([]);
  const [dlAllBusy, setDlAllBusy] = useState(false);
  const [lastWasExample, setLastWasExample] = useState(false);
  const [genCount, setGenCount] = useState(3);
  const focusedRef = useRef(false);
  useEffect(() => {
    try { setGenCount(parseInt(localStorage.getItem(GUIDE_KEY) || '0', 10) || 0); } catch { setGenCount(0); }
    ft('landing_view', { path: window.location.pathname, ref: document.referrer ? new URL(document.referrer).hostname : 'direct' });
  }, []);
  const bumpGenCount = () => { setGenCount(c => { const n = c + 1; try { localStorage.setItem(GUIDE_KEY, String(n)); } catch {} return n; }); };
  const focusInput = e => {
    e?.preventDefault?.();
    const el = document.getElementById('urls');
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    setTimeout(() => el.focus({ preventScroll: true }), reduce ? 0 : 400);
  };
  const runExample = () => {
    if (isProcessing) return;
    handleClipping(null, { videoUrl: SAMPLE_URL, clipFormat, autoSubtitles, aiHook, aiStyle, clipLength, clipCount, pack, source: 'example' });
  };
  // Shared handler for generate events, whether they arrive on the live stream or
  // are replayed from the server-side job after a reconnect.
  const STEP_MAP = { download: [0, 'Downloading video…'], transcript: [1, 'Analyzing audio…'], scoring: [2, 'Scoring moments…'], cutting: [3, 'Cutting clips…'] };
  const makeJobHandler = (st, multiUrl) => (msg) => {
    if (msg.type === 'start') setProgressStep(msg.cached ? 3 : 0);
    if (msg.type === 'status' && STEP_MAP[msg.step]) {
      setProgressStep(STEP_MAP[msg.step][0]);
      st.setLabel(STEP_MAP[msg.step][1]);
      setProgressLabel(STEP_MAP[msg.step][1]);
    }
    if (msg.type === 'error') {
      if (msg.index === undefined) st.fatal = msg.message || 'Generation failed on the server.';
      else st.failed += 1;
      st.lastReason = msg.message || st.lastReason;
    }
    if (msg.type === 'clip' && msg.clip) {
      if (st.all.some(c => c._jobIndex === msg.index && c._jobUrl === (multiUrl || ''))) return;
      const clip = { ...msg.clip, _jobIndex: msg.index, _jobUrl: multiUrl || '', title: multiUrl ? `[${multiUrl.slice(0, 18)}…] ${msg.clip.title}` : msg.clip.title };
      const at = st.all.findIndex(c => (c.viralScore || 0) < (clip.viralScore || 0));
      st.all = at === -1 ? [...st.all, clip] : [...st.all.slice(0, at), clip, ...st.all.slice(at)];
      setClips([...st.all]);
      if (st.all.length === 1) setTimeout(() => document.getElementById('clips')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
      setProgressStep(3);
      const l = `${st.all.length} of ${msg.total} ready…`;
      st.setLabel(l);
      setProgressLabel(l);
    }
    if (msg.type === 'done') {
      st.gotDone = true;
      setProgressStep(4);
      setProgressLabel('Clips ready');
      if (msg.reason) st.lastReason = msg.reason;
    }
  };
  // Poll the background job until it finishes. Polls right away when the tab comes back.
  const followJob = async (id, from, onMsg) => {
    let next = from;
    let misses = 0;
    while (true) {
      let j = null;
      try {
        const r = await fetch(`/api/generate?job=${encodeURIComponent(id)}&from=${next}`, { cache: 'no-store' });
        j = await r.json();
      } catch { j = null; }
      if (j && j.found) {
        misses = 0;
        for (const m of j.events || []) onMsg(m);
        next = j.next ?? next;
        if (j.done) return;
        if (j.lost) throw new Error('The server lost this run. It was not counted against your limit, so just hit Retry.');
      } else if (j && j.found === false) {
        throw new Error('This run expired on the server. It was not counted, so just hit Retry.');
      } else if (++misses > 60) {
        throw new Error('Could not reach the server. Check your connection and retry.');
      }
      await new Promise(res => {
        const t = setTimeout(done, document.hidden ? 5000 : 2000);
        function done() { clearTimeout(t); document.removeEventListener('visibilitychange', onVis); res(); }
        function onVis() { if (!document.hidden) done(); }
        document.addEventListener('visibilitychange', onVis);
      });
    }
  };
  const saveActiveJob = (j) => { try { localStorage.setItem(ACTIVE_JOB_KEY, JSON.stringify(j)); } catch {} };
  const clearActiveJob = () => { try { localStorage.removeItem(ACTIVE_JOB_KEY); } catch {} };
  // After a reload (or the browser discarding the tab), pick the run back up.
  const resumedRef = useRef(false);
  useEffect(() => {
    if (resumedRef.current) return;
    resumedRef.current = true;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(ACTIVE_JOB_KEY) || 'null'); } catch {}
    if (!saved?.id || Date.now() - (saved.at || 0) > 60 * 60 * 1000) { clearActiveJob(); return; }
    (async () => {
      setIsProcessing(true);
      setVideoUrl(saved.runUrl || saved.url || '');
      setError(null);
      setProgressStep(0);
      let label = 'Resuming your run…';
      setProgressLabel(label);
      const st = { all: [], failed: 0, lastReason: '', fatal: '', gotDone: false, setLabel: (l) => { label = l; } };
      try {
        await followJob(saved.id, 0, makeJobHandler(st, saved.multi ? saved.url : null));
        if (st.fatal && !st.all.length) throw new Error(st.fatal);
        if (!st.all.length) throw new Error(st.lastReason ? `No clips could be made: ${st.lastReason}` : 'No clips could be made from that link. Try another video.');
        const all = [...st.all].sort((a, b) => (b.viralScore || 0) - (a.viralScore || 0));
        setClips(all);
        setJustFinished(true);
        try { window.dispatchEvent(new Event('vac:clip-done')); } catch {}
        if (st.failed) setNotice(`${st.failed} clip${st.failed === 1 ? '' : 's'} failed to render.`);
        if (saved.multi) setNotice('Resumed the link that was in progress. Run the rest of the batch again if needed.');
        setHistory(prev => prev.some(h => h.jobId === saved.id) ? prev : [{ id: Date.now(), jobId: saved.id, url: saved.url, format: saved.fmt, aiStyle: saved.style, clips: all }, ...prev].slice(0, 5));
        if (!saved.isPro) refreshBilling();
      } catch (e) {
        setClips([...st.all]);
        setError({ message: e?.message || 'Processing failed. Try again.', retry: true });
      } finally {
        clearActiveJob();
        setIsProcessing(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClipping = async (e, override) => {
    e?.preventDefault?.();
    const settings = override || { videoUrl, clipFormat, autoSubtitles, aiHook, aiStyle, clipLength, clipCount, pack, liveMinutes };
    // Shadow state so a retry reuses exactly the same URL and settings.
    const { videoUrl: runUrl, clipFormat: fmt, autoSubtitles: subs, aiHook: hook, aiStyle: style, clipLength: len, clipCount: count, pack: pk } = settings;
    if (!runUrl.trim()) return;
    const isExample = settings.source === 'example';
    setLastWasExample(isExample);
    if (!isExample && !isPro && dailyCount >= FREE_DAILY_LIMIT && credits <= 0) {
      setShowPricing(true);
      return;
    }

    // Splits links glued together with no separator, dedupes, caps at 10.
    const urls = parseLinks(runUrl).links;
    if (!urls.length) return;
    lastRunRef.current = settings;
    ft('generate_click', { source: settings.source || (override ? 'retry' : 'manual'), links: urls.length, pro: isPro ? 'yes' : 'no' });

    setIsProcessing(true);
    setClips([]);
    setError(null);
    setNotice('');
    setExpected(count * urls.length);
    setProgressStep(0);
    setProgressLabel('Starting…');
    let all = [];
    let failed = 0;
    let lastReason = '';
    try {
      for (const url of urls) {
        const started = Date.now();
        let label = 'Starting…';
        const tick = setInterval(() => {
          const secs = Math.floor((Date.now() - started) / 1000);
          setProgressLabel(`${label} ${secs}s`);
        }, 1000);
        try {
        let faceCrop = null;
        try {
          const thumb = url.includes('youtu') ? `https://i.ytimg.com/vi/${(url.match(/(?:v=|youtu\.be\/)([\w-]{11})/) || [])[1]}/hqdefault.jpg` : null;
          if (thumb) {
            const face = await detectFaceBox(thumb);
            if (face) faceCrop = cropFromFace(face, fmt === 'shorts_9_16');
          }
        } catch {}
        let res;
        try {
          res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoUrl: url, clipFormat: fmt, autoSubtitles: subs, aiHook: hook, aiStyle: style, clipLength: len, clipCount: count, pack: pk || '', liveMinutes: settings.liveMinutes || 10, faceCrop, brand: (() => { try { return JSON.parse(localStorage.getItem('viral_brand') || 'null'); } catch { return null; } })() }),
          });
        } catch {
          throw new Error('Could not reach the server. Check your connection and retry.');
        }
        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => '');
          let err = {};
          try { err = JSON.parse(text); } catch {}
          if (err.limitReached) setShowPricing(true);
          throw new Error(err.message || `Generate failed (${res.status})`);
        }
        const st = { all, failed, lastReason, fatal: '', gotDone: false, badLines: 0, setLabel: (l) => { label = l; } };
        const onMsg = makeJobHandler(st, urls.length > 1 ? url : null);
        let jobId = null;
        let seen = 0;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        let dropped = false;
        while (true) {
          let chunk;
          try {
            chunk = await reader.read();
          } catch {
            dropped = true;
            break;
          }
          const { value, done } = chunk;
          if (done) buf += decoder.decode();
          else buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = done ? '' : (lines.pop() || '');
          for (const raw of lines) {
            const line = raw.replace(/^data:\s*/, '');
            if (!line.trim()) continue;
            let msg;
            try { msg = JSON.parse(line); } catch { st.badLines += 1; continue; }
            if (msg.type === 'job') {
              jobId = msg.id || null;
              if (jobId) saveActiveJob({ id: jobId, url, runUrl, multi: urls.length > 1, fmt, style, isPro, at: Date.now() });
              continue;
            }
            seen += 1;
            onMsg(msg);
          }
          if (done) break;
        }
        // Phone switched apps / tab was backgrounded: the server job keeps running, so
        // reattach and replay whatever we missed instead of failing the run.
        if (!st.gotDone && jobId) {
          setProgressLabel(label + ' (reconnecting…)');
          await followJob(jobId, seen, onMsg);
        } else if (dropped) {
          throw new Error('Connection dropped while generating. Retry to pick up where it failed.');
        }
        all = st.all; failed = st.failed; lastReason = st.lastReason;
        const { fatal, gotDone, badLines } = st;
        if (fatal) throw new Error(fatal);
        if (!gotDone) {
          throw new Error(badLines ? 'The server sent a garbled response and the stream ended early.' : 'The connection ended before generation finished.');
        }
        } finally {
          clearInterval(tick);
        }
      }
      if (!all.length) {
        throw new Error(lastReason ? `No clips could be made: ${lastReason}` : 'No clips could be made from that link. Try another video.');
      }
      const previews = all.filter(c => c.preview).length;
      const parts = [];
      if (failed) parts.push(`${failed} clip${failed === 1 ? '' : 's'} failed to render`);
      if (previews) parts.push(`${previews === all.length ? 'These are' : `${previews} are`} placeholder previews, not cuts from your video${lastReason ? ` (${lastReason})` : ''}`);
      if (parts.length) setNotice(parts.join('. ') + '.');
      all.sort((a, b) => (b.viralScore || 0) - (a.viralScore || 0));
      setClips([...all]);
      setJustFinished(true);
      try { window.dispatchEvent(new Event('vac:clip-done')); } catch {}
      ft('generate_success', { source: settings.source || 'manual', clips: all.length });
      if (!isExample) bumpGenCount();
      if (!isPro && !isExample) {
        if (!(dailyCount >= FREE_DAILY_LIMIT && credits > 0)) incrementDaily();
        refreshBilling();
      }
      clearActiveJob();
      setHistory(prev => [{ id: Date.now(), url: runUrl, format: fmt, aiStyle: style, clips: all }, ...prev].slice(0, 5));
    } catch (e) {
      clearActiveJob();
      setClips([...all]);
      ft('generate_error', { source: settings.source || 'manual', message: String(e?.message || 'unknown').slice(0, 120) });
      setError({ message: e?.message || 'Processing failed. Try again.', retry: true });
    } finally {
      setIsProcessing(false);
      setStatusMessage('');
    }
  };

  const handleUpgrade = async (plan) => {
    trackConversion('begin_checkout', { plan, value: PLAN_VALUES[plan], currency: 'USD' });
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planType: plan })
      });
      const data = await res.json();
      if (data.success && data.data?.checkoutUrl) {
        window.open(data.data.checkoutUrl, '_blank');
      } else {
        setError({ message: data.message || 'Checkout is not available for this item yet.' });
      }
    } catch (e) {
      setError({ message: e.message || 'Checkout failed' });
    }
  };


  const freeLeft = Math.max(0, FREE_DAILY_LIMIT - dailyCount);
  const myAssets = history.flatMap(h => (h.clips || []).map(c => ({ ...c, sourceUrl: h.url, createdAt: h.id })));
  const topScore = clips.length ? Math.max(...clips.map(c => c.viralScore || 0)) : 0;
  const price = PRICE[billing];

  const downloadAll = async () => {
    const list = clips.filter(c => c.videoUrl && (!selectedIds.length || selectedIds.includes(c.id)));
    setDlAllBusy(true);
    for (let i = 0; i < list.length; i++) {
      const n = clipFileName(list[i].title, clips.indexOf(list[i]) + 1);
      const a = document.createElement('a'); a.href = downloadHref(list[i].videoUrl, n); a.download = n;
      document.body.appendChild(a); a.click(); a.remove();
      await new Promise(r => setTimeout(r, 900));
    }
    setDlAllBusy(false);
  };
  const formBlock = (<>
    {ytFlash && (
      <div id="yt-flash" role="status" className={`flex items-start gap-3 rounded-card border p-3 text-sm ${ytFlash === 'connected' ? 'border-lime bg-lime-tint text-fg' : 'border-[#FF4D6D]/60 bg-[#FF4D6D]/10 text-fg'}`}>
        <p className="flex-1">{ytFlash === 'connected'
          ? 'YouTube connected. The Publish button can now upload clips to your channel as private videos.'
          : 'YouTube didn\'t connect. While Google is still reviewing this app, only Google accounts added as testers can connect. Try again with that account, or download the clip and upload it in YouTube Studio.'}</p>
        {ytFlash !== 'connected' && <a href={`/api/youtube/start?next=${studio ? '/studio' : '/'}`} className="shrink-0 font-semibold text-lime">Try again</a>}
        <button type="button" aria-label="Dismiss" onClick={() => setYtFlash('')} className="shrink-0 text-muted">✕</button>
      </div>
    )}
            {/* FORM */}
            <form id="clip-form" ref={formRef} onSubmit={handleClipping} className="flex flex-col gap-3.5 rounded-card border border-line2 bg-surface p-3.5 shadow-card">
              <label htmlFor="urls" className={`px-1 text-xs font-semibold uppercase tracking-[.08em] text-muted ${genCount < 3 && !isProcessing && !videoUrl ? 'invisible' : ''}`}>Or paste your own link</label>
              <span id="urls-hint" className="sr-only">Paste one public video link per line, up to 10 for batch mode.</span>
              <div className={studio ? 'flex flex-col gap-2.5' : 'flex flex-col gap-2.5 sm:flex-row sm:items-stretch'}>
                <div className="relative flex flex-1 items-start gap-2.5 rounded-input border border-line2 bg-ink px-3.5 py-3 focus-within:border-lime">
                  {genCount < 3 && !isProcessing && !videoUrl && (
                    <div id="url-guide" aria-hidden className="pointer-events-none absolute bottom-full right-3 z-10 mb-1.5 flex items-end gap-1.5">
                      <span className="rounded-full bg-lime px-2.5 py-1 text-[12px] font-bold text-ink shadow-card">Or paste your own link here</span>
                      <svg className="guide-bounce h-7 w-7 text-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4c6 0 9 4 9 12" /><path d="M10.5 13l4.5 4.5 4.5-4.5" /></svg>
                    </div>
                  )}
                  <span aria-hidden className="mt-0.5"><Link /></span>
                  <textarea
                    id="urls"
                    value={videoUrl}
                    onChange={e => setVideoUrl(e.target.value)}
                    onFocus={() => { if (!focusedRef.current) { focusedRef.current = true; ft('url_input_focus'); } }}
                    onPaste={() => ft('url_pasted')}
                    placeholder="https://youtube.com/watch?v=…  (one per line for batch)"
                    rows={studio ? 4 : 2}
                    required
                    aria-describedby="urls-hint"
                    className="min-w-0 flex-1 resize-none bg-transparent text-[15px] text-fg outline-none placeholder:text-muted"
                  />
                  <label className="shrink-0 cursor-pointer self-center rounded-full border border-line2 px-2.5 py-1 text-xs text-soft hover:border-lime hover:text-lime" title="Upload an MP4 (up to 500 MB, 2 hours)">
                    {uploading ? `Uploading ${uploading}%` : 'Upload MP4'}
                    <input type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm" className="hidden" disabled={!!uploading} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleUploadFile(f); }} />
                  </label>
                </div>
                <button type="submit" disabled={isProcessing} className={`btn-lime h-[52px] whitespace-nowrap px-5 text-[15px] ${studio ? 'hidden sm:inline-flex' : ''}`}>
                  <Bolt /> {isProcessing ? 'Generating…' : 'Generate clips'}
                </button>
              </div>
              {(() => {
                const p = parseLinks(videoUrl);
                if (p.found < 2) return null;
                return (
                  <p id="link-count" className="px-1 text-xs text-soft">
                    {p.links.length} video{p.links.length === 1 ? '' : 's'} detected
                    {p.duplicates ? ` · ${p.duplicates} duplicate${p.duplicates === 1 ? '' : 's'} removed` : ''}
                    {p.dropped ? ` · ${p.dropped} over the 10-link limit skipped` : ''}
                    {' '}· each is clipped separately
                  </p>
                );
              })()}
              {liveChannel && (
                <div id="live-picker" role="group" aria-label="Clip the last minutes of the live stream" className="flex flex-wrap items-center gap-2 rounded-input border border-line2 bg-ink px-3 py-2.5 text-sm">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${liveInfo?.live ? 'text-[#FF4D6D]' : 'text-muted'}`}>
                    <i aria-hidden className={`h-2 w-2 rounded-full ${liveInfo?.live ? 'bg-[#FF4D6D] animate-pulse' : 'bg-line2'}`} />
                    {liveInfo == null ? 'Checking channel…' : liveInfo.exists === false ? 'Channel not found' : liveInfo.live ? `${liveInfo.name || liveChannel} is live` : `${liveInfo.name || liveChannel} is offline`}
                  </span>
                  <span className="text-xs text-muted">Clip the last</span>
                  {LIVE_MINUTES.map(m => (
                    <button key={m} type="button" aria-pressed={liveMinutes === m} onClick={() => setLiveMinutes(m)} className={`chip shrink-0 ${liveMinutes === m ? 'chip-on' : ''}`}>{m} min</button>
                  ))}
                  {liveInfo?.live && liveInfo.archive === false && <span className="w-full text-xs text-[#FFB64D]">This channel doesn&apos;t save broadcasts, so recent minutes can&apos;t be grabbed.</span>}
                  {liveInfo && liveInfo.exists !== false && !liveInfo.live && <span className="w-full text-xs text-muted">Paste a VOD link (twitch.tv/videos/…) to clip a past stream.</span>}
                </div>
              )}
              <div className={studio ? 'flex flex-col gap-2 px-0.5' : 'flex flex-col gap-2 px-0.5 sm:flex-row sm:flex-wrap sm:items-center'}>
                {[
                  { label: 'Format', options: FORMATS, value: clipFormat, set: setClipFormat },
                  { label: 'Pack', options: PACKS, value: pack, set: setPack },
                  { label: 'Length', options: LENGTHS, value: clipLength, set: setClipLength },
                  { label: 'Clips', options: CLIP_COUNTS, value: clipCount, set: setClipCount },
                ].map((g, gi) => (
                  <div key={g.label} role="group" aria-label={g.label} className={studio ? 'flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]' : 'flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] sm:overflow-visible sm:pb-0'}>
                    {gi > 0 && !studio && <span aria-hidden className="mx-1.5 hidden h-5 w-px bg-line2 sm:block" />}
                    <span className={`mr-1 w-12 shrink-0 text-xs text-muted ${studio ? '' : 'sm:w-auto'}`}>{g.label}</span>
                    {g.options.map(o => (
                      <button key={o.value} type="button" aria-pressed={g.value === o.value} onClick={() => g.set(o.value)} className={`chip shrink-0 ${g.value === o.value ? 'chip-on' : ''}`}>{o.label}</button>
                    ))}
                  </div>
                ))}
              </div>
              {srcSecs.secs > 0 && srcSecs.url === videoUrl.trim() && srcSecs.secs < clipLength + 1 && (
                <p role="note" className="rounded-input border border-[#FFB64D]/50 px-3 py-2 text-xs text-[#FFB64D]">Your video is only {Math.round(srcSecs.secs)}s long, so clips will be about {Math.max(1, Math.floor(srcSecs.secs))}s, not {clipLength}s, and you&apos;ll get 1 clip.</p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-0.5 text-xs text-muted">
                <div className="flex gap-4">
                  <label className="flex cursor-pointer items-center gap-2 text-soft"><input type="checkbox" className="accent-lime" checked={autoSubtitles} onChange={e => setAutoSubtitles(e.target.checked)} /> Captions</label>
                  <label className="flex cursor-pointer items-center gap-2 text-soft"><input type="checkbox" className="accent-lime" checked={aiHook} onChange={e => setAiHook(e.target.checked)} /> Hook overlay</label>
                </div>
              </div>
            </form>
            <div id="remaining" className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-card border border-line2 bg-surface/80 px-4 py-3 text-sm">
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted">Generations remaining</span>
              {isPro ? (
                <span className="flex items-center gap-1.5 font-semibold text-lime"><Bolt size={13} fill="#C6FF3D" />200/day with Pro</span>
              ) : (
                <>
                  <span className="flex items-center gap-2 text-soft"><b className="text-white">{freeLeft}</b> of {FREE_DAILY_LIMIT} free today
                    <span className="inline-flex gap-1">{Array.from({ length: FREE_DAILY_LIMIT }, (_, k) => <i key={k} className={`h-1 w-6 rounded-sm ${k < freeLeft ? 'bg-lime' : 'bg-line2'}`} />)}</span>
                  </span>
                  <span className="text-soft"><b className="text-white">{credits}</b> credit{credits === 1 ? '' : 's'}</span>
                  <span className="text-soft">Total: <b className="text-lime">{freeLeft + credits}</b></span>
                  <button type="button" onClick={() => setShowPricing(true)} className="ml-auto text-xs font-semibold text-lime">Get more →</button>
                </>
              )}
            </div>
 {error && !error.retry && (
              <div role="alert" className="flex items-start gap-3 rounded-card border border-[#FF4D6D]/60 bg-[#FF4D6D]/10 p-4 text-sm animate-fadeup">
                <span aria-hidden className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#FF4D6D] text-xs font-bold text-ink">!</span>
                <p className="flex-1 leading-relaxed text-fg">{error.message}</p>
                <button type="button" onClick={() => setError(null)} aria-label="Dismiss error" className="shrink-0 text-muted hover:text-fg">✕</button>
              </div>
            )}

  </>);
  const clipsBlock = (<>
          {isProcessing && clips.length === 0 && (
            <div className="card flex flex-col gap-4 p-5 animate-fadeup">
              <div className="flex items-center gap-3.5 rounded-[14px] border border-line bg-[#0F0F16] p-3.5">
                <svg className="animate-spin" width="40" height="40" viewBox="0 0 40 40" aria-hidden><circle cx="20" cy="20" r="16" fill="none" stroke="#23232E" strokeWidth="5" /><path d="M20 4a16 16 0 0 1 16 16" fill="none" stroke="#C6FF3D" strokeWidth="5" strokeLinecap="round" /></svg>
                <div className="flex flex-1 flex-col gap-1">
                  <span className="text-sm font-semibold">{statusMessage}</span>
                  <span className="text-xs text-muted">Step {stage + 1} of 4 · usually under 90 seconds</span>
                </div>
                <div className="wave hidden h-7 items-end gap-1 sm:flex" aria-hidden>
                  {Array.from({ length: 5 }, (_, i) => <span key={i} className="h-7" style={{ animationDelay: `${i * 150}ms` }} />)}
                </div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#1E1E29]">
                <i className="block h-full rounded-full bg-lime transition-[width] duration-700" style={{ width: `${(stage + 1) * 25}%` }} />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {[0, 1, 2].map(i => (
                  <div key={i} className="flex flex-col gap-2">
                    <div className="aspect-[9/12] rounded-xl bg-shimmer [background-size:200%_100%] animate-shimmer" style={{ animationDelay: `${i * 200}ms` }} />
                    <div className="h-2.5 w-4/5 rounded bg-shimmer [background-size:200%_100%] animate-shimmer" />
                    <div className="h-2.5 w-1/2 rounded bg-shimmer [background-size:200%_100%] animate-shimmer" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {error?.retry && !isProcessing && (
            <div role="alert" className="card flex flex-col gap-3 border border-[#FF4D6D]/60 bg-[#FF4D6D]/10 p-5 animate-fadeup">
              <div className="flex items-start gap-3">
                <span aria-hidden className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#FF4D6D] text-xs font-bold text-ink">!</span>
                <div className="flex flex-1 flex-col gap-1">
                  <span className="text-sm font-semibold">Generation stopped</span>
                  <p className="text-sm leading-relaxed text-fg">{error.message}</p>
                  {clips.length > 0 && <p className="text-xs text-muted">{clips.length} clip{clips.length === 1 ? '' : 's'} already received {clips.length === 1 ? 'is' : 'are'} kept below.</p>}
                </div>
                <button type="button" onClick={() => setError(null)} aria-label="Dismiss error" className="shrink-0 text-muted hover:text-fg">✕</button>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => { if (lastRunRef.current) { setError(null); setJustFinished(false); handleClipping(null, lastRunRef.current); } }} className="btn-lime h-9 px-4 text-sm">Retry</button>
                <button type="button" onClick={() => setError(null)} className="btn-ghost h-9 px-4 text-sm">Dismiss</button>
              </div>
            </div>
          )}

          {!isProcessing && clips.length === 0 && !error?.retry && (
            <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 rounded-card border border-dashed border-line2 p-8 text-center">
              <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label="Empty clip tray" className="animate-floaty">
                <rect x="28" y="18" width="40" height="70" rx="10" fill="#1E1E29" stroke="#2A2A36" />
                <rect x="52" y="30" width="40" height="70" rx="10" fill="#14141C" stroke="#2A2A36" />
                <rect x="60" y="42" width="24" height="4" rx="2" fill="#2A2A36" /><rect x="60" y="52" width="18" height="4" rx="2" fill="#2A2A36" />
                <circle cx="36" cy="92" r="14" fill="#C6FF3D" /><path d="M31 92h10M36 87v10" stroke="#0A0A0F" strokeWidth="3" strokeLinecap="round" />
                <path d="M96 20l3 6 6 3-6 3-3 6-3-6-6-3 6-3z" fill="#7C5CFF" />
              </svg>
              <h3 className="font-display text-2xl font-extrabold text-white">No clips yet</h3>
              <p className="max-w-[300px] text-sm leading-relaxed text-soft">{studio ? 'Paste a link or upload a video in the panel, tap Generate, and your clips show up here.' : 'Paste a link above and the AI will pull the best 30–60 second moments out of it.'}</p>
              <button type="button" onClick={runExample} disabled={isProcessing} className="btn-ghost h-11 px-5 text-sm">▶ See an example</button>
            </div>
          )}

          {isProcessing && clips.length === 0 && (
            <ProgressDock label={progressLabel} step={progressStep} />
          )}

          {clips.length > 0 && (
            <>
              {justFinished && !isProcessing && (
                <div className="relative flex items-center gap-4 overflow-hidden rounded-card border border-lime bg-lime-tint p-4 animate-fadeup">
                  <div aria-hidden className="pointer-events-none absolute inset-0">
                    {['12%', '28%', '44%', '60%', '76%', '90%'].map((l, i) => (
                      <i key={i} className="absolute -top-2 h-3 w-2 rounded-sm animate-confetti" style={{ left: l, background: ['#C6FF3D', '#7C5CFF', '#FF4D6D', '#FFB64D'][i % 4], animationDelay: `${i * 0.25}s` }} />
                    ))}
                  </div>
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-lime shadow-glow animate-pop"><Check color="#0A0A0F" /></span>
                  <div className="relative">
                    <p className="font-display text-lg font-extrabold text-white">{clips.length} {clips.length === 1 ? 'clip' : 'clips'} ready</p>
                    <p className="text-sm text-soft">Top score <span className="font-mono text-lime">{topScore}</span> — sorted best first.</p>
                  </div>
                </div>
              )}
              {lastWasExample && !isProcessing && (
                <div id="example-next" className="flex flex-col gap-3 rounded-card border border-lime bg-surface p-4 sm:flex-row sm:items-center animate-fadeup">
                  <div className="flex-1">
                    <p className="font-display text-lg font-extrabold text-white">That was the example. Now do your video.</p>
                    <p className="text-sm text-soft">Paste any YouTube, Twitch or podcast link. You get {FREE_DAILY_LIMIT} free generations a day.</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={focusInput} className="btn-lime h-11 flex-1 justify-center px-5 text-sm sm:flex-none">Paste my link</button>
                    {!studio && <a href="/studio" className="btn-ghost h-11 px-4 text-sm no-underline">Open Studio</a>}
                    {!isPro && <button type="button" onClick={() => setShowPricing(true)} className="btn-ghost h-11 px-4 text-sm">See plans</button>}
                  </div>
                </div>
              )}
              {justFinished && !isProcessing && !lastWasExample && <FeedbackNudge />}
              {notice && !isProcessing && (
                <p role="status" className="rounded-card border border-line2 bg-surface p-3 text-sm text-soft">{notice}</p>
              )}
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex flex-col gap-2">
                  <span className="eyebrow" aria-live="polite">{isProcessing ? `Your clips · ${clips.length} of ${expected} ready` : 'Your clips'}</span>
                  <h2 className="font-display text-3xl font-extrabold leading-tight tracking-tight text-white md:text-[44px]">Ranked by AI viral score.</h2>
                  <p className="max-w-[560px] text-sm text-soft">The score is an AI estimate of how well a moment fits short-form, based on its hook, pacing and clarity. It is not a guarantee of views. Tap a clip to see the reasons.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {studio && selectedIds.length > 0 && <button type="button" onClick={() => { if (window.confirm(`Upload ${selectedIds.length} selected clip${selectedIds.length === 1 ? '' : 's'} to your YouTube as private?`)) window.dispatchEvent(new CustomEvent('studio-publish', { detail: { platform: 'youtube' } })); }} className="btn-lime h-10 px-4 text-sm">🚀 Publish selected to YouTube ({selectedIds.length})</button>}
                  {studio && clips.some(c => c.videoUrl) && <button type="button" onClick={downloadAll} disabled={dlAllBusy} className="btn-lime h-10 px-4 text-sm">{dlAllBusy ? 'Downloading…' : selectedIds.length ? `Download selected (${selectedIds.length})` : `Download all (${clips.filter(c => c.videoUrl).length})`}</button>}
                  <button onClick={() => { setClips([]); setSelectedIds([]); }} className="btn-ghost h-10 px-4 text-sm">Clear</button>
                </div>
              </div>
              <div className={studio ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3' : 'mx-auto grid w-full max-w-[420px] grid-cols-1 gap-5 sm:max-w-none sm:grid-cols-2 lg:grid-cols-3'}>
                {clips.map((c, i) => studio
                  ? <StudioClip key={c.id} clip={c} index={i} selected={selectedIds.includes(c.id)} onSelect={on => setSelectedIds(ids => on ? [...ids, c.id] : ids.filter(x => x !== c.id))} />
                  : <ClipPlayer key={c.id} clip={c} index={i} />)}
                {isProcessing && Array.from({ length: Math.max(0, expected - clips.length) }, (_, i) => (
                  <div key={`pending-${i}`} aria-hidden className="flex flex-col gap-2">
                    <div className="aspect-[9/12] rounded-xl bg-shimmer [background-size:200%_100%] animate-shimmer" style={{ animationDelay: `${i * 200}ms` }} />
                    <div className="h-2.5 w-4/5 rounded bg-shimmer [background-size:200%_100%] animate-shimmer" />
                  </div>
                ))}
              </div>
            </>
          )}

          {myAssets.length > 0 && (
            <a href="/assets" className="flex items-center justify-between rounded-input border border-line bg-surface px-4 py-3 text-sm hover:border-lime">
              <span className="font-semibold text-white">View all {myAssets.length} assets</span>
              <span className="text-lime">Open library →</span>
            </a>
          )}

          {history.length > 0 && (
            <div className="flex flex-col gap-3 pt-4">
              <span className="text-xs font-semibold uppercase tracking-[.08em] text-muted">Recent</span>
              <div className="flex flex-col gap-2">
                {history.map(h => (
                  <div key={h.id} className="flex items-center justify-between gap-3 rounded-input border border-line bg-surface px-3.5 py-2.5 text-sm">
                    <span className="truncate text-soft">{h.url}</span>
                    <span className="hidden shrink-0 text-xs text-muted sm:inline">{h.clips?.length || 0} clips</span>
                    <button onClick={() => { setVideoUrl(h.url); setClips(h.clips || []); setJustFinished(false); setTimeout(() => document.getElementById('clips')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }} className="shrink-0 text-xs font-semibold text-lime hover:text-lime-hover">Load</button>
                  </div>
                ))}
              </div>
            </div>
          )}
  </>);
  const modalBlock = (<>
      {/* UPGRADE MODAL */}
      {showPricing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm" onClick={() => setShowPricing(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="up-title" className="relative w-full max-w-[560px] overflow-hidden rounded-3xl border border-line2 bg-surface shadow-modal animate-fadeup" onClick={e => e.stopPropagation()}>
            <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-spotlight blur-xl" />
            <div className="relative flex flex-col gap-5 p-7">
              <div className="flex items-start justify-between gap-3">
                {!isPro && dailyCount >= FREE_DAILY_LIMIT ? (
                  <span className="inline-flex h-8 items-center gap-2 rounded-full border border-hot bg-[#2A1414] px-2.5 text-xs font-semibold text-[#FF8FA3]">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /><path d="M12 7v6M12 16v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                    You've used {FREE_DAILY_LIMIT} of {FREE_DAILY_LIMIT} free generations today
                  </span>
                ) : <span className="eyebrow pt-2">Pro</span>}
                <button type="button" aria-label="Close" onClick={() => setShowPricing(false)} className="btn-ghost h-9 w-9 rounded-[10px] p-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
                </button>
              </div>
              <h3 id="up-title" className="font-display text-3xl font-extrabold leading-tight tracking-tight text-white md:text-[38px]">
                Keep the clips coming.<br /><span className="text-lime">Go Pro.</span>
              </h3>
              <p className="text-[15px] leading-relaxed text-soft">Pro gives you 200 generations a day, removes the watermark, and saves your history so you never lose a banger.</p>
              <ul className="grid gap-2.5 text-sm sm:grid-cols-2">
                <li className="flex items-center gap-2"><Check />200 generations a day</li>
                <li className="flex items-center gap-2"><Check />No watermark</li>
                <li className="flex items-center gap-2"><Check />Batch up to 10 links</li>
              </ul>
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <button onClick={() => handleUpgrade('pro_yearly')} className="btn-lime h-[50px] flex-1 text-[15px]">$199.99 / year <span className="rounded-full bg-ink/15 px-1.5 text-[11px]">save 17%</span></button>
                <button onClick={() => handleUpgrade('pro_monthly')} className="btn-ghost h-[50px] flex-1 text-[15px]">$19.99 / month</button>
              </div>
              <div className="border-t border-line pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[.08em] text-muted">Or buy credits · from $9</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <button onClick={() => handleUpgrade('credits_10')} className="btn-ghost h-16 flex-col text-xs">10 credits<span className="text-[11px] text-muted">$9</span><span className="text-[10px] text-muted">base</span></button>
                  <button onClick={() => handleUpgrade('credits_25')} className="btn-ghost h-16 flex-col text-xs">25 credits<span className="text-[11px] text-muted">$19</span><span className="text-[10px] font-bold text-lime">save 16%</span></button>
                  <button onClick={() => handleUpgrade('credits_50')} className="btn-ghost h-16 flex-col text-xs">50 credits<span className="text-[11px] text-muted">$29</span><span className="text-[10px] font-bold text-lime">save 36%</span></button>
                  <button onClick={() => handleUpgrade('credits_100')} className="btn-ghost h-16 flex-col text-xs">100 credits<span className="text-[11px] text-muted">$49</span><span className="text-[10px] font-bold text-lime">save 46%</span></button>
                </div>
                <p className="mt-2 text-[11px] text-muted">1 credit = 1 generation (1 link, up to 8 clips), used after your free ones. Bigger packs cost less per generation.</p>
              </div>
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Secure checkout via Stripe · cancel anytime</span>
              </div>
            </div>
          </div>
        </div>
      )}

  </>);
  if (studio) return (
    <div className="relative min-h-screen bg-ink">
      <header className="sticky top-0 z-30 border-b border-line/60 bg-ink/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-2">
            <BoltMenu icon={<Bolt size={18} />} onAccountChange={() => refreshBilling()} />
            <a href="/" className="truncate font-display text-base font-extrabold text-fg no-underline">Viral AI Clipper <span className="text-lime">Studio</span></a>
          </div>
          <nav className="hidden items-center gap-5 text-sm text-soft md:flex">
            <a href="/assets" className="hover:text-fg">My Assets</a>
            <a href="/tutorial" className="hover:text-fg">Tutorial</a>
            <AccountBar onChange={() => refreshBilling()} />
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            {!isPro && <span className="text-xs text-muted">{freeLeft}/{FREE_DAILY_LIMIT} free</span>}
            <button onClick={() => setShowPricing(true)} className="btn-lime h-9 px-3 text-xs">{isPro ? 'Manage' : 'Go Pro'}</button>
          </div>
        </div>
        {!isPro && !promoHidden && (
          <div className="flex items-center justify-center gap-2 border-t border-line/60 px-4 py-1 text-[12px] font-semibold text-lime">
            <span className="truncate">50% off Pro with <b>LAUNCH50</b> · ends Nov 1</span>
            <button aria-label="Dismiss" onClick={() => { setPromoHidden(true); try { localStorage.setItem('vac_promo_launch50', '1'); } catch {} }} className="text-lime/70">✕</button>
          </div>
        )}
      </header>
      <main id="top" className="mx-auto grid max-w-[1600px] grid-cols-1 gap-6 px-4 pb-32 pt-4 lg:grid-cols-[420px_1fr] lg:pb-10">
        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <div className="flex items-center justify-between gap-2">
            <h1 className="font-display text-2xl font-extrabold text-white">New clips</h1>
            <button type="button" onClick={runExample} disabled={isProcessing} className="text-sm font-semibold text-lime disabled:opacity-50">▶ Try an example</button>
          </div>
          {formBlock}
        </aside>
        <section id="clips" className="flex min-w-0 flex-col gap-6">
          {clipsBlock}
        </section>
      </main>
      {modalBlock}
      <SpinWheel onWon={() => refreshBilling()} onUpgrade={() => setShowPricing(true)} />
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink/95 p-3 backdrop-blur sm:hidden">
        <button type="submit" form="clip-form" disabled={isProcessing} className="btn-lime h-12 w-full text-[15px] font-extrabold">
          <Bolt /> {isProcessing ? 'Generating…' : 'Generate clips'}
        </button>
      </div>
    </div>
  );
  return (
    <div className="relative min-h-screen overflow-hidden bg-ink">
      {/* background: dot grid + spotlights */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-dots [background-size:28px_28px] opacity-60" />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-[-320px] h-[900px] w-[1100px] -translate-x-1/2 rounded-full bg-spotlight blur-2xl" />
      <div aria-hidden className="pointer-events-none absolute right-[-200px] top-[400px] h-[700px] w-[700px] rounded-full bg-spotlight-violet blur-2xl" />

      {/* NAV */}
      <header className="sticky top-0 z-20 border-b border-line/60 bg-ink/70 backdrop-blur-md">
        <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <BoltMenu icon={<Bolt size={20} />} onAccountChange={() => refreshBilling()} />
            <a href="#top" className="font-display text-lg font-extrabold tracking-tight text-fg no-underline">Viral AI Clipper</a>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-medium text-soft md:flex">
            <a href="/studio" className="font-semibold text-lime hover:text-lime-hover">Studio</a>
            <a href="/tutorial" className="hover:text-fg">How It Works</a>
            <a href="/monetize" className="hover:text-fg">Earn With Clips</a>
            <a href="#pricing" className="hover:text-fg">Pricing</a>
            <AccountBar onChange={() => refreshBilling()} />
          </nav>
          <div className="flex items-center gap-2.5">
            {!isPro && <span className="hidden text-xs text-muted sm:inline">{freeLeft}/{FREE_DAILY_LIMIT} free{credits > 0 ? ` · ${credits} credits` : ''}</span>}
            {isPro && (
              <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-lime bg-lime-tint px-2.5 text-[11px] font-bold text-lime">
                <Bolt size={12} fill="#C6FF3D" />PRO
              </span>
            )}
            <button onClick={() => setShowPricing(true)} className="btn-lime h-10 px-4 text-sm">
              {isPro ? 'Manage' : 'Upgrade to Pro'}{!isPro && <Arrow />}
            </button>
          </div>
        </div>
      </header>

      {!isPro && !promoHidden && (
        <div className="relative mx-auto mt-3 flex max-w-6xl items-center justify-center gap-3 px-5">
          <div className="flex items-center gap-3 rounded-full border border-lime bg-lime-tint px-4 py-1.5 text-[13px] font-semibold text-lime">
            <span>Launch week: 50% off Pro with code <b>LAUNCH50</b>, ends Nov 1</span>
            <button aria-label="Dismiss" onClick={() => { setPromoHidden(true); try { localStorage.setItem('vac_promo_launch50', '1'); } catch {} }} className="text-lime/70 hover:text-lime">✕</button>
          </div>
        </div>
      )}
      <main id="top" className="relative mx-auto max-w-6xl px-5">
        {/* HERO */}
        <section className="grid grid-cols-1 items-center gap-8 pb-20 pt-4 sm:pt-8 md:grid-cols-[1.1fr_.9fr]">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="hidden h-8 items-center gap-2 self-start rounded-full border border-line2 bg-surface pl-1.5 sm:inline-flex pr-3 text-[13px] font-medium text-soft">
              <span className="inline-flex h-[22px] items-center rounded-full bg-lime px-2 text-[11px] font-bold tracking-wide text-ink">NEW</span>
              Batch mode · paste up to 10 links at once
            </div>
            <h1 className="font-display text-[28px] font-extrabold leading-[1.05] tracking-tight text-white sm:text-[40px] md:text-[52px]">
              Turn one video into <span className="text-lime">up to 8 clips</span> that are built to go viral.
            </h1>
            <div className="flex flex-col gap-2">
              <button id="try-example" type="button" onClick={runExample} disabled={isProcessing} className="btn-lime h-[52px] w-full justify-center px-6 text-[17px] font-extrabold shadow-glow sm:w-auto sm:self-start disabled:opacity-60">
                {isProcessing && lastWasExample ? 'Making example clips…' : '▶ See it work — free, 1 tap'}
              </button>
              <p className="px-1 text-[13px] text-muted">Watch the AI clip a short 19-second sample, so you get one ~18s clip. Doesn't use your free generations. <a href="/studio" className="font-semibold text-lime">Open the full Studio →</a></p>
            </div>
            <p className="hidden max-w-[520px] text-base leading-relaxed text-soft sm:block">
              Paste a YouTube, podcast or stream link, or up to 10 videos at once. The AI finds the hooks, cuts the dead air, burns in captions and scores every clip for TikTok, Reels and Shorts.
            </p>

            {formBlock}
            <div className="flex flex-wrap gap-5 text-[13px] text-muted">
              <span className="flex items-center gap-1.5"><Check />No watermark on Pro</span>
              <span className="flex items-center gap-1.5"><Check />Captions burned in</span>
              <span className="flex items-center gap-1.5"><Check />Ready in about a minute</span>
            </div>
          </div>

          {/* Hero visual */}
          <div className="relative hidden h-[560px] items-center justify-center md:flex">
            <div aria-hidden className="absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-line2" />
            <div aria-hidden className="absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-line" />

            {/* back phone */}
            <div className="absolute left-[30px] top-[90px] h-[360px] w-[200px] -rotate-[8deg] rounded-[28px] border border-line bg-surface shadow-card animate-floaty-slow">
              <div className="absolute inset-3.5 overflow-hidden rounded-[18px] bg-[#1E1E29]">
                <div className="absolute inset-x-3.5 bottom-10 rounded-[10px] bg-ink/85 px-2.5 py-2 font-display text-sm font-extrabold uppercase leading-[1.1] text-white">
                  nobody<br /><span className="text-lime">talks about this</span>
                </div>
              </div>
            </div>

            {/* front phone */}
            <div className="relative h-[430px] w-[240px] rounded-[32px] border border-line2 bg-surface shadow-[0_40px_90px_rgba(0,0,0,.7),0_0_0_6px_rgba(198,255,61,.08)] animate-floaty">
              <div className="absolute inset-3.5 overflow-hidden rounded-[22px] bg-[#0F0F16]">
                <div className="absolute inset-x-0 top-0 h-[40%] bg-[#1A1A24]" />
                <div className="wave absolute inset-x-4 top-1/2 flex h-10 items-end gap-1" aria-hidden>
                  {Array.from({ length: 22 }, (_, i) => <span key={i} className="h-10" style={{ animationDelay: `${(i * 137) % 1100}ms` }} />)}
                </div>
                <div className="absolute inset-x-3.5 bottom-14 text-center font-display text-lg font-extrabold uppercase leading-[1.05] text-white [text-shadow:0_2px_12px_rgba(0,0,0,.8)]">
                  I spent <span className="rounded bg-lime/15 px-1 text-lime">$40,000</span> on this mistake
                </div>
                <div className="absolute inset-x-3.5 bottom-[18px] flex items-center justify-between">
                  <span className="font-mono text-[11px] text-muted">00:42 / 01:00</span>
                  <span className="inline-flex gap-1"><i className="h-1.5 w-1.5 rounded-full bg-lime" /><i className="h-1.5 w-1.5 rounded-full bg-line2" /><i className="h-1.5 w-1.5 rounded-full bg-line2" /></span>
                </div>
                <div className="absolute left-3.5 top-3.5 inline-flex h-6 items-center gap-1.5 rounded-full border border-line2 bg-ink/80 px-2 text-[11px] font-semibold"><i className="h-1.5 w-1.5 rounded-full bg-hot" />9:16</div>
              </div>
            </div>

            {/* score badge */}
            <div className="card absolute right-[10px] top-[70px] flex items-center gap-3.5 px-4 py-3.5 shadow-card animate-floaty-slow">
              <ViralScoreMeter score={94} size={64} stroke={10} />
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-muted">Viral score</span>
                <span className="font-display text-lg font-extrabold text-lime">Post this one</span>
                <span className="text-xs text-soft">Strong hook · tight pacing</span>
              </div>
            </div>

            {/* hook badge */}
            <div className="card absolute bottom-10 left-0 flex items-center gap-3 px-3.5 py-3 shadow-card animate-floaty">
              <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-violet"><Sparkle color="#fff" /></span>
              <div className="flex flex-col">
                <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-muted">AI hook</span>
                <span className="text-sm font-semibold">“Wait for the plot twist at 0:31”</span>
              </div>
            </div>

            {/* platform badge */}
            <div className="card absolute bottom-[90px] right-[30px] flex items-center gap-2 px-3 py-2.5 shadow-card">
              {['TT', 'IG', 'YT'].map(p => <span key={p} className="grid h-[26px] w-[26px] place-items-center rounded-lg border border-line2 bg-ink text-[10px] font-bold">{p}</span>)}
              <span className="ml-1 text-xs text-soft">Export to all three</span>
            </div>
          </div>
        </section>
      </main>

      {/* HOW TO CLIP STREAMERS */}
      <section id="clip-streamers" aria-labelledby="clip-streamers-title" className="border-y border-[#1E1E29] bg-[#0D0D14] py-14">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-lime">Step by step</span>
            <h2 id="clip-streamers-title" className="font-display text-3xl font-extrabold tracking-tight text-white md:text-4xl">How to clip streamers and get paid</h2>
            <p className="max-w-2xl text-sm text-soft">A simple workflow clippers use. Earnings aren&apos;t guaranteed: payouts depend on each program&apos;s rules, approval and your views.</p>
          </div>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {STREAM_STEPS.map((st, i) => (
              <li key={st.t} className="card flex flex-col gap-3 p-5">
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-lime font-display text-sm font-extrabold text-ink">{i + 1}</span>
                  <h3 className="text-base font-bold text-white">{st.t}</h3>
                </div>
                <p className="text-sm leading-relaxed text-soft">{st.d}</p>
                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  {st.tools.map(([label, href]) => href.startsWith('#') || href.startsWith('/')
                    ? <a key={label} href={href} onClick={href === '#urls' ? focusInput : undefined} className="chip text-xs hover:border-lime">{label}</a>
                    : <a key={label} href={href} target="_blank" rel="noopener noreferrer" className="chip text-xs hover:border-lime">{label} ↗</a>)}
                </div>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center gap-4">
            <a href="/studio" className="rounded-full bg-lime px-6 py-3 text-sm font-bold text-ink hover:bg-lime-hover">Open Studio — clip free →</a>
            <a href="/monetize" className="text-sm font-semibold text-lime hover:text-lime-hover">Full monetization guide</a>
          </div>
        </div>
      </section>

      <main className="relative mx-auto max-w-6xl px-5">
        {/* STATUS / RESULTS */}
        <section id="clips" className="flex flex-col gap-8 pb-20 pt-20">
          {clipsBlock}
        </section>

        <SeeItWork />

        {/* HOW IT WORKS */}
        <section id="how" className="flex flex-col gap-10 pb-24">
          <div className="flex max-w-[640px] flex-col gap-3">
            <span className="eyebrow">Tutorial</span>
            <h2 className="font-display text-3xl font-extrabold leading-tight tracking-tight text-white md:text-[44px]">New here? Start here.</h2>
            <p className="text-base leading-relaxed text-soft">Four steps. No editing skills needed. Your first clip is ready in about a minute.</p>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {[
              { n: '01', title: 'Paste a YouTube link', desc: 'Copy any public YouTube URL and paste it in the box at the top. It works with long videos, Shorts, and interviews.' },
              { n: '02', title: 'Pick length and how many clips', desc: 'Choose 15, 30, or 60 seconds. Then pick 1 clip if you want it fast, or up to 8 if you want more options.' },
              { n: '03', title: 'Hit Clip and wait for the first one', desc: 'The AI finds the best moments, cuts them, and burns a caption. The first clip appears as soon as it is ready. You do not have to wait for all of them.' },
              { n: '04', title: 'Download and post', desc: 'Play the clip, hit Download, then use TikTok, Reels, Shorts, or X. The caption is copied for you. Create a free account so your clips stay saved.' },
            ].map(s => (
              <article key={s.n} className="card flex flex-col gap-3 p-6">
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-lime text-sm font-bold text-ink">{s.n}</span>
                  <h3 className="font-display text-lg font-extrabold text-white">{s.title}</h3>
                </div>
                <p className="text-sm leading-relaxed text-soft">{s.desc}</p>
              </article>
            ))}
          </div>
          <div className="card flex flex-col gap-3 p-6">
            <h3 className="font-display text-lg font-extrabold text-white">Beginner tips</h3>
            <ul className="grid gap-2 text-sm text-soft md:grid-cols-2">
              <li>• Start with 1 clip and 15 seconds if you want the fastest result.</li>
              <li>• Longer videos give the AI more moments to choose from.</li>
              <li>• You get {FREE_DAILY_LIMIT} free generations a day. 1 generation = 1 link, up to 8 clips. Credits never expire.</li>
              <li>• Pro gives 200 generations a day and removes the watermark.</li>
              <li>• Your clips also show up on the Assets page.</li>
              <li>• The publish buttons open the app with your caption already copied.</li>
            </ul>
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" className="flex flex-col items-center gap-9 pb-28">
          <div className="flex max-w-[640px] flex-col items-center gap-3 text-center">
            <span className="eyebrow">Pricing</span>
            <h2 className="font-display text-3xl font-extrabold leading-tight tracking-tight text-white md:text-[44px]">{FREE_DAILY_LIMIT} free generations a day. 200 a day on Pro. No per-minute charges.</h2>
            <p className="text-sm text-soft">1 generation = 1 video link, making up to 8 clips. A batch of 3 links uses 3 generations. Failed runs are not counted.</p>
            <div className="mt-2 inline-flex rounded-full border border-line2 bg-surface p-1">
              <button type="button" onClick={() => setBilling('monthly')} className={`chip h-[34px] border-0 ${billing === 'monthly' ? 'chip-on' : ''}`}>Monthly</button>
              <button type="button" onClick={() => setBilling('yearly')} className={`chip h-[34px] border-0 ${billing === 'yearly' ? 'chip-on' : ''}`}>
                Yearly <span className="ml-1 inline-flex h-5 items-center rounded-full bg-lime px-1.5 text-[11px] font-bold text-ink">−17%</span>
              </button>
            </div>
          </div>
          <div className="grid w-full max-w-[860px] grid-cols-1 gap-5 md:grid-cols-2">
            <article className="card flex min-w-0 flex-col gap-5 p-6 sm:p-8">
              <div className="flex flex-col gap-1.5">
                <span className="font-display text-xl font-extrabold">Free</span>
                <span className="text-sm text-muted">Try it on your next upload.</span>
              </div>
              <div className="flex items-baseline gap-1.5"><span className="font-display text-[52px] font-extrabold leading-none text-white">$0</span><span className="text-sm text-muted">forever</span></div>
              <ul className="flex flex-col gap-2.5 text-sm text-soft">
                <li className="flex items-center gap-2.5"><Check color="#8A8AA0" />{FREE_DAILY_LIMIT} generations per day</li>
                <li className="flex items-center gap-2.5"><Check color="#8A8AA0" />Watermarked exports</li>
              </ul>
              <a href="#top" className="btn-ghost mt-auto h-12 no-underline">Start free</a>
            </article>
            <article className="card relative flex min-w-0 flex-col gap-5 border-lime p-6 sm:p-8 shadow-pro">
              <span className="absolute -top-3.5 left-8 inline-flex h-7 items-center gap-1.5 rounded-full bg-lime px-3 text-xs font-bold tracking-wide text-ink"><Bolt size={14} />MOST POPULAR</span>
              <div className="flex flex-col gap-1.5">
                <span className="font-display text-xl font-extrabold text-lime">Pro</span>
                <span className="text-sm text-muted">For creators posting daily.</span>
              </div>
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1"><span className="font-display text-[40px] font-extrabold leading-none text-white sm:text-[52px]">{price.amount}</span><span className="text-sm text-muted">{price.per}</span></div>
              <ul className="flex flex-col gap-2.5 text-sm text-fg">
                <li className="flex items-center gap-2.5"><Check />200 generations a day</li>
                <li className="flex items-center gap-2.5"><Check />No watermark</li>
                <li className="flex items-center gap-2.5"><Check />Batch up to 10 links</li>
                <li className="flex items-center gap-2.5"><Check />CSV export + priority</li>
              </ul>
              <button onClick={() => handleUpgrade(price.plan)} className="btn-lime mt-auto h-12">
                {isPro ? 'You’re on Pro' : 'Upgrade to Pro'}{!isPro && <Arrow />}
              </button>
              <span className="text-center text-xs text-muted">Cancel anytime · Secure checkout via Stripe</span>
            </article>
          </div>
          <p className="text-center text-xs text-muted">
            {billingEmail
              ? <>Purchases are linked to <span className="text-soft">{billingEmail}</span>. Create an account (or log in) with this email to keep them on other devices.</>
              : <>Already paid? Open your purchase confirmation link on this device, or log in to the account you linked after buying.</>}
          </p>
          <ReferralCard />
        </section>
      </main>

      {modalBlock}
      <footer className="relative border-t border-[#1E1E29] bg-[#0D0D14] pb-24 md:pb-0">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-7 text-[13px] text-muted">
          <span className="flex items-center gap-2"><EasterEgg onUnlocked={() => refreshBilling()}><span className="grid h-[22px] w-[22px] place-items-center rounded-md bg-lime"><Bolt size={13} /></span></EasterEgg>Viral AI Clipper © {new Date().getFullYear()}</span>
          <span className="flex flex-wrap gap-x-5 gap-y-2"><a href="/terms" className="hover:text-fg">Terms</a><a href="/privacy" className="hover:text-fg">Privacy</a><a href="/dmca" className="hover:text-fg">DMCA</a><a href="/feedback" className="hover:text-fg">Feedback</a><a href="/free-ai-clip-maker" className="hover:text-fg">Guides</a><a href="/opus-clip-alternative" className="hover:text-fg">Compare</a><a href="/connectors" className="hover:text-fg">Connections</a><a href="/tools" className="hover:text-fg">AI Tools</a><a href="/assets" className="hover:text-fg">My Assets</a><a href="/channel" className="hover:text-fg">Channel</a><a href="/api/youtube/start?next=/" className="hover:text-fg">Connect YouTube</a><a href="mailto:support@viralaiclipper.com" className="hover:text-fg">Support</a></span>
        </div>
      </footer>

      <SpinWheel onWon={() => refreshBilling()} onUpgrade={() => setShowPricing(true)} />

      {/* Sticky mobile CTA */}
      {!isPro && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-line bg-ink/95 p-3 backdrop-blur md:hidden">
          <button onClick={() => setShowPricing(true)} className="btn-lime h-11 w-full text-sm">
            Upgrade to Pro
          </button>
        </div>
      )}
    </div>
  );
}


export default function Home({ studio = false }) {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-ink text-muted">Loading…</div>}>
      <HomeInner studio={studio === true} />
    </Suspense>
  );
}


function ProgressDock({ label, step }) {
  const [min, setMin] = useState(false);
  const pct = Math.min(100, (step + 1) * 20);
  if (min) {
    return (
      <button type="button" onClick={() => setMin(false)} aria-label="Show clipping progress"
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-line2 bg-surface/90 px-4 py-2.5 text-xs font-semibold text-white shadow-modal backdrop-blur">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-lime" />Clipping… {pct}%
      </button>
    );
  }
  return (
    <div role="status" aria-live="polite" className="fixed bottom-4 left-4 right-4 z-50 rounded-2xl border border-line2 bg-surface/85 p-5 shadow-modal backdrop-blur animate-fadeup sm:left-auto sm:w-[360px]">
      <div className="mb-3 flex items-center gap-3">
        <div className="h-3 w-3 animate-pulse rounded-full bg-lime" />
        <span className="text-sm font-semibold text-white">Clipping in progress</span>
        <button type="button" onClick={() => setMin(true)} aria-label="Minimize" className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-soft hover:bg-ink hover:text-white">–</button>
      </div>
      <p className="mb-3 text-sm text-soft">{label || 'Working…'}</p>
      <div className="mb-3 h-2 overflow-hidden rounded-full bg-ink">
        <div className="h-full bg-lime transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <ul className="space-y-1.5 text-xs">
        {['Downloading video', 'Analyzing audio', 'Scoring moments', 'Cutting clips', 'Ready'].map((l, i) => (
          <li key={l} className={`flex items-center gap-2 ${i <= step ? 'text-lime' : 'text-muted'}`}>
            <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${i <= step ? 'bg-lime text-ink' : 'bg-ink text-muted'}`}>{i < step ? '✓' : i + 1}</span>{l}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-muted">You can switch apps or leave — clipping keeps running on our server for up to an hour. Come back to this page and your clips appear. Batches: keep the page open so the next link can start.</p>
    </div>
  );
}
