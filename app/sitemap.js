const SITE = 'https://viralaiclipper.com';

export default function sitemap() {
  const now = new Date();
  return ['', '/tools', '/connectors', '/channel', '/feedback'].map((p) => ({
    url: `${SITE}${p}`,
    lastModified: now,
    changeFrequency: p ? 'monthly' : 'weekly',
    priority: p ? 0.6 : 1,
  }));
}
