// Gemini calls with a model fallback.
// gemini-3.8-flash has been overloaded since ~2026-10-28 (slow 503 "high demand" after
// ~40s, or no reply at all), which made every highlight score time out. Try the primary
// with a short budget; on 429/5xx/timeout switch to the fallback model and skip the
// primary for a while on this instance so later calls don't pay the wait again.
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
const PRIMARY = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const FALLBACK = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash';
const SKIP_MS = 10 * 60 * 1000;
let primaryDownUntil = 0;

async function call(model, key, body, ms, extSignal) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.max(1000, ms));
  const onExt = () => ctrl.abort();
  extSignal?.addEventListener?.('abort', onExt);
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}${model}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    // Read the body inside the timeout too: a stalled response stream also counts as a hang.
    const text = await res.text();
    return { status: res.status, ok: res.ok, text, ms: Date.now() - t0, model };
  } catch (e) {
    return { status: 0, ok: false, text: '', error: e?.message || String(e), ms: Date.now() - t0, model };
  } finally {
    clearTimeout(timer);
    extSignal?.removeEventListener?.('abort', onExt);
  }
}

const retryable = r => !r.ok && (r.status === 0 || r.status === 429 || r.status === 404 || r.status >= 500);

// Returns { ok, status, data, model, ms, error }. Never throws.
export async function geminiGenerate(body, { label = 'gemini', timeoutMs = 55000, primaryMs = 25000, signal } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, status: 0, error: 'no key' };
  const start = Date.now();
  const left = () => timeoutMs - (Date.now() - start);
  let r = null;
  if (Date.now() >= primaryDownUntil || PRIMARY === FALLBACK) {
    r = await call(PRIMARY, key, body, Math.min(primaryMs, timeoutMs), signal);
    if (r.ok || !retryable(r) || PRIMARY === FALLBACK) return done(r, label);
    primaryDownUntil = Date.now() + SKIP_MS;
    console.warn(`${label}: ${PRIMARY} ${r.status || r.error} after ${r.ms}ms, falling back to ${FALLBACK}`);
    if (signal?.aborted) return done(r, label);
  }
  r = await call(FALLBACK, key, body, Math.max(left(), 15000), signal);
  if (!r.ok && r.status === 400 && body?.generationConfig?.thinkingConfig && /think/i.test(r.text)) {
    const { thinkingConfig, ...gc } = body.generationConfig;
    r = await call(FALLBACK, key, { ...body, generationConfig: gc }, Math.max(left(), 15000), signal);
  }
  return done(r, label);
}

function done(r, label) {
  let data = null;
  if (r.ok) { try { data = JSON.parse(r.text); } catch { r = { ...r, ok: false, error: 'bad json' }; } }
  if (!r.ok) console.warn(`${label} failed`, r.model, r.status || '', r.error || r.text.slice(0, 200), `${r.ms}ms`);
  else console.log(`${label} ok`, r.model, `${r.ms}ms`);
  return { ok: r.ok, status: r.status, data, model: r.model, ms: r.ms, error: r.error || (!r.ok ? r.text.slice(0, 200) : undefined) };
}

export function geminiText(data) {
  return (data?.candidates?.[0]?.content?.parts || []).filter(p => !p.thought && p.text).map(p => p.text).join('');
}
