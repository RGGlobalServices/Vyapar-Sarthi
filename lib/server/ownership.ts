import prisma from '@/lib/server/prisma';
import { ApiError } from '@/lib/server/http';

// Single server-side ownership gate for ids that arrive in a request body,
// query string or path. requireShop() only proves WHICH shop the caller is
// acting for — it says nothing about whether the customerId / productId /
// supplierId ... they then send actually belong to that shop. Every route that
// reads, updates, deletes or links a shop-owned record by a client-supplied id
// must run this first, before any read or write.
//
// Uses count(), never findMany(): a foreign row is never loaded, and a miss is
// reported as 404 (not 403) so the response cannot be used to probe whether an
// id exists in someone else's shop.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type IdList = ReadonlyArray<string | null | undefined> | string | null | undefined;

export type OwnedRefs = {
  customerId?: IdList;
  supplierId?: IdList;
  productId?: IdList;
  godownId?: IdList;
  staffId?: IdList;
  orderId?: IdList;
  saleId?: IdList;
  purchaseInvoiceId?: IdList;
  gateEntryId?: IdList;
  weighbridgeEntryId?: IdList;
  rawMaterialLotId?: IdList;
  batchId?: IdList;
  importLogId?: IdList;
};

type Counter = (ids: string[], shopId: string) => Promise<number>;

const p: any = prisma;
const byShop = (model: string): Counter => (ids, shopId) =>
  p[model].count({ where: { id: { in: ids }, shopId } });

const COUNTERS: Record<keyof OwnedRefs, { label: string; count: Counter }> = {
  customerId: { label: 'Customer', count: byShop('customer') },
  supplierId: { label: 'Supplier', count: byShop('supplier') },
  productId: { label: 'Product', count: byShop('product') },
  godownId: { label: 'Warehouse', count: byShop('godown') },
  staffId: { label: 'Staff member', count: byShop('staff') },
  orderId: { label: 'Order', count: byShop('order') },
  saleId: { label: 'Sale', count: byShop('sale') },
  purchaseInvoiceId: { label: 'Purchase invoice', count: byShop('purchaseInvoice') },
  gateEntryId: { label: 'Gate entry', count: byShop('gateEntry') },
  weighbridgeEntryId: { label: 'Weighbridge entry', count: byShop('weighbridgeEntry') },
  rawMaterialLotId: { label: 'Raw material lot', count: byShop('rawMaterialLot') },
  batchId: { label: 'Batch', count: byShop('batch') },
  importLogId: { label: 'Import job', count: byShop('importLog') },
};

function normalise(v: IdList): string[] {
  const list = Array.isArray(v) ? v : [v];
  const out = new Set<string>();
  for (const x of list as Array<string | null | undefined>) {
    if (x === null || x === undefined || x === '') continue;
    out.add(String(x));
  }
  return [...out];
}

/**
 * Throws ApiError unless EVERY supplied id belongs to `shopId`.
 * - Omitted / null / '' values are ignored (optional relations stay optional).
 * - Malformed ids -> 400. Any id not in this shop -> 404 for the whole request,
 *   so a mixed valid + foreign list is rejected before anything is written.
 */
export async function assertOwned(shopId: string, refs: OwnedRefs): Promise<void> {
  const checks: Array<Promise<void>> = [];

  for (const key of Object.keys(refs) as Array<keyof OwnedRefs>) {
    const ids = normalise(refs[key]);
    if (ids.length === 0) continue;
    const { label, count } = COUNTERS[key];

    if (ids.some(id => !UUID_RE.test(id))) {
      throw new ApiError(400, `Invalid ${label.toLowerCase()} id`);
    }

    checks.push(
      count(ids, shopId).then(n => {
        if (n !== ids.length) throw new ApiError(404, `${label} not found`);
      })
    );
  }

  await Promise.all(checks);
}

/** Convenience: pull `productId` out of a line-item array. */
export function idsOf<T extends Record<string, any>>(items: T[] | null | undefined, key: string): string[] {
  return (items || []).map(i => i?.[key]).filter(Boolean);
}
