// Residential proxy for the YouTube *fallback* path only. Used when the hosted
// download API fails or unproxied yt-dlp hits a YouTube block (sign-in / bot
// check / 403 / 429). Do not send this URL to RenderIO or write it to logs.
import { spawn } from 'child_process';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import { put } from '@vercel/blob';
import { kvEnabled, kvCommand, kvPipeline } from './kv';
import { ffmpegPath } from './ffmpegbin';
import { ProxyAgent, fetch as uFetch } from 'undici';

export const PROXY_BUDGET_BYTES = Number(process.env.YT_PROXY_BUDGET_GB || 9) * 1e9;
const CYCLE_DAY = Math.min(28, Math.max(1, Number(process.env.YT_PROXY_CYCLE_DAY || 22)));
const TTL_SEC = 40 * 24 * 3600;
const STICKY_PORT_START = 10001;
const STICKY_PORT_COUNT = 10;
const BINARY_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';

export function proxyConfigured() {
  return !!(process.env.YT_PROXY_URL || process.env.YTDLP_PROXY);
}

export function rawProxyUrl() {
  return String(process.env.YT_PROXY_URL || process.env.YTDLP_PROXY || '').trim();
}

export function proxyCycleId(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(x => [x.type, x.value]));
  let y = +p.year, m = +p.month;
  if (+p.day < CYCLE_DAY) { m -= 1; if (m === 0) { m = 12; y -= 1; } }
  return `${y}-${String(m).padStart(2, '0')}-${String(CYCLE_DAY).padStart(2, '0')}`;
}

function usageKeys(cycle = proxyCycleId()) {
  return {
    attempts: `yt:proxy:${cycle}:attempts`,
    successes: `yt:proxy:${cycle}:successes`,
    bytes: `yt:proxy:${cycle}:bytes`,
  };
}

export function redactProxy(s, proxyUrl = rawProxyUrl()) {
  let out = String(s ?? '');
  const urls = [proxyUrl, rawProxyUrl()].filter(Boolean);
  for (const p of urls) {
    out = out.split(p).join('[proxy]');
    try {
      const u = new URL(p);
      if (u.password) out = out.split(decodeURIComponent(u.password)).join('***').split(u.password).join('***');
      if (u.username) out = out.split(decodeURIComponent(u.username)).join('***').split(u.username).join('***');
      const hostport = u.port ? `${u.hostname}:${u.port}` : u.hostname;
      if (hostport) out = out.split(hostport).join('[proxy-host]');
      if (u.hostname) out = out.split(u.hostname).join('[proxy-host]');
    } catch {}
  }
  out = out.replace(/https?:\/\/[^/@\s]+:[^/@\s]+@/gi, 'http://***:***@');
  return out;
}

export function isYoutubeBlockError(err) {
  const m = String(err?.message || err || '').toLowerCase();
  return /sign in to confirm|confirm you.re not a bot|confirm you are not a bot|not a bot|use --cookies|cookies?.*(sign|login)|http error 403|\bstatus code 403\b|\b403 forbidden\b|\b429\b|too many requests|source_rate_limited|bot check|please sign in|login_required|login required|forbidden\b|unable to extract.*(player|n-sig)|this video is not available|video unavailable.*bot/.test(m);
}

export function isProxyBudgetError(err) {
  return !!(err && (err.code === 'proxy_budget' || err.proxyBudget));
}

export function rotateProxyUrl(raw, salt = '') {
  if (!raw) return '';
  const u = new URL(raw);
  let n = 0;
  const s = String(salt || '0');
  for (let i = 0; i < s.length; i++) n = (n * 33 + s.charCodeAt(i)) >>> 0;
  u.port = String(STICKY_PORT_START + (n % STICKY_PORT_COUNT));
  return u.toString();
}

export function sectionSpec(startSec, endSec) {
  if (!(Number(endSec) > 0)) return null;
  const a = Math.max(0, Math.floor(Number(startSec) || 0));
  const b = Math.floor(Number(endSec));
  if (b <= a) return null;
  const fmt = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };
  return `*${fmt(a)}-${fmt(b)}`;
}

