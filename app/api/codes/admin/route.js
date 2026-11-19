export const dynamic = 'force-dynamic';
import { requireRaffleAdmin, json } from '../../../../lib/raffleadmin';
import { audit } from '../../../../lib/adminauth';
import { listCodes, listRedemptions, setCodeDef, removeRedemption, getCode } from '../../../../lib/codes';
import { revokeProDays } from '../../../../lib/billing';

// GET -> codes (built-in + Redis) with use counts, and the latest redemptions.
export async function GET(request) {
  const denied = await requireRaffleAdmin(request);
  if (denied) return denied;
  return json({ codes: await listCodes(), redemptions: await listRedemptions(200) });
}

// POST { action: 'set', code, reward?, maxUses?, expiresAt?, active?, note? }
//      { action: 'remove-redemption', code, email, revoke?: true }  (undo, e.g. a test)
export async function POST(request) {
  const denied = await requireRaffleAdmin(request, { write: true });
  if (denied) return denied;
  const b = await request.json().catch(() => ({}));
  try {
    if (b.action === 'set') {
      const r = await setCodeDef(b.code, { reward: b.reward, maxUses: b.maxUses, expiresAt: b.expiresAt, active: b.active, note: b.note });
      await audit(request, 'codes.set', { code: r.code, active: r.active });
      return json({ ok: true, code: r });
    }
    if (b.action === 'remove-redemption') {
      const def = await getCode(b.code);
      const r = await removeRedemption(b.code, b.email);
      let revoked = null;
      if (b.revoke && r.removed && def?.reward?.type === 'pro') revoked = await revokeProDays(String(b.email).toLowerCase(), def.reward.days, `undo code ${def.code}`);
      await audit(request, 'codes.remove', { code: b.code, removed: r.removed });
      return json({ ok: true, ...r, revoked });
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}
