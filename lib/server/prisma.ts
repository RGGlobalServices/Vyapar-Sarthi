import { PrismaClient } from '@prisma/client';

// Reuse a single PrismaClient across hot-reloads in dev to avoid exhausting
// database connections. In production a single instance is created per process.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Fix: BigInt values returned from Prisma $queryRaw cannot be JSON.stringify'd by
// default. Patching the prototype here converts them to numbers automatically,
// preventing "Do not know how to serialize a BigInt" errors that cause
// Next.js to return an HTML error page instead of JSON (the root cause of
// "Unexpected token '<', <!DOCTYPE..." on the client side).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

export default prisma;

// Auto-run migrations in background
if (process.env.NODE_ENV !== 'production' || true) {
  import('./autoMigrate').then((m) => m.runAutoMigrations()).catch(console.error);
}
