/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [{ source: '/pricing', destination: '/#pricing', permanent: false }];
  },
};
module.exports = nextConfig;
