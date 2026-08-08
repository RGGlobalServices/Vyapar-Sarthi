'use client';
import { useState, useEffect } from 'react';
import { X, Plus, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';

import { useBusinessStore } from '@/lib/businessStore';
import { getBusinessConfig } from '@/lib/businessConfig';
const fetcher = (url: string | string[]) => {
  const target = Array.isArray(url) ? url[0] : url;
  return api.get(target).then(res => res.data);
};

export default function ReceiveDrawer({ 
  product, 
  godowns, 
  onClose,
  onSuccess
}: { 
  product: any, 
  godowns: any[], 
  onClose: () => void,
  onSuccess: (data?: any) => void
}) {
  const t = useTranslations('Stock');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const { activeShopId, profile } = useBusinessStore();
  const bizConfig = getBusinessConfig(profile.businessType);
  const { data: suppliersData = [], mutate: mutateSuppliers, isLoading: sLoad } = useSWR(activeShopId ? ['/suppliers', activeShopId] : null, fetcher);
  const suppliers = Array.isArray(suppliersData) ? suppliersData : [];
  
  const [isAddingSupplier, setIsAddingSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);

  const saveNewSupplier = async () => {
    if (!newSupplierName.trim()) return;
    setIsSavingSupplier(true);
    try {
      const { data } = await api.post('/suppliers', { name: newSupplierName.trim() });
      mutateSuppliers([data, ...suppliers], false);
      setForm({ ...form, supplierId: data.id });
      setIsAddingSupplier(false);
      setNewSupplierName('');
    } catch (err: any) {
      alert(t('failedToAddSupplier', { msg: err.response?.data?.error || err.message }));
    } finally {
      setIsSavingSupplier(false);
    }
  };
  
  const productVariants: any[] = Array.isArray(product.variants) ? product.variants : [];
  // Single Product (no variant rows) but still tagged with one colour —
  // nothing to split quantity across, but the shopkeeper should still see
  // which colour this stock is going toward instead of no colour info at all.
  const singleColour: string = Array.isArray(product.metadata?.colors)
    ? product.metadata.colors[0]
    : (product.metadata?.color || '');
  const [form, setForm] = useState({
    warehouseId: '',
    supplierId: '',
    invoiceNumber: '',
    date: new Date().toISOString().split('T')[0],
    quantity: '',
    // One qty per colour/size (keyed by the same composite/bare key used
    // everywhere else) — lets a single submission cover as many variants as
    // were actually delivered instead of one drawer-open per variant.
    variantQty: {} as Record<string, string>,
    cost: product.wholesaleCost || '',
    batchNumber: '',
    expiryDate: ''
  });

  const handleReceive = async (e: React.FormEvent) => {
    e.preventDefault();
    const hasVariants = productVariants.length > 0;
    const variantEntries = Object.entries(form.variantQty).filter(([, q]) => Number(q) > 0);

    if (!form.warehouseId || !form.supplierId || !form.cost) {
      setError(t('fillRequiredFields'));
      return;
    }
    if (hasVariants && variantEntries.length === 0) {
      setError(t('enterAtLeastOneVariantQty') || 'Enter a quantity for at least one colour/size.');
      return;
    }
    if (!hasVariants && !form.quantity) {
      setError(t('fillRequiredFields'));
      return;
    }

    setLoading(true);
    try {
      const items = hasVariants
        ? variantEntries.map(([variantKey, qty]) => ({
            productId: product.id,
            variant: variantKey,
            quantity: Number(qty),
            cost: Number(form.cost),
            batchNumber: form.batchNumber || undefined,
            expiryDate: form.expiryDate || undefined,
          }))
        : [{
            productId: product.id,
            variant: undefined,
            quantity: Number(form.quantity),
            cost: Number(form.cost),
            batchNumber: form.batchNumber || undefined,
            expiryDate: form.expiryDate || undefined,
          }];
      const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);

      await api.post('/purchases', {
        supplierId: form.supplierId,
        invoiceNumber: form.invoiceNumber,
        date: form.date,
        warehouseId: form.warehouseId,
        items,
      });

      onSuccess({
        type: 'receive',
        productId: product.id,
        quantity: totalQty,
        warehouseId: form.warehouseId
      });
      onClose();
    } catch (err: any) {
      console.error('[API Error] Receive:', err);
      setError(err.response?.data?.error || err.message || t('failedToReceiveStock'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full lg:w-1/3 bg-white dark:bg-slate-900 lg:border border-slate-200 dark:border-slate-800 lg:rounded-xl shadow-xl flex flex-col transition-all animate-in slide-in-from-right-4 duration-300 h-full max-h-full z-30 absolute right-0">
      <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-emerald-50 dark:bg-emerald-900/20">
        <h2 className="text-lg font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
          <Plus size={20} /> {t('receiveStock')}
        </h2>
        <button onClick={onClose} className="text-emerald-400 hover:text-emerald-700 p-1 rounded-md transition-colors">
          <X size={20} />
        </button>
      </div>

      <div className="p-5 flex-1 overflow-y-auto">
        <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
          <p className="text-sm font-bold text-slate-900 dark:text-white">{product.name}</p>
          <p className="text-xs text-slate-500 mt-1">{t('barcode') || 'Barcode'}: {product.barcode || product.sku}</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg border border-red-200 flex items-center gap-2 text-sm">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <form id="receive-form" onSubmit={handleReceive} className="space-y-4">
          {productVariants.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                {t('quantityPerVariant') || 'Quantity per Colour/Size'} *
              </label>
              <p className="text-[11px] text-slate-400 mb-2">{t('quantityPerVariantHint') || "Enter how many you're receiving of each — leave the rest blank."}</p>
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {productVariants.map((v: any, vi: number) => {
                  const key = v.color ? `${v.color} / ${v.size || ''}` : (v.size || '');
                  const label = [v.color, v.size].filter(Boolean).join(' / ') || key || `#${vi + 1}`;
                  return (
                    <div key={key || vi} className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                      {v.color && <span className="w-3 h-3 rounded-full border border-slate-400 shrink-0" style={{ backgroundColor: v.color.toLowerCase() }} />}
                      <span className="flex-1 text-sm text-slate-700 dark:text-slate-200 truncate">{label}</span>
                      {typeof v.stock === 'number' && <span className="text-[10px] text-slate-400 shrink-0">{v.stock} {t('inStock') || 'in stock'}</span>}
                      <input
                        type="number" min="0" step="any" placeholder="0"
                        value={form.variantQty[key] || ''}
                        onChange={e => setForm({ ...form, variantQty: { ...form.variantQty, [key]: e.target.value } })}
                        className="w-16 shrink-0 px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-right focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {productVariants.length === 0 && singleColour && (
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                {t('colour') || 'Colour'} <span className="normal-case font-medium text-slate-400 tracking-normal">— chosen when this product was created</span>
              </label>
              {/* Read-only echo of the same colour-chip picker used on the product
                  form, so the one that was actually chosen (highlighted, same as
                  there) is unmistakable — a plain swatch dot is invisible for
                  colours like White against this light background. */}
              <div className="flex flex-wrap gap-2">
                {(bizConfig.colorChart && bizConfig.colorChart.includes(singleColour) ? bizConfig.colorChart : [singleColour, ...(bizConfig.colorChart || [])]).map(col => {
                  const active = col === singleColour;
                  return (
                    <div
                      key={col}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold',
                        active
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 opacity-50'
                      )}
                    >
                      <span className="w-3 h-3 rounded-full border border-slate-400 shrink-0" style={{ backgroundColor: col.toLowerCase() }} />
                      {col}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('warehouse')} *</label>
            <select 
              required
              value={form.warehouseId}
              onChange={e => setForm({...form, warehouseId: e.target.value})}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">{t('selectWarehouse')}</option>
              {godowns.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('supplier')} *</label>
            {isAddingSupplier ? (
              <div className="flex gap-2">
                <input 
                  type="text" 
                  autoFocus
                  placeholder={t('enterSupplierNamePlaceholder')}
                  value={newSupplierName}
                  onChange={e => setNewSupplierName(e.target.value)}
                  className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
                  disabled={isSavingSupplier}
                />
                <button type="button" onClick={saveNewSupplier} disabled={!newSupplierName || isSavingSupplier} className="px-3 bg-emerald-500 text-white rounded-lg font-bold flex items-center justify-center min-w-[60px] hover:bg-emerald-600 transition-colors">
                  {isSavingSupplier ? <Loader2 size={16} className="animate-spin" /> : t('saveBtn')}
                </button>
                <button type="button" onClick={() => setIsAddingSupplier(false)} disabled={isSavingSupplier} className="px-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <select 
                  required
                  value={form.supplierId}
                  onChange={e => setForm({...form, supplierId: e.target.value})}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">{sLoad ? t('loadingSuppliers') : t('selectSupplier')}</option>
                  {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button type="button" onClick={() => setIsAddingSupplier(true)} className="px-3 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg font-bold hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors">+</button>
              </div>
            )}
          </div>
          
          <div className={cn("grid gap-4", productVariants.length > 0 ? "grid-cols-1" : "grid-cols-2")}>
            {productVariants.length === 0 && (
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('quantityRequired')}</label>
                <div className="relative">
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="any"
                    value={form.quantity}
                    onChange={e => setForm({...form, quantity: e.target.value})}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:ring-2 focus:ring-emerald-500"
                    placeholder={t('quantityPlaceholder')}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{product.baseUnit}</span>
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('unitCostRequired')}</label>
              <input
                required
                type="number"
                step="any"
                min="0"
                value={form.cost}
                onChange={e => setForm({...form, cost: e.target.value})}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('invoiceNumber')}</label>
              <input 
                value={form.invoiceNumber}
                onChange={e => setForm({...form, invoiceNumber: e.target.value})}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:ring-2 focus:ring-emerald-500"
                placeholder={t('optionalHint')}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('dateRequired')}</label>
              <input 
                type="date"
                required
                value={form.date}
                onChange={e => setForm({...form, date: e.target.value})}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('batchLot')}</label>
              <input 
                value={form.batchNumber}
                onChange={e => setForm({...form, batchNumber: e.target.value})}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:ring-2 focus:ring-emerald-500"
                placeholder={t('optionalHint')}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('expiryDateTitle')}</label>
              <input 
                type="date"
                value={form.expiryDate}
                onChange={e => setForm({...form, expiryDate: e.target.value})}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
        </form>
      </div>

      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
        <button 
          form="receive-form"
          type="submit" 
          disabled={loading}
          className="w-full py-2.5 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 transition-colors text-sm shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} 
          {t('receiveStock')}
        </button>
      </div>
    </div>
  );
}
