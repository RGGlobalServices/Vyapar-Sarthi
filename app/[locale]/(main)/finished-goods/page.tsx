'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Boxes, Loader2, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn } from '@/lib/utils';

type Lot = { id: string; batchNumber: string | null; quantity: number; initialQuantity: number | null; createdAt: string | null };
type FG = {
  id: string; name: string | null; baseUnit: string | null; currentStock: number | null; sellingPrice: number | null; mrp: number | null; minStock: number | null;
  produced: number; batchesCount: number; lastBatch: { id: string; batchNumber: string; date: string | null } | null; lots: Lot[];
};

const fetcher = (u: string) => api.get(u).then(r => r.data);
const rupee = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const qty = (n: number | null | undefined, u?: string | null) => `${(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${u || 'kg'}`;

// Finished Goods — what production has made that you can sell. A VIEW over the Product master (price, stock, unit) and production:
// how much each batch made, and the batch-wise lots the stock sits in. It creates no products and holds no stock of its own —
// prices and details are edited in Products, and sales go through Billing as usual.
export default function FinishedGoodsPage() {
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const { data: rows = [], isLoading } = useSWR<FG[]>(activeShopId ? ['/mill/finished-goods', activeShopId] : null, ([u]) => fetcher(u));
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const filtered = useMemo(() => rows.filter(r => !q.trim() || (r.name || '').toLowerCase().includes(q.trim().toLowerCase())), [rows, q]);
  const totals = useMemo(() => ({
    products: rows.length,
    produced: rows.reduce((a, r) => a + r.produced, 0),
    inStock: rows.reduce((a, r) => a + (r.currentStock || 0), 0),
    value: rows.reduce((a, r) => a + (r.currentStock || 0) * (r.sellingPrice || 0), 0),
  }), [rows]);

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2"><Boxes size={22} className="text-emerald-600" /> Finished Goods</h1>
          <p className="text-sm text-slate-500 mt-1">What your production has made and can sell — how much each batch made, what is in stock, and the batch-wise lots. Prices and details are edited in Products; sales go through Billing.</p>
        </div>
        <Link href="/products" className="text-xs font-bold text-slate-500 hover:text-emerald-600">Products →</Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="fg-cards">
        {[['Products', String(totals.products)], ['Produced (all batches)', qty(totals.produced)], ['In stock', qty(totals.inStock)], ['Stock value (at selling price)', rupee(totals.value)]].map(([l, v]) => (
          <div key={l} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <p className="text-xs text-slate-500 uppercase font-bold">{l}</p>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-1 break-words">{v}</p>
          </div>
        ))}
      </div>

      <label className="relative block max-w-md">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search finished goods…" className="w-full h-10 pl-9 pr-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm" />
      </label>

      {isLoading ? (
        <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
          <Boxes size={40} className="mx-auto text-slate-300 dark:text-slate-700" />
          <p className="mt-3 text-sm text-slate-500">{rows.length === 0 ? 'No finished goods yet. Finalize a production batch with a finished-good output (a product classed as Finished Goods) and it appears here.' : 'No finished goods match your search.'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <table className="w-full text-sm text-left min-w-[760px]" data-testid="fg-table">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 font-bold">Product</th>
                <th className="px-3 py-3 font-bold text-right">Produced</th>
                <th className="px-3 py-3 font-bold text-right">In stock</th>
                <th className="px-3 py-3 font-bold text-right">Selling price</th>
                <th className="px-3 py-3 font-bold">Last batch</th>
                <th className="px-3 py-3 font-bold text-right">Lots</th>
                <th className="px-3 py-3 font-bold w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map(r => {
                const low = r.minStock != null && r.minStock > 0 && (r.currentStock || 0) <= r.minStock;
                return (
                  <FGRow key={r.id} r={r} low={low} isOpen={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FGRow({ r, low, isOpen, onToggle }: { r: FG; low: boolean; isOpen: boolean; onToggle: () => void }) {
  return (
    <>
      <tr onClick={onToggle} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 cursor-pointer">
        <td className="px-4 py-2.5">
          <Link href={`/products/${r.id}` as any} onClick={e => e.stopPropagation()} className="font-semibold text-slate-900 dark:text-white hover:text-emerald-600">{r.name}</Link>
        </td>
        <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-300 whitespace-nowrap">{qty(r.produced, r.baseUnit)}</td>
        <td className={cn('px-3 py-2.5 text-right font-bold whitespace-nowrap', low ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400')}>{qty(r.currentStock, r.baseUnit)}{low ? ' · low' : ''}</td>
        <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-300 whitespace-nowrap">{r.sellingPrice != null ? rupee(r.sellingPrice) : '—'}</td>
        <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">{r.lastBatch ? `${r.lastBatch.batchNumber} · ${fmtDate(r.lastBatch.date)}` : '—'}</td>
        <td className="px-3 py-2.5 text-right text-slate-500">{r.lots.length}</td>
        <td className="px-3 py-2.5 text-slate-400">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
      </tr>
      {isOpen && (
        <tr className="bg-slate-50/60 dark:bg-slate-800/30">
          <td colSpan={7} className="px-4 py-3" data-testid="fg-lots">
            {r.lots.length === 0 ? <p className="text-xs text-slate-500">No batch-wise lots with stock left.</p> : (
              <div className="flex flex-wrap gap-2">
                {r.lots.map(l => (
                  <span key={l.id} className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                    <strong className="font-mono">{l.batchNumber || '—'}</strong> · {qty(l.quantity, r.baseUnit)}{l.initialQuantity != null ? ` of ${l.initialQuantity}` : ''} · {fmtDate(l.createdAt)}
                  </span>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
