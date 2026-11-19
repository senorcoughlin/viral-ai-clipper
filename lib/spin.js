// Daily prize wheel. Outcome is decided server-side with crypto randomness.
import crypto from 'crypto';

// weight is out of 100,000 (so 20 = 0.02%). Shown to users in the Odds panel.
// Prize ids: 'c3'..'c20' = bonus clip credits, 'pro' = 1 month (31 days) of Pro, no renewal.
export const PRIZES = [
  { id: 'c3', clips: 3, weight: 61980, label: '+3 clips' },
  { id: 'c5', clips: 5, weight: 30000, label: '+5 clips' },
  { id: 'c7', clips: 7, weight: 6000, label: '+7 clips' },
  { id: 'c10', clips: 10, weight: 1900, label: '+10 clips' },
  { id: 'c20', clips: 20, weight: 100, label: '+20 clips' }, // 2nd rarest
  { id: 'pro', clips: 0, pro: true, days: 31, weight: 20, label: '1 month of Pro' }, // rarest
];
export const TOTAL = PRIZES.reduce((s, p) => s + p.weight, 0);
export const PRO_DAYS = 31;
export const odds = () => PRIZES.map(p => ({ id: p.id, clips: p.clips, pro: !!p.pro, label: p.label, pct: Math.round((p.weight / TOTAL) * 100000) / 1000 }));

// Returns the prize object. Server-side only; the client just animates to it.
export function drawPrize(rand = () => crypto.randomInt(0, TOTAL)) {
  let r = rand();
  for (const p of PRIZES) { if (r < p.weight) return p; r -= p.weight; }
  return PRIZES[0];
}
export const prizeById = (id) => PRIZES.find(p => p.id === String(id)) || PRIZES.find(p => String(p.clips) === String(id)) || null;

export const emailHash = (e) => crypto.createHash('sha256').update(String(e || '').trim().toLowerCase()).digest('hex').slice(0, 32);

// Next midnight in America/New_York, as epoch ms.
export function nextNyMidnight(now = Date.now()) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const [h, m, s] = f.format(new Date(now)).split(':').map(Number);
  const into = ((h % 24) * 3600 + m * 60 + s) * 1000;
  return now - into - (now % 1000) + 86400000;
}
