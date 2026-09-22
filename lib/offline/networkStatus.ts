'use client';

import { useEffect, useState } from 'react';
import { OUTBOX_CHANGED_EVENT, getOutboxItems } from './outbox';

export type NetworkState = 'ONLINE' | 'SYNCING' | 'OFFLINE' | 'SERVER_UNAVAILABLE' | 'SYNC_ERROR';

export interface NetworkStatusInfo {
  state: NetworkState;
  isOnline: boolean;
  isServerAvailable: boolean;
  pendingCount: number;
  syncingCount: number;
  failedCount: number;
  conflictCount: number;
  lastSyncedAt: number | null;
}

let globalNetworkState: NetworkState = 'ONLINE';
let lastSuccessfulSyncTimestamp: number | null = null;
const STATE_CHANGED_EVENT = 'vyapar_network_state_changed';

export function getGlobalNetworkState(): NetworkState {
  return globalNetworkState;
}

export function setGlobalNetworkState(newState: NetworkState) {
  if (globalNetworkState !== newState) {
    globalNetworkState = newState;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(STATE_CHANGED_EVENT));
    }
  }
}

export function setLastSyncTime(timestamp: number) {
  lastSuccessfulSyncTimestamp = timestamp;
  if (typeof window !== 'undefined') {
    localStorage.setItem('vyapar_last_synced_at', String(timestamp));
    window.dispatchEvent(new Event(STATE_CHANGED_EVENT));
  }
}

export function getLastSyncTime(): number | null {
  if (lastSuccessfulSyncTimestamp) return lastSuccessfulSyncTimestamp;
  if (typeof window !== 'undefined') {
    const raw = localStorage.getItem('vyapar_last_synced_at');
    if (raw) {
      lastSuccessfulSyncTimestamp = parseInt(raw, 10);
      return lastSuccessfulSyncTimestamp;
    }
  }
  return null;
}

/**
 * Pings the server health endpoint.
 */
export async function checkServerHealth(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setGlobalNetworkState('OFFLINE');
    return false;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch('/api/v1/health', {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      if (globalNetworkState === 'SERVER_UNAVAILABLE' || globalNetworkState === 'OFFLINE') {
        setGlobalNetworkState('ONLINE');
      }
      return true;
    } else {
      setGlobalNetworkState('SERVER_UNAVAILABLE');
      return false;
    }
  } catch {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setGlobalNetworkState('OFFLINE');
    } else {
      setGlobalNetworkState('SERVER_UNAVAILABLE');
    }
    return false;
  }
}

/**
 * React hook exposing reactive network status and outbox counts.
 */
export function useNetworkStatus(shopId?: string | null): NetworkStatusInfo {
  const [state, setState] = useState<NetworkState>(globalNetworkState);
  const [counts, setCounts] = useState({
    pending: 0,
    syncing: 0,
    failed: 0,
    conflict: 0,
  });
  const [lastSync, setLastSync] = useState<number | null>(getLastSyncTime());

  useEffect(() => {
    let mounted = true;

    async function updateCounts() {
      if (!mounted || !shopId) return;
      try {
        const items = await getOutboxItems(shopId);
        if (!mounted) return;
        setCounts({
          pending: items.filter(i => i.status === 'PENDING').length,
          syncing: items.filter(i => i.status === 'SYNCING').length,
          failed: items.filter(i => i.status === 'FAILED').length,
          conflict: items.filter(i => i.status === 'STOCK_CONFLICT' || i.status === 'CONFLICT').length,
        });
        setLastSync(getLastSyncTime());
        setState(globalNetworkState);
      } catch {}
    }

    updateCounts();

    const handleStateChange = () => {
      setState(globalNetworkState);
      setLastSync(getLastSyncTime());
      updateCounts();
    };

    const handleOnline = () => {
      checkServerHealth();
    };

    const handleOffline = () => {
      setGlobalNetworkState('OFFLINE');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener(STATE_CHANGED_EVENT, handleStateChange);
    window.addEventListener(OUTBOX_CHANGED_EVENT, updateCounts);

    // Heartbeat check every 25 seconds
    const interval = setInterval(() => {
      checkServerHealth();
    }, 25000);

    return () => {
      mounted = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener(STATE_CHANGED_EVENT, handleStateChange);
      window.removeEventListener(OUTBOX_CHANGED_EVENT, updateCounts);
      clearInterval(interval);
    };
  }, [shopId]);

  return {
    state,
    isOnline: state === 'ONLINE' || state === 'SYNCING',
    isServerAvailable: state !== 'OFFLINE' && state !== 'SERVER_UNAVAILABLE',
    pendingCount: counts.pending,
    syncingCount: counts.syncing,
    failedCount: counts.failed,
    conflictCount: counts.conflict,
    lastSyncedAt: lastSync,
  };
}
