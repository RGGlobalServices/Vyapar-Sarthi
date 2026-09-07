'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Plus, X, Loader2, Cog, Wrench, Cpu } from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { useRouter, useParams } from 'next/navigation';

type Machine = {
  id: string; name: string; machineType: string | null; purchaseDate: string | null; cost: number | null;
  status: 'working' | 'under_maintenance' | 'retired'; notes: string | null;
  _count?: { maintenanceEntries: number; spareParts: number };
  maintenanceEntries?: { serviceDate: string; nextDueDate: string | null }[];
};

const fetcher = (u: string) => api.get(u).then(r => r.data);

const statusTone = (s: string) => s === 'working'
  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
  : s === 'under_maintenance'
    ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';

export default function MachinesPage() {
  const t = useTranslations('Machines');
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const [creating, setCreating] = useState(false);

  const { data: machines = [], mutate: refetch, isLoading } = useSWR<Machine[]>(
    activeShopId ? ['/management/machines', activeShopId] : null,
    ([u]) => fetcher(u),
  );

  const stats = {
    working: machines.filter(m => m.status === 'working').length,
    underMaintenance: machines.filter(m => m.status === 'under_maintenance').length,
    retired: machines.filter(m => m.status === 'retired').length,
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Cog size={22} className="text-slate-600" /> {t('title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
        </div>
        <button onClick={() => setCreating(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors">
          <Plus size={18} /> {t('addMachine')}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label={t('working')} value={stats.working} tone="emerald" />
        <StatCard label={t('underMaintenance')} value={stats.underMaintenance} tone="amber" />
        <StatCard label={t('retired')} value={stats.retired} tone="slate" />
      </div>

      {isLoading ? (
        <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
      ) : machines.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
          <Cog size={40} className="mx-auto text-slate-300 dark:text-slate-700" />
          <p className="mt-3 text-sm text-slate-500">{t('noMachines')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {machines.map(m => (
            <div key={m.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 dark:text-white truncate">{m.name}</p>
                  {m.machineType && <p className="text-xs text-slate-500">{m.machineType}</p>}
                </div>
                <span className={cn('text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0', statusTone(m.status))}>
                  {t(m.status)}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-3 text-xs text-slate-500">
                <button onClick={() => router.push(`/${locale}/maintenance?machineId=${m.id}`)} className="flex items-center gap-1 hover:text-amber-600">
                  <Wrench size={12} /> {m._count?.maintenanceEntries ?? 0} {t('serviceCount')}
                </button>
                <span className="flex items-center gap-1">
                  <Cpu size={12} /> {m._count?.spareParts ?? 0} {t('partsCount')}
                </span>
              </div>
              {m.maintenanceEntries?.[0]?.nextDueDate && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2">
                  {t('nextService')}: {new Date(m.maintenanceEntries[0].nextDueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {creating && (
        <CreateMachineModal onClose={() => setCreating(false)} onCreated={() => { setCreating(false); refetch(); }} />
      )}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'amber' | 'slate' }) {
  const map = { emerald: 'text-emerald-500', amber: 'text-amber-500', slate: 'text-slate-400' };
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <p className={cn('text-2xl font-black', map[tone])}>{value}</p>
      <p className="text-[11px] text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

function CreateMachineModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const t = useTranslations('Machines');
  const [form, setForm] = useState({ name: '', machineType: '', purchaseDate: '', cost: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/management/machines', form);
      onCreated();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || t('failedToCreate'));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-black">{t('addMachine')}</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('machineName')} *</span>
            <input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" placeholder={t('machineNamePlaceholder')} required />
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('machineTypeOptional')}</span>
            <input value={form.machineType} onChange={e => setForm(f => ({ ...f, machineType: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" placeholder={t('machineTypePlaceholder')} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('purchaseDateOptional')}</span>
              <input type="date" value={form.purchaseDate} onChange={e => setForm(f => ({ ...f, purchaseDate: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            </label>
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('costOptional')}</span>
              <input type="number" min="0" step="0.01" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            </label>
          </div>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('notesOptional')}</span>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </label>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={saving || !form.name}
            className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {t('addMachine')}
          </button>
        </form>
      </div>
    </div>
  );
}
