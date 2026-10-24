// Per-run usage metering (RenderIO jobs, Gemini tokens, Whisper audio seconds) and
// score logging for the admin dashboard. Uses AsyncLocalStorage so helpers deep in
// the pipeline can record without threading a parameter through every call.
import { AsyncLocalStorage } from 'node:async_hooks';
import { kvEnabled, kvCommand } from './kv';

const als = new AsyncLocalStorage();
export const newMeter = () => ({ renderio: [], gemini: [], whisperSec: 0, whisperCalls: 0 });
export const withMeter = (meter, fn) => als.run(meter, fn);
const cur = () => als.getStore();

export function meterRenderio(kind, ms, file) {
  const m = cur(); if (!m) return;
  m.renderio.push({ kind, ms, bytes: Number(file?.size_bytes ?? file?.size ?? file?.file_size ?? 0) || null, sec: Number(file?.duration ?? 0) || null });
}
export function meterGemini(kind, usage) {
  const m = cur(); if (!m) return;
  m.gemini.push({ kind, prompt: usage?.promptTokenCount || 0, out: usage?.candidatesTokenCount || 0, thoughts: usage?.thoughtsTokenCount || 0 });
}
export function meterWhisper(sec) {
  const m = cur(); if (!m) return;
  m.whisperCalls += 1;
  m.whisperSec += Number(sec) || 0;
}

const RUNS_KEY = 'runs:v1';
export async function saveRun(run) {
  if (!kvEnabled) return;
  try {
    await kvCommand(['LPUSH', RUNS_KEY, JSON.stringify(run)]);
    await kvCommand(['LTRIM', RUNS_KEY, '0', '1999']);
  } catch (e) { console.warn('saveRun failed', e?.message); }
}
export async function loadRuns(n = 2000) {
  if (!kvEnabled) return [];
  const rows = (await kvCommand(['LRANGE', RUNS_KEY, '0', String(n - 1)])) || [];
  return rows.map(r => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean);
}
