'use client';

import { useState, useMemo, useCallback } from 'react';
import useSWR from 'swr';
import { Plus, X, Loader2, ArrowUpFromLine, RotateCcw, Truck, Pencil, Trash2, CheckSquare, Square } from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

type DispatchRow = {
  id: string;
  dispatchNumber: string;
  vehicleNumber: string | null;
  driverName: string | null;
  quantity: number | null;
  unit: string | null;
  noOfBags: number | null;
  lotNumber: string | null;
  dispatchType: string | null;
  notes: string | null;
  status: string;
  returnedAt: string | null;
  returnNotes: string | null;
  dispatchedAt: string;
  party?: { id: string; name: string } | null;
  product?: { id: string; name: string; baseUnit: string | null } | null;
  saleId?: string | null;
  sale?: { id: string; invoice_number: string | null } | null;
};
type Party = { id: string; name: string; mobile?: string | null };
type Product = { id: string; name: string; baseUnit?: string | null };
type BillItem = { id: string; itemName: string | null; quantity: number | null; unit: string | null; productId: string | null; product?: { id: string; name: string; baseUnit: string | null } | null };
type Bill = { id: string; invoice_number: string | null; totalAmount: number | null; createdAt: string; customer?: { id: string; name: string } | null; items: BillItem[] };

const fetcher = (u: string) => api.get(u).then(r => r.data);

