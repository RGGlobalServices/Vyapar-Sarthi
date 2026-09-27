'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import api from '@/lib/api';
import { Trash2, RefreshCw, Download, RotateCcw, Package, Users, Truck, UserRound, Search, IndianRupee, Receipt, ArrowLeft, CheckCircle, AlertTriangle, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Link } from '@/i18n/routing';
import { useRowSelection } from '@/lib/hooks/useRowSelection';
import { useBusinessStore } from '@/lib/businessStore';

type DeletedRecord = {
  id: string;
  entityType: 'product' | 'customer' | 'customer_transaction' | 'supplier' | 'staff' | 'sale' | 'purchase_invoice';
  entityId: string;
  label: string | null;
  deletedBy: string | null;
  deletedAt: string;
  restoredAt: string | null;
  purgeWarnedAt: string | null;
};

const ENTITY_META: Record<string, { label: string; icon: any; accent: string }> = {
  product: { label: 'Product / Stock', icon: Package, accent: 'text-cyan-600 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-500/10 border-cyan-200 dark:border-cyan-500/20' },
  customer: { label: 'Party / Customer', icon: Users, accent: 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20' },
  customer_transaction: { label: 'Udhar Transaction', icon: IndianRupee, accent: 'text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-500/10 border-orange-200 dark:border-orange-500/20' },
  supplier: { label: 'Supplier', icon: Truck, accent: 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20' },
  staff: { label: 'Staff', icon: UserRound, accent: 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/20' },
  sale: { label: 'Bill', icon: Receipt, accent: 'text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20' },
  purchase_invoice: { label: 'Purchase Bill', icon: Receipt, accent: 'text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/20' },
};

const RETENTION_DAYS = 30;

function daysLeft(deletedAt: string): number {
  const elapsed = (Date.now() - new Date(deletedAt).getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.ceil(RETENTION_DAYS - elapsed));
}

type Toast = { kind: 'success' | 'error'; title: string; detail?: string[] };

export default function TrashPage() {
  const t = useTranslations('Trash');
  const [records, setRecords] = useState<DeletedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityType, setEntityType] = useState('');
  const [search, setSearch] = useState('');
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [confirmRestoreTarget, setConfirmRestoreTarget] = useState<DeletedRecord | null>(null);
  const [confirmBulkRestore, setConfirmBulkRestore] = useState(false);
  const [bulkRestoring, setBulkRestoring] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { profile } = useBusinessStore();
  const { selectedIds, isAllSelected, toggleOne, toggleAll, clear: clearSelection } = useRowSelection(records.map(r => r.id));

  function showToast(next: Toast) {
    setToast(next);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    // Errors and multi-line notices (e.g. the "stock wasn't restored" note)
    // stay up longer — a blocking native alert() used to force the user to
    // read it, this is the non-blocking replacement so it needs more time.
    toastTimer.current = setTimeout(() => setToast(null), next.detail?.length ? 9000 : 4000);
  }

  const fetchTrash = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (entityType) params.set('entityType', entityType);
      if (search) params.set('q', search);
      const res = await api.get(`/trash?${params.toString()}`);
      setRecords(res.data);
    } catch {
      /* leave the current list on screen */
    } finally {
      setLoading(false);
    }
  }, [entityType, search]);

  useEffect(() => {
    const timer = setTimeout(fetchTrash, 250);
    return () => clearTimeout(timer);
  }, [fetchTrash]);

  async function handleConfirmRestore() {
    const r = confirmRestoreTarget;
    if (!r) return;
    setConfirmRestoreTarget(null);
    setRestoringId(r.id);
    try {
      const res = await api.post(`/trash/${r.id}/restore`, {});
      showToast({
        kind: 'success',
        title: t('restoredSuccessfully'),
        detail: res.data?.skipped?.length > 0 ? res.data.skipped : undefined,
      });
      // Remove immediately for a snappy UI, then re-fetch from the server
      // right after — belt-and-suspenders so the list is always showing
      // confirmed server state, not just an optimistic guess, with no
      // manual page refresh ever needed to see the current truth.
      setRecords(prev => prev.filter(x => x.id !== r.id));
      fetchTrash();
    } catch (err: any) {
      showToast({ kind: 'error', title: err.response?.data?.detail || 'Failed to restore' });
    } finally {
      setRestoringId(null);
    }
  }

  async function handleConfirmBulkRestore() {
    const ids = selectedIds;
    setConfirmBulkRestore(false);
    setBulkRestoring(true);
    try {
      const res = await api.post('/trash/bulk-restore', { ids });
      const restored: string[] = res.data?.restored || [];
      const failed: { id: string; error: string }[] = res.data?.failed || [];
      const skippedByRecord: Record<string, string[]> = res.data?.skippedByRecord || {};
      const allSkipped = Object.values(skippedByRecord).flat();

      const detail: string[] = [];
      if (failed.length > 0) detail.push(`${failed.length} couldn't be restored (already restored, or blocked).`);
      if (allSkipped.length > 0) detail.push(...Array.from(new Set(allSkipped)));

      showToast({
        kind: failed.length > 0 && restored.length === 0 ? 'error' : 'success',
        title: `${restored.length} of ${ids.length} restored.`,
        detail: detail.length > 0 ? detail : undefined,
      });

      setRecords(prev => prev.filter(x => !restored.includes(x.id)));
      clearSelection();
      fetchTrash();
    } catch (err: any) {
      showToast({ kind: 'error', title: err.response?.data?.detail || 'Bulk restore failed' });
    } finally {
      setBulkRestoring(false);
    }
  }

  async function handleDownload(r: DeletedRecord) {
    setDownloadingId(r.id);
    try {
      const res = await api.get(`/trash/${r.id}/download`);

      if (r.entityType === 'sale') {
        const sale = res.data.data || {};
        const billNum = r.label || sale.invoice_number || sale.id?.substring(0, 8).toUpperCase() || 'BILL';
        const dateStr = sale.createdAt
          ? new Date(sale.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
          : new Date(r.deletedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        const items: any[] = Array.isArray(sale.items) ? sale.items : [];
        const fmt = (n: number) => `Rs ${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        const itemRows = items.map((item: any) => {
          const name = item.itemName || item.name || 'Item';
          const variant = item.variant ? ` (${item.variant})` : '';
          const qty = item.quantity || 0;
          const rate = item.pricePerUnit || item.price_per_unit || 0;
          const total = qty * rate;
          return `<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${name}${variant}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${item.unit || 'Pcs'}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${qty}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${fmt(rate)}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${fmt(total)}</td>
          </tr>`;
        }).join('');

        const totalAmount = sale.totalAmount || sale.total_amount || 0;
        const amountPaid = sale.amountPaid || sale.amount_paid || 0;
        const balance = totalAmount - amountPaid;
        const paymentType = sale.paymentType || sale.payment_type || '';
        const gstAmount = sale.gstAmount || sale.gst_amount || 0;

        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${billNum}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111; margin: 0; padding: 20px; }
            .header { text-align: center; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 16px; }
            .header h1 { margin: 0 0 4px; font-size: 22px; }
            .header p { margin: 2px 0; font-size: 13px; color: #555; }
            .meta { display: flex; justify-content: space-between; margin-bottom: 16px; font-size: 13px; }
            .label { font-weight: bold; color: #555; font-size: 11px; text-transform: uppercase; }
            table { width: 100%; border-collapse: collapse; font-size: 13px; }
            thead th { background: #f3f4f6; padding: 8px 12px; text-align: left; border-bottom: 2px solid #d1d5db; font-size: 11px; text-transform: uppercase; }
            thead th:nth-child(3), thead th:nth-child(4), thead th:nth-child(5) { text-align: right; }
            .totals { margin-top: 16px; text-align: right; font-size: 14px; }
            .totals table { width: auto; float: right; }
            .totals td { padding: 4px 8px; }
            .totals .grand { font-weight: bold; font-size: 16px; border-top: 2px solid #111; }
            .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #888; border-top: 1px solid #e5e7eb; padding-top: 12px; }
            .deleted-note { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 8px 12px; font-size: 12px; margin-bottom: 16px; color: #92400e; }
            @media print { .deleted-note { display: none; } }
          </style>
        </head><body>
          <div class="header">
            <h1>${profile.shopName || 'Store'}</h1>
            ${profile.address ? `<p>${profile.address}</p>` : ''}
            ${profile.mobile ? `<p>Ph: ${profile.mobile}</p>` : ''}
            ${profile.gst ? `<p>GSTIN: ${profile.gst}</p>` : ''}
          </div>
          <div class="deleted-note">⚠️ This bill was deleted on ${new Date(r.deletedAt).toLocaleDateString('en-IN')}. Recovered from Recycle Bin.</div>
          <div class="meta">
            <div>
              <div class="label">Bill No.</div>
              <div style="font-size:16px;font-weight:bold;">${billNum}</div>
            </div>
            <div>
              <div class="label">Date</div>
              <div>${dateStr}</div>
            </div>
            ${paymentType ? `<div><div class="label">Payment</div><div>${paymentType.toUpperCase()}</div></div>` : ''}
          </div>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Unit</th>
                <th style="text-align:right;">Qty</th>
                <th style="text-align:right;">Rate</th>
                <th style="text-align:right;">Amount</th>
              </tr>
            </thead>
            <tbody>${itemRows || '<tr><td colspan="5" style="text-align:center;padding:16px;color:#888;">No items recorded</td></tr>'}</tbody>
          </table>
          <div class="totals">
            <table>
              ${gstAmount > 0 ? `<tr><td>GST</td><td>${fmt(gstAmount)}</td></tr>` : ''}
              <tr class="grand"><td>Total</td><td>${fmt(totalAmount)}</td></tr>
              ${amountPaid > 0 ? `<tr><td>Paid</td><td>${fmt(amountPaid)}</td></tr>` : ''}
              ${balance > 0 ? `<tr><td style="color:#dc2626;">Balance</td><td style="color:#dc2626;">${fmt(balance)}</td></tr>` : ''}
            </table>
          </div>
          <div style="clear:both;"></div>
          <div class="footer">Thank you for your business!</div>
          <script>window.onload = function() { window.print(); }</script>
        </body></html>`;

        const printWin = window.open('', '_blank', 'width=820,height=640,scrollbars=yes');
        if (printWin) {
          printWin.document.write(html);
          printWin.document.close();
          showToast({ kind: 'success', title: 'Invoice print dialog opened' });
        } else {
          showToast({ kind: 'error', title: 'Popup blocked — allow popups and try again' });
        }
        return;
      }

      // For all other entity types: download as JSON
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
      showToast({ kind: 'success', title: `Downloaded ${a.download}` });
    } catch {
      showToast({ kind: 'error', title: 'Failed to download' });
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-24">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div className="w-10 h-10 bg-rose-500 rounded-xl flex items-center justify-center shadow-lg shadow-rose-500/20">
          <Trash2 size={18} className="text-white" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">{t('recycleBinTitle')}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">{t('recycleBinSubtitle')}</p>
        </div>
        <button onClick={() => fetchTrash()} disabled={loading}
          title="Refresh"
          className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors disabled:opacity-50">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-sm placeholder:text-slate-400 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 flex-wrap">
            <button onClick={() => setEntityType('')}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-bold transition-all', !entityType ? 'bg-emerald-500 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200')}>
              {t('filterAll')}
            </button>
            {Object.entries(ENTITY_META).map(([key, meta]) => (
              <button key={key} onClick={() => setEntityType(key)}
                className={cn('px-3 py-1.5 rounded-lg text-xs font-bold transition-all', entityType === key ? 'bg-emerald-500 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200')}>
                {meta.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Bulk-select action bar — emerald/positive styling since this is a
          restore, not a delete, so it deliberately doesn't reuse the shared
          rose-colored SelectionActionBar used for bulk deletes elsewhere. */}
      {selectedIds.length > 0 && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/30 rounded-2xl p-3 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
          <span className="text-sm font-medium text-emerald-800 dark:text-emerald-300 pl-2">
            {selectedIds.length} selected
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setConfirmBulkRestore(true)} disabled={bulkRestoring}
              className="flex items-center gap-1.5 bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50">
              {bulkRestoring ? <RefreshCw size={14} className="animate-spin" /> : <RotateCcw size={14} />}
              Restore Selected
            </button>
            <button onClick={clearSelection} disabled={bulkRestoring}
              title="Clear selection"
              className="p-1.5 rounded-lg text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-800/40 transition-colors disabled:opacity-50">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center p-16"><RefreshCw className="animate-spin text-emerald-500" size={32} /></div>
        ) : records.length === 0 ? (
          <div className="p-16 text-center text-slate-500 dark:text-slate-400 text-sm">{t('noDeletedItems')}</div>
        ) : (
          <>
            <div className="flex items-center gap-3 px-6 py-2.5 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={toggleAll}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600 cursor-pointer"
              />
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Select all</span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {records.map(r => {
                const meta = ENTITY_META[r.entityType] || { label: r.entityType, icon: Trash2, accent: 'text-slate-500 bg-slate-100 dark:bg-slate-500/10 border-slate-300 dark:border-slate-500/20' };
                const Icon = meta.icon;
                const left = daysLeft(r.deletedAt);
                return (
                  <div key={r.id} className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <div className="flex items-center gap-4 min-w-0">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(r.id)}
                        onChange={() => toggleOne(r.id)}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600 cursor-pointer shrink-0"
                      />
                      <span className={cn('w-9 h-9 rounded-xl border flex items-center justify-center shrink-0', meta.accent)}>
                        <Icon size={16} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{r.label || r.entityId}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-500 truncate">
                          {meta.label}
                          {r.deletedBy ? <> &middot; deleted by {r.deletedBy}</> : null}
                          {' '}&middot; {new Date(r.deletedAt).toLocaleString('en-IN')}
                          {' '}&middot;{' '}
                          <span className={cn('font-semibold', left <= 3 ? 'text-rose-500 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400')}>
                            {left === 0 ? t('expiresToday') : t('expiresIn', { days: left })}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => handleDownload(r)} disabled={downloadingId === r.id}
                        title={t('download')}
                        className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white px-3 py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50">
                        {downloadingId === r.id ? <RefreshCw size={13} className="animate-spin" /> : <Download size={13} />}
                        {t('download')}
                      </button>
                      <button onClick={() => setConfirmRestoreTarget(r)} disabled={restoringId === r.id}
                        title={t('restore')}
                        className="flex items-center gap-1.5 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-500/20 px-3 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-50">
                        {restoringId === r.id ? <RefreshCw size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                        {t('restore')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      {/* Single-item restore confirmation — a real modal instead of a native
          confirm(), which can be missed or feel "stuck" behind the page on
          some browsers/devices. */}
      {confirmRestoreTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center shrink-0">
                <RotateCcw size={18} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="font-bold text-slate-900 dark:text-slate-100">{t('restoreConfirm')}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 truncate">{confirmRestoreTarget.label || confirmRestoreTarget.entityId}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmRestoreTarget(null)} className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 py-2.5 rounded-xl font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                {t('cancel')}
              </button>
              <button onClick={handleConfirmRestore} className="flex-1 bg-emerald-500 text-white py-2.5 rounded-xl font-bold hover:bg-emerald-600 transition-colors">
                {t('restore')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk restore confirmation — same styling, count instead of a label. */}
      {confirmBulkRestore && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center shrink-0">
                <RotateCcw size={18} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="font-bold text-slate-900 dark:text-slate-100">Restore {selectedIds.length} items?</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Each will be restored to its original place.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmBulkRestore(false)} className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 py-2.5 rounded-xl font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                {t('cancel')}
              </button>
              <button onClick={handleConfirmBulkRestore} className="flex-1 bg-emerald-500 text-white py-2.5 rounded-xl font-bold hover:bg-emerald-600 transition-colors">
                {t('restore')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Non-blocking result toast — replaces the old alert()/alert() pair
          (one for the confirm, one for a "stock wasn't restored" notice on
          Bills) that stacked two native dialogs in a row and could easily
          look like the page had frozen or the action had failed. */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] w-full max-w-md px-4">
          <div className={cn(
            'rounded-2xl shadow-2xl border p-4 flex items-start gap-3',
            toast.kind === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-900/90 border-emerald-200 dark:border-emerald-700 text-emerald-800 dark:text-emerald-100'
              : 'bg-rose-50 dark:bg-rose-900/90 border-rose-200 dark:border-rose-700 text-rose-800 dark:text-rose-100'
          )}>
            {toast.kind === 'success' ? <CheckCircle size={18} className="shrink-0 mt-0.5" /> : <AlertTriangle size={18} className="shrink-0 mt-0.5" />}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm">{toast.title}</p>
              {toast.detail?.map((line, i) => (
                <p key={i} className="text-xs mt-1 opacity-90">{line}</p>
              ))}
            </div>
            <button onClick={() => setToast(null)} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
