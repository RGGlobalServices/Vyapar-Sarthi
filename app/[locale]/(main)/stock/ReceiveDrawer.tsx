'use client';
import { useState, useEffect } from 'react';
import { X, Plus, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';

const fetcher = (url: string) => api.get(url).then(res => res.data);

export default function ReceiveDrawer({ 
  product, 
  godowns, 
  onClose,
  onSuccess
}: { 
  product: any, 
  godowns: any[], 
  onClose: () => void,
  onSuccess: () => void
}) {
  const t = useTranslations('Stock');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const { data: suppliersData = [], mutate: mutateSuppliers } = useSWR('/suppliers', fetcher);
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
      alert('Failed to add supplier: ' + (err.response?.data?.error || err.message));
    } finally {
      setIsSavingSupplier(false);
    }
  };
  
  const [form, setForm] = useState({
    warehouseId: '',
    supplierId: '',
    invoiceNumber: '',
    date: new Date().toISOString().split('T')[0],
    quantity: '',
    cost: product.wholesaleCost || '',
    batchNumber: '',
    expiryDate: ''
  });

  const handleReceive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.warehouseId || !form.supplierId || !form.quantity || !form.cost) {
      setError('Please fill all required fields.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await api.post('/purchases', {
        supplierId: form.supplierId,
        invoiceNumber: form.invoiceNumber,
        date: form.date,
        warehouseId: form.warehouseId,
        items: [{
          productId: product.id,
          quantity: Number(form.quantity),
          cost: Number(form.cost),
          batchNumber: form.batchNumber || undefined,
          expiryDate: form.expiryDate || undefined
        }]
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to receive stock');
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
                  placeholder="Enter supplier name..." 
                  value={newSupplierName}
                  onChange={e => setNewSupplierName(e.target.value)}
                  className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
                  disabled={isSavingSupplier}
                />
                <button type="button" onClick={saveNewSupplier} disabled={!newSupplierName || isSavingSupplier} className="px-3 bg-emerald-500 text-white rounded-lg font-bold flex items-center justify-center min-w-[60px] hover:bg-emerald-600 transition-colors">
                  {isSavingSupplier ? <Loader2 size={16} className="animate-spin" /> : 'Save'}
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
                  <option value="">{t('selectSupplier')}</option>
                  {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button type="button" onClick={() => setIsAddingSupplier(true)} className="px-3 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg font-bold hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors">+</button>
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-4">
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
                  placeholder="e.g. 100"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{product.baseUnit}</span>
              </div>
            </div>
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
