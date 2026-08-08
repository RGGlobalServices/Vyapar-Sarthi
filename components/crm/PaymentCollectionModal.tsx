'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { IndianRupee, X, CheckCircle2, CreditCard, Landmark, Wallet, Phone } from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '@/lib/api';

export default function PaymentCollectionModal({
  entityId,
  entityType,
  entityName,
  outstanding,
  onClose,
  onSuccess
}: {
  entityId: string;
  entityType: 'customer' | 'party' | 'supplier';
  entityName: string;
  outstanding: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const t = useTranslations('PaymentCollectionModal');
  const [amount, setAmount] = useState(outstanding.toString());
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(amount);
    if (!val || val <= 0) return toast.error(t('enterValidAmount'));

    setLoading(true);
    try {
      await api.post('/crm/payments', { entityId, entityType, amount: val, paymentMode, note });
      toast.success(t('paymentRecordedSuccess'));
      onSuccess();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || e.response?.data?.error || e.message || t('paymentFailed'));
    } finally {
      setLoading(false);
    }
  };

  const modes = [
    { name: 'Cash', label: t('cashMode'), icon: IndianRupee },
    { name: 'UPI', label: t('upiMode'), icon: Phone },
    { name: 'Card', label: t('cardMode'), icon: CreditCard },
    { name: 'Bank Transfer', label: t('bankTransferMode'), icon: Landmark },
    { name: 'Cheque', label: t('chequeMode'), icon: Wallet },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md max-h-[90vh] rounded-2xl shadow-xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">

        {/* Header — stays pinned; the form below scrolls independently */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 flex items-center justify-center">
                <IndianRupee size={16} />
              </span>
              {t('recordPaymentTitle')}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {t('forEntity', { name: entityName })}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto">
          <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/30 rounded-xl p-4 flex justify-between items-center">
            <span className="text-sm font-medium text-orange-800 dark:text-orange-300">{t('totalOutstanding')}</span>
            <span className="text-xl font-black text-orange-700 dark:text-orange-400">₹{outstanding.toLocaleString()}</span>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{t('amountToReceive')}</label>
            <input 
              type="number"
              required
              min="0.01"
              step="0.01"
              max={outstanding > 0 ? outstanding : undefined}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full h-12 px-4 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
            />
            <div className="flex gap-2 mt-2">
              <button type="button" onClick={() => setAmount(outstanding.toString())} className="text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-3 py-1 rounded-full font-medium transition-colors">{t('fullPayment')}</button>
              <button type="button" onClick={() => setAmount((outstanding/2).toString())} className="text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-3 py-1 rounded-full font-medium transition-colors">{t('partial50')}</button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{t('paymentModeLabel')}</label>
            <div className="grid grid-cols-3 gap-2">
              {modes.map(m => (
                <button
                  key={m.name}
                  type="button"
                  onClick={() => setPaymentMode(m.name)}
                  className={`flex flex-col items-center justify-center gap-1 p-2 rounded-xl border text-xs font-medium transition-all ${
                    paymentMode === m.name 
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 ring-1 ring-emerald-500' 
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-emerald-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <m.icon size={16} />
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{t('noteOptionalLabel')}</label>
            <input
              type="text"
              placeholder={t('notePlaceholder')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full h-10 px-3 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-70"
          >
            {loading ? <span className="animate-spin text-xl">◌</span> : <CheckCircle2 size={20} />}
            {loading ? t('recording') : t('recordPaymentOf', { amount: parseFloat(amount) || 0 })}
          </button>
        </form>
      </div>
    </div>
  );
}
