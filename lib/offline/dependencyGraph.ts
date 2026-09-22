'use client';

export interface OutboxItem {
  localTransactionId: string;
  shopId: string;
  userId: string;
  deviceId: string;
  transactionType: string;
  entityType: string;
  entityId?: string | null;
  payload: any;
  dependsOnLocalIds?: string[];
  createdAt: number;
  updatedAt: number;
  status: 'PENDING' | 'SYNCING' | 'SYNCED' | 'STOCK_CONFLICT' | 'CONFLICT' | 'FAILED';
  retryCount: number;
  lastAttemptAt?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  idempotencyKey: string;
}

/**
 * Extracts any referenced local temporary IDs from an outbox item payload.
 */
export function extractLocalDependencies(payload: any, declaredDependsOn: string[] = []): string[] {
  const deps = new Set<string>(declaredDependsOn);

  if (!payload || typeof payload !== 'object') return Array.from(deps);

  // Common foreign key fields that might point to temporary local IDs
  const fkKeys = [
    'customerId', 'customer_id',
    'supplierId', 'supplier_id',
    'productId', 'product_id',
    'gateEntryId', 'gate_entry_id',
    'weighbridgeId', 'weighbridge_id',
    'rawLotId', 'raw_lot_id',
    'batchId', 'batch_id',
    'purchaseInvoiceId', 'purchase_invoice_id',
    'orderId', 'order_id',
    'machineId', 'machine_id',
    'sheetId', 'sheet_id',
  ];

  for (const key of fkKeys) {
    const val = payload[key];
    if (typeof val === 'string' && (val.startsWith('temp_') || val.startsWith('temp-') || val.startsWith('OFF-') || val.startsWith('OFFLINE-'))) {
      deps.add(val);
    }
  }

  // Check nested arrays (e.g. items in bill, items in purchase)
  if (Array.isArray(payload.items)) {
    for (const item of payload.items) {
      if (item && typeof item === 'object') {
        for (const key of fkKeys) {
          const val = item[key];
          if (typeof val === 'string' && (val.startsWith('temp_') || val.startsWith('temp-') || val.startsWith('OFF-') || val.startsWith('OFFLINE-'))) {
            deps.add(val);
          }
        }
      }
    }
  }

  return Array.from(deps);
}

/**
 * Performs a dynamic topological sort on outbox items using a Directed Acyclic Graph (DAG).
 * Items that have no unresolved dependencies come first.
 */
export function sortOutboxItemsDynamically(items: OutboxItem[]): OutboxItem[] {
  if (items.length <= 1) return items;

  const itemMap = new Map<string, OutboxItem>();
  const idByLocalId = new Set<string>();

  for (const item of items) {
    itemMap.set(item.localTransactionId, item);
    idByLocalId.add(item.localTransactionId);
    if (item.entityId) idByLocalId.add(item.entityId);
  }

  // Build dependency adjacency list
  const adj = new Map<string, Set<string>>();
  const inDegree = new Map<string, number>();

  for (const item of items) {
    const id = item.localTransactionId;
    if (!adj.has(id)) adj.set(id, new Set());
    if (!inDegree.has(id)) inDegree.set(id, 0);

    const deps = extractLocalDependencies(item.payload, item.dependsOnLocalIds || []);
    for (const dep of deps) {
      // Find which outbox item produces this dependency
      for (const candidate of items) {
        if (candidate.localTransactionId === dep || candidate.entityId === dep) {
          const parentId = candidate.localTransactionId;
          if (parentId !== id) {
            if (!adj.has(parentId)) adj.set(parentId, new Set());
            if (!adj.get(parentId)!.has(id)) {
              adj.get(parentId)!.add(id);
              inDegree.set(id, (inDegree.get(id) || 0) + 1);
            }
          }
        }
      }
    }
  }

  // Queue nodes with 0 in-degree
  const queue: string[] = [];
  for (const [id, degree] of inDegree.entries()) {
    if (degree === 0) queue.push(id);
  }

  // Stable secondary tiebreaker: creation timestamp
  queue.sort((a, b) => (itemMap.get(a)?.createdAt || 0) - (itemMap.get(b)?.createdAt || 0));

  const sorted: OutboxItem[] = [];

  while (queue.length > 0) {
    const u = queue.shift()!;
    const item = itemMap.get(u);
    if (item) sorted.push(item);

    const neighbors = adj.get(u);
    if (neighbors) {
      for (const v of neighbors) {
        inDegree.set(v, (inDegree.get(v) || 0) - 1);
        if (inDegree.get(v) === 0) {
          queue.push(v);
        }
      }
      queue.sort((a, b) => (itemMap.get(a)?.createdAt || 0) - (itemMap.get(b)?.createdAt || 0));
    }
  }

  // If cycle existed, append any remaining items
  if (sorted.length < items.length) {
    const sortedIds = new Set(sorted.map(s => s.localTransactionId));
    for (const item of items) {
      if (!sortedIds.has(item.localTransactionId)) {
        sorted.push(item);
      }
    }
  }

  return sorted;
}

/**
 * Replaces any temporary local IDs in a payload with their committed real server UUIDs.
 */
export function substituteCommittedServerIds(payload: any, idMap: Map<string, string>): any {
  if (!payload || typeof payload !== 'object' || idMap.size === 0) return payload;

  const clone = JSON.parse(JSON.stringify(payload));

  function replaceInObject(obj: any) {
    if (!obj || typeof obj !== 'object') return;

    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (typeof val === 'string' && idMap.has(val)) {
        obj[key] = idMap.get(val);
      } else if (typeof val === 'object') {
        replaceInObject(val);
      }
    }
  }

  replaceInObject(clone);
  return clone;
}
