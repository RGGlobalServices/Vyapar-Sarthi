'use client';

/**
 * Minimal offline support for billing/products/stock.
 *
 * No IndexedDB or service-worker plumbing: a shop catalogue is a few thousand
 * rows at most, small enough that localStorage's synchronous API is simpler to
 * reason about, and it behaves identically in the browser, the Capacitor
 * WebView, and the Electron shell — no platform-specific storage plugin needed.
 *
 * Two independent pieces live here:
 *  - a read-through cache (`withOfflineCache`) so Products/Stock/Billing can
 *    keep showing the last-known data when a fetch fails for lack of a
 *    connection, instead of going blank;
 *  - a write queue (`queueOfflineSale`) so a bill created with no connection
 *    is saved locally and completes normally for the cashier, then gets
 *    replayed against the server once it's back.
 */

const CACHE_PREFIX = 'ks_cache:';
const QUEUE_KEY = 'ks_offline_sales_queue';
const QUEUE_CHANGED_EVENT = 'ks-offline-queue-changed';

export function saveCache<T>(key: string, data: T) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, savedAt: Date.now() }));
  } catch {
    // Storage full/unavailable — reads simply fall back to the network next time.
  }
}

export function loadCache<T>(key: string): { data: T; savedAt: number } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * True only for a genuine network failure (no server response at all).
 * Anything the server itself answered — 400/401/403/500 — is a real error and
 * must keep behaving like one, not silently fall back to stale cached data.
 */
export function isNetworkError(err: any): boolean {
  return !!err && !err.response;
}

/**
 * Wrap a fetch so a network failure returns the last successful result
 * instead of throwing, and a success refreshes that stored copy.
 */
export async function withOfflineCache<T>(key: string, fetchFn: () => Promise<T>): Promise<T> {
  try {
    const data = await fetchFn();
    saveCache(key, data);
    return data;
  } catch (err) {
    if (isNetworkError(err)) {
      const cached = loadCache<T>(key);
      if (cached) return cached.data;
    }
    throw err;
  }
}

export interface QueuedSale {
  localId: string;
  payload: any;
  createdAt: number;
}

function dispatchQueueChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(QUEUE_CHANGED_EVENT));
}

export function getQueuedSales(): QueuedSale[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedSale[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // If this fails the sale still went through locally for the cashier; it
    // just won't survive a reload to be synced later.
  }
  dispatchQueueChanged();
}

export function queueOfflineSale(payload: any): QueuedSale {
  const sale: QueuedSale = {
    localId: `OFFLINE-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    payload,
    createdAt: Date.now(),
  };
  saveQueue([...getQueuedSales(), sale]);
  return sale;
}

export function removeQueuedSale(localId: string) {
  saveQueue(getQueuedSales().filter(s => s.localId !== localId));
}

export { QUEUE_CHANGED_EVENT };
