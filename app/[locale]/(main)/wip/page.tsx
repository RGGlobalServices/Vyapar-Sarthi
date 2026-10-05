'use client';

import React, { useState, useMemo } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn } from '@/lib/utils';
import {
  Layers,
  Search,
  RefreshCw,
  Loader2,
  Package,
  Factory,
  Calendar,
  Building2,
  ArrowRight,
  Eye,
  CheckCircle2,
  X,
  Copy,
  Check,
} from 'lucide-react';

type WipLot = {
  id: string;
  lotNumber: string;
  quantity: number;
  availableQuantity: number;
  unit: string;
  status: string;
  notes: string | null;
  createdAt: string;
  product: { id: string; name: string; sku: string | null; baseUnit: string | null };
  batch: { id: string; batchNumber: string; currentStage: string | null };
  sourceBatchStage: { id: string; stageName: string } | null;
  godown: { id: string; name: string } | null;
};

type WipApiResponse = {
  items: WipLot[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export default function WipPage() {
  const t = useTranslations('WIP');
  const activeShopId = useBusinessStore((s) => s.activeShopId);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selectedWipLotId, setSelectedWipLotId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const queryKey = activeShopId
    ? `/mill/wip?page=${page}&limit=25${search ? `&search=${encodeURIComponent(search)}` : ''}${statusFilter ? `&status=${statusFilter}` : ''}`
    : null;

  const { data, isLoading, mutate } = useSWR<WipApiResponse>(queryKey, fetcher);
  const { data: traceData, isLoading: isTraceLoading } = useSWR(
    activeShopId && selectedWipLotId ? `/mill/wip/${selectedWipLotId}?traceability=true` : null,
    fetcher
  );

  const lots = data?.items || [];
  const pagination = data?.pagination || { page: 1, limit: 25, total: 0, totalPages: 1 };

  const metrics = useMemo(() => {
    const totalLots = pagination.total || lots.length;
    const availableLots = lots.filter((l) => l.status === 'AVAILABLE' || l.status === 'PARTIALLY_CONSUMED');
    const totalAvailKg = availableLots.reduce((acc, l) => acc + (Number(l.availableQuantity) || 0), 0);
    const totalInitialKg = lots.reduce((acc, l) => acc + (Number(l.quantity) || 0), 0);
    const consumedLotsCount = lots.filter((l) => l.status === 'FULLY_CONSUMED').length;
    return {
      totalLots,
      totalAvailKg: Math.round(totalAvailKg * 100) / 100,
      totalInitialKg: Math.round(totalInitialKg * 100) / 100,
      consumedLotsCount,
    };
  }, [lots, pagination.total]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const statusPill = (status: string) => {
    switch (status) {
      case 'AVAILABLE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            {t('status_available')}
          </span>
        );
      case 'PARTIALLY_CONSUMED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-500/30">
            {t('status_partial')}
          </span>
        );
      case 'FULLY_CONSUMED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
            {t('status_consumed')}
          </span>
        );
      case 'BLOCKED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300">
            {t('status_blocked')}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
            <Layers size={26} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">{t('title')}</h1>
              <span className="px-2.5 py-0.5 text-xs font-extrabold rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300">
                {t('lotsCount', { count: metrics.totalLots })}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => mutate()}
            disabled={isLoading}
            className="h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2 transition"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            {t('refresh')}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">{t('kpi_totalLots')}</span>
            <Layers size={16} className="text-indigo-500" />
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white">{metrics.totalLots}</p>
          <span className="text-[11px] text-slate-400">{t('kpi_totalLotsHint')}</span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">{t('kpi_available')}</span>
            <Package size={16} className="text-emerald-500" />
          </div>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
            {metrics.totalAvailKg.toLocaleString('en-IN')} <span className="text-sm font-bold">Kg</span>
          </p>
          <span className="text-[11px] text-slate-400">{t('kpi_availableHint')}</span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">{t('kpi_initial')}</span>
            <Factory size={16} className="text-amber-500" />
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white">
            {metrics.totalInitialKg.toLocaleString('en-IN')} <span className="text-sm font-bold">Kg</span>
          </p>
          <span className="text-[11px] text-slate-400">{t('kpi_initialHint')}</span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">{t('kpi_consumed')}</span>
            <CheckCircle2 size={16} className="text-slate-400" />
          </div>
          <p className="text-2xl font-black text-slate-700 dark:text-slate-300">{metrics.consumedLotsCount}</p>
          <span className="text-[11px] text-slate-400">{t('kpi_consumedHint')}</span>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder={t('searchPlaceholder')}
              className="w-full pl-10 pr-4 h-10 text-sm font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-1 md:pb-0">
            {[
              { id: '', label: t('filter_all') },
              { id: 'AVAILABLE', label: t('filter_available') },
              { id: 'PARTIALLY_CONSUMED', label: t('filter_partial') },
              { id: 'FULLY_CONSUMED', label: t('filter_consumed') },
              { id: 'BLOCKED', label: t('filter_blocked') },
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => { setStatusFilter(st.id); setPage(1); }}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap',
                  statusFilter === st.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                )}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* WIP Lots List */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400 gap-3">
          <Loader2 className="animate-spin text-indigo-600" size={32} />
          <p className="text-sm font-medium">{t('loading')}</p>
        </div>
      ) : lots.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-3">
            <Layers size={28} />
          </div>
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">{t('emptyTitle')}</h3>
          <p className="text-xs text-slate-400 max-w-sm mt-1">
            {search || statusFilter ? t('emptyFilterHint') : t('emptyHint')}
          </p>
          {(search || statusFilter) && (
            <button
              onClick={() => { setSearch(''); setStatusFilter(''); }}
              className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition"
            >
              {t('clearFilters')}
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-800/40 text-[10px] font-black uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 px-4">{t('col_wipLot')}</th>
                  <th className="py-3.5 px-4">{t('col_product')}</th>
                  <th className="py-3.5 px-4">{t('col_sourceBatch')}</th>
                  <th className="py-3.5 px-4 text-right">{t('col_availInitial')}</th>
                  <th className="py-3.5 px-4">{t('col_godown')}</th>
                  <th className="py-3.5 px-4 text-center">{t('col_status')}</th>
                  <th className="py-3.5 px-4">{t('col_createdDate')}</th>
                  <th className="py-3.5 px-4 text-center">{t('col_actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-sm">
                {lots.map((lot) => {
                  const avail = Number(lot.availableQuantity) || 0;
                  const init = Number(lot.quantity) || 1;
                  const pct = Math.min(100, Math.round((avail / init) * 100));

                  return (
                    <tr key={lot.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors group">
                      <td className="py-3.5 px-4 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        <div className="flex items-center gap-1.5">
                          <span>{lot.lotNumber}</span>
                          <button
                            onClick={() => handleCopy(lot.lotNumber, lot.id)}
                            className="text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition p-1"
                            title={t('copyLotNumber')}
                          >
                            {copiedId === lot.id ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                          </button>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 dark:text-white">{lot.product?.name || '—'}</div>
                        {lot.product?.sku && (
                          <span className="text-[10px] text-slate-400 font-mono">{t('skuLabel', { sku: lot.product.sku })}</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {lot.batch ? (
                          <Link
                            href={`/production?batch=${lot.batch.id}` as any}
                            className="font-bold text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline flex items-center gap-1"
                          >
                            <Factory size={13} className="text-slate-400" />
                            {lot.batch.batchNumber}
                          </Link>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                        {lot.sourceBatchStage && (
                          <span className="text-[10px] text-slate-500 font-medium block">
                            {t('stageLabel', { name: lot.sourceBatchStage.stageName })}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="font-bold text-emerald-600 dark:text-emerald-400">
                          {avail.toLocaleString('en-IN')}{' '}
                          <span className="text-xs font-normal text-slate-400">/ {init.toLocaleString('en-IN')} {lot.unit}</span>
                        </div>
                        <div className="w-24 bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full ml-auto mt-1 overflow-hidden">
                          <div
                            className={cn('h-full rounded-full transition-all', pct > 50 ? 'bg-emerald-500' : pct > 0 ? 'bg-amber-500' : 'bg-slate-300')}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-300">
                        {lot.godown?.name ? (
                          <span className="flex items-center gap-1">
                            <Building2 size={13} className="text-slate-400" />
                            {lot.godown.name}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">{t('defaultGodown')}</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-center">{statusPill(lot.status)}</td>

                      <td className="py-3.5 px-4 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Calendar size={13} className="text-slate-400" />
                          {new Date(lot.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => setSelectedWipLotId(lot.id)}
                          className="h-8 px-3 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-xs font-bold inline-flex items-center gap-1.5 transition"
                        >
                          <Eye size={13} /> {t('viewTrace')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View */}
          <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
            {lots.map((lot) => {
              const avail = Number(lot.availableQuantity) || 0;
              const init = Number(lot.quantity) || 1;
              const pct = Math.min(100, Math.round((avail / init) * 100));

              return (
                <div key={lot.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="font-mono text-xs font-black text-indigo-600 dark:text-indigo-400">{lot.lotNumber}</span>
                      <h4 className="font-bold text-slate-900 dark:text-white text-sm">{lot.product?.name}</h4>
                    </div>
                    {statusPill(lot.status)}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">{t('mobile_availableQty')}</span>
                      <span className="font-black text-emerald-600 dark:text-emerald-400 text-sm">{avail.toLocaleString('en-IN')} {lot.unit}</span>
                      <span className="text-[10px] text-slate-400 block">{t('mobile_of', { qty: init, unit: lot.unit })}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">{t('mobile_sourceBatch')}</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300 block">{lot.batch?.batchNumber || '—'}</span>
                      {lot.sourceBatchStage && (
                        <span className="text-[10px] text-slate-500">{lot.sourceBatchStage.stageName}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Calendar size={12} />
                      {new Date(lot.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </span>
                    <button
                      onClick={() => setSelectedWipLotId(lot.id)}
                      className="h-8 px-3 rounded-lg bg-indigo-600 text-white text-xs font-bold flex items-center gap-1"
                    >
                      <Eye size={13} /> {t('viewTrace')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-medium">
              <span className="text-slate-500">
                {t('pagination', { page: pagination.page, totalPages: pagination.totalPages, total: pagination.total })}
              </span>
              <div className="flex items-center gap-1">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"
                >
                  {t('prev')}
                </button>
                <button
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"
                >
                  {t('next')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* WIP Traceability Modal */}
      {selectedWipLotId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh] overflow-hidden">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-500 flex items-center justify-center text-white">
                  <Layers size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">{t('trace_title')}</h3>
                  <p className="text-xs text-slate-400 font-mono">
                    {traceData?.lotNumber || t('trace_loadingLot')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedWipLotId(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {isTraceLoading ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <Loader2 className="animate-spin text-indigo-600" size={24} />
                  <span className="text-xs">{t('trace_loading')}</span>
                </div>
              ) : traceData ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">{t('trace_product')}</span>
                      <span className="font-bold text-slate-900 dark:text-white text-xs">{traceData.product?.name || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">{t('trace_availableQty')}</span>
                      <span className="font-black text-emerald-600 dark:text-emerald-400 text-xs">{traceData.availableQuantity} {traceData.unit}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">{t('trace_initialQty')}</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300 text-xs">{traceData.quantity} {traceData.unit}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">{t('trace_status')}</span>
                      {statusPill(traceData.status)}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Factory size={14} className="text-indigo-500" /> {t('trace_upstream')}
                    </h4>
                    <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{t('trace_originatingBatch')}</span>
                        <span className="font-mono font-bold text-xs text-indigo-600 dark:text-indigo-400">{traceData.batch?.batchNumber}</span>
                      </div>
                      {traceData.sourceBatchStage && (
                        <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                          <span>{t('trace_outputFromStage')}</span>
                          <span className="font-semibold">{traceData.sourceBatchStage.stageName}</span>
                        </div>
                      )}
                      {traceData.batch?.rawLot && (
                        <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
                          <span>{t('trace_rawLot')}</span>
                          <span className="font-mono font-medium">{traceData.batch.rawLot.lotNumber} ({traceData.batch.rawLot.product?.name})</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <ArrowRight size={14} className="text-emerald-500" /> {t('trace_downstream')}
                    </h4>
                    {traceData.consumptions && traceData.consumptions.length > 0 ? (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
                        {traceData.consumptions.map((c: any, idx: number) => (
                          <div key={idx} className="p-3 flex items-center justify-between text-xs">
                            <div>
                              <span className="font-bold text-slate-800 dark:text-slate-200 block">
                                {t('trace_consumedInBatch', { batchNumber: c.batchNumber || c.batchId })}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {c.stageName ? t('trace_stageName', { stageName: c.stageName }) : t('trace_finalProcessing')}
                              </span>
                            </div>
                            <span className="font-bold text-emerald-600">{c.quantity} {c.unit || traceData.unit}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl">
                        {t('trace_noConsumptions')}
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-xs text-red-500">{t('trace_loadError')}</p>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end">
              <button
                onClick={() => setSelectedWipLotId(null)}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition"
              >
                {t('trace_close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
