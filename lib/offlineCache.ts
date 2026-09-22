'use client';

import { idbGet, idbPut } from './offline/idb';
import { enqueueTransaction, OUTBOX_CHANGED_EVENT } from './offline/outbox';
import { generateOfflineRefNumber } from './offline/offlineNumbering';

const CACHE_PREFIX = 'ks_cache:';
export const QUEUE_CHANGED_EVENT = OUTBOX_CHANGED_EVENT;

export function saveCache<T>(key: string, data: T) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, savedAt: Date.now() }));
    // Also mirror to IndexedDB asynchronously for robust long-term retention
    idbPut('sync_metadata', { compoundKey: key, data, savedAt: Date.now() }).catch(() => {});
  } catch {
    idbPut('sync_metadata', { compoundKey: key, data, savedAt: Date.now() }).catch(() => {});
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
 * True only for a genuine network failure (no server response at all)
 * or 503 service unavailable.
 */
export function isNetworkError(err: any): boolean {
  if (!err) return false;
  if (!err.response) return true;
  if (err.response.status === 502 || err.response.status === 503 || err.response.status === 504) return true;
  return false;
}

export function getQueuedSales(): QueuedSale[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('ks_offline_sales_queue');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Wrap a fetch so a network failure returns the last successful cached result
 * instead of throwing, and a success refreshes that stored copy.
 */
export async function withOfflineCache<T>(
  key: string,
  fetchFn: () => Promise<T>,
  shopId?: string
): Promise<T> {
  // Every cached list is stored per shop. The shop is captured BEFORE the fetch
  // starts, so a request begun in Shop A that resolves after a switch to Shop B
  // is still saved under (and later read back from) Shop A's key, never B's.
  const activeShop = shopId || (typeof window !== 'undefined' ? localStorage.getItem('ks_active_shop_id') : null);
  const scopedKey = activeShop ? `${activeShop}:${key}` : key;
  try {
    const data = await fetchFn();
    saveCache(scopedKey, data);
    return data;
  } catch (err) {
    if (isNetworkError(err)) {
      const cached = loadCache<T>(scopedKey);
      if (cached) return cached.data;

      // Try IndexedDB as fallback
      try {
        const idbCached = await idbGet<{ compoundKey: string; data: T }>('sync_metadata', scopedKey);
        if (idbCached?.data) return idbCached.data;
      } catch {}
    }
    throw err;
  }
}

export interface QueuedSale {
  localId: string;
  payload: any;
  createdAt: number;
}

/**
 * High-level helper to queue an offline bill into IndexedDB outbox.
 */
export async function queueOfflineSale(payload: any, shopId?: string): Promise<QueuedSale> {
  const activeShop = shopId || (typeof window !== 'undefined' ? localStorage.getItem('ks_active_shop_id') || 'default_shop' : 'default_shop');
  const userId = typeof window !== 'undefined' ? (JSON.parse(localStorage.getItem('ks_auth') || '{}').user_id || 'offline_user') : 'offline_user';
  
  const offlineRefNumber = payload.offlineRefNumber || payload.offline_ref_number || generateOfflineRefNumber('OFF');
  const enhancedPayload = {
    ...payload,
    offlineRefNumber,
    offline_ref_number: offlineRefNumber,
  };

  const item = await enqueueTransaction({
    shopId: activeShop,
    userId,
    transactionType: 'sale',
    entityType: 'sale',
    entityId: offlineRefNumber,
    payload: enhancedPayload,
    dependsOnLocalIds: payload.customerId && payload.customerId.startsWith('temp') ? [payload.customerId] : [],
  });

  // Also save locally to IndexedDB invoices store for instant offline viewing/printing
  idbPut('invoices', {
    ...enhancedPayload,
    id: item.localTransactionId,
    compoundKey: `${activeShop}:${item.localTransactionId}`,
    shopId: activeShop,
    invoice_number: offlineRefNumber,
    offlineRefNumber,
    isOfflineProvisional: true,
    createdAt: new Date().toISOString(),
  }).catch(() => {});

  return {
    localId: item.localTransactionId,
    payload: enhancedPayload,
    createdAt: item.createdAt,
  };
}
