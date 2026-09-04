// Shared LRU cache for the /reports/dashboard endpoint. Lifted out of the
// route file so writes anywhere in the app (a new expense, a collected
// payment, a fresh bill) can invalidate a shop's cached dashboard payload
// immediately — otherwise the shopkeeper sees stale KPIs for up to CACHE_TTL
// after saving. Invalidation is deliberately shop-scoped: unrelated shops
// keep their cached data.

interface CacheEntry {
  data: any;
  timestamp: number;
}

const dashboardCache = new Map<string, CacheEntry>();
// 4s — the dashboard polls every 8s from the client (page.tsx SWR
// refreshInterval), so a 4s cache absorbs redundant hits from focus events /
// dedupe windows without letting the UI show state older than that. Any write
// route calls invalidateDashboardCacheForShop() explicitly, so this TTL is
// only a safety net for writes we forgot to hook.
const CACHE_TTL = 4000;
const CACHE_MAX_ENTRIES = 500;

export function getDashboardCache(key: string): any | null {
  const cached = dashboardCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp >= CACHE_TTL) return null;
  return cached.data;
}

export function setDashboardCache(key: string, data: any): void {
  if (dashboardCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = dashboardCache.keys().next().value;
    if (oldest !== undefined) dashboardCache.delete(oldest);
  }
  dashboardCache.set(key, { data, timestamp: Date.now() });
}

// Drop every cached entry that this shop contributed to — single-shop keys
// prefix on the shop id directly, All-Shop-Access keys prefix "all:" and list
// every included shop id, so any substring match on the id is sufficient.
export function invalidateDashboardCacheForShop(shopId: string): void {
  if (!shopId) return;
  for (const key of dashboardCache.keys()) {
    if (key.includes(shopId)) dashboardCache.delete(key);
  }
}
