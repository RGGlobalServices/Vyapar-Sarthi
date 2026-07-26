'use client';

import { useEffect, useState } from 'react';
import { getQueuedSales, QUEUE_CHANGED_EVENT } from '@/lib/offlineCache';

export function useOnlineStatus() {
  // Defaults to true so SSR/first paint doesn't flash an "offline" banner.
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return isOnline;
}

/** Number of bills created offline that are still waiting to reach the server. */
export function useOfflineQueueCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const update = () => setCount(getQueuedSales().length);
    update();
    window.addEventListener(QUEUE_CHANGED_EVENT, update);
    window.addEventListener('online', update);
    return () => {
      window.removeEventListener(QUEUE_CHANGED_EVENT, update);
      window.removeEventListener('online', update);
    };
  }, []);

  return count;
}
