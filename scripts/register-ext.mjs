import { register } from 'node:module';
// Keep the suite hermetic: production keys loaded into a dev shell (vercel env pull, .env files)
// switch on real Redis/RenderIO/RapidAPI code paths and make unrelated tests fail.
for (const k of Object.keys(process.env)) {
  if (/^(KV_|REDIS_URL|UPSTASH_|RENDERIO_|YT_|TUNELIO_|GEMINI_|GROQ_|BLOB_|STRIPE_|RESEND_|STATS_ADMIN|RAFFLE_ADMIN|CRON_SECRET|ADMIN_GUEST|EGG_PASSWORD|HANDOFF_|SLICE_|SESSION_SECRET)/.test(k)) delete process.env[k];
}
register(new URL('./ext-hook.mjs', import.meta.url));
