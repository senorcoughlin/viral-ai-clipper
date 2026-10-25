// Daily prize wheel. Outcome is decided server-side with crypto randomness.
import crypto from 'crypto';

// weight is in basis points (out of 10,000). Shown to users in the Odds panel.
export const PRIZES = [
  { clips: 3, weight: 6200 },
  { clips: 5, weight: 3000 },
  { clips: 7, weight: 600 },
  { clips: 10, weight: 190 },
  { clips: 20, weight: 10 },
];
const TOTAL = PRIZES.reduce((s, p) => s + p.weight, 0);

export function drawPrize(rand = () => crypto.randomInt(0, TOTAL)) {
  let r = rand();
  for (const p of PRIZES) { if (r < p.weight) return p.clips; r -= p.weight; }
  return PRIZES[0].clips;
}

export const emailHash = (e) => crypto.createHash('sha256').update(String(e || '').trim().toLowerCase()).digest('hex').slice(0, 32);

// Next midnight in America/New_York, as epoch ms.
export function nextNyMidnight(now = Date.now()) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const [h, m, s] = f.format(new Date(now)).split(':').map(Number);
  const into = ((h % 24) * 3600 + m * 60 + s) * 1000;
  return now - into - (now % 1000) + 86400000;
}
