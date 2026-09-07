'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Plus, X, Loader2, Truck, LogOut, ArrowRight } from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { useRouter, useParams } from 'next/navigation';

type GateEntry = {
  id: string; entryNumber: string; direction: 'inward' | 'outward';
  vehicleNumber: string; driverName: string | null; driverMobile: string | null;
  materialDescription: string | null; status: 'at_gate' | 'weighed' | 'exited';
  enteredAt: string; exitedAt: string | null; notes: string | null;
  supplier?: { id: string; name: string } | null;
  party?: { id: string; name: string } | null;
  weighbridgeEntries?: { id: string; slipNumber: string; status: string; netWeightKg: number | null }[];
};

type Supplier = { id: string; name: string; mobile?: string | null };
type Party = { id: string; name: string; mobile?: string | null };

const fetcher = (u: string) => api.get(u).then(r => r.data);

const statusTone = (s: string) => s === 'exited'
  ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
  : s === 'weighed'
    ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
    : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300';

export default function GateEntryPage() {
  const t = useTranslations('GateEntry');
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const activeShopId = useBusinessStore(s => s.activeShopId);

  const { data: entries = [], mutate: refetch, isLoading } = useSWR<GateEntry[]>(
    activeShopId ? ['/mill/gate-entries', activeShopId] : null,
    ([u]) => fetcher(u),
    { revalidateOnFocus: true }
  );
  const { data: suppliers = [] } = useSWR<Supplier[]>(
    activeShopId ? ['/suppliers', activeShopId] : null,
    ([u]) => fetcher(u),
  );
  const { data: parties = [] } = useSWR<Party[]>(
    activeShopId ? ['/crm/customers?type=party', activeShopId] : null,
    ([u]) => fetcher(u),
  );

  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = entries.find(e => e.id === selectedId) || null;

  const stats = {
    atGate: entries.filter(e => e.status === 'at_gate').length,
    weighed: entries.filter(e => e.status === 'weighed').length,
    exitedToday: entries.filter(e => e.status === 'exited' && e.exitedAt && isToday(e.exitedAt)).length,
  };

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Truck size={22} className="text-amber-600" /> {t('title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors"
        >
          <Plus size={18} /> {t('newEntry')}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label={t('statAtGate')} value={stats.atGate} tone="amber" />
        <StatCard label={t('statWeighed')} value={stats.weighed} tone="blue" />
        <StatCard label={t('statExitedToday')} value={stats.exitedToday} tone="emerald" />
      </div>

      {isLoading ? (
        <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
          <Truck size={40} className="mx-auto text-slate-300 dark:text-slate-700" />
          <p className="mt-3 text-sm text-slate-500">{t('noEntries')}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {entries.map(e => (
              <li key={e.id} onClick={() => setSelectedId(e.id)} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-slate-900 dark:text-white">{e.entryNumber}</span>
                      <span className={cn('text-[10px] font-bold uppercase px-2 py-0.5 rounded-full', statusTone(e.status))}>
                        {t(e.status)}
                      </span>
                      <span className="text-xs font-semibold text-slate-500">{e.vehicleNumber}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {e.supplier?.name ? `${e.supplier.name} · ` : ''}
                      {e.party?.name ? `${e.party.name} · ` : ''}
                      {e.materialDescription ? `${e.materialDescription} · ` : ''}
                      {new Date(e.enteredAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  {e.weighbridgeEntries && e.weighbridgeEntries.length > 0 && (
                    <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                      {e.weighbridgeEntries[0].slipNumber}
                      {e.weighbridgeEntries[0].netWeightKg != null && ` · ${e.weighbridgeEntries[0].netWeightKg} Kg`}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {creating && (
        <CreateEntryModal
          suppliers={suppliers}
          parties={parties}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); refetch(); }}
        />
      )}

      {selected && (
        <EntryDetailModal
          entry={selected}
          onClose={() => setSelectedId(null)}
          onChanged={refetch}
          onSendToWeighbridge={() => router.push(`/${locale}/weighbridge?gateEntryId=${selected.id}`)}
        />
      )}
    </div>
  );
}

function isToday(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: 'amber' | 'blue' | 'emerald' }) {
  const map = { amber: 'text-amber-500', blue: 'text-blue-500', emerald: 'text-emerald-500' };
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <p className={cn('text-2xl font-black', map[tone])}>{value}</p>
      <p className="text-[11px] text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

function CreateEntryModal({ suppliers, parties, onClose, onCreated }: {
  suppliers: Supplier[]; parties: Party[]; onClose: () => void; onCreated: () => void;
}) {
  const t = useTranslations('GateEntry');
  const [form, setForm] = useState({
    vehicleNumber: '', driverName: '', driverMobile: '', direction: 'inward' as 'inward' | 'outward',
    supplierId: '', partyId: '', materialDescription: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/mill/gate-entries', { ...form, supplierId: form.supplierId || null, partyId: form.partyId || null });
      onCreated();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || t('failedToCreate'));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900">
          <h2 className="text-lg font-black">{t('newEntry')}</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setForm(f => ({ ...f, direction: 'inward' }))}
              className={cn('h-10 rounded-lg text-sm font-bold border-2 transition-colors',
                form.direction === 'inward' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'border-slate-200 dark:border-slate-700 text-slate-500')}>
              {t('inward')}
            </button>
            <button type="button" onClick={() => setForm(f => ({ ...f, direction: 'outward' }))}
              className={cn('h-10 rounded-lg text-sm font-bold border-2 transition-colors',
                form.direction === 'outward' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'border-slate-200 dark:border-slate-700 text-slate-500')}>
              {t('outward')}
            </button>
          </div>
          <Field label={t('vehicleNumber')} required>
            <input autoFocus value={form.vehicleNumber} onChange={e => setForm(f => ({ ...f, vehicleNumber: e.target.value.toUpperCase() }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" placeholder="MH12AB1234" required />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('driverName')}>
              <input value={form.driverName} onChange={e => setForm(f => ({ ...f, driverName: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            </Field>
            <Field label={t('driverMobile')}>
              <input value={form.driverMobile} onChange={e => setForm(f => ({ ...f, driverMobile: e.target.value.replace(/[^0-9]/g, '').slice(0, 10) }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" inputMode="numeric" />
            </Field>
          </div>
          {form.direction === 'inward' ? (
            <Field label={t('supplier')}>
              <select value={form.supplierId} onChange={e => setForm(f => ({ ...f, supplierId: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm">
                <option value="">{t('noSupplier')}</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          ) : (
            <Field label={t('party')}>
              <select value={form.partyId} onChange={e => setForm(f => ({ ...f, partyId: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm">
                <option value="">{t('noParty')}</option>
                {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          )}
          <Field label={t('materialDescription')}>
            <input value={form.materialDescription} onChange={e => setForm(f => ({ ...f, materialDescription: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" placeholder={t('materialPlaceholder')} />
          </Field>
          <Field label={t('notesOptional')}>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </Field>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={saving || !form.vehicleNumber}
            className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {t('createEntry')}
          </button>
        </form>
      </div>
    </div>
  );
}

function EntryDetailModal({ entry, onClose, onChanged, onSendToWeighbridge }: {
  entry: GateEntry; onClose: () => void; onChanged: () => void; onSendToWeighbridge: () => void;
}) {
  const t = useTranslations('GateEntry');
  const [marking, setMarking] = useState(false);

  const markExited = async () => {
    setMarking(true);
    try {
      await api.patch(`/mill/gate-entries/${entry.id}`, { markExited: true });
      onChanged(); onClose();
    } catch (err: any) {
      alert(err?.response?.data?.detail || t('failedToUpdate'));
    } finally { setMarking(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black flex items-center gap-2">
              {entry.entryNumber}
              <span className={cn('text-[10px] font-bold uppercase px-2 py-0.5 rounded-full', statusTone(entry.status))}>{t(entry.status)}</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">{entry.vehicleNumber}{entry.driverName ? ` · ${entry.driverName}` : ''}</p>
          </div>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <div className="p-6 space-y-3 text-sm">
          {entry.supplier?.name && <Row label={t('supplier')} value={entry.supplier.name} />}
          {entry.party?.name && <Row label={t('party')} value={entry.party.name} />}
          {entry.materialDescription && <Row label={t('materialDescription')} value={entry.materialDescription} />}
          <Row label={t('enteredAt')} value={new Date(entry.enteredAt).toLocaleString('en-IN')} />
          {entry.exitedAt && <Row label={t('exitedAt')} value={new Date(entry.exitedAt).toLocaleString('en-IN')} />}
          {entry.notes && <Row label={t('notesOptional')} value={entry.notes} />}
        </div>
        <div className="p-6 pt-0 flex flex-col gap-2">
          {entry.status !== 'exited' && (
            <button onClick={onSendToWeighbridge} className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold flex items-center justify-center gap-2">
              {t('sendToWeighbridge')} <ArrowRight size={15} />
            </button>
          )}
          {entry.status !== 'exited' && (
            <button onClick={markExited} disabled={marking} className="w-full h-10 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50">
              {marking ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />}
              {t('markExited')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{label}{required && ' *'}</span>
      {children}
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-bold uppercase text-slate-400">{label}</span>
      <span className="text-slate-800 dark:text-slate-200 font-semibold text-right">{value}</span>
    </div>
  );
}
