'use client';

import { useMemo, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { Plus, X, Loader2, Wheat } from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn } from '@/lib/utils';
import ModalPortal from '@/components/mill/ModalPortal';

type Lot = {
  id: string;
  lotNumber: string | null;
  farmerName: string | null;
  purchaseDate: string;
  weightKg: number | null;
  moisturePct: number | null;
  ratePerKg: number | null;
  totalAmount: number | null;
  remainingKg: number | null;
  notes: string | null;
  productId?: string | null;
  source?: 'purchase' | 'weighbridge' | 'manual';
  sourceRef?: string | null;
  product?: { id: string; name: string; baseUnit: string | null } | null;
  supplier?: { id: string; name: string; mobile: string | null } | null;
  batches?: { id: string; batchNumber: string; inputKg: number | null; status: string }[];
};
type Product = { id: string; name: string; millCategory?: string | null; baseUnit?: string | null };

const fetcher = (u: string) => api.get(u).then(r => r.data);
const rupee = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

// Raw Material — the mill's incoming-goods register: every lot of Paddy /
// Wheat / Bajra bought from a farmer, with its own moisture%, rate, and
// remaining-to-consume weight. Distinct from the Products catalogue (which
// only shows a rolled-up stock total) — RawMaterialLot already existed as a
// real DB model + API (feeding the Batches "pick a lot" flow) but had no
// page of its own. This is that page: list lots, add a new one, and see at
// a glance what's still available for the next production batch.
export default function RawMaterialPage() {
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const [statusFilter, setStatusFilter] = useState<'available' | 'consumed' | 'all'>('available');
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<Lot | null>(null);

  // Every lot is fetched once; the tabs and the summary cards are derived from it (a lot is Available while anything remains).
  const { data: allLots = [], mutate: refetch, isLoading } = useSWR<Lot[]>(
    activeShopId ? ['/mill/raw-lots', activeShopId] : null,
    ([u]) => fetcher(u),
  );
  const lots = useMemo(() => allLots.filter(l => {
    const remaining = l.remainingKg ?? 0;
    return statusFilter === 'all' ? true : statusFilter === 'available' ? remaining > 0 : remaining <= 0;
  }), [allLots, statusFilter]);
  const { data: products = [] } = useSWR<Product[]>(activeShopId ? ['/products', activeShopId] : null, ([u]) => fetcher(u));
  const rawProducts = useMemo(
    () => products.filter(p => !p.millCategory || p.millCategory === 'raw_material'),
    [products],
  );

  const totals = useMemo(() => {
    const received = allLots.reduce((s, l) => s + (l.weightKg || 0), 0);
    const available = allLots.reduce((s, l) => s + (l.remainingKg || 0), 0);
    const stockValue = allLots.reduce((s, l) => s + (l.remainingKg || 0) * (l.ratePerKg || 0), 0);
    return { received, available, consumed: Math.max(0, received - available), stockValue };
  }, [allLots]);

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Wheat size={22} className="text-amber-600" /> Raw Material
          </h1>
          <p className="text-sm text-slate-500 mt-1">Lot-wise incoming raw material — where it came from, how much is available and how much production has used.</p>
        </div>
        <button onClick={() => setAdding(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors">
          <Plus size={18} /> Add Lot
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="rm-cards">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 uppercase font-bold">Total Received</p>
          <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{totals.received.toLocaleString('en-IN')} Kg</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 uppercase font-bold">Available</p>
          <p className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1">{totals.available.toLocaleString('en-IN')} Kg</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 uppercase font-bold">Consumed</p>
          <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{totals.consumed.toLocaleString('en-IN')} Kg</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 uppercase font-bold">Stock Value</p>
          <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{rupee(totals.stockValue)}</p>
          <p className="text-[10px] text-slate-400">available × rate</p>
        </div>
      </div>

      <div className="flex items-center bg-white dark:bg-slate-900 rounded-lg p-1 border border-slate-200 dark:border-slate-800 w-fit">
        {(['available', 'consumed', 'all'] as const).map(s => (
          <button key={s} type="button" onClick={() => setStatusFilter(s)}
            className={cn('px-3 py-1.5 rounded-md text-xs font-bold capitalize transition-colors', statusFilter === s ? 'bg-emerald-500 text-white' : 'text-slate-500')}>
            {s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
      ) : lots.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
          <Wheat size={40} className="mx-auto text-slate-300 dark:text-slate-700" />
          <p className="mt-3 text-sm text-slate-500">No lots here. Add a lot, import a purchase line, or add a weighbridge slip.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 font-bold">Lot</th>
                <th className="px-3 py-3 font-bold">Product</th>
                <th className="px-3 py-3 font-bold">Source</th>
                <th className="px-3 py-3 font-bold">Farmer / Vendor</th>
                <th className="px-3 py-3 font-bold">Date</th>
                <th className="px-3 py-3 font-bold text-right">Weight</th>
                <th className="px-3 py-3 font-bold text-right">Moisture</th>
                <th className="px-3 py-3 font-bold text-right">Rate/Kg</th>
                <th className="px-3 py-3 font-bold text-right">Amount</th>
                <th className="px-3 py-3 font-bold text-right">Remaining</th>
                <th className="px-3 py-3 font-bold">Used in</th>
                <th className="px-3 py-3 font-bold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {lots.map(l => {
                const remaining = l.remainingKg ?? 0;
                const isConsumed = remaining <= 0;
                return (
                  <tr key={l.id} onClick={() => setViewing(l)} data-testid="raw-lot-row" className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 cursor-pointer">
                    <td className="px-4 py-2.5 font-mono text-xs font-bold text-slate-700 dark:text-slate-300">{l.lotNumber || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{l.product?.name || '—'}</td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap" data-source={l.source}>
                      <span className={cn('font-bold uppercase text-[10px] px-2 py-0.5 rounded-full',
                        l.source === 'weighbridge' ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300'
                          : l.source === 'purchase' ? 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300')}>
                        {l.source === 'weighbridge' ? 'Weighbridge' : l.source === 'purchase' ? 'Purchase' : 'Manual'}
                      </span>
                      {l.sourceRef && <span className="ml-1.5 font-mono text-[10px] text-slate-500">{l.sourceRef}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{l.farmerName || l.supplier?.name || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-500">{new Date(l.purchaseDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-slate-900 dark:text-white">{(l.weightKg ?? 0).toLocaleString('en-IN')} Kg</td>
                    <td className="px-3 py-2.5 text-right text-slate-500">{l.moisturePct != null ? `${l.moisturePct}%` : '—'}</td>
                    <td className="px-3 py-2.5 text-right text-slate-500">{l.ratePerKg != null ? rupee(l.ratePerKg) : '—'}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-slate-900 dark:text-white">{l.totalAmount != null ? rupee(l.totalAmount) : '—'}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-amber-600 dark:text-amber-400">{remaining.toLocaleString('en-IN')} Kg</td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">
                      {l.batches?.length ? l.batches.map(b => (
                        <span key={b.id} className="inline-block mr-1 font-mono">{b.batchNumber}</span>
                      )) : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn('text-[10px] font-black uppercase px-2 py-0.5 rounded-full', isConsumed ? 'bg-slate-200 dark:bg-slate-700 text-slate-500' : 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400')}>
                        {isConsumed ? 'Consumed' : 'Available'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {viewing && (
        <ModalPortal><LotDetailModal lot={viewing} onClose={() => setViewing(null)} /></ModalPortal>
      )}

      {adding && (
        <ModalPortal><AddLotModal
          products={rawProducts}
          onClose={() => setAdding(false)}
          onAdded={() => { setAdding(false); refetch(); }}
        /></ModalPortal>
      )}
    </div>
  );
}

// One lot's full detail — the row itself is too narrow to show everything (notes, every batch it fed, the full source reference).
function LotDetailModal({ lot, onClose }: { lot: Lot; onClose: () => void }) {
  const remaining = lot.remainingKg ?? 0;
  const isConsumed = remaining <= 0;
  const rows: [string, React.ReactNode][] = [
    ['Lot Number', lot.lotNumber || '—'],
    ['Product', lot.product?.name || '—'],
    ['Source', <span key="s">
      <span className={cn('font-bold uppercase text-[10px] px-2 py-0.5 rounded-full',
        lot.source === 'weighbridge' ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300'
          : lot.source === 'purchase' ? 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300'
          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300')}>
        {lot.source === 'weighbridge' ? 'Weighbridge' : lot.source === 'purchase' ? 'Purchase' : 'Manual'}
      </span>
      {lot.sourceRef && <span className="ml-1.5 font-mono text-xs text-slate-500">{lot.sourceRef}</span>}
    </span>],
    ['Farmer / Vendor', lot.farmerName || lot.supplier?.name || '—'],
    ['Vendor Mobile', lot.supplier?.mobile || '—'],
    ['Date', new Date(lot.purchaseDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })],
    ['Weight Received', `${(lot.weightKg ?? 0).toLocaleString('en-IN')} Kg`],
    ['Moisture', lot.moisturePct != null ? `${lot.moisturePct}%` : '—'],
    ['Rate / Kg', lot.ratePerKg != null ? rupee(lot.ratePerKg) : '—'],
    ['Total Amount', lot.totalAmount != null ? rupee(lot.totalAmount) : '—'],
    ['Remaining', <span key="r" className="font-bold text-amber-600 dark:text-amber-400">{remaining.toLocaleString('en-IN')} Kg</span>],
    ['Status', <span key="st" className={cn('text-[10px] font-black uppercase px-2 py-0.5 rounded-full', isConsumed ? 'bg-slate-200 dark:bg-slate-700 text-slate-500' : 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300')}>
      {isConsumed ? 'Consumed' : 'Available'}
    </span>],
  ];
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2"><Wheat size={18} className="text-amber-600" /> Lot Details</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <div className="p-6 overflow-y-auto space-y-3">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-start justify-between gap-4 text-sm">
              <span className="text-slate-500">{label}</span>
              <span className="font-semibold text-slate-900 dark:text-white text-right">{value}</span>
            </div>
          ))}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
            <p className="text-slate-500 text-sm mb-1.5">Used in (production batches)</p>
            {lot.batches?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {lot.batches.map(b => (
                  <span key={b.id} className="text-xs font-mono px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {b.batchNumber}{b.inputKg != null ? ` · ${b.inputKg} Kg` : ''} · {b.status}
                  </span>
                ))}
              </div>
            ) : <p className="text-sm text-slate-400">Not used in any batch yet.</p>}
          </div>
          {lot.notes && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
              <p className="text-slate-500 text-sm mb-1">Notes</p>
              <p className="text-sm text-slate-700 dark:text-slate-300">{lot.notes}</p>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button onClick={onClose} className="px-5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
}

const KG_PER: Record<string, number> = { kg: 1, kgs: 1, kilogram: 1, g: 0.001, gm: 0.001, gram: 0.001, quintal: 100, qtl: 100, ton: 1000, tonne: 1000, mt: 1000 };
const kgPerUnit = (u?: string | null) => KG_PER[String(u ?? 'kg').trim().toLowerCase()] ?? null;

function AddLotModal({ products, onClose, onAdded }: {
  products: Product[]; onClose: () => void; onAdded: () => void;
}) {
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const { mutate: globalMutate } = useSWRConfig();
  // Purchase lines that are not in a lot yet — an optional shortcut, so material bought on a bill can be brought in here.
  const { data: purchasesResp } = useSWR(activeShopId ? ['/purchases?limit=100', activeShopId] : null, ([u]) => fetcher(u));
  const { data: allLots = [] } = useSWR<any[]>(activeShopId ? ['/mill/raw-lots', activeShopId] : null, ([u]) => fetcher(u));
  const candidates = useMemo(() => {
    const invoices: any[] = Array.isArray(purchasesResp) ? purchasesResp : (purchasesResp?.data || []);
    const out: { key: string; productId: string; productName: string; invoiceNumber: string; lotNumber: string; supplier: string; date: string; kg: number; ratePerKg: number }[] = [];
    for (const inv of invoices) {
      const items: any[] = inv.purchaseItems || [];
      items.forEach((it, idx) => {
        const per = kgPerUnit(it.product?.baseUnit);
        const inv_no = inv.invoiceNumber || '';
        if (!per || !it.product || !(Number(it.quantity) > 0) || !inv_no) return;
        const already = allLots.some((l: any) => l.productId === it.productId && (l.lotNumber === inv_no || String(l.lotNumber || '').startsWith(`${inv_no}-L`)));
        if (already) return;
        const kg = Math.round(Number(it.quantity) * per * 1000) / 1000;
        out.push({
          key: `${inv.id}:${it.id}`, productId: it.productId, productName: it.product.name, invoiceNumber: inv_no,
          lotNumber: items.length > 1 ? `${inv_no}-L${idx + 1}` : inv_no,
          supplier: inv.supplier?.name || '', date: String(inv.date || inv.createdAt || '').slice(0, 10), kg,
          ratePerKg: Math.round((Number(it.cost) || 0) / per * 100) / 100,
        });
      });
    }
    return out;
  }, [purchasesResp, allLots]);
  const [importKey, setImportKey] = useState('');
  const [slipId, setSlipId] = useState('');
  const { data: slips = [] } = useSWR<any[]>(activeShopId ? ['/mill/weighbridge?status=completed', activeShopId] : null, ([u]) => fetcher(u));
  const imported = !!importKey || !!slipId;
  const [newProd, setNewProd] = useState<string | null>(null);   // draft name while creating a product
  const [creatingProd, setCreatingProd] = useState(false);
  const [form, setForm] = useState({
    productId: '', lotNumber: '', farmerName: '', purchaseDate: new Date().toISOString().slice(0, 10),
    weightKg: '', moisturePct: '', ratePerKg: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const weight = Number(form.weightKg) || 0;
  const rate = Number(form.ratePerKg) || 0;
  const computedTotal = weight > 0 && rate > 0 ? Math.round(weight * rate * 100) / 100 : null;

  // Weighbridge slip: the NET weight is the lot quantity (server-side, read from the slip). Saving converts the slip into the lot.
  const importFromSlip = (id: string) => {
    setSlipId(id);
    setImportKey('');
    const w = slips.find((x: any) => x.id === id);
    if (!w) return;
    setForm(f => ({ ...f, productId: w.productId || f.productId, lotNumber: w.slipNumber, farmerName: w.supplier?.name || f.farmerName, purchaseDate: String(w.secondWeighedAt || w.createdAt || '').slice(0, 10) || f.purchaseDate, weightKg: String(w.netWeightKg ?? ''), moisturePct: w.moisturePct != null ? String(w.moisturePct) : f.moisturePct, ratePerKg: w.ratePerKg != null ? String(w.ratePerKg) : f.ratePerKg, notes: `Weighbridge slip ${w.slipNumber}` }));
  };

  const importFromPurchase = (key: string) => {
    setImportKey(key);
    const c = candidates.find(x => x.key === key);
    if (!c) return;
    setSlipId('');
    setForm(f => ({ ...f, productId: c.productId, lotNumber: c.lotNumber, farmerName: c.supplier, purchaseDate: c.date || f.purchaseDate, weightKg: String(c.kg), ratePerKg: c.ratePerKg ? String(c.ratePerKg) : '', notes: `Imported from Purchase Invoice ${c.invoiceNumber}` }));
  };

  // Only after the user confirms: create the raw material product in Product Master, then select it.
  const createProduct = async () => {
    const name = (newProd || '').trim();
    if (!name) return;
    setCreatingProd(true); setError('');
    try {
      const { data: created } = await api.post('/products', { name, category: 'Raw Material', millCategory: 'raw_material', baseUnit: 'kg', currentStock: 0, sellingPrice: 0 });
      await globalMutate(['/products', activeShopId]);
      products.push({ id: created.id, name, millCategory: 'raw_material' } as any);
      setForm(f => ({ ...f, productId: created.id }));
      setNewProd(null);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || 'Failed to create product');
    } finally { setCreatingProd(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.productId) { setError('Select the raw material product (or create it with "+ New product").'); return; }
    setSaving(true); setError('');
    try {
      if (slipId) {
        await api.post(`/mill/weighbridge/${slipId}/convert-to-lot`, {
          productId: form.productId, lotNumber: form.lotNumber, farmerName: form.farmerName, ratePerKg: form.ratePerKg || undefined, moisturePct: form.moisturePct || undefined,
        });
        onAdded();
        return;
      }
      await api.post('/mill/raw-lots', {
        purchaseItemId: importKey ? importKey.split(':')[1] : undefined,
        productId: form.productId,
        lotNumber: form.lotNumber, farmerName: form.farmerName,
        purchaseDate: form.purchaseDate, weightKg: form.weightKg,
        moisturePct: form.moisturePct || undefined,
        ratePerKg: form.ratePerKg || undefined,
        notes: form.notes,
      });
      onAdded();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || 'Failed to add lot');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900">
          <h2 className="text-lg font-black">Add Raw Material Lot</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 space-y-1.5" data-testid="import-from-purchase">
            <span className="block text-xs font-bold uppercase text-slate-500">Import from Purchase (optional)</span>
            <select value={importKey} onChange={e => e.target.value ? importFromPurchase(e.target.value) : setImportKey('')}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm">
              <option value="">{candidates.length ? '— Select a purchase line —' : 'No purchase lines waiting to be added'}</option>
              {candidates.map(c => <option key={c.key} value={c.key}>{c.invoiceNumber} · {c.productName} · {c.kg} kg{c.supplier ? ` · ${c.supplier}` : ''}</option>)}
            </select>
            <p className="text-[10px] text-slate-400">Bought on a purchase bill? Bring it in as a lot — stock is not added twice.</p>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 space-y-1.5" data-testid="import-from-weighbridge">
            <span className="block text-xs font-bold uppercase text-slate-500">Import from Weighbridge (optional)</span>
            <select value={slipId} onChange={e => e.target.value ? importFromSlip(e.target.value) : setSlipId('')}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm">
              <option value="">{slips.length ? '— Select a completed slip —' : 'No completed weighbridge slips waiting'}</option>
              {slips.map((w: any) => <option key={w.id} value={w.id}>{w.slipNumber} · {w.vehicleNumber}{w.product?.name ? ` · ${w.product.name}` : ''} · net {w.netWeightKg} kg</option>)}
            </select>
            <p className="text-[10px] text-slate-400">Uses the NET weight. Not using a weighbridge? Skip this or add the lot manually.</p>
          </div>
          <div className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Product *</span>
            <select value={newProd !== null ? '__new__' : form.productId} required
              onChange={e => { if (e.target.value === '__new__') { setNewProd(''); } else { setNewProd(null); setForm(f => ({ ...f, productId: e.target.value })); } }}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm">
              <option value="" disabled hidden>Select product</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value="__new__">+ New product…</option>
            </select>
            {newProd !== null && (
              <div className="mt-2 flex flex-wrap items-end gap-2 p-2 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10" data-testid="new-raw-product">
                <input autoFocus value={newProd} onChange={e => setNewProd(e.target.value)} placeholder="Product name (e.g. Paddy)"
                  className="flex-1 min-w-[10rem] h-9 px-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-950 text-sm" />
                <button type="button" onClick={createProduct} disabled={creatingProd || !newProd.trim()}
                  className="h-9 px-3 text-xs font-bold rounded-md bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50">
                  {creatingProd ? '…' : 'Confirm & create'}
                </button>
                <button type="button" onClick={() => setNewProd(null)} className="h-9 px-2 text-xs font-semibold text-slate-500">Cancel</button>
                <p className="basis-full text-[10px] text-amber-700 dark:text-amber-400">Adds a raw material product (kg) to Product Master. Nothing is created until you confirm.</p>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Lot Number</span>
              <input value={form.lotNumber} onChange={e => setForm(f => ({ ...f, lotNumber: e.target.value }))}
                placeholder="Auto if blank" className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            </label>
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Date</span>
              <input type="date" value={form.purchaseDate} onChange={e => setForm(f => ({ ...f, purchaseDate: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            </label>
          </div>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Farmer / Vendor Name</span>
            <input value={form.farmerName} onChange={e => setForm(f => ({ ...f, farmerName: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Weight (Kg) *</span>
              <input type="number" min="0" step="0.01" value={form.weightKg} onChange={e => setForm(f => ({ ...f, weightKg: e.target.value }))} readOnly={imported}
                className={cn('w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm', imported && 'opacity-70')} required />
              {!imported && form.productId && Number(form.weightKg) > 0 && (
                <span className="block text-[10px] text-amber-600 dark:text-amber-400 mt-1">Adds {form.weightKg} kg to this product's stock. Bought on a bill? Use Import from Purchase instead, so stock is not counted twice.</span>
              )}
            </label>
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Moisture %</span>
              <input type="number" min="0" max="100" step="0.1" value={form.moisturePct} onChange={e => setForm(f => ({ ...f, moisturePct: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            </label>
          </div>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Rate / Kg (₹)</span>
            <input type="number" min="0" step="0.01" value={form.ratePerKg} onChange={e => setForm(f => ({ ...f, ratePerKg: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            {computedTotal != null && <span className="block text-[11px] text-slate-400 mt-1">Total: {rupee(computedTotal)}</span>}
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Notes</span>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </label>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={saving || !form.weightKg || !form.productId}
            className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Add Lot
          </button>
        </form>
      </div>
    </div>
  );
}
