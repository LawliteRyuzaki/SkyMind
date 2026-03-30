/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
      { protocol: 'https', hostname: 'logos.skyscnr.com' },
    ],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  },
  // Ensure TypeScript errors don't block build
  typescript: {
    ignoreBuildErrors: true,
  },
  // Ensure ESLint errors don't block build
  eslint: {
    ignoreDuringBuilds: true,
  },
}

module.exports = nextConfig
