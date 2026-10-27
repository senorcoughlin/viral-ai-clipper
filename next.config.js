/** @type {import('next').NextConfig} */
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || 'dev';
const nextConfig = {
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID },
  async headers() {
    return [
      // HTML must never be cached so phones always get the newest JS bundle names.
      { source: '/((?!_next/static|_next/image|api|brand|icons|examples|fonts|favicon.ico).*)', headers: [{ key: 'Cache-Control', value: 'no-store, must-revalidate' }] },
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
    ];
  },
  experimental: {
    // Ship the ffmpeg binary with the generate function (used for local prep of downloads).
    serverComponentsExternalPackages: ['ffmpeg-static'],
    outputFileTracingIncludes: {
      '/api/generate': ['./node_modules/ffmpeg-static/ffmpeg'],
      '/api/generate/route': ['./node_modules/ffmpeg-static/ffmpeg'],
      '/api/duration': ['./node_modules/ffmpeg-static/ffmpeg'],
      '/api/duration/route': ['./node_modules/ffmpeg-static/ffmpeg'],
    },
  },
  async redirects() {
    return [{ source: '/pricing', destination: '/#pricing', permanent: false }];
  },
};
module.exports = nextConfig;
