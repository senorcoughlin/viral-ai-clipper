export default function manifest() {
  return {
    id: '/',
    name: 'Viral AI Clipper',
    short_name: 'AI Clipper',
    description: 'Turn one video into up to 8 viral-ready clips for TikTok, Reels and Shorts.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0A0A0F',
    theme_color: '#0A0A0F',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    share_target: {
      action: '/share',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: {
        title: 'title',
        text: 'text',
        url: 'url',
        files: [{ name: 'video', accept: ['video/*', '.mp4', '.mov', '.webm', '.m4v'] }],
      },
    },
  }
}
