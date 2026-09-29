'use client';

import { mutate } from 'swr';

/**
 * Invalidate every SWR cache entry whose key targets a given API prefix,
 * regardless of whether the caller keyed it as a plain string (`/products`,
 * `/products?shop=x`) or as a tuple (`['/products', shopId]`).
 *
 * The billing screen uses tuple keys so it can key by active shop; almost
 * everything else keys by string. A stock update in one screen must reach the
 * other, so the matcher checks both shapes — otherwise Edit Stock / Add Stock /
 * Receive updates from the Stock or Products screens silently miss the billing
 * cart's product list and the cashier keeps seeing the old count.
 */
export function invalidateApiCache(prefix: string) {
  mutate(
    (key) => {
      if (typeof key === 'string') return key.startsWith(prefix);
      if (Array.isArray(key)) return typeof key[0] === 'string' && (key[0] as string).startsWith(prefix);
      return false;
    },
    undefined,
    { revalidate: true }
  );
}

/**
 * Everything that changes what the billing screen needs to show for products:
 * stock counts, new/edited products, price changes. Callers don't have to
 * remember which screens read from which SWR key.
 */
export function invalidateProductCaches() {
  invalidateApiCache('/products');
}

/**
 * Fires when a return closes on the backend: the customer ledger, product
 * stock, dashboard KPIs, cashbook, and returns history all read stale.
 * Named for the whole side-effect surface rather than any one page, so a
 * caller just says "return happened" and every screen that touches those
 * numbers re-fetches on next mount — no per-page mutate() sprinkling.
 */
export function invalidateReturnCaches() {
  invalidateApiCache('/products');
  invalidateApiCache('/crm/customers');
  invalidateApiCache('/customers');
  invalidateApiCache('/reports/dashboard');
  invalidateApiCache('/reports');
  invalidateApiCache('/cashbook');
  invalidateApiCache('/billing');
  invalidateApiCache('/returns');
  invalidateApiCache('/crm/pending-bills');
  // useUdharStore is Zustand (not SWR) — silentRefresh syncs it after a return
  // clears/reduces a customer's outstanding balance.
  // Lazy import avoids circular dependency (store.ts → swrInvalidate.ts).
  import('@/lib/store').then(({ useUdharStore }) => {
    useUdharStore.getState().silentRefresh();
  }).catch(() => {});
}
