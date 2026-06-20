'use client';
import { useState, useMemo, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { translateData } from '@/lib/translateData';
import SmartTranslator from '@/components/SmartTranslator';
import ExpiryDateField from '@/components/ExpiryDateField';
import SizeVariantGrid, { serializeSizeVariants, totalFromSizes } from '@/components/SizeVariantGrid';
import {
  Search, ArrowDownLeft, ArrowUpRight, AlertTriangle,
  Plus, Trash2, X, Check, Package, Archive, ArchiveRestore,
  Pencil, ShieldCheck, Trash, Loader2, Warehouse, Store, MapPin,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStockStore, StockItem } from '@/lib/store';
import { useBusinessStore } from '@/lib/businessStore';
import api from '@/lib/api';
import { getBusinessConfig } from '@/lib/businessConfig';

function getStatus(item: StockItem) {
  if (item.current === 0) return 'out';
  if (item.current <= item.min) return 'low';
  return 'ok';
}

const cellInp = 'bg-slate-700 border border-slate-600 rounded px-2 py-1 text-slate-100 text-sm w-full focus:outline-none focus:ring-1 focus:ring-emerald-500';

export default function StockPage() {
  const t  = useTranslations('Stock');
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

  // Inline stock-count edit (click the number directly in the table)
  const [inlineStockId, setInlineStockId] = useState<number | string | null>(null);
  const [inlineStockVal, setInlineStockVal] = useState('');

  // Metadata edit modal (pencil button → name / category / unit / min only)
  const [editModal, setEditModal] = useState<{
    item: StockItem;
    name: string;
    category: string;
    unit: string;
    min: string;
    submitting: boolean;
  } | null>(null);

  const [modal, setModal]     = useState<'in' | 'out' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isNew, setIsNew]     = useState(false);
  const [selId, setSelId]     = useState<number | string | ''>('');
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

  const activeItems = useMemo(() => items.filter(i => !i.archived &&
    (selectedCategory === 'All' || i.category === selectedCategory) &&
    (i.name.toLowerCase().includes(search.toLowerCase()) || i.category.toLowerCase().includes(search.toLowerCase()))
  ), [items, search, selectedCategory]);

  const archivedItems = useMemo(() => items.filter(i => i.archived &&
    (selectedCategory === 'All' || i.category === selectedCategory) &&
    (i.name.toLowerCase().includes(search.toLowerCase()) || i.category.toLowerCase().includes(search.toLowerCase()))
  ), [items, search, selectedCategory]);

  const stats = useMemo(() => ({
    total:      items.filter(i => !i.archived).length,
    lowStock:   items.filter(i => !i.archived && i.current > 0 && i.current <= i.min).length,
    outOfStock: items.filter(i => !i.archived && i.current === 0).length,
  }), [items]);

  // Inline stock edit helpers
  function startInlineStock(item: StockItem) {
    setInlineStockId(item.id);
    setInlineStockVal(String(item.current));
  }
  async function commitInlineStock(item: StockItem) {
    const next = parseInt(inlineStockVal, 10);
    setInlineStockId(null);
    if (isNaN(next) || next < 0 || next === item.current) return;
    await adjustStock(item.id, next - item.current, t('manualEdit'));
  }
  function cancelInlineStock() { setInlineStockId(null); }

  // Metadata edit modal (pencil → name / category / unit / min only)
  function openEditModal(item: StockItem) {
    setMenuId(null);
    setEditModal({ item, name: item.name, category: item.category, unit: item.unit, min: String(item.min ?? 0), submitting: false });
  }
  async function saveEditModal() {
    if (!editModal) return;
    setEditModal(m => m ? { ...m, submitting: true } : m);
    const { item, name, category, unit, min } = editModal;
    try {
      const updates: Partial<StockItem> = {};
      if (name.trim() !== item.name) updates.name = name.trim();
      if (category.trim() !== item.category) updates.category = category.trim();
      if (unit.trim() !== item.unit) updates.unit = unit.trim();
      if (Number(min) !== item.min) updates.min = Number(min);
      if (Object.keys(updates).length > 0) await updateItem(item.id, updates);
      setEditModal(null);
    } catch {
      setEditModal(m => m ? { ...m, submitting: false } : m);
    }
  }
  function permanentDelete(item: StockItem) { setDeleteTarget(item); setMenuId(null); }
  function confirmDelete() { if (!deleteTarget) return; removeItem(deleteTarget.id); setDeleteTarget(null); }

  function openModal(type: 'in' | 'out') {
    setModal(type); setIsNew(false); setSelId(''); setQty('');
    setNote('');
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

  async function handleStockIn(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const q = bizConfig.hasSizes ? totalFromSizes(newForm.size_variants) : Number(qty);
    if (isNew) {
      if (!newForm.name.trim()) { setError(t('nameRequired') ?? 'Name required'); setSubmitting(false); return; }
      if (!bizConfig.hasSizes && (!q || q <= 0)) { setError(t('validAmount') ?? 'Enter a valid quantity.'); setSubmitting(false); return; }
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
          size_variants: bizConfig.hasSizes ? serializeSizeVariants(newForm.size_variants) : null,
        });
        closeModal();
      } catch (err: any) {
        const msg = err?.response?.data?.detail || err?.response?.data?.message || 'Failed to add product. Please try again.';
        setError(typeof msg === 'string' ? msg : 'Failed to add product. Please try again.');
      } finally { setSubmitting(false); }
    } else {
      if (selId === '') { setError(t('selectProduct')); setSubmitting(false); return; }
      if (!Number(qty) || Number(qty) <= 0) { setError(t('validAmount') ?? 'Enter a valid quantity.'); setSubmitting(false); return; }
      try {
        await adjustStock(selId, Number(qty), note, {
          mrp: pricing.mrp ? Number(pricing.mrp) : undefined,
          sellingPrice: pricing.selling ? Number(pricing.selling) : undefined,
          cost: pricing.cost ? Number(pricing.cost) : undefined,
        });
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
    const q = Number(qty);
    if (!q || q <= 0) { setError(t('validAmount') ?? 'Enter a valid quantity.'); setSubmitting(false); return; }
    const item = items.find(i => i.id === selId)!;
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
  const inp = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';

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

  function renderRows(rows: StockItem[]) {
    return rows.map(item => {
      const status = getStatus(item);
      return (
        <tr key={item.id} className={cn('group text-slate-200 hover:bg-slate-800/40 transition-all duration-200', item.archived && 'opacity-60')}>
          <td className="px-6 py-4 font-medium"><SmartTranslator text={item.name} locale={locale} /></td>
          <td className="px-6 py-4 text-sm text-slate-400"><SmartTranslator text={item.category} locale={locale} /></td>
          <td className="px-6 py-4">
            {inlineStockId === item.id ? (
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <button
                  onMouseDown={e => { e.preventDefault(); setInlineStockVal(v => String(Math.max(0, Number(v) - 1))); }}
                  className="w-7 h-7 rounded-full bg-slate-700 hover:bg-red-500/20 hover:text-red-400 text-slate-300 font-bold text-base flex items-center justify-center transition-colors select-none"
                >−</button>
                <input
                  type="number" min="0"
                  value={inlineStockVal}
                  onChange={e => setInlineStockVal(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitInlineStock(item);
                    if (e.key === 'Escape') cancelInlineStock();
                  }}
                  onBlur={() => commitInlineStock(item)}
                  onFocus={e => e.target.select()}
                  autoFocus
                  className="w-16 text-center bg-slate-900 border-2 border-emerald-500 rounded-lg py-1 text-emerald-400 font-bold text-sm focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  onMouseDown={e => { e.preventDefault(); setInlineStockVal(v => String(Number(v) + 1)); }}
                  className="w-7 h-7 rounded-full bg-slate-700 hover:bg-emerald-500/20 hover:text-emerald-400 text-slate-300 font-bold text-base flex items-center justify-center transition-colors select-none"
                >+</button>
              </div>
            ) : (
              <button
                onClick={() => startInlineStock(item)}
                className="font-bold text-slate-100 hover:text-emerald-400 px-2 py-1 rounded-lg hover:bg-emerald-500/10 transition-all cursor-pointer tabular-nums"
                title="Click to edit stock"
              >
                {item.current}
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
            <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => openEditModal(item)}
                title={t('editRow')}
                className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-emerald-500/20 hover:text-emerald-400 transition-all active:scale-90 border border-slate-700/50">
                <Pencil size={14} />
              </button>

              <button
                onClick={() => toggleArchive(item.id)}
                title={item.archived ? t('unarchive') : t('archive')}
                className={cn(
                  "p-2 rounded-lg bg-slate-800 transition-all active:scale-90 border border-slate-700/50",
                  item.archived
                    ? "text-blue-400 hover:bg-blue-500/20 hover:text-blue-300"
                    : "text-amber-400 hover:bg-amber-500/20 hover:text-amber-300"
                )}>
                {item.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
              </button>

              <button 
                onClick={() => permanentDelete(item)}
                title={t('deletePermanently')}
                className="p-2 rounded-lg bg-slate-800 text-slate-500 hover:bg-red-500/20 hover:text-red-400 transition-all active:scale-90 border border-slate-700/50">
                <Trash2 size={14} />
              </button>
            </div>
          </td>
        </tr>
      );
    });
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
      <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
        {[
          { key: 'all', label: 'All Stock', icon: Package },
          ...(isWholesale ? [{ key: 'godown', label: 'By Godown', icon: Warehouse }] : []),
          ...(allShops.length > 1 ? [{ key: 'shop', label: 'By Shop', icon: Store }] : []),
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setViewMode(key as any)}
            className={cn('flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all',
              viewMode === key ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300')}>
            <Icon size={15} />{label}
          </button>
        ))}
      </div>

      {/* ── Godown Stock view ── */}
      {viewMode === 'godown' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <select
              className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 min-w-[220px]"
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
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
              <Warehouse className="w-12 h-12 mx-auto mb-3 text-slate-600" />
              <p className="text-slate-400 text-sm">Select a godown to view stock levels</p>
            </div>
          ) : loadingGodown ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-emerald-400" size={28} /></div>
          ) : !godownData || (godownData.inventory || []).length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
              <Package className="w-12 h-12 mx-auto mb-3 text-slate-600" />
              <p className="text-slate-400 text-sm">No products in this godown yet</p>
            </div>
          ) : (
            <Card className="bg-slate-900 border-slate-800 overflow-hidden">
              <CardContent className="p-0">
                <div className="px-5 py-3 border-b border-slate-800 flex items-center gap-2">
                  <Warehouse size={15} className="text-emerald-400" />
                  <span className="text-sm font-semibold text-slate-200">{godownData.name}</span>
                  <span className="ml-auto text-xs font-mono text-slate-500">{godownData.godownCode || godownData.godown_code}</span>
                  <span className="text-xs text-slate-500">{(godownData.inventory || []).length} products</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-800/50 text-slate-400 text-xs uppercase">
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
                    <tbody className="divide-y divide-slate-800">
                      {(godownData.inventory || []).map((item: any) => {
                        const p = item.product;
                        const shopItem = items.find(i => String(i.id) === String(item.productId || item.product_id));
                        const status = shopItem ? getStatus(shopItem) : null;
                        return (
                          <tr key={item.id} className="text-slate-200 hover:bg-slate-800/30 transition-colors">
                            <td className="px-5 py-3 font-medium">{p?.name}</td>
                            <td className="px-5 py-3 text-slate-400">{p?.category}</td>
                            <td className="px-5 py-3">
                              <span className="text-emerald-400 font-bold text-base">{item.quantity}</span>
                            </td>
                            <td className="px-5 py-3">
                              {shopItem ? (
                                <span className={cn('font-semibold', status === 'out' ? 'text-red-400' : status === 'low' ? 'text-orange-400' : 'text-slate-200')}>
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
                    isActive ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700')}>
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
            className="w-full bg-slate-900 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        
        <div className="relative flex-1">
          <select 
            className="w-full bg-slate-900 border border-slate-800 rounded-xl py-3 px-4 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 appearance-none cursor-pointer"
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
          >
            <option value="All">{String(t('allCategories') || 'All Categories')}</option>
            {bizConfig.defaultCategories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
            <ArrowDownLeft size={16} className="rotate-[-45deg]" />
          </div>
        </div>

        <button onClick={() => setShowArchived(v => !v)}
          className={cn('px-6 py-2 rounded-xl border text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap',
            showArchived ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200')}>
          <Archive size={16} />
          {showArchived ? t('hideArchived') : t('archive')}
          {items.filter(i => i.archived).length > 0 && (
            <span className="bg-amber-500/20 text-amber-400 text-xs px-1.5 rounded-full">{items.filter(i => i.archived).length}</span>
          )}
        </button>
      </div>

      {/* Active Table */}
      <Card className="bg-slate-900 border-slate-800 overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-800/50 text-slate-400 text-xs uppercase">
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
              <tbody className="divide-y divide-slate-800" onClick={e => e.stopPropagation()}>
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
        <Card className="bg-slate-900 border-slate-800 overflow-hidden">
          <CardContent className="p-0">
            <div className="px-6 py-3 border-b border-slate-800 flex items-center gap-2 text-amber-400 text-sm font-semibold">
              <Archive size={15} />{t('archivedProducts')}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-800/50 text-slate-400 text-xs uppercase">
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
                <tbody className="divide-y divide-slate-800" onClick={e => e.stopPropagation()}>
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
        <Card className="bg-slate-900 border-slate-800">
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

      {/* ── Edit Product Details Modal (pencil button) ── */}
      {editModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setEditModal(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xs shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <h2 className="text-sm font-bold text-slate-100 truncate pr-4">Edit — {editModal.item.name}</h2>
              <button onClick={() => setEditModal(null)} className="text-slate-400 hover:text-slate-200 shrink-0"><X size={18} /></button>
            </div>
            <div className="p-5 grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-[11px] text-slate-500 mb-1 block">Product Name</label>
                <input autoFocus className={inp} value={editModal.name} onChange={e => setEditModal(m => m ? { ...m, name: e.target.value } : m)} onKeyDown={e => e.key === 'Enter' && saveEditModal()} />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 mb-1 block">Category</label>
                <input className={inp} value={editModal.category} onChange={e => setEditModal(m => m ? { ...m, category: e.target.value } : m)} onKeyDown={e => e.key === 'Enter' && saveEditModal()} />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 mb-1 block">Unit</label>
                <input className={inp} value={editModal.unit} onChange={e => setEditModal(m => m ? { ...m, unit: e.target.value } : m)} onKeyDown={e => e.key === 'Enter' && saveEditModal()} />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] text-slate-500 mb-1 block">Min Stock Level</label>
                <input type="number" min="0" className={inp} value={editModal.min} onChange={e => setEditModal(m => m ? { ...m, min: e.target.value } : m)} onKeyDown={e => e.key === 'Enter' && saveEditModal()} />
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => setEditModal(null)} className="flex-1 py-2.5 bg-slate-800 rounded-xl text-slate-300 text-sm font-semibold hover:bg-slate-700 transition-colors">Cancel</button>
              <button onClick={saveEditModal} disabled={editModal.submitting}
                className="flex-1 py-2.5 bg-emerald-500 text-slate-900 rounded-xl text-sm font-bold hover:bg-emerald-400 transition-colors active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2">
                {editModal.submitting ? <><Loader2 size={14} className="animate-spin" />Saving…</> : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stock In Modal */}
      {modal === 'in' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
            {/* Sticky header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 flex-shrink-0">
              <div className="flex items-center gap-2"><ArrowDownLeft size={18} className="text-emerald-400" /><h2 className="text-lg font-bold text-slate-100">{t('stockIn')}</h2></div>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-200"><X size={20} /></button>
            </div>
            <form onSubmit={handleStockIn} className="flex flex-col flex-1 min-h-0">
            <div className="overflow-y-auto flex-1 p-6 space-y-4">
              <div className="flex rounded-lg overflow-hidden border border-slate-700">
                <button type="button" onClick={() => { setIsNew(false); setError(''); }}
                  className={cn('flex-1 py-2 text-sm font-medium transition-colors', !isNew ? 'bg-emerald-500 text-slate-900' : 'bg-slate-800 text-slate-400 hover:text-slate-200')}>
                  {t('existingProduct')}
                </button>
                <button type="button" onClick={() => { setIsNew(true); setError(''); }}
                  className={cn('flex-1 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-1', isNew ? 'bg-emerald-500 text-slate-900' : 'bg-slate-800 text-slate-400 hover:text-slate-200')}>
                  <Plus size={14} />{t('newProduct')}
                </button>
              </div>
              {!isNew ? (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">{t('selectProduct')}</label>
                  <select className={inp} value={selId} onChange={e => { setSelId(e.target.value); setError(''); setQty(''); }}>
                    <option value="">{t('chooseProduct')}</option>
                    {items.filter(i => !i.archived).map(i => (
                      <option key={i.id} value={i.id}>{i.name} ({t('colCurrentStock')}: {i.current} {i.unit})</option>
                    ))}
                  </select>
                </div>
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
                        {bizConfig.defaultCategories.map(cat => <option key={cat} value={cat} />)}
                      </datalist>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">{t('unit')}</label>
                      <select className={inp} value={newForm.unit} onChange={e => setNewForm(f => ({ ...f, unit: e.target.value }))}>
                        {bizConfig.defaultUnits.map(u => <option key={u} value={u}>{u}</option>)}
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

                  {/* Size Inventory — shoes / clothes */}
                  {bizConfig.hasSizes && bizConfig.sizeChart && (
                    <div className="bg-violet-500/5 border border-violet-500/20 rounded-xl p-3 space-y-2">
                      <p className="text-[10px] font-bold text-violet-400 uppercase tracking-wider">Size Inventory <span className="text-slate-500 normal-case font-normal">(qty per size)</span></p>
                      <SizeVariantGrid
                        sizeChart={bizConfig.sizeChart}
                        value={newForm.size_variants}
                        onChange={variants => setNewForm(f => ({ ...f, size_variants: variants }))}
                      />
                    </div>
                  )}

                  {/* Min stock (always shown) */}
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">{t('minLevel')}{bizConfig.hasSizes ? ' (Total)' : ''}</label>
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
              {!(isNew && bizConfig.hasSizes) && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">{t('quantityAdd')}</label>
                  <input type="number" min="1" required={!isNew || !bizConfig.hasSizes} className={inp} placeholder="0" value={qty} onChange={e => { setQty(e.target.value); setError(''); }} />
                  {!isNew && selectedItem && qty && (
                    <p className="text-xs text-slate-500 mt-1">{t('newStockWill')}: <span className="text-emerald-400 font-semibold">{selectedItem.current + Number(qty)} {selectedItem.unit}</span></p>
                  )}
                </div>
              )}
              {isNew && bizConfig.hasSizes && (
                <p className="text-xs text-slate-500 text-center">Total qty is auto-calculated from size grid above</p>
              )}
              <div>
                <label className="block text-xs text-slate-400 mb-1">{t('note')}</label>
                <input className={inp} placeholder={t('noteHint')} value={note} onChange={e => setNote(e.target.value)} />
              </div>

              {/* Pricing Update Section */}
              <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/50 space-y-3">
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
            <div className="flex gap-3 px-6 py-4 border-t border-slate-800 flex-shrink-0">
              <button type="button" onClick={closeModal}
                className="flex-1 bg-slate-800 text-slate-400 py-3 rounded-xl font-semibold hover:bg-slate-700 hover:text-slate-200 transition-all active:scale-95">
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
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2"><ArrowUpRight size={18} className="text-red-400" /><h2 className="text-lg font-bold text-slate-100">{t('stockOut')}</h2></div>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-200"><X size={20} /></button>
            </div>
            <form onSubmit={handleStockOut} className="p-6 space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">{t('selectProduct')}</label>
                <select className={inp} value={selId} onChange={e => { setSelId(e.target.value); setError(''); setQty(''); }}>
                  <option value="">{t('chooseProduct')}</option>
                  {items.filter(i => !i.archived && i.current > 0).map(i => (
                    <option key={i.id} value={i.id}>{i.name} ({t('available')}: {i.current} {i.unit})</option>
                  ))}
                </select>
                {items.filter(i => !i.archived && i.current > 0).length === 0 && (
                  <p className="text-xs text-red-400 mt-1">{t('allOutOfStock')}</p>
                )}
              </div>
              {selectedItem && (
                <div className="bg-slate-800 rounded-lg px-4 py-3 flex items-center gap-3">
                  <Package size={18} className="text-slate-400" />
                  <div>
                    <p className="text-sm font-medium text-slate-200">{selectedItem.name}</p>
                    <p className="text-xs text-slate-400">{t('available')}: <span className="text-slate-200 font-semibold">{selectedItem.current} {selectedItem.unit}</span></p>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs text-slate-400 mb-1">{t('quantityRemove')}</label>
                <input type="number" min="1" max={selectedItem?.current} required className={inp} placeholder="0"
                  value={qty} onChange={e => { setQty(e.target.value); setError(''); }} />
                {selectedItem && qty && Number(qty) <= selectedItem.current && (
                  <p className="text-xs text-slate-500 mt-1">{t('remaining')}: <span className="text-red-400 font-semibold">{selectedItem.current - Number(qty)} {selectedItem.unit}</span></p>
                )}
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">{t('reason')}</label>
                <input className={inp} placeholder={t('reasonHint')} value={note} onChange={e => setNote(e.target.value)} />
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeModal} className="flex-1 bg-slate-800 text-slate-300 py-2.5 rounded-xl font-medium hover:bg-slate-700 transition-colors">{t('cancel')}</button>
                <button type="submit" disabled={submitting} className="flex-1 bg-red-500 text-white py-2.5 rounded-xl font-bold hover:bg-red-400 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
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
          <div className="bg-slate-900 border border-red-500/30 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                <Trash2 size={18} className="text-red-400" />
              </div>
              <div>
                <p className="font-bold text-slate-100">{t('deleteTitle')}</p>
                <p className="text-sm text-slate-400 mt-0.5">{t('deleteWarning')}</p>
              </div>
            </div>
            <div className="bg-slate-800 rounded-lg px-4 py-3 text-sm text-slate-200 font-medium">{deleteTarget.name}</div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 bg-slate-800 text-slate-300 py-2.5 rounded-xl font-medium hover:bg-slate-700 transition-colors">{t('cancel')}</button>
              <button onClick={confirmDelete} className="flex-1 bg-red-500 text-white py-2.5 rounded-xl font-bold hover:bg-red-400 transition-colors">{t('deletePermanently')}</button>
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
    <Card className="bg-slate-900 border-slate-800">
      <CardContent className="p-6">
        <p className="text-sm text-slate-400 font-medium">{title}</p>
        <p className={cn('text-3xl font-black mt-1', color)}>{value}</p>
      </CardContent>
    </Card>
  );
}
