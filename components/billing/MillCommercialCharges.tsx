'use client';

import { useTranslations } from 'next-intl';
import { Truck } from 'lucide-react';
import { MILL_CHARGE_KEYS, type MillChargeKey } from '@/lib/millBilling';

// Mill Billing commercial charges card (shown below the cart). These are CHARGES, not products: they are never cart
// lines, never counted in the item count, never discounted, carry no GST, and never count as profit. The values are
// kept as strings so a blank / half-typed number stays editable; validation is the engine's own (normalizeMillCharges).
export type MillChargeInputs = Record<MillChargeKey, string>;
export const EMPTY_MILL_CHARGES: MillChargeInputs = { freight: '', hamali: '', loading: '', unloading: '', other: '' };

export default function MillCommercialCharges({
  values, onChange, error, disabled,
}: {
  values: MillChargeInputs;
  onChange: (key: MillChargeKey, value: string) => void;
  error?: string | null;
  disabled?: boolean;
}) {
  const t = useTranslations('MillBilling');
  const label = (k: MillChargeKey) => t(k === 'other' ? 'otherCharges' : k);
  return (
    <div data-testid="mill-charges-card" className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 shrink-0">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
          <Truck size={15} className="text-indigo-500" /> {t('chargesTitle')}
        </h3>
      </div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">{t('chargesNote')}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {MILL_CHARGE_KEYS.map((k) => (
          <div key={k}>
            <label htmlFor={`mill-charge-${k}`} className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">{label(k)}</label>
            <input
              id={`mill-charge-${k}`}
              data-testid={`mill-charge-${k}`}
              type="number" inputMode="decimal" min={0} step="0.01" placeholder="0" disabled={disabled}
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
              value={values[k]}
              onChange={(e) => onChange(k, e.target.value)}
            />
          </div>
        ))}
      </div>
      {error && <p data-testid="mill-charges-error" className="mt-2 text-xs font-semibold text-red-500">{t('chargesInvalid')}: {error}</p>}
    </div>
  );
}
