/**
 * Automated Type-Safe Offline Engine Test Suite
 */

import { sortOutboxItemsDynamically, substituteCommittedServerIds, OutboxItem } from '../lib/offline/dependencyGraph';
import { generateOfflineRefNumber } from '../lib/offline/offlineNumbering';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

export function runSuite() {
  console.log('Running test suite...');

  // Test 1: Topological Outbox Sorting
  const baseItem: Partial<OutboxItem> = {
    shopId: 'shop-1',
    userId: 'user-1',
    deviceId: 'DEV01',
    status: 'PENDING',
    retryCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const items: OutboxItem[] = [
    {
      ...baseItem,
      localTransactionId: 'tx-sale-1',
      transactionType: 'sale',
      entityType: 'sale',
      payload: { customerId: 'temp-cust-1', items: [{ productId: 'temp-prod-1' }] },
      idempotencyKey: 'idemp-1',
    } as OutboxItem,
    {
      ...baseItem,
      localTransactionId: 'tx-cust-1',
      entityId: 'temp-cust-1',
      transactionType: 'customer',
      entityType: 'customer',
      payload: { name: 'Customer A' },
      idempotencyKey: 'idemp-2',
    } as OutboxItem,
    {
      ...baseItem,
      localTransactionId: 'tx-prod-1',
      entityId: 'temp-prod-1',
      transactionType: 'product',
      entityType: 'product',
      payload: { name: 'Product A' },
      idempotencyKey: 'idemp-3',
    } as OutboxItem,
  ];

  const sorted = sortOutboxItemsDynamically(items);
  const sortedIds = sorted.map(i => i.localTransactionId);

  const idxCust = sortedIds.indexOf('tx-cust-1');
  const idxProd = sortedIds.indexOf('tx-prod-1');
  const idxSale = sortedIds.indexOf('tx-sale-1');

  assert(idxCust < idxSale, 'Customer transaction comes before Sale');
  assert(idxProd < idxSale, 'Product transaction comes before Sale');

  // Test 2: Server ID substitution
  const serverMap = new Map<string, string>([
    ['temp-cust-1', 'server-cust-uuid'],
    ['temp-prod-1', 'server-prod-uuid'],
  ]);

  const payload = {
    customerId: 'temp-cust-1',
    items: [{ productId: 'temp-prod-1', price: 100 }],
  };

  const substituted = substituteCommittedServerIds(payload, serverMap);
  assert(substituted.customerId === 'server-cust-uuid', 'Replaced temp customer ID');
  assert(substituted.items[0].productId === 'server-prod-uuid', 'Replaced temp product ID');

  // Test 3: Offline Ref format
  const ref = generateOfflineRefNumber('OFF');
  assert(ref.startsWith('OFF-'), 'Offline ref format matches prefix');

  console.log('All tests passed in test-offline-sync.ts');
}

if (typeof window === 'undefined') {
  try {
    // Only run if not in SSR bundle
  } catch {}
}
