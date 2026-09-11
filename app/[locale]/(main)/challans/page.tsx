'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import {
  Truck, Plus, Search, X, Printer, Receipt, Ban, Loader2,
  Package, User, ChevronRight,
} from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { performSmartSearch } from '@/lib/smartSearch';
import { useBusinessStore } from '@/lib/businessStore';

type ChallanItem = {
  id?: string; productId: string; name: string; unit: string;
  variantKey?: string | null; quantity: number; price: number;
};
type Challan = {
  id: string; challanNumber: string; status: 'open' | 'invoiced' | 'cancelled';
  customerId?: string | null; customerName?: string | null; customerMobile?: string | null;
  customerAddress?: string | null; notes?: string | null; createdAt: string; invoicedAt?: string | null;
  items: ChallanItem[];
};

const STATUS_STYLE: Record<string, string> = {
  open: 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
  invoiced: 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  cancelled: 'bg-slate-200 dark:bg-slate-800 text-slate-500',
};

function challanTotal(c: Challan) {
  return c.items.reduce((s, it) => s + it.quantity * it.price, 0);
}

export default function ChallansPage() {
  const router = useRouter();
  const locale = useLocale();
  const { profile } = useBusinessStore();
  const [challans, setChallans] = useState<Challan[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'invoiced' | 'cancelled'>('all');
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [printChallan, setPrintChallan] = useState<Challan | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search.trim()) params.set('q', search.trim());
      const res = await api.get(`/challans?${params.toString()}`);
      setChallans(Array.isArray(res.data) ? res.data : []);
    } catch { setChallans([]); }
    finally { setLoading(false); }
  }, [statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  const handleCancel = async (c: Challan) => {
    if (!confirm(`Cancel challan ${c.challanNumber}? Stock will be restored.`)) return;
    setBusyId(c.id);
    try {
      await api.patch(`/challans/${c.id}`, { action: 'cancel' });
      load();
    } catch { alert('Failed to cancel challan.'); }
    finally { setBusyId(null); }
  };

  // Hands off to the normal Billing screen with this challan's items/party
  // pre-loaded — the actual Sale/GST/ledger/stock-decrement all still go
  // through the one real billing path (see WholesaleBillingUI's challan
  // prefill effect); this page never creates a Sale itself.
  const handleConvertToInvoice = (c: Challan) => {
    sessionStorage.setItem('pendingChallanInvoice', JSON.stringify(c));
    router.push(`/${locale}/billing`);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Truck className="text-emerald-500" size={28} /> Delivery Challans
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Dispatch goods now, raise the GST invoice later — stock moves the moment a challan is created.</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all active:scale-95"
        >
          <Plus size={18} /> New Challan
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1.5 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
          {(['all', 'open', 'invoiced', 'cancelled'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-colors',
                statusFilter === s ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search challan # or party"
            className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-emerald-500" size={32} /></div>
      ) : challans.length === 0 ? (
        <div className="p-16 text-center text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <Truck size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-bold">No delivery challans yet</p>
          <p className="text-sm mt-1">Create one when goods go out before the formal invoice.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3">Challan #</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Party</th>
                  <th className="px-4 py-3 text-center">Items</th>
                  <th className="px-4 py-3 text-right">Value</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {challans.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-slate-700 dark:text-slate-300">{c.challanNumber}</td>
                    <td className="px-4 py-3 text-slate-500">{new Date(c.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{c.customerName || '—'}</td>
                    <td className="px-4 py-3 text-center text-slate-500">{c.items.length}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">₹{challanTotal(c).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3">
                      <span className={cn('px-2 py-1 rounded-full text-[10px] font-bold uppercase', STATUS_STYLE[c.status])}>{c.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => setPrintChallan(c)} title="Print" className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
                          <Printer size={15} />
                        </button>
                        {c.status === 'open' && (
                          <>
                            <button
                              onClick={() => handleConvertToInvoice(c)}
                              disabled={busyId === c.id}
                              title="Convert to Invoice"
                              className="p-2 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            >
                              <Receipt size={15} />
                            </button>
                            <button
                              onClick={() => handleCancel(c)}
                              disabled={busyId === c.id}
                              title="Cancel"
                              className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-500/10 text-red-500"
                            >
                              <Ban size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showNew && (
        <NewChallanModal
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); load(); }}
        />
      )}
      {printChallan && (
        <PrintChallanModal challan={printChallan} shopName={profile?.shopName || 'Your Shop'} onClose={() => setPrintChallan(null)} />
      )}
    </div>
  );
}

// ─── New Challan Modal ──────────────────────────────────────────────────────
function NewChallanModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  type Party = { id: string; name: string; mobile?: string; address?: string };
  const [parties, setParties] = useState<Party[]>([]);
  const [partySearch, setPartySearch] = useState('');
  const [showPartyDropdown, setShowPartyDropdown] = useState(false);
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);

  const [products, setProducts] = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [cartItems, setCartItems] = useState<ChallanItem[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/crm/customers?type=party').then(r => setParties(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    api.get('/products').then(r => setProducts(Array.isArray(r.data) ? r.data : (r.data?.data || []))).catch(() => {});
  }, []);

  const searchResults = useMemo(() => {
    if (productSearch.trim().length < 2) return [];
    return performSmartSearch(products, productSearch).slice(0, 10);
  }, [products, productSearch]);

  const addItem = (p: any) => {
    setCartItems(prev => {
      const existing = prev.find(it => it.productId === p.id);
      if (existing) {
        return prev.map(it => it.productId === p.id ? { ...it, quantity: it.quantity + 1 } : it);
      }
      return [...prev, {
        productId: p.id, name: p.name, unit: p.baseUnit || p.base_unit || 'Unit',
        quantity: 1, price: Number(p.sellingPrice ?? p.selling_price) || 0,
      }];
    });
    setProductSearch('');
  };

  const updateItem = (idx: number, patch: Partial<ChallanItem>) => {
    setCartItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  };
  const removeItem = (idx: number) => setCartItems(prev => prev.filter((_, i) => i !== idx));

  const total = cartItems.reduce((s, it) => s + it.quantity * it.price, 0);

  const handleSave = async () => {
    if (!selectedParty) { setError('Please select a party.'); return; }
    if (cartItems.length === 0) { setError('Add at least one item.'); return; }
    setSaving(true);
    setError('');
    try {
      await api.post('/challans', {
        customerId: selectedParty.id,
        customerName: selectedParty.name,
        customerMobile: selectedParty.mobile,
        customerAddress: selectedParty.address,
        notes: notes.trim() || undefined,
        items: cartItems,
      });
      onCreated();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to save challan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl my-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-black text-lg text-slate-900 dark:text-white flex items-center gap-2"><Truck size={18} className="text-emerald-500" /> New Delivery Challan</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Party */}
          <div className="relative">
            <label className="text-xs font-bold text-slate-500 mb-1 block">Party <span className="text-red-500">*</span></label>
            {selectedParty ? (
              <div className="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl">
                <div className="flex items-center gap-2">
                  <User size={15} className="text-emerald-600" />
                  <span className="font-bold text-slate-900 dark:text-white">{selectedParty.name}</span>
                  {selectedParty.mobile && <span className="text-xs text-slate-500">{selectedParty.mobile}</span>}
                </div>
                <button onClick={() => setSelectedParty(null)} className="text-slate-400 hover:text-red-500"><X size={16} /></button>
              </div>
            ) : (
              <>
                <input
                  value={partySearch}
                  onChange={(e) => { setPartySearch(e.target.value); setShowPartyDropdown(true); }}
                  onFocus={() => setShowPartyDropdown(true)}
                  onBlur={() => setTimeout(() => setShowPartyDropdown(false), 200)}
                  placeholder="Search party by name or mobile"
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {showPartyDropdown && partySearch.trim() && (
                  <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {parties
                      .filter(p => p.name.toLowerCase().includes(partySearch.toLowerCase()) || (p.mobile || '').includes(partySearch))
                      .slice(0, 8)
                      .map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onMouseDown={() => { setSelectedParty(p); setPartySearch(''); setShowPartyDropdown(false); }}
                          className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 border-b border-slate-100 dark:border-slate-700 last:border-0"
                        >
                          <div className="font-bold text-sm text-slate-900 dark:text-slate-100">{p.name}</div>
                          <div className="text-xs text-slate-500">{p.mobile || 'No mobile'}</div>
                        </button>
                      ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Item search */}
          <div className="relative">
            <label className="text-xs font-bold text-slate-500 mb-1 block">Add Items</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search product to dispatch"
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            {searchResults.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                {searchResults.map((p: any) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addItem(p)}
                    className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 border-b border-slate-100 dark:border-slate-700 last:border-0 flex justify-between items-center"
                  >
                    <span className="font-bold text-sm text-slate-900 dark:text-slate-100">{p.name}</span>
                    <span className="text-xs text-slate-500">Stock: {p.currentStock ?? p.current_stock ?? '—'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Cart */}
          {cartItems.length > 0 && (
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Item</th>
                    <th className="px-3 py-2 text-center w-20">Qty</th>
                    <th className="px-3 py-2 text-right w-24">Price</th>
                    <th className="px-3 py-2 text-right w-24">Total</th>
                    <th className="px-3 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {cartItems.map((it, idx) => (
                    <tr key={idx}>
                      <td className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-200">{it.name}</td>
                      <td className="px-3 py-2">
                        <input type="number" min="0" value={it.quantity}
                          onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) || 0 })}
                          className="w-16 px-2 py-1 text-center bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="0" value={it.price}
                          onChange={(e) => updateItem(idx, { price: Number(e.target.value) || 0 })}
                          className="w-20 px-2 py-1 text-right bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg" />
                      </td>
                      <td className="px-3 py-2 text-right font-bold">₹{(it.quantity * it.price).toLocaleString('en-IN')}</td>
                      <td className="px-3 py-2">
                        <button onClick={() => removeItem(idx)} className="text-slate-400 hover:text-red-500"><X size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/50 flex justify-between text-sm font-bold border-t border-slate-200 dark:border-slate-800">
                <span>Total</span>
                <span>₹{total.toLocaleString('en-IN')}</span>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-slate-500 mb-1 block">Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>

          {error && <p className="text-xs text-red-500 font-semibold">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-900 py-3 rounded-xl font-black flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            {saving ? <Loader2 className="animate-spin" size={18} /> : <Truck size={18} />}
            {saving ? 'Saving…' : 'Create Challan & Dispatch'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Print View ─────────────────────────────────────────────────────────────
function PrintChallanModal({ challan, shopName, onClose }: { challan: Challan; shopName: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4 sm:p-8 print:bg-white print:p-0">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-4 print:shadow-none print:rounded-none print:max-w-full">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 print:hidden">
          <h2 className="font-black text-lg text-slate-900">Delivery Challan</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-slate-900 rounded-lg text-sm font-bold"><Printer size={14} /> Print</button>
            <button onClick={onClose} className="text-slate-400 hover:text-red-500"><X size={20} /></button>
          </div>
        </div>
        <div className="p-8 text-slate-900">
          <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-4">
            <div>
              <h1 className="text-xl font-black">{shopName}</h1>
              <p className="text-xs text-slate-500 mt-1">DELIVERY CHALLAN — Not a Tax Invoice</p>
            </div>
            <div className="text-right text-sm">
              <p><span className="text-slate-500">Challan #:</span> <span className="font-bold">{challan.challanNumber}</span></p>
              <p><span className="text-slate-500">Date:</span> {new Date(challan.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
              <p className="mt-1"><span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase', STATUS_STYLE[challan.status])}>{challan.status}</span></p>
            </div>
          </div>
          <div className="mb-4">
            <p className="text-xs font-bold text-slate-500 uppercase">Dispatched To</p>
            <p className="font-bold">{challan.customerName || '—'}</p>
            {challan.customerMobile && <p className="text-sm text-slate-600">{challan.customerMobile}</p>}
            {challan.customerAddress && <p className="text-sm text-slate-600">{challan.customerAddress}</p>}
          </div>
          <table className="w-full text-sm border border-slate-200">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-center">Unit</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Rate</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {challan.items.map((it, i) => (
                <tr key={i} className="border-t border-slate-200">
                  <td className="px-3 py-2">{i + 1}</td>
                  <td className="px-3 py-2 font-semibold">{it.name}{it.variantKey ? ` (${it.variantKey})` : ''}</td>
                  <td className="px-3 py-2 text-center">{it.unit}</td>
                  <td className="px-3 py-2 text-right">{it.quantity}</td>
                  <td className="px-3 py-2 text-right">₹{it.price.toLocaleString('en-IN')}</td>
                  <td className="px-3 py-2 text-right font-bold">₹{(it.quantity * it.price).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end mt-3">
            <div className="text-right">
              <p className="text-sm text-slate-500">Total Value</p>
              <p className="text-xl font-black">₹{challanTotal(challan).toLocaleString('en-IN')}</p>
            </div>
          </div>
          {challan.notes && (
            <div className="mt-4 text-xs text-slate-500">
              <p className="font-bold text-slate-700">Notes</p>
              <p>{challan.notes}</p>
            </div>
          )}
          <p className="mt-8 text-[11px] text-slate-400 text-center">Goods dispatched against this challan — a formal GST invoice follows separately.</p>
        </div>
      </div>
    </div>
  );
}
