'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLocale } from 'next-intl';
import api from '@/lib/api';
import { Shield, ArrowLeft, RefreshCw, Trash2, Download, RotateCcw, Package, Users, Truck, UserRound, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

function getAdminAuth() {
  if (typeof window === 'undefined') return null;
  try { const raw = localStorage.getItem('ks_admin_auth'); if (!raw) return null; return JSON.parse(raw); } catch { return null; }
}

type DeletedRecord = {
  id: string;
  entityType: 'product' | 'customer' | 'supplier' | 'staff';
  entityId: string;
  label: string | null;
  deletedBy: string | null;
  deletedAt: string;
  restoredAt: string | null;
  shop: { id: string; name: string | null; shopCode: string | null; packageType: string | null } | null;
};

const ENTITY_META: Record<string, { label: string; icon: any; accent: string }> = {
  product: { label: 'Product', icon: Package, accent: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
  customer: { label: 'Customer / Party', icon: Users, accent: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  supplier: { label: 'Supplier', icon: Truck, accent: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  staff: { label: 'Staff', icon: UserRound, accent: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
};

export default function AdminTrashPage() {
  const locale = useLocale();
  const [auth, setAuth] = useState<any>(null);
  const [records, setRecords] = useState<DeletedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityType, setEntityType] = useState('');
  const [search, setSearch] = useState('');
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const fetchTrash = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (entityType) params.set('entityType', entityType);
      if (search) params.set('q', search);
      const res = await api.get(`/admin/trash?${params.toString()}`);
      setRecords(res.data);
    } catch (err: any) {
      if (err.response?.status === 401) {
        localStorage.removeItem('ks_admin_auth');
        window.location.href = `/${locale}/admin/login`;
      }
    } finally {
      setLoading(false);
    }
  }, [entityType, search, locale]);

  useEffect(() => {
    const a = getAdminAuth();
    if (!a) { window.location.href = `/${locale}/admin/login`; return; }
    setAuth(a);
  }, [locale]);

  useEffect(() => {
    if (!auth) return;
    const t = setTimeout(fetchTrash, 250);
    return () => clearTimeout(t);
  }, [auth, fetchTrash]);

  async function handleRestore(r: DeletedRecord) {
    const meta = ENTITY_META[r.entityType];
    if (!confirm(`Restore this ${meta?.label.toLowerCase() || r.entityType} — "${r.label || r.entityId}"?`)) return;
    setRestoringId(r.id);
    try {
      const res = await api.post(`/admin/trash/${r.id}/restore`, {});
      if (res.data?.skipped?.length > 0) {
        alert(`Restored, but some related rows couldn't be re-created (their own data may be gone too):\n\n${res.data.skipped.join('\n')}`);
      }
      setRecords(prev => prev.filter(x => x.id !== r.id));
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to restore');
    } finally {
      setRestoringId(null);
    }
  }

  async function handleDownload(r: DeletedRecord) {
    setDownloadingId(r.id);
    try {
      const res = await api.get(`/admin/trash/${r.id}/download`);
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const datePart = new Date(r.deletedAt).toISOString().split('T')[0];
      const safeLabel = (r.label || r.entityId).replace(/[^a-z0-9-_]+/gi, '_');
      a.download = `${r.entityType}-${safeLabel}-${datePart}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Failed to download');
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href={`/${locale}/admin`}
              className="p-2 bg-slate-900 border border-slate-700 text-slate-400 hover:text-white rounded-xl transition-colors">
              <ArrowLeft size={18} />
            </a>
            <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Trash2 size={18} className="text-slate-900" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-50">Recovery Bin</h1>
              <p className="text-slate-500 text-xs font-medium">Deleted products, parties, suppliers &amp; staff — recoverable for security/audit reasons</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <Card className="bg-slate-900 border-slate-800 rounded-2xl">
          <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name…"
                className="w-full pl-9 pr-4 py-2.5 bg-slate-800 border border-slate-700 text-slate-100 rounded-xl text-sm placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700 flex-wrap">
              <button onClick={() => setEntityType('')}
                className={cn('px-3 py-1.5 rounded-lg text-xs font-bold transition-all', !entityType ? 'bg-indigo-500 text-slate-900' : 'text-slate-400 hover:text-slate-200')}>
                All
              </button>
              {Object.entries(ENTITY_META).map(([key, meta]) => (
                <button key={key} onClick={() => setEntityType(key)}
                  className={cn('px-3 py-1.5 rounded-lg text-xs font-bold transition-all', entityType === key ? 'bg-indigo-500 text-slate-900' : 'text-slate-400 hover:text-slate-200')}>
                  {meta.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* List */}
        <Card className="bg-slate-900 border-slate-800 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="flex justify-center p-16"><RefreshCw className="animate-spin text-indigo-500" size={32} /></div>
          ) : records.length === 0 ? (
            <div className="p-16 text-center text-slate-500 text-sm">Nothing here — no deleted records{entityType ? ` of this type` : ''}.</div>
          ) : (
            <div className="divide-y divide-slate-800/70">
              {records.map(r => {
                const meta = ENTITY_META[r.entityType] || { label: r.entityType, icon: Trash2, accent: 'text-slate-400 bg-slate-500/10 border-slate-500/20' };
                const Icon = meta.icon;
                return (
                  <div key={r.id} className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-slate-800/30 transition-colors">
                    <div className="flex items-center gap-4 min-w-0">
                      <span className={cn('w-9 h-9 rounded-xl border flex items-center justify-center shrink-0', meta.accent)}>
                        <Icon size={16} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-100 truncate">{r.label || r.entityId}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {meta.label} &middot; {r.shop?.name || 'Unknown shop'}{r.shop?.packageType ? ` (${r.shop.packageType})` : ''}
                          {r.deletedBy ? <> &middot; deleted by {r.deletedBy}</> : null}
                          {' '}&middot; {new Date(r.deletedAt).toLocaleString('en-IN')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => handleDownload(r)} disabled={downloadingId === r.id}
                        title="Download this record as JSON"
                        className="flex items-center gap-1.5 bg-slate-800 text-slate-300 hover:text-white px-3 py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50">
                        {downloadingId === r.id ? <RefreshCw size={13} className="animate-spin" /> : <Download size={13} />}
                        Download
                      </button>
                      <button onClick={() => handleRestore(r)} disabled={restoringId === r.id}
                        title="Restore this record"
                        className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 px-3 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-50">
                        {restoringId === r.id ? <RefreshCw size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                        Restore
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
