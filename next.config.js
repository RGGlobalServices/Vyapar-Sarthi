// Stub @parcel/watcher and @swc/core before next-intl/plugin loads them.
// Both packages require native binaries that are unavailable on some Linux
// build servers. They are only used for i18n file-watching in development;
// production builds work correctly without them.
(function stubNativeDevModules() {
  const Module = require('module');
  const noop = () => {};

  function stubModule(name, exports) {
    const fakeId = '\0stub:' + name;
    Module._cache[fakeId] = { id: fakeId, filename: fakeId, loaded: true, exports: exports, children: [] };
    const orig = Module._resolveFilename;
    Module._resolveFilename = function(request, parent, isMain, options) {
      if (request === name) return fakeId;
      return orig.call(this, request, parent, isMain, options);
    };
  }

  try { require('@parcel/watcher'); } catch (_e) {
    stubModule('@parcel/watcher', {
      subscribe: async () => ({ unsubscribe: noop }),
      unsubscribe: noop,
      getEventsSince: async () => [],
      writeSnapshot: async () => '',
    });
  }

  try { require('@swc/core'); } catch (_e) {
    stubModule('@swc/core', {
      transform: async (src) => ({ code: src }),
      transformSync: (src) => ({ code: src }),
      parse: async () => ({}),
      parseSync: () => ({}),
      print: async () => ({ code: '' }),
      printSync: () => ({ code: '' }),
      minify: async (src) => ({ code: src }),
      minifySync: (src) => ({ code: src }),
    });
  }
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

module.exports = withNextIntl(withSerwist(nextConfig));
