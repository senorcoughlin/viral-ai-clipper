export default function robots() {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/success', '/cancel', '/admin'] }],
    sitemap: 'https://viralaiclipper.com/sitemap.xml',
    host: 'https://viralaiclipper.com',
  };
}
