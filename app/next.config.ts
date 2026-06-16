import type {NextConfig} from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: false,
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

export default withNextIntl(nextConfig);
