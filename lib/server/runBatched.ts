/**
 * Runs an array of lazy async thunks with limited concurrency, preserving
 * result order — a middle ground between `await` in a loop (too slow, one
 * round-trip at a time) and `Promise.all` on already-invoked promises (fires
 * everything at once, which for a Prisma call means opening a DB connection
 * per query the instant the array literal is evaluated — a page that runs
 * N independent queries can blow past DATABASE_URL's connection_limit on
 * its own before Promise.all even starts awaiting).
 *
 * Callers must pass thunks (`() => prisma.x.findMany(...)`), not the
 * already-called promise (`prisma.x.findMany(...)`) — the whole point is to
 * defer when each query actually fires.
 */
// Tuple-typed so a heterogeneous list of thunks (an aggregate here, a raw
// query there, a findMany after that) still destructures with each result's
// own real type — same ergonomics as `await Promise.all([...])` had, just
// with controlled concurrency instead of firing every query at once.
export async function runBatched<T extends readonly (() => Promise<any>)[]>(
  thunks: [...T],
  batchSize = 3,
): Promise<{ [K in keyof T]: T[K] extends () => Promise<infer R> ? R : never }> {
  const results: any[] = new Array(thunks.length);
  for (let i = 0; i < thunks.length; i += batchSize) {
    const batch = thunks.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map((fn) => fn()));
    for (let j = 0; j < batchResults.length; j++) results[i + j] = batchResults[j];
  }
  return results as any;
}
