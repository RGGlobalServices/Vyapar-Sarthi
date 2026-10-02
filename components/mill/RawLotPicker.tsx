'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export type PickableLot = { id: string; lotNumber: string | null; farmerName: string | null; productId?: string | null; product?: { name: string } | null; availableKg?: number | null; remainingQuantity?: number | null };

const fmt = (n: number) => (Math.round(n * 1000) / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const avail = (l: PickableLot) => Number(l.availableKg ?? l.remainingQuantity ?? 0);

/**
 * Pick the raw material for a run: one material, then ONE OR MORE of its lots, each with its own weight (default: all that is left in
 * it). Lots of different materials cannot be mixed in one run, so choosing another material starts a fresh selection.
 */
export default function RawLotPicker({
  lots,
  selected,
  onChange,
  inputCls,
  labelCls,
}: {
  lots: PickableLot[];
  selected: Record<string, string>;
  onChange: (sel: Record<string, string>) => void;
  inputCls: string;
  labelCls: string;
}) {
  const t = useTranslations('Mill');
  const usable = useMemo(() => lots.filter((l) => avail(l) > 0), [lots]);

  const products = useMemo(() => {
    const m = new Map<string, { id: string; name: string; kg: number; n: number }>();
    for (const l of usable) {
      const id = l.productId || '';
      const cur = m.get(id) || { id, name: l.product?.name || '—', kg: 0, n: 0 };
      cur.kg += avail(l); cur.n += 1;
      m.set(id, cur);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [usable]);

  // the material of the current selection, else the first one
  const selectedIds = Object.keys(selected);
  const selProduct = selectedIds.length ? (usable.find((l) => l.id === selectedIds[0])?.productId || '') : null;
  const [productId, setProductId] = useState<string>('');
  useEffect(() => {
    if (selProduct !== null) setProductId(selProduct);
    else if (!productId && products.length) setProductId(products[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selProduct, products.length]);

  const shown = usable.filter((l) => (l.productId || '') === productId);
  const total = selectedIds.reduce((s, id) => s + (Number(selected[id]) || 0), 0);

  const toggle = (l: PickableLot) => {
    const next = { ...selected };
    if (next[l.id] !== undefined) delete next[l.id];
    else next[l.id] = String(Math.round(avail(l) * 1000) / 1000);
    onChange(next);
  };
  const setKg = (l: PickableLot, v: string) => onChange({ ...selected, [l.id]: v });

  if (usable.length === 0) return <p className="text-xs text-slate-400 py-2">{t('qp_noSource')}</p>;

  return (
    <div className="space-y-2.5">
      {products.length > 1 && (
        <label className="block">
          <span className={labelCls}>{t('qp_rawProduct')}</span>
          <select value={productId} onChange={(e) => { setProductId(e.target.value); onChange({}); }} className={inputCls}>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} — {fmt(p.kg)} kg · {p.n} {t('qp_lotsWord')}</option>)}
          </select>
        </label>
      )}
      <div>
        <span className={labelCls}>{t('qp_lotsTick')}</span>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          {shown.map((l) => {
            const on = selected[l.id] !== undefined;
            const max = avail(l);
            const over = on && Number(selected[l.id]) > max + 0.0005;
            return (
              <div key={l.id} className={cn('p-2.5 flex items-center gap-2.5 flex-wrap', on ? 'bg-emerald-50/70 dark:bg-emerald-500/5' : 'bg-white dark:bg-slate-950')}>
                <label className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer">
                  <input type="checkbox" checked={on} onChange={() => toggle(l)} className="h-4 w-4 rounded text-emerald-600" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{l.lotNumber || l.id.slice(0, 6)}{l.farmerName ? ` · ${l.farmerName}` : ''}</span>
                    <span className="block text-[11px] text-slate-400">{t('qp_available', { qty: fmt(max) })}</span>
                  </span>
                </label>
                {on && (
                  <div className="flex items-center gap-1.5">
                    <input type="number" inputMode="decimal" min="0" max={max} value={selected[l.id]} onChange={(e) => setKg(l, e.target.value)}
                      className={cn(inputCls, 'w-28 h-9', over && 'border-red-400')} aria-label="kg" />
                    <span className="text-xs text-slate-400">kg</span>
                    <button type="button" onClick={() => setKg(l, String(Math.round(max * 1000) / 1000))} className="text-[11px] font-bold text-emerald-600">{t('qp_max')}</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {selectedIds.length > 0 && (
        <p className="text-xs font-bold text-slate-600 dark:text-slate-300">{t('qp_totalUsed')}: <span className="font-mono text-slate-900 dark:text-white">{fmt(total)} kg</span> <span className="font-normal text-slate-400">· {selectedIds.length} {t('qp_lotsWord')}</span></p>
      )}
    </div>
  );
}
