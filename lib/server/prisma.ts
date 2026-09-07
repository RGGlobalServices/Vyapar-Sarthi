import { PrismaClient } from '@prisma/client';

// Reuse a single PrismaClient across hot-reloads in dev to avoid exhausting
// database connections. In production a single instance is created per process.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  __dbSemaphore?: { queue: (() => void)[]; active: number };
};

// ── Global concurrency semaphore ──────────────────────────────────────
// Supabase free tier has ~15 PostgreSQL slots total (minus reserved).
// Multiple Next.js API routes fire in parallel on page load (dashboard,
// profile, notifications, calendar …), each running several queries.
// Without a gate, the combined burst easily exceeds the pool — even with
// connection_limit=3 in the URL — because Prisma eagerly opens a
// connection per concurrent query. This semaphore caps how many queries
// are actually in-flight at any moment across the whole process.
const MAX_CONCURRENT = 4;

function getSemaphore() {
  if (!globalForPrisma.__dbSemaphore) {
    globalForPrisma.__dbSemaphore = { queue: [], active: 0 };
  }
  return globalForPrisma.__dbSemaphore;
}

async function withSemaphore<T>(fn: () => Promise<T>): Promise<T> {
  const sem = getSemaphore();

  if (sem.active >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => sem.queue.push(resolve));
  }
  sem.active++;

  try {
    return await fn();
  } finally {
    sem.active--;
    if (sem.queue.length > 0) {
      const next = sem.queue.shift()!;
      next();
    }
  }
}

// ── Retry wrapper ─────────────────────────────────────────────────────
// PgBouncer drops idle connections silently; connection pool exhaustion
// on Supabase is transient. Retry with backoff instead of failing.
const RETRYABLE = /server has closed the connection|connection reset|connection terminated|can't reach database|socket hang up|econnreset|prepared statement .* does not exist|remaining connection slots are reserved|too many database connections/i;
const MAX_RETRIES = 3;

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;
      const msg = err?.message || '';
      if (attempt < MAX_RETRIES && RETRYABLE.test(msg)) {
        const isPoolExhausted = /remaining connection slots|too many database connections/i.test(msg);
        const delay = isPoolExhausted ? 1500 * attempt : 250 * attempt;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

const basePrisma = globalForPrisma.prisma ?? new PrismaClient();

// The $extends return type is slightly different from PrismaClient (a known
// Prisma limitation), but at runtime it's the same shape — cast so downstream
// code that types parameters as PrismaClient / TransactionClient still works.
const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        return withSemaphore(() => withRetry(() => query(args)));
      },
    },
  },
}) as unknown as PrismaClient;

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = basePrisma;

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
