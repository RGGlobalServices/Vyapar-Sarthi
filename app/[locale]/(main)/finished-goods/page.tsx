'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Boxes, Loader2, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn } from '@/lib/utils';

type Lot = { id: string; batchNumber: string | null; quantity: number; initialQuantity: number | null; createdAt: string | null; packs?: Array<{ packKg: number; packs: number; packType: string }> };
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
  const { data: rawData, isLoading } = useSWR<any>(activeShopId ? ['/mill/finished-goods', activeShopId] : null, ([u]) => fetcher(u));
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const rawList: any[] = useMemo(() => {
    if (Array.isArray(rawData)) return rawData;
    if (Array.isArray(rawData?.items)) return rawData.items;
    return [];
  }, [rawData]);

  const rows: FG[] = useMemo(() => {
    if (rawList.length === 0) return [];

    if (rawList[0]?.name !== undefined && rawList[0]?.lots !== undefined) {
      return rawList as FG[];
    }

    const grouped: { [productId: string]: FG } = {};

    rawList.forEach((item: any) => {
      const p = item.product || {};
      const pId = p.id || item.productId || item.id;
      const pName = p.name || item.name || 'Finished Product';
      const baseUnit = p.baseUnit || item.unit || 'kg';

      if (!grouped[pId]) {
        grouped[pId] = {
          id: pId,
          name: pName,
          baseUnit: baseUnit,
          currentStock: 0,
          sellingPrice: p.sellingPrice ?? item.sellingPrice ?? null,
          mrp: p.mrp ?? item.mrp ?? null,
          minStock: p.minStock ?? item.minStock ?? null,
          produced: 0,
          batchesCount: 0,
          lastBatch: null,
          lots: [],
        };
      }

      const fg = grouped[pId];
      const availQty = Number(item.availableQuantity ?? item.quantity ?? 0);
      const origQty = Number(item.quantity ?? 0);

      fg.produced += origQty;
      fg.currentStock = (fg.currentStock || 0) + availQty;

      if (item.batch) {
        fg.batchesCount += 1;
        if (!fg.lastBatch || (item.createdAt && new Date(item.createdAt) > new Date(fg.lastBatch.date || 0))) {
          fg.lastBatch = {
            id: item.batch.id,
            batchNumber: item.batch.batchNumber || item.lotNumber || '—',
            date: item.createdAt || null,
          };
        }
      }

      fg.lots.push({
        id: item.id,
        batchNumber: item.batch?.batchNumber || item.lotNumber || '—',
        quantity: availQty,
        initialQuantity: origQty !== availQty ? origQty : null,
        createdAt: item.createdAt || null,
        packs: Array.isArray(item.packs) ? item.packs : [],
      });
    });

    return Object.values(grouped);
  }, [rawList]);

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
        <Link href="/products?view=finished-goods" className="text-xs font-bold text-slate-500 hover:text-emerald-600">View in Products →</Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="fg-cards">
        {[['Products', String(totals.products)], ['Produced (all batches)', qty(totals.produced)], ['In stock', qty(totals.inStock)], ['Stock value (at selling price)', rupee(totals.value)]].map(([l, v]) => (
          <div key={l} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <p className="text-xs text-slate-500 uppercase font-bold">{l}</p>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-1 break-words">{v}</p>
          </div>
        ))}
      </div>

      {rows.length > 1 && (
        <div>
          <h2 className="text-xs font-bold uppercase text-slate-500 mb-2 tracking-wider">By Product</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {rows.map(r => {
              const stockVal = (r.currentStock || 0) * (r.sellingPrice || 0);
              const low = r.minStock != null && r.minStock > 0 && (r.currentStock || 0) <= r.minStock;
              return (
                <div key={r.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2">
                  <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{r.name}</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-bold">Produced</p>
                      <p className="text-sm font-black text-slate-700 dark:text-slate-200">{qty(r.produced, r.baseUnit)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-bold">In Stock</p>
                      <p className={cn('text-sm font-black', low ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400')}>{qty(r.currentStock, r.baseUnit)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-bold">Stock Value</p>
                      <p className="text-sm font-black text-slate-700 dark:text-slate-200">{rupee(stockVal)}</p>
                    </div>
                  </div>
                  {r.lastBatch && (
                    <p className="text-[11px] text-slate-400">Last batch: {r.lastBatch.batchNumber} · {fmtDate(r.lastBatch.date)}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

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
          <td colSpan={7} className="px-4 py-4" data-testid="fg-lots">
            {r.lots.length === 0 ? <p className="text-xs text-slate-500">No batch-wise lots with stock left.</p> : (() => {
              // Aggregate packet sizes across all lots
              const packTotals = new Map<string, { packKg: number; packType: string; packs: number }>();
              for (const l of r.lots) {
                for (const k of (l.packs || [])) {
                  const key = `${k.packKg}|${k.packType}`;
                  const cur = packTotals.get(key) ?? { packKg: k.packKg, packType: k.packType, packs: 0 };
                  cur.packs += k.packs;
                  packTotals.set(key, cur);
                }
              }
              const packLabel = (k: { packKg: number; packType: string }) =>
                `${k.packKg} kg ${k.packType === 'goni' ? 'goni' : k.packType === 'other' ? 'pack' : 'bag'}`;
              return (
                <div className="space-y-3">
                  {packTotals.size > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase text-slate-400 mb-1.5">Packet Sizes (total in stock)</p>
                      <div className="flex flex-wrap gap-2">
                        {Array.from(packTotals.values()).map(k => (
                          <span key={`${k.packKg}|${k.packType}`} className="text-xs px-3 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-bold">
                            {k.packs} × {packLabel(k)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400 mb-1.5">Batch-wise Breakdown</p>
                    <div className="space-y-1.5">
                      {r.lots.map(l => (
                        <div key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
                          <span className="font-mono font-bold text-slate-800 dark:text-white">{l.batchNumber || '—'}</span>
                          <span className="text-slate-500">{fmtDate(l.createdAt)}</span>
                          <span className={cn('font-bold', (l.quantity || 0) > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400')}>
                            {qty(l.quantity, r.baseUnit)} in stock
                          </span>
                          {l.initialQuantity != null && l.initialQuantity !== l.quantity && (
                            <span className="text-slate-400">of {qty(l.initialQuantity, r.baseUnit)} made</span>
                          )}
                          {l.packs && l.packs.length > 0 && (
                            <span className="text-slate-500">{l.packs.map(k => `${k.packs} × ${packLabel(k)}`).join(' + ')}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
          </td>
        </tr>
      )}
    </>
  );
}
