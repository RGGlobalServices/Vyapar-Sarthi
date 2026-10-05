'use client';

import { useState, useRef, useEffect } from 'react';
import useSWR from 'swr';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { ChevronDown, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

export type BrokerValue = { name: string; commission: string };
export const EMPTY_BROKER: BrokerValue = { name: '', commission: '' };

/** Optional broker + commission for a bill (Bada Udyog). Existing brokers are suggested via a custom dropdown; a new name creates the broker on save. */
export default function BrokerField({ value, onChange, kind }: { value: BrokerValue; onChange: (v: BrokerValue) => void; kind: 'supplier' | 'customer' }) {
  const t = useTranslations('Billing');
  const shopId = useBusinessStore(s => s.activeShopId);
  const { data: brokers = [] } = useSWR<any[]>(shopId ? `/crm/customers?type=broker&_shop=${shopId}` : null, (u: string) => api.get(u).then(r => r.data), { revalidateOnFocus: false });

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = value.name.trim()
    ? brokers.filter((b: any) => b.name.toLowerCase().includes(value.name.toLowerCase()))
    : brokers;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectBroker = (name: string) => {
    onChange({ ...value, name });
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div className="flex flex-col sm:flex-row gap-2" data-testid={`broker-field-${kind}`}>
      {/* Broker name — custom combobox */}
      <div className="flex-1 relative" ref={containerRef}>
        <span className="text-xs font-bold text-slate-500 uppercase block mb-1">{kind === 'supplier' ? t('brokerField_supplierLabel') : t('brokerField_customerLabel')}</span>
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={value.name}
            onChange={e => { onChange({ ...value, name: e.target.value }); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={t('brokerField_placeholder')}
            className="w-full h-10 pl-3 pr-16 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
          />
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
            {value.name && (
              <button type="button" onClick={() => { onChange({ ...value, name: '' }); setOpen(false); }}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                <X size={13} />
              </button>
            )}
            <button type="button" onClick={() => { setOpen(o => !o); inputRef.current?.focus(); }}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
              <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>
        {/* Dropdown — positioned inside the relative container; flips upward via CSS if near bottom */}
        {open && filtered.length > 0 && (
          <ul className="absolute left-0 right-0 z-[200] mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((b: any) => (
              <li key={b.id}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-slate-800 dark:text-slate-200 transition-colors"
                  onMouseDown={e => { e.preventDefault(); selectBroker(b.name); }}
                >
                  {b.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Commission */}
      <div className="w-full sm:w-32 shrink-0">
        <span className="text-xs font-bold text-slate-500 uppercase block mb-1">{t('brokerField_commissionLabel')}</span>
        <input
          type="number" min="0" step="0.01"
          value={value.commission}
          onChange={e => onChange({ ...value, commission: e.target.value })}
          placeholder="₹"
          className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
        />
      </div>
    </div>
  );
}
