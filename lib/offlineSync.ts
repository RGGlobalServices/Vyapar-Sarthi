'use client';

import api from '@/lib/api';
import { mutate } from 'swr';
import { openOfflineDB, idbBulkPut, idbPut, idbGet } from './offline/idb';
import { getOutboxItems, updateOutboxItemStatus, removeOutboxItem } from './offline/outbox';
import { sortOutboxItemsDynamically, substituteCommittedServerIds, OutboxItem } from './offline/dependencyGraph';
import { checkServerHealth, setGlobalNetworkState, setLastSyncTime } from './offline/networkStatus';

// Per-shop lock: a long sync of Shop A must not silently skip Shop B's flush.
const runningShops = new Set<string>();

function currentUserId(): string | null {
  try {
    const d = JSON.parse(localStorage.getItem('ks_auth') || '{}');
    const v = d.user_id ?? d.id;
    return v != null ? String(v) : null;
  } catch {
    return null;
  }
}

// Entity endpoint mappings
const ENTITY_ENDPOINTS: Record<string, string> = {
  sale: '/billing',
  billing: '/billing',
  invoice: '/billing',
  purchase: '/purchases',
  purchases: '/purchases',
  customer: '/customers',
  customers: '/customers',
  supplier: '/suppliers',
  suppliers: '/suppliers',
  product: '/products',
  products: '/products',
  stock_adjustment: '/products/adjust',
  stock: '/products',
  party_transaction: '/customers',
  gate_entry: '/mill/gate-entry',
  weighbridge_entry: '/mill/weighbridge',
  production_batch: '/mill/batches',
  raw_material_lot: '/mill/raw-material',
};

/**
 * Main Auto-Sync Orchestrator for Vyapar Sarthii.
 * Executes independent atomic sync per transaction in dynamic DAG order.
 */
