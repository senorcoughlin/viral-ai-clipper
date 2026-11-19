// In-memory fake of the Upstash REST API for tests. Import before any lib that reads KV env.
process.env.KV_REST_API_URL = 'https://fake-kv.test';
process.env.KV_REST_API_TOKEN = 'fake';
export const db = new Map();
export const sent = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('https://api.resend.com')) { sent.push(JSON.parse(init.body)); return new Response('{"id":"x"}', { status: 200 }); }
  if (!String(url).startsWith('https://fake-kv.test')) return realFetch(url, init);
  const body = JSON.parse(init.body);
  const run = ([cmd, ...a]) => {
    const h = (k) => { if (!db.has(k)) db.set(k, new Map()); return db.get(k); };
    const l = (k) => { if (!db.has(k)) db.set(k, []); return db.get(k); };
    switch (cmd.toUpperCase()) {
      case 'GET': return db.has(a[0]) ? db.get(a[0]) : null;
      case 'SET': { if (a.includes('NX') && db.has(a[0])) return null; db.set(a[0], a[1]); return 'OK'; }
      case 'DEL': return db.delete(a[0]) ? 1 : 0;
      case 'EXPIRE': return 1;
      case 'INCR': case 'INCRBY': db.set(a[0], String(Number(db.get(a[0]) || 0) + Number(a[1] ?? 1))); return Number(db.get(a[0]));
      case 'DECR': case 'DECRBY': db.set(a[0], String(Number(db.get(a[0]) || 0) - Number(a[1] ?? 1))); return Number(db.get(a[0]));
      case 'HSET': { const m = h(a[0]); const n = m.has(a[1]) ? 0 : 1; m.set(a[1], a[2]); return n; }
      case 'HSETNX': { const m = h(a[0]); if (m.has(a[1])) return 0; m.set(a[1], a[2]); return 1; }
      case 'HGET': return db.get(a[0])?.get(a[1]) ?? null;
      case 'HEXISTS': return db.get(a[0])?.has(a[1]) ? 1 : 0;
      case 'HDEL': return db.get(a[0])?.delete(a[1]) ? 1 : 0;
      case 'HLEN': return db.get(a[0])?.size || 0;
      case 'HGETALL': return [...(db.get(a[0]) || new Map())].flat();
      case 'SADD': { if (!db.has(a[0])) db.set(a[0], new Set()); const st = db.get(a[0]); const n = st.has(a[1]) ? 0 : 1; st.add(a[1]); return n; }
      case 'LPUSH': { const x = l(a[0]); x.unshift(a[1]); return x.length; }
      case 'LTRIM': { const x = l(a[0]); db.set(a[0], x.slice(Number(a[1]), Number(a[2]) + 1)); return 'OK'; }
      case 'LRANGE': { const x = l(a[0]); const end = Number(a[2]); return x.slice(Number(a[1]), end < 0 ? undefined : end + 1); }
      case 'LREM': { const x = l(a[0]); const before = x.length; db.set(a[0], x.filter(v => v !== a[2])); return before - db.get(a[0]).length; }
      case 'TTL': return -1;
      default: throw new Error('fake kv: unsupported ' + cmd);
    }
  };
  // Pipelined calls (array of arrays) return [{result}], single calls return {result}.
  if (Array.isArray(body[0])) return new Response(JSON.stringify(body.map(c => ({ result: run(c) }))), { status: 200 });
  return new Response(JSON.stringify({ result: run(body) }), { status: 200 });
};
