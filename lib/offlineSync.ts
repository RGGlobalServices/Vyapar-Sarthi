'use client';

import api from '@/lib/api';
import { getQueuedSales, removeQueuedSale, isNetworkError } from '@/lib/offlineCache';

let syncing = false;

/**
 * Replays bills that were created while offline, in the order they were made.
 * Stock on the server is decremented for real at this point (it may already
 * be low or go negative if another device sold the same item in the
 * meantime) — that's intentional: the sale already happened at the counter
 * and must not be lost, so it's recorded as-is and the shop's existing
 * low-stock alert is what flags it for review, rather than blocking sync.
 */
export async function flushOfflineSales() {
  if (syncing) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  syncing = true;
  try {
    for (const sale of getQueuedSales()) {
      try {
        await api.post('/billing/', sale.payload);
        removeQueuedSale(sale.localId);
      } catch (err) {
        if (isNetworkError(err)) break; // lost the connection again — stop, retry later
        // A real server-side rejection would never succeed on retry either;
        // drop it rather than blocking every sale queued after it forever.
        console.error('Offline sale rejected by server, dropping:', sale.localId, err);
        removeQueuedSale(sale.localId);
      }
    }
  } finally {
    syncing = false;
  }
}
