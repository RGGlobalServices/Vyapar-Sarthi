'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Plus, X, Loader2, Cpu, ArrowDown, ArrowUp, AlertTriangle } from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

type SparePart = {
  id: string; name: string; quantity: number; minStock: number | null; unitCost: number | null; notes: string | null;
  machine?: { id: string; name: string } | null;
};
type Machine = { id: string; name: string };

const fetcher = (u: string) => api.get(u).then(r => r.data);
const rupee = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export default function SparePartsPage() {
  const t = useTranslations('SpareParts');
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const [creating, setCreating] = useState(false);
  const [movementModal, setMovementModal] = useState<{ part: SparePart; type: 'in' | 'out' } | null>(null);

  const { data: parts = [], mutate: refetch, isLoading } = useSWR<SparePart[]>(
    activeShopId ? ['/management/spare-parts', activeShopId] : null,
    ([u]) => fetcher(u),
  );
  const { data: machines = [] } = useSWR<Machine[]>(
    activeShopId ? ['/management/machines', activeShopId] : null,
    ([u]) => fetcher(u),
  );

  const lowStockCount = parts.filter(p => p.minStock != null && p.quantity <= p.minStock).length;

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Cpu size={22} className="text-blue-600" /> {t('title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
        </div>
        <button onClick={() => setCreating(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors">
          <Plus size={18} /> {t('addPart')}
        </button>
      </div>

      {lowStockCount > 0 && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-3 flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle size={16} /> {t('lowStockWarning', { count: lowStockCount })}
        </div>
      )}

      {isLoading ? (
        <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
      ) : parts.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
          <Cpu size={40} className="mx-auto text-slate-300 dark:text-slate-700" />
          <p className="mt-3 text-sm text-slate-500">{t('noParts')}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {parts.map(p => {
              const low = p.minStock != null && p.quantity <= p.minStock;
              return (
                <li key={p.id} className="p-4 flex items-center justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 dark:text-white">{p.name}</span>
                      {low && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400">{t('lowStock')}</span>}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {p.machine?.name ? `${p.machine.name} · ` : ''}
                      {p.unitCost != null ? `${rupee(p.unitCost)}/unit` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={cn('text-lg font-black', low ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white')}>{p.quantity}</span>
                    <button onClick={() => setMovementModal({ part: p, type: 'in' })} className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 hover:bg-emerald-100" title={t('stockIn')}>
                      <ArrowDown size={14} />
                    </button>
                    <button onClick={() => setMovementModal({ part: p, type: 'out' })} className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-500/10 text-rose-600 hover:bg-rose-100" title={t('stockOut')}>
                      <ArrowUp size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {creating && (
        <CreatePartModal machines={machines} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); refetch(); }} />
      )}
      {movementModal && (
        <MovementModal
          part={movementModal.part}
          type={movementModal.type}
          onClose={() => setMovementModal(null)}
          onSaved={() => { setMovementModal(null); refetch(); }}
        />
      )}
    </div>
  );
}

function CreatePartModal({ machines, onClose, onCreated }: { machines: Machine[]; onClose: () => void; onCreated: () => void }) {
  const t = useTranslations('SpareParts');
  const [form, setForm] = useState({ name: '', machineId: '', quantity: '', minStock: '', unitCost: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/management/spare-parts', form);
      onCreated();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || t('failedToCreate'));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-black">{t('addPart')}</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('partName')} *</span>
            <input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" required />
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('machineOptional')}</span>
            <select value={form.machineId} onChange={e => setForm(f => ({ ...f, machineId: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm">
              <option value="">{t('noMachine')}</option>
              {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('openingQty')}</span>
              <input type="number" min="0" step="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            </label>
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('minStock')}</span>
              <input type="number" min="0" step="1" value={form.minStock} onChange={e => setForm(f => ({ ...f, minStock: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            </label>
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('unitCost')}</span>
              <input type="number" min="0" step="0.01" value={form.unitCost} onChange={e => setForm(f => ({ ...f, unitCost: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            </label>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={saving || !form.name}
            className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {t('addPart')}
          </button>
        </form>
      </div>
    </div>
  );
}

function MovementModal({ part, type, onClose, onSaved }: { part: SparePart; type: 'in' | 'out'; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations('SpareParts');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post(`/management/spare-parts/${part.id}/movements`, { type, quantity: Number(quantity), note });
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || t('failedToSave'));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-black">{type === 'in' ? t('stockIn') : t('stockOut')}</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{part.name} — {t('currentStock')}: {part.quantity}</p>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('quantity')} *</span>
            <input type="number" min="0" step="1" autoFocus max={type === 'out' ? part.quantity : undefined} value={quantity} onChange={e => setQuantity(e.target.value)}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" required />
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('notesOptional')}</span>
            <input value={note} onChange={e => setNote(e.target.value)}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </label>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={saving || !quantity}
            className={cn('w-full h-11 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2',
              type === 'in' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700')}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : (type === 'in' ? <ArrowDown size={16} /> : <ArrowUp size={16} />)}
            {type === 'in' ? t('stockIn') : t('stockOut')}
          </button>
        </form>
      </div>
    </div>
  );
}
