export const dynamic = 'force-dynamic';
export const maxDuration = 120;
// Temporary diagnostic (test-bypass only): Gemini status/latency per model.
export async function GET(request) {
  if (!process.env.TEST_BYPASS_SECRET || request.headers.get('x-test-bypass') !== process.env.TEST_BYPASS_SECRET) return new Response('no', { status: 404 });
  const key = process.env.GEMINI_API_KEY || '';
  const out = { keyLen: key.length };
  const t = async (label, url, init, ms = 50000) => {
    const s = Date.now(); const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), ms);
    try { const r = await fetch(url, { ...init, signal: ctrl.signal }); const txt = await r.text(); out[label] = { status: r.status, ms: Date.now() - s, body: txt.slice(0, 600) }; }
    catch (e) { out[label] = { error: e?.message, ms: Date.now() - s }; } finally { clearTimeout(tm); }
  };
  const base = 'https://generativelanguage.googleapis.com/v1beta';
  await t('list', `${base}/models?pageSize=200&key=${encodeURIComponent(key)}`, {}, 20000);
  try { const j = JSON.parse(out.list.body.length < 600 ? out.list.body : '{}'); } catch {}
  const models = (new URL(request.url).searchParams.get('m') || 'gemini-3.8-flash').split(',');
  const body = JSON.stringify({ contents: [{ parts: [{ text: 'Reply with JSON {"ok":true}' }] }], generationConfig: { maxOutputTokens: 256, responseMimeType: 'application/json' } });
  await Promise.all(models.map(m => t('gen:' + m, `${base}/models/${m}:generateContent?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }, 50000)));
  return Response.json(out);
}
