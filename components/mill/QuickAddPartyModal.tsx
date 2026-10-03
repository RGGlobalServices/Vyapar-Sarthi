'use client';

import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import api from '@/lib/api';
import ModalPortal from '@/components/mill/ModalPortal';
import { stateFromGstin } from '@/lib/indiaStates';

/**
 * "Add new party" straight from the billing checkout (Bada Udyog), so a new customer does not need a trip to the Parties page. It saves the
 * same party record as Parties -> Add (name, mobile, GSTIN, billing + shipping address, state) and hands it back to be selected on the bill.
 */
const inp = 'w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 focus:ring-2 focus:ring-emerald-500 outline-none';
const lab = 'block text-[11px] font-bold uppercase text-slate-500 mb-1';

export default function QuickAddPartyModal({ initialName, onClose, onCreated }: { initialName?: string; onClose: () => void; onCreated: (party: any) => void }) {
  const [f, setF] = useState({ name: initialName || '', mobile: '', gst: '', pan: '', address: '', state: 'Maharashtra', pincode: '', shippingAddress: '', creditDays: '' });
  const [sameShip, setSameShip] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!f.name.trim()) { setError('Party name is required'); return; }
    setSaving(true); setError('');
    try {
      const res = await api.post('/crm/customers', {
        ...f, name: f.name.trim(), customerType: 'party', partyType: 'Customer', farmerType: 'Dealer',
        shippingAddress: sameShip ? '' : f.shippingAddress, balanceType: 'receivable', openingBalance: '0', status: 'active',
      });
      onCreated(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.response?.data?.error || e?.message || 'Could not add the party');
    } finally { setSaving(false); }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="quick-add-party">
        <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl p-5 space-y-3 max-h-[92vh] overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-slate-900 dark:text-white">Add new party</h2>
            <button onClick={onClose} aria-label="Close"><X size={20} className="text-slate-400" /></button>
          </div>
          <label className="block"><span className={lab}>Party name *</span><input autoFocus className={inp} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className={lab}>Mobile</span><input className={inp} inputMode="numeric" maxLength={10} value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value.replace(/\D/g, '') })} /></label>
            <label className="block"><span className={lab}>Credit days</span><input className={inp} inputMode="numeric" value={f.creditDays} onChange={(e) => setF({ ...f, creditDays: e.target.value.replace(/\D/g, '') })} placeholder="0" /></label>
          </div>
          <label className="block"><span className={lab}>GSTIN (printed on the bill)</span>
            <input className={inp + ' font-mono uppercase'} maxLength={15} value={f.gst} placeholder="27ABCDE1234F1Z5"
              onChange={(e) => { const g = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15); const st = stateFromGstin(g); setF({ ...f, gst: g, ...(st ? { state: st } : {}) }); }} /></label>
          <label className="block"><span className={lab}>Billing address</span><input className={inp} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder="Road, village / city" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className={lab}>State</span><input className={inp} value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} /></label>
            <label className="block"><span className={lab}>Pincode</span><input className={inp} inputMode="numeric" maxLength={6} value={f.pincode} onChange={(e) => setF({ ...f, pincode: e.target.value.replace(/\D/g, '') })} /></label>
          </div>
          <div>
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300"><input type="checkbox" checked={sameShip} onChange={(e) => setSameShip(e.target.checked)} /> Shipping address same as billing</label>
            {!sameShip && <input className={inp + ' mt-1.5'} value={f.shippingAddress} onChange={(e) => setF({ ...f, shippingAddress: e.target.value })} placeholder="Where the goods are sent" />}
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-500">Cancel</button>
            <button onClick={save} disabled={saving || !f.name.trim()} className="px-5 py-2 rounded-lg text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 size={14} className="animate-spin" />} Save &amp; select
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
