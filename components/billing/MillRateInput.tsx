'use client';

import { useEffect, useRef, useState } from 'react';

// Mill Billing (`mill_v2`) cart rate: the number typed here IS the price before GST — it is stored as typed and GST is
// added on top by the engine. There is deliberately NO Incl/Excl toggle and no conversion (the legacy CartPriceInput
// stores GST-inclusive prices; mixing the two meanings in one control is exactly what the separate Mill cart avoids).
const GST_SLABS = [0, 5, 12, 18, 28];
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export default function MillRateInput({ item, updatePrice, updateGstPercent, isGstBill }: any) {
  const [val, setVal] = useState(() => String(r2(Number(item.price) || 0)));
  const focused = useRef(false);

  // Follow the store unless the cashier is mid-edit in this field (string state: blank/partial input must stay editable).
  useEffect(() => {
    if (!focused.current) setVal(String(r2(Number(item.price) || 0)));
  }, [item.price]);

  const gstPercent = Number(item.gstPercent) || 0;
  const slabs = GST_SLABS.includes(gstPercent) ? GST_SLABS : [...GST_SLABS, gstPercent].sort((a, b) => a - b);

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        type="number"
        inputMode="decimal"
        data-testid="mill-rate-input"
        aria-label="Rate (Excl. GST)"
        className="w-24 text-right py-1 px-2 bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-emerald-500 rounded font-mono text-sm outline-none transition-colors"
        value={val}
        min={0}
        step="any"
        onFocus={() => { focused.current = true; }}
        onChange={(e) => {
          setVal(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== '' && Number.isFinite(n) && n >= 0) updatePrice(item.id, r2(n), item.variant);
        }}
        onBlur={(e) => {
          focused.current = false;
          if (e.target.value === '' || !Number.isFinite(Number(e.target.value)) || Number(e.target.value) < 0) {
            updatePrice(item.id, 0, item.variant);
            setVal('0');
          } else {
            setVal(String(r2(Number(e.target.value))));
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
