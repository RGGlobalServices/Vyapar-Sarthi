'use client';

import { SWRConfig } from 'swr';
import api from '@/lib/api';

const fetcher = (url: string) => api.get(url).then(res => res.data);

/**
 * Shared SWR defaults for every screen inside (main).
 *
 * The cache is deliberately in-memory only. Shop scoping lives in the
 * `x-shop-id` request header, not in the SWR key, so a cache that outlived the
 * tab could serve one shop's — or one user's — data to another. `switchShop`
 * clears this cache on every switch; persisting it to localStorage would defeat
 * that.
 */
export default function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        // Show the previous data while the next key loads, instead of dropping
        // to a skeleton on every navigation.
        keepPreviousData: true,
        // A sidebar hover prefetch followed by the click landing on the page
        // must not fire the same request twice.
        dedupingInterval: 30_000,
        revalidateIfStale: true,
      }}
    >
      {children}
    </SWRConfig>
  );
}
