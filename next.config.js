/** @type {import('next').NextConfig} */
const nextConfig = {
  // Removed 'output: export' to enable dynamic routes
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  // Add CORS proxy for n8n webhook during development
  async rewrites() {
    return [
      {
        source: '/api/n8n/:path*',
        destination: 'https://alpaylabs.app.n8n.cloud/:path*',
      },
    ]
  },
};

module.exports = nextConfig;