// Prefer a muxed mp4 when it exists, then AVC+AAC (easy to cut), capped at height
// (720 default, 1080 max) so a fallback download stays small.
export function formatSelector(height) {
  const h = Math.min(1080, Math.max(144, Math.round(Number(height) || 720)));
  return `b[height<=${h}][ext=mp4]/bv*[height<=${h}][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=${h}][ext=mp4]+ba[ext=m4a]/b[height<=${h}]/bv*[height<=${h}]+ba/b`;
}

export function buildYtDlpArgs({ outFile, videoUrl, proxyUrl, height = 720, startSec = 0, endSec = null, ffmpeg = '' } = {}) {
  const args = ['--no-playlist', '--no-progress', '--retries', '2', '--no-mtime', '--no-warnings', '--js-runtimes', 'node'];
  if (proxyUrl) args.push('--proxy', proxyUrl);
  if (ffmpeg) args.push('--ffmpeg-location', ffmpeg);
  args.push('-f', formatSelector(height), '--merge-output-format', 'mp4');
  const section = sectionSpec(startSec, endSec);
  if (section) args.push('--download-sections', section, '--force-keyframes-at-cuts');
  args.push('-o', outFile, videoUrl);
  return args;
}

export async function getProxyUsage() {
  const cycle = proxyCycleId();
  const capBytes = PROXY_BUDGET_BYTES;
  const out = { cycle, configured: proxyConfigured(), attempts: 0, successes: 0, bytes: 0, mb: 0, capBytes, capMb: Math.round(capBytes / 1e6), remainingMb: Math.round(capBytes / 1e6), exhausted: false };
  if (kvEnabled) {
    const k = usageKeys(cycle);
    try {
      const r = await kvPipeline([['GET', k.attempts], ['GET', k.successes], ['GET', k.bytes]]);
      out.attempts = Number(r?.[0] || 0) || 0;
      out.successes = Number(r?.[1] || 0) || 0;
      out.bytes = Number(r?.[2] || 0) || 0;
    } catch {}
  }
  out.mb = Math.round(out.bytes / 1e6);
  out.remainingMb = Math.max(0, Math.round((capBytes - out.bytes) / 1e6));
  out.exhausted = out.bytes >= capBytes;
  return out;
}

export async function proxyAllowed() {
  if (!proxyConfigured()) return false;
  const u = await getProxyUsage();
  return !u.exhausted;
}

export async function recordProxyAttempt() {
  if (!kvEnabled) return;
  const k = usageKeys();
  try {
    await kvPipeline([['INCR', k.attempts], ['EXPIRE', k.attempts, String(TTL_SEC)]]);
  } catch { try { await kvCommand(['INCR', k.attempts]); } catch {} }
}

export async function recordProxySuccess(bytes = 0) {
  if (!kvEnabled) return;
  const k = usageKeys();
  const cmds = [['INCR', k.successes], ['EXPIRE', k.successes, String(TTL_SEC)], ['EXPIRE', k.bytes, String(TTL_SEC)]];
  if (bytes > 0) cmds.splice(1, 0, ['INCRBY', k.bytes, String(Math.max(0, Math.round(bytes)))]);
  try { await kvPipeline(cmds); } catch {}
}

export async function recordProxyBytes(bytes) {
  if (!kvEnabled || !(bytes > 0)) return;
  const k = usageKeys();
  try { await kvPipeline([['INCRBY', k.bytes, String(Math.max(0, Math.round(bytes)))], ['EXPIRE', k.bytes, String(TTL_SEC)]]); } catch {}
}

// Deterministic sticky URL for one job so every HLS/player/segment request
// exits through the same residential IP (googlevideo binds URLs to that IP).
export function stickyProxyUrl(jobId = '') {
  const raw = rawProxyUrl();
  return raw ? rotateProxyUrl(raw, String(jobId || 'live')) : '';
}

const proxyAgents = new Map();
function agentFor(proxyUrl) {
  let a = proxyAgents.get(proxyUrl);
  if (!a) {
    a = new ProxyAgent(proxyUrl);
    proxyAgents.set(proxyUrl, a);
  }
  return a;
}

