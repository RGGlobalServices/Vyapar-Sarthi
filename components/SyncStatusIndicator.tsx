'use client';

import React, { useState } from 'react';
import { useNetworkStatus } from '@/lib/offline/networkStatus';
import { flushOfflineTransactions } from '@/lib/offlineSync';
import SyncCenterModal from './SyncCenterModal';
import { cn } from '@/lib/utils';
import { Wifi, WifiOff, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SyncStatusIndicator({ shopId }: { shopId?: string | null }) {
  const status = useNetworkStatus(shopId);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const totalActionable = status.pendingCount + status.failedCount + status.conflictCount;

  const handleQuickSync = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (status.state === 'SYNCING') return;
    toast.promise(flushOfflineTransactions(shopId || undefined), {
      loading: 'Syncing pending changes...',
      success: (res) => {
        if (res.conflictCount > 0) return `Synced ${res.syncedCount} items, ${res.conflictCount} conflicts need review.`;
        if (res.failedCount > 0) return `Synced ${res.syncedCount} items, ${res.failedCount} failed.`;
        return `All changes synced successfully! (${res.syncedCount} items)`;
      },
      error: 'Unable to connect to server. Saved locally.',
    });
  };

  const formattedLastSync = status.lastSyncedAt
    ? new Date(status.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Not yet';

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        title={`Status: ${status.state} | Last synced: ${formattedLastSync}`}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all select-none shadow-sm",
          status.state === 'ONLINE' && totalActionable === 0 && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20",
          status.state === 'SYNCING' && "bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20",
          status.state === 'OFFLINE' && "bg-rose-500/10 text-rose-500 border-rose-500/20 hover:bg-rose-500/20 animate-pulse",
          status.state === 'SERVER_UNAVAILABLE' && "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/20",
          (status.conflictCount > 0 || status.failedCount > 0) && "bg-orange-500/10 text-orange-500 border-orange-500/30 hover:bg-orange-500/20"
        )}
      >
        {status.state === 'ONLINE' && totalActionable === 0 && (
          <>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="hidden sm:inline">Online</span>
          </>
        )}

        {status.state === 'SYNCING' && (
          <>
            <RefreshCw size={13} className="animate-spin text-amber-500" />
            <span className="hidden sm:inline">Syncing ({totalActionable})</span>
          </>
        )}

        {status.state === 'OFFLINE' && (
          <>
            <WifiOff size={13} className="text-rose-500" />
            <span>Offline {totalActionable > 0 && `(${totalActionable})`}</span>
          </>
        )}

        {status.state === 'SERVER_UNAVAILABLE' && (
          <>
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>Server Unavailable {totalActionable > 0 && `(${totalActionable})`}</span>
          </>
        )}

        {status.state === 'ONLINE' && totalActionable > 0 && (
          <>
            <AlertCircle size={13} className="text-orange-500" />
            <span>Pending ({totalActionable})</span>
          </>
        )}
      </button>

      {isModalOpen && (
        <SyncCenterModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          shopId={shopId}
          onSyncNow={handleQuickSync}
        />
      )}
    </>
  );
}
