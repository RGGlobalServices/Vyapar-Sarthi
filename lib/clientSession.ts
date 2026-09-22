'use client';

import { idbGetAll, idbDeleteWhere } from './offline/idb';

// Single place that wipes browser-side state belonging to a signed-in user.
// Used by logout, the 401 handler and login, so a second user on the same
// browser can never inherit the previous user's shop id, role, cached lists
// or offline data.
//
// The offline OUTBOX (unsynced bills) is deliberately NOT deleted. Each queued
// item is stamped with its shopId + userId, and the server only accepts an
// x-shop-id that the token's owner actually owns — so a preserved bill can only
// ever sync under its own owner and shop, never under another user.

const CACHE_PREFIX = 'ks_cache:';

const USER_KEYS = [
  'ks_auth',
  'ks_active_shop_id',
  'ks_role',
  'ks_package_type',
  'ks_business_type',
  'ks_subscription_plan',
  'ks_offline_sales_queue',
];

// IndexedDB stores that hold cached server data. `outbox` is never touched;
// `invoices` keeps only provisional (still-unsynced) offline invoices.
const CACHE_STORES = ['auth_session', 'products', 'customers', 'suppliers', 'purchases', 'stock_movements', 'mill_entries', 'sync_metadata'];

export function clearShopScopedLocalCache() {
  if (typeof window === 'undefined') return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) doomed.push(k);
    }
    doomed.forEach(k => localStorage.removeItem(k));
  } catch {}
}

/**
 * Count of unsynced offline transactions that belong to the SIGNED-IN user.
 * Another account's leftover bills on the same device are not this user's to be
 * warned about (and are never synced under this user — see offlineSync).
 */
export async function countPendingOfflineBills(): Promise<number> {
  if (typeof window === 'undefined') return 0;
  try {
    let me: string | null = null;
    try {
      const d = JSON.parse(localStorage.getItem('ks_auth') || '{}');
      me = d.user_id != null ? String(d.user_id) : d.id != null ? String(d.id) : null;
    } catch {}
    const items = await idbGetAll<{ status?: string; userId?: string | number }>('outbox');
    return items.filter(
      i =>
        i.status !== 'SYNCED' &&
        (!i.userId || i.userId === 'offline_user' || (me !== null && String(i.userId) === me))
    ).length;
  } catch {
    return 0;
  }
}

async function clearIndexedDbCaches() {
  await Promise.all([
    ...CACHE_STORES.map(store => idbDeleteWhere(store, () => true).catch(() => {})),
    idbDeleteWhere<any>('invoices', inv => !inv?.isOfflineProvisional).catch(() => {}),
  ]);
}

export async function clearLocalSession() {
  if (typeof window === 'undefined') return;
  clearShopScopedLocalCache();
  USER_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch {} });
  try {
    document.cookie = 'ks_auth=; path=/; max-age=0';
    document.cookie = 'ks_plan=; path=/; max-age=0';
  } catch {}
  await clearIndexedDbCaches();
  try {
    const { mutate } = await import('swr');
    await mutate(() => true, undefined, { revalidate: false });
  } catch {}
}
