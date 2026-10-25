// Groq Whisper is limited to 7,200 audio-seconds per hour for the whole org. Track usage in
// Redis per clock hour and refuse before we hit it, so runs degrade instead of failing.
import { kvCommand, kvEnabled } from './kv';
const LIMIT = Number(process.env.GROQ_ASPH_LIMIT || 6600);
const key = () => `groq:asph:${Math.floor(Date.now() / 3600000)}`;
export async function reserveAudioSec(sec) {
  if (!kvEnabled) return true;
  try {
    const k = key();
    const used = Number(await kvCommand(['INCRBY', k, String(Math.ceil(sec))]));
    await kvCommand(['EXPIRE', k, '7200']);
    if (used > LIMIT) { await kvCommand(['DECRBY', k, String(Math.ceil(sec))]); return false; }
    return true;
  } catch { return true; }
}
export async function releaseAudioSec(sec) {
  if (!kvEnabled) return;
  try { await kvCommand(['DECRBY', key(), String(Math.ceil(sec))]); } catch {}
}
