'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import DeleteButton from '@/components/mill/DeleteButton';
import { Plus, X, Loader2, Truck, LogOut, ArrowRight, Search, ArrowUpFromLine } from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { useRouter, useParams } from 'next/navigation';
import { ExportButton } from '@/lib/hooks/useExport';

type GateEntry = {
  id: string; entryNumber: string; direction: 'inward' | 'outward';
  vehicleNumber: string; driverName: string | null; driverMobile: string | null;
  materialDescription: string | null; status: 'at_gate' | 'weighed' | 'exited';
  enteredAt: string; exitedAt: string | null; notes: string | null;
  hamaliAmount?: number | null;
  supplier?: { id: string; name: string } | null;
  party?: { id: string; name: string } | null;
  weighbridgeEntries?: { id: string; slipNumber: string; status: string; netWeightKg: number | null }[];
  dispatchEntries?: { id: string; dispatchNumber: string; status: string; dispatchedAt: string }[];
};

type Supplier = { id: string; name: string; mobile?: string | null };
type Party = { id: string; name: string; mobile?: string | null };

const fetcher = (u: string) => api.get(u).then(r => r.data);

const statusTone = (s: string) => s === 'exited'
  ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
  : s === 'weighed'
    ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
    : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300';

type DateFilter = 'today' | 'yesterday' | '7d' | '30d' | 'all' | 'custom';

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Resolves a date-filter chip into concrete from/to (yyyy-mm-dd) strings the
 *  API's `from`/`to` params understand. 'all' returns nulls (no filtering) —
 *  same convention the Suppliers/Purchases "All Time" chip already uses. */
function resolveRange(filter: DateFilter, customFrom: string, customTo: string): { from: string | null; to: string | null } {
  const now = new Date();
  switch (filter) {
    case 'today': return { from: isoDate(now), to: isoDate(now) };
    case 'yesterday': { const d = new Date(now); d.setDate(d.getDate() - 1); return { from: isoDate(d), to: isoDate(d) }; }
    case '7d': { const d = new Date(now); d.setDate(d.getDate() - 6); return { from: isoDate(d), to: isoDate(now) }; }
    case '30d': { const d = new Date(now); d.setDate(d.getDate() - 29); return { from: isoDate(d), to: isoDate(now) }; }
    case 'custom': return { from: customFrom || null, to: customTo || null };
    case 'all': default: return { from: null, to: null };
  }
}

