import type {NextConfig} from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: false,
  serverExternalPackages: ['pdf-parse', 'xlsx'],
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:10000';
    return [
      {
        source: '/api/v1/:path*',
        destination: `${backendUrl}/api/v1/:path*`,
      },
    ];
  },
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
