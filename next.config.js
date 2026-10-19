// Stub @parcel/watcher and @swc/core before next-intl/plugin loads them.
// Both need native binaries unavailable on some Linux build servers.
// Strategy: try to require normally; if it fails, resolve the path without
// executing and inject a no-op stub into require.cache at the real path.
// This avoids fake IDs that downstream code may treat as file paths.
(function stubNativeDevModules() {
  const noop = () => {};

  function safeStub(name, stub) {
    try {
      require(name); // success → no stub needed
    } catch (_loadErr) {
      try {
        const resolved = require.resolve(name); // path only, no execution
        require.cache[resolved] = {
          id: resolved, filename: resolved,
          loaded: true, exports: stub, children: [],
        };
      } catch (_resolveErr) {} // not installed at all — nothing to do
    }
  }

  safeStub('@parcel/watcher', {
    subscribe: async () => ({ unsubscribe: noop }),
    unsubscribe: noop,
    getEventsSince: async () => [],
    writeSnapshot: async () => '',
  });

  safeStub('@swc/core', {
    transform: async (src) => ({ code: src }),
    transformSync: (src) => ({ code: src }),
    parse: async () => ({}),
    parseSync: () => ({}),
    print: async () => ({ code: '' }),
    printSync: () => ({ code: '' }),
    minify: async (src) => ({ code: src }),
    minifySync: (src) => ({ code: src }),
  });
})();

const createNextIntlPlugin = require('next-intl/plugin');

const withSerwist = require('@serwist/next').default({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
});

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Hostinger shared hosting has a strict thread limit — spawning the default
  // number of Next.js build workers causes SIGABRT (os error 11). Disabling
  // worker threads and capping CPUs to 1 keeps page-data collection
  // single-threaded so the build completes on constrained servers.
  experimental: {
    workerThreads: false,
    cpus: 1,
  },
  serverExternalPackages: ['pdf-parse', 'xlsx', '@prisma/client', 'prisma', 'bcryptjs'],
  webpack: (config, { isServer }) => {
    config.optimization.moduleIds = 'named';

    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        buffer: require.resolve('buffer/'),
      };
    }

    return config;
  },
};

module.exports = withNextIntl(withSerwist(nextConfig));
