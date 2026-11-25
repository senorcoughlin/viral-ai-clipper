// Shared RenderIO + caption rendering helpers (used by /api/generate and /api/rerender).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ffmpegPath } from './ffmpegbin';
import { meterRenderio } from './metrics';
import { reserveRenderio } from './capacity';
import { kvGetJson, kvSetJson } from './kv';

const exec = promisify(execFile);
const FONT_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fonts/NotoSans-Regular.ttf');
const RIO_DOWN_KEY = 'rio:sub:down';
const RIO_DOWN_SEC = 15 * 60;

export const defaultFontFile = () => FONT_FILE;

// Card declined / subscription paused / invalid key: RenderIO will not accept work until paid.
export function isRenderioUnavailable(err) {
  const m = String(err?.message || err || '');
  return /submit 401\b|submit 403\b|active subscription required|subscribe to a plan|invalid api key|payment failed|access to pro is paused/i.test(m);
}

export async function renderioIsDown() {
  try {
    const j = await kvGetJson(RIO_DOWN_KEY);
    return !!(j && Number(j.until) > Date.now());
  } catch { return false; }
}

export async function markRenderioDown(reason = 'subscription') {
  console.warn('renderio unavailable; falling back to local ffmpeg', String(reason).slice(0, 160));
  try { await kvSetJson(RIO_DOWN_KEY, { until: Date.now() + RIO_DOWN_SEC * 1000, reason: String(reason).slice(0, 80) }, RIO_DOWN_SEC); } catch {}
}

export function applyFontfile(filter, font = FONT_FILE) {
  if (!font || !filter) return filter;
  const esc = String(font).replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
  return String(filter).replace(/drawtext=/g, `drawtext=fontfile='${esc}':`);
}

