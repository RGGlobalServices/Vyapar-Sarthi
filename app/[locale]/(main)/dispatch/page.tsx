'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { Plus, X, Loader2, ArrowUpFromLine, RotateCcw, Truck } from 'lucide-react';
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

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  dispatched: { label: 'Dispatched', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  returned:   { label: 'Returned',   cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
};

const TYPE_LABELS: Record<string, string> = {
  sale: 'Sale', sample: 'Sample', transfer: 'Transfer', job_work: 'Job Work', other: 'Other',
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export default function DispatchPage() {
  const t = useTranslations('Dispatch');
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const [creating, setCreating] = useState(false);
  const [returning, setReturning] = useState<DispatchRow | null>(null);

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
        <button onClick={() => setCreating(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors">
          <Plus size={18} /> {t('newDispatch')}
        </button>
      </div>

      {/* Filter bar */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {(['all', 'today', 'week', 'month', 'custom'] as const).map(f => (
            <button key={f} onClick={() => setDateFilter(f)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
                dateFilter === f ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700')}>
              {f === 'all' ? 'All Time' : f === 'today' ? 'Today' : f === 'week' ? 'This Week' : f === 'month' ? 'This Month' : 'Custom'}
            </button>
          ))}
        </div>
        {dateFilter === 'custom' && (
          <div className="flex items-center gap-2 flex-wrap">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="h-9 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            <span className="text-xs text-slate-400">to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="h-9 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {(['', 'sale', 'sample', 'transfer', 'job_work', 'other'] as const).map(typ => (
            <button key={typ} onClick={() => setTypeFilter(typ)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
                typeFilter === typ ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700')}>
              {typ === '' ? 'All Types' : TYPE_LABELS[typ] || typ}
            </button>
          ))}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <p className="text-[11px] text-slate-500">Dispatches</p>
            <p className="text-2xl font-black text-blue-600 dark:text-blue-400">{filteredRows.length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <p className="text-[11px] text-slate-500">Total Bags</p>
            <p className="text-2xl font-black text-blue-600 dark:text-blue-400">{totalBags.toLocaleString('en-IN')}</p>
          </div>
          {totalQty > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-[11px] text-slate-500">Total Qty</p>
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
          <p className="mt-3 text-sm text-slate-500">{rows.length === 0 ? t('noDispatches') : 'No dispatches match the current filter.'}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredRows.map(r => {
              const st = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.dispatched;
              return (
                <li key={r.id} className="p-4 flex items-center justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-slate-900 dark:text-white">{r.dispatchNumber}</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                      {r.dispatchType && r.dispatchType !== 'sale' && (
                        <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                          {TYPE_LABELS[r.dispatchType] ?? r.dispatchType}
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
                      {r.noOfBags != null && <span>{r.noOfBags} bags</span>}
                      {r.lotNumber && <span>Lot: {r.lotNumber}</span>}
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
                        Bill: {r.sale?.invoice_number || r.saleId.slice(0, 8) + '…'}
                      </p>
                    )}
                    {r.status === 'returned' && r.returnedAt && (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                        Returned {fmtDate(r.returnedAt)}{r.returnNotes ? ` — ${r.returnNotes}` : ''}
                      </p>
                    )}
                  </div>
                  {r.status === 'dispatched' && (
                    <button
                      onClick={() => setReturning(r)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-700 px-3 py-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors shrink-0"
                    >
                      <RotateCcw size={13} /> Return
                    </button>
                  )}
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
      await api.post('/logistics/dispatch', {
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
            <p className="text-xs font-bold uppercase text-indigo-600 dark:text-indigo-400 mb-2">Link to Bill (Optional)</p>
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
                  placeholder="Search by invoice no. or party name..."
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
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Dispatch Type</span>
              <select value={form.dispatchType} onChange={set('dispatchType')}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm">
                <option value="sale">Sale</option>
                <option value="sample">Sample</option>
                <option value="transfer">Transfer</option>
                <option value="job_work">Job Work</option>
                <option value="other">Other</option>
              </select>
            </label>
          </div>

          {/* Dispatch Date */}
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Dispatch Date</span>
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
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Driver Name</span>
              <input value={form.driverName} onChange={set('driverName')}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" placeholder="Driver" />
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
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">No. of Bags</span>
              <input type="number" min="0" step="1" value={form.noOfBags} onChange={set('noOfBags')}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            </label>
          </div>

          {/* Lot Number */}
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Lot / Batch Number</span>
            <input value={form.lotNumber} onChange={set('lotNumber')}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" placeholder="Optional" />
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
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || 'Failed to mark as returned');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-black flex items-center gap-2"><RotateCcw size={18} className="text-amber-500" /> Mark as Returned</h2>
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
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Stock will be credited back: +{entry.quantity} {entry.unit || entry.product.baseUnit || ''}</p>
            )}
          </div>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Return Date</span>
            <input type="date" value={returnedAt} onChange={e => setReturnedAt(e.target.value)}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Reason for Return</span>
            <input value={returnNotes} onChange={e => setReturnNotes(e.target.value)}
              placeholder="e.g. Receiver not available, quality issue..."
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </label>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={saving}
            className="w-full h-11 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
            Confirm Return
          </button>
        </form>
      </div>
    </div>
  );
}