export async function flushOfflineTransactions(shopId?: string): Promise<{
  syncedCount: number;
  failedCount: number;
  conflictCount: number;
}> {
  if (typeof window === 'undefined') return { syncedCount: 0, failedCount: 0, conflictCount: 0 };

  const activeShop = shopId || localStorage.getItem('ks_active_shop_id');
  if (!activeShop) return { syncedCount: 0, failedCount: 0, conflictCount: 0 };
  if (runningShops.has(activeShop)) return { syncedCount: 0, failedCount: 0, conflictCount: 0 };
  // Take the lock BEFORE the first await: two triggers (layout mount + online
  // event) used to both pass the check while the health probe was in flight and
  // then both flush the same outbox, racing on the idempotency key.
  runningShops.add(activeShop);

  // 1. Verify real server reachability
  const isHealthy = await checkServerHealth();
  if (!isHealthy) {
    runningShops.delete(activeShop);
    return { syncedCount: 0, failedCount: 0, conflictCount: 0 };
  }

  setGlobalNetworkState('SYNCING');

  let syncedCount = 0;
  let failedCount = 0;
  let conflictCount = 0;

  try {
    // 2. Fetch and DAG-sort all pending / retryable items
    const allItems = await getOutboxItems(activeShop);
    // Only send bills that this signed-in user queued. Bills left behind by a
    // different account stay untouched in the outbox until their owner signs in
    // again (the server would also refuse them: it rejects any x-shop-id that
    // the token's user does not own).
    const me = currentUserId();
    const pendingItems = allItems.filter(
      i =>
        (i.status === 'PENDING' || i.status === 'FAILED') &&
        (!i.userId || i.userId === 'offline_user' || (me !== null && String(i.userId) === me))
    );

    if (pendingItems.length === 0) {
      setGlobalNetworkState('ONLINE');
      return { syncedCount: 0, failedCount: 0, conflictCount: 0 };
    }

    const sortedQueue = sortOutboxItemsDynamically(pendingItems);
    const idMap = new Map<string, string>();

    // 3. Process each transaction independently
    for (const item of sortedQueue) {
      try {
        await updateOutboxItemStatus(item.localTransactionId, {
          status: 'SYNCING',
          lastAttemptAt: Date.now(),
          retryCount: (item.retryCount || 0) + 1,
        });

        // Substitute any parent local IDs with their committed real server UUIDs
        const preparedPayload = substituteCommittedServerIds(item.payload, idMap);

        // Resolve endpoint
        let endpoint = ENTITY_ENDPOINTS[item.entityType] || ENTITY_ENDPOINTS[item.transactionType] || `/${item.entityType}`;
        if (item.transactionType === 'customer_transaction' && preparedPayload.customerId) {
          endpoint = `/customers/${preparedPayload.customerId}/transactions`;
        }

        const res = await api.post(endpoint, preparedPayload, {
          headers: {
            'x-idempotency-key': item.idempotencyKey,
            'x-device-id': item.deviceId,
            'x-shop-id': activeShop,
          },
        });

        const responseData = res.data?.invoice || res.data?.sale || res.data?.customer || res.data?.product || res.data;
        const serverId = responseData?.id || responseData?.serverId;

        if (serverId) {
          idMap.set(item.localTransactionId, serverId);
          if (item.entityId) idMap.set(item.entityId, serverId);
        }

        // Successfully synced — mark as SYNCED (or clean up)
        await updateOutboxItemStatus(item.localTransactionId, {
          status: 'SYNCED',
          errorCode: null,
          errorMessage: null,
        });
        // Remove synced item to keep outbox clean
        await removeOutboxItem(item.localTransactionId);

        syncedCount++;
      } catch (err: any) {
        const status = err.response?.status;
        const errData = err.response?.data;
        const errMsg = errData?.error || errData?.detail || err.message || 'Sync failed';

        // Check if network was lost mid-sync
        if (!err.response) {
          setGlobalNetworkState('SERVER_UNAVAILABLE');
          await updateOutboxItemStatus(item.localTransactionId, {
            status: 'PENDING',
            errorMessage: 'Network interrupted during sync. Will retry automatically.',
          });
          break; // Stop loop and retry later
        }

        // Check for stock conflict
        if (status === 409 || errData?.code === 'STOCK_CONFLICT' || errMsg.includes('STOCK_CONFLICT')) {
          conflictCount++;
          await updateOutboxItemStatus(item.localTransactionId, {
            status: 'STOCK_CONFLICT',
            errorCode: 'STOCK_CONFLICT',
            errorMessage: errMsg.replace('STOCK_CONFLICT:', '').trim(),
          });
          continue;
        }

        // Other validation/business errors — isolate failure without aborting entire queue
        failedCount++;
        await updateOutboxItemStatus(item.localTransactionId, {
          status: 'FAILED',
          errorCode: String(status || 'ERR_REJECTED'),
          errorMessage: errMsg,
        });
      }
    }

    // 4. Download latest delta changes & update local IndexedDB cache
    try {
      const deltaRes = await api.get('/sync/delta', {
        headers: { 'x-shop-id': activeShop },
      });
      const delta = deltaRes.data;

      if (delta) {
        if (delta.products && delta.products.length > 0) {
          const productRows = delta.products.map((p: any) => ({
            ...p,
            compoundKey: `${activeShop}:${p.id}`,
            shopId: activeShop,
          }));
          await idbBulkPut('products', productRows);
        }
        if (delta.customers && delta.customers.length > 0) {
          const custRows = delta.customers.map((c: any) => ({
            ...c,
            compoundKey: `${activeShop}:${c.id}`,
            shopId: activeShop,
          }));
          await idbBulkPut('customers', custRows);
        }
        if (delta.suppliers && delta.suppliers.length > 0) {
          const suppRows = delta.suppliers.map((s: any) => ({
            ...s,
            compoundKey: `${activeShop}:${s.id}`,
            shopId: activeShop,
          }));
          await idbBulkPut('suppliers', suppRows);
        }
      }
    } catch {
      // Delta download is best-effort
    }

    setLastSyncTime(Date.now());
    setGlobalNetworkState('ONLINE');

    // 5. Revalidate visible UI caches (SWR)
    mutate(() => true);
  } finally {
    runningShops.delete(activeShop);
  }

  return { syncedCount, failedCount, conflictCount };
}

/**
 * Backward compatibility alias for legacy call sites.
 */
export async function flushOfflineSales() {
  return flushOfflineTransactions();
}
