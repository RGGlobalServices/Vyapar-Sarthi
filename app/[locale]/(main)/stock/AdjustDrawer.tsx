'use client';
import { useState } from 'react';
import { X, Edit, Loader2, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { useTranslations } from 'next-intl';

export default function AdjustDrawer({ 
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
  
  const [form, setForm] = useState({
    warehouseId: '',
    difference: '',
    reason: 'Physical Count',
    notes: ''
  });

  const reasons = [
    { value: 'Physical Count', label: t('physicalCount') || 'Physical Count' },
    { value: 'Damaged', label: t('damaged') || 'Damaged' },
    { value: 'Expired', label: t('expired') || 'Expired' },
    { value: 'Theft', label: t('theft') || 'Theft' },
    { value: 'Lost', label: t('lost') || 'Lost' },
    { value: 'Opening Balance', label: t('openingBalance') || 'Opening Balance' }
  ];

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.warehouseId || !form.difference) {
      setError('Please fill all required fields.');
      return;
    }

    // Fire and forget so UI closes instantly
    api.post('/stock/adjust', {
      productId: product.id,
      warehouseId: form.warehouseId,
      difference: Number(form.difference),
      reason: form.reason,
      notes: form.notes
    }).catch(err => {
      console.error('[API Error] Adjust:', err);
    });

    onSuccess({
      type: 'adjust',
      productId: product.id,
      quantity: Number(form.difference),
      warehouseId: form.warehouseId
    });
    onClose();
  };

  return (
    <div className="w-full lg:w-1/3 bg-white dark:bg-slate-900 lg:border border-slate-200 dark:border-slate-800 lg:rounded-xl shadow-xl flex flex-col transition-all animate-in slide-in-from-right-4 duration-300 h-full max-h-full z-30 absolute right-0">
      <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
          <Edit size={20} /> {t('adjustStock')}
        </h2>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 rounded-md transition-colors">
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

        <form id="adjust-form" onSubmit={handleAdjust} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('warehouse')} *</label>
            <select 
              required
              value={form.warehouseId}
              onChange={e => setForm({...form, warehouseId: e.target.value})}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:ring-2 focus:ring-slate-500"
            >
              <option value="">{t('selectWarehouse')}</option>
              {godowns.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('adjustmentDifference')}</label>
            <p className="text-[10px] text-slate-400 mb-2">{t('adjustmentHint')}</p>
            <div className="relative">
              <input 
                required
                type="number"
                step="any"
                value={form.difference}
                onChange={e => setForm({...form, difference: e.target.value})}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:ring-2 focus:ring-slate-500 font-mono font-bold"
                placeholder="-5 or +10"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{product.baseUnit}</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('reasonRequired')}</label>
            <select 
              required
              value={form.reason}
              onChange={e => setForm({...form, reason: e.target.value})}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:ring-2 focus:ring-slate-500"
            >
              {reasons.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('notesOptional')}</label>
            <textarea 
              value={form.notes}
              onChange={e => setForm({...form, notes: e.target.value})}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:ring-2 focus:ring-slate-500 min-h-[80px]"
              placeholder={t('notesPlaceholder') || "Detailed explanation..."}
            />
          </div>
        </form>
      </div>

      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
        <button 
          form="adjust-form"
          type="submit" 
          disabled={loading}
          className="w-full py-2.5 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-700 transition-colors text-sm shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Edit size={16} />} 
          {t('confirmAdjustment')}
        </button>
      </div>
    </div>
  );
}
