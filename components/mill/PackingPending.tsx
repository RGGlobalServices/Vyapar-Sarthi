'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useTranslations } from 'next-intl';
import { Loader2, PackageCheck, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import ModalPortal from '@/components/mill/ModalPortal';
import DeleteButton from '@/components/mill/DeleteButton';
import { cn } from '@/lib/utils';

/**
 * Milling -> Not packed. The ready products of finished production runs that were saved without packing (or only partly packed).
 * "Add packing" records how they were packed — bags or gonis, how many and of how many kg — on the product's lot; the weight can never
 * exceed what was produced. Stock stays in kg.
 */

type Line = { id: string; packKg: number; packs: number; packType: string };
type Item = { outputId: string; batchNumber: string; date: string | null; name: string; kg: number; packedKg: number; unpackedKg: number; lotNumber: string | null; lines: Line[] };
type Row = { kg: string; n: string; type: 'bag' | 'goni' | 'other' };

const fetcher = (u: string) => api.get(u).then((r) => r.data);
const fmt = (n: number) => (Math.round(n * 1000) / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');
const num = (v: string) => (v === '' ? 0 : Number(v) || 0);
const inputCls = 'w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-sm focus:ring-2 focus:ring-emerald-500 outline-none';

export function usePendingPackingCount() {
  const shopId = useBusinessStore((s) => s.activeShopId);
  const { data } = useSWR<any>(shopId ? ['/mill/packing', shopId] : null, ([u]) => fetcher(u), { revalidateOnFocus: false });
  return data?.enabled ? (data.pending?.length ?? 0) : 0;
}

const lineText = (l: { packKg: number; packs: number; packType: string }, t: (k: string) => string) =>
  `${l.packs} × ${fmt(l.packKg)} kg ${l.packType === 'goni' ? t('pk_goni') : l.packType === 'other' ? t('pk_other') : t('pk_bag')}`;

export default function PackingPending() {
  const t = useTranslations('Mill');
  const shopId = useBusinessStore((s) => s.activeShopId);
  const { mutate } = useSWRConfig();
  const [packing, setPacking] = useState<Item | null>(null);
  const { data, mutate: reload, isLoading } = useSWR<any>(shopId ? ['/mill/packing', shopId] : null, ([u]) => fetcher(u), { revalidateOnFocus: true });
  const pending: Item[] = data?.pending || [];
  const packed: Item[] = data?.packed || [];

  const refresh = () => { reload(); mutate((key: any) => Array.isArray(key) && typeof key[0] === 'string' && key[0].startsWith('/mill/finished-goods'), undefined, { revalidate: true }); };

  if (isLoading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;
  if (data && data.enabled === false) return <p className="text-sm text-slate-500 p-6 text-center">{t('pk_off')}</p>;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xs font-black uppercase tracking-wider text-slate-500">{t('pk_tabTitle')}</h2>
        <p className="text-xs text-slate-500 mt-1">{t('pk_intro')}</p>
      </div>

      {pending.length === 0 ? (
        <p className="text-sm text-slate-400 py-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">{t('pk_none')}</p>
      ) : (
        <div className="grid gap-2" data-testid="not-packed-list">
          {pending.map((it) => (
            <div key={it.outputId} className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-white dark:bg-slate-900 p-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="font-bold text-sm text-slate-900 dark:text-white">{it.name}</p>
                <p className="text-xs text-slate-500">
                  <span className="font-mono">{it.batchNumber}</span> · {fmtDate(it.date)}{it.lotNumber ? ` · ${t('pk_lot', { lot: it.lotNumber })}` : ''}
                </p>
                {it.lines.length > 0 && <p className="text-[11px] text-slate-500 mt-0.5">{it.lines.map((l) => lineText(l, t)).join(' + ')}</p>}
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-black font-mono text-amber-600">{fmt(it.unpackedKg)} kg</p>
                  <p className="text-[10px] text-slate-400">{it.packedKg > 0 ? `${fmt(it.packedKg)} / ${fmt(it.kg)} kg` : `${fmt(it.kg)} kg`}</p>
                </div>
                <button onClick={() => setPacking(it)} className="h-9 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5">
                  <PackageCheck size={14} /> {t('pk_pack')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {packed.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">{t('pk_recent')}</h3>
          <div className="grid gap-2">
            {packed.map((it) => (
              <div key={it.outputId} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{it.name} <span className="font-mono text-xs text-slate-400">{it.batchNumber}</span></p>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {it.lines.map((l) => (
                    <span key={l.id} className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                      {lineText(l, t)}
                      <DeleteButton url={`/mill/packing/${l.id}`} name={lineText(l, t)} onDone={refresh} className="h-5 w-5 inline-flex items-center justify-center rounded text-rose-500 hover:bg-rose-100" />
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {packing && <PackModal item={packing} onClose={() => setPacking(null)} onSaved={() => { setPacking(null); refresh(); }} />}
    </div>
  );
}

function PackModal({ item, onClose, onSaved }: { item: Item; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations('Mill');
  const [rows, setRows] = useState<Row[]>([{ kg: '', n: '', type: 'bag' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const total = rows.reduce((s, r) => s + num(r.kg) * Math.round(num(r.n)), 0);
  const left = Math.max(0, item.unpackedKg - total);
  const valid = rows.some((r) => num(r.kg) > 0 && num(r.n) > 0) && total <= item.unpackedKg + 0.005;

  const save = async () => {
    setSaving(true); setError('');
    try {
      await api.post('/mill/packing', { outputId: item.outputId, lines: rows.filter((r) => num(r.kg) > 0 && num(r.n) > 0).map((r) => ({ packKg: num(r.kg), packs: Math.round(num(r.n)), packType: r.type })) });
      toast.success(t('pk_saved'));
      onSaved();
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.response?.data?.error || e?.message || t('pe_failed'));
    } finally { setSaving(false); }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl p-5 space-y-3 max-h-[92vh] overflow-y-auto">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">{t('pk_packTitle', { name: item.name })}</h2>
              <p className="text-xs text-slate-500">{t('pk_run', { batch: item.batchNumber })} · {t('pk_left', { left: fmt(item.unpackedKg), kg: fmt(item.kg) })}</p>
            </div>
            <button onClick={onClose} aria-label={t('pe_cancel')}><X size={20} className="text-slate-400" /></button>
          </div>

          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[5.2rem_1fr_1fr_auto] gap-2 items-end">
              <select value={r.type} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, type: e.target.value as Row['type'] } : x)))} className={cn(inputCls, 'px-1.5')}>
                <option value="bag">{t('pk_bag')}</option><option value="goni">{t('pk_goni')}</option><option value="other">{t('pk_other')}</option>
              </select>
              <label className="block text-[10px] font-bold uppercase text-slate-500">{t('pk_kgEach')}
                <input type="number" inputMode="decimal" min="0" value={r.kg} autoFocus={i === 0} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, kg: e.target.value } : x)))} className={inputCls + ' mt-1'} /></label>
              <label className="block text-[10px] font-bold uppercase text-slate-500">{t('pk_count')}
                <input type="number" inputMode="numeric" min="0" value={r.n} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, n: e.target.value } : x)))} className={inputCls + ' mt-1'} /></label>
              {rows.length > 1 ? <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="h-10 px-2 text-red-500" aria-label={t('qp_remove')}><X size={14} /></button> : <span />}
            </div>
          ))}
          <button type="button" onClick={() => setRows([...rows, { kg: '', n: '', type: 'bag' }])} className="text-xs font-bold text-emerald-700 dark:text-emerald-400">+ {t('pk_add')}</button>
          <p className={cn('text-[11px] font-mono', total > item.unpackedKg + 0.005 ? 'text-red-500' : 'text-slate-500')}>{t('pk_summary', { packed: fmt(total), loose: fmt(left) })}</p>
          {total > item.unpackedKg + 0.005 && <p className="text-xs text-red-500">{t('pk_errMore')}</p>}
          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-500">{t('pe_cancel')}</button>
            <button onClick={save} disabled={saving || !valid} className="px-5 py-2 rounded-lg text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 size={14} className="animate-spin" />} {t('pk_save')}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
