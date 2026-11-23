// Single source of truth for video length limits, shared by the API routes, the homepage,
// guide pages and error messages. Client-safe (no server-only imports).
//
// Policy (Nathan, Nov 22 2026): every source is capped at 3 hours, permanently. The YouTube
// downloader's standard length is 180 minutes; longer videos would need its extended-duration
// billing (3-13x per request), which we do not use.
//   - YouTube links, uploads, MP4 links, Twitch/Kick replays: up to 3 hours.
//   - Free runs clip highlights from the first 2 hours (Twitch/Kick replays up to 2 hours on free).
//   - Pro and credit runs use the full 3 hours.
//   - Uploads: up to 500 MB and 3 hours.
//   - Live streams: the last 5, 10 or 15 minutes.
//   - "Whole video" (one clip of the entire source): videos up to 2 minutes.

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };

export const SOURCE_MAX_SEC = 180 * 60;
export const FREE_WINDOW_SEC = Math.min(SOURCE_MAX_SEC,
  num(process.env.NEXT_PUBLIC_YT_PROCESS_MINUTES_FREE || process.env.YT_PROCESS_MINUTES_FREE, 120) * 60);
export const PAID_WINDOW_SEC = SOURCE_MAX_SEC;
export const UPLOAD_MAX_MB = 500;
export const UPLOAD_MAX_BYTES = UPLOAD_MAX_MB * 1024 * 1024;
export const WHOLE_MAX_SEC = 120;
export const LIVE_MINUTES = [5, 10, 15];
export const STREAM_MAX_SEC = { free: FREE_WINDOW_SEC, paid: SOURCE_MAX_SEC };

// 7200 -> "2 hours", 10800 -> "3 hours", 5400 -> "90 minutes", 45 -> "45 seconds"
export const fmtLen = (secs) => {
  const s = Math.round(Number(secs) || 0);
  if (s < 120) return `${s} seconds`;
  const m = Math.round(s / 60);
  if (m >= 120 && m % 60 === 0) return `${m / 60} hours`;
  return `${m} minutes`;
};

const liveRange = `${LIVE_MINUTES[0]}\u2013${LIVE_MINUTES[LIVE_MINUTES.length - 1]} minutes`;
export const LIMIT_COPY = {
  max: fmtLen(SOURCE_MAX_SEC),                // "3 hours"
  freeWindow: fmtLen(FREE_WINDOW_SEC),        // "2 hours"
  upload: `up to ${UPLOAD_MAX_MB} MB and ${fmtLen(SOURCE_MAX_SEC)}`,
  live: liveRange,
  wholeShort: '2 minutes',
  // One-liners for plan cards and FAQs.
  proFeature: `Videos up to ${fmtLen(SOURCE_MAX_SEC)}, clipped end to end`,
  freeFeature: `Videos up to ${fmtLen(SOURCE_MAX_SEC)} (highlights from the first ${fmtLen(FREE_WINDOW_SEC)})`,
  faq: `Up to ${fmtLen(SOURCE_MAX_SEC)}. That covers YouTube links, uploads (up to ${UPLOAD_MAX_MB} MB), direct MP4 links and Twitch or Kick replays. Free runs clip highlights from the first ${fmtLen(FREE_WINDOW_SEC)} of a longer video (Twitch and Kick replays up to ${fmtLen(FREE_WINDOW_SEC)} on free); Pro and credit runs use the full ${fmtLen(SOURCE_MAX_SEC)}. For live streams we clip the last ${liveRange}. Hour-long videos take several minutes to process.`,
};
