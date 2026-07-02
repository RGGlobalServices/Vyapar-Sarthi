'use client';
import { useState } from 'react';
import { X, ArrowRightLeft, Loader2, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { useTranslations } from 'next-intl';

export default function TransferDrawer({ 
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
  
  const [form, setForm] = useState({
    fromWarehouseId: '',
    toWarehouseId: '',
    quantity: '',
    reason: '',
    notes: ''
  });

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fromWarehouseId || !form.toWarehouseId || !form.quantity) {
      setError('Please fill all required fields.');
      return;
    }
    if (form.fromWarehouseId === form.toWarehouseId) {
      setError('Source and destination cannot be the same.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await api.post('/stock/transfer', {
        productId: product.id,
        ...form,
        quantity: Number(form.quantity)
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Transfer failed');
      setLoading(false);
    }
  };

  return (
    <div className="w-full lg:w-1/3 bg-white dark:bg-slate-900 lg:border border-slate-200 dark:border-slate-800 lg:rounded-xl shadow-xl flex flex-col transition-all animate-in slide-in-from-right-4 duration-300 h-full max-h-full z-30 absolute right-0">
      <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-blue-50 dark:bg-blue-900/20">
        <h2 className="text-lg font-bold text-blue-700 dark:text-blue-400 flex items-center gap-2">
          <ArrowRightLeft size={20} /> {t('transferStock')}
        </h2>
        <button onClick={onClose} className="text-blue-400 hover:text-blue-700 p-1 rounded-md transition-colors">
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

        <form id="transfer-form" onSubmit={handleTransfer} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('fromWarehouse')}</label>
            <select 
              required
              value={form.fromWarehouseId}
              onChange={e => setForm({...form, fromWarehouseId: e.target.value})}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{t('selectSource')}</option>
              {godowns.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('toWarehouse')}</label>
            <select 
              required
              value={form.toWarehouseId}
              onChange={e => setForm({...form, toWarehouseId: e.target.value})}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{t('selectDestination')}</option>
              {godowns.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('transferQuantity')}</label>
            <div className="relative">
              <input 
                required
                type="number"
                min="0.01"
                step="any"
                value={form.quantity}
                onChange={e => setForm({...form, quantity: e.target.value})}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. 50"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{product.baseUnit}</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('reasonOptional')}</label>
            <input 
              value={form.reason}
              onChange={e => setForm({...form, reason: e.target.value})}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:ring-2 focus:ring-blue-500"
              placeholder={t('transferReasonHint') || "e.g. Rebalancing stock"}
            />
          </div>
        </form>
      </div>

      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
        <button 
          form="transfer-form"
          type="submit" 
          disabled={loading}
          className="w-full py-2.5 bg-blue-500 text-white font-bold rounded-xl hover:bg-blue-600 transition-colors text-sm shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRightLeft size={16} />} 
          {t('confirmTransfer')}
        </button>
      </div>
    </div>
  );
}
