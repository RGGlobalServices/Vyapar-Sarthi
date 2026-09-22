'use client';

import useSWR from 'swr';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';

export type BrokerValue = { name: string; commission: string };
export const EMPTY_BROKER: BrokerValue = { name: '', commission: '' };

/** Optional broker + commission for a bill (Bada Udyog). Existing brokers are suggested; a new name creates the broker on save. */
export default function BrokerField({ value, onChange, kind }: { value: BrokerValue; onChange: (v: BrokerValue) => void; kind: 'supplier' | 'customer' }) {
  const shopId = useBusinessStore(s => s.activeShopId);
  const { data: brokers = [] } = useSWR<any[]>(shopId ? `/crm/customers?type=broker&_shop=${shopId}` : null, (u: string) => api.get(u).then(r => r.data), { revalidateOnFocus: false });
  const list = `brokers-${kind}`;
  return (
    <div className="grid grid-cols-[1fr_8rem] gap-2" data-testid={`broker-field-${kind}`}>
      <label className="block">
        <span className="text-xs font-bold text-slate-500 uppercase">{kind === 'supplier' ? 'Supplier Broker' : 'Customer Broker'} (optional)</span>
        <input list={list} value={value.name} onChange={e => onChange({ ...value, name: e.target.value })} placeholder="Broker name — new names are added to Brokers"
          className="mt-1 w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm" />
        <datalist id={list}>{brokers.map((b: any) => <option key={b.id} value={b.name} />)}</datalist>
      </label>
      <label className="block">
        <span className="text-xs font-bold text-slate-500 uppercase">Commission ₹</span>
        <input type="number" min="0" step="0.01" value={value.commission} onChange={e => onChange({ ...value, commission: e.target.value })} placeholder="₹"
          className="mt-1 w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm" />
      </label>
    </div>
  );
}