// fetch() through the residential proxy. Returns a Web Response. Never logs proxyUrl.
export async function proxyFetch(input, init = {}, { proxyUrl, timeoutMs = 20000 } = {}) {
  if (!proxyUrl) throw new Error('proxy not configured');
  const ctrl = new AbortController();
  const outer = init.signal;
  if (outer) {
    if (outer.aborted) { ctrl.abort(); }
    else outer.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
  const t = setTimeout(() => ctrl.abort(), Math.max(1000, timeoutMs || 20000));
  try {
    const headers = new Headers(init.headers || {});
    const res = await uFetch(String(input), {
      method: init.method || 'GET',
      headers,
      body: init.body,
      signal: ctrl.signal,
      dispatcher: agentFor(proxyUrl),
      redirect: init.redirect || 'follow',
    });
    return res;
  } catch (e) {
    throw new Error(redactProxy(e?.message || e, proxyUrl));
  } finally {
    clearTimeout(t);
  }
}

export async function proxyFetchText(input, init = {}, opts = {}) {
  const res = await proxyFetch(input, init, opts);
  const text = await res.text().catch(() => '');
  const bytes = Buffer.byteLength(text);
  if (bytes) await recordProxyBytes(bytes);
  return { ok: res.ok, status: res.status, text, bytes };
}

// Lowest video rendition (capped at 360p) plus audio-only when the master
// playlist has it — live proxy traffic has to stay small.
export function pickLiveVariants(variants) {
  const video = (variants || []).filter(v => v.height > 0).sort((a, b) => a.height - b.height);
  const low = video.find(v => v.height >= 240 && v.height <= 360) || video.find(v => v.height <= 360) || video[0];
  const audio = (variants || []).find(v => /audio/i.test(v.name || '') || v.height === 0) || low;
  return { videoUrl: low?.url || '', audioUrl: audio?.url || low?.url || '', height: low?.height || 0 };
}


export function ytdlpBinaryCandidates() {
  const cands = [];
  if (process.env.YT_DLP_PATH) cands.push(process.env.YT_DLP_PATH);
  cands.push(path.join(process.cwd(), 'bin', 'yt-dlp'));
  cands.push(path.join(process.cwd(), 'bin', 'yt-dlp_linux'));
  cands.push('/var/task/bin/yt-dlp');
  cands.push(path.join(os.tmpdir(), 'yt-dlp_linux'));
  cands.push('yt-dlp');
  return cands;
}

function isExecutable(p) {
  if (!p || p === 'yt-dlp') return false;
  try { fs.accessSync(p, fs.constants.X_OK); return true; } catch {}
  try { if (fs.existsSync(p)) { fs.chmodSync(p, 0o755); return true; } } catch {}
  return false;
}

export async function ensureYtDlp({ download = downloadBinary } = {}) {
  for (const p of ytdlpBinaryCandidates()) {
    if (p === 'yt-dlp') {
      try { return await whichOnPath('yt-dlp'); } catch {}
      continue;
    }
    if (isExecutable(p)) return p;
  }
  const dest = path.join(os.tmpdir(), 'yt-dlp_linux');
  await download(dest);
  try { fs.chmodSync(dest, 0o755); } catch {}
  if (!isExecutable(dest)) throw new Error('yt-dlp binary missing');
  return dest;
}

function whichOnPath(cmd) {
  return new Promise((resolve, reject) => {
    const child = spawn('which', [cmd], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.on('close', (code) => {
      const p = out.trim().split('\n')[0];
      if (code === 0 && p) resolve(p);
      else reject(new Error('not on PATH'));
    });
    child.on('error', reject);
  });
}

async function downloadBinary(dest) {
  const res = await fetch(BINARY_URL, { redirect: 'follow', cache: 'no-store' });
  if (!res.ok) throw new Error('yt-dlp download ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1e6) throw new Error('yt-dlp download too small');
  const tmp = dest + '.part';
  await fsp.writeFile(tmp, buf, { mode: 0o755 });
  await fsp.rename(tmp, dest);
}

function runYtDlp(bin, args, timeoutMs, proxyUrl, { maxStdout = 8_000_000, maxStderr = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const add = (dest, d, max, keepTail) => {
      dest += d;
      if (dest.length > max) dest = keepTail ? dest.slice(-Math.floor(max * 0.6)) : dest.slice(0, max);
      return dest;
    };
    child.stdout.on('data', d => { stdout = add(stdout, d, maxStdout, false); });
    child.stderr.on('data', d => { stderr = add(stderr, d, maxStderr, true); });
    const t = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      const e = new Error('yt-dlp timeout');
      reject(e);
    }, Math.max(5000, timeoutMs || 120000));
    child.on('error', (e) => { clearTimeout(t); reject(new Error(redactProxy(e.message, proxyUrl))); });
    child.on('close', (code) => {
      clearTimeout(t);
      const combined = redactProxy(`${stderr}\n${stdout}`, proxyUrl);
      if (code === 0) return resolve({ stdout, stderr });
      const e = new Error((`yt-dlp exited ${code}: ` + combined).trim().slice(0, 400));
      e.blocked = isYoutubeBlockError(combined);
      reject(e);
    });
  });
}

