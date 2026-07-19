'use client';
import { useState, useMemo, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { translateData } from '@/lib/translateData';
import SmartTranslator from '@/components/SmartTranslator';
import ExpiryDateField from '@/components/ExpiryDateField';
import SizeVariantGrid, { parseSizeVariants, serializeSizeVariants, totalFromSizes, parseSizePrices, mergeSizePricesIntoMetadata } from '@/components/SizeVariantGrid';
import type { SizePriceEntry } from '@/components/SizeVariantGrid';
import ColorSizeVariantGrid, { ColorPicker, colorsFromVariants, sizesFromVariants, isColorSizeVariants, splitVariantKey } from '@/components/ColorSizeVariantGrid';
import {
  Search, ArrowDownLeft, ArrowUpRight, AlertTriangle,
  Plus, Trash2, X, Check, Package, Archive, ArchiveRestore,
  Pencil, ShieldCheck, Trash, Loader2, Warehouse, Store, MapPin, IndianRupee,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStockStore, StockItem } from '@/lib/store';
import { useBusinessStore } from '@/lib/businessStore';
import api from '@/lib/api';
import { getBusinessConfig, getCategoryVariantSpec } from '@/lib/businessConfig';

function getStatus(item: StockItem) {
  if (item.current === 0) return 'out';
  if (item.current <= item.min) return 'low';
  return 'ok';
}

const cellInp = 'bg-slate-700 border border-slate-600 rounded px-2 py-1 text-slate-900 dark:text-slate-100 text-sm w-full focus:outline-none focus:ring-1 focus:ring-emerald-500';

export default function LegacyStockUI() {
  const t  = useTranslations('Stock');
  const tv = useTranslations('Variants');
  const locale = useLocale();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const {
    items, log, loading,
    fetchStock, addItem, updateItem, removeItem, toggleArchive, adjustStock, clearLog,
  } = useStockStore();

  const { profile, allShops, activeShopId, switchShop } = useBusinessStore();
  const bizConfig = getBusinessConfig(profile.businessType);
  const isWholesale = profile.subscriptionPlan === 'wholesale';

  const [search, setSearch]   = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    fetchStock();
  }, [fetchStock]);

  const [menuId, setMenuId]   = useState<number | string | null>(null);
  const [editModal, setEditModal] = useState<{
    item: StockItem;
    adjQty: string;
    adjType: 'in' | 'out';
    name: string;
    category: string;
    unit: string;
    min: string;
    sizes: Record<string, number>;   // per net-weight / size stock (absolute)
    hasSizes: boolean;               // product is tracked by net-weight / size variants
    submitting: boolean;
  } | null>(null);

  const [modal, setModal]     = useState<'in' | 'out' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isNew, setIsNew]     = useState(false);
  const [selId, setSelId]     = useState<number | string | ''>('');
  const [productSearch, setProductSearch] = useState('');
  const [addSizes, setAddSizes] = useState<Record<string, number>>({});  // per net-weight stock-in amounts
  const [qty, setQty]         = useState('');
  const [note, setNote]       = useState('');
  const [newForm, setNewForm] = useState({
    name: '', category: '', unit: '', min: '', mrp: '', selling: '', cost: '',
    model_number: '', warranty_months: '',
    expiry_date: '', batch_number: '', drug_schedule: 'OTC',
    gender: 'Unisex', shade: '',
    size_variants: {} as Record<string, number>,
  });
  const [pricing, setPricing] = useState({ mrp: '', selling: '', cost: '' });
  const [error, setError]     = useState('');
  const [deleteTarget, setDeleteTarget] = useState<StockItem | null>(null);
  const [confirmClearLog, setConfirmClearLog] = useState(false);
  const [stockPerSizePricing, setStockPerSizePricing] = useState(false);
  const [stockSizePrices, setStockSizePrices] = useState<Record<string, SizePriceEntry>>({});
  const [newColors, setNewColors] = useState<string[]>([]);  // colour × size (clothes/shoes) for New Product

  // ── Godown / shop view ───────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<'all' | 'godown' | 'shop'>('all');
  const [godowns, setGodowns] = useState<any[]>([]);
  const [selectedGodownId, setSelectedGodownId] = useState('');
  const [godownData, setGodownData] = useState<any | null>(null);
  const [loadingGodown, setLoadingGodown] = useState(false);
  async function loadGodowns() {
    try { const r = await api.get('/godowns'); setGodowns(r.data || []); } catch {}
  }
  async function loadGodownDetail(id: string) {
    if (!id) return;
    setLoadingGodown(true);
    try { const r = await api.get(`/godowns/${id}`); setGodownData(r.data); } catch {}
    finally { setLoadingGodown(false); }
  }
  useEffect(() => { if (viewMode === 'godown' && godowns.length === 0) loadGodowns(); }, [viewMode]);
  useEffect(() => { if (selectedGodownId) loadGodownDetail(selectedGodownId); }, [selectedGodownId]);

  const activeItems = useMemo(() => items.filter(i => {
    const s = (search || '').toLowerCase();
    const n = (i.name || '').toLowerCase();
    const c = (i.category || '').toLowerCase();
    return !i.archived &&
      (selectedCategory === 'All' || i.category === selectedCategory) &&
      (n.includes(s) || c.includes(s));
  }), [items, search, selectedCategory]);

  const archivedItems = useMemo(() => items.filter(i => {
    const s = (search || '').toLowerCase();
    const n = (i.name || '').toLowerCase();
    const c = (i.category || '').toLowerCase();
    return i.archived &&
      (selectedCategory === 'All' || i.category === selectedCategory) &&
      (n.includes(s) || c.includes(s));
  }), [items, search, selectedCategory]);

  const stats = useMemo(() => ({
    total:      items.filter(i => !i.archived).length,
    lowStock:   items.filter(i => !i.archived && i.current > 0 && i.current <= i.min).length,
    outOfStock: items.filter(i => !i.archived && i.current <= 0).length,
  }), [items]);

  function openEditModal(item: StockItem) {
    setMenuId(null);
    const sizes = parseSizeVariants(item.size_variants);
    // A product is "sized" if it was actually saved with net-weight / size variants — detected
    // from the product's own data so it doesn't depend on bizConfig being hydrated yet.
    const hasSizes = Object.values(sizes).some(v => Number(v) > 0);
    setEditModal({ item, adjQty: '', adjType: 'in', name: item.name ?? '', category: item.category ?? '', unit: item.unit ?? '', min: String(item.min ?? 0), sizes, hasSizes, submitting: false });
  }
  async function saveEditModal() {
    if (!editModal) return;
    setEditModal(m => m ? { ...m, submitting: true } : m);
    const { item, adjQty, adjType, name, category, unit, min, sizes, hasSizes } = editModal;
    try {
      const updates: Partial<StockItem> = {};
      if (name.trim() !== item.name) updates.name = name.trim();
      if (category.trim() !== item.category) updates.category = category.trim();
      if (unit.trim() !== item.unit) updates.unit = unit.trim();
      if (Number(min) !== item.min) updates.min = Number(min);
      if (hasSizes) {
        // Per net-weight stock is edited directly; total = sum of all sizes.
        const newTotal = totalFromSizes(sizes);
        if (serializeSizeVariants(sizes) !== serializeSizeVariants(parseSizeVariants(item.size_variants))) {
          updates.size_variants = serializeSizeVariants(sizes);
        }
        if (newTotal !== item.current) updates.current = newTotal;
      }
      if (Object.keys(updates).length > 0) await updateItem(item.id, updates);
      // Simple +/- adjust only applies to non-sized products.
      const qty = Number(adjQty);
      if (!hasSizes && qty > 0) await adjustStock(item.id, adjType === 'in' ? qty : -qty, adjType === 'in' ? t('stockIn') : t('stockOut'));
      setEditModal(null);
    } catch {
      setEditModal(m => m ? { ...m, submitting: false } : m);
    }
  }
  function permanentDelete(item: StockItem) { setDeleteTarget(item); setMenuId(null); }
  function confirmDelete() { if (!deleteTarget) return; removeItem(deleteTarget.id); setDeleteTarget(null); }

  function openModal(type: 'in' | 'out') {
    setModal(type); setIsNew(false); setSelId(''); setQty('');
    setNote(''); setProductSearch(''); setAddSizes({});
    setStockPerSizePricing(!!bizConfig.hasColors); setStockSizePrices({}); setNewColors([]);
    setNewForm({
      name: '', category: '', unit: bizConfig.defaultUnits[0] || '', min: '', mrp: '', selling: '', cost: '',
      model_number: '', warranty_months: '',
      expiry_date: '', batch_number: '', drug_schedule: 'OTC',
      gender: 'Unisex', shade: '',
      size_variants: {},
    });
    setPricing({ mrp: '', selling: '', cost: '' });
    setError('');
  }
  function closeModal() { setModal(null); setError(''); }

  // New Product (colour × size): updating colours prunes orphaned composite variant/price keys.
  function handleNewColorsChange(next: string[]) {
    setNewColors(next);
    const prune = <T,>(map: Record<string, T>): Record<string, T> => {
      const out: Record<string, T> = {};
      for (const [k, v] of Object.entries(map)) {
        const { color } = splitVariantKey(k);
        if (!color || next.includes(color)) out[k] = v;
      }
      return out;
    };
    setNewForm(f => ({ ...f, size_variants: prune(f.size_variants) }));
    setStockSizePrices(prune);
    // Variant products use per-spec pricing by default (apparel always; electricals once a type is picked).
    setStockPerSizePricing(bizConfig.hasColors || next.length > 0);
  }

  async function handleStockIn(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const q = newVariantActive ? totalFromSizes(newForm.size_variants) : Number(qty);
    if (isNew) {
      if (!newForm.name.trim()) { setError(t('nameRequired') ?? 'Name required'); setSubmitting(false); return; }
      if (!newVariantActive && (!q || q <= 0)) { setError(t('validAmount') ?? 'Enter a valid quantity.'); setSubmitting(false); return; }
      try {
        await addItem({
          name: newForm.name.trim(),
          category: newForm.category.trim() || 'General',
          unit: newForm.unit.trim() || bizConfig.defaultUnits[0] || 'Unit',
          min: Number(newForm.min) || 0,
          current: q,
          mrp: Number(newForm.mrp) || 0,
          sellingPrice: Number(newForm.selling) || 0,
          cost: Number(newForm.cost) || 0,
          model_number: newForm.model_number || null,
          warranty_months: newForm.warranty_months ? Number(newForm.warranty_months) : null,
          expiry_date: newForm.expiry_date || null,
          batch_number: newForm.batch_number || null,
          drug_schedule: newForm.drug_schedule || null,
          gender: newForm.gender || null,
          shade: newForm.shade || null,
          size_variants: newVariantActive ? serializeSizeVariants(newForm.size_variants) : null,
          metadata: newVariantActive ? mergeSizePricesIntoMetadata({}, stockSizePrices, stockPerSizePricing) : undefined,
        });
        closeModal();
      } catch (err: any) {
        const msg = err?.response?.data?.detail || err?.response?.data?.message || 'Failed to add product. Please try again.';
        setError(typeof msg === 'string' ? msg : 'Failed to add product. Please try again.');
      } finally { setSubmitting(false); }
    } else {
      if (selId === '') { setError(t('selectProduct')); setSubmitting(false); return; }
      const pricingPayload = {
        mrp: pricing.mrp ? Number(pricing.mrp) : undefined,
        sellingPrice: pricing.selling ? Number(pricing.selling) : undefined,
        cost: pricing.cost ? Number(pricing.cost) : undefined,
      };
      // Per net-weight stock-in: add the entered amounts onto each existing size.
      if (selectedHasSizes) {
        const delta = totalFromSizes(addSizes);
        if (!delta || delta <= 0) { setError(t('validAmount') ?? 'Enter a valid quantity.'); setSubmitting(false); return; }
        const merged: Record<string, number> = { ...selectedExistingSizes };
        for (const [sz, add] of Object.entries(addSizes)) {
          if (add > 0) merged[sz] = (merged[sz] || 0) + add;
        }
        const sizeMeta = mergeSizePricesIntoMetadata(selectedItem?.metadata, stockSizePrices, stockPerSizePricing);
        try {
          await adjustStock(selId, delta, note, pricingPayload);
          await updateItem(selId, { size_variants: serializeSizeVariants(merged), metadata: sizeMeta });
          closeModal();
        } catch (err: any) {
          const msg = err?.response?.data?.detail || err?.response?.data?.message || 'Failed to adjust stock. Please try again.';
          setError(typeof msg === 'string' ? msg : 'Failed to adjust stock. Please try again.');
        } finally { setSubmitting(false); }
        return;
      }
      if (!Number(qty) || Number(qty) <= 0) { setError(t('validAmount') ?? 'Enter a valid quantity.'); setSubmitting(false); return; }
      try {
        await adjustStock(selId, Number(qty), note, pricingPayload);
        closeModal();
      } catch (err: any) {
        const msg = err?.response?.data?.detail || err?.response?.data?.message || 'Failed to adjust stock. Please try again.';
        setError(typeof msg === 'string' ? msg : 'Failed to adjust stock. Please try again.');
      } finally { setSubmitting(false); }
    }
  }

  async function handleStockOut(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    if (selId === '') { setError(t('selectProduct')); setSubmitting(false); return; }
    const item = items.find(i => i.id === selId)!;
    // Per net-weight stock-out: remove the entered amounts from each existing size.
    if (selectedHasSizes) {
      const delta = totalFromSizes(addSizes);
      if (!delta || delta <= 0) { setError(t('validAmount') ?? 'Enter a valid quantity.'); setSubmitting(false); return; }
      // Cannot remove more than is available for any individual size.
      for (const [sz, rem] of Object.entries(addSizes)) {
        if (rem > 0 && rem > (selectedExistingSizes[sz] || 0)) {
          setError(`${sz}: ${t('available')} ${selectedExistingSizes[sz] || 0} ${item.unit}`);
          setSubmitting(false); return;
        }
      }
      const merged: Record<string, number> = { ...selectedExistingSizes };
      for (const [sz, rem] of Object.entries(addSizes)) {
        if (rem > 0) merged[sz] = Math.max(0, (merged[sz] || 0) - rem);
      }
      try {
        await adjustStock(selId, -delta, note);
        await updateItem(selId, { size_variants: serializeSizeVariants(merged) });
        closeModal();
      } catch (err: any) {
        const msg = err?.response?.data?.detail || err?.response?.data?.message || 'Failed to adjust stock.';
        setError(typeof msg === 'string' ? msg : 'Failed to adjust stock.');
      } finally { setSubmitting(false); }
      return;
    }
    const q = Number(qty);
    if (!q || q <= 0) { setError(t('validAmount') ?? 'Enter a valid quantity.'); setSubmitting(false); return; }
    if (q > item.current) { setError(`${t('remaining')}: ${item.current} ${item.unit}`); setSubmitting(false); return; }
    try {
      await adjustStock(selId, -q, note);
      closeModal();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.response?.data?.message || 'Failed to adjust stock.';
      setError(typeof msg === 'string' ? msg : 'Failed to adjust stock.');
    } finally { setSubmitting(false); }
  }

  const selectedItem = items.find(i => i.id === selId);
  // Existing product tracked by net-weight / size variants → add/remove stock per size
  // instead of a single qty. Detect from the product's own data (not bizConfig, which can
  // be momentarily 'general' before the profile hydrates) so the grid always shows when the
  // product actually has weights.
  const selectedExistingSizes = (!isNew && selectedItem)
    ? parseSizeVariants(selectedItem.size_variants) : {};
  const selectedHasSizes = Object.values(selectedExistingSizes).some(v => Number(v) > 0);

  // New-product variant model. Apparel = Colour × Size (always on); electricals/electronics =
  // a Type × Spec matrix resolved from the chosen CATEGORY (bulb → Type × Watt, battery →
  // Type × Capacity…); kirana = single net-weight grid.
  const variantDim = bizConfig.hasColors
    ? { options: bizConfig.colorChart || [], label: 'colour', swatch: true, sectionLabel: tv('colourSizeInventory'), sizeChart: bizConfig.sizeChart || [] }
    : (() => {
        if (!bizConfig.hasSpecs) return null;
        const spec = getCategoryVariantSpec(newForm.category, bizConfig.type);
        if (!spec) return null;
        const lbl = spec.typeLabel.toLowerCase();
        const swatch = /colour|color|shade/.test(lbl);
        return { options: spec.typeOptions, label: lbl, swatch, sectionLabel: tv('specInventory', { type: spec.typeLabel, spec: spec.sizeLabel }), sizeChart: spec.sizeChart };
      })();
  const variantSizeChart = variantDim?.sizeChart || [];
  const newVariantActive = bizConfig.hasColors ? true : bizConfig.hasSpecs ? (!!variantDim && newColors.length > 0) : bizConfig.hasSizes;

  const inp = 'w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';

  // Searchable product picker — filters by name / category for the Stock In / Out modals
  const pickerItems = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return items.filter(i => {
      if (i.archived) return false;
      if (modal === 'out' && i.current <= 0) return false;
      if (!q) return true;
      return (i.name || '').toLowerCase().includes(q) || (i.category || '').toLowerCase().includes(q);
    });
  }, [items, productSearch, modal]);

  function statusLabel(s: string) {
    if (s === 'ok')  return t('inStock');
    if (s === 'low') return t('lowStockStatus');
    return t('outOfStockStatus');
  }
  function statusCls(s: string) {
    if (s === 'ok')  return 'bg-emerald-500/10 text-emerald-500';
    if (s === 'low') return 'bg-orange-500/10 text-orange-400';
    return 'bg-red-500/10 text-red-400';
  }

  function getStatus(item: StockItem) {
    if (item.current <= 0) return 'out';
    if (item.current <= item.min) return 'low';
    return 'ok';
  }

  function renderRows(rows: StockItem[]) {
    return rows.map(item => {
      const status = getStatus(item);
      return (
        <tr key={item.id} className={cn('group text-slate-900 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-all duration-200', item.archived && 'opacity-60')}>
          <td className="px-6 py-4 font-medium"><SmartTranslator text={item.name} locale={locale} /></td>
          <td className="px-6 py-4 text-sm text-slate-400"><SmartTranslator text={item.category} locale={locale} /></td>
          <td className="px-6 py-4">
            {bizConfig.hasSizes ? (
              <div>
                <button onClick={() => openEditModal(item)} className="font-bold text-slate-900 dark:text-slate-100 hover:text-emerald-400 transition-colors underline-offset-2 hover:underline cursor-pointer">
                  {Math.max(0, item.current)}
                </button>
                {(() => {
                  const sv = parseSizeVariants((item as any).size_variants);
                  const entries = Object.entries(sv).filter(([,q]) => Number(q) > 0);
                  if (entries.length === 0) return null;
                  return (
                    <div className="flex flex-wrap gap-0.5 mt-1">
                      {entries.slice(0, 5).map(([sz, q]) => (
                        <span key={sz} className="text-[9px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-1 rounded">{sz}:{q}</span>
                      ))}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <button
                onClick={() => openEditModal(item)}
                className="font-bold text-slate-900 dark:text-slate-100 hover:text-emerald-400 transition-colors underline-offset-2 hover:underline cursor-pointer"
                title="Click to adjust stock"
              >
                {Math.max(0, item.current)}
              </button>
            )}
          </td>
          <td className="px-6 py-4 text-slate-400">{item.min}</td>
          <td className="px-6 py-4 text-sm text-slate-400"><SmartTranslator text={item.unit} locale={locale} /></td>
          <td className="px-6 py-4">
            {!item.archived ? (
              <span className={cn('px-2 py-1 rounded-full text-[10px] font-bold uppercase flex items-center gap-1 w-fit', statusCls(status))}>
                {status === 'low' && <AlertTriangle size={10} />}
                {statusLabel(status)}
              </span>
            ) : (
              <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-slate-700 text-slate-400">{t('archived')}</span>
            )}
          </td>
          <td className="px-6 py-4">
            <div className="flex items-center justify-end gap-1.5 opacity-100 transition-opacity">
              <button
                onClick={() => openEditModal(item)}
                title={t('editRow')}
                className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 hover:bg-emerald-500/20 hover:text-emerald-400 transition-all active:scale-90 border border-slate-300 dark:border-slate-700/50">
                <Pencil size={14} />
              </button>

              <button
                onClick={() => toggleArchive(item.id)}
                title={item.archived ? t('unarchive') : t('archive')}
                className={cn(
                  "p-2 rounded-lg bg-slate-50 dark:bg-slate-800 transition-all active:scale-90 border border-slate-300 dark:border-slate-700/50",
                  item.archived
                    ? "text-blue-400 hover:bg-blue-500/20 hover:text-blue-300"
                    : "text-amber-400 hover:bg-amber-500/20 hover:text-amber-300"
                )}>
                {item.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
              </button>

              <button 
                onClick={() => permanentDelete(item)}
                title={t('deletePermanently')}
                className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-500 hover:bg-red-500/20 hover:text-red-400 transition-all active:scale-90 border border-slate-300 dark:border-slate-700/50">
                <Trash2 size={14} />
              </button>
            </div>
          </td>
        </tr>
      );
    });
  }

  function renderProductPicker(emptyHint?: string) {
    return (
      <div>
        <label className="block text-xs text-slate-400 mb-1">{t('selectProduct')}</label>
        {/* Search box */}
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            autoFocus
            placeholder={t('searchPlaceholder')}
            className={inp + ' pl-9'}
            value={productSearch}
            onChange={e => setProductSearch(e.target.value)}
          />
        </div>
        {/* Filtered list */}
        <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-300 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-800">
          {pickerItems.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-slate-500">{emptyHint || t('noItems')}</p>
          ) : pickerItems.map(i => {
            const active = String(selId) === String(i.id);
            return (
              <button
                key={i.id}
                type="button"
                onClick={() => {
                  setSelId(i.id); setError(''); setQty(''); setAddSizes({});
                  // Preload any existing per-net-weight prices for this product.
                  const sp = parseSizePrices((i as any).metadata);
                  setStockSizePrices(sp);
                  setStockPerSizePricing(Object.keys(sp).length > 0);
                }}
                className={cn(
                  'w-full text-left px-3 py-2.5 flex items-center justify-between gap-2 transition-colors',
                  active ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-200'
                )}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium truncate">{i.name}</span>
                  {i.category && <span className="block text-[11px] text-slate-500 truncate">{i.category}</span>}
                </span>
                <span className="flex items-center gap-2 flex-shrink-0">
                  <span className={cn('text-sm font-semibold', i.current <= 0 ? 'text-red-400' : i.current <= i.min ? 'text-orange-400' : 'text-slate-600 dark:text-slate-300')}>
                    {Math.max(0, i.current)} {i.unit}
                  </span>
                  {active && <Check size={15} className="text-emerald-500" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (!mounted) return null;

  return (
    <div className="space-y-6" onClick={() => setMenuId(null)}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-emerald-500">{t('title')}</h1>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => openModal('in')}
            className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-emerald-500/20 transition-colors font-medium">
            <ArrowDownLeft size={18} />{t('stockIn')}
          </button>
          <button onClick={() => openModal('out')}
            className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-red-500/20 transition-colors font-medium">
            <ArrowUpRight size={18} />{t('stockOut')}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title={t('totalItems')}  value={stats.total}      color="text-blue-400" />
        <StatCard title={t('lowStock')}    value={stats.lowStock}   color="text-orange-400" />
        <StatCard title={t('outOfStock')}  value={stats.outOfStock} color="text-red-400" />
      </div>

      {/* View mode tabs */}
      <div className="flex gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1">
        {[
          { key: 'all', label: 'All Stock', icon: Package },
          ...(isWholesale ? [{ key: 'godown', label: 'By Godown', icon: Warehouse }] : []),
          ...(allShops.length > 1 ? [{ key: 'shop', label: 'By Shop', icon: Store }] : []),
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setViewMode(key as any)}
            className={cn('flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all',
              viewMode === key ? 'bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-300')}>
            <Icon size={15} />{label}
          </button>
        ))}
      </div>

      {/* ── Godown Stock view ── */}
      {viewMode === 'godown' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <select
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-slate-900 dark:text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 min-w-[220px]"
              value={selectedGodownId} onChange={e => setSelectedGodownId(e.target.value)}>
              <option value="">— Select Godown —</option>
              {godowns.map((g: any) => (
                <option key={g.id} value={g.id}>{g.name} ({g.godownCode || g.godown_code})</option>
              ))}
            </select>
            {selectedGodownId && godownData?.location && (
              <span className="text-xs text-slate-500 flex items-center gap-1"><MapPin size={11} />{godownData.location}</span>
            )}
          </div>

          {!selectedGodownId ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center">
              <Warehouse className="w-12 h-12 mx-auto mb-3 text-slate-600" />
              <p className="text-slate-400 text-sm">Select a godown to view stock levels</p>
            </div>
          ) : loadingGodown ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-emerald-400" size={28} /></div>
          ) : !godownData || (godownData.inventory || []).length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center">
              <Package className="w-12 h-12 mx-auto mb-3 text-slate-600" />
              <p className="text-slate-400 text-sm">No products in this godown yet</p>
            </div>
          ) : (
            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 overflow-hidden">
              <CardContent className="p-0">
                <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                  <Warehouse size={15} className="text-emerald-400" />
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-200">{godownData.name}</span>
                  <span className="ml-auto text-xs font-mono text-slate-500">{godownData.godownCode || godownData.godown_code}</span>
                  <span className="text-xs text-slate-500">{(godownData.inventory || []).length} products</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-100 dark:bg-slate-800/60 text-slate-400 text-xs uppercase">
                      <tr>
                        <th className="px-5 py-3">Product</th>
                        <th className="px-5 py-3">Category</th>
                        <th className="px-5 py-3">Godown Qty</th>
                        <th className="px-5 py-3">Shop Stock</th>
                        <th className="px-5 py-3">Min Level</th>
                        <th className="px-5 py-3">Status</th>
                        <th className="px-5 py-3">Unit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {(godownData.inventory || []).map((item: any) => {
                        const p = item.product;
                        const shopItem = items.find(i => String(i.id) === String(item.productId || item.product_id));
                        const status = shopItem ? getStatus(shopItem) : null;
                        return (
                          <tr key={item.id} className="text-slate-900 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="px-5 py-3 font-medium">{p?.name}</td>
                            <td className="px-5 py-3 text-slate-400">{p?.category}</td>
                            <td className="px-5 py-3">
                              <span className="text-emerald-400 font-bold text-base">{item.quantity}</span>
                            </td>
                            <td className="px-5 py-3">
                              {shopItem ? (
                                <span className={cn('font-semibold', status === 'out' ? 'text-red-400' : status === 'low' ? 'text-orange-400' : 'text-slate-900 dark:text-slate-200')}>
                                  {shopItem.current}
                                </span>
                              ) : <span className="text-slate-600">—</span>}
                            </td>
                            <td className="px-5 py-3 text-slate-400">{shopItem?.min ?? '—'}</td>
                            <td className="px-5 py-3">
                              {status ? (
                                <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full uppercase',
                                  status === 'ok' ? 'bg-emerald-500/10 text-emerald-400' :
                                  status === 'low' ? 'bg-orange-500/10 text-orange-400' : 'bg-red-500/10 text-red-400')}>
                                  {status}
                                </span>
                              ) : <span className="text-slate-600 text-xs">—</span>}
                            </td>
                            <td className="px-5 py-3 text-slate-400">{p?.baseUnit || p?.base_unit || shopItem?.unit}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Shop view ── */}
      {viewMode === 'shop' && allShops.length > 1 && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {allShops.map(shop => {
              const isActive = activeShopId === shop.id || (!activeShopId && shop.id === profile.id);
              return (
                <button key={shop.id}
                  onClick={() => { switchShop(shop.id); setTimeout(fetchStock, 300); }}
                  className={cn('flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all',
                    isActive ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white hover:border-slate-300 dark:border-slate-700')}>
                  <Store size={14} />
                  <span>{shop.name}</span>
                  {shop.shopCode && <span className="text-[10px] font-mono text-slate-500">{shop.shopCode}</span>}
                  {isActive && <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full">Active</span>}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-500">Showing stock for: <strong className="text-slate-300">{profile.shopName}</strong></p>
        </div>
      )}

      {/* ── All Stock view (existing) — only show when viewMode === 'all' ── */}
      {viewMode === 'all' && (<>

      {/* Search + Category Filter + Archive toggle */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-[2]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input type="text" placeholder={t('searchPlaceholder')}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-3 pl-10 pr-4 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        
        <div className="relative flex-1">
          <select 
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-3 px-4 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 appearance-none cursor-pointer"
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
          >
            <option value="All">{String(t('allCategories') || 'All Categories')}</option>
            {bizConfig.defaultCategories.map(cat => (
              <option key={cat} value={cat}>{translateData(cat, locale) || cat}</option>
            ))}
          </select>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
            <ArrowDownLeft size={16} className="rotate-[-45deg]" />
          </div>
        </div>

        <button onClick={() => setShowArchived(v => !v)}
          className={cn('px-6 py-2 rounded-xl border text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap',
            showArchived ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white')}>
          <Archive size={16} />
          {showArchived ? t('hideArchived') : t('archive')}
          {items.filter(i => i.archived).length > 0 && (
            <span className="bg-amber-500/20 text-amber-400 text-xs px-1.5 rounded-full">{items.filter(i => i.archived).length}</span>
          )}
        </button>
      </div>

      {/* Active Table */}
      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-100 dark:bg-slate-800/60 text-slate-400 text-xs uppercase">
                <tr>
                  <th className="px-6 py-4">{t('colProduct')}</th>
                  <th className="px-6 py-4">{t('colCategory')}</th>
                  <th className="px-6 py-4">{t('colCurrentStock')}</th>
                  <th className="px-6 py-4">{t('colMinLevel')}</th>
                  <th className="px-6 py-4">{t('colUnit')}</th>
                  <th className="px-6 py-4">{t('colStatus')}</th>
                  <th className="px-6 py-4 text-center">{t('colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800" onClick={e => e.stopPropagation()}>
                {renderRows(activeItems)}
                {loading ? (
                  <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-500"><Loader2 className="animate-spin inline-block" size={20} /> Loading...</td></tr>
                ) : activeItems.length === 0 && (
                  <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-500">{t('noItems')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Archived Table */}
      {showArchived && (
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 overflow-hidden">
          <CardContent className="p-0">
            <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 text-amber-400 text-sm font-semibold">
              <Archive size={15} />{t('archivedProducts')}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-100 dark:bg-slate-800/60 text-slate-400 text-xs uppercase">
                  <tr>
                    <th className="px-6 py-4">{t('colProduct')}</th>
                    <th className="px-6 py-4">{t('colCategory')}</th>
                    <th className="px-6 py-4">{t('colCurrentStock')}</th>
                    <th className="px-6 py-4">{t('colMinLevel')}</th>
                    <th className="px-6 py-4">{t('colUnit')}</th>
                    <th className="px-6 py-4">{t('colStatus')}</th>
                    <th className="px-6 py-4 text-center">{t('colActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800" onClick={e => e.stopPropagation()}>
                  {renderRows(archivedItems)}
                  {archivedItems.length === 0 && (
                    <tr><td colSpan={7} className="px-6 py-10 text-center text-slate-500">{t('noArchived')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Activity Log */}
      {(log?.length ?? 0) > 0 && (
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-slate-400 uppercase font-bold">{t('recentActivity')}</p>
              {confirmClearLog ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-400">{t('clearHistory')}?</span>
                  <button onClick={() => { clearLog(); setConfirmClearLog(false); }} className="text-red-400 hover:text-red-300 p-1"><Check size={14} /></button>
                  <button onClick={() => setConfirmClearLog(false)} className="text-slate-400 p-1"><X size={14} /></button>
                </div>
              ) : (
                <button onClick={() => setConfirmClearLog(true)} className="text-xs text-slate-500 hover:text-red-400 flex items-center gap-1 transition-colors">
                  <Trash size={12} />{t('clearHistory')}
                </button>
              )}
            </div>
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {log.map(entry => (
                <div key={entry.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className={cn('w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0',
                      entry.type === 'in'  ? 'bg-emerald-500/20 text-emerald-400' :
                      entry.type === 'out' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400')}>
                      {entry.type === 'in'  ? <ArrowDownLeft size={11} /> :
                       entry.type === 'out' ? <ArrowUpRight size={11} /> : <Pencil size={10} />}
                    </span>
                    <span className="text-slate-300">{entry.itemName}</span>
                    {entry.note && <span className="text-slate-500 text-xs">· {entry.note}</span>}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={cn('font-bold',
                      entry.type === 'in'  ? 'text-emerald-400' :
                      entry.type === 'out' ? 'text-red-400' : 'text-blue-400')}>
                      {entry.type === 'in' ? '+' : entry.type === 'out' ? '-' : '±'}{entry.qty}
                    </span>
                    <span className="text-slate-500 text-xs">{entry.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Smart Edit Modal ── */}
      {editModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setEditModal(null)}>
          <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate pr-4">{editModal.item.name}</h2>
              <button onClick={() => setEditModal(null)} className="text-slate-400 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white shrink-0"><X size={20} /></button>
            </div>

            <div className="p-5 space-y-5 overflow-y-auto flex-1 min-h-0">
              {/* Current stock display */}
              <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 rounded-xl px-5 py-4">
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">Current Stock</p>
                  <p className="text-3xl font-black text-emerald-400">{editModal.hasSizes ? Math.max(0, totalFromSizes(editModal.sizes)) : Math.max(0, editModal.item.current)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Unit</p>
                  <p className="text-sm font-semibold text-slate-300">{editModal.item.unit}</p>
                  <p className="text-xs text-slate-500 mt-1">Min: {editModal.item.min}</p>
                </div>
              </div>

              {/* Stock adjust — per net-weight / colour-size grid when the product has variants */}
              {editModal.hasSizes ? (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{isColorSizeVariants(editModal.sizes) ? tv('adjustByVariant') : tv('adjustByWeight')}</p>
                  <div className="bg-violet-500/5 border border-violet-500/20 rounded-xl p-3">
                    {isColorSizeVariants(editModal.sizes) ? (
                      <ColorSizeVariantGrid
                        colors={colorsFromVariants(editModal.sizes)}
                        sizeChart={Array.from(new Set([
                          ...(bizConfig.hasColors ? (bizConfig.sizeChart || []) : (getCategoryVariantSpec(editModal.item.category, bizConfig.type)?.sizeChart || [])),
                          ...sizesFromVariants(editModal.sizes),
                        ]))}
                        value={editModal.sizes}
                        onChange={sizes => setEditModal(m => m ? { ...m, sizes } : m)}
                        unitLabel={editModal.unit?.toLowerCase() || 'units'}
                        showSwatch={bizConfig.hasColors}
                      />
                    ) : (
                    <SizeVariantGrid
                      sizeChart={Array.from(new Set([...(bizConfig.sizeChart || []), ...Object.keys(editModal.sizes)]))}
                      value={editModal.sizes}
                      onChange={sizes => setEditModal(m => m ? { ...m, sizes } : m)}
                      unitLabel={editModal.unit?.toLowerCase() || 'units'}
                    />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2 text-center">{tv('editVariantHint')}</p>
                </div>
              ) : (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Adjust Stock</p>
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setEditModal(m => m ? { ...m, adjType: 'in' } : m)}
                    className={cn('flex-1 py-2 rounded-xl text-sm font-bold transition-all', editModal.adjType === 'in' ? 'bg-emerald-500 text-slate-900' : 'bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white')}
                  >+ Add Stock</button>
                  <button
                    onClick={() => setEditModal(m => m ? { ...m, adjType: 'out' } : m)}
                    className={cn('flex-1 py-2 rounded-xl text-sm font-bold transition-all', editModal.adjType === 'out' ? 'bg-red-500 text-slate-900 dark:text-white' : 'bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white')}
                  >− Remove</button>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setEditModal(m => m ? { ...m, adjQty: String(Math.max(0, Number(m.adjQty) - 1)) } : m)}
                    className="w-11 h-11 rounded-full bg-slate-50 dark:bg-slate-800 hover:bg-slate-700 text-slate-900 dark:text-slate-200 text-xl font-bold flex items-center justify-center transition-colors active:scale-90">−</button>
                  <input
                    type="number" min="0"
                    className="flex-1 text-center bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl py-2.5 text-slate-900 dark:text-slate-100 text-xl font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={editModal.adjQty}
                    onChange={e => setEditModal(m => m ? { ...m, adjQty: e.target.value } : m)}
                    placeholder="0"
                    autoFocus
                  />
                  <button
                    onClick={() => setEditModal(m => m ? { ...m, adjQty: String(Number(m.adjQty) + 1) } : m)}
                    className="w-11 h-11 rounded-full bg-slate-50 dark:bg-slate-800 hover:bg-slate-700 text-slate-900 dark:text-slate-200 text-xl font-bold flex items-center justify-center transition-colors active:scale-90">+</button>
                </div>
                {Number(editModal.adjQty) > 0 && (
                  <div className="mt-2.5 text-center text-sm">
                    <span className="text-slate-400">New stock → </span>
                    <span className={cn('font-bold text-lg', editModal.adjType === 'in' ? 'text-emerald-400' : 'text-red-400')}>
                      {editModal.adjType === 'in'
                        ? editModal.item.current + Number(editModal.adjQty)
                        : Math.max(0, editModal.item.current - Number(editModal.adjQty))}
                    </span>
                    <span className="text-slate-500 text-xs ml-1">{editModal.item.unit}</span>
                  </div>
                )}
              </div>
              )}

              {/* Details */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Product Details</p>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[11px] text-slate-500 mb-1 block">Name</label>
                    <input className={inp} value={editModal.name} onChange={e => setEditModal(m => m ? { ...m, name: e.target.value } : m)} />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 mb-1 block">Category</label>
                    <input className={inp} value={editModal.category} onChange={e => setEditModal(m => m ? { ...m, category: e.target.value } : m)} />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 mb-1 block">Unit</label>
                    <input className={inp} value={editModal.unit} onChange={e => setEditModal(m => m ? { ...m, unit: e.target.value } : m)} />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 mb-1 block">Min Level</label>
                    <input type="number" min="0" className={inp} value={editModal.min} onChange={e => setEditModal(m => m ? { ...m, min: e.target.value } : m)} />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 flex gap-3 border-t border-slate-200 dark:border-slate-800 flex-shrink-0">
              <button onClick={() => setEditModal(null)} className="flex-1 py-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl text-slate-300 text-sm font-semibold hover:bg-slate-700 transition-colors">Cancel</button>
              <button
                onClick={saveEditModal}
                disabled={editModal.submitting}
                className="flex-1 py-2.5 bg-emerald-500 text-slate-900 rounded-xl text-sm font-bold hover:bg-emerald-400 transition-colors active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {editModal.submitting ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stock In Modal */}
      {modal === 'in' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
            {/* Sticky header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
              <div className="flex items-center gap-2"><ArrowDownLeft size={18} className="text-emerald-400" /><h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('stockIn')}</h2></div>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white"><X size={20} /></button>
            </div>
            <form onSubmit={handleStockIn} className="flex flex-col flex-1 min-h-0">
            <div className="overflow-y-auto flex-1 p-6 space-y-4">
              <div className="flex rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700">
                <button type="button" onClick={() => { setIsNew(false); setError(''); }}
                  className={cn('flex-1 py-2 text-sm font-medium transition-colors', !isNew ? 'bg-emerald-500 text-slate-900' : 'bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white')}>
                  {t('existingProduct')}
                </button>
                <button type="button" onClick={() => { setIsNew(true); setError(''); }}
                  className={cn('flex-1 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-1', isNew ? 'bg-emerald-500 text-slate-900' : 'bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white')}>
                  <Plus size={14} />{t('newProduct')}
                </button>
              </div>
              {!isNew ? (
                renderProductPicker()
              ) : (
                <div className="space-y-3">
                  {/* Basic Info */}
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">{t('productName')}</label>
                    <input className={inp} placeholder={bizConfig.productPlaceholder || t('productNameHint')} value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">{t('category')}</label>
                      <input className={inp} list="stock-cat-list" value={newForm.category} onChange={e => setNewForm(f => ({ ...f, category: e.target.value }))} placeholder={t('chooseCategory') || 'Select...'} />
                      <datalist id="stock-cat-list">
                        {bizConfig.defaultCategories.map(cat => <option key={cat} value={cat}>{translateData(cat, locale) || cat}</option>)}
                      </datalist>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">{t('unit')}</label>
                      <select className={inp} value={newForm.unit} onChange={e => setNewForm(f => ({ ...f, unit: e.target.value }))}>
                        {bizConfig.defaultUnits.map(u => <option key={u} value={u}>{translateData(u, locale) || u}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Gender — shoes / clothes */}
                  {bizConfig.hasGender && (
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Gender</label>
                      <select className={inp} value={newForm.gender} onChange={e => setNewForm(f => ({ ...f, gender: e.target.value }))}>
                        {['Unisex', 'Men', 'Women', 'Boys', 'Girls', 'Kids'].map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                  )}

                  {/* Fabric — clothes */}
                  {bizConfig.hasFabric && (
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Fabric / Material</label>
                      <input className={inp} placeholder="e.g. Cotton, Polyester, Silk..." value={newForm.shade} onChange={e => setNewForm(f => ({ ...f, shade: e.target.value }))} />
                    </div>
                  )}

                  {/* Shade — cosmetics */}
                  {bizConfig.hasShades && (
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Shade / Color Variant</label>
                      <input className={inp} placeholder="e.g. Rose Red, Nude 01..." value={newForm.shade} onChange={e => setNewForm(f => ({ ...f, shade: e.target.value }))} />
                    </div>
                  )}

                  {/* Model + Warranty — electronics */}
                  {bizConfig.hasModel && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Model Number</label>
                        <input className={inp} placeholder="e.g. SM-G990B" value={newForm.model_number} onChange={e => setNewForm(f => ({ ...f, model_number: e.target.value }))} />
                      </div>
                      {bizConfig.hasWarranty && (
                        <div>
                          <label className="block text-xs text-slate-400 mb-1 flex items-center gap-1"><ShieldCheck size={10} className="text-sky-400" />Warranty (months)</label>
                          <input type="number" min="0" className={inp} placeholder="12" value={newForm.warranty_months} onChange={e => setNewForm(f => ({ ...f, warranty_months: e.target.value }))} />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Medical — batch + drug schedule */}
                  {(bizConfig.hasBatch || bizConfig.hasDrugSchedule) && (
                    <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 space-y-3">
                      <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Medical Details</p>
                      {bizConfig.hasBatch && (
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Batch Number</label>
                          <input className={inp} placeholder="e.g. BCH-2024-001" value={newForm.batch_number} onChange={e => setNewForm(f => ({ ...f, batch_number: e.target.value }))} />
                        </div>
                      )}
                      {bizConfig.hasDrugSchedule && (
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Drug Schedule</label>
                          <select className={inp} value={newForm.drug_schedule} onChange={e => setNewForm(f => ({ ...f, drug_schedule: e.target.value }))}>
                            {['OTC', 'Rx', 'H1', 'H2', 'X'].map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Size / Variant Inventory — apparel colour×size, electrical type×spec, kirana weight */}
                  {((bizConfig.hasSizes && bizConfig.sizeChart) || (bizConfig.hasSpecs && variantDim)) && (
                    <div className="bg-violet-500/5 border border-violet-500/20 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-bold text-violet-400 uppercase tracking-wider">{variantDim?.sectionLabel || tv('sizeWeightInventory')}</p>
                        <button
                          type="button"
                          onClick={() => setStockPerSizePricing(prev => !prev)}
                          className={cn(
                            'flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all',
                            stockPerSizePricing
                              ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700 hover:text-slate-600 dark:hover:text-slate-300'
                          )}
                        >
                          <IndianRupee size={10} />
                          {stockPerSizePricing ? tv('perSizePricingOn') : tv('perSizePricing')}
                        </button>
                      </div>
                      {bizConfig.hasSpecs && variantDim && (
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">{tv('optionalStockHint')}</p>
                      )}
                      {variantDim ? (
                        <div className="space-y-3">
                          <ColorPicker colorChart={variantDim.options} value={newColors} onChange={handleNewColorsChange} showSwatch={variantDim.swatch} />
                          <ColorSizeVariantGrid
                            colors={newColors}
                            sizeChart={variantSizeChart}
                            value={newForm.size_variants}
                            onChange={variants => setNewForm(f => ({ ...f, size_variants: variants }))}
                            unitLabel={newForm.unit?.toLowerCase() || 'units'}
                            perSizePricing={stockPerSizePricing}
                            sizePrices={stockSizePrices}
                            onSizePricesChange={setStockSizePrices}
                            showSwatch={variantDim.swatch}
                            dimensionLabel={variantDim.label}
                          />
                        </div>
                      ) : (
                      <SizeVariantGrid
                        sizeChart={bizConfig.sizeChart!}
                        value={newForm.size_variants}
                        onChange={variants => setNewForm(f => ({ ...f, size_variants: variants }))}
                        unitLabel={newForm.unit?.toLowerCase() || 'units'}
                        perSizePricing={stockPerSizePricing}
                        sizePrices={stockSizePrices}
                        onSizePricesChange={setStockSizePrices}
                      />
                      )}
                    </div>
                  )}

                  {/* Min stock (always shown) */}
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">{t('minLevel')}{newVariantActive ? ' (Total)' : ''}</label>
                    <input type="number" min="0" className={inp} placeholder="0" value={newForm.min} onChange={e => setNewForm(f => ({ ...f, min: e.target.value }))} />
                  </div>

                  {/* Expiry date */}
                  {bizConfig.hasExpiry && (
                    <ExpiryDateField
                      value={newForm.expiry_date}
                      onChange={val => setNewForm(f => ({ ...f, expiry_date: val }))}
                      required={bizConfig.hasExpiryRequired}
                    />
                  )}
                </div>
              )}
              {/* Existing product with net-weight / size variants → add stock per size */}
              {selectedHasSizes && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">{t('quantityAdd')} — {isColorSizeVariants(selectedExistingSizes) ? tv('byVariant') : tv('byWeight')}</label>
                  <div className="bg-violet-500/5 border border-violet-500/20 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => setStockPerSizePricing(prev => !prev)}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all',
                          stockPerSizePricing
                            ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700 hover:text-slate-600 dark:hover:text-slate-300'
                        )}
                      >
                        <IndianRupee size={10} />
                        {stockPerSizePricing ? tv('perSizePricingOn') : tv('perSizePricing')}
                      </button>
                    </div>
                    {isColorSizeVariants(selectedExistingSizes) ? (
                      <ColorSizeVariantGrid
                        colors={colorsFromVariants(selectedExistingSizes)}
                        sizeChart={Array.from(new Set([
                          ...(bizConfig.hasColors ? (bizConfig.sizeChart || []) : (getCategoryVariantSpec(selectedItem?.category, bizConfig.type)?.sizeChart || [])),
                          ...sizesFromVariants(selectedExistingSizes),
                        ]))}
                        value={addSizes}
                        onChange={setAddSizes}
                        unitLabel={selectedItem?.unit?.toLowerCase() || 'units'}
                        perSizePricing={stockPerSizePricing}
                        sizePrices={stockSizePrices}
                        onSizePricesChange={setStockSizePrices}
                        showSwatch={bizConfig.hasColors}
                      />
                    ) : (
                    <SizeVariantGrid
                      sizeChart={Array.from(new Set([...(bizConfig.sizeChart || []), ...Object.keys(selectedExistingSizes)]))}
                      value={addSizes}
                      onChange={setAddSizes}
                      unitLabel={selectedItem?.unit?.toLowerCase() || 'units'}
                      perSizePricing={stockPerSizePricing}
                      sizePrices={stockSizePrices}
                      onSizePricesChange={setStockSizePrices}
                    />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2 text-center">
                    {tv('addingToStock')} → <span className="text-emerald-400 font-semibold">{selectedItem!.current + totalFromSizes(addSizes)} {selectedItem!.unit}</span>
                  </p>
                </div>
              )}
              {!(isNew && newVariantActive) && !selectedHasSizes && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">{t('quantityAdd')}</label>
                  <input type="number" min="1" required={!isNew || !newVariantActive} className={inp} placeholder="0" value={qty} onChange={e => { setQty(e.target.value); setError(''); }} />
                  {!isNew && selectedItem && qty && (
                    <p className="text-xs text-slate-500 mt-1">{t('newStockWill')}: <span className="text-emerald-400 font-semibold">{selectedItem.current + Number(qty)} {selectedItem.unit}</span></p>
                  )}
                </div>
              )}
              {isNew && newVariantActive && (
                <p className="text-xs text-slate-500 text-center">{tv('autoCalcQty')}</p>
              )}
              <div>
                <label className="block text-xs text-slate-400 mb-1">{t('note')}</label>
                <input className={inp} placeholder={t('noteHint')} value={note} onChange={e => setNote(e.target.value)} />
              </div>

              {/* Pricing Update Section */}
              <div className="bg-slate-100 dark:bg-slate-800/60 rounded-xl p-4 border border-slate-300 dark:border-slate-700/50 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('updatePricing') || 'Price Adjustment'}</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[10px] text-slate-500 font-medium">MRP (₹)</label>
                    <input type="number" className={inp + ' border-transparent focus:border-emerald-500/50'} 
                      placeholder={!isNew && selectedItem ? String(selectedItem.mrp) : "0"} 
                      value={isNew ? newForm.mrp : pricing.mrp} 
                      onChange={e => isNew ? setNewForm(f => ({...f, mrp: e.target.value})) : setPricing(p => ({...p, mrp: e.target.value}))} />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] text-slate-500 font-medium">Selling (₹)</label>
                    <input type="number" className={inp + ' border-transparent focus:border-emerald-500/50'} 
                      placeholder={!isNew && selectedItem ? String(selectedItem.sellingPrice) : "0"} 
                      value={isNew ? newForm.selling : pricing.selling} 
                      onChange={e => isNew ? setNewForm(f => ({...f, selling: e.target.value})) : setPricing(p => ({...p, selling: e.target.value}))} />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] text-slate-500 font-medium">Cost (₹)</label>
                    <input type="number" className={inp + ' border-transparent focus:border-emerald-500/50'} 
                      placeholder={!isNew && selectedItem ? String(selectedItem.cost) : "0"} 
                      value={isNew ? newForm.cost : pricing.cost} 
                      onChange={e => isNew ? setNewForm(f => ({...f, cost: e.target.value})) : setPricing(p => ({...p, cost: e.target.value}))} />
                  </div>
                </div>
                {!isNew && selectedItem && (
                  <p className="text-[9px] text-slate-500 italic text-center pt-1">{t('leaveEmptyToKeep') || 'Leave empty to keep current prices'}</p>
                )}
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-center gap-2 text-red-400 text-sm">
                  <AlertTriangle size={16} />
                  {error}
                </div>
              )}
            </div>

            {/* Sticky footer buttons */}
            <div className="flex gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex-shrink-0">
              <button type="button" onClick={closeModal}
                className="flex-1 bg-slate-50 dark:bg-slate-800 text-slate-400 py-3 rounded-xl font-semibold hover:bg-slate-700 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white transition-all active:scale-95">
                {t('cancel')}
              </button>
              <button type="submit" disabled={submitting}
                className="flex-1 bg-gradient-to-r from-emerald-600 to-emerald-500 text-slate-900 py-3 rounded-xl font-black hover:from-emerald-500 hover:to-emerald-400 shadow-lg shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-60 disabled:active:scale-100 flex items-center justify-center gap-2">
                {submitting ? <Loader2 className="animate-spin" size={18} /> : null}
                {submitting ? 'Updating...' : t('addStock')}
              </button>
            </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Out Modal */}
      {modal === 'out' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
              <div className="flex items-center gap-2"><ArrowUpRight size={18} className="text-red-400" /><h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('stockOut')}</h2></div>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white"><X size={20} /></button>
            </div>
            <form onSubmit={handleStockOut} className="flex flex-col flex-1 min-h-0">
            <div className="overflow-y-auto flex-1 p-6 space-y-4">
              {renderProductPicker(t('allOutOfStock'))}
              {selectedItem && (
                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg px-4 py-3 flex items-center gap-3">
                  <Package size={18} className="text-slate-400" />
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-200">{selectedItem.name}</p>
                    <p className="text-xs text-slate-400">{t('available')}: <span className="text-slate-900 dark:text-slate-200 font-semibold">{selectedItem.current} {selectedItem.unit}</span></p>
                  </div>
                </div>
              )}
              {/* Existing product with net-weight / size variants → remove stock per size */}
              {selectedHasSizes ? (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">{t('quantityRemove')} — {isColorSizeVariants(selectedExistingSizes) ? tv('byVariant') : tv('byWeight')}</label>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {Object.entries(selectedExistingSizes).filter(([, q]) => Number(q) > 0).map(([sz, q]) => (
                      <span key={sz} className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded">{sz}: {q} {t('available')}</span>
                    ))}
                  </div>
                  <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3">
                    {isColorSizeVariants(selectedExistingSizes) ? (
                      <ColorSizeVariantGrid
                        colors={colorsFromVariants(selectedExistingSizes)}
                        sizeChart={sizesFromVariants(selectedExistingSizes)}
                        value={addSizes}
                        onChange={v => { setAddSizes(v); setError(''); }}
                        unitLabel={selectedItem?.unit?.toLowerCase() || 'units'}
                        showSwatch={bizConfig.hasColors}
                      />
                    ) : (
                    <SizeVariantGrid
                      sizeChart={Object.keys(selectedExistingSizes).filter(sz => (selectedExistingSizes[sz] || 0) > 0)}
                      value={addSizes}
                      onChange={v => { setAddSizes(v); setError(''); }}
                      unitLabel={selectedItem?.unit?.toLowerCase() || 'units'}
                    />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2 text-center">
                    {t('remaining')} → <span className="text-red-400 font-semibold">{Math.max(0, selectedItem!.current - totalFromSizes(addSizes))} {selectedItem!.unit}</span>
                  </p>
                </div>
              ) : (
              <div>
                <label className="block text-xs text-slate-400 mb-1">{t('quantityRemove')}</label>
                <input type="number" min="1" max={selectedItem?.current} required className={inp} placeholder="0"
                  value={qty} onChange={e => { setQty(e.target.value); setError(''); }} />
                {selectedItem && qty && Number(qty) <= selectedItem.current && (
                  <p className="text-xs text-slate-500 mt-1">{t('remaining')}: <span className="text-red-400 font-semibold">{selectedItem.current - Number(qty)} {selectedItem.unit}</span></p>
                )}
              </div>
              )}
              <div>
                <label className="block text-xs text-slate-400 mb-1">{t('reason')}</label>
                <input className={inp} placeholder={t('reasonHint')} value={note} onChange={e => setNote(e.target.value)} />
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
            </div>

            {/* Sticky footer buttons */}
            <div className="flex gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex-shrink-0">
                <button type="button" onClick={closeModal} className="flex-1 bg-slate-50 dark:bg-slate-800 text-slate-300 py-2.5 rounded-xl font-medium hover:bg-slate-700 transition-colors">{t('cancel')}</button>
                <button type="submit" disabled={submitting} className="flex-1 bg-red-500 text-slate-900 dark:text-white py-2.5 rounded-xl font-bold hover:bg-red-400 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                  {submitting ? <Loader2 className="animate-spin" size={18} /> : null}
                  {submitting ? 'Updating...' : t('removeStock')}
                </button>
            </div>
            </form>
          </div>
        </div>
      )}

      {/* Permanent Delete Confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-red-500/30 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                <Trash2 size={18} className="text-red-400" />
              </div>
              <div>
                <p className="font-bold text-slate-900 dark:text-slate-100">{t('deleteTitle')}</p>
                <p className="text-sm text-slate-400 mt-0.5">{t('deleteWarning')}</p>
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg px-4 py-3 text-sm text-slate-900 dark:text-slate-200 font-medium">{deleteTarget.name}</div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 bg-slate-50 dark:bg-slate-800 text-slate-300 py-2.5 rounded-xl font-medium hover:bg-slate-700 transition-colors">{t('cancel')}</button>
              <button onClick={confirmDelete} className="flex-1 bg-red-500 text-slate-900 dark:text-white py-2.5 rounded-xl font-bold hover:bg-red-400 transition-colors">{t('deletePermanently')}</button>
            </div>
          </div>
        </div>
      )}
      </> /* end viewMode === 'all' */
      )}
    </div>
  );
}

function StatCard({ title, value, color }: { title: string; value: number; color: string }) {
  return (
    <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
      <CardContent className="p-6">
        <p className="text-sm text-slate-400 font-medium">{title}</p>
        <p className={cn('text-3xl font-black mt-1', color)}>{value}</p>
      </CardContent>
    </Card>
  );
}
