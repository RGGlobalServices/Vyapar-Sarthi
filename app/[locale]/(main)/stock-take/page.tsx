'use client';

import { useState, useMemo, useCallback } from 'react';
import useSWR from 'swr';
import {
  ListChecks, Plus, Search, X, Check, Loader2, AlertCircle,
  ArrowLeft, Ban, CheckCircle2,
} from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn } from '@/lib/utils';

const fetcher = (u: string) => api.get(u).then((r) => r.data);

type Session = {
  id: string; name: string | null; status: 'draft' | 'completed' | 'cancelled';
  startedAt: string; completedAt: string | null; itemCount: number;
};
type Item = {
  id: string; productId: string; productName: string; unit: string | null;
  systemQty: number; countedQty: number | null;
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function StockTakePage() {
  const activeShopId = useBusinessStore((s) => s.activeShopId);
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');

  const { data: sessions, isLoading, mutate: refetchList } = useSWR<Session[]>(
    activeShopId ? ['/stock-take', activeShopId] : null, ([u]) => fetcher(u),
  );

  const handleStart = async () => {
    setStarting(true);
    setStartError('');
    try {
      const res = await api.post('/stock-take', {});
      setOpenSessionId(res.data.id);
      refetchList();
    } catch (err: any) {
      setStartError(err?.response?.data?.error || 'Failed to start stock take.');
    } finally {
      setStarting(false);
    }
  };

  if (openSessionId) {
    return (
      <SessionView
        sessionId={openSessionId}
        onBack={() => { setOpenSessionId(null); refetchList(); }}
      />
    );
  }

  const draftSession = (sessions || []).find((s) => s.status === 'draft');

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ListChecks size={22} className="text-emerald-600" /> Stock Take
          </h1>
          <p className="text-sm text-slate-500 mt-1">Physically count your shop's stock, compare against the system, and fix the difference in one go.</p>
        </div>
        {!draftSession && (
          <button
            onClick={handleStart}
            disabled={starting}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors"
          >
            {starting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Start Stock Take
          </button>
        )}
      </div>

      {startError && (
        <div className="p-3 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-500/30 flex items-center gap-2 text-sm">
          <AlertCircle size={16} /> {startError}
        </div>
      )}

      {draftSession && (
        <button
          onClick={() => setOpenSessionId(draftSession.id)}
          className="w-full flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl hover:border-amber-400 transition-colors"
        >
          <div className="text-left">
            <p className="font-bold text-amber-800 dark:text-amber-300">A stock take is in progress{draftSession.name ? ` — ${draftSession.name}` : ''}</p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Started {fmtDate(draftSession.startedAt)} · {draftSession.itemCount} products</p>
          </div>
          <span className="text-sm font-bold text-amber-700 dark:text-amber-400">Continue →</span>
        </button>
      )}

      {isLoading ? (
        <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-emerald-500" size={28} /></div>
      ) : (sessions || []).filter((s) => s.status !== 'draft').length === 0 ? (
        <div className="p-16 text-center text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <ListChecks size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-bold">No stock takes done yet</p>
          <p className="text-sm mt-1">Start one to count and reconcile your shop's stock.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase">
              <tr>
                <th className="px-4 py-3">Name</th><th className="px-4 py-3">Started</th>
                <th className="px-4 py-3 text-center">Products</th><th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(sessions || []).filter((s) => s.status !== 'draft').map((s) => (
                <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer" onClick={() => setOpenSessionId(s.id)}>
                  <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">{s.name || 'Stock Take'}</td>
                  <td className="px-4 py-3 text-slate-500">{fmtDate(s.startedAt)}</td>
                  <td className="px-4 py-3 text-center">{s.itemCount}</td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'px-2 py-1 rounded-full text-[10px] font-bold uppercase',
                      s.status === 'completed' ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                    )}>{s.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Active/Past Session Counting View ─────────────────────────────────────
function SessionView({ sessionId, onBack }: { sessionId: string; onBack: () => void }) {
  const [search, setSearch] = useState('');
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<{ adjustedCount: number } | null>(null);
  const [error, setError] = useState('');

  const { data: session, mutate, isLoading } = useSWR<{ id: string; name: string | null; status: string; items: Item[] }>(
    ['/stock-take', sessionId], () => fetcher(`/stock-take/${sessionId}`),
  );

  const items = session?.items || [];
  const isDraft = session?.status === 'draft';
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((i) => i.productName.toLowerCase().includes(needle));
  }, [items, search]);

  const countedCount = items.filter((i) => i.countedQty !== null).length;
  const varianceCount = items.filter((i) => i.countedQty !== null && i.countedQty !== i.systemQty).length;

  const saveCount = useCallback(async (itemId: string, value: string) => {
    const countedQty = value === '' ? null : Number(value);
    setSavingIds((prev) => new Set(prev).add(itemId));
    // Optimistic local update so typing feels instant.
    mutate((prev) => prev ? { ...prev, items: prev.items.map((i) => i.id === itemId ? { ...i, countedQty } : i) } : prev, { revalidate: false });
    try {
      await api.patch(`/stock-take/${sessionId}`, { action: 'count', itemId, countedQty });
    } catch {
      mutate();
    } finally {
      setSavingIds((prev) => { const next = new Set(prev); next.delete(itemId); return next; });
    }
  }, [sessionId, mutate]);

  const handleCommit = async () => {
    if (!confirm(`Apply ${varianceCount} stock correction${varianceCount === 1 ? '' : 's'} now? This updates real stock.`)) return;
    setCommitting(true);
    setError('');
    try {
      const res = await api.patch(`/stock-take/${sessionId}`, { action: 'commit' });
      setResult({ adjustedCount: res.data.adjustedCount });
      mutate();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to apply stock take.');
    } finally {
      setCommitting(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Cancel this stock take? Nothing counted so far will be applied.')) return;
    await api.patch(`/stock-take/${sessionId}`, { action: 'cancel' });
    onBack();
  };

  if (isLoading || !session) {
    return <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-emerald-500" size={28} /></div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{session.name || 'Stock Take'}</h1>
          <p className="text-xs text-slate-500">{countedCount} of {items.length} counted · {varianceCount} variance{varianceCount === 1 ? '' : 's'}</p>
        </div>
      </div>

      {result && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-bold text-sm">
          <CheckCircle2 size={18} /> Applied — {result.adjustedCount} product{result.adjustedCount === 1 ? '' : 's'} corrected.
        </div>
      )}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-500/30 flex items-center gap-2 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {isDraft && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product…"
            className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase sticky top-0">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3 text-right">System Qty</th>
                <th className="px-4 py-3 text-right w-32">Counted Qty</th>
                <th className="px-4 py-3 text-right">Difference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((item) => {
                const diff = item.countedQty !== null ? item.countedQty - item.systemQty : null;
                return (
                  <tr key={item.id} className={cn('hover:bg-slate-50 dark:hover:bg-slate-800/30', diff !== null && diff !== 0 && 'bg-amber-50/50 dark:bg-amber-500/5')}>
                    <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">{item.productName}<span className="text-slate-400 font-normal ml-1">({item.unit})</span></td>
                    <td className="px-4 py-3 text-right text-slate-500">{item.systemQty}</td>
                    <td className="px-4 py-3 text-right">
                      {isDraft ? (
                        <div className="flex items-center justify-end gap-1.5">
                          {savingIds.has(item.id) && <Loader2 size={12} className="animate-spin text-slate-400" />}
                          <input
                            type="number"
                            step="any"
                            defaultValue={item.countedQty ?? ''}
                            onBlur={(e) => saveCount(item.id, e.target.value)}
                            placeholder="—"
                            className="w-24 px-2 py-1.5 text-right bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      ) : (
                        <span>{item.countedQty ?? '—'}</span>
                      )}
                    </td>
                    <td className={cn(
                      'px-4 py-3 text-right font-bold',
                      diff === null ? 'text-slate-300' : diff === 0 ? 'text-slate-400' : diff > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                    )}>
                      {diff === null ? '—' : `${diff > 0 ? '+' : ''}${diff}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {isDraft && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleCommit}
            disabled={committing || varianceCount === 0}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-3 rounded-xl font-black flex items-center justify-center gap-2 transition-colors"
          >
            {committing ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            {committing ? 'Applying…' : `Finish & Apply (${varianceCount})`}
          </button>
          <button
            onClick={handleCancel}
            className="px-5 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold flex items-center gap-2 transition-colors"
          >
            <Ban size={16} /> Cancel
          </button>
        </div>
      )}
    </div>
  );
}
