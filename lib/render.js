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
export function sanitizeBrand(b) {
  if (!b || typeof b !== 'object') return null;
  const out = {};
  if (BRAND_COLORS[b.color] || /^#[0-9a-fA-F]{6}$/.test(String(b.color || ''))) out.color = b.color;
  if (BRAND_SIZES[b.size]) out.size = b.size;
  if (BRAND_Y[b.position]) out.position = b.position;
  if (typeof b.upper === 'boolean') out.upper = b.upper;
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
export function wordFilters(caption, length, timedWords, style, brand) {
  const look = captionLook(style, brand);
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
      else if (cur.n < 3 && w.a - cur.b < 0.6 && !/[.!?,]$/.test(cur.text)) { cur.text += ' ' + clean; cur.b = w.b; cur.n++; }
      else { chunks.push(cur); cur = { text: clean, a: w.a, b: w.b, n: 1 }; }
      if (endsSentence) { chunks.push(cur); cur = null; }
    }
    if (cur) chunks.push(cur);
    // Hold each chunk until the next one starts so there are no flickering gaps.
    return chunks.slice(0, 120).map((c, i) => draw(c.text, c.a, Math.max(c.b, (chunks[i + 1]?.a ?? c.b + 0.4) - 0.02))).join(',');
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
  const endpoint = body.input_files ? 'run-ffmpeg-command' : body.ffmpeg_command ? 'run-ytdlp-command' : 'ytdlp-download';
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
  const words = opts.wordCaptions ? wordFilters(caption, length, opts.timedWords, opts.style, opts.brand) : '';
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
  let wmF = opts.watermark
    ? `,drawtext=text='viralaiclipper.com':fontsize=${vertical ? 24 : 22}:fontcolor=white@0.5:borderw=1:bordercolor=black@0.35:x=20:y=20`
    : '';
  // Source credit ("Clip from @streamer"), bottom-left above the progress bar, and an optional progress bar.
  const credit = captionText(String(opts.credit || '').slice(0, 40)).replace(/'/g, '\u2019');
  const creditF = String(opts.credit || '').trim() ? `,drawtext=text='${credit}':fontsize=${vertical ? 26 : 22}:fontcolor=white@0.85:borderw=2:bordercolor=black@0.6:x=24:y=h-th-${opts.progress ? 40 : 28}` : '';
  const barF = opts.progress ? `,drawbox=x=0:y=ih-12:w='iw*min(1,t/${Math.max(1, Number(length) || 30)})':h=12:color=0xC6FF3D@0.9:t=fill` : '';
  wmF = `${creditF}${barF}${wmF}`;
  if (opts.overlayUrl) {
    const camW = vertical ? 260 : 320;
    return renderioRun({
      [opts.direct ? 'input_files' : 'input_urls']: { in_video: url, in_cam: opts.overlayUrl },
      ffmpeg_command: `${opts.hls ? HLS_FLAGS : ''}-ss ${Number(start) || 0} -i {{in_video}} -t ${Number(length) || 30} -i {{in_cam}} -filter_complex "[0:v]${vf}${hookF}${wmF}[base];[1:v]scale=${camW}:-2[cam];[base][cam]overlay=W-w-24:${vertical ? 'H*0.16' : '24'}:eof_action=pass[v]" -map "[v]" -map 0:a:0 -t ${Number(length) || 30} -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -b:a 128k -ac 2 -movflags +faststart {{out_clip}}`,
      output_files: { out_clip: 'clip.mp4' },
    }, 'out_clip', key, opts.timeoutMs || 120000);
  }
  // No generic B-roll: captions carry the edit (one RenderIO command per clip).
  const body = {
    [opts.direct ? 'input_files' : 'input_urls']: { in_video: url },
    ffmpeg_command: `${opts.hls ? HLS_FLAGS : ''}-ss ${Number(start) || 0} -i {{in_video}} -t ${Number(length) || 30} -vf "${vf}${hookF}${wmF}" -map 0:v:0 -map 0:a:0 -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -b:a 128k -ac 2 -movflags +faststart {{out_clip}}`,
    output_files: { out_clip: 'clip.mp4' },
  };
  return renderioRun(body, 'out_clip', key, opts.timeoutMs || (opts.direct ? 120000 : 150000));
}

