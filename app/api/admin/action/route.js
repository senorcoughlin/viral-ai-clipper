import { NextResponse } from 'next/server';
import { requireAdmin, audit } from '../../../../lib/adminauth';
import { addCredits, setPro, getEntitlement } from '../../../../lib/billing';
import { kvCommand } from '../../../../lib/kv';
import { nyDay } from '../../../../lib/ratelimit';
import { setBanner, setFlag } from '../../../../lib/siteconfig';
export const dynamic = 'force-dynamic';
const okEmail = (e) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e);
const bad = (m) => NextResponse.json({ error: m }, { status: 400 });

// One action per request on one target; there is deliberately no delete or bulk operation.
export async function POST(request) {
  const denied = await requireAdmin(request, { write: true });
  if (denied) return denied;
  const b = await request.json().catch(() => ({}));
  const action = String(b.action || '');
  const email = String(b.email || '').trim().toLowerCase();
  let result;
  switch (action) {
    case 'grant_credits': {
      const n = Math.floor(Number(b.amount));
      if (!okEmail(email)) return bad('Enter a valid email');
      if (!(n >= 1 && n <= 1000)) return bad('Amount must be 1–1000');
      result = await addCredits(email, n, `admin-${Date.now()}`);
      break;
    }
    case 'set_pro': {
      if (!okEmail(email)) return bad('Enter a valid email');
      await setPro(email, !!b.on);
      result = { pro: (await getEntitlement(email)).pro };
      break;
    }
    case 'reset_limit': {
      const id = String(b.id || '').trim();
      if (!id || id.length > 80 || /[\s*?\[\]]/.test(id)) return bad('Enter the IP / id shown in the usage table');
      const day = nyDay();
      const keys = ['free', 'credits', 'pro', 'example'].map(t => `rl:day:${t}:${id}:${day}`);
      result = { cleared: Number(await kvCommand(['DEL', ...keys])) || 0 };
      break;
    }
    case 'set_banner': {
      await setBanner(b.text, b.tone);
      result = { ok: true };
      break;
    }
    case 'set_flag': {
      try { await setFlag(String(b.flag), !!b.on); } catch { return bad('Unknown flag'); }
      result = { ok: true };
      break;
    }
    default: return bad('Unknown action');
  }
  const { action: _a, ...detail } = b;
  await audit(request, action, detail);
  return NextResponse.json({ ok: true, result }, { headers: { 'Cache-Control': 'no-store' } });
}