async function defaultUpload(file) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error('blob token missing');
  const blob = await put(`sources/proxy_${Date.now()}.mp4`, fs.createReadStream(file), { access: 'private', contentType: 'video/mp4', addRandomSuffix: true, multipart: true });
  return blob.url;
}


export async function ytDlpJson(videoUrl, { jobId = '', timeoutMs = 60000, run = runYtDlp, ensure = ensureYtDlp } = {}) {
  const proxy = stickyProxyUrl(jobId) || rawProxyUrl();
  const bin = await ensure();
  const args = ['-J', '--no-playlist', '--no-warnings', '--no-progress', '--js-runtimes', 'node'];
  if (proxy) args.push('--proxy', proxy);
  const { stdout } = await run(bin, args.concat([videoUrl]), timeoutMs, proxy);
  try { return JSON.parse(stdout); } catch { throw new Error('yt-dlp returned no JSON'); }
}

export function pickLiveFormatsFromYtDlp(j) {
  const formats = j?.formats || [];
  const isM3u8 = (f) => /m3u8/.test(String(f.protocol || f.url || ''));
  const videos = formats.filter(f => Number(f.height) > 0 && isM3u8(f)).sort((a, b) => a.height - b.height);
  const low = videos.find(v => v.height >= 240 && v.height <= 360) || videos.find(v => v.height <= 360) || videos[0];
  const audio = formats.find(f => (f.vcodec === 'none' || !f.height) && isM3u8(f)) || low;
  return { videoUrl: low?.url || '', audioUrl: audio?.url || low?.url || '', height: low?.height || 0 };
}

// Download a YouTube URL through the residential proxy into `dir`, upload to
// Blob, and return { url, bytes, file }. Throws .proxyBudget when the monthly
// estimate is exhausted. Never logs the proxy URL.
export async function downloadViaProxyFallback(videoUrl, {
  dir, height = 720, startSec = 0, endSec = null, jobId = '', timeoutMs = 120000,
  run = runYtDlp, upload = defaultUpload, ensure = ensureYtDlp,
} = {}) {
  const proxy = rawProxyUrl();
  if (!proxy) {
    const e = new Error('proxy not configured');
    e.noProxy = true;
    throw e;
  }
  if (!(await proxyAllowed())) {
    const e = new Error('proxy monthly budget reached');
    e.code = 'proxy_budget';
    e.proxyBudget = true;
    throw e;
  }
  const workDir = dir || await fsp.mkdtemp(path.join(os.tmpdir(), 'ytp-'));
  await fsp.mkdir(workDir, { recursive: true });
  const outFile = path.join(workDir, `proxy-${Date.now()}.mp4`);
  const bin = await ensure();
  const args = buildYtDlpArgs({
    outFile, videoUrl, proxyUrl: rotateProxyUrl(proxy, jobId || String(Date.now())),
    height, startSec, endSec, ffmpeg: ffmpegPath() || '',
  });
  await recordProxyAttempt();
  try {
    await run(bin, args, timeoutMs, proxy);
    const st = await fsp.stat(outFile);
    if (!st.size) throw new Error('yt-dlp wrote an empty file');
    await recordProxySuccess(st.size);
    const url = await upload(outFile);
    return { url, bytes: st.size, file: outFile };
  } catch (e) {
    const err = e?.proxyBudget || e?.noProxy ? e : new Error(redactProxy(e?.message || e, proxy));
    if (e?.blocked) err.blocked = true;
    throw err;
  }
}
