'use client';

import { useState, useCallback } from 'react';
import { Calendar, SlidersHorizontal, ChevronDown, X } from 'lucide-react';

interface ReportFilterBarProps {
  onChange: (filters: ReportFilters) => void;
  showWarehouse?: boolean;
  showStaff?: boolean;
  showPaymentMode?: boolean;
  warehouses?: { id: string; name: string }[];
  staff?: { id: string; name: string }[];
}

export interface ReportFilters {
  startDate: string;
  endDate: string;
  groupBy: 'day' | 'week' | 'month';
  warehouseId?: string;
  staffId?: string;
  paymentMode?: string;
}

const PRESETS = [
  { label: 'Today', getDates: () => { const t = new Date().toISOString().split('T')[0]; return { s: t, e: t }; } },
  { label: 'This Week', getDates: () => { const d = new Date(); const start = new Date(d); start.setDate(d.getDate() - d.getDay()); return { s: start.toISOString().split('T')[0], e: d.toISOString().split('T')[0] }; } },
  { label: 'Last 7 Days', getDates: () => { const d = new Date(); const s = new Date(d); s.setDate(d.getDate() - 6); return { s: s.toISOString().split('T')[0], e: d.toISOString().split('T')[0] }; } },
  { label: 'This Month', getDates: () => { const d = new Date(); const s = new Date(d.getFullYear(), d.getMonth(), 1); return { s: s.toISOString().split('T')[0], e: d.toISOString().split('T')[0] }; } },
  { label: 'Last 30 Days', getDates: () => { const d = new Date(); const s = new Date(d); s.setDate(d.getDate() - 29); return { s: s.toISOString().split('T')[0], e: d.toISOString().split('T')[0] }; } },
  { label: 'Last 90 Days', getDates: () => { const d = new Date(); const s = new Date(d); s.setDate(d.getDate() - 89); return { s: s.toISOString().split('T')[0], e: d.toISOString().split('T')[0] }; } },
  { label: 'This Year', getDates: () => { const d = new Date(); const s = new Date(d.getFullYear(), 0, 1); return { s: s.toISOString().split('T')[0], e: d.toISOString().split('T')[0] }; } },
];

export default function ReportFilterBar({ onChange, showWarehouse, showStaff, showPaymentMode, warehouses = [], staff = [] }: ReportFilterBarProps) {
  const todayDates = PRESETS[2].getDates(); // Last 7 Days default
  const [startDate, setStartDate] = useState(todayDates.s);
  const [endDate, setEndDate] = useState(todayDates.e);
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');
  const [warehouseId, setWarehouseId] = useState('');
  const [staffId, setStaffId] = useState('');
  const [paymentMode, setPaymentMode] = useState('');
  const [activePreset, setActivePreset] = useState('Last 7 Days');

  const apply = useCallback((overrides?: Partial<ReportFilters>) => {
    onChange({
      startDate: overrides?.startDate ?? startDate,
      endDate: overrides?.endDate ?? endDate,
      groupBy: overrides?.groupBy ?? groupBy,
      warehouseId: warehouseId || undefined,
      staffId: staffId || undefined,
      paymentMode: paymentMode || undefined,
      ...overrides
    });
  }, [startDate, endDate, groupBy, warehouseId, staffId, paymentMode, onChange]);

  const applyPreset = (preset: typeof PRESETS[0]) => {
    const { s, e } = preset.getDates();
    setStartDate(s);
    setEndDate(e);
    setActivePreset(preset.label);
    onChange({ startDate: s, endDate: e, groupBy, warehouseId: warehouseId || undefined, staffId: staffId || undefined, paymentMode: paymentMode || undefined });
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-4">
      {/* Preset Chips */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map(p => (
          <button
            key={p.label}
            onClick={() => applyPreset(p)}
            className={`text-xs font-bold px-3 py-1.5 rounded-full transition-all ${activePreset === p.label ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Date Inputs + Group By */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Calendar size={14} className="text-slate-400 shrink-0" />
          <input
            type="date"
            value={startDate}
            max={endDate}
            onChange={e => { setStartDate(e.target.value); setActivePreset(''); }}
            className="text-sm px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 w-full"
          />
          <span className="text-slate-400 font-bold text-sm">to</span>
          <input
            type="date"
            value={endDate}
            min={startDate}
            onChange={e => { setEndDate(e.target.value); setActivePreset(''); }}
            className="text-sm px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 w-full"
          />
        </div>

        <select
          value={groupBy}
          onChange={e => { setGroupBy(e.target.value as any); }}
          className="text-sm px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="day">Daily</option>
          <option value="week">Weekly</option>
          <option value="month">Monthly</option>
        </select>

        {showWarehouse && warehouses.length > 0 && (
          <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)}
            className="text-sm px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500">
            <option value="">All Warehouses</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        )}

        {showPaymentMode && (
          <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)}
            className="text-sm px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500">
            <option value="">All Modes</option>
            <option value="Cash">Cash</option>
            <option value="UPI">UPI</option>
            <option value="Card">Card</option>
            <option value="Udhar">Udhar</option>
          </select>
        )}

        <button
          onClick={() => apply()}
          className="px-5 py-2 bg-emerald-500 text-white text-sm font-bold rounded-xl hover:bg-emerald-400 transition-colors shadow-sm shadow-emerald-500/20"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
