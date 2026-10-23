export default function robots() {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/success', '/cancel'] }],
    sitemap: 'https://viralaiclipper.com/sitemap.xml',
    host: 'https://viralaiclipper.com',
  };
}