// Split a RenderIO ffmpeg_command string into argv (filters are in double quotes).
export function splitFfmpegArgs(command) {
  const out = [];
  let cur = '', q = null;
  for (const c of String(command || '')) {
    if (q) {
      if (c === q) q = null;
      else cur += c;
    } else if (c === '"' || c === "'") q = c;
    else if (/\s/.test(c)) { if (cur) { out.push(cur); cur = ''; } }
    else cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

// Lets ffmpeg follow https segment URLs inside an HLS playlist even if it was saved locally.
export const HLS_FLAGS = '-protocol_whitelist file,http,https,tcp,tls,crypto -allowed_extensions ALL ';

export function captionText(s) {
  return String(s || 'Watch this')
    .replace(/[\\'":%]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 52) || 'Watch this';
}

// Caption look per style. Hormozi = big yellow; podcast = clean white; default = bold white.
// Brand kit: caption presets a user can save. Only whitelisted values reach ffmpeg.
export const BRAND_COLORS = { white: 'white', yellow: 'yellow', lime: '0xC6FF3D', cyan: '0x3DE0FF', pink: '0xFF4D9A', orange: '0xFFB64D' };
const BRAND_SIZES = { s: 40, m: 52, l: 64 };
const BRAND_Y = { top: 'h*0.18', middle: '(h-text_h)/2', bottom: 'h-220' };
const MARK_POS = ['tl', 'tr', 'bl', 'br'];
export const DEFAULT_LOGO_URL = 'https://viralaiclipper.com/brand/logo.png';
// Branding marks (logo image + viralaiclipper.com text) in one of 4 corners.
const LOGO_H = { s: 28, m: 40, l: 56 };
const WM_SIZE = { s: 20, m: 28, l: 38 };
function markXY(pos, wExpr, hExpr, W, H, pad = 24, yShift = 0) {
  const x = pos[1] === 'l' ? `${pad}` : `${W}-${wExpr}-${pad}`;
  const y = pos[0] === 't' ? `${pad + yShift}` : `${H}-${hExpr}-${60 + yShift}`;
  return { x, y };
}
export function sanitizeBrand(b) {
  if (!b || typeof b !== 'object') return null;
  const out = {};
  if (BRAND_COLORS[b.color] || /^#[0-9a-fA-F]{6}$/.test(String(b.color || ''))) out.color = b.color;
  if (BRAND_SIZES[b.size]) out.size = b.size;
  if (BRAND_Y[b.position]) out.position = b.position;
  if (typeof b.upper === 'boolean') out.upper = b.upper;
  for (const k of ['logo', 'wm']) {
    const m = b[k];
    if (!m || typeof m !== 'object') continue;
    out[k] = {
      on: !!m.on,
      pos: MARK_POS.includes(m.pos) ? m.pos : (k === 'logo' ? 'tl' : 'br'),
      size: ['s', 'm', 'l'].includes(m.size) ? m.size : 'm',
      opacity: Math.max(40, Math.min(100, Math.round(Number(m.opacity) || 85))),
    };
  }
  if (typeof b.logoUrl === 'string' && /^https:\/\/[\w.-]+\.blob\.vercel-storage\.com\/logos\/[\w.\-/]+\.(png|jpe?g|webp)$/i.test(b.logoUrl)) out.logoUrl = b.logoUrl;
  if (b.customLogo === true && out.logoUrl) out.customLogo = true;
  return Object.keys(out).length ? out : null;
}

// ---------- Pro editing options (all plain ffmpeg filters; validated before they reach a command) ----------
export const PRO_GRADES = {
  vivid: 'eq=saturation=1.35:contrast=1.06',
  warm: 'colorbalance=rs=0.08:gs=0.02:bs=-0.08,eq=saturation=1.1',
  cool: 'colorbalance=rs=-0.06:bs=0.08',
  bright: 'eq=brightness=0.06:contrast=1.04',
  cinematic: 'eq=contrast=1.12:saturation=0.85,vignette=PI/5',
  vintage: 'curves=preset=vintage',
  bw: 'hue=s=0,eq=contrast=1.1',
};
export const PRO_SPEEDS = [0.75, 1.25, 1.5];
export const PRO_CAP_STYLES = ['boxed', 'shadow', 'outline'];
// Whitelist a client's Pro options. Returns null when nothing Pro was asked for.
export function sanitizePro(p) {
  if (!p || typeof p !== 'object') return null;
  const out = {};
  if (PRO_GRADES[p.grade]) out.grade = p.grade;
  if (PRO_SPEEDS.includes(Number(p.speed))) out.speed = Number(p.speed);
  if (p.loud === true) out.loud = true;
  if (p.fade === true) out.fade = true;
  if (PRO_CAP_STYLES.includes(p.capStyle)) out.capStyle = p.capStyle;
  if ([1, 2].includes(Number(p.wordsPer))) out.wordsPer = Number(p.wordsPer);
  if (BRAND_COLORS[p.accent] || /^#[0-9a-fA-F]{6}$/.test(String(p.accent || ''))) out.accent = p.accent;
  const wt = String(p.wmText || '').replace(/[^\w@.\- ]/g, '').trim().slice(0, 30);
  if (wt) out.wmText = wt;
  if (p.noWatermark === true) out.noWatermark = true;
  return Object.keys(out).length ? out : null;
}
const colorOf = (c) => BRAND_COLORS[c] || '0x' + String(c).slice(1).toUpperCase();

// Audio filter chain for the Pro options (speed, loudness, fades). outLen is the output length.
export function proAudio(pro, outLen) {
  if (!pro) return '';
  const f = [];
  if (pro.speed && pro.speed !== 1) f.push(`atempo=${pro.speed}`);
  if (pro.loud) f.push('loudnorm=I=-14:TP=-1.5:LRA=11');
  if (pro.fade && outLen > 2) f.push(`afade=t=in:d=0.3,afade=t=out:st=${(outLen - 0.4).toFixed(2)}:d=0.4`);
  return f.join(',');
}

export function captionLook(style, brand) {
  const base = baseLook(style);
  const b = sanitizeBrand(brand);
  if (!b) return base;
  return {
    ...base,
    ...(b.color ? { color: BRAND_COLORS[b.color] || '0x' + String(b.color).slice(1).toUpperCase() } : {}),
    ...(b.size ? { size: BRAND_SIZES[b.size] } : {}),
    ...(b.position ? { y: BRAND_Y[b.position] } : {}),
    ...(typeof b.upper === 'boolean' ? { upper: b.upper } : {}),
  };
}

function baseLook(style) {
  const s = String(style || '').toLowerCase();
  if (s === 'gameplay') return { size: 64, color: '0xC6FF3D', border: 8, y: 'h*0.62' };
  if (s.includes('hormozi') || s.includes('bold')) return { size: 60, color: 'yellow', border: 7, y: 'h-240' };
  if (s.includes('podcast') || s.includes('clean')) return { size: 42, color: 'white', border: 4, y: 'h-170' };
  return { size: 52, color: 'white', border: 6, y: 'h-200' };
}

// Word-synced captions from real timings: groups spoken words into 2-3 word
// chunks that pop on screen the moment they are said. Falls back to spreading
// the hook across the clip when there is no timed transcript.
export function wordFilters(caption, length, timedWords, style, brand, long = false, pro = null) {
  const look0 = captionLook(style, brand);
  // Long clips group more words per caption, so shrink the text to keep it on screen.
  const look = long ? { ...look0, size: Math.round(look0.size * 0.72) } : look0;
  // Pro caption looks: a box behind the text, a drop shadow or a thicker outline, and an accent
  // color on every other caption.
  const cs = pro?.capStyle;
  const extra = cs === 'boxed' ? ':box=1:boxcolor=black@0.6:boxborderw=14' : cs === 'shadow' ? ':shadowx=4:shadowy=4:shadowcolor=black@0.85' : '';
  const border = cs === 'boxed' ? 0 : cs === 'outline' ? Math.round(look.border * 1.7) : look.border;
  const accent = pro?.accent ? colorOf(pro.accent) : null;
  let n = 0;
  const draw = (text, a, b) => {
    const color = accent && (n++ % 2 === 1) ? accent : look.color;
    return `drawtext=text='${look.upper === false ? captionText(text) : captionText(text).toUpperCase()}':fontsize=${look.size}:fontcolor=${color}:borderw=${border}:bordercolor=black${extra}:x=(w-text_w)/2:y=${look.y}:enable='between(t,${a.toFixed(2)},${b.toFixed(2)})'`;
  };
  const maxWords = pro?.wordsPer || (long ? 5 : 3);

  if (Array.isArray(timedWords) && timedWords.length >= 3) {
    const chunks = [];
    let cur = null;
    for (const w of timedWords) {
      const clean = w.w.replace(/'/g, '\u2019').replace(/[\\":%]/g, '');
      if (!clean) continue;
      const endsSentence = /[.!?]$/.test(clean);
      if (!cur) cur = { text: clean, a: w.a, b: w.b, n: 1 };
      else if (cur.n < maxWords && w.a - cur.b < 0.6 && !/[.!?,]$/.test(cur.text)) { cur.text += ' ' + clean; cur.b = w.b; cur.n++; }
      else { chunks.push(cur); cur = { text: clean, a: w.a, b: w.b, n: 1 }; }
      if (endsSentence) { chunks.push(cur); cur = null; }
    }
    if (cur) chunks.push(cur);
    // Hold each chunk until the next one starts so there are no flickering gaps.
    return chunks.slice(0, long ? 1000 : 120).map((c, i) => draw(c.text, c.a, Math.max(c.b, (chunks[i + 1]?.a ?? c.b + 0.4) - 0.02))).join(',');
  }

  const words = captionText(caption).split(' ').filter(Boolean).slice(0, 12);
  if (!words.length) return '';
  const dur = Math.max(Number(length) || 15, 5);
  const step = dur / words.length;
  return words.map((w, i) => draw(w, i * step, (i + 1) * step)).join(',');
}

export function styleCaption(caption, style) {
  const text = captionText(caption);
  const s = String(style || '').toLowerCase();
  if (s.includes('hormozi') || s.includes('bold')) {
    return `drawtext=text='${text}':fontsize=52:fontcolor=yellow:borderw=6:bordercolor=black:x=(w-text_w)/2:y=h-200`;
  }
  if (s.includes('podcast') || s.includes('clean')) {
    return `drawtext=text='${text}':fontsize=36:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h-140`;
  }
  return `drawtext=text='${text}':fontsize=44:fontcolor=white:borderw=5:bordercolor=black:x=(w-text_w)/2:y=h-160`;
}

// One encode per clip, so spend the bits there: x264 High profile, CRF 20 (was the default 23,
// and CRF 27 + ultrafast + 96k audio for long clips), capped so 30s Shorts stay a sane size,
// 192k AAC at 48 kHz. Long (>90s) clips use a faster preset to stay inside the time limit.
export function encodeArgs(long) {
  return long
    ? '-c:v libx264 -preset superfast -crf 22 -profile:v high -maxrate 4M -bufsize 8M -pix_fmt yuv420p -c:a aac -b:a 160k -ar 48000 -ac 2'
    : '-c:v libx264 -preset veryfast -crf 20 -profile:v high -maxrate 6M -bufsize 12M -pix_fmt yuv420p -c:a aac -b:a 192k -ar 48000 -ac 2';
}

// Submit a RenderIO yt-dlp+ffmpeg job and wait for one named output file.
// Endpoint is picked from the body: input_files -> run-ffmpeg-command (direct media file,
// fast seeking), input_urls without ffmpeg -> ytdlp-download, else run-ytdlp-command.
export async function renderioRun(body, outKey, key, timeoutMs = 90000) {
  const endpoint = body.input_urls ? (body.ffmpeg_command ? 'run-ytdlp-command' : 'ytdlp-download') : 'run-ffmpeg-command';
  const doSubmit = () => fetch(`https://renderio.dev/api/v1/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
    body: JSON.stringify(body),
  });
  // Counts against the monthly RenderIO cap; throws CapacityError when full.
  const release = await reserveRenderio();
  let submit = await doSubmit().catch(() => null);
  if (!submit || submit.status === 429 || submit.status >= 500) {
    await new Promise(r => setTimeout(r, 1500));
    submit = await doSubmit().catch(() => null);
  }
  if (!submit || !submit.ok) {
    await release(); // rejected submits didn't use a command
    if (!submit) throw new Error('renderio unreachable');
    const t = await submit.text();
    throw new Error('renderio submit ' + submit.status + ' ' + t.slice(0, 160));
  }
  const { command_id } = await submit.json();
  const t0 = Date.now();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 1000));
    const poll = await fetch('https://renderio.dev/api/v1/commands/' + command_id, { headers: { 'X-API-KEY': key } });
    const result = await poll.json().catch(() => ({}));
    if (result.status === 'SUCCESS') {
      const file = result.output_files?.[outKey];
      const out = file?.storage_url || file?.external_uri;
      if (!out) throw new Error('renderio no file');
      meterRenderio(outKey, Date.now() - t0, file);
      return out;
    }
    if (result.status === 'FAILED') { meterRenderio(outKey + ':failed', Date.now() - t0, null); throw new Error(result.error_message || 'renderio failed'); }
  }
  throw new Error('renderio timeout');
}

// Whisper fallback when YouTube captions can't be fetched (YouTube blocks Vercel IPs):
// RenderIO pulls just the audio (mono 16 kHz, 32 kbps mp3 => ~14 MB/hour), we download
// it and send it to Groq Whisper for word timestamps. Capped at AUDIO_CAP_SEC so the
// file stays under Groq's 25 MB upload limit.
export function cutJob(url, start, length, caption, vertical, opts = {}) {
  // Pro: speed changes the output length; captions, progress bar and fades follow the output timeline.
  const pro = opts.pro || null;
  const sp = pro?.speed && pro.speed !== 1 ? pro.speed : 1;
  const srcLen = Number(length) || 30;
  const outLen = srcLen / sp;
  if (sp !== 1 && Array.isArray(opts.timedWords)) opts = { ...opts, timedWords: opts.timedWords.map(w => ({ ...w, a: w.a / sp, b: w.b / sp })) };
  // Face-biased crop: prefer the upper-center of the frame where speakers usually sit.
  let frame = opts.crop || (vertical
    ? 'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280:x=(iw-720)/2:y=(ih-1280)/5'
    : 'scale=1280:-2');
  // Gameplay pack: punch in 15% so the action fills the frame.
  if (opts.pack === 'gameplay' || opts.style === 'gameplay') frame = `${frame},crop=trunc(iw/1.15/2)*2:trunc(ih/1.15/2)*2,scale=${vertical ? '720:1280' : '1280:-2'}`;
  // Studio extras: zoom/punch-in and background framing (blurred or black fill around the full frame).
  const zf = { punch: 1.15, tight: 1.3 }[opts.zoom] || 0;
  const zoomF = (w) => zf ? `,crop=trunc(iw/${zf}/2)*2:trunc(ih/${zf}/2)*2,scale=${w}` : '';
  if (vertical && opts.bg === 'blur') {
    frame = `split[zA][zB];[zA]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,boxblur=20:2[zbg];[zB]scale=720:-2${zoomF('720:-2')}[zfg];[zbg][zfg]overlay=(W-w)/2:(H-h)/2`;
  } else if (vertical && opts.bg === 'black') {
    frame = `scale=720:-2${zoomF('720:-2')},pad=720:1280:(ow-iw)/2:(oh-ih)/2:black`;
  } else if (zf) {
    frame = `${frame}${zoomF(vertical ? '720:1280' : '1280:-2')}`;
  }
  // Studio crop box (fractions of the composed frame), refit to the output size over a blurred fill.
  const uc = opts.userCrop;
  if (uc) {
    const [W, H] = vertical ? [720, 1280] : [1280, 720];
    const f = (v) => Number(v).toFixed(4);
    frame = `${frame},crop=trunc(iw*${f(uc.w)}/2)*2:trunc(ih*${f(uc.h)}/2)*2:trunc(iw*${f(uc.x)}):trunc(ih*${f(uc.y)}),split[ucA][ucB];[ucA]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=20:2[ucbg];[ucB]scale=${W}:${H}:force_original_aspect_ratio=decrease[ucfg];[ucbg][ucfg]overlay=(W-w)/2:(H-h)/2`;
  }
  if (sp !== 1) frame = `setpts=PTS/${sp},${frame}`;
  if (pro?.grade && PRO_GRADES[pro.grade]) frame = `${frame},${PRO_GRADES[pro.grade]}`;
  const styled = styleCaption(caption, opts.style);
  const words = opts.wordCaptions ? wordFilters(caption, outLen, opts.timedWords, opts.style, opts.brand, !!opts.long, pro) : '';
  // No spoken words and no hook text (e.g. subtitles off, or an unscored clip): burn nothing.
  const hasText = !opts.noText && (!!String(caption || '').trim() || (Array.isArray(opts.timedWords) && opts.timedWords.length >= 3));
  const vf = !hasText ? frame : words ? `${frame},${words}` : `${frame},${styled}`;
  // Transformative extras (same single RenderIO command): hook text pinned at the top,
  // and an optional facecam/reaction video in the top-right corner.
  const hook = captionText(opts.hook || '').replace(/'/g, '\u2019');
  let hookF = opts.hook && String(opts.hook).trim()
    ? `,drawtext=text='${hook}':fontsize=${Math.max(22, Math.min(vertical ? 46 : 40, Math.floor((vertical ? 640 : 1180) / (0.56 * Math.max(1, hook.length)))))}:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=14:x=(w-text_w)/2:y=${vertical ? 'h*0.07' : 'h*0.05'}`
    : '';
  // Free-plan watermark: small, low-opacity, top-left (clear of captions, hook and facecam).
  const br = opts.brand || {};
  const logo = br.logo?.on ? br.logo : null;
  const logoUrl = logo ? (br.customLogo && opts.logoUrl ? opts.logoUrl : DEFAULT_LOGO_URL) : null;
  const scaleK = vertical ? 1 : 0.9;
  const logoH = logo ? Math.round(LOGO_H[logo.size] * scaleK) : 0;
  // Watermark: user's brand-kit choice wins; otherwise free plans get it on by default.
  // Free plans always keep it (a brand-kit "off" can't remove it); Pro can turn it off or use their own text.
  const wmDefault = { pos: 'tl', size: 's', opacity: 50 };
  let wm = br.wm ? (br.wm.on ? br.wm : null) : (opts.watermark ? wmDefault : null);
  if (opts.watermark && !wm) wm = wmDefault;
  if (!opts.watermark && pro?.noWatermark) wm = null;
  if (!opts.watermark && pro?.wmText && !pro.noWatermark) wm = wm || { pos: 'br', size: 'm', opacity: 85 };
  const wmText = !opts.watermark && pro?.wmText ? captionText(pro.wmText).replace(/'/g, '\u2019') : 'viralaiclipper.com';
  let wmF = '';
  if (wm) {
    const shift = logo && logo.pos === wm.pos ? logoH + 10 : 0;
    const { x, y } = markXY(wm.pos, 'tw', 'th', 'w', 'h', 24, shift);
    wmF = `,drawtext=text='${wmText}':fontsize=${Math.round(WM_SIZE[wm.size] * scaleK)}:fontcolor=white@${(wm.opacity / 100).toFixed(2)}:borderw=2:bordercolor=black@${(wm.opacity / 200).toFixed(2)}:x=${x}:y=${y}`;
  }
  // Source credit ("Clip from @streamer"), bottom-left above the progress bar, and an optional progress bar.
  const credit = captionText(String(opts.credit || '').slice(0, 40)).replace(/'/g, '\u2019');
  const creditF = String(opts.credit || '').trim() ? `,drawtext=text='${credit}':fontsize=${vertical ? 26 : 22}:fontcolor=white@0.85:borderw=2:bordercolor=black@0.6:x=24:y=h-th-${opts.progress ? 40 : 28}` : '';
  const barF = opts.progress ? `,drawbox=x=0:y=ih-12:w='iw*min(1,t/${Math.max(1, outLen).toFixed(2)})':h=12:color=0xC6FF3D@0.9:t=fill` : '';
  const fadeF = pro?.fade && outLen > 2 ? `,fade=t=in:d=0.3,fade=t=out:st=${(outLen - 0.4).toFixed(2)}:d=0.4` : '';
  wmF = opts.noText ? (fadeF || '') : `${creditF}${barF}${wmF}${fadeF}`;
  if (opts.noText) hookF = '';
  const af = proAudio(pro, outLen);
  // Transcript cuts: keep only these [a,b] ranges (clip-relative seconds) and join them.
  const keep = Array.isArray(opts.keep) && opts.keep.length ? opts.keep : null;
  if (opts.overlayUrl || logoUrl || keep) {
    const camW = vertical ? 260 : 320;
    const inputs = { in_video: url }; let logoInput = null;
    let args = `-i {{in_video}}`;
    let fc; let audioMap = '-map 0:a:0?';
    if (keep) {
      const parts = keep.map(([a, b], i) => `[0:v]trim=start=${a.toFixed(3)}:end=${b.toFixed(3)},setpts=PTS-STARTPTS[kv${i}];[0:a]atrim=start=${a.toFixed(3)}:end=${b.toFixed(3)},asetpts=PTS-STARTPTS[ka${i}]`);
      fc = `${parts.join(';')};${keep.map((_, i) => `[kv${i}][ka${i}]`).join('')}concat=n=${keep.length}:v=1:a=1[kv][ka];[kv]${vf}${hookF}${wmF}[b0]${af ? `;[ka]${af}[kaf]` : ''}`;
      audioMap = af ? '-map [kaf]' : '-map [ka]';
    } else { fc = `[0:v]${vf}${hookF}${wmF}[b0]`; if (af) audioMap += ` -af "${af}"`; }
    let last = 'b0'; let idx = 1;
    if (opts.overlayUrl) {
      inputs.in_cam = opts.overlayUrl; args += ` -t ${outLen.toFixed(3)} -i {{in_cam}}`;
      fc += `;[${idx}:v]scale=${camW}:-2[cam];[${last}][cam]overlay=W-w-24:${vertical ? 'H*0.16' : '24'}:eof_action=pass[b1]`; last = 'b1'; idx++;
    }
    if (logoUrl) {
      // Images can't go through yt-dlp, so ffmpeg reads the logo URL itself (direct jobs use a file input).
      if (opts.direct) { logoInput = logoUrl; args += ` -loop 1 -i {{in_logo}}`; } else args += ` -loop 1 -i "${String(logoUrl).replace(/["\\$`]/g, '')}"`;
      const { x, y } = markXY(logo.pos, 'w', 'h', 'W', 'H');
      fc += `;[${idx}:v]format=rgba,scale=-2:${logoH},colorchannelmixer=aa=${(logo.opacity / 100).toFixed(2)}[lg];[${last}][lg]overlay=${x}:${y}:shortest=1:format=auto[b2]`; last = 'b2'; idx++;
    }
    return {
      ffmpeg_command: `${opts.hls ? HLS_FLAGS : ''}-ss ${Number(start) || 0} ${args} -sws_flags lanczos+accurate_rnd -filter_complex "${keep ? fc : fc.replace(new RegExp(`\\[${last}\\]$`), '')}" ${keep ? `-map [${last}] ` : ''}${audioMap} -t ${outLen.toFixed(3)} ${encodeArgs(opts.long)} -movflags +faststart {{out_clip}}`,
      bodyInputs: { [opts.direct ? 'input_files' : 'input_urls']: { ...inputs, ...(logoInput ? { in_logo: logoInput } : {}) } },
      timeoutMs: opts.timeoutMs || 120000,
    };
  }
  // No generic B-roll: captions carry the edit (one RenderIO command per clip).
  return {
    ffmpeg_command: `${opts.hls ? HLS_FLAGS : ''}-ss ${Number(start) || 0} -i {{in_video}} -t ${outLen.toFixed(3)} -sws_flags lanczos+accurate_rnd -vf "${vf}${hookF}${wmF}" -map 0:v:0 -map 0:a:0? ${af ? `-af "${af}" ` : ''}${encodeArgs(opts.long)} -movflags +faststart {{out_clip}}`,
    bodyInputs: { [opts.direct ? 'input_files' : 'input_urls']: { in_video: url } },
    timeoutMs: opts.timeoutMs || (opts.direct ? 120000 : 150000),
  };
}

export async function renderioCut(url, start, length, key, caption, vertical, opts = {}) {
  const job = cutJob(url, start, length, caption, vertical, opts);
  const body = { ...job.bodyInputs, ffmpeg_command: job.ffmpeg_command, output_files: { out_clip: 'clip.mp4' } };
  return renderioRun(body, 'out_clip', key, job.timeoutMs);
}


// Run the same caption/crop/watermark encode on the local ffmpeg binary (bundled font for drawtext)
// and write `out`. Used when RenderIO is paused (payment failed) or unreachable.
export async function localCutToFile({ src, out, start, length, caption, vertical, opts = {}, fontfile = FONT_FILE } = {}) {
  if (!src) throw new Error('local cut: missing source');
  const ffmpeg = ffmpegPath();
  if (!ffmpeg) throw new Error('ffmpeg missing');
  // Build the RenderIO command, then swap placeholders for local paths and inject the font.
  const job = cutJob(src, start, length, caption, vertical, { ...opts, direct: true, hls: !!opts.hls });
  let cmd = applyFontfile(job.ffmpeg_command, fontfile)
    .replaceAll('{{in_video}}', src)
    .replaceAll('{{out_clip}}', out);
  if (opts.overlayFile) cmd = cmd.replaceAll('{{in_cam}}', opts.overlayFile);
  if (opts.logoFile) cmd = cmd.replaceAll('{{in_logo}}', opts.logoFile);
  const args = ['-y', '-hide_banner', '-loglevel', 'error', ...splitFfmpegArgs(cmd)];
  try {
    await exec(ffmpeg, args, { maxBuffer: 64 << 20 });
  } catch (e) {
    const err = String(e?.stderr || e?.message || e);
    // The ffmpeg-static build used on Vercel is compiled without libfreetype, so drawtext
    // is missing. Retry the same crop/encode without burned-in captions or the watermark.
    if (!opts.noText && /No such filter: ['"]?drawtext['"]?|Filter not found/i.test(err)) {
      console.warn('local ffmpeg has no drawtext; encoding without burned-in captions');
      return localCutToFile({ src, out, start, length, caption, vertical, opts: { ...opts, noText: true }, fontfile });
    }
    throw e;
  }
  return out;
}

// Transient RenderIO/source errors worth retrying: the source site rate-limiting RenderIO's
// yt-dlp (SOURCE_RATE_LIMITED), HTTP 429/5xx, timeouts and network blips. Permanent errors
// (private/removed video, unsupported URL, capacity cap) are not retried.
export function isTransientRenderioError(e) {
  if (!e || e.capacity) return false;
  const m = String(e.message || e).toLowerCase();
  return /source_rate_limited|rate.?limit|too many requests|\b429\b|submit 5\d\d|\b50[234]\b|timeout|timed out|unreachable|econnreset|socket hang up|temporarily/.test(m);
}

// Backoff before retry n (0-based): ~5s, ~10s, capped at 15s, plus up to 2s of jitter.
export const renderioBackoffMs = (n, base = 5000, rand = Math.random) => Math.min(15000, base * 2 ** n) + Math.floor(rand() * 2000);

// renderioRun with up to `retries` extra attempts on transient errors. Each retry submits a new
// RenderIO command (a FAILED command may still count toward the monthly plan), so retries are
// capped and skipped when the remaining time (deadlineAt) can't fit another attempt.
export async function renderioRunRetry(body, outKey, key, timeoutMs = 90000, { retries = 2, deadlineAt = 0, minAttemptMs = 45000, sleep = (ms) => new Promise(r => setTimeout(r, ms)), run = renderioRun } = {}) {
  for (let n = 0; ; n++) {
    const left = deadlineAt ? deadlineAt - Date.now() : timeoutMs;
    try { return await run(body, outKey, key, Math.max(20000, Math.min(timeoutMs, left))); }
    catch (e) {
      if (n >= retries || !isTransientRenderioError(e)) throw e;
      const wait = renderioBackoffMs(n);
      if (deadlineAt && deadlineAt - Date.now() - wait < minAttemptMs) throw e;
      console.warn('renderio transient error; retrying', { attempt: n + 1, waitMs: wait, err: String(e?.message).slice(0, 120) });
      await sleep(wait);
    }
  }
}
