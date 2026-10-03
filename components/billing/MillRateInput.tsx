'use client';

import { useEffect, useRef, useState } from 'react';

// Mill Billing (`mill_v2`) cart rate. The STORED rate is always the price before GST (the engine adds GST on top). On a GST bill the cashier
// can choose to TYPE the rate with GST included ("basis" = 'incl'): the control then shows rate x (1 + GST%) and converts what is typed back
// to the price before GST, so the stored value, the totals and the server never see a GST-inclusive number. Non-GST bills: always as typed.
const GST_SLABS = [0, 5, 12, 18, 28];
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r6 = (n: number) => Math.round((n + Number.EPSILON) * 1e6) / 1e6;

export default function MillRateInput({ item, updatePrice, updateGstPercent, isGstBill, basis = 'excl' }: any) {
  const gstPercent = Number(item.gstPercent) || 0;
  const incl = !!isGstBill && basis === 'incl';
  const factor = incl ? 1 + gstPercent / 100 : 1;
  const shown = (price: number) => String(r2((Number(price) || 0) * factor));
  const [val, setVal] = useState(() => shown(item.price));
  const focused = useRef(false);

  // Follow the store unless the cashier is mid-edit in this field (string state: blank/partial input must stay editable).
  useEffect(() => {
    if (!focused.current) setVal(shown(item.price));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.price, factor]);

  const slabs = GST_SLABS.includes(gstPercent) ? GST_SLABS : [...GST_SLABS, gstPercent].sort((a, b) => a - b);

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        type="number"
        inputMode="decimal"
        data-testid="mill-rate-input"
        aria-label={incl ? 'Rate (Incl. GST)' : 'Rate (Excl. GST)'}
        className="w-24 text-right py-1 px-2 bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-emerald-500 rounded font-mono text-sm outline-none transition-colors"
        value={val}
        min={0}
        step="any"
        onFocus={() => { focused.current = true; }}
        onChange={(e) => {
          setVal(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== '' && Number.isFinite(n) && n >= 0) updatePrice(item.id, incl ? r6(n / factor) : r2(n), item.variant);
        }}
        onBlur={(e) => {
          focused.current = false;
          if (e.target.value === '' || !Number.isFinite(Number(e.target.value)) || Number(e.target.value) < 0) {
            updatePrice(item.id, 0, item.variant);
            setVal('0');
          } else {
            setVal(String(r2(Number(e.target.value))));
            // typed with GST included: keep the exact converted price (no 2-decimal rounding of the price before GST)
          }
        }}
      />
      {isGstBill && (
        <label className="flex items-center gap-1 text-[10px] text-slate-500">
          GST
          <select
            data-testid="mill-gst-select"
            className="bg-transparent border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 text-[11px] text-slate-700 dark:text-slate-300"
            value={gstPercent}
            onChange={(e) => updateGstPercent(item.id, Number(e.target.value), item.variant)}
          >
            {slabs.map((g) => <option key={g} value={g}>{g}%</option>)}
          </select>
        </label>
      )}
    </div>
  );
}
