// Gemini sometimes answers with the bare clip array ([{...}]) or a fenced block instead of
// {"clips":[...]}. All of those are fine; normalize to { clips }.
export function parseScoreJson(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const tryParse = (x) => { try { return JSON.parse(x); } catch { return undefined; } };
  let v = tryParse(t);
  if (v === undefined) {
    const obj = t.match(/\{[\s\S]*\}/); const arr = t.match(/\[[\s\S]*\]/);
    const firstArr = arr && (!obj || t.indexOf('[') < t.indexOf('{'));
    v = (firstArr ? tryParse(arr[0]) : undefined) ?? (obj ? tryParse(obj[0]) : undefined) ?? (arr ? tryParse(arr[0]) : undefined);
  }
  if (Array.isArray(v)) return { clips: v.filter(c => c && typeof c === 'object') };
  if (v && typeof v === 'object') {
    if (Array.isArray(v.clips)) return v;
    for (const k of ['moments', 'highlights', 'results', 'items']) if (Array.isArray(v[k])) return { ...v, clips: v[k] };
    if (v.startSec != null) return { clips: [v] };
  }
  return null;
}

