'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Wheat, ShoppingBag, X } from 'lucide-react';
import api from '@/lib/api';
import ModalPortal from '@/components/mill/ModalPortal';
import { stateFromGstin } from '@/lib/indiaStates';

/**
 * "Add new party" straight from the billing checkout (Bada Udyog).
 * Asks the user whether it's a Farmer/Supplier (customerType=party)
 * or a Customer/Trader (customerType=customer), then saves accordingly.
 */
const inp = 'w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 focus:ring-2 focus:ring-emerald-500 outline-none';
const lab = 'block text-[11px] font-bold uppercase text-slate-500 mb-1';

type PartyKind = 'farmer' | 'customer' | null;

export default function QuickAddPartyModal({ initialName, onClose, onCreated }: { initialName?: string; onClose: () => void; onCreated: (party: any) => void }) {
  const t = useTranslations('QuickAddParty');
  const [kind, setKind] = useState<PartyKind>(null);
  const [f, setF] = useState({ name: initialName || '', mobile: '', gst: '', pan: '', address: '', state: 'Maharashtra', pincode: '', shippingAddress: '', creditDays: '' });
  const [sameShip, setSameShip] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!kind) { setError(t('errorSelectType')); return; }
    if (!f.name.trim()) { setError(t('errorNameRequired')); return; }
    setSaving(true); setError('');
    try {
      const isFarmer = kind === 'farmer';
      const res = await api.post('/crm/customers', {
        ...f,
        name: f.name.trim(),
        customerType: isFarmer ? 'party' : 'customer',
        partyType: isFarmer ? null : 'Customer',
        farmerType: isFarmer ? 'Farmer' : null,
        shippingAddress: sameShip ? '' : f.shippingAddress,
        balanceType: 'receivable',
        openingBalance: '0',
        status: 'active',
      });
      onCreated(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.response?.data?.error || e?.message || t('errorSaveFailed'));
    } finally { setSaving(false); }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="quick-add-party">
        <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-slate-900 dark:text-white">{t('title')}</h2>
            <button onClick={onClose} aria-label="Close"><X size={20} className="text-slate-400" /></button>
          </div>

          {/* Party type selector — required first step */}
          <div>
            <p className="text-[11px] font-bold uppercase text-slate-500 mb-2">{t('partyTypeLabel')} *</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setKind('farmer')}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-colors text-left
                  ${kind === 'farmer'
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-amber-300'}`}>
                <Wheat size={20} className={kind === 'farmer' ? 'text-amber-600' : 'text-slate-400'} />
                <span className="text-xs font-bold">{t('farmerTitle')}</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight text-center">{t('farmerSubtext')}</span>
              </button>
              <button type="button" onClick={() => setKind('customer')}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-colors text-left
                  ${kind === 'customer'
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-emerald-300'}`}>
                <ShoppingBag size={20} className={kind === 'customer' ? 'text-emerald-600' : 'text-slate-400'} />
                <span className="text-xs font-bold">{t('customerTitle')}</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight text-center">{t('customerSubtext')}</span>
              </button>
            </div>
          </div>

          {/* Name + details — only shown once type is picked */}
          {kind !== null && (
            <>
              <label className="block"><span className={lab}>{t('nameLabel')} *</span>
                <input autoFocus className={inp} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className={lab}>{t('mobileLabel')}</span>
                  <input className={inp} inputMode="numeric" maxLength={10} value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value.replace(/\D/g, '') })} /></label>
                <label className="block"><span className={lab}>{t('creditDaysLabel')}</span>
                  <input className={inp} inputMode="numeric" value={f.creditDays} onChange={(e) => setF({ ...f, creditDays: e.target.value.replace(/\D/g, '') })} placeholder="0" /></label>
              </div>
              <label className="block"><span className={lab}>{t('gstLabel')}</span>
                <input className={inp + ' font-mono uppercase'} maxLength={15} value={f.gst} placeholder="27ABCDE1234F1Z5"
                  onChange={(e) => { const g = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15); const st = stateFromGstin(g); setF({ ...f, gst: g, ...(st ? { state: st } : {}) }); }} /></label>
              <label className="block"><span className={lab}>{t('addressLabel')}</span>
                <input className={inp} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder={t('addressPlaceholder')} /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className={lab}>{t('stateLabel')}</span>
                  <input className={inp} value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} /></label>
                <label className="block"><span className={lab}>{t('pincodeLabel')}</span>
                  <input className={inp} inputMode="numeric" maxLength={6} value={f.pincode} onChange={(e) => setF({ ...f, pincode: e.target.value.replace(/\D/g, '') })} /></label>
              </div>
              <div>
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <input type="checkbox" checked={sameShip} onChange={(e) => setSameShip(e.target.checked)} />
                  {t('sameShippingLabel')}
                </label>
                {!sameShip && <input className={inp + ' mt-1.5'} value={f.shippingAddress} onChange={(e) => setF({ ...f, shippingAddress: e.target.value })} placeholder={t('shippingPlaceholder')} />}
              </div>
            </>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-500">{t('cancelBtn')}</button>
            <button onClick={save} disabled={saving || !kind || !f.name.trim()}
              className="px-5 py-2 rounded-lg text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 size={14} className="animate-spin" />} {t('saveBtn')}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
