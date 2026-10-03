'use client';

import { useState } from 'react';
import { ChevronDown, Truck } from 'lucide-react';

/**
 * Dispatch details printed on a Bada Udyog invoice (Transport, Vehicle No., Station, E-Way Bill No., GR/RR No., Salesman, Reverse charge).
 * A small collapsible card in the billing side panel; every field is optional and an empty card prints blank lines.
 */
export type DispatchInput = { transport: string; vehicleNo: string; station: string; eWayBill: string; grRrNo: string; salesman: string; reverseCharge: 'Y' | 'N' };
export const EMPTY_DISPATCH_INPUT: DispatchInput = { transport: '', vehicleNo: '', station: '', eWayBill: '', grRrNo: '', salesman: '', reverseCharge: 'N' };

const inp = 'w-full h-9 px-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900';

export default function DispatchDetailsField({ value, onChange, disabled }: { value: DispatchInput; onChange: (v: DispatchInput) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const filled = !!(value.transport || value.vehicleNo || value.station || value.eWayBill || value.grRrNo || value.salesman);
  const set = (k: keyof DispatchInput, v: string) => onChange({ ...value, [k]: k === 'vehicleNo' ? v.toUpperCase() : v } as DispatchInput);
  const L = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <label className="block min-w-0"><span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">{label}</span>{children}</label>
  );
  return (
    <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 shrink-0" data-testid="dispatch-details">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-2 text-sm font-bold text-slate-800 dark:text-slate-200">
        <span className="flex items-center gap-1.5"><Truck size={15} className="text-indigo-500" /> Dispatch details {filled && <span className="text-[10px] font-bold text-emerald-600">● filled</span>}</span>
        <ChevronDown size={16} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>
      {open && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <L label="Transport"><input className={inp} value={value.transport} disabled={disabled} onChange={(e) => set('transport', e.target.value)} placeholder="Azad Transport" /></L>
          <L label="Vehicle No."><input className={inp + ' font-mono'} value={value.vehicleNo} disabled={disabled} onChange={(e) => set('vehicleNo', e.target.value)} placeholder="MH31EN9900" /></L>
          <L label="Station"><input className={inp} value={value.station} disabled={disabled} onChange={(e) => set('station', e.target.value)} placeholder="Gondia" /></L>
          <L label="E-Way Bill No."><input className={inp + ' font-mono'} value={value.eWayBill} disabled={disabled} onChange={(e) => set('eWayBill', e.target.value)} /></L>
          <L label="GR / RR No."><input className={inp} value={value.grRrNo} disabled={disabled} onChange={(e) => set('grRrNo', e.target.value)} /></L>
          <L label="Salesman"><input className={inp} value={value.salesman} disabled={disabled} onChange={(e) => set('salesman', e.target.value)} /></L>
          <label className="col-span-2 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={value.reverseCharge === 'Y'} disabled={disabled} onChange={(e) => onChange({ ...value, reverseCharge: e.target.checked ? 'Y' : 'N' })} /> Reverse charge applies
          </label>
        </div>
      )}
    </div>
  );
}
