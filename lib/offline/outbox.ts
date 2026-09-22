'use client';

import { idbGet, idbPut, idbGetAllByShop, idbDelete } from './idb';
import { getDeviceId } from './device';
import { OutboxItem } from './dependencyGraph';

export const OUTBOX_CHANGED_EVENT = 'vyapar_outbox_changed';

function dispatchOutboxChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(OUTBOX_CHANGED_EVENT));
  }
}

/**
 * Enqueues a transaction into the IndexedDB outbox.
 */
export async function enqueueTransaction(params: {
  shopId: string;
  userId: string;
  transactionType: string;
  entityType: string;
  entityId?: string | null;
  payload: any;
  dependsOnLocalIds?: string[];
}): Promise<OutboxItem> {
  const deviceId = getDeviceId();
  const localTransactionId = `TX-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const idempotencyKey = `${deviceId}:${localTransactionId}`;
  const now = Date.now();

  const item: OutboxItem = {
    localTransactionId,
    shopId: params.shopId,
    userId: params.userId,
    deviceId,
    transactionType: params.transactionType,
    entityType: params.entityType,
    entityId: params.entityId || null,
    payload: params.payload,
    dependsOnLocalIds: params.dependsOnLocalIds || [],
    createdAt: now,
    updatedAt: now,
    status: 'PENDING',
    retryCount: 0,
    lastAttemptAt: null,
    errorCode: null,
    errorMessage: null,
    idempotencyKey,
  };

  await idbPut('outbox', item);
  dispatchOutboxChanged();
  return item;
}

/**
 * Returns all outbox transactions for the specified shop.
 */
export async function getOutboxItems(shopId: string): Promise<OutboxItem[]> {
  if (!shopId) return [];
  const items = await idbGetAllByShop<OutboxItem>('outbox', shopId);
  return items.sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Returns pending or retryable outbox transactions for the shop.
 */
export async function getPendingOutboxItems(shopId: string): Promise<OutboxItem[]> {
  const all = await getOutboxItems(shopId);
  return all.filter(item => item.status === 'PENDING' || item.status === 'STOCK_CONFLICT' || item.status === 'CONFLICT');
}

/**
 * Updates status and metadata of an outbox transaction.
 */
export async function updateOutboxItemStatus(
  localTransactionId: string,
  updates: Partial<Pick<OutboxItem, 'status' | 'retryCount' | 'lastAttemptAt' | 'errorCode' | 'errorMessage' | 'payload'>>
): Promise<void> {
  const existing = await idbGet<OutboxItem>('outbox', localTransactionId);
  if (!existing) return;

  const updated: OutboxItem = {
    ...existing,
    ...updates,
    updatedAt: Date.now(),
  };

  await idbPut('outbox', updated);
  dispatchOutboxChanged();
}

/**
 * Removes a completed or discarded outbox transaction.
 */
export async function removeOutboxItem(localTransactionId: string): Promise<void> {
  await idbDelete('outbox', localTransactionId);
  dispatchOutboxChanged();
}
