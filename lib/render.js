// Shared RenderIO + caption rendering helpers (used by /api/generate and /api/rerender).
import { meterRenderio } from './metrics';
import { reserveRenderio } from './capacity';

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
export function wordFilters(caption, length, timedWords, style, brand, long = false) {
  const look0 = captionLook(style, brand);
  // Long clips group more words per caption, so shrink the text to keep it on screen.
  const look = long ? { ...look0, size: Math.round(look0.size * 0.72) } : look0;
  const draw = (text, a, b) =>
    `drawtext=text='${look.upper === false ? captionText(text) : captionText(text).toUpperCase()}':fontsize=${look.size}:fontcolor=${look.color}:borderw=${look.border}:bordercolor=black:x=(w-text_w)/2:y=${look.y}:enable='between(t,${a.toFixed(2)},${b.toFixed(2)})'`;

  if (Array.isArray(timedWords) && timedWords.length >= 3) {
    const chunks = [];
    let cur = null;
    for (const w of timedWords) {
      const clean = w.w.replace(/'/g, '\u2019').replace(/[\\":%]/g, '');
      if (!clean) continue;
      const endsSentence = /[.!?]$/.test(clean);
      if (!cur) cur = { text: clean, a: w.a, b: w.b, n: 1 };
      else if (cur.n < (long ? 5 : 3) && w.a - cur.b < 0.6 && !/[.!?,]$/.test(cur.text)) { cur.text += ' ' + clean; cur.b = w.b; cur.n++; }
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
export async function renderioCut(url, start, length, key, caption, vertical, opts = {}) {
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
  const styled = styleCaption(caption, opts.style);
  const words = opts.wordCaptions ? wordFilters(caption, length, opts.timedWords, opts.style, opts.brand, !!opts.long) : '';
  // No spoken words and no hook text (e.g. subtitles off, or an unscored clip): burn nothing.
  const hasText = !!String(caption || '').trim() || (Array.isArray(opts.timedWords) && opts.timedWords.length >= 3);
  const vf = !hasText ? frame : words ? `${frame},${words}` : `${frame},${styled}`;
  // Transformative extras (same single RenderIO command): hook text pinned at the top,
  // and an optional facecam/reaction video in the top-right corner.
  const hook = captionText(opts.hook || '').replace(/'/g, '\u2019');
  const hookF = opts.hook && String(opts.hook).trim()
    ? `,drawtext=text='${hook}':fontsize=${Math.max(22, Math.min(vertical ? 46 : 40, Math.floor((vertical ? 640 : 1180) / (0.56 * Math.max(1, hook.length)))))}:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=14:x=(w-text_w)/2:y=${vertical ? 'h*0.07' : 'h*0.05'}`
    : '';
  // Free-plan watermark: small, low-opacity, top-left (clear of captions, hook and facecam).
  const br = opts.brand || {};
  const logo = br.logo?.on ? br.logo : null;
  const logoUrl = logo ? (br.customLogo && opts.logoUrl ? opts.logoUrl : DEFAULT_LOGO_URL) : null;
  const scaleK = vertical ? 1 : 0.9;
  const logoH = logo ? Math.round(LOGO_H[logo.size] * scaleK) : 0;
  // Watermark: user's brand-kit choice wins; otherwise free plans get it on by default.
  const wm = br.wm ? (br.wm.on ? br.wm : null) : (opts.watermark ? { pos: 'tl', size: 's', opacity: 50 } : null);
  let wmF = '';
  if (wm) {
    const shift = logo && logo.pos === wm.pos ? logoH + 10 : 0;
    const { x, y } = markXY(wm.pos, 'tw', 'th', 'w', 'h', 24, shift);
    wmF = `,drawtext=text='viralaiclipper.com':fontsize=${Math.round(WM_SIZE[wm.size] * scaleK)}:fontcolor=white@${(wm.opacity / 100).toFixed(2)}:borderw=2:bordercolor=black@${(wm.opacity / 200).toFixed(2)}:x=${x}:y=${y}`;
  }
  // Source credit ("Clip from @streamer"), bottom-left above the progress bar, and an optional progress bar.
  const credit = captionText(String(opts.credit || '').slice(0, 40)).replace(/'/g, '\u2019');
  const creditF = String(opts.credit || '').trim() ? `,drawtext=text='${credit}':fontsize=${vertical ? 26 : 22}:fontcolor=white@0.85:borderw=2:bordercolor=black@0.6:x=24:y=h-th-${opts.progress ? 40 : 28}` : '';
  const barF = opts.progress ? `,drawbox=x=0:y=ih-12:w='iw*min(1,t/${Math.max(1, Number(length) || 30)})':h=12:color=0xC6FF3D@0.9:t=fill` : '';
  wmF = `${creditF}${barF}${wmF}`;
  if (opts.overlayUrl || logoUrl) {
    const camW = vertical ? 260 : 320;
    const inputs = { in_video: url }; let logoInput = null;
    let args = `-i {{in_video}}`;
    let fc = `[0:v]${vf}${hookF}${wmF}[b0]`; let last = 'b0'; let idx = 1;
    if (opts.overlayUrl) {
      inputs.in_cam = opts.overlayUrl; args += ` -t ${Number(length) || 30} -i {{in_cam}}`;
      fc += `;[${idx}:v]scale=${camW}:-2[cam];[${last}][cam]overlay=W-w-24:${vertical ? 'H*0.16' : '24'}:eof_action=pass[b1]`; last = 'b1'; idx++;
    }
    if (logoUrl) {
      // Images can't go through yt-dlp, so ffmpeg reads the logo URL itself (direct jobs use a file input).
      if (opts.direct) { logoInput = logoUrl; args += ` -loop 1 -i {{in_logo}}`; } else args += ` -loop 1 -i "${String(logoUrl).replace(/["\\$`]/g, '')}"`;
      const { x, y } = markXY(logo.pos, 'w', 'h', 'W', 'H');
      fc += `;[${idx}:v]format=rgba,scale=-2:${logoH},colorchannelmixer=aa=${(logo.opacity / 100).toFixed(2)}[lg];[${last}][lg]overlay=${x}:${y}:shortest=1:format=auto[b2]`; last = 'b2'; idx++;
    }
    return renderioRun({
      [opts.direct ? 'input_files' : 'input_urls']: { ...inputs, ...(logoInput ? { in_logo: logoInput } : {}) },
      ffmpeg_command: `${opts.hls ? HLS_FLAGS : ''}-ss ${Number(start) || 0} ${args} -filter_complex "${fc.replace(new RegExp(`\\[${last}\\]$`), '')}" -map 0:a:0 -t ${Number(length) || 30} -c:v libx264 -preset ${opts.long ? 'ultrafast -crf 27' : 'veryfast'} -pix_fmt yuv420p -c:a aac -b:a 128k -ac 2 -movflags +faststart {{out_clip}}`,
      output_files: { out_clip: 'clip.mp4' },
    }, 'out_clip', key, opts.timeoutMs || 120000);
  }
  // No generic B-roll: captions carry the edit (one RenderIO command per clip).
  const body = {
    [opts.direct ? 'input_files' : 'input_urls']: { in_video: url },
    ffmpeg_command: `${opts.hls ? HLS_FLAGS : ''}-ss ${Number(start) || 0} -i {{in_video}} -t ${Number(length) || 30} -vf "${vf}${hookF}${wmF}" -map 0:v:0 -map 0:a:0 -c:v libx264 -preset ${opts.long ? 'ultrafast -crf 27' : 'veryfast'} -pix_fmt yuv420p -c:a aac -b:a ${opts.long ? '96k' : '128k'} -ac 2 -movflags +faststart {{out_clip}}`,
    output_files: { out_clip: 'clip.mp4' },
  };
  return renderioRun(body, 'out_clip', key, opts.timeoutMs || (opts.direct ? 120000 : 150000));
}

