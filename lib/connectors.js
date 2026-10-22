export const CONNECTORS = [
  { id: 'youtube', name: 'YouTube', category: 'source', description: 'Paste a video or channel and clip it.', status: 'ready' },
  { id: 'gemini', name: 'Gemini', category: 'ai', description: 'Scoring, hooks, captions, scripts, and titles.', status: 'ready' },
  { id: 'groq', name: 'Groq Whisper', category: 'ai', description: 'Fast transcription for clip finding.', status: 'ready' },
  { id: 'renderio', name: 'RenderIO', category: 'render', description: 'Downloads the source and cuts the clips.', status: 'ready' },
  { id: 'stripe', name: 'Stripe', category: 'billing', description: 'Pro subscription and credit packs.', status: 'ready' },
  { id: 'blob', name: 'Vercel Blob', category: 'storage', description: 'Stores clips and account data.', status: 'ready' },
  { id: 'tiktok', name: 'TikTok', category: 'publish', description: 'Post or schedule clips to TikTok.', status: 'coming' },
  { id: 'instagram', name: 'Instagram Reels', category: 'publish', description: 'Post or schedule clips to Reels.', status: 'coming' },
  { id: 'youtube_shorts', name: 'YouTube Shorts', category: 'publish', description: 'Upload clips as Shorts.', status: 'coming' },
  { id: 'drive', name: 'Google Drive', category: 'source', description: 'Clip videos stored in Drive.', status: 'coming' },
];
