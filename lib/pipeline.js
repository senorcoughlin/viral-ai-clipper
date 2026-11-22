// Shared, client-safe helpers for length caps, link pre-checks, and progress copy.
// Keep this file free of server-only imports so the homepage can use it.

export const FREE_PROCESS_SEC = Number(process.env.NEXT_PUBLIC_YT_PROCESS_MINUTES_FREE || process.env.YT_PROCESS_MINUTES_FREE || 120) * 60;
export const PAID_PROCESS_SEC = Number(process.env.NEXT_PUBLIC_YT_PROCESS_MINUTES_PAID || process.env.YT_PROCESS_MINUTES_PAID || 240) * 60;

// Max time-slices per run. 6-minute slices → 20 ≈ 2 hours, 40 ≈ 4 hours.
export const SLICE_CAPS = { example: 20, free: 20, credits: 40, pro: 40 };

export function processWindowSec(tier) {
  return (tier === 'pro' || tier === 'credits') ? PAID_PROCESS_SEC : FREE_PROCESS_SEC;
}

export function sliceCapFor(tier) {
  return SLICE_CAPS[tier] || SLICE_CAPS.free;
}

// 7200 -> "2 hours", 5400 -> "90 minutes", 45 -> "45 seconds"
export const fmtLen = (secs) => {
  const s = Math.round(Number(secs) || 0);
  if (s < 120) return `${s} seconds`;
  const m = Math.round(s / 60);
  if (m >= 120 && m % 60 === 0) return `${m / 60} hours`;
  return `${m} minutes`;
};

// Live / upcoming / over-length problems we can spot from /api/duration before a run is wasted.
// Live YouTube is clipable (rolling window) — not a blocker. Over-length videos are windowed
// (we process a bounded prefix) so they return a warning, not a hard stop.
export function issueFromLinkMeta(meta, rawUrl) {
  if (!meta || meta.checking) return null;
  if (rawUrl && meta.url && meta.url !== rawUrl) return null;
  if (meta.upcoming) return { code: 'upcoming', message: 'This video hasn\u2019t started yet (it\u2019s a scheduled premiere or stream). Paste it again once it\u2019s published.' };
  if (meta.live) return null;
  if (meta.maxSecs && meta.secs > meta.maxSecs) {
    return {
      code: 'windowed',
      warning: true,
      message: `This video is ${fmtLen(meta.secs)} long. We\u2019ll clip highlights from the first ${fmtLen(meta.maxSecs)}. Upgrade for a longer window, or trim the file and upload the MP4 to use a later part.`,
    };
  }
  return null;
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
