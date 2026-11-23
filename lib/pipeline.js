// Shared, client-safe helpers for length caps, link pre-checks, and progress copy.
// Keep this file free of server-only imports so the homepage can use it.

import { FREE_WINDOW_SEC, PAID_WINDOW_SEC, SOURCE_MAX_SEC, fmtLen as fmtLenBase } from './limits';

// Caps live in lib/limits.js (3 hours max, free clips from the first 2 hours).
export const FREE_PROCESS_SEC = FREE_WINDOW_SEC;
export const PAID_PROCESS_SEC = PAID_WINDOW_SEC;

// Max time-slices per run. 6-minute slices → 20 ≈ 2 hours, 40 covers the 3-hour cap.
export const SLICE_CAPS = { example: 20, free: 20, credits: 40, pro: 40 };

export function processWindowSec(tier) {
  return (tier === 'pro' || tier === 'credits') ? PAID_PROCESS_SEC : FREE_PROCESS_SEC;
}

// What paid users are told (and get) for YouTube: the paid window, but never more than the
// hard source cap (3 hours).
export function ytPaidWindowSec(hardMaxSecs) {
  return Math.min(PAID_PROCESS_SEC, Number(hardMaxSecs) > 0 ? Number(hardMaxSecs) : SOURCE_MAX_SEC);
}

export function sliceCapFor(tier) {
  return SLICE_CAPS[tier] || SLICE_CAPS.free;
}

// 7200 -> "2 hours", 5400 -> "90 minutes", 45 -> "45 seconds"
export const fmtLen = fmtLenBase;

// Live / upcoming / over-length problems we can spot from /api/duration before a run is wasted.
// Live YouTube is clipable (rolling window) — not a blocker. Over-length videos are windowed
// (we process a bounded prefix) so they return a warning, not a hard stop.
export function issueFromLinkMeta(meta, rawUrl) {
  if (!meta || meta.checking) return null;
  if (rawUrl && meta.url && meta.url !== rawUrl) return null;
  if (meta.upcoming) return { code: 'upcoming', message: 'This video hasn\u2019t started yet (it\u2019s a scheduled premiere or stream). Paste it again once it\u2019s published.' };
  if (meta.live) return null;
  if (meta.hardMaxSecs && meta.secs > meta.hardMaxSecs) {
    return { code: 'too_long', message: ytTooLongMessage(meta.secs, meta.hardMaxSecs) };
  }
  if (meta.maxSecs && meta.secs > meta.maxSecs) {
    return {
      code: 'windowed',
      warning: true,
      message: `This video is ${fmtLen(meta.secs)} long. We\u2019ll clip highlights from the first ${fmtLen(meta.maxSecs)}. Pro and credit runs use the full video (up to ${fmtLen(SOURCE_MAX_SEC)}), or trim the file and upload the MP4 to use a later part.`,
    };
  }
  return null;
}

// Hard cap for YouTube sources (the downloader's standard length; see lib/downloader.js).
export const YT_SOURCE_MAX_SEC_DEFAULT = SOURCE_MAX_SEC;
const fmtHm = (secs) => {
  const s = Math.round(Number(secs) || 0);
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m} minutes`;
};
export function ytTooLongMessage(secs, maxSecs = YT_SOURCE_MAX_SEC_DEFAULT) {
  const len = secs > 0 ? `This video is ${fmtHm(secs)} long. ` : 'This video is too long for us to download. ';
  return `${len}We can clip videos up to ${fmtLen(maxSecs)} long. Trim it to ${fmtLen(maxSecs)} or less and upload the MP4 to clip it. This run was not counted.`;
}

export const isBlockingIssue = (issue) => !!issue && issue.warning !== true;

export function uploadFallbackMessage(kind = 'youtube') {
  if (kind === 'slow') {
    return 'YouTube is sending this video to us too slowly right now, so it couldn\u2019t finish downloading. This isn\u2019t because you left the page. Upload the MP4 instead to keep your settings and finish this clip. This run was not counted.';
  }
  if (kind === 'facebook') {
    return 'We couldn\u2019t download that Facebook video (it may be private, friends-only, or blocked). Try uploading the video file instead, or try again later. This run was not counted.';
  }
  if (kind === 'generic') {
    return 'We couldn\u2019t download that video link right now. Upload the MP4 instead to keep your settings and finish this clip. This run was not counted.';
  }
  return 'YouTube downloads are temporarily down on our side (YouTube is blocking our video downloader). This isn\u2019t because you left the page. Upload the MP4 instead to keep your settings and finish this clip. This run was not counted.';
}

// Sort a failed generate into a short reason code for analytics, and whether it was the
// user's input or plan limit (tracked as generate_blocked) rather than our failure.
const USER_CODES = new Set(['daily_limit', 'rate_limited', 'bad_link', 'too_long', 'whole_too_long', 'live', 'upcoming', 'unavailable_video', 'private', 'not_started', 'invalid', 'not_found', 'sub_only', 'restricted', 'no_archive', 'unavailable']);
export function classifyGenError(err) {
  const code = String(err?.code || '');
  const m = String(err?.message || err || '');
  let reason = '';
  if (code && code !== 'upload_fallback' && !/^http_/.test(code)) reason = code;
  else if (/free generations today|Upgrade to Pro or buy credits/i.test(m)) reason = 'daily_limit';
  else if (/too many requests|slow down/i.test(m)) reason = 'rate_limited';
  else if (/look like a (public )?video link|missing videoUrl|missing a video id/i.test(m)) reason = 'bad_link';
  else if (/unavailable \(private|private, removed|region-locked|would not open this live stream/i.test(m)) reason = 'unavailable_video';
  else if (/hasn.t started yet|isn.t enough footage|premiere/i.test(m)) reason = 'not_started';
  else if (/live right now|needs a finished video/i.test(m)) reason = 'live';
  else if (/We can clip (YouTube )?videos up to|Uploads can be up to|VOD is .{1,12} long|works for videos up to|Free runs handle streams up to|limit is .* per run|too long for us to download/i.test(m)) reason = 'too_long';
  else if (/at capacity/i.test(m)) reason = 'capacity';
  else if (/temporarily down|blocking our video downloader/i.test(m)) reason = 'download_blocked';
  else if (/too slowly/i.test(m)) reason = 'download_slow';
  else if (/couldn.t download|could not read that stream|could not capture|could not attach|Kick blocked/i.test(m)) reason = 'download_failed';
  else if (/took too long/i.test(m)) reason = 'timeout';
  else if (/No clips could be made/i.test(m)) reason = 'render_failed';
  else if (/lost this run|expired on the server/i.test(m)) reason = 'job_lost';
  else if (/reach the server|connection (dropped|ended)|garbled/i.test(m)) reason = 'network';
  else if (code) reason = code;
  else reason = 'other';
  return { reason, user: USER_CODES.has(reason) };
}
