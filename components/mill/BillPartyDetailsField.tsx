'use client';

import { useState } from 'react';
import { ChevronDown, UserRound } from 'lucide-react';
import { stateFromGstin, GST_STATES } from '@/lib/indiaStates';

/**
 * "Customer details on this bill" (Bada Udyog billing): the party's name, billing address, GSTIN, state and shipping address as they will be
 * PRINTED on this invoice. They start from the party's saved details and every one can be changed for this bill alone — the party record is not
 * touched, and the bill keeps what was printed even if the party is edited later. Empty shipping address = same as billing.
 */
export type BillPartyInput = { name: string; address: string; gst: string; state: string; shipping: string };
export const EMPTY_BILL_PARTY: BillPartyInput = { name: '', address: '', gst: '', state: '', shipping: '' };

/** The starting values for a selected party (its saved details; state from its GSTIN when none is saved). */
export function billPartyFrom(p: any): BillPartyInput {
  if (!p) return EMPTY_BILL_PARTY;
  const docs = p.documents && typeof p.documents === 'object' ? p.documents : {};
  return {
    name: p.name || '',
    address: p.address || '',
    gst: p.gst || '',
    state: docs.state || stateFromGstin(p.gst) || '',
    shipping: docs.shippingAddress || '',
  };
}

const inp = 'w-full h-9 px-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900';

export default function BillPartyDetailsField({ value, onChange, disabled }: { value: BillPartyInput; onChange: (v: BillPartyInput) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const L = ({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) => (
    <label className={`block min-w-0 ${className || ''}`}><span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">{label}</span>{children}</label>
  );
  return (
    <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 shrink-0" data-testid="bill-party-details">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-2 text-sm font-bold text-slate-800 dark:text-slate-200">
        <span className="flex items-center gap-1.5 min-w-0"><UserRound size={15} className="text-indigo-500 shrink-0" /> <span className="truncate">Customer details on this bill</span></span>
        <ChevronDown size={16} className={open ? 'rotate-180 transition-transform shrink-0' : 'transition-transform shrink-0'} />
      </button>
      {!open && (
        <p className="mt-1 text-[11px] text-slate-500 truncate">
          {[value.gst && `GSTIN ${value.gst}`, value.state, value.shipping ? 'Ship-to: ' + value.shipping : 'Ship-to same as billing'].filter(Boolean).join(' · ')}
        </p>
      )}
      {open && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <L label="Billed to (name)" className="col-span-2"><input className={inp} value={value.name} disabled={disabled} onChange={(e) => onChange({ ...value, name: e.target.value })} /></L>
          <L label="Billing address" className="col-span-2"><input className={inp} value={value.address} disabled={disabled} onChange={(e) => onChange({ ...value, address: e.target.value })} /></L>
          <L label="GSTIN"><input className={inp + ' font-mono uppercase'} maxLength={15} value={value.gst} disabled={disabled}
            onChange={(e) => { const g = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15); const st = stateFromGstin(g); onChange({ ...value, gst: g, ...(st ? { state: st } : {}) }); }} /></L>
          <L label="State (place of supply)">
            <input className={inp} list="bill-party-states" value={value.state} disabled={disabled} onChange={(e) => onChange({ ...value, state: e.target.value })} />
            <datalist id="bill-party-states">{GST_STATES.map((s) => <option key={s.code} value={s.name} />)}</datalist>
          </L>
          <L label="Shipping address (empty = same as billing)" className="col-span-2"><input className={inp} value={value.shipping} disabled={disabled} onChange={(e) => onChange({ ...value, shipping: e.target.value })} placeholder="Where the goods are sent" /></L>
        </div>
      )}
    </div>
  );
}
