/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Ship the ffmpeg binary with the generate function (used for local prep of downloads).
    serverComponentsExternalPackages: ['ffmpeg-static'],
    outputFileTracingIncludes: {
      '/api/generate': ['./node_modules/ffmpeg-static/ffmpeg'],
      '/api/generate/route': ['./node_modules/ffmpeg-static/ffmpeg'],
    },
  },
  async redirects() {
    return [{ source: '/pricing', destination: '/#pricing', permanent: false }];
  },
};
module.exports = nextConfig;