const STATUS_CLS: Record<string, string> = {
  dispatched: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  returned:   'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export default function DispatchPage() {
  const t = useTranslations('Dispatch');
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const [creating, setCreating] = useState(false);
  const [returning, setReturning] = useState<DispatchRow | null>(null);
  const [editing, setEditing] = useState<DispatchRow | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);

  const toggleSelect = useCallback((id: string) => {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const { data: rows = [], mutate: refetch, isLoading } = useSWR<DispatchRow[]>(
    activeShopId ? ['/logistics/dispatch', activeShopId] : null,
    ([u]) => fetcher(u),
  );
  const { data: parties = [] } = useSWR<Party[]>(
    activeShopId ? ['/crm/customers?type=party', activeShopId] : null,
    ([u]) => fetcher(u),
  );
  const { data: products = [] } = useSWR<Product[]>(
    activeShopId ? ['/products', activeShopId] : null,
    ([u]) => fetcher(u),
  );
  const { data: bills = [] } = useSWR<Bill[]>(
    activeShopId ? ['/logistics/bills-for-dispatch', activeShopId] : null,
    ([u]) => fetcher(u),
  );

  const execDelete = async (id: string) => {
    setDeleting(true);
    try { await api.delete(`/logistics/dispatch/${id}`); setConfirmDeleteId(null); refetch(); }
    catch (e: any) { setConfirmDeleteId(null); alert(e?.response?.data?.detail || t('failedToDelete')); }
    finally { setDeleting(false); }
  };

  const execBulkDelete = async () => {
    setDeleting(true);
    try {
      await Promise.all([...selected].map(id => api.delete(`/logistics/dispatch/${id}`)));
      setSelected(new Set()); setConfirmBulk(false); refetch();
    } catch (e: any) { alert(e?.response?.data?.detail || t('failedToDelete')); }
    finally { setDeleting(false); }
  };

  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month' | 'custom'>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const filteredRows = useMemo(() => {
    let result = rows;
    if (dateFilter !== 'all') {
      const now = new Date();
      const toDay = now.toISOString().slice(0, 10);
      result = result.filter(r => {
        const d = r.dispatchedAt.slice(0, 10);
        if (dateFilter === 'today') return d === toDay;
        if (dateFilter === 'week') {
          const from = new Date(now); from.setDate(from.getDate() - 6);
          return d >= from.toISOString().slice(0, 10);
        }
        if (dateFilter === 'month') {
          return d.startsWith(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
        }
        if (dateFilter === 'custom') {
          if (customFrom && d < customFrom) return false;
          if (customTo && d > customTo) return false;
        }
        return true;
      });
    }
    if (typeFilter) result = result.filter(r => r.dispatchType === typeFilter);
    return result;
  }, [rows, dateFilter, customFrom, customTo, typeFilter]);

  const totalBags = filteredRows.reduce((s, r) => s + (r.noOfBags || 0), 0);
  const totalQty = filteredRows.reduce((s, r) => s + (r.quantity || 0), 0);

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ArrowUpFromLine size={22} className="text-blue-600" /> {t('title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {selected.size > 0 && !confirmBulk && (
            <button onClick={() => setConfirmBulk(true)}
              className="flex items-center gap-1.5 text-xs font-bold bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 px-3 py-2 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors">
              <Trash2 size={14} /> {t('deleteSelected', { count: selected.size })}
            </button>
          )}
          {confirmBulk && (
            <span className="flex items-center gap-2 text-xs">
              <span className="text-red-600 font-semibold">{t('confirmBulkDelete', { count: selected.size })}</span>
              <button onClick={execBulkDelete} disabled={deleting}
                className="bg-red-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-red-700 disabled:opacity-50 flex items-center gap-1">
                {deleting ? <Loader2 size={12} className="animate-spin" /> : null} {t('deleteDispatch')}
              </button>
              <button onClick={() => setConfirmBulk(false)} className="text-slate-500 hover:text-slate-700 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                <X size={14} />
              </button>
            </span>
          )}
          <button onClick={() => setCreating(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors">
            <Plus size={18} /> {t('newDispatch')}
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {(['all', 'today', 'week', 'month', 'custom'] as const).map(f => (
            <button key={f} onClick={() => setDateFilter(f)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
                dateFilter === f ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700')}>
              {f === 'all' ? t('filterAllTime') : f === 'today' ? t('filterToday') : f === 'week' ? t('filterThisWeek') : f === 'month' ? t('filterThisMonth') : t('filterCustom')}
            </button>
          ))}
        </div>
        {dateFilter === 'custom' && (
          <div className="flex items-center gap-2 flex-wrap">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="h-9 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            <span className="text-xs text-slate-400">{t('filterTo')}</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="h-9 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {([
            ['', 'filterAllTypes'],
            ['sale', 'typeSale'],
            ['sample', 'typeSample'],
            ['transfer', 'typeTransfer'],
            ['job_work', 'typeJobWork'],
            ['other', 'typeOther'],
          ] as const).map(([typ, key]) => (
            <button key={typ} onClick={() => setTypeFilter(typ)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
                typeFilter === typ ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700')}>
              {t(key)}
            </button>
          ))}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <p className="text-[11px] text-slate-500">{t('kpiDispatches')}</p>
            <p className="text-2xl font-black text-blue-600 dark:text-blue-400">{filteredRows.length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <p className="text-[11px] text-slate-500">{t('kpiBags')}</p>
            <p className="text-2xl font-black text-blue-600 dark:text-blue-400">{totalBags.toLocaleString('en-IN')}</p>
          </div>
          {totalQty > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-[11px] text-slate-500">{t('kpiQty')}</p>
              <p className="text-2xl font-black text-blue-600 dark:text-blue-400">{totalQty.toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg</p>
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
          <ArrowUpFromLine size={40} className="mx-auto text-slate-300 dark:text-slate-700" />
          <p className="mt-3 text-sm text-slate-500">{rows.length === 0 ? t('noDispatches') : t('noFilterMatch')}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          {/* Select-all header */}
          <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
            <button onClick={() => setSelected(s => s.size === filteredRows.length ? new Set() : new Set(filteredRows.map(r => r.id)))}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
              {selected.size === filteredRows.length && filteredRows.length > 0
                ? <CheckSquare size={14} className="text-blue-600" />
                : <Square size={14} />}
              <span>{selected.size === filteredRows.length && filteredRows.length > 0 ? t('deselectAll') : t('selectAll')}</span>
            </button>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredRows.map(r => {
              const statusCls = STATUS_CLS[r.status] ?? STATUS_CLS.dispatched;
              const typeKey = ({ sale: 'typeSale', sample: 'typeSample', transfer: 'typeTransfer', job_work: 'typeJobWork', other: 'typeOther' } as Record<string, string>)[r.dispatchType || ''];
              const isSelected = selected.has(r.id);
              return (
                <li key={r.id} className={cn('p-4 flex items-center gap-3 flex-wrap transition-colors', isSelected ? 'bg-blue-50 dark:bg-blue-950/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/30')}>
                  {/* Checkbox */}
                  <button onClick={() => toggleSelect(r.id)} className="shrink-0 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400">
                    {isSelected ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-slate-900 dark:text-white">{r.dispatchNumber}</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${statusCls}`}>{r.status === 'returned' ? t('statusReturned') : t('statusDispatched')}</span>
                      {r.dispatchType && r.dispatchType !== 'sale' && (
                        <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                          {typeKey ? t(typeKey) : r.dispatchType}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs text-slate-500">
                      {r.party?.name && <span className="font-medium text-slate-700 dark:text-slate-300">{r.party.name}</span>}
                      {r.product?.name && (
                        <span>
                          {r.product.name}
                          {r.quantity ? ` × ${r.quantity} ${r.unit || r.product.baseUnit || ''}` : ''}
                        </span>
                      )}
                      {r.noOfBags != null && <span>{t('bags', { n: r.noOfBags })}</span>}
                      {r.lotNumber && <span>{t('lotPrefix', { lot: r.lotNumber })}</span>}
                    </div>
                    <div className="flex flex-wrap gap-x-3 mt-1 text-xs text-slate-400">
                      <span>{fmtDate(r.dispatchedAt)}</span>
                      {r.vehicleNumber && (
                        <span className="flex items-center gap-1">
                          <Truck size={11} /> {r.vehicleNumber}
                          {r.driverName ? ` · ${r.driverName}` : ''}
                        </span>
                      )}
                      {r.notes && <span className="italic">{r.notes}</span>}
                    </div>
                    {r.saleId && (
                      <p className="mt-1 text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                        {t('billPrefix', { bill: r.sale?.invoice_number || r.saleId.slice(0, 8) + '…' })}
                      </p>
                    )}
                    {r.status === 'returned' && r.returnedAt && (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                        {t('returnedOn', { date: fmtDate(r.returnedAt) })}{r.returnNotes ? ` — ${r.returnNotes}` : ''}
                      </p>
                    )}
                  </div>
                  {/* Row actions */}
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    {confirmDeleteId === r.id ? (
                      <>
                        <button onClick={() => execDelete(r.id)} disabled={deleting}
                          className="text-xs font-bold bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-1">
                          {deleting ? <Loader2 size={12} className="animate-spin" /> : null}
                          {t('deleteDispatch')}
                        </button>
                        <button onClick={() => setConfirmDeleteId(null)}
                          className="text-xs text-slate-500 border border-slate-200 dark:border-slate-700 px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                          <X size={12} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => setEditing(r)}
                          className="flex items-center gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                          <Pencil size={12} />
                        </button>
                        {r.status === 'dispatched' && (
                          <button onClick={() => setReturning(r)}
                            className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-700 px-2.5 py-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors">
                            <RotateCcw size={12} /> {t('returnButton')}
                          </button>
                        )}
                        <button onClick={() => setConfirmDeleteId(r.id)}
                          className="flex items-center gap-1 text-xs font-semibold text-red-500 dark:text-red-400 border border-red-200 dark:border-red-800 px-2.5 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {creating && (
        <CreateDispatchModal
          parties={parties}
          products={products}
          bills={bills}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); refetch(); }}
        />
      )}

      {returning && (
        <ReturnDispatchModal
          entry={returning}
          onClose={() => setReturning(null)}
          onReturned={() => { setReturning(null); refetch(); }}
        />
      )}

      {editing && (
        <EditDispatchModal
          entry={editing}
          parties={parties}
          products={products}
          bills={bills}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refetch(); }}
        />
      )}
    </div>
  );
}

function CreateDispatchModal({ parties, products, bills, onClose, onCreated }: {
  parties: Party[]; products: Product[]; bills: Bill[]; onClose: () => void; onCreated: () => void;
}) {
  const t = useTranslations('Dispatch');
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    saleId: '', partyId: '', vehicleNumber: '', driverName: '',
    productId: '', quantity: '', unit: '',
    noOfBags: '', lotNumber: '',
    dispatchType: 'sale',
    dispatchedAt: today,
    notes: '',
  });
  const [billSearch, setBillSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const selectedProduct = products.find(p => p.id === form.productId);
  const selectedBill = bills.find(b => b.id === form.saleId);

  const filteredBills = billSearch.trim()
    ? bills.filter(b =>
        (b.invoice_number || '').toLowerCase().includes(billSearch.toLowerCase()) ||
        (b.customer?.name || '').toLowerCase().includes(billSearch.toLowerCase())
      )
    : bills;

  const applyBill = (bill: Bill) => {
    const firstItem = bill.items[0];
    setForm(f => ({
      ...f,
      saleId: bill.id,
      partyId: bill.customer?.id || f.partyId,
      productId: firstItem?.productId || f.productId,
      quantity: firstItem?.quantity != null ? String(firstItem.quantity) : f.quantity,
      unit: firstItem?.unit || firstItem?.product?.baseUnit || f.unit,
      dispatchType: 'sale',
    }));
    setBillSearch('');
  };

  const clearBill = () => setForm(f => ({ ...f, saleId: '' }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const payload = {
        saleId: form.saleId || null,
        partyId: form.partyId || null,
        vehicleNumber: form.vehicleNumber || null,
        driverName: form.driverName || null,
        productId: form.productId || null,
        quantity: form.quantity || null,
        unit: form.unit || selectedProduct?.baseUnit || null,
        noOfBags: form.noOfBags || null,
        lotNumber: form.lotNumber || null,
        dispatchType: form.dispatchType,
        dispatchedAt: form.dispatchedAt || null,
        notes: form.notes,
      };
      try {
        await api.post('/logistics/dispatch', payload);
      } catch (e: any) {
        // not enough stock: tell the user and let them go ahead on purpose
        if (e?.response?.data?.code !== 'INSUFFICIENT_STOCK') throw e;
        if (!window.confirm(`${e.response.data.detail || e.response.data.error}\n\nCreate this dispatch anyway? Stock will go below zero.`)) { setSaving(false); return; }
        await api.post('/logistics/dispatch', { ...payload, force: true });
      }
      onCreated();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || t('failedToCreate'));
    } finally { setSaving(false); }
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900 z-10">
          <h2 className="text-lg font-black">{t('newDispatch')}</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">

          {/* Bill Selector */}
          <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 p-3">
            <p className="text-xs font-bold uppercase text-indigo-600 dark:text-indigo-400 mb-2">{t('linkToBill')}</p>
            {selectedBill ? (
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-indigo-700 dark:text-indigo-300">{selectedBill.invoice_number || 'Bill'}</p>
                  <p className="text-xs text-indigo-500">{selectedBill.customer?.name}{selectedBill.totalAmount != null ? ` · ₹${selectedBill.totalAmount.toLocaleString('en-IN')}` : ''}</p>
                </div>
                <button type="button" onClick={clearBill} className="text-xs text-slate-400 hover:text-red-500"><X size={14} /></button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <input
                  value={billSearch}
                  onChange={e => setBillSearch(e.target.value)}
                  placeholder={t('searchBillPlaceholder')}
                  className="w-full h-9 px-3 border border-indigo-200 dark:border-indigo-700 rounded-lg bg-white dark:bg-slate-950 text-sm"
                />
                {filteredBills.length > 0 && (
                  <ul className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredBills.slice(0, 8).map(b => (
                      <li key={b.id}>
                        <button type="button" onClick={() => applyBill(b)}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors">
                          <span className="font-bold text-slate-800 dark:text-slate-200">{b.invoice_number || '—'}</span>
                          <span className="text-slate-500 ml-2">{b.customer?.name}</span>
                          {b.totalAmount != null && <span className="float-right text-slate-400">₹{b.totalAmount.toLocaleString('en-IN')}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Party + Dispatch Type */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block col-span-2 sm:col-span-1">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('party')}</span>
              <select value={form.partyId} onChange={set('partyId')}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm">
                <option value="">{t('noParty')}</option>
                {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('dispatchType')}</span>
              <select value={form.dispatchType} onChange={set('dispatchType')}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm">
                <option value="sale">{t('typeSale')}</option>
                <option value="sample">{t('typeSample')}</option>
                <option value="transfer">{t('typeTransfer')}</option>
                <option value="job_work">{t('typeJobWork')}</option>
                <option value="other">{t('typeOther')}</option>
              </select>
            </label>
          </div>

          {/* Dispatch Date */}
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('dispatchDate')}</span>
            <input type="date" value={form.dispatchedAt} onChange={set('dispatchedAt')}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </label>

          {/* Vehicle + Driver */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('vehicleNumber')}</span>
              <input value={form.vehicleNumber} onChange={e => setForm(f => ({ ...f, vehicleNumber: e.target.value.toUpperCase() }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" placeholder="MH12AB1234" />
            </label>
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('driverName')}</span>
              <input value={form.driverName} onChange={set('driverName')}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" placeholder={t('driverPlaceholder')} />
            </label>
          </div>

          {/* Product */}
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('product')}</span>
            <select value={form.productId} onChange={set('productId')}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm">
              <option value="">{t('noProduct')}</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>

          {/* Quantity + Unit + Bags */}
          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('quantity')} (kg)</span>
              <input type="number" min="0" step="0.01" value={form.quantity} onChange={set('quantity')}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            </label>
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('unit')}</span>
              <input value={form.unit} onChange={set('unit')}
                placeholder={selectedProduct?.baseUnit || ''}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            </label>
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('noOfBags')}</span>
              <input type="number" min="0" step="1" value={form.noOfBags} onChange={set('noOfBags')}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            </label>
          </div>

          {/* Lot Number */}
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('lotBatchNumber')}</span>
            <input value={form.lotNumber} onChange={set('lotNumber')}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" placeholder={t('optionalPlaceholder')} />
          </label>

          {/* Notes */}
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('notesOptional')}</span>
            <input value={form.notes} onChange={set('notes')}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </label>

          {form.productId && form.quantity && (
            <p className="text-[11px] text-blue-600 dark:text-blue-400">{t('stockDebitHint', { qty: form.quantity, product: selectedProduct?.name || '' })}</p>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={saving}
            className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {t('createDispatch')}
          </button>
        </form>
      </div>
    </div>
  );
}

function ReturnDispatchModal({ entry, onClose, onReturned }: {
  entry: DispatchRow; onClose: () => void; onReturned: () => void;
}) {
  const t = useTranslations('Dispatch');
  const today = new Date().toISOString().slice(0, 10);
  const [returnNotes, setReturnNotes] = useState('');
  const [returnedAt, setReturnedAt] = useState(today);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post(`/logistics/dispatch/${entry.id}/return`, { returnNotes, returnedAt });
      onReturned();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || t('failedToReturn'));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-black flex items-center gap-2"><RotateCcw size={18} className="text-amber-500" /> {t('returnModalTitle')}</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-sm">
            <p className="font-bold text-amber-800 dark:text-amber-200">{entry.dispatchNumber}</p>
            <p className="text-amber-700 dark:text-amber-300 text-xs mt-0.5">
              {entry.party?.name ? `${entry.party.name} · ` : ''}
              {entry.product?.name ? `${entry.product.name}${entry.quantity ? ` × ${entry.quantity} ${entry.unit || ''}` : ''}` : ''}
            </p>
            {entry.product && entry.quantity && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">{t('stockCreditBack', { qty: entry.quantity, unit: entry.unit || entry.product.baseUnit || '' })}</p>
            )}
          </div>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('returnDate')}</span>
            <input type="date" value={returnedAt} onChange={e => setReturnedAt(e.target.value)}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('returnReason')}</span>
            <input value={returnNotes} onChange={e => setReturnNotes(e.target.value)}
              placeholder={t('returnReasonPlaceholder')}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </label>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={saving}
            className="w-full h-11 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
            {t('confirmReturn')}
          </button>
        </form>
      </div>
    </div>
  );
}

function EditDispatchModal({ entry, parties, products, bills, onClose, onSaved }: {
  entry: DispatchRow; parties: Party[]; products: Product[]; bills: Bill[];
  onClose: () => void; onSaved: () => void;
}) {
  const t = useTranslations('Dispatch');
  const [form, setForm] = useState({
    saleId: entry.saleId || '',
    partyId: entry.party?.id || '',
    vehicleNumber: entry.vehicleNumber || '',
    driverName: entry.driverName || '',
    productId: entry.product?.id || '',
    quantity: entry.quantity != null ? String(entry.quantity) : '',
    unit: entry.unit || '',
    noOfBags: entry.noOfBags != null ? String(entry.noOfBags) : '',
    lotNumber: entry.lotNumber || '',
    dispatchType: entry.dispatchType || 'sale',
    dispatchedAt: entry.dispatchedAt.slice(0, 10),
    notes: entry.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const selectedProduct = products.find(p => p.id === form.productId);
  const selectedBill = bills.find(b => b.id === form.saleId);
  const [billSearch, setBillSearch] = useState('');

  const filteredBills = billSearch.trim()
    ? bills.filter(b =>
        (b.invoice_number || '').toLowerCase().includes(billSearch.toLowerCase()) ||
        (b.customer?.name || '').toLowerCase().includes(billSearch.toLowerCase())
      )
    : bills;

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.patch(`/logistics/dispatch/${entry.id}`, {
        saleId: form.saleId || null,
        partyId: form.partyId || null,
        vehicleNumber: form.vehicleNumber || null,
        driverName: form.driverName || null,
        productId: form.productId || null,
        quantity: form.quantity || null,
        unit: form.unit || selectedProduct?.baseUnit || null,
        noOfBags: form.noOfBags || null,
        lotNumber: form.lotNumber || null,
        dispatchType: form.dispatchType,
        dispatchedAt: form.dispatchedAt || null,
        notes: form.notes,
      });
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || t('failedToUpdate'));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900 z-10">
          <h2 className="text-lg font-black flex items-center gap-2"><Pencil size={16} className="text-blue-500" /> {t('editDispatch')}</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          {/* Bill Selector */}
          <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 p-3">
            <p className="text-xs font-bold uppercase text-indigo-600 dark:text-indigo-400 mb-2">{t('linkToBill')}</p>
            {selectedBill ? (
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-indigo-700 dark:text-indigo-300">{selectedBill.invoice_number || 'Bill'}</p>
                  <p className="text-xs text-indigo-500">{selectedBill.customer?.name}{selectedBill.totalAmount != null ? ` · ₹${selectedBill.totalAmount.toLocaleString('en-IN')}` : ''}</p>
                </div>
                <button type="button" onClick={() => setForm(f => ({ ...f, saleId: '' }))} className="text-xs text-slate-400 hover:text-red-500"><X size={14} /></button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <input value={billSearch} onChange={e => setBillSearch(e.target.value)}
                  placeholder={t('searchBillPlaceholder')}
                  className="w-full h-9 px-3 border border-indigo-200 dark:border-indigo-700 rounded-lg bg-white dark:bg-slate-950 text-sm" />
                {filteredBills.length > 0 && billSearch && (
                  <ul className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredBills.slice(0, 8).map(b => (
                      <li key={b.id}>
                        <button type="button" onClick={() => { setForm(f => ({ ...f, saleId: b.id, partyId: b.customer?.id || f.partyId, dispatchType: 'sale' })); setBillSearch(''); }}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 dark:hover:bg-indigo-900/20">
                          <span className="font-bold text-slate-800 dark:text-slate-200">{b.invoice_number || '—'}</span>
                          <span className="text-slate-500 ml-2">{b.customer?.name}</span>
                          {b.totalAmount != null && <span className="float-right text-slate-400">₹{b.totalAmount.toLocaleString('en-IN')}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block col-span-2 sm:col-span-1">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('party')}</span>
              <select value={form.partyId} onChange={set('partyId')}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm">
                <option value="">{t('noParty')}</option>
                {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('dispatchType')}</span>
              <select value={form.dispatchType} onChange={set('dispatchType')}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm">
                <option value="sale">{t('typeSale')}</option>
                <option value="sample">{t('typeSample')}</option>
                <option value="transfer">{t('typeTransfer')}</option>
                <option value="job_work">{t('typeJobWork')}</option>
                <option value="other">{t('typeOther')}</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('dispatchDate')}</span>
            <input type="date" value={form.dispatchedAt} onChange={set('dispatchedAt')}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('vehicleNumber')}</span>
              <input value={form.vehicleNumber} onChange={e => setForm(f => ({ ...f, vehicleNumber: e.target.value.toUpperCase() }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" placeholder="MH12AB1234" />
            </label>
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('driverName')}</span>
              <input value={form.driverName} onChange={set('driverName')}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" placeholder={t('driverPlaceholder')} />
            </label>
          </div>

          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('product')}</span>
            <select value={form.productId} onChange={set('productId')}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm">
              <option value="">{t('noProduct')}</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>

          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('quantity')} (kg)</span>
              <input type="number" min="0" step="0.01" value={form.quantity} onChange={set('quantity')}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            </label>
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('unit')}</span>
              <input value={form.unit} onChange={set('unit')} placeholder={selectedProduct?.baseUnit || ''}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            </label>
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('noOfBags')}</span>
              <input type="number" min="0" step="1" value={form.noOfBags} onChange={set('noOfBags')}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            </label>
          </div>

          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('lotBatchNumber')}</span>
            <input value={form.lotNumber} onChange={set('lotNumber')}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" placeholder={t('optionalPlaceholder')} />
          </label>

          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('notesOptional')}</span>
            <input value={form.notes} onChange={set('notes')}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </label>

          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={saving}
            className="w-full h-11 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Pencil size={16} />}
            {t('saveChanges')}
          </button>
        </form>
      </div>
    </div>
  );
}
