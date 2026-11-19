const SITE = 'https://viralaiclipper.com';

export default function sitemap() {
  const now = new Date();
  return ['', '/studio', '/tutorial', '/monetize', '/programs', '/permissions', '/tools', '/connectors', '/channel', '/feedback', '/free-ai-clip-maker', '/youtube-shorts-clip-maker', '/podcast-to-shorts', '/how-to-clip-twitch-streams', '/opus-clip-alternative', '/raffle', '/raffle/rules'].map((p) => ({
    url: `${SITE}${p}`,
    lastModified: now,
    changeFrequency: p ? 'monthly' : 'weekly',
    priority: p ? 0.6 : 1,
  }));
}
