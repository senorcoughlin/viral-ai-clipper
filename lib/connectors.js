// Customer-facing integrations only. Internal services (AI, rendering, billing,
// storage) are not listed here on purpose.
// kind: 'source' = clip from it, 'direct' = uploads for you, 'open' = opens the app
// with your caption copied (you attach the downloaded clip), 'coming' = not yet.
export const CONNECTORS = [
  { id: 'youtube', name: 'YouTube links', category: 'Clip from', kind: 'source', description: 'Paste any YouTube video link and we find the best moments.' },
  { id: 'upload', name: 'Upload a file', category: 'Clip from', kind: 'source', description: 'Upload a video from your phone or computer.' },
  { id: 'twitch', name: 'Twitch & podcasts', category: 'Clip from', kind: 'source', description: 'Paste a Twitch VOD or podcast video link.' },
  { id: 'youtube_shorts', name: 'YouTube Shorts', category: 'Publish to', kind: 'direct', description: 'Uploads the clip to your channel as a private video so you can review and publish. Needs your channel connected. Google is still reviewing our app, so you may see an "unverified app" screen.' },
  { id: 'tiktok', name: 'TikTok', category: 'Publish to', kind: 'open', description: 'Download the clip, then the button opens TikTok upload with your caption copied.' },
  { id: 'instagram', name: 'Instagram Reels', category: 'Publish to', kind: 'open', description: 'Download the clip, then the button opens Instagram with your caption copied.' },
  { id: 'x', name: 'X', category: 'Publish to', kind: 'open', description: 'Download the clip, then the button opens X with your caption copied.' },
  { id: 'tiktok_direct', name: 'TikTok direct posting', category: 'Coming soon', kind: 'coming', description: 'Post or schedule straight to TikTok.' },
  { id: 'instagram_direct', name: 'Instagram direct posting', category: 'Coming soon', kind: 'coming', description: 'Post or schedule straight to Reels.' },
  { id: 'drive', name: 'Google Drive & Dropbox', category: 'Coming soon', kind: 'coming', description: 'Clip videos stored in your cloud drive.' },
];
