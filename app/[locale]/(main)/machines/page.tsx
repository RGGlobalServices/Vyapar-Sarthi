'use client';

import { useMemo, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import {
  Plus, X, Loader2, Cog, Wrench, Cpu, Power, CheckCircle2, Gauge,
  Sparkles, Search, SlidersHorizontal, Edit3, Trash2, Check,
  AlertTriangle, ShieldCheck, ChevronRight, Layers, ArrowUpRight,
  Zap, Info, Filter, ArrowRight
} from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { useRouter, useParams } from 'next/navigation';
import { MILL_MACHINE_PRESETS, MillMachinePreset } from '@/lib/millMachinePresets';

type DowntimeRow = {
  id: string;
  machineId: string;
  reason: string | null;
  startedAt: string;
  endedAt: string | null;
  notes: string | null;
};

type Machine = {
  id: string;
  name: string;
  machineType: string | null;
  purchaseDate: string | null;
  cost: number | null;
  status: 'working' | 'under_maintenance' | 'retired';
  notes: string | null;
  _count?: { maintenanceEntries: number; spareParts: number };
  maintenanceEntries?: { serviceDate: string; nextDueDate: string | null }[];
  downtimes?: DowntimeRow[];
};

function computeAvailabilityPct(downtimes: DowntimeRow[]): number | null {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const elapsedMs = now.getTime() - monthStart.getTime();
  if (elapsedMs <= 0) return null;
  let downMs = 0;
  for (const d of downtimes) {
    const start = new Date(d.startedAt);
    const end = d.endedAt ? new Date(d.endedAt) : now;
    const clippedStart = start < monthStart ? monthStart : start;
    const clippedEnd = end > now ? now : end;
    if (clippedEnd > clippedStart) downMs += clippedEnd.getTime() - clippedStart.getTime();
  }
  const pct = ((elapsedMs - downMs) / elapsedMs) * 100;
  return Math.max(0, Math.round(pct * 10) / 10);
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (hours <= 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

const fetcher = (u: string) => api.get(u).then(r => r.data);

const statusTone = (s: string) =>
  s === 'working'
    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
    : s === 'under_maintenance'
    ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 border-amber-200 dark:border-amber-800'
    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700';

export default function MachinesPage() {
  const t = useTranslations('Machines');
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const { mutate } = useSWRConfig();

  const [creating, setCreating] = useState(false);
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);
  const [showPresetsModal, setShowPresetsModal] = useState(false);
  const [reportingFor, setReportingFor] = useState<Machine | null>(null);
  const [loggingMaintFor, setLoggingMaintFor] = useState<Machine | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'working' | 'under_maintenance' | 'retired'>('all');

  const { data: machines = [], mutate: refetch, isLoading } = useSWR<Machine[]>(
    activeShopId ? ['/management/machines', activeShopId] : null,
    ([u]) => fetcher(u)
  );

  const { data: downtimeHistory = [] } = useSWR<DowntimeRow[]>(
    activeShopId ? ['/management/machine-downtime', activeShopId] : null,
    ([u]) => fetcher(u)
  );

  const downtimesByMachine = useMemo(() => {
    const map = new Map<string, DowntimeRow[]>();
    for (const d of downtimeHistory) {
      if (!map.has(d.machineId)) map.set(d.machineId, []);
      map.get(d.machineId)!.push(d);
    }
    return map;
  }, [downtimeHistory]);

  const stats = useMemo(() => ({
    total: machines.length,
    working: machines.filter(m => m.status === 'working').length,
    underMaintenance: machines.filter(m => m.status === 'under_maintenance').length,
    retired: machines.filter(m => m.status === 'retired').length,
  }), [machines]);

  const filteredMachines = useMemo(() => {
    return machines.filter(m => {
      // Status filter
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = m.name.toLowerCase().includes(q);
        const matchesType = (m.machineType || '').toLowerCase().includes(q);
        const matchesNotes = (m.notes || '').toLowerCase().includes(q);
        if (!matchesName && !matchesType && !matchesNotes) return false;
      }
      return true;
    });
  }, [machines, statusFilter, searchQuery]);

  const handleQuickStatusToggle = async (m: Machine) => {
    const nextStatus = m.status === 'working' ? 'under_maintenance' : 'working';
    try {
      await api.patch(`/management/machines/${m.id}`, { status: nextStatus });
      refetch();
      mutate('/mill/machines');
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to update machine status');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(locale === 'mr' ? 'तुम्हाला नक्की ही मशीन हटवायची आहे का?' : 'Are you sure you want to delete this machine?')) return;
    setDeletingId(id);
    try {
      await api.delete(`/management/machines/${id}`);
      refetch();
      mutate('/mill/machines');
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to delete machine');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-6 space-y-6">
      {/* Header & Main Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 shadow-xs">
            <Cog size={24} className="animate-spin-slow" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {locale === 'mr' ? 'मशीन व उपकरणे (Machines & Equipment)' : t('title')}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              {locale === 'mr'
                ? 'मिलमधील सर्व यंत्रसामग्री, चालू/बंद स्थिती, मेंटेनन्स व प्रोडक्शन कनेक्शन.'
                : t('subtitle')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
          {/* Quick Add Presets Button */}
          <button
            onClick={() => setShowPresetsModal(true)}
            className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-sm flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            <Sparkles size={16} />
            <span>{locale === 'mr' ? '⚡ मिल मशीन प्रीसेट्स' : '⚡ Mill Presets'}</span>
          </button>

          {/* Custom Machine Add Button */}
          <button
            onClick={() => setCreating(true)}
            className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            <Plus size={18} />
            <span>{t('addMachine')}</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            {locale === 'mr' ? 'एकूण मशिन्स' : 'Total Machines'}
          </p>
          <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-1">{stats.total}</p>
        </div>
        <div className="p-3.5 sm:p-4 rounded-2xl border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            {locale === 'mr' ? 'सुरू (Working)' : t('working')}
          </p>
          <p className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{stats.working}</p>
        </div>
        <div className="p-3.5 sm:p-4 rounded-2xl border border-amber-100 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            {locale === 'mr' ? 'दुरुस्तीत (Maintenance)' : t('underMaintenance')}
          </p>
          <p className="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400 mt-1">{stats.underMaintenance}</p>
        </div>
        <div className="p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            {locale === 'mr' ? 'बंद (Retired)' : t('retired')}
          </p>
          <p className="text-2xl sm:text-3xl font-black text-slate-600 dark:text-slate-400 mt-1">{stats.retired}</p>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-2.5 sm:p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              locale === 'mr'
                ? 'मशीनचे नाव, प्रकार किंवा मॉडेल शोधा...'
                : 'Search machines by name, type, specs...'
            }
            className="w-full pl-9 pr-8 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar bg-slate-100 dark:bg-slate-950 p-1 rounded-xl">
          {[
            { key: 'all', label: locale === 'mr' ? 'सर्व' : 'All', count: stats.total },
            { key: 'working', label: locale === 'mr' ? 'सुरू' : 'Working', count: stats.working },
            { key: 'under_maintenance', label: locale === 'mr' ? 'दुरुस्तीत' : 'In Service', count: stats.underMaintenance },
            { key: 'retired', label: locale === 'mr' ? 'बंद' : 'Retired', count: stats.retired },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key as any)}
              className={cn(
                'px-3 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5',
                statusFilter === tab.key
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              )}
            >
              <span>{tab.label}</span>
              <span
                className={cn(
                  'text-[10px] px-1.5 py-0.2 rounded-full',
                  statusFilter === tab.key
                    ? 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
                    : 'bg-slate-200/60 dark:bg-slate-800 text-slate-500'
                )}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content: Machine Cards Grid */}
      {isLoading ? (
        <div className="p-16 flex flex-col items-center justify-center text-slate-400">
          <Loader2 className="animate-spin text-emerald-500 mb-3" size={32} />
          <p className="text-sm font-semibold">{locale === 'mr' ? 'मशीन्स लोड होत आहेत...' : 'Loading machines...'}</p>
        </div>
      ) : filteredMachines.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 p-8 sm:p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
            <Cog size={36} />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-4">
            {machines.length === 0
              ? locale === 'mr'
                ? 'कोणतीही मशीन जोडलेली नाही'
                : 'No machines in register yet'
              : locale === 'mr'
              ? 'शोध परिणामात कोणतीही मशीन सापडली नाही'
              : 'No matching machines found'}
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-md mx-auto">
            {machines.length === 0
              ? locale === 'mr'
                ? 'मिलमधील क्लीनर, डेस्टोनर, शेलर, व्हाइटनर, सॉर्टेक्स व पॅकिंग मशीन्स 1-क्लिक प्रीसेटमधून जोडा किंवा नवीन तयार करा.'
                : 'Add standard mill machines from our pre-configured presets library or register custom equipment.'
              : locale === 'mr'
              ? 'कृपया फिल्टर किंवा शोध शब्द बदलून पुन्हा प्रयत्न करा.'
              : 'Try clearing your search query or changing filters.'}
          </p>
          {machines.length === 0 && (
            <div className="flex items-center justify-center gap-3 mt-6 flex-wrap">
              <button
                onClick={() => setShowPresetsModal(true)}
                className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-md flex items-center gap-2 transition-all"
              >
                <Sparkles size={16} />
                <span>{locale === 'mr' ? '⚡ मिल मशीन प्रीसेट्स पहा' : '⚡ Explore Mill Presets'}</span>
              </button>
              <button
                onClick={() => setCreating(true)}
                className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-all flex items-center gap-2"
              >
                <Plus size={16} />
                <span>{locale === 'mr' ? 'कस्टम मशीन जोडा' : 'Add Custom Machine'}</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
          {filteredMachines.map(m => {
            const openDowntime = m.downtimes?.[0];
            const availability = computeAvailabilityPct(downtimesByMachine.get(m.id) || []);
            const isWorking = m.status === 'working';
            const isMaint = m.status === 'under_maintenance';

            return (
              <div
                key={m.id}
                className={cn(
                  'rounded-2xl border bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs transition-all hover:shadow-md flex flex-col justify-between group',
                  openDowntime
                    ? 'border-red-200 dark:border-red-900/50 bg-red-50/20'
                    : 'border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                )}
              >
                {/* Header: Title & Status Badge */}
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">⚙️</span>
                        <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate" title={m.name}>
                          {m.name}
                        </h3>
                      </div>
                      {m.machineType && (
                        <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mt-1 flex items-center gap-1 truncate">
                          <Layers size={12} className="shrink-0" /> {m.machineType}
                        </p>
                      )}
                    </div>

                    {/* Status Pill with Quick Toggle */}
                    <button
                      onClick={() => handleQuickStatusToggle(m)}
                      title={locale === 'mr' ? 'स्थिती बदलण्यासाठी क्लिक करा' : 'Click to toggle Working / In Service'}
                      className={cn(
                        'text-[10px] font-black uppercase px-2.5 py-1 rounded-full border transition-all active:scale-95 shrink-0 flex items-center gap-1 shadow-2xs',
                        statusTone(m.status)
                      )}
                    >
                      {isWorking && <CheckCircle2 size={11} />}
                      {isMaint && <Wrench size={11} />}
                      {m.status === 'retired' && <Power size={11} />}
                      <span>{t(m.status)}</span>
                    </button>
                  </div>

                  {/* Notes / Specs details */}
                  {m.notes && (
                    <div className="mt-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800/80 text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {m.notes}
                    </div>
                  )}

                  {/* Metrics & Maintenance Info */}
                  <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <Wrench size={13} className="text-amber-500 shrink-0" />
                      <span>{m._count?.maintenanceEntries ?? 0} {locale === 'mr' ? 'सर्व्हिस' : 'services'}</span>
                    </div>

                    {availability != null && m.status !== 'retired' && (
                      <div className="flex items-center gap-1.5 text-slate-500" title="Monthly Uptime %">
                        <Gauge size={13} className="text-emerald-500 shrink-0" />
                        <span className="font-bold text-slate-700 dark:text-slate-300">{availability}%</span>
                        <span className="text-[10px] uppercase text-slate-400">{locale === 'mr' ? 'अपटाईम' : 'uptime'}</span>
                      </div>
                    )}

                    {m.cost != null && (
                      <div className="flex items-center gap-1.5 text-slate-500 col-span-2">
                        <span className="text-[10px] uppercase font-bold text-slate-400">{locale === 'mr' ? 'खरेदी किंमत:' : 'Cost:'}</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          ₹{Number(m.cost).toLocaleString('en-IN')}
                        </span>
                      </div>
                    )}
                  </div>

                  {m.maintenanceEntries?.[0]?.nextDueDate && (
                    <div className="mt-2 text-[11px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1 truncate">
                      <AlertTriangle size={12} className="shrink-0" />
                      <span className="truncate">
                        {locale === 'mr' ? 'पुढील सर्व्हिस: ' : 'Next service: '}
                        {new Date(m.maintenanceEntries[0].nextDueDate).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  )}

                  {/* Open Downtime Warning Banner */}
                  {openDowntime && (
                    <div className="mt-3 p-2.5 rounded-xl bg-red-100/70 dark:bg-red-950/40 border border-red-200 dark:border-red-800 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-red-700 dark:text-red-300 flex items-center gap-1">
                          <Power size={12} className="shrink-0" /> {t('downSince')} {formatDuration(Date.now() - new Date(openDowntime.startedAt).getTime())}
                        </p>
                        {openDowntime.reason && (
                          <p className="text-[10px] text-red-600 dark:text-red-400 truncate">{openDowntime.reason}</p>
                        )}
                      </div>
                      <button
                        onClick={async () => {
                          await api.patch(`/management/machine-downtime/${openDowntime.id}`, { resolve: true });
                          refetch();
                        }}
                        className="shrink-0 text-[11px] font-black px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 shadow-sm transition-all active:scale-95"
                      >
                        <CheckCircle2 size={12} /> {t('markResolved')}
                      </button>
                    </div>
                  )}
                </div>

                {/* Footer Action Buttons */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    {/* Log Service Shortcut */}
                    <button
                      onClick={() => setLoggingMaintFor(m)}
                      title="Log Maintenance"
                      className="text-xs font-bold px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/10 dark:hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 flex items-center gap-1 transition-all active:scale-95"
                    >
                      <Wrench size={13} />
                      <span className="inline">{locale === 'mr' ? 'सर्व्हिस' : 'Service'}</span>
                    </button>

                    {/* Report Downtime if not already down */}
                    {!openDowntime && m.status !== 'retired' && (
                      <button
                        onClick={() => setReportingFor(m)}
                        title="Report Downtime"
                        className="text-xs font-bold px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-red-600 hover:border-red-300 dark:hover:border-red-800 transition-all flex items-center gap-1 active:scale-95"
                      >
                        <Power size={13} />
                        <span className="hidden sm:inline">{locale === 'mr' ? 'डाउन' : 'Down'}</span>
                      </button>
                    )}

                    {/* View Maintenance Logs */}
                    <button
                      onClick={() => router.push(`/${locale}/maintenance?machineId=${m.id}`)}
                      title="View all maintenance logs for this machine"
                      className="text-xs font-bold p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-all"
                    >
                      <ArrowUpRight size={15} />
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditingMachine(m)}
                      title="Edit Machine Details"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all"
                    >
                      <Edit3 size={15} />
                    </button>
                    <button
                      onClick={() => handleDelete(m.id)}
                      disabled={deletingId === m.id}
                      title="Delete Machine"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-all"
                    >
                      {deletingId === m.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ──────────────── MODALS ──────────────── */}

      {/* 1. Quick Add Presets Modal (Ultra Responsive) */}
      {showPresetsModal && (
        <MillPresetsModal
          locale={locale}
          onClose={() => setShowPresetsModal(false)}
          onAdded={() => {
            setShowPresetsModal(false);
            refetch();
            mutate('/mill/machines');
          }}
        />
      )}

      {/* 2. Create / Edit Machine Modal */}
      {(creating || editingMachine) && (
        <MachineFormModal
          locale={locale}
          machine={editingMachine}
          onClose={() => {
            setCreating(false);
            setEditingMachine(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditingMachine(null);
            refetch();
            mutate('/mill/machines');
          }}
        />
      )}

      {/* 3. Report Downtime Modal */}
      {reportingFor && (
        <ReportDowntimeModal
          machine={reportingFor}
          onClose={() => setReportingFor(null)}
          onReported={() => {
            setReportingFor(null);
            refetch();
          }}
        />
      )}

      {/* 4. Log Maintenance Modal */}
      {loggingMaintFor && (
        <DirectLogMaintenanceModal
          locale={locale}
          machine={loggingMaintFor}
          onClose={() => setLoggingMaintFor(null)}
          onLogged={() => {
            setLoggingMaintFor(null);
            refetch();
            mutate(['/management/maintenance', activeShopId]);
          }}
        />
      )}
    </div>
  );
}

// ──────────────── Presets Library Modal (Fully Responsive) ────────────────
function MillPresetsModal({
  locale,
  onClose,
  onAdded,
}: {
  locale: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [presetSearch, setPresetSearch] = useState('');
  const [savingBatch, setSavingBatch] = useState(false);
  const [singleAddingId, setSingleAddingId] = useState<string | null>(null);

  const categories = [
    { key: 'all', label: locale === 'mr' ? 'सर्व मशिन्स' : 'All Presets', icon: '✨' },
    { key: 'cleaning', label: locale === 'mr' ? 'क्लिनिंग' : 'Cleaning', icon: '🧹' },
    { key: 'destoning', label: locale === 'mr' ? 'डेस्टोनिंग' : 'Destoning', icon: '🪨' },
    { key: 'milling', label: locale === 'mr' ? 'डीहस्किंग व मिलिंग' : 'Milling', icon: '🌾' },
    { key: 'grading', label: locale === 'mr' ? 'ग्रेडिंग' : 'Grading', icon: '📐' },
    { key: 'sorting', label: locale === 'mr' ? 'सॉर्टेक्स' : 'Sortex', icon: '👁️' },
    { key: 'packing', label: locale === 'mr' ? 'पॅकिंग' : 'Packaging', icon: '📦' },
    { key: 'handling', label: locale === 'mr' ? 'हँडलिंग व एअर' : 'Handling', icon: '🏗️' },
  ];

  const filteredPresets = useMemo(() => {
    return MILL_MACHINE_PRESETS.filter(p => {
      if (selectedCategory !== 'all' && p.category !== selectedCategory) return false;
      if (presetSearch.trim()) {
        const q = presetSearch.toLowerCase().trim();
        const matchesName = p.name.toLowerCase().includes(q) || p.nameMr.toLowerCase().includes(q);
        const matchesType = p.machineType.toLowerCase().includes(q);
        const matchesDesc = p.description.toLowerCase().includes(q) || p.descriptionMr.toLowerCase().includes(q);
        const matchesSpecs = p.defaultSpecs.toLowerCase().includes(q);
        if (!matchesName && !matchesType && !matchesDesc && !matchesSpecs) return false;
      }
      return true;
    });
  }, [selectedCategory, presetSearch]);

  const handleAddSingle = async (preset: MillMachinePreset) => {
    setSingleAddingId(preset.id);
    try {
      await api.post('/management/machines', {
        name: locale === 'mr' ? preset.nameMr : preset.name,
        machineType: preset.machineType,
        status: 'working',
        notes: `Specs: ${preset.defaultSpecs} | Stage: ${preset.stageCode}`,
      });
      onAdded();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to add machine preset');
    } finally {
      setSingleAddingId(null);
    }
  };

  const handleAddStandardLine = async () => {
    const standardLine = MILL_MACHINE_PRESETS.filter(p => p.isStandardLine);
    if (!confirm(
      locale === 'mr'
        ? `तुम्ही स्टँडर्ड 7-मशीन मिल लाईन (${standardLine.length} मशिन्स) 1-क्लिकमध्ये जोडू इच्छिता का?`
        : `Add standard full mill line (${standardLine.length} core machines) to your plant register?`
    )) return;

    setSavingBatch(true);
    try {
      const payload = standardLine.map(p => ({
        name: locale === 'mr' ? p.nameMr : p.name,
        machineType: p.machineType,
        status: 'working',
        notes: `Specs: ${p.defaultSpecs} | Stage: ${p.stageCode}`,
      }));

      await api.post('/management/machines', { machines: payload });
      onAdded();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to add standard mill line');
    } finally {
      setSavingBatch(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2.5 sm:p-4 md:p-6 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 w-full max-w-5xl h-[92vh] sm:h-[88vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800">
        
        {/* Modal Top Header */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-950/80 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-lg shrink-0">
              🏭
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white truncate">
                {locale === 'mr' ? 'मिल मशीनरी प्रीसेट लायब्ररी' : 'Mill Machinery Presets Library'}
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 truncate">
                {locale === 'mr'
                  ? 'राईस मिल, डाळ मिल, पीठ चक्की व धान्य प्रक्रियेसाठी इंडस्ट्री स्टँडर्ड मशिन्स.'
                  : 'Industry standard equipment catalog for Rice, Flour, Dal, and Grain Mills.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        {/* 1-Click Setup Banner */}
        <div className="px-4 sm:px-6 py-3 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-emerald-500/10 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 min-w-0">
            <Sparkles size={16} className="text-amber-500 shrink-0" />
            <span className="truncate">
              {locale === 'mr'
                ? 'संपूर्ण मिल लाईन (Pre-Cleaner, Destoner, Sheller, Whitener, Grader, Sortex, Bagging)'
                : 'Complete 7-Machine Line (Cleaner, Destoner, Sheller, Whitener, Grader, Sortex, Bagging)'}
            </span>
          </div>
          <button
            onClick={handleAddStandardLine}
            disabled={savingBatch}
            className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-sm flex items-center justify-center gap-1.5 shrink-0 transition-all active:scale-95 disabled:opacity-50"
          >
            {savingBatch ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            <span>{locale === 'mr' ? '⚡ संपूर्ण मिल लाईन जोडा (7 Machines)' : '⚡ Setup Standard Mill Line (7)'}</span>
          </button>
        </div>

        {/* Search & Category Pills Bar */}
        <div className="px-4 sm:px-6 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 shrink-0">
          {/* Category Pills Scrollable */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {categories.map(c => (
              <button
                key={c.key}
                onClick={() => setSelectedCategory(c.key)}
                className={cn(
                  'px-3 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 shrink-0',
                  selectedCategory === c.key
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200/80 dark:border-slate-700/80 hover:border-slate-400'
                )}
              >
                <span>{c.icon}</span>
                <span>{c.label}</span>
              </button>
            ))}
          </div>

          {/* Quick Search inside presets */}
          <div className="relative min-w-[200px] shrink-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={presetSearch}
              onChange={e => setPresetSearch(e.target.value)}
              placeholder={locale === 'mr' ? 'प्रीसेट शोधा...' : 'Search presets...'}
              className="w-full pl-8 pr-7 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
            {presetSearch && (
              <button
                onClick={() => setPresetSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Presets Grid */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 no-scrollbar">
          {filteredPresets.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <Search size={32} className="mx-auto mb-2 text-slate-300 dark:text-slate-700" />
              <p className="text-sm font-semibold">{locale === 'mr' ? 'कोणतीही मशीन सापडली नाही.' : 'No matching presets found.'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {filteredPresets.map(preset => (
                <div
                  key={preset.id}
                  className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/60 hover:bg-white dark:hover:bg-slate-900 hover:border-emerald-500/50 hover:shadow-md transition-all duration-200 p-4 flex flex-col justify-between group"
                >
                  <div>
                    {/* Top Icon & Title row */}
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 shadow-2xs flex items-center justify-center text-xl shrink-0 group-hover:scale-105 transition-transform">
                        {preset.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white leading-snug line-clamp-2">
                          {locale === 'mr' ? preset.nameMr : preset.name}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60">
                            {preset.machineType}
                          </span>
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                            {preset.stageCode}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 line-clamp-2 leading-relaxed">
                      {locale === 'mr' ? preset.descriptionMr : preset.description}
                    </p>

                    {/* Specs Box */}
                    <div className="mt-3 p-2.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800/80 text-[11px] font-medium text-slate-700 dark:text-slate-300 flex items-start gap-1.5">
                      <Zap size={13} className="text-amber-500 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1 line-clamp-2 leading-snug">
                        <span className="font-bold text-slate-800 dark:text-slate-200">{locale === 'mr' ? 'क्षमता: ' : 'Specs: '}</span>
                        {preset.defaultSpecs}
                      </div>
                    </div>
                  </div>

                  {/* Card Footer: Category and Action */}
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">
                      {preset.categoryLabel}
                    </span>
                    <button
                      onClick={() => handleAddSingle(preset)}
                      disabled={singleAddingId === preset.id}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs flex items-center gap-1 transition-all active:scale-95 disabled:opacity-50 shrink-0"
                    >
                      {singleAddingId === preset.id ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                      <span>{locale === 'mr' ? 'मिलमध्ये जोडा' : 'Add to Mill'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Bottom Footer */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80 flex items-center justify-between shrink-0">
          <p className="text-xs text-slate-400 hidden sm:block">
            {locale === 'mr' ? `एकूण ${filteredPresets.length} प्रीसेट्स उपलब्ध आहेत.` : `${filteredPresets.length} presets available.`}
          </p>
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors"
          >
            {locale === 'mr' ? 'बंद करा (Close)' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────────────── Custom Machine Add / Edit Modal ────────────────
function MachineFormModal({
  locale,
  machine,
  onClose,
  onSaved,
}: {
  locale: string;
  machine: Machine | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('Machines');
  const isEditing = !!machine;

  const [form, setForm] = useState({
    name: machine?.name || '',
    machineType: machine?.machineType || '',
    purchaseDate: machine?.purchaseDate ? machine.purchaseDate.substring(0, 10) : '',
    cost: machine?.cost != null ? String(machine.cost) : '',
    status: machine?.status || 'working',
    notes: machine?.notes || '',
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const typeSuggestions = [
    'Pre-Cleaner',
    'Fine Cleaner',
    'Destoner',
    'Dehusker / Sheller',
    'Paddy Separator',
    'Whitener / Polisher',
    'Chakki Grinder',
    'Hammer Mill',
    'Plan Sifter',
    'Length Grader',
    'Color Sortex',
    'Bagging Machine',
    'Pouch Packing',
    'Bucket Elevator',
    'Screw Conveyor',
    'Dust Cyclone',
  ];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError('');

    try {
      if (isEditing && machine) {
        await api.patch(`/management/machines/${machine.id}`, form);
      } else {
        await api.post('/management/machines', form);
      }
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || t('failedToCreate'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-slate-800">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900 z-10">
          <div className="flex items-center gap-2">
            <Cog size={20} className="text-emerald-600" />
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
              {isEditing
                ? locale === 'mr'
                  ? 'मशीन तपशील बदला'
                  : 'Edit Machine'
                : locale === 'mr'
                ? 'नवीन मशीन जोडा'
                : t('addMachine')}
            </h2>
          </div>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>

        <form onSubmit={submit} className="p-5 sm:p-6 space-y-4">
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">
              {t('machineName')} *
            </span>
            <input
              autoFocus
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-950 text-sm font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              placeholder={locale === 'mr' ? 'उदा. रबर रोल शेलर #1' : t('machineNamePlaceholder')}
              required
            />
          </label>

          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">
              {locale === 'mr' ? 'मशीनचा प्रकार (Machine Type)' : t('machineTypeOptional')}
            </span>
            <input
              value={form.machineType}
              onChange={e => setForm(f => ({ ...f, machineType: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-950 text-sm font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              placeholder={locale === 'mr' ? 'उदा. Sheller, Destoner, Sortex...' : t('machineTypePlaceholder')}
            />
            {/* Quick Type Chips */}
            <div className="flex flex-wrap gap-1 mt-2">
              {typeSuggestions.slice(0, 8).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, machineType: s }))}
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-emerald-100 hover:text-emerald-700 transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('purchaseDateOptional')}</span>
              <input
                type="date"
                value={form.purchaseDate}
                onChange={e => setForm(f => ({ ...f, purchaseDate: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-950 text-sm"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('costOptional')} (₹)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.cost}
                onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-950 text-sm font-semibold"
                placeholder="0.00"
              />
            </label>
          </div>

          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">
              {locale === 'mr' ? 'सध्याची स्थिती (Status)' : 'Status'}
            </span>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'working', label: t('working'), tone: 'emerald' },
                { key: 'under_maintenance', label: t('underMaintenance'), tone: 'amber' },
                { key: 'retired', label: t('retired'), tone: 'slate' },
              ].map(st => (
                <button
                  key={st.key}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, status: st.key as any }))}
                  className={cn(
                    'py-2 px-2 rounded-xl text-xs font-bold border-2 transition-all',
                    form.status === st.key
                      ? st.tone === 'emerald'
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                        : st.tone === 'amber'
                        ? 'border-amber-500 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400'
                        : 'border-slate-500 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                      : 'border-slate-200 dark:border-slate-700 text-slate-500'
                  )}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </label>

          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">
              {locale === 'mr' ? 'स्पेशिफिकेशन व नोट्स (Specs / HP / Stage)' : t('notesOptional')}
            </span>
            <textarea
              rows={2}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full p-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-950 text-sm"
              placeholder={
                locale === 'mr'
                  ? 'उदा. 10 HP Motor · 5 TPH Capacity · Line A'
                  : 'e.g. 10 HP Motor, 5 TPH Capacity, Line A'
              }
            />
          </label>

          {error && <p className="text-xs font-bold text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={saving || !form.name.trim()}
            className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-md transition-all active:scale-95"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : isEditing ? <Check size={16} /> : <Plus size={16} />}
            <span>{isEditing ? (locale === 'mr' ? 'बदल सेव्ह करा' : 'Save Changes') : t('addMachine')}</span>
          </button>
        </form>
      </div>
    </div>
  );
}

// ──────────────── Direct Log Maintenance Modal ────────────────
function DirectLogMaintenanceModal({
  locale,
  machine,
  onClose,
  onLogged,
}: {
  locale: string;
  machine: Machine;
  onClose: () => void;
  onLogged: () => void;
}) {
  const t = useTranslations('Maintenance');
  const [form, setForm] = useState({
    machineId: machine.id,
    description: '',
    cost: '',
    performedBy: '',
    paymentMethod: 'Cash',
    nextDueDate: '',
    notes: '',
    setStatus: '' as '' | 'working' | 'under_maintenance',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/management/maintenance', { ...form, setStatus: form.setStatus || undefined });
      onLogged();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || t('failedToLog'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-slate-800">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900 z-10">
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Wrench size={18} className="text-amber-500 shrink-0" />
              <span className="truncate">{locale === 'mr' ? `सर्व्हिस नोंद — ${machine.name}` : `Log Service — ${machine.name}`}</span>
            </h2>
          </div>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>

        <form onSubmit={submit} className="p-5 sm:p-6 space-y-4">
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('description')} *</span>
            <input
              autoFocus
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder={locale === 'mr' ? 'उदा. ऑईलिंग, बेल्ट बदलणे, रोलर ग्राइंडिंग' : t('descriptionPlaceholder')}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-950 text-sm font-semibold"
              required
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('costOptional')} (₹)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.cost}
                onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-950 text-sm font-semibold"
                placeholder="0.00"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{locale === 'mr' ? 'पेमेंट पद्धत' : 'Payment Mode'}</span>
              <select
                value={form.paymentMethod}
                onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-950 text-sm font-semibold"
              >
                <option value="Cash">Cash (रोख)</option>
                <option value="UPI">UPI / Online</option>
                <option value="Card">Card</option>
                <option value="Bank">Bank Transfer</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('performedByOptional')}</span>
            <input
              value={form.performedBy}
              onChange={e => setForm(f => ({ ...f, performedBy: e.target.value }))}
              placeholder={locale === 'mr' ? 'उदा. टेक्निशियन नाव / एजन्सी' : 'e.g. In-house Mechanic / Service Agency'}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-950 text-sm font-semibold"
            />
          </label>

          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('nextDueDateOptional')}</span>
            <input
              type="date"
              value={form.nextDueDate}
              onChange={e => setForm(f => ({ ...f, nextDueDate: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-950 text-sm"
            />
          </label>

          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('updateStatusOptional')}</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, setStatus: f.setStatus === 'working' ? '' : 'working' }))}
                className={cn(
                  'h-9 rounded-xl text-xs font-bold border-2 transition-colors',
                  form.setStatus === 'working'
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'border-slate-200 dark:border-slate-700 text-slate-500'
                )}
              >
                {t('working')}
              </button>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, setStatus: f.setStatus === 'under_maintenance' ? '' : 'under_maintenance' }))}
                className={cn(
                  'h-9 rounded-xl text-xs font-bold border-2 transition-colors',
                  form.setStatus === 'under_maintenance'
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400'
                    : 'border-slate-200 dark:border-slate-700 text-slate-500'
                )}
              >
                {t('under_maintenance')}
              </button>
            </div>
          </label>

          {error && <p className="text-xs font-bold text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={saving || !form.description.trim()}
            className="w-full h-11 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-md transition-all active:scale-95"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Wrench size={16} />}
            <span>{t('logMaintenance')}</span>
          </button>
        </form>
      </div>
    </div>
  );
}

// ──────────────── Report Downtime Modal ────────────────
function ReportDowntimeModal({ machine, onClose, onReported }: { machine: Machine; onClose: () => void; onReported: () => void }) {
  const t = useTranslations('Machines');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const REASON_SUGGESTIONS = [t('reasonPowerCut'), t('reasonBreakdown'), t('reasonNoRawMaterial'), t('reasonScheduledService')];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/management/machine-downtime', { machineId: machine.id, reason, notes });
      onReported();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || t('failedToReportDowntime'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2 truncate">
            <Power size={18} className="text-red-500 shrink-0" />
            <span className="truncate">{t('reportDowntimeFor', { name: machine.name })}</span>
          </h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="p-5 sm:p-6 space-y-4">
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('reasonOptional')}</span>
            <input
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-950 text-sm font-semibold"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {REASON_SUGGESTIONS.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-red-100 dark:hover:bg-red-500/10 hover:text-red-600"
                >
                  {r}
                </button>
              ))}
            </div>
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('notesOptional')}</span>
            <input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-950 text-sm font-semibold"
            />
          </label>
          {error && <p className="text-xs font-bold text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="w-full h-11 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-md transition-all active:scale-95"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Power size={16} />}
            <span>{t('reportDowntime')}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
