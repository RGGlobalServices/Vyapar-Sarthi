// Plain JS config (not .ts) on purpose: Next.js compiles a TypeScript config
// via @parcel/watcher, whose native binary is omitted in some managed build
// environments (Hostinger), causing "Failed to load next.config.ts". A JS
// config skips that compile step entirely.
const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Backend is now served by native Next.js Route Handlers under app/api/v1.
  // Prisma + bcrypt must stay external so they aren't bundled by webpack.
  serverExternalPackages: ['pdf-parse', 'xlsx', '@prisma/client', 'prisma', 'bcryptjs'],
  webpack: (config, { isServer }) => {
    config.optimization.moduleIds = 'named';

    // Add polyfills for non-Node.js environments
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        buffer: require.resolve('buffer/'),
      };
    }

    return config;
  },
};

module.exports = withNextIntl(nextConfig);
