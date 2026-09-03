'use client';

import { useState } from 'react';
import { Calendar } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { listRecentFinancialYears, currentFinancialYear, getFinancialYearRange, toIsoDateIST } from '@/lib/financialYear';

export interface DateRangeValue {
  from: string; // ISO yyyy-mm-dd
  to: string;
  label: string;
}

interface FinancialYearPickerProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
}

const toIso = toIsoDateIST;

/** FY dropdown + "Custom Range" toggle exposing From/To — shared by every
 *  CA report so a shopkeeper/accountant picks the period once per tab. */
export default function FinancialYearPicker({ value, onChange }: FinancialYearPickerProps) {
  const t = useTranslations('Reports.ca.fyPicker');
  const [mode, setMode] = useState<'fy' | 'custom'>('fy');
  const fys = listRecentFinancialYears(6);
  const current = currentFinancialYear();
  const selectedFyStartYear = fys.find((f) => f.label === value.label)?.fyStartYear ?? current.fyStartYear;

  function pickFy(fyStartYear: number) {
    const fy = getFinancialYearRange(fyStartYear);
    onChange({ from: toIso(fy.from), to: toIso(fy.to), label: fy.label });
  }

  return (
    <div className="flex flex-wrap items-end gap-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
        <Calendar size={13} /> {t('label')}
      </div>

      <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
        <button
          type="button"
          onClick={() => { setMode('fy'); pickFy(selectedFyStartYear); }}
          className={`px-3 py-1.5 text-xs font-bold ${mode === 'fy' ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'}`}
        >
          {t('financialYear')}
        </button>
        <button
          type="button"
          onClick={() => setMode('custom')}
          className={`px-3 py-1.5 text-xs font-bold ${mode === 'custom' ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'}`}
        >
          {t('customRange')}
        </button>
      </div>

      {mode === 'fy' ? (
        <select
          value={selectedFyStartYear}
          onChange={(e) => pickFy(Number(e.target.value))}
          className="h-9 px-3 rounded-lg text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 max-w-full"
        >
          {fys.map((fy) => (
            <option key={fy.fyStartYear} value={fy.fyStartYear}>{fy.label}</option>
          ))}
        </select>
      ) : (
        <>
          <div>
            <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('from')}</label>
            <input
              type="date"
              value={value.from}
              onChange={(e) => onChange({ from: e.target.value, to: value.to, label: `${e.target.value} to ${value.to}` })}
              className="h-9 px-2 rounded-lg text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 w-full sm:w-auto"
            />
          </div>
          <div>
            <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('to')}</label>
            <input
              type="date"
              value={value.to}
              onChange={(e) => onChange({ from: value.from, to: e.target.value, label: `${value.from} to ${e.target.value}` })}
              className="h-9 px-2 rounded-lg text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 w-full sm:w-auto"
            />
          </div>
        </>
      )}

      <div className="text-[11px] text-slate-500 dark:text-slate-400 sm:ml-auto basis-full sm:basis-auto break-words">
        {value.label} &middot; {value.from} to {value.to}
      </div>
    </div>
  );
}
