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
