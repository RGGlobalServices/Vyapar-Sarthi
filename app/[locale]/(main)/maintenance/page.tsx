'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Plus, X, Loader2, Wrench } from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';

type MaintenanceRow = {
  id: string; description: string; cost: number | null; performedBy: string | null;
  serviceDate: string; nextDueDate: string | null; notes: string | null;
  machine?: { id: string; name: string } | null;
};
type Machine = { id: string; name: string; status: string };

const fetcher = (u: string) => api.get(u).then(r => r.data);
const rupee = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export default function MaintenancePage() {
  const t = useTranslations('Maintenance');
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const searchParams = useSearchParams();
  const machineIdFilter = searchParams.get('machineId');
  const [logging, setLogging] = useState(false);

  const { data: rows = [], mutate: refetch, isLoading } = useSWR<MaintenanceRow[]>(
    activeShopId ? [`/management/maintenance${machineIdFilter ? `?machineId=${machineIdFilter}` : ''}`, activeShopId] : null,
    ([u]) => fetcher(u),
  );
  const { data: machines = [] } = useSWR<Machine[]>(
    activeShopId ? ['/management/machines', activeShopId] : null,
    ([u]) => fetcher(u),
  );

  const filterMachine = machines.find(m => m.id === machineIdFilter);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Wrench size={22} className="text-amber-600" /> {t('title')}
            {filterMachine && <span className="text-base font-normal text-slate-500">— {filterMachine.name}</span>}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
        </div>
        <button onClick={() => setLogging(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors">
          <Plus size={18} /> {t('logMaintenance')}
        </button>
      </div>

      {isLoading ? (
        <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
          <Wrench size={40} className="mx-auto text-slate-300 dark:text-slate-700" />
          <p className="mt-3 text-sm text-slate-500">{t('noEntries')}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map(r => (
              <li key={r.id} className="p-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900 dark:text-white">{r.machine?.name}</span>
                    <span className="text-xs text-slate-500">{r.description}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {new Date(r.serviceDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {r.performedBy && ` · ${r.performedBy}`}
                    {r.nextDueDate && ` · ${t('nextDue')} ${new Date(r.nextDueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                  </p>
                </div>
                {r.cost != null && <span className="text-lg font-black text-amber-600 dark:text-amber-400 shrink-0">{rupee(r.cost)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {logging && (
        <LogMaintenanceModal
          machines={machines}
          defaultMachineId={machineIdFilter}
          onClose={() => setLogging(false)}
          onLogged={() => { setLogging(false); refetch(); }}
        />
      )}
    </div>
  );
}

function LogMaintenanceModal({ machines, defaultMachineId, onClose, onLogged }: {
  machines: Machine[]; defaultMachineId: string | null; onClose: () => void; onLogged: () => void;
}) {
  const t = useTranslations('Maintenance');
  const [form, setForm] = useState({
    machineId: defaultMachineId || '', description: '', cost: '', performedBy: '',
    nextDueDate: '', notes: '', setStatus: '' as '' | 'working' | 'under_maintenance',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/management/maintenance', { ...form, setStatus: form.setStatus || undefined });
      onLogged();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || t('failedToLog'));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900">
          <h2 className="text-lg font-black">{t('logMaintenance')}</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('machine')} *</span>
            <select value={form.machineId} onChange={e => setForm(f => ({ ...f, machineId: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" required>
              <option value="">{t('selectMachine')}</option>
              {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('description')} *</span>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder={t('descriptionPlaceholder')}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" required />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('costOptional')}</span>
              <input type="number" min="0" step="0.01" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            </label>
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('performedByOptional')}</span>
              <input value={form.performedBy} onChange={e => setForm(f => ({ ...f, performedBy: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            </label>
          </div>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('nextDueDateOptional')}</span>
            <input type="date" value={form.nextDueDate} onChange={e => setForm(f => ({ ...f, nextDueDate: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('updateStatusOptional')}</span>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setForm(f => ({ ...f, setStatus: f.setStatus === 'working' ? '' : 'working' }))}
                className={cn('h-9 rounded-lg text-sm font-bold border-2 transition-colors',
                  form.setStatus === 'working' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'border-slate-200 dark:border-slate-700 text-slate-500')}>
                {t('working')}
              </button>
              <button type="button" onClick={() => setForm(f => ({ ...f, setStatus: f.setStatus === 'under_maintenance' ? '' : 'under_maintenance' }))}
                className={cn('h-9 rounded-lg text-sm font-bold border-2 transition-colors',
                  form.setStatus === 'under_maintenance' ? 'border-amber-500 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'border-slate-200 dark:border-slate-700 text-slate-500')}>
                {t('under_maintenance')}
              </button>
            </div>
          </label>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={saving || !form.machineId || !form.description}
            className="w-full h-11 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {t('logMaintenance')}
          </button>
        </form>
      </div>
    </div>
  );
}
