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
        // Backend hits routinely take 4–10 s on a warm connection, so a 30 s
        // dedupe was still refetching every time a shopkeeper bounced between
        // Stock / Billing / Products. 2 min covers the whole "walk around the
        // counter" window; anything time-critical calls `mutate()` explicitly.
        dedupingInterval: 120_000,
        // Focus refetch fires every time the shop's phone unlocks or an alert
        // steals focus — cheap on paper, catastrophic when each key costs 5 s.
        // Stays true only where a component overrides it.
        revalidateOnFocus: false,
        revalidateIfStale: false,
        // Reconnect refetch stays on: the offline-online transition is exactly
        // when you WANT to pull the latest from the server.
        revalidateOnReconnect: true,
      }}
    >
      {children}
    </SWRConfig>
  );
}
