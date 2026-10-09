'use client';

import { useId, useState } from 'react';
import { ChevronDown, Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * Dispatch details printed on a Bada Udyog invoice (Transport, Vehicle No., Station, E-Way Bill No., GR/RR No., Salesman, Reverse charge).
 * A small collapsible card in the billing side panel; every field is optional and an empty card prints blank lines.
 */
export type DispatchInput = {
  transport: string;
  vehicleNo: string;
  station: string;
  eWayBill: string;
  grRrNo: string;
  salesman: string;
  reverseCharge: 'Y' | 'N';
};

export const EMPTY_DISPATCH_INPUT: DispatchInput = {
  transport: '', vehicleNo: '', station: '', eWayBill: '', grRrNo: '', salesman: '', reverseCharge: 'N',
};

type TextFieldKey = Exclude<keyof DispatchInput, 'reverseCharge'>;

const inputClass = 'w-full h-9 px-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 transition-colors';

/** Field config drives the grid below — one source of truth instead of six near-identical <input> blocks. */
const FIELD_CONFIG: Array<{ key: TextFieldKey; labelKey: string; placeholder?: string; mono?: boolean; uppercase?: boolean }> = [
  { key: 'transport', labelKey: 'dispatch_transport', placeholder: 'Azad Transport' },
  { key: 'vehicleNo', labelKey: 'dispatch_vehicleNo', placeholder: 'MH31EN9900', mono: true, uppercase: true },
  { key: 'station', labelKey: 'dispatch_station', placeholder: 'Gondia' },
  { key: 'eWayBill', labelKey: 'dispatch_eWayBill', mono: true },
  { key: 'grRrNo', labelKey: 'dispatch_grRrNo' },
  { key: 'salesman', labelKey: 'dispatch_salesman' },
];

export default function DispatchDetailsField({ value, onChange, disabled }: { value: DispatchInput; onChange: (v: DispatchInput) => void; disabled?: boolean }) {
  const t = useTranslations('Billing');
  const uid = useId();
  const [open, setOpen] = useState(false);

  const filled = !!(value.transport || value.vehicleNo || value.station || value.eWayBill || value.grRrNo || value.salesman);

  const setField = (key: TextFieldKey, raw: string, uppercase?: boolean) => {
    onChange({ ...value, [key]: uppercase ? raw.toUpperCase() : raw });
  };

  // Enter must never bubble to a surrounding <form> — these fields sit inside the checkout
  // form, and an accidental submit there silently saves the bill and closes the modal.
  const blockEnterSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.preventDefault();
  };

  return (
    <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 shrink-0" data-testid="dispatch-details">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 text-sm font-bold text-slate-800 dark:text-slate-200"
      >
        <span className="flex items-center gap-1.5">
          <Truck size={15} className="text-indigo-500" aria-hidden="true" />
          {t('dispatch_heading')}
          {filled && <span className="text-[10px] font-bold text-emerald-600">● {t('dispatch_filled')}</span>}
        </span>
        <ChevronDown size={16} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>

      {open && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {FIELD_CONFIG.map(({ key, labelKey, placeholder, mono, uppercase }) => {
            const fieldId = `${uid}-${key}`;
            return (
              <label key={key} htmlFor={fieldId} className="block min-w-0">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">{t(labelKey)}</span>
                <input
                  id={fieldId}
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className={mono ? `${inputClass} font-mono tracking-wide` : inputClass}
                  value={value[key]}
                  disabled={disabled}
                  placeholder={placeholder}
                  onChange={(e) => setField(key, e.target.value, uppercase)}
                  onKeyDown={blockEnterSubmit}
                />
              </label>
            );
          })}

          <label className="col-span-2 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={value.reverseCharge === 'Y'}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, reverseCharge: e.target.checked ? 'Y' : 'N' })}
            />
            {t('dispatch_reverseCharge')}
          </label>
        </div>
      )}
    </div>
  );
}
