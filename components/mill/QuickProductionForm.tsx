'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useTranslations } from 'next-intl';
import { CheckCircle2, ChevronDown, FileText, Loader2, Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { useBusinessStore } from '@/lib/businessStore';
import ModalPortal from '@/components/mill/ModalPortal';
import { downloadProductionSlip } from '@/lib/productionSlipClient';
import { QUICK_SOURCES, type QuickSource, lossToBalance, packsToKg, quickBalance, unitToKg, yieldPct } from '@/lib/quickEntry';

/**
 * Quick Production Entry — the one-screen alternative to batch -> start -> stages -> finalize, for small and medium mills.
 * Fill: what went in, what came out (ready product / by-product / WIP / rejected), what was wasted. Save books everything in one go
 * (POST /mill/production-entry); the server re-checks the balance and every stock rule, this form only makes it fast to fill.
 */

type OutKind = 'finished_good' | 'by_product' | 'wip' | 'rejection';
type OutRow = { key: number; kind: OutKind; productId: string; name: string; qty: string; unit: string; bagMode: boolean; packs: string; packKg: string; reason: string };
type Product = { id: string; name: string; millCategory?: string | null; baseUnit?: string | null };

const KINDS: OutKind[] = ['finished_good', 'by_product', 'wip', 'rejection'];
const KIND_TONE: Record<OutKind, string> = {
  finished_good: 'border-emerald-300 dark:border-emerald-500/40 bg-emerald-50/60 dark:bg-emerald-500/5',
  by_product: 'border-blue-300 dark:border-blue-500/40 bg-blue-50/60 dark:bg-blue-500/5',
  wip: 'border-amber-300 dark:border-amber-500/40 bg-amber-50/60 dark:bg-amber-500/5',
  rejection: 'border-rose-300 dark:border-rose-500/40 bg-rose-50/60 dark:bg-rose-500/5',
};
const KIND_HEAD: Record<OutKind, string> = {
  finished_good: 'text-emerald-700 dark:text-emerald-400', by_product: 'text-blue-700 dark:text-blue-400',
  wip: 'text-amber-700 dark:text-amber-400', rejection: 'text-rose-700 dark:text-rose-400',
};
const KIND_CATEGORY: Record<OutKind, string | null> = { finished_good: 'finished_goods', by_product: 'by_product', wip: null, rejection: 'waste' };
const UNITS = ['kg', 'quintal', 'ton', 'g'];

const fetcher = (u: string) => api.get(u).then((r) => r.data);
const num = (v: string) => (v === '' ? 0 : Number(v) || 0);
const fmt = (n: number) => (Math.round(n * 1000) / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const newKey = (() => { let k = 0; return () => ++k; })();
const newRow = (kind: OutKind, over: Partial<OutRow> = {}): OutRow => ({ key: newKey(), kind, productId: '', name: '', qty: '', unit: 'kg', bagMode: false, packs: '', packKg: '', reason: '', ...over });

const inputCls = 'w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-sm focus:ring-2 focus:ring-emerald-500 outline-none';
const labelCls = 'block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1';

// What the user filled last time for the same kind of material: the product rows come back (empty weights), so a repeat run is just the numbers.
const recipeKey = (shop: string | null, k: string) => `ks_quick_recipe:${shop || ''}:${k}`;
function loadRecipe(shop: string | null, k: string): Array<{ kind: OutKind; productId: string; name: string }> {
  try { const v = JSON.parse(localStorage.getItem(recipeKey(shop, k)) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function saveRecipe(shop: string | null, k: string, rows: OutRow[]) {
  try {
    localStorage.setItem(recipeKey(shop, k), JSON.stringify(rows.map((r) => ({ kind: r.kind, productId: r.productId, name: r.name }))));
  } catch { /* private mode: ignore */ }
}

export default function QuickProductionForm({ onClose, onSaved, initialSource }: { onClose: () => void; onSaved?: () => void; initialSource?: { type: QuickSource; id?: string } }) {
  const t = useTranslations('Mill');
  const activeShopId = useBusinessStore((s) => s.activeShopId);
  const { mutate: globalMutate } = useSWRConfig();
  const idemKey = useRef<string>(typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `qp-${Date.now()}-${Math.random()}`);

  const { data: lots = [] } = useSWR<any[]>(activeShopId ? ['/mill/raw-lots?status=available', activeShopId] : null, ([u]) => fetcher(u));
  const { data: jwOrders = [] } = useSWR<any[]>(activeShopId ? ['/mill/job-work', activeShopId] : null, ([u]) => fetcher(u));
  const { data: wipData } = useSWR<any>(activeShopId ? ['/mill/wip?limit=100', activeShopId] : null, ([u]) => fetcher(u));
  const { data: rjData } = useSWR<any>(activeShopId ? ['/mill/rejections?limit=100', activeShopId] : null, ([u]) => fetcher(u));
  const { data: productsData, mutate: mutateProducts } = useSWR<Product[]>(activeShopId ? ['/products', activeShopId] : null, ([u]) => fetcher(u));
  const { data: machinesData } = useSWR<any[]>(activeShopId ? ['/mill/machines', activeShopId] : null, ([u]) => fetcher(u));
  const products: Product[] = Array.isArray(productsData) ? productsData : [];
  const machines: any[] = Array.isArray(machinesData) ? machinesData : [];

  // ---- the four places the input can come from, each as { id, label, kg (what is left), productId, recipeKey } ----
  const options = useMemo(() => {
    const raw = lots.filter((l) => (l.availableKg ?? l.remainingQuantity ?? 0) > 0).map((l) => ({
      id: l.id as string, kg: Number(l.availableKg ?? l.remainingQuantity ?? 0), productId: (l.productId || '') as string,
      label: `${l.product?.name || '—'} · ${l.lotNumber || l.id.slice(0, 6)}${l.farmerName ? ' · ' + l.farmerName : ''}`, recipe: `p:${l.productId || ''}`,
    }));
    const jw = jwOrders.filter((j) => j.status === 'received' || j.status === 'processing').map((j) => ({
      id: j.id as string, kg: Number(j.inputWeightKg || 0), productId: '',
      label: `${j.orderNumber} · ${j.customer?.name || ''} · ${j.materialDescription}`, recipe: `jw:${String(j.materialDescription || '').toLowerCase()}`,
    }));
    const usable = (s: string) => !['BLOCKED', 'FULLY_CONSUMED', 'DISPOSED', 'FULLY_REPROCESSED'].includes(String(s));
    const wip = (wipData?.items || []).filter((w: any) => usable(w.status) && Number(w.availableQuantity) > 0).map((w: any) => ({
      id: w.id as string, kg: Number(unitToKg(Number(w.availableQuantity), w.unit) ?? w.availableQuantity), productId: (w.productId || '') as string,
      label: `${w.lotNumber} · ${w.product?.name || ''}`, recipe: `p:${w.productId || ''}`,
    }));
    const rj = (rjData?.items || []).filter((r: any) => usable(r.status) && Number(r.availableQuantity) > 0).map((r: any) => ({
      id: r.id as string, kg: Number(r.availableQuantity), productId: (r.productId || '') as string,
      label: `${r.lotNumber} · ${r.product?.name || ''}`, recipe: `p:${r.productId || ''}`,
    }));
    return { raw_lot: raw, job_work: jw, wip, rejection: rj } as Record<QuickSource, Array<{ id: string; kg: number; productId: string; label: string; recipe: string }>>;
  }, [lots, jwOrders, wipData, rjData]);

  const [source, setSource] = useState<QuickSource>(initialSource?.type ?? 'raw_lot');
  const [sourceId, setSourceId] = useState('');
  const [inputQty, setInputQty] = useState('');
  const [inputUnit, setInputUnit] = useState('kg');
  const [rows, setRows] = useState<OutRow[]>([newRow('finished_good'), newRow('by_product')]);
  const [lossKg, setLossKg] = useState('');
  const [lossTouched, setLossTouched] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [operatorName, setOperatorName] = useState('');
  const [machineId, setMachineId] = useState('');
  const [when, setWhen] = useState(() => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); });
  const [notes, setNotes] = useState('');
  const [newFor, setNewFor] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<null | { batchId: string; batchNumber: string; finishedKg: number; yieldPct: number | null }>(null);
  const [slipBusy, setSlipBusy] = useState(false);
  const profile = useBusinessStore((s) => s.profile);

  const list = options[source];
  const picked = list.find((o) => o.id === sourceId) || null;

  const rowKg = (r: OutRow) => (r.bagMode ? packsToKg(r.packs, r.packKg) : unitToKg(num(r.qty), r.unit) ?? 0);
  const outputsKg = rows.reduce((s, r) => s + rowKg(r), 0);
  const inputKg = unitToKg(num(inputQty), inputUnit) ?? 0;
  const loss = num(lossKg);
  const bal = quickBalance(inputKg, outputsKg, loss);
  const finishedKg = rows.filter((r) => r.kind === 'finished_good').reduce((s, r) => s + rowKg(r), 0);

  const pickSource = (type: QuickSource, id: string) => {
    setSource(type); setSourceId(id); setError('');
    const o = options[type].find((x) => x.id === id);
    if (o) {
      setInputQty(String(Math.round(o.kg * 1000) / 1000)); setInputUnit('kg');
      // repeat of a known material -> the product rows come back
      const recipe = loadRecipe(activeShopId, o.recipe);
      if (recipe.length) {
        setRows(recipe.map((r) => newRow(r.kind, { productId: r.productId, name: r.name })));
      } else if (o.productId && (type === 'wip' || type === 'rejection')) {
        setRows([newRow('finished_good'), newRow('by_product')]);
      }
    } else setInputQty('');
    setLossTouched(false);
  };

  // Opened from a lot / order / WIP / rejected row: that source is already chosen (once its data has loaded).
  const appliedInitial = useRef(false);
  useEffect(() => {
    if (!initialSource?.id || appliedInitial.current) return;
    if (options[initialSource.type].some((o) => o.id === initialSource.id)) {
      appliedInitial.current = true;
      pickSource(initialSource.type, initialSource.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  const setRow = (key: number, patch: Partial<OutRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = (kind: OutKind) => setRows((rs) => [...rs, newRow(kind)]);

  const productsFor = (kind: OutKind) => {
    const cat = KIND_CATEGORY[kind];
    const filtered = cat ? products.filter((p) => p.millCategory === cat) : products;
    return filtered.length ? filtered : products;
  };

  const createProduct = async (row: OutRow) => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true); setError('');
    try {
      const millCategory = KIND_CATEGORY[row.kind] || 'finished_goods';
      const categoryName = millCategory === 'by_product' ? 'By-Products' : millCategory === 'waste' ? 'Waste / Rejection' : 'Finished Goods';
      const res = await api.post('/products', { name, category: categoryName, millCategory, baseUnit: 'kg', currentStock: 0, sellingPrice: 0 });
      setRow(row.key, { productId: res.data.id, name });
      products.push({ id: res.data.id, name, millCategory, baseUnit: 'kg' });
      mutateProducts();
      setNewFor(null); setNewName('');
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || t('qp_failed'));
    } finally { setCreating(false); }
  };

  const filled = rows.filter((r) => rowKg(r) > 0);
  const validation = (): string => {
    if (!sourceId) return t('qp_errSource');
    if (!(inputKg > 0)) return t('qp_errQty');
    if (!filled.length) return t('qp_errOutputs');
    if (filled.some((r) => (r.kind === 'finished_good' || r.kind === 'wip') && !r.productId)) return t('qp_errProduct');
    if (!bal.balanced) return t('qp_errBalance');
    return '';
  };
  const blocked = validation();

  const save = async () => {
    const v = validation();
    if (v) { setError(v); return; }
    setSaving(true); setError('');
    try {
      const outputs = filled.map((r) => {
        const kg = rowKg(r);
        return {
          outputType: r.kind,
          productId: r.productId || null,
          name: r.name || products.find((p) => p.id === r.productId)?.name || '',
          quantity: r.bagMode ? kg : num(r.qty),
          unit: r.bagMode ? 'kg' : r.unit,
          notes: [r.bagMode ? `${r.packs} × ${r.packKg} kg` : '', r.reason].filter(Boolean).join(' · ') || null,
        };
      });
      const res = await api.post('/mill/production-entry', {
        source: { type: source, id: sourceId },
        inputQuantity: num(inputQty), unit: inputUnit,
        outputs, lossKg: loss,
        operatorName: operatorName.trim() || undefined,
        machineId: machineId || undefined,
        startedAt: when ? new Date(when).toISOString() : undefined,
        notes: notes.trim() || undefined,
      }, { headers: { 'x-idempotency-key': idemKey.current } });
      const r = res.data;
      if (picked) saveRecipe(activeShopId, picked.recipe, filled);
      setDone({ batchId: r.batchId, batchNumber: r.batchNumber, finishedKg: r.finishedKg, yieldPct: r.yieldPct ?? yieldPct(r.finishedKg, inputKg) });
      // every list the run touches
      globalMutate((key: any) => Array.isArray(key) && typeof key[0] === 'string' && (key[0].startsWith('/mill/') || key[0].startsWith('/products')), undefined, { revalidate: true });
      onSaved?.();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || t('qp_failed'));
    } finally { setSaving(false); }
  };

  const reset = () => {
    idemKey.current = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `qp-${Date.now()}-${Math.random()}`;
    setDone(null); setSourceId(''); setInputQty(''); setRows([newRow('finished_good'), newRow('by_product')]); setLossKg(''); setLossTouched(false); setNotes(''); setError('');
  };

  const balanceTone = bal.state === 'balanced' ? 'text-emerald-600' : bal.state === 'over' ? 'text-red-500' : 'text-amber-600';

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:p-4" data-testid="quick-production">
        <div className="bg-white dark:bg-slate-900 w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[96dvh] sm:max-h-[92vh] flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">{t('qp_title')}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{t('qp_subtitle')}</p>
            </div>
            <button onClick={onClose} aria-label={t('qp_close')}><X size={20} className="text-slate-400" /></button>
          </div>

          {done ? (
            <div className="p-8 text-center space-y-4 overflow-y-auto">
              <CheckCircle2 size={48} className="mx-auto text-emerald-500" />
              <h3 className="text-lg font-black text-slate-900 dark:text-white">{t('qp_saved')}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">{t('qp_savedLine', { batch: done.batchNumber, finished: fmt(done.finishedKg), pct: done.yieldPct ?? '—' })}</p>
              <div className="flex gap-2 justify-center pt-2 flex-wrap">
                <button disabled={slipBusy} data-testid="qp-slip"
                  onClick={async () => {
                    setSlipBusy(true);
                    try { await downloadProductionSlip(done.batchId, { name: profile.shopName || 'Vyapar Sarthi', address: profile.address || null, mobile: profile.mobile || null, gst: profile.gst || null, pan: profile.pan || null }); }
                    catch { toast.error(t('qp_slipFailed')); } finally { setSlipBusy(false); }
                  }}
                  className="h-10 px-5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-bold flex items-center gap-1.5 disabled:opacity-50">
                  {slipBusy ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} {t('qp_slip')}
                </button>
                <button onClick={reset} className="h-10 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold">{t('qp_another')}</button>
                <button onClick={onClose} className="h-10 px-5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-bold">{t('qp_close')}</button>
              </div>
            </div>
          ) : (
            <>
              <div className="p-5 space-y-5 overflow-y-auto">
                {/* 1. what went in */}
                <section className="space-y-2.5">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">{t('qp_stepIn')}</h3>
                  <div className="grid grid-cols-2 gap-1.5">
                    {QUICK_SOURCES.map((s) => (
                      <button key={s} type="button" onClick={() => { setSource(s); setSourceId(''); setInputQty(''); }}
                        className={cn('h-10 px-2 rounded-lg border-2 text-xs font-bold transition-colors',
                          source === s ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300')}>
                        {t(`qp_src_${s}`)} <span className="opacity-60">({options[s].length})</span>
                      </button>
                    ))}
                  </div>
                  {list.length === 0 ? (
                    <p className="text-xs text-slate-400 py-2">{t('qp_noSource')}</p>
                  ) : (
                    <select value={sourceId} onChange={(e) => pickSource(source, e.target.value)} className={inputCls}>
                      <option value="">{t('qp_pickSource')}</option>
                      {list.map((o) => <option key={o.id} value={o.id}>{o.label} — {fmt(o.kg)} kg</option>)}
                    </select>
                  )}
                  {picked && (
                    <div className="grid grid-cols-3 gap-2 items-end">
                      <label className="col-span-2 block">
                        <span className={labelCls}>{t('qp_qtyUsed')} <span className="normal-case font-medium text-slate-400">· {t('qp_available', { qty: fmt(picked.kg) })}</span></span>
                        <input type="number" inputMode="decimal" min="0" value={inputQty} onChange={(e) => setInputQty(e.target.value)} className={inputCls} />
                      </label>
                      <select value={inputUnit} onChange={(e) => setInputUnit(e.target.value)} className={inputCls}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
                    </div>
                  )}
                </section>

                {/* 2. what came out */}
                <section className="space-y-3">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">{t('qp_stepOut')}</h3>
                  {KINDS.map((kind) => {
                    const mine = rows.filter((r) => r.kind === kind);
                    return (
                      <div key={kind} className={cn('rounded-xl border p-3 space-y-2', KIND_TONE[kind])}>
                        <div className="flex items-center justify-between">
                          <span className={cn('text-xs font-black uppercase tracking-wide', KIND_HEAD[kind])}>{t(`qp_out_${kind === 'finished_good' ? 'finished' : kind}`)}</span>
                          <button type="button" onClick={() => addRow(kind)} className={cn('text-[11px] font-bold flex items-center gap-1', KIND_HEAD[kind])}><Plus size={12} />{t('qp_addRow').replace('+ ', '')}</button>
                        </div>
                        {mine.length === 0 && <p className="text-[11px] text-slate-400">—</p>}
                        {mine.map((r) => (
                          <div key={r.key} className="rounded-lg bg-white/80 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 p-2.5 space-y-2">
                            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-end">
                              <label className="block sm:col-span-3">
                                <span className={labelCls}>{t('qp_product')}</span>
                                <select value={newFor === r.key ? '__new__' : r.productId}
                                  onChange={(e) => {
                                    if (e.target.value === '__new__') { setNewFor(r.key); setNewName(r.name); }
                                    else { setNewFor(null); const p = products.find((x) => x.id === e.target.value); setRow(r.key, { productId: e.target.value, name: p?.name || '' }); }
                                  }}
                                  className={cn(inputCls, !r.productId && (kind === 'finished_good' || kind === 'wip') && 'border-amber-400')}>
                                  <option value="">{kind === 'by_product' || kind === 'rejection' ? t('qp_notTracked') : t('qp_selectProduct')}</option>
                                  {productsFor(kind).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                  <option value="__new__">{t('qp_newProduct')}</option>
                                </select>
                              </label>
                              <div className="sm:col-span-2 flex items-end gap-1.5">
                                {r.bagMode ? (
                                  <>
                                    <label className="block flex-1 min-w-0"><span className={labelCls}>{t('qp_bags')}</span>
                                      <input type="number" inputMode="numeric" min="0" value={r.packs} onChange={(e) => setRow(r.key, { packs: e.target.value })} className={inputCls} /></label>
                                    <label className="block flex-1 min-w-0"><span className={labelCls}>{t('qp_perBag')}</span>
                                      <input type="number" inputMode="decimal" min="0" value={r.packKg} onChange={(e) => setRow(r.key, { packKg: e.target.value })} className={inputCls} /></label>
                                  </>
                                ) : (
                                  <>
                                    <label className="block flex-1 min-w-0"><span className={labelCls}>{t('qp_qty')}</span>
                                      <input type="number" inputMode="decimal" min="0" value={r.qty} onChange={(e) => setRow(r.key, { qty: e.target.value })} className={inputCls} /></label>
                                    <select value={r.unit} onChange={(e) => setRow(r.key, { unit: e.target.value })} className={cn(inputCls, 'w-[4.6rem] px-1.5')}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
                                  </>
                                )}
                              </div>
                            </div>
                            {newFor === r.key && (
                              <div className="flex flex-wrap items-end gap-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg p-2">
                                <label className="block flex-1 min-w-[10rem]"><span className={labelCls}>{t('qp_newProductName')}</span>
                                  <input value={newName} onChange={(e) => setNewName(e.target.value)} className={inputCls} autoFocus
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createProduct(r); } }} /></label>
                                <button type="button" onClick={() => createProduct(r)} disabled={creating || !newName.trim()} className="h-10 px-4 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold disabled:opacity-50">
                                  {creating ? <Loader2 size={14} className="animate-spin" /> : t('qp_create')}</button>
                              </div>
                            )}
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              {kind === 'finished_good' ? (
                                <button type="button" onClick={() => setRow(r.key, { bagMode: !r.bagMode })} className="text-[11px] font-bold text-slate-500 underline underline-offset-2">
                                  {r.bagMode ? t('qp_useWeight') : t('qp_useBags')}
                                </button>
                              ) : kind === 'rejection' ? (
                                <input value={r.reason} onChange={(e) => setRow(r.key, { reason: e.target.value })} placeholder={t('qp_reason')} className={cn(inputCls, 'h-8 text-xs flex-1 min-w-[8rem]')} />
                              ) : <span />}
                              <div className="flex items-center gap-3">
                                {rowKg(r) > 0 && <span className="text-[11px] font-mono text-slate-500">= {fmt(rowKg(r))} kg</span>}
                                {mine.length > 1 || r.productId || r.qty || r.packs ? (
                                  <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="text-[11px] font-semibold text-red-500">{t('qp_remove')}</button>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </section>

                {/* 3. waste + live balance */}
                <section className="space-y-2.5">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">{t('qp_stepLoss')}</h3>
                  <div className="grid grid-cols-3 gap-2 items-end">
                    <label className="col-span-2 block"><span className={labelCls}>kg</span>
                      <input type="number" inputMode="decimal" min="0" value={lossKg} onChange={(e) => { setLossKg(e.target.value); setLossTouched(true); }} className={inputCls} /></label>
                    <button type="button" onClick={() => { setLossKg(String(lossToBalance(inputKg, outputsKg))); setLossTouched(true); }} disabled={!(inputKg > 0)}
                      className="h-10 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold disabled:opacity-40">{t('qp_restIsWaste')}</button>
                  </div>
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-xs leading-relaxed" data-testid="qp-balance">
                    <span className="text-slate-600 dark:text-slate-300">{t('qp_balIn')} <b>{fmt(bal.inputKg)}</b></span>{' = '}
                    <span className="text-slate-600 dark:text-slate-300">{t('qp_balOut')} <b>{fmt(bal.outputsKg)}</b></span>{' + '}
                    <span className="text-slate-600 dark:text-slate-300">{t('qp_balLoss')} <b>{fmt(bal.lossKg)}</b></span>
                    <span className={cn('ml-2 font-black', balanceTone)}>
                      {bal.state === 'balanced' ? t('qp_balOk') : bal.state === 'unaccounted' ? t('qp_balLeft', { qty: fmt(bal.remainingKg) }) : bal.state === 'over' ? t('qp_balOver', { qty: fmt(Math.abs(bal.remainingKg)) }) : ''}
                    </span>
                    {inputKg > 0 && finishedKg > 0 && <span className="ml-2 text-slate-400">· {t('qp_yield')} {yieldPct(finishedKg, inputKg)}%</span>}
                  </div>
                </section>

                {/* optional details */}
                <section>
                  <button type="button" onClick={() => setShowMore((v) => !v)} className="flex items-center gap-1 text-xs font-bold text-slate-500">
                    <ChevronDown size={14} className={cn('transition-transform', showMore && 'rotate-180')} /> {t('qp_more')}
                  </button>
                  {showMore && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                      <label className="block"><span className={labelCls}>{t('qp_operator')}</span>
                        <input value={operatorName} onChange={(e) => setOperatorName(e.target.value)} className={inputCls} maxLength={80} /></label>
                      <label className="block"><span className={labelCls}>{t('qp_machine')}</span>
                        <select value={machineId} onChange={(e) => setMachineId(e.target.value)} className={inputCls}>
                          <option value="">{t('qp_noMachine')}</option>
                          {machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select></label>
                      <label className="block"><span className={labelCls}>{t('qp_when')}</span>
                        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={inputCls} /></label>
                      <label className="block"><span className={labelCls}>{t('qp_notes')}</span>
                        <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} maxLength={200} /></label>
                    </div>
                  )}
                </section>
              </div>

              <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                {error && <p className="text-sm text-red-500" role="alert" data-testid="qp-error">{error}</p>}
                <div className="flex gap-2">
                  <button type="button" onClick={onClose} className="h-11 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-bold">{t('qp_cancel')}</button>
                  <button type="button" onClick={save} disabled={saving || !!blocked}
                    className="flex-1 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-black flex items-center justify-center gap-2" data-testid="qp-save">
                    {saving ? <><Loader2 size={16} className="animate-spin" /> {t('qp_saving')}</> : <><CheckCircle2 size={16} /> {t('qp_save')}</>}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}