export default function GateEntryPage() {
  const t = useTranslations('GateEntry');
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const activeShopId = useBusinessStore(s => s.activeShopId);

  const [dateFilter, setDateFilter] = useState<DateFilter>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [search, setSearch] = useState('');
  const [directionFilter, setDirectionFilter] = useState<'' | 'inward' | 'outward'>('');
  const [statusFilter, setStatusFilter] = useState<'' | 'at_gate' | 'weighed' | 'exited'>('');

  const { from, to } = useMemo(() => resolveRange(dateFilter, customFrom, customTo), [dateFilter, customFrom, customTo]);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    if (search.trim()) p.set('search', search.trim());
    if (directionFilter) p.set('direction', directionFilter);
    if (statusFilter) p.set('status', statusFilter);
    const qs = p.toString();
    return qs ? `?${qs}` : '';
  }, [from, to, search, directionFilter, statusFilter]);

  const { data: entries = [], mutate: refetch, isLoading } = useSWR<GateEntry[]>(
    activeShopId ? ['/mill/gate-entries', activeShopId, queryString] : null,
    ([u, , qs]) => fetcher(`${u}${qs}`),
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
  const [quickDispatch, setQuickDispatch] = useState<GateEntry | null>(null);

  const stats = {
    atGate: entries.filter(e => e.status === 'at_gate').length,
    weighed: entries.filter(e => e.status === 'weighed').length,
    exitedToday: entries.filter(e => e.status === 'exited' && e.exitedAt && isToday(e.exitedAt)).length,
  };

  const exportRows = useMemo(() => entries.map(e => ({
    entryNumber: e.entryNumber,
    date: e.enteredAt,
    timeIn: new Date(e.enteredAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    timeOut: e.exitedAt ? new Date(e.exitedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '',
    direction: e.direction === 'inward' ? t('inward') : t('outward'),
    vehicleNumber: e.vehicleNumber,
    driverName: e.driverName || '',
    party: e.supplier?.name || e.party?.name || '',
    materialDescription: e.materialDescription || '',
    status: t(e.status),
    weight: e.weighbridgeEntries?.[0]?.netWeightKg != null ? `${e.weighbridgeEntries[0].netWeightKg} Kg` : '',
  })), [entries, t]);

  const dateRangeLabel = dateFilter === 'all'
    ? t('dateAllTime')
    : from && to
      ? (from === to ? new Date(from).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : `${new Date(from).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${new Date(to).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`)
      : undefined;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Truck size={22} className="text-amber-600" /> {t('title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ExportButton
            filename="gate_entry_register"
            title={t('registerTitle')}
            dateRange={dateRangeLabel}
            summary={[
              { label: t('statTotalEntries'), value: String(entries.length) },
              { label: t('inward'), value: String(entries.filter(e => e.direction === 'inward').length) },
              { label: t('outward'), value: String(entries.filter(e => e.direction === 'outward').length) },
            ]}
            columns={[
              { key: 'entryNumber', label: t('colEntryNo') },
              { key: 'date', label: t('colDate'), type: 'date' },
              { key: 'timeIn', label: t('colTimeIn') },
              { key: 'timeOut', label: t('colTimeOut') },
              { key: 'direction', label: t('colDirection') },
              { key: 'vehicleNumber', label: t('vehicleNumber') },
              { key: 'driverName', label: t('driverName') },
              { key: 'party', label: t('colSupplierParty') },
              { key: 'materialDescription', label: t('materialDescription') },
              { key: 'weight', label: t('colWeight') },
              { key: 'status', label: t('colStatus') },
            ]}
            data={exportRows}
            // 11 columns is too wide for A4 portrait — autoTable was squeezing
            // headers into ~55px cells, wrapping every word letter-by-letter
            // ("Tim e In", "Directio n"). Landscape gives ~40% more page width
            // so the same 9pt header text lays out normally instead.
            orientation="landscape"
          />
          <button
            onClick={() => setCreating(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors"
          >
            <Plus size={18} /> {t('newEntry')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label={t('statAtGate')} value={stats.atGate} tone="amber" />
        <StatCard label={t('statWeighed')} value={stats.weighed} tone="blue" />
        <StatCard label={t('statExitedToday')} value={stats.exitedToday} tone="emerald" />
      </div>

      {/* ── Filters: date range, search, direction/status — everything the
          register table + export below reads from. */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {(['today', 'yesterday', '7d', '30d', 'all', 'custom'] as DateFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setDateFilter(f)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
                dateFilter === f
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              )}
            >
              {t(`date${f === '7d' ? '7Days' : f === '30d' ? '30Days' : f.charAt(0).toUpperCase() + f.slice(1)}`)}
            </button>
          ))}
        </div>

        {dateFilter === 'custom' && (
          <div className="flex items-center gap-2 flex-wrap">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="h-9 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            <span className="text-xs text-slate-400">{t('to')}</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="h-9 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </div>
        )}

        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full h-9 pl-9 pr-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
            />
          </div>
          <select value={directionFilter} onChange={e => setDirectionFilter(e.target.value as any)}
            className="h-9 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm">
            <option value="">{t('filterAllDirections')}</option>
            <option value="inward">{t('inward')}</option>
            <option value="outward">{t('outward')}</option>
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
            className="h-9 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm">
            <option value="">{t('filterAllStatuses')}</option>
            <option value="at_gate">{t('at_gate')}</option>
            <option value="weighed">{t('weighed')}</option>
            <option value="exited">{t('exited')}</option>
          </select>
        </div>
      </div>

      {/* ── Register table — a diary-style row per entry, sorted newest first,
          same data the export buttons above turn into PDF/Excel/CSV/Print. */}
      {isLoading ? (
        <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
          <Truck size={40} className="mx-auto text-slate-300 dark:text-slate-700" />
          <p className="mt-3 text-sm text-slate-500">{t('noEntries')}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-[10px] uppercase tracking-wider text-slate-500">
                <th className="text-left px-4 py-2.5 font-bold">{t('colEntryNo')}</th>
                <th className="text-left px-3 py-2.5 font-bold">{t('colDate')}</th>
                <th className="text-left px-3 py-2.5 font-bold">{t('colTimeIn')}</th>
                <th className="text-left px-3 py-2.5 font-bold">{t('colTimeOut')}</th>
                <th className="text-left px-3 py-2.5 font-bold">{t('vehicleNumber')}</th>
                <th className="text-left px-3 py-2.5 font-bold">{t('driverName')}</th>
                <th className="text-left px-3 py-2.5 font-bold">{t('colSupplierParty')}</th>
                <th className="text-left px-3 py-2.5 font-bold">{t('materialDescription')}</th>
                <th className="text-left px-3 py-2.5 font-bold">{t('colWeight')}</th>
                <th className="text-left px-4 py-2.5 font-bold">{t('colStatus')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {entries.map(e => (
                <tr key={e.id} onClick={() => setSelectedId(e.id)} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors">
                  <td className="px-4 py-2.5 font-black text-slate-900 dark:text-white whitespace-nowrap">
                    {e.entryNumber}
                    <span className={cn('ml-2 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full', e.direction === 'inward' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400')}>
                      {e.direction === 'inward' ? t('inward') : t('outward')}
                    </span>
                    {e.dispatchEntries && e.dispatchEntries.length > 0 && (
                      <span className="ml-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400">
                        DC
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    {new Date(e.enteredAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    {new Date(e.enteredAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    {e.exitedAt ? new Date(e.exitedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                  </td>
                  <td className="px-3 py-2.5 font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">{e.vehicleNumber}</td>
                  <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{e.driverName || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-500">{e.supplier?.name || e.party?.name || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-500">{e.materialDescription || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">
                    {e.weighbridgeEntries && e.weighbridgeEntries.length > 0 && e.weighbridgeEntries[0].netWeightKg != null
                      ? `${e.weighbridgeEntries[0].netWeightKg} Kg` : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={cn('text-[10px] font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap', statusTone(e.status))}>
                        {t(e.status)}
                      </span>
                      <DeleteButton url={`/mill/gate-entries/${e.id}`} name={e.entryNumber} onDone={() => refetch()} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
          onNewDispatch={() => { setQuickDispatch(selected); setSelectedId(null); }}
        />
      )}

      {quickDispatch && (
        <QuickDispatchModal
          gateEntry={quickDispatch}
          parties={parties}
          onClose={() => setQuickDispatch(null)}
          onCreated={() => { setQuickDispatch(null); refetch(); }}
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
    supplierId: '', partyId: '', materialDescription: '', notes: '', hamaliAmount: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/mill/gate-entries', {
        ...form,
        supplierId: form.supplierId || null,
        partyId: form.partyId || null,
        hamaliAmount: form.hamaliAmount ? Number(form.hamaliAmount) : null,
      });
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
          <Field label="Hamali Amount (₹)">
            <input type="number" min="0" step="0.01" value={form.hamaliAmount} onChange={e => setForm(f => ({ ...f, hamaliAmount: e.target.value }))}
              placeholder="0 (optional)"
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            {form.hamaliAmount && Number(form.hamaliAmount) > 0 && (
              <p className="text-[11px] text-yellow-600 dark:text-yellow-400 mt-1">Auto Hamali / Labour expense create होईल</p>
            )}
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

function EntryDetailModal({ entry, onClose, onChanged, onSendToWeighbridge, onNewDispatch }: {
  entry: GateEntry; onClose: () => void; onChanged: () => void; onSendToWeighbridge: () => void; onNewDispatch: () => void;
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
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900">
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
          {entry.hamaliAmount != null && entry.hamaliAmount > 0 && (
            <Row label="Hamali Amount" value={`₹${entry.hamaliAmount.toLocaleString('en-IN')}`} />
          )}

          {entry.dispatchEntries && entry.dispatchEntries.length > 0 && (
            <div className="mt-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Dispatches</p>
              {entry.dispatchEntries.map(d => (
                <div key={d.id} className="flex items-center justify-between text-xs py-1">
                  <span className="font-bold text-blue-700 dark:text-blue-400">{d.dispatchNumber}</span>
                  <span className="text-slate-400">{new Date(d.dispatchedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="p-6 pt-0 flex flex-col gap-2">
          {entry.direction === 'outward' && (
            <button onClick={onNewDispatch} className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold flex items-center justify-center gap-2">
              <ArrowUpFromLine size={15} /> New Dispatch
            </button>
          )}
          {entry.status !== 'exited' && (
            <button onClick={onSendToWeighbridge} className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold flex items-center justify-center gap-2">
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

const DISPATCH_TYPES = ['sale', 'sample', 'transfer', 'job_work', 'other'];
const DISPATCH_TYPE_LABELS: Record<string, string> = { sale: 'Sale', sample: 'Sample', transfer: 'Transfer', job_work: 'Job Work', other: 'Other' };

function QuickDispatchModal({ gateEntry, parties, onClose, onCreated }: {
  gateEntry: GateEntry; parties: Party[]; onClose: () => void; onCreated: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    partyId: '', dispatchType: 'sale', noOfBags: '', quantity: '', notes: '', dispatchedAt: today,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/logistics/dispatch', {
        gateEntryId: gateEntry.id,
        vehicleNumber: gateEntry.vehicleNumber,
        driverName: gateEntry.driverName || null,
        partyId: form.partyId || null,
        dispatchType: form.dispatchType,
        noOfBags: form.noOfBags ? Number(form.noOfBags) : null,
        quantity: form.quantity ? Number(form.quantity) : null,
        notes: form.notes || null,
        dispatchedAt: form.dispatchedAt || null,
      });
      onCreated();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || 'Failed to create dispatch');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black flex items-center gap-2"><ArrowUpFromLine size={16} className="text-blue-600" /> New Dispatch</h2>
            <p className="text-xs text-slate-500 mt-0.5">{gateEntry.vehicleNumber} · {gateEntry.entryNumber}</p>
          </div>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Party</span>
            <select value={form.partyId} onChange={e => setForm(f => ({ ...f, partyId: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm">
              <option value="">No Party</option>
              {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Dispatch Type</span>
            <select value={form.dispatchType} onChange={e => setForm(f => ({ ...f, dispatchType: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm">
              {DISPATCH_TYPES.map(t => <option key={t} value={t}>{DISPATCH_TYPE_LABELS[t]}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">No. of Bags</span>
              <input type="number" min="0" step="1" value={form.noOfBags} onChange={e => setForm(f => ({ ...f, noOfBags: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            </label>
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Qty (kg)</span>
              <input type="number" min="0" step="0.01" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            </label>
          </div>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Dispatch Date</span>
            <input type="date" value={form.dispatchedAt} onChange={e => setForm(f => ({ ...f, dispatchedAt: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Notes</span>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </label>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={saving}
            className="w-full h-11 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Create Dispatch
          </button>
        </form>
      </div>
    </div>
  );
}
