'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Search } from 'lucide-react';
import api from '@/lib/api';
import { lotLabel } from '@/lib/lots';
import { variantLabel } from '@/lib/variants';

type LotRow = {
  id: string; productName: string; batchNumber: string | null; variantKey: string | null;
  quantity: number; initialQuantity: number | null; costPrice: number | null; sellingPrice: number | null;
  expiryDate: string | null; purchaseDate: string | null; stockValueAtCost: number; stockValueAtPrice: number;
  sold: number; pricedQty: number; revenue: number; profit: number;
};

const rupee = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/**
 * Lot-wise stock & sales: each lot with what is left, its cost / selling price, expiry, and (from bills) how much
 * was sold from it with revenue and profit. Revenue/profit cover only bill lines that recorded the lot's price.
 */
export default function LotReportModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<LotRow[]>([]);
  const [totals, setTotals] = useState<any>(null);
  const [truncated, setTruncated] = useState(false);
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const [debounced, setDebounced] = useState('');

  useEffect(() => { const t = setTimeout(() => setDebounced(q), 350); return () => clearTimeout(t); }, [q]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    api.get('/reports/lots', { params: { ...(all ? { all: 1 } : {}), ...(debounced ? { q: debounced } : {}) } })
      .then((res) => { if (!live) return; setRows(res.data?.lots || []); setTotals(res.data?.totals || null); setTruncated(!!res.data?.truncated); })
      .catch(() => { if (live) { setRows([]); setTotals(null); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [all, debounced]);

  // group by product so the lots of one product sit together, oldest first
  const groups = useMemo(() => {
    const m = new Map<string, LotRow[]>();
    for (const r of rows) m.set(r.productName, [...(m.get(r.productName) || []), r]);
    return [...m.entries()];
  }, [rows]);

  const th = 'px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-right whitespace-nowrap';
  const td = 'px-3 py-2 text-xs text-right whitespace-nowrap';

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-6xl max-h-[100dvh] sm:max-h-[92dvh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="font-black text-lg text-slate-900 dark:text-white">Lot-wise stock &amp; sales</h2>
            <p className="text-xs text-slate-500">Each lot keeps its own cost and selling price. Sold units, revenue and profit come from the bills.</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white"><X size={20} /></button>
        </div>

        <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[12rem]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product or lot no."
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Include sold-out lots
          </label>
        </div>

        {totals && (
          <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
            <span><b className="text-slate-900 dark:text-white">{totals.lots}</b> lots</span>
            <span><b className="text-slate-900 dark:text-white">{totals.quantity}</b> pcs in stock</span>
            <span>Stock at cost <b className="text-slate-900 dark:text-white">{rupee(totals.stockValueAtCost)}</b></span>
            <span>Stock at selling price <b className="text-slate-900 dark:text-white">{rupee(totals.stockValueAtPrice)}</b></span>
            <span>Lot-priced sales <b className="text-slate-900 dark:text-white">{rupee(totals.revenue)}</b> · profit <b className="text-emerald-600 dark:text-emerald-400">{rupee(totals.profit)}</b></span>
          </div>
        )}

        <div className="overflow-auto flex-1">
          {loading ? (
            <div className="py-16 flex justify-center text-slate-500"><Loader2 className="animate-spin" /></div>
          ) : rows.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-500">No lots yet. Lots are created from Purchases, a lot number on Add Product, or &quot;New lot / Stock in&quot;.</p>
          ) : (
            <table className="w-full min-w-[860px] text-left">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/80">
                <tr>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Product / Lot</th>
                  <th className={th}>Left</th><th className={th}>Cost</th><th className={th}>Price</th><th className={th}>Expiry</th>
                  <th className={th}>Sold</th><th className={th}>Revenue</th><th className={th}>Profit</th>
                </tr>
              </thead>
              <tbody>
                {groups.map(([name, lots]) => (
                  <FragmentRows key={name} name={name} lots={lots} td={td} />
                ))}
              </tbody>
            </table>
          )}
          {truncated && <p className="p-3 text-center text-xs text-amber-600">Showing the first 1000 lots — narrow the search to see the rest.</p>}
        </div>
      </div>
    </div>
  );
}

function FragmentRows({ name, lots, td }: { name: string; lots: LotRow[]; td: string }) {
  return (
    <>
      <tr className="bg-slate-50/60 dark:bg-slate-800/40">
        <td colSpan={8} className="px-3 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-100">{name}</td>
      </tr>
      {lots.map((l, i) => (
        <tr key={l.id} className="border-b border-slate-100 dark:border-slate-800">
          <td className="px-3 py-2 text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
            <span className="font-semibold">{lotLabel({ id: l.id, batchNumber: l.batchNumber })}</span>
            {l.variantKey ? <span className="text-slate-400"> · {variantLabel(l.variantKey)}</span> : null}
            {i === 0 && l.quantity > 0 && lots.filter((x) => x.quantity > 0).length > 1 && (
              <span className="ml-2 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-900 dark:bg-white text-white dark:text-slate-900">old · sell first</span>
            )}
          </td>
          <td className={`${td} font-bold ${l.quantity > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>{l.quantity}{l.initialQuantity ? <span className="text-slate-400 font-normal"> / {l.initialQuantity}</span> : null}</td>
          <td className={`${td} text-slate-600 dark:text-slate-400`}>{l.costPrice ? rupee(l.costPrice) : '—'}</td>
          <td className={`${td} text-emerald-700 dark:text-emerald-400`}>{l.sellingPrice ? rupee(l.sellingPrice) : '—'}</td>
          <td className={`${td} text-slate-600 dark:text-slate-400`}>{l.expiryDate ? new Date(l.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '—'}</td>
          <td className={`${td} text-slate-700 dark:text-slate-300`}>{l.sold || '—'}</td>
          <td className={`${td} text-slate-700 dark:text-slate-300`} title={l.sold && l.pricedQty < l.sold ? `${l.pricedQty} of ${l.sold} sold units have a recorded lot price` : undefined}>{l.pricedQty ? rupee(l.revenue) : '—'}</td>
          <td className={`${td} ${l.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{l.pricedQty ? rupee(l.profit) : '—'}</td>
        </tr>
      ))}
    </>
  );
}
