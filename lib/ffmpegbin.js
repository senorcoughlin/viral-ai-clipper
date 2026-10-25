// Resolve a working ffmpeg binary path. Webpack can rewrite ffmpeg-static's __dirname
// to the route folder (e.g. .../api/generate/ffmpeg), so we verify the file exists and
// fall back to known locations inside the traced function bundle.
import fs from 'fs';
import path from 'path';

let cached;
export function ffmpegPath() {
  if (cached !== undefined && cached) return cached;
  const cands = [];
  if (process.env.FFMPEG_PATH) cands.push(process.env.FFMPEG_PATH);
  try { const p = require('ffmpeg-static'); if (p) cands.push(p); } catch {}
  cands.push(path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg'));
  cands.push('/var/task/node_modules/ffmpeg-static/ffmpeg');
  for (const c of cands) {
    try { fs.accessSync(c, fs.constants.X_OK); cached = c; return c; } catch {}
    try { if (fs.existsSync(c)) { fs.chmodSync(c, 0o755); cached = c; return c; } } catch {}
  }
  console.error('[ffmpeg] binary not found; tried', cands.join(', '));
  cached = null;
  return null;
}
