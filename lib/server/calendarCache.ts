export type BellResult = { upcoming: unknown[]; pastPending: unknown[]; recentCompleted: unknown[] };
const bellCache = new Map<string, { data: BellResult; expiresAt: number }>();

export function getBellCache(shopId: string): BellResult | null {
  const entry = bellCache.get(shopId);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.data;
}

export function setBellCache(shopId: string, data: BellResult) {
  bellCache.set(shopId, { data, expiresAt: Date.now() + 30_000 });
}

export function invalidateCalendarCache(shopId: string) {
  bellCache.delete(shopId);
}
