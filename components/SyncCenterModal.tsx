'use client';

import React, { useEffect, useState } from 'react';
import { useNetworkStatus } from '@/lib/offline/networkStatus';
import { getOutboxItems, updateOutboxItemStatus, removeOutboxItem } from '@/lib/offline/outbox';
import { flushOfflineTransactions } from '@/lib/offlineSync';
import { OutboxItem } from '@/lib/offline/dependencyGraph';
import { cn } from '@/lib/utils';
import { 
  X, RefreshCw, AlertTriangle, CheckCircle2, Wifi, 
  WifiOff, Clock, ShieldAlert, ArrowRight, Trash2, Check 
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function SyncCenterModal({
  isOpen,
  onClose,
  shopId,
  onSyncNow,
}: {
  isOpen: boolean;
  onClose: () => void;
  shopId?: string | null;
  onSyncNow?: (e: React.MouseEvent) => void;
}) {
  const status = useNetworkStatus(shopId);
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const activeShop = shopId || (typeof window !== 'undefined' ? localStorage.getItem('ks_active_shop_id') : '');

  async function loadItems() {
    if (!activeShop) return;
    try {
      const data = await getOutboxItems(activeShop);
      setItems(data);
    } catch {}
  }

  useEffect(() => {
    if (isOpen) {
      loadItems();
    }
  }, [isOpen, activeShop, status.pendingCount, status.syncingCount, status.failedCount]);

  if (!isOpen) return null;

  const handleManualSync = async () => {
    setLoading(true);
    try {
      const res = await flushOfflineTransactions(activeShop || undefined);
      await loadItems();
      if (res.conflictCount > 0) {
        toast.error(`${res.conflictCount} item(s) have stock conflicts.`);
      } else if (res.failedCount > 0) {
        toast.error(`${res.failedCount} item(s) failed. Check details below.`);
      } else if (res.syncedCount > 0) {
        toast.success(`Successfully synced ${res.syncedCount} transaction(s)!`);
      } else {
        toast.success('All transactions are up to date.');
      }
    } catch {
      toast.error('Sync failed. Please check internet connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleAllowNegativeStock = async (item: OutboxItem) => {
    setResolvingId(item.localTransactionId);
    try {
      await updateOutboxItemStatus(item.localTransactionId, {
        status: 'PENDING',
        payload: {
          ...item.payload,
          allowNegativeStock: true,
          allow_negative_stock: true,
        },
        errorCode: null,
        errorMessage: null,
      });
      toast.success('Allowed negative stock for this invoice. Syncing...');
      await handleManualSync();
    } catch {
      toast.error('Failed to update transaction.');
    } finally {
      setResolvingId(null);
    }
  };

  const handleDiscard = async (localTxId: string) => {
    if (!confirm('Are you sure you want to discard this offline transaction? This action cannot be undone.')) {
      return;
    }
    await removeOutboxItem(localTxId);
    await loadItems();
    toast.success('Transaction discarded.');
  };

  const getEntityTitle = (item: OutboxItem): string => {
    const p = item.payload || {};
    if (item.entityType === 'sale' || item.transactionType === 'sale') {
      const total = p.totalAmount ? `₹${p.totalAmount.toLocaleString()}` : '';
      const ref = p.offlineRefNumber || item.entityId || 'Bill';
      return `Sales Invoice (${ref}) ${total ? '• ' + total : ''}`;
    }
    if (item.entityType === 'purchase' || item.transactionType === 'purchase') {
      const total = p.totalCost ? `₹${p.totalCost.toLocaleString()}` : '';
      return `Purchase Invoice ${total ? '• ' + total : ''}`;
    }
    if (item.entityType === 'customer') {
      return `New Customer: ${p.name || 'Unnamed'}`;
    }
    if (item.entityType === 'supplier') {
      return `New Supplier: ${p.name || 'Unnamed'}`;
    }
    if (item.entityType === 'product') {
      return `New Product: ${p.name || 'Unnamed'}`;
    }
    if (item.entityType === 'stock_adjustment') {
      return `Stock Adjustment: ${p.note || 'Inventory change'}`;
    }
    return `${item.entityType.toUpperCase()} Transaction`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div 
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-xl",
              status.state === 'ONLINE' ? "bg-emerald-500/10 text-emerald-500" :
              status.state === 'SYNCING' ? "bg-amber-500/10 text-amber-500" :
              status.state === 'OFFLINE' ? "bg-rose-500/10 text-rose-500" : "bg-amber-500/10 text-amber-500"
            )}>
              {status.state === 'ONLINE' ? <Wifi size={20} /> : <WifiOff size={20} />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Sync Status & Offline Centre</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Last synced: {status.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleString() : 'Never'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Status Notice Banner */}
        {status.state !== 'ONLINE' && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-3 flex items-center gap-3 text-xs text-amber-600 dark:text-amber-400 font-medium">
            <Clock size={16} className="flex-shrink-0" />
            <span>
              Offline Mode — Your work is saved safely on this device and will sync automatically when the connection returns.
            </span>
          </div>
        )}

        {/* Summary Metric Cards */}
        <div className="grid grid-cols-4 gap-3 p-6 border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/20">
          <div className="bg-white dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700 text-center">
            <span className="text-xl font-black text-slate-900 dark:text-white">{status.pendingCount}</span>
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mt-0.5">Pending</p>
          </div>
          <div className="bg-white dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700 text-center">
            <span className="text-xl font-black text-amber-500">{status.syncingCount}</span>
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mt-0.5">Syncing</p>
          </div>
          <div className="bg-white dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700 text-center">
            <span className="text-xl font-black text-orange-500">{status.conflictCount}</span>
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mt-0.5">Conflicts</p>
          </div>
          <div className="bg-white dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700 text-center">
            <span className="text-xl font-black text-rose-500">{status.failedCount}</span>
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mt-0.5">Failed</p>
          </div>
        </div>

        {/* Transaction Queue List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Offline Transactions Queue ({items.length})
            </h3>
            <span className="text-xs text-slate-400">Independent Atomic Sync</span>
          </div>

          {items.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <CheckCircle2 size={36} className="mx-auto text-emerald-500 mb-2 opacity-80" />
              <p className="font-semibold text-slate-700 dark:text-slate-300">All Changes Synced</p>
              <p className="text-xs mt-1">No pending transactions waiting on this device.</p>
            </div>
          ) : (
            items.map((item) => (
              <div 
                key={item.localTransactionId}
                className={cn(
                  "p-4 rounded-xl border transition-all space-y-2",
                  item.status === 'STOCK_CONFLICT' ? "bg-orange-500/5 border-orange-500/30" :
                  item.status === 'FAILED' ? "bg-rose-500/5 border-rose-500/30" :
                  item.status === 'SYNCING' ? "bg-amber-500/5 border-amber-500/30" :
                  "bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900 dark:text-white">
                        {getEntityTitle(item)}
                      </span>
                      <span className={cn(
                        "text-[10px] font-black uppercase px-2 py-0.5 rounded-md",
                        item.status === 'STOCK_CONFLICT' ? "bg-orange-500/20 text-orange-600 dark:text-orange-400" :
                        item.status === 'FAILED' ? "bg-rose-500/20 text-rose-600 dark:text-rose-400" :
                        item.status === 'SYNCING' ? "bg-amber-500/20 text-amber-600 dark:text-amber-400" :
                        "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                      )}>
                        {item.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Created: {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      {item.retryCount > 0 && ` • Retried ${item.retryCount} times`}
                    </p>
                  </div>

                  <button
                    onClick={() => handleDiscard(item.localTransactionId)}
                    title="Discard transaction"
                    className="text-slate-400 hover:text-rose-500 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {/* Conflict or Error Details */}
                {item.errorMessage && (
                  <div className="text-xs font-medium bg-slate-100 dark:bg-slate-900/60 p-2.5 rounded-lg border border-slate-200/50 dark:border-slate-700/50 flex items-start gap-2">
                    <AlertTriangle size={15} className="flex-shrink-0 text-amber-500 mt-0.5" />
                    <span className="text-slate-700 dark:text-slate-300 leading-tight">
                      {item.errorMessage}
                    </span>
                  </div>
                )}

                {/* Stock Conflict Resolution Actions */}
                {item.status === 'STOCK_CONFLICT' && (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      disabled={resolvingId === item.localTransactionId}
                      onClick={() => handleAllowNegativeStock(item)}
                      className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                    >
                      <Check size={14} />
                      <span>Allow Negative Stock & Sync</span>
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2">
            <span className={cn(
              "w-2.5 h-2.5 rounded-full",
              status.state === 'ONLINE' ? "bg-emerald-500" :
              status.state === 'SYNCING' ? "bg-amber-500 animate-ping" :
              status.state === 'OFFLINE' ? "bg-rose-500" : "bg-amber-400"
            )} />
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
              {status.state.replace('_', ' ')}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-xs font-bold transition-colors"
            >
              Close
            </button>
            <button
              disabled={loading || status.state === 'SYNCING'}
              onClick={handleManualSync}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm hover:shadow-md flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw size={14} className={cn(loading && "animate-spin")} />
              <span>{loading ? 'Syncing...' : 'Sync Now'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
