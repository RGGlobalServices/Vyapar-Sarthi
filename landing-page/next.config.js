// Plain JS config (not .ts) on purpose — see app/next.config.js. A TypeScript
// config makes Next.js load @parcel/watcher, whose native binary is omitted in
// some managed build environments, breaking the build.
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
};

module.exports = nextConfig;
