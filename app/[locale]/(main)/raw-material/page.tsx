'use client';

import { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Link } from '@/i18n/routing';
import useSWR, { useSWRConfig } from 'swr';
import {
  Plus, X, Loader2, Wheat, ArrowUpDown, Calendar,
  ArrowRight, Factory, Search, ChevronRight
} from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn } from '@/lib/utils';
import ModalPortal from '@/components/mill/ModalPortal';
import { ExportButton } from '@/lib/hooks/useExport';
import ProductionStageBuilder, { getProductSmartSuggestions } from '@/components/mill/ProductionStageBuilder';
import { useTranslations } from 'next-intl';
import QuickProductionForm from '@/components/mill/QuickProductionForm';
import ProductionSources from '@/components/mill/ProductionSources';
import type { QuickSource } from '@/lib/quickEntry';

type Lot = {
  id: string;
  lotNumber: string | null;
  farmerName: string | null;
  purchaseDate: string;
  createdAt?: string | null;
  receivedDate: string;
  quantity: number | null;
  receivedKg?: number | null;
  allocatedKg: number;
  consumedKg: number;
  availableKg: number;
  moisturePct: number | null;
  ratePerUnit: number | null;
  totalAmount: number | null;
  remainingQuantity: number | null;
  operationalStatus?: 'available' | 'allocated' | 'in_production' | 'partially_consumed' | 'consumed';
  notes: string | null;
  productId?: string | null;
  source?: 'purchase' | 'weighbridge' | 'manual';
  sourceRef?: string | null;
  product?: { id: string; name: string; baseUnit: string | null } | null;
  supplier?: { id: string; name: string; mobile: string | null } | null;
  batches?: { id: string; batchNumber: string; inputKg: number | null; status: string; currentStage?: string | null }[];
};

type Product = { id: string; name: string; millCategory?: string | null; baseUnit?: string | null };

const fetcher = (u: string) => api.get(u).then(r => r.data);
const rupee = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const UNITS = [{ k: 'kg', kg: 1 }, { k: 'quintal', kg: 100 }, { k: 'ton', kg: 1000 }, { k: 'g', kg: 0.001 }];

const statusBadge = (status?: string) => {
  switch (status) {
    case 'in_production':
      return 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300';
    case 'allocated':
      return 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300';
    case 'partially_consumed':
      return 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300';
    case 'consumed':
      return 'bg-slate-200 dark:bg-slate-700 text-slate-500';
    default:
      return 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
  }
};

const statusLabel = (status?: string) => {
  switch (status) {
    case 'in_production': return 'In Production';
    case 'allocated': return 'Allocated';
    case 'partially_consumed': return 'Partially Consumed';
    case 'consumed': return 'Consumed';
    default: return 'Available';
  }
};

export default function RawMaterialPage() {
  const tm = useTranslations('Mill');
  const searchParams = useSearchParams();
  // Where production starts: raw material lots here, the customer's grain (Job Work), and WIP / rejected material to reprocess.
  const [view, setView] = useState<'raw' | 'job_work' | 'reprocess'>('raw');
  const [startFor, setStartFor] = useState<{ type: QuickSource; id?: string } | null>(null);
  const activeShopId = useBusinessStore(s => s.activeShopId);

  // Filter & Sort States
  const [statusTab, setStatusTab] = useState<'available' | 'in_production' | 'consumed' | 'all'>('available');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc'); // desc = Newest Received first (default)
  const [datePreset, setDatePreset] = useState<'all' | 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [productFilter, setProductFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'purchase' | 'weighbridge' | 'manual'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [adding, setAdding] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [allocatingLot, setAllocatingLot] = useState<Lot | null>(null);

  const { mutate: globalMutate } = useSWRConfig();

  // Fetch Lots with immediate revalidation on mutations and focus
  const { data: allLots = [], mutate: refetch, isLoading } = useSWR<Lot[]>(
    activeShopId ? ['/mill/raw-lots', activeShopId] : null,
    ([u]) => fetcher(u),
    {
      revalidateOnMount: true,
      revalidateOnFocus: true,
      dedupingInterval: 0,
    }
  );

  // Dynamically derive viewingLot from allLots so modal reflects real-time updates immediately
  const viewingLot = useMemo(() => {
    return viewingId ? allLots.find(l => l.id === viewingId) || null : null;
  }, [viewingId, allLots]);

  // Deep-link from Batches page via ?lot=UUID
  useEffect(() => {
    const lotId = searchParams?.get('lot');
    if (lotId && allLots.length) {
      const match = allLots.find(l => l.id === lotId);
      if (match) setViewingId(match.id);
    }
  }, [searchParams, allLots]);

  const { data: rawProducts = [] } = useSWR<Product[]>(activeShopId ? ['/products?isRawMaterial=true', activeShopId] : null, ([u]) => fetcher(u));

  // Filtered & Sorted Lots
  const lots = useMemo(() => {
    return allLots.filter(l => {
      // Status tab: do not hide partially available lots from Available
      if (statusTab === 'available' && !(l.availableKg > 0)) return false;
      if (statusTab === 'in_production' && !(l.allocatedKg > 0)) return false;
      if (statusTab === 'consumed' && (l.availableKg > 0 || l.allocatedKg > 0)) return false;

      // Product filter
      if (productFilter !== 'all' && l.productId !== productFilter) return false;

      // Source filter
      if (sourceFilter !== 'all' && l.source !== sourceFilter) return false;

      // Date range filter using canonical receivedDate
      const lotTime = new Date(l.receivedDate || l.purchaseDate).getTime();
      const now = new Date();
      if (datePreset === 'today') {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
        if (lotTime < start || lotTime > end) return false;
      } else if (datePreset === 'yesterday') {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999).getTime();
        if (lotTime < start || lotTime > end) return false;
      } else if (datePreset === 'this_week') {
        const day = now.getDay();
        const diff = (day === 0 ? -6 : 1) - day;
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff).getTime();
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
        if (lotTime < start || lotTime > end) return false;
      } else if (datePreset === 'this_month') {
        const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
        if (lotTime < start || lotTime > end) return false;
      } else if (datePreset === 'custom') {
        if (startDate && lotTime < new Date(startDate).getTime()) return false;
        if (endDate && lotTime > new Date(new Date(endDate).setHours(23, 59, 59, 999)).getTime()) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${l.lotNumber || ''} ${l.product?.name || ''} ${l.farmerName || ''} ${l.supplier?.name || ''} ${l.sourceRef || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    }).sort((a, b) => {
      const ta = new Date(a.receivedDate || a.purchaseDate).getTime();
      const tb = new Date(b.receivedDate || b.purchaseDate).getTime();
      return sortOrder === 'asc' ? ta - tb : tb - ta;
    });
  }, [allLots, statusTab, productFilter, sourceFilter, datePreset, startDate, endDate, searchQuery, sortOrder]);

  // Totals upholding Received = Consumed + Allocated + Available
  const totals = useMemo(() => {
    const received = allLots.reduce((s, l) => s + (l.quantity || 0), 0);
    const allocated = allLots.reduce((s, l) => s + (l.allocatedKg || 0), 0);
    const consumed = allLots.reduce((s, l) => s + (l.consumedKg || 0), 0);
    const available = allLots.reduce((s, l) => s + (l.availableKg || 0), 0);
    const stockValue = allLots.reduce((s, l) => s + (l.availableKg || 0) * (l.ratePerUnit || 0), 0);
    return { received, allocated, consumed, available, stockValue };
  }, [allLots]);

  // Export dataset for Requirement 14 & 7
  const exportData = useMemo(() => {
    return lots.map(l => ({
      lotNumber: l.lotNumber || '—',
      productName: l.product?.name || '—',
      source: l.source ? l.source.toUpperCase() : 'MANUAL',
      sourceRef: l.sourceRef || '—',
      farmerVendor: l.farmerName || l.supplier?.name || '—',
      receivedDate: new Date(l.receivedDate || l.purchaseDate).toLocaleDateString('en-IN'),
      receivedKg: l.quantity ?? 0,
      moisturePct: l.moisturePct != null ? `${l.moisturePct}%` : '—',
      ratePerUnit: l.ratePerUnit ?? 0,
      totalAmount: l.totalAmount ?? 0,
      allocatedKg: l.allocatedKg ?? 0,
      consumedKg: l.consumedKg ?? 0,
      availableKg: l.availableKg ?? 0,
      status: statusLabel(l.operationalStatus),
      batches: l.batches?.map(b => b.batchNumber).join(', ') || '—',
    }));
  }, [lots]);

  const exportColumns = [
    { key: 'lotNumber', label: 'Lot No.' },
    { key: 'productName', label: 'Product' },
    { key: 'source', label: 'Source' },
    { key: 'sourceRef', label: 'Source Ref' },
    { key: 'farmerVendor', label: 'Farmer / Vendor' },
    { key: 'receivedDate', label: 'Received Date' },
    { key: 'receivedKg', label: 'Received (Kg)', type: 'number' as const },
    { key: 'moisturePct', label: 'Moisture' },
    { key: 'ratePerUnit', label: 'Rate/Kg', type: 'currency' as const },
    { key: 'totalAmount', label: 'Total Amount', type: 'currency' as const },
    { key: 'allocatedKg', label: 'Allocated (Kg)', type: 'number' as const },
    { key: 'consumedKg', label: 'Consumed (Kg)', type: 'number' as const },
    { key: 'availableKg', label: 'Available (Kg)', type: 'number' as const },
    { key: 'status', label: 'Status' },
    { key: 'batches', label: 'Production Batches' },
  ];

  const exportSummary = [
    { label: 'Total Received', value: `${totals.received.toLocaleString('en-IN')} Kg` },
    { label: 'Total Allocated', value: `${totals.allocated.toLocaleString('en-IN')} Kg` },
    { label: 'Total Consumed', value: `${totals.consumed.toLocaleString('en-IN')} Kg` },
    { label: 'Total Available', value: `${totals.available.toLocaleString('en-IN')} Kg` },
    { label: 'Stock Value', value: rupee(totals.stockValue) },
  ];

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header & Main Actions */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Wheat size={24} className="text-amber-600" /> Raw Material Register
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Lot-wise operational register — trace intake, allocate to production, and monitor actual consumption.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ExportButton
            columns={exportColumns}
            data={exportData}
            filename="raw_material_register"
            title="Raw Material Register"
            orientation="landscape"
            summary={exportSummary}
          />
          <button
            onClick={() => setStartFor({ type: view === 'job_work' ? 'job_work' : view === 'reprocess' ? 'wip' : 'raw_lot' })}
            data-testid="start-production"
            className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-sm"
          >
            <Factory size={18} /> {tm('rm_startProduction')}
          </button>
          <button
            onClick={() => setAdding(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-sm"
          >
            <Plus size={18} /> Add Lot
          </button>
        </div>
      </div>

      {/* Where production starts from */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 overflow-x-auto" data-testid="rm-views">
        {([['raw', tm('rm_viewRaw')], ['job_work', tm('rm_viewJob')], ['reprocess', tm('rm_viewReprocess')]] as const).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setView(id)}
            className={cn('px-3.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-colors', view === id ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300')}>{label}</button>
        ))}
      </div>

      {view !== 'raw' && <ProductionSources view={view} onStart={(type, id) => setStartFor({ type, id })} />}

      {view === 'raw' && (<>
      {/* Summary KPI Cards upholding Received = Consumed + Allocated + Available */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3" data-testid="rm-cards">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 uppercase font-bold">Total Received</p>
          <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
            {totals.received.toLocaleString('en-IN')} Kg
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">Total incoming grain</p>
        </div>
        <div className="rounded-xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/40 dark:bg-blue-950/20 p-4">
          <p className="text-xs text-blue-700 dark:text-blue-400 uppercase font-bold">Allocated</p>
          <p className="text-xl font-black text-blue-700 dark:text-blue-400 mt-1">
            {totals.allocated.toLocaleString('en-IN')} Kg
          </p>
          <p className="text-[10px] text-blue-600/70 dark:text-blue-400/60 mt-0.5">Reserved in active batches</p>
        </div>
        <div className="rounded-xl border border-purple-200 dark:border-purple-900/40 bg-purple-50/40 dark:bg-purple-950/20 p-4">
          <p className="text-xs text-purple-700 dark:text-purple-400 uppercase font-bold">Consumed</p>
          <p className="text-xl font-black text-purple-700 dark:text-purple-400 mt-1">
            {totals.consumed.toLocaleString('en-IN')} Kg
          </p>
          <p className="text-[10px] text-purple-600/70 dark:text-purple-400/60 mt-0.5">Finalized in production</p>
        </div>
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/20 p-4">
          <p className="text-xs text-amber-700 dark:text-amber-400 uppercase font-bold">Available</p>
          <p className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1">
            {totals.available.toLocaleString('en-IN')} Kg
          </p>
          <p className="text-[10px] text-amber-600/70 dark:text-amber-400/60 mt-0.5">Free for new batches</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 col-span-2 lg:col-span-1">
          <p className="text-xs text-slate-500 uppercase font-bold">Stock Value</p>
          <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
            {rupee(totals.stockValue)}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">Available × Rate</p>
        </div>
      </div>

      {/* Filter and Sorting Controls */}
      <div className="space-y-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
        {/* Status Tabs */}
        <div className="flex items-center justify-between gap-3 flex-wrap border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-1 gap-1">
            {(['available', 'in_production', 'consumed', 'all'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusTab(tab)}
                className={cn(
                  'px-3.5 py-1.5 rounded-lg text-xs font-bold capitalize transition-colors',
                  statusTab === tab
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                )}
              >
                {tab === 'in_production' ? 'In Production / Allocated' : tab}
              </button>
            ))}
          </div>

          {/* Sorting Control (Default: Newest Received → Oldest) */}
          <button
            type="button"
            onClick={() => setSortOrder(s => (s === 'desc' ? 'asc' : 'desc'))}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowUpDown size={14} className="text-slate-400" />
            <span>Sort: {sortOrder === 'desc' ? 'Newest Received → Oldest' : 'Oldest Received → Newest'}</span>
          </button>
        </div>

        {/* Second Row: Search, Date Filter, Product, Source */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {/* Search Input */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search lot, product, vendor..."
              className="w-full h-10 pl-9 pr-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-950 text-xs"
            />
          </div>

          {/* Date Filter Presets */}
          <div className="flex items-center gap-1">
            <select
              value={datePreset}
              onChange={e => setDatePreset(e.target.value as any)}
              className="w-full h-10 px-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-950 text-xs font-semibold"
            >
              <option value="all">Date: All Time</option>
              <option value="today">Date: Today</option>
              <option value="yesterday">Date: Yesterday</option>
              <option value="this_week">Date: This Week</option>
              <option value="this_month">Date: This Month</option>
              <option value="custom">Date: Custom Range</option>
            </select>
          </div>

          {/* Product Filter */}
          <div>
            <select
              value={productFilter}
              onChange={e => setProductFilter(e.target.value)}
              className="w-full h-10 px-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-950 text-xs font-semibold"
            >
              <option value="all">All Raw Products</option>
              {rawProducts.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Source Filter */}
          <div>
            <select
              value={sourceFilter}
              onChange={e => setSourceFilter(e.target.value as any)}
              className="w-full h-10 px-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-950 text-xs font-semibold"
            >
              <option value="all">All Sources</option>
              <option value="purchase">Purchase</option>
              <option value="weighbridge">Weighbridge</option>
              <option value="manual">Manual</option>
            </select>
          </div>

          {/* Reset Filters */}
          <div className="flex items-center">
            {(datePreset !== 'all' || productFilter !== 'all' || sourceFilter !== 'all' || searchQuery || sortOrder !== 'desc') && (
              <button
                type="button"
                onClick={() => {
                  setDatePreset('all');
                  setStartDate('');
                  setEndDate('');
                  setProductFilter('all');
                  setSourceFilter('all');
                  setSearchQuery('');
                  setSortOrder('desc');
                }}
                className="w-full h-10 text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Custom Date Pickers */}
        {datePreset === 'custom' && (
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <span className="text-xs text-slate-500 flex items-center gap-1 font-semibold">
              <Calendar size={14} /> Received Range:
            </span>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="h-9 px-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-xs"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="h-9 px-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-xs"
            />
          </div>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="p-16 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={28} /></div>
      ) : lots.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-16 text-center">
          <Wheat size={44} className="mx-auto text-slate-300 dark:text-slate-700" />
          <p className="mt-3 text-base font-bold text-slate-700 dark:text-slate-300">No Raw Material Lots found</p>
          <p className="text-xs text-slate-400 mt-1">Adjust your filters or add a new lot to start.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <table className="w-full text-xs text-left" data-testid="raw-lots-table">
            <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 uppercase text-[11px] font-bold">
              <tr>
                <th className="px-4 py-3">Lot No.</th>
                <th className="px-3 py-3">Product</th>
                <th className="px-3 py-3">Source</th>
                <th className="px-3 py-3">Farmer / Vendor</th>
                <th className="px-3 py-3 whitespace-nowrap">Received Date</th>
                <th className="px-3 py-3 text-right">Received</th>
                <th className="px-3 py-3 text-right">Allocated</th>
                <th className="px-3 py-3 text-right">Consumed</th>
                <th className="px-3 py-3 text-right">Available</th>
                <th className="px-3 py-3">Used In</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {lots.map(l => {
                const recDate = new Date(l.receivedDate || l.purchaseDate).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                });
                return (
                  <tr
                    key={l.id}
                    onClick={() => setViewingId(l.id)}
                    data-testid="raw-lot-row"
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                      {l.lotNumber || '—'}
                    </td>
                    <td className="px-3 py-3 font-semibold text-slate-800 dark:text-slate-200">
                      {l.product?.name || '—'}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap" data-source={l.source}>
                      <span className={cn(
                        'font-bold uppercase text-[9px] px-2 py-0.5 rounded-full',
                        l.source === 'weighbridge'
                          ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300'
                          : l.source === 'purchase'
                          ? 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      )}>
                        {l.source === 'weighbridge' ? 'Weighbridge' : l.source === 'purchase' ? 'Purchase' : 'Manual'}
                      </span>
                      {l.sourceRef && <span className="ml-1 font-mono text-[10px] text-slate-400">{l.sourceRef}</span>}
                    </td>
                    <td className="px-3 py-3 text-slate-600 dark:text-slate-400">
                      {l.farmerName || l.supplier?.name || '—'}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-500">
                      {recDate}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                      {(l.quantity ?? 0).toLocaleString('en-IN')} Kg
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                      {(l.allocatedKg ?? 0).toLocaleString('en-IN')} Kg
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-purple-600 dark:text-purple-400 whitespace-nowrap">
                      {(l.consumedKg ?? 0).toLocaleString('en-IN')} Kg
                    </td>
                    <td className="px-3 py-3 text-right font-black text-amber-600 dark:text-amber-400 whitespace-nowrap">
                      {(l.availableKg ?? 0).toLocaleString('en-IN')} Kg
                    </td>
                    <td className="px-3 py-3">
                      {l.batches?.length ? (
                        <div className="flex flex-wrap gap-1" onClick={e => e.stopPropagation()}>
                          {l.batches.map(b => (
                            <Link
                              key={b.id}
                              href={`/batches?batch=${b.id}` as any}
                              className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/40 hover:text-emerald-700 transition-colors"
                              title={`Status: ${b.status}`}
                            >
                              {b.batchNumber}
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={cn('text-[9px] font-black uppercase px-2 py-0.5 rounded-full', statusBadge(l.operationalStatus))}>
                        {statusLabel(l.operationalStatus)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                      {l.availableKg > 0 ? (
                        <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setStartFor({ type: 'raw_lot', id: l.id })}
                          className="px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-1 transition-colors shadow-sm"
                        >
                          <Factory size={13} /> {tm('rm_startProduction')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setAllocatingLot(l)}
                          className="px-2.5 py-1 text-xs font-bold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                          title="Batch-wise (stages)"
                        >
                          Allocate
                        </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">Fully allocated</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      </>)}

      {/* Start Production (one-form entry) */}
      {startFor && (
        <QuickProductionForm
          initialSource={{ type: startFor.type, id: startFor.id }}
          onClose={() => setStartFor(null)}
          onSaved={() => { refetch(); }}
        />
      )}

      {/* Lot Details Modal */}
      {viewingLot && (
        <ModalPortal>
          <LotDetailModal
            lot={viewingLot}
            onClose={() => setViewingId(null)}
            onAllocate={() => {
              const l = viewingLot;
              setViewingId(null);
              setAllocatingLot(l);
            }}
          />
        </ModalPortal>
      )}

      {/* Allocate to Production Modal */}
      {allocatingLot && (
        <ModalPortal>
          <AllocateBatchModal
            lot={allocatingLot}
            onClose={() => setAllocatingLot(null)}
            onAllocated={async () => {
              setAllocatingLot(null);
              await refetch();
              globalMutate(
                key => Array.isArray(key) && typeof key[0] === 'string' && key[0].startsWith('/mill/raw-lots'),
                undefined,
                { revalidate: true }
              );
            }}
          />
        </ModalPortal>
      )}

      {/* Add Lot Modal */}
      {adding && (
        <ModalPortal>
          <AddLotModal
            products={rawProducts}
            onClose={() => setAdding(false)}
            onAdded={async () => {
              setAdding(false);
              await refetch();
              globalMutate(
                key => Array.isArray(key) && typeof key[0] === 'string' && key[0].startsWith('/mill/raw-lots'),
                undefined,
                { revalidate: true }
              );
            }}
          />
        </ModalPortal>
      )}
    </div>
  );
}

// Lot Details Modal
function LotDetailModal({ lot, onClose, onAllocate }: { lot: Lot; onClose: () => void; onAllocate: () => void }) {
  const recDate = new Date(lot.receivedDate || lot.purchaseDate).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const rows: [string, React.ReactNode][] = [
    ['Lot Number', lot.lotNumber || '—'],
    ['Product', lot.product?.name || '—'],
    ['Source', (
      <span key="src">
        <span className={cn(
          'font-bold uppercase text-[10px] px-2 py-0.5 rounded-full',
          lot.source === 'weighbridge'
            ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300'
            : lot.source === 'purchase'
            ? 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
        )}>
          {lot.source === 'weighbridge' ? 'Weighbridge' : lot.source === 'purchase' ? 'Purchase' : 'Manual'}
        </span>
        {lot.sourceRef && <span className="ml-1.5 font-mono text-xs text-slate-500">{lot.sourceRef}</span>}
      </span>
    )],
    ['Farmer / Vendor', lot.farmerName || lot.supplier?.name || '—'],
    ['Vendor Mobile', lot.supplier?.mobile || '—'],
    ['Received Date', recDate],
    ['Received Weight', `${(lot.quantity ?? 0).toLocaleString('en-IN')} Kg`],
    ['Allocated Quantity', <span key="alloc" className="font-bold text-blue-600 dark:text-blue-400">{(lot.allocatedKg ?? 0).toLocaleString('en-IN')} Kg</span>],
    ['Consumed Quantity', <span key="cons" className="font-semibold text-purple-600 dark:text-purple-400">{(lot.consumedKg ?? 0).toLocaleString('en-IN')} Kg</span>],
    ['Available Quantity', <span key="avail" className="font-black text-amber-600 dark:text-amber-400">{(lot.availableKg ?? 0).toLocaleString('en-IN')} Kg</span>],
    ['Moisture', lot.moisturePct != null ? `${lot.moisturePct}%` : '—'],
    ['Rate / Kg', lot.ratePerUnit != null ? rupee(lot.ratePerUnit) : '—'],
    ['Total Amount', lot.totalAmount != null ? rupee(lot.totalAmount) : '—'],
    ['Status', (
      <span key="st" className={cn('text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full', statusBadge(lot.operationalStatus))}>
        {statusLabel(lot.operationalStatus)}
      </span>
    )],
  ];

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Wheat size={20} className="text-amber-600" /> Lot Details
          </h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <div className="p-6 overflow-y-auto space-y-3">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-start justify-between gap-4 text-sm">
              <span className="text-slate-500">{label}</span>
              <span className="font-semibold text-slate-900 dark:text-white text-right">{value}</span>
            </div>
          ))}

          {/* Traceability: Linked Production Batches */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">Used in / Allocated to Production Batches</p>
            {lot.batches?.length ? (
              <div className="space-y-1.5">
                {lot.batches.map(b => (
                  <div key={b.id} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">{b.batchNumber}</span>
                      <span className="text-xs text-slate-500">· {b.inputKg ?? 0} Kg</span>
                      <span className={cn(
                        'text-[9px] font-bold uppercase px-2 py-0.5 rounded-full',
                        b.status === 'closed'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                          : b.status === 'in_progress'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                      )}>
                        {b.status}
                      </span>
                    </div>
                    <Link
                      href={`/batches?batch=${b.id}` as any}
                      className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                    >
                      Open <ChevronRight size={13} />
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400">Not allocated to any production batch yet.</p>
            )}
          </div>

          {lot.notes && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
              <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Notes</p>
              <p className="text-xs text-slate-700 dark:text-slate-300">{lot.notes}</p>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
          {lot.availableKg > 0 && (
            <button
              onClick={onAllocate}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Factory size={14} /> Send to Production
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Allocate to Production Modal (Path A)
function AllocateBatchModal({ lot, onClose, onAllocated }: { lot: Lot; onClose: () => void; onAllocated: () => Promise<void> | void }) {
  const [inputQty, setInputQty] = useState('');
  const [unit, setUnit] = useState('kg');
  const [batchNumber, setBatchNumber] = useState('');
  const [plannedOutputKg, setPlannedOutputKg] = useState('');
  const [selectedStages, setSelectedStages] = useState<string[]>([]);
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [templateLoaded, setTemplateLoaded] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    const productId = lot?.productId;
    if (!productId) {
      setTemplateLoaded(false);
      setSelectedStages(getProductSmartSuggestions(lot?.product?.name));
      return;
    }
    let cancelled = false;
    setTemplateLoading(true);
    api.get(`/mill/stage-templates/${productId}`)
      .then((r) => {
        if (cancelled) return;
        const stages: string[] = r.data.stages ?? [];
        if (stages.length > 0) {
          setSelectedStages(stages);
          setTemplateLoaded(true);
        } else {
          setSelectedStages(getProductSmartSuggestions(lot?.product?.name));
          setTemplateLoaded(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedStages(getProductSmartSuggestions(lot?.product?.name));
          setTemplateLoaded(false);
        }
      })
      .finally(() => { if (!cancelled) setTemplateLoading(false); });
    return () => { cancelled = true; };
  }, [lot?.productId, lot?.product?.name]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedStages.length === 0) {
      setError('Please select or add at least one production stage.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (saveAsDefault && lot?.productId) {
        try {
          await api.put(`/mill/stage-templates/${lot.productId}`, { stages: selectedStages });
        } catch (err) {
          // Ignore non-fatal template save error
        }
      }

      await api.post('/mill/batches', {
        rawLotId: lot.id,
        productId: lot.productId || undefined,
        inputQuantity: Number(inputQty),
        unit,
        batchNumber: batchNumber.trim() || undefined,
        plannedOutputKg: plannedOutputKg || undefined,
        stages: selectedStages,
        notes,
      });
      await onAllocated();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || 'Failed to allocate to production');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-black flex items-center gap-2">
            <Factory size={18} className="text-amber-600" /> Allocate Lot to Production
          </h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4 text-xs">
          {/* Selected Lot Information */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5 space-y-1">
            <p className="font-bold text-slate-800 dark:text-slate-200 text-sm">
              Lot {lot.lotNumber || '—'} · {lot.product?.name || 'Raw Material'}
            </p>
            <p className="text-slate-500">
              Farmer / Vendor: <span className="font-semibold text-slate-700 dark:text-slate-300">{lot.farmerName || lot.supplier?.name || '—'}</span>
            </p>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 mt-2">
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Total Received</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{(lot.quantity ?? 0).toLocaleString('en-IN')} Kg</span>
              </div>
              <div>
                <span className="text-[10px] text-amber-600 dark:text-amber-400 block uppercase font-bold">Available to Allocate</span>
                <span className="font-black text-amber-600 dark:text-amber-400 text-sm">{(lot.availableKg ?? 0).toLocaleString('en-IN')} Kg</span>
              </div>
            </div>
          </div>

          {/* Allocation Input */}
          <div>
            <label className="block font-bold uppercase text-slate-500 mb-1">
              Quantity to Allocate * <span className="font-normal text-slate-400">(Max: {lot.availableKg} Kg)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min="0.001"
                max={lot.availableKg}
                step="any"
                value={inputQty}
                onChange={e => setInputQty(e.target.value)}
                placeholder="e.g. 700"
                className="flex-1 min-w-0 h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
                required
              />
              <select
                value={unit}
                onChange={e => setUnit(e.target.value)}
                className="w-28 h-10 px-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
              >
                {UNITS.map(u => <option key={u.k} value={u.k}>{u.k}</option>)}
              </select>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Creates a production order. Raw material is reserved now and consumed upon production finalization.
            </p>
          </div>

          <div>
            <label className="block font-bold uppercase text-slate-500 mb-1">Batch Number (Optional)</label>
            <input
              value={batchNumber}
              onChange={e => setBatchNumber(e.target.value)}
              placeholder="Leave blank to auto-generate"
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
            />
          </div>

          <div>
            <label className="block font-bold uppercase text-slate-500 mb-1">Planned Output (Kg, Optional)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={plannedOutputKg}
              onChange={e => setPlannedOutputKg(e.target.value)}
              placeholder="e.g. 650"
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
            />
          </div>

          <ProductionStageBuilder
            productId={lot?.productId || undefined}
            productName={lot?.product?.name || undefined}
            selectedStages={selectedStages}
            onChange={setSelectedStages}
            saveAsDefault={saveAsDefault}
            onSaveAsDefaultChange={setSaveAsDefault}
            isLoadingTemplate={templateLoading}
            isTemplateLoaded={templateLoaded}
          />

          <div>
            <label className="block font-bold uppercase text-slate-500 mb-1">Notes</label>
            <input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional operational notes"
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
            />
          </div>

          {error && <p className="text-xs text-red-500 font-semibold">{error}</p>}

          <button
            type="submit"
            disabled={saving || !inputQty || Number(inputQty) <= 0}
            className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Factory size={16} />}
            Confirm & Allocate to Production
          </button>
        </form>
      </div>
    </div>
  );
}

const KG_PER: Record<string, number> = { kg: 1, kgs: 1, kilogram: 1, g: 0.001, gm: 0.001, gram: 0.001, quintal: 100, qtl: 100, ton: 1000, tonne: 1000, mt: 1000 };
const kgPerUnit = (u?: string | null) => KG_PER[String(u ?? 'kg').trim().toLowerCase()] ?? null;

// Add Lot Modal
function AddLotModal({ products, onClose, onAdded }: {
  products: Product[]; onClose: () => void; onAdded: () => void;
}) {
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const { mutate: globalMutate } = useSWRConfig();

  const { data: purchasesResp } = useSWR(activeShopId ? ['/purchases?limit=100', activeShopId] : null, ([u]) => fetcher(u));
  const { data: allLots = [] } = useSWR<any[]>(activeShopId ? ['/mill/raw-lots', activeShopId] : null, ([u]) => fetcher(u));
  const candidates = useMemo(() => {
    const invoices: any[] = Array.isArray(purchasesResp) ? purchasesResp : (purchasesResp?.data || []);
    const out: { key: string; productId: string; productName: string; invoiceNumber: string; lotNumber: string; supplier: string; date: string; kg: number; ratePerUnit: number }[] = [];
    for (const inv of invoices) {
      const items: any[] = inv.purchaseItems || [];
      items.forEach((it, idx) => {
        // For raw_material products allow any baseUnit (unit may be 'pcs'/'bag'
        // from import default); fall back to per=1 so the item always appears.
        const isRawMat = it.product?.category === 'raw_material';
        const per = kgPerUnit(it.product?.baseUnit) ?? (isRawMat ? 1 : null);
        const inv_no = inv.invoiceNumber || '';
        if (!per || !it.product || !(Number(it.quantity) > 0) || !inv_no) return;
        const already = allLots.some((l: any) => l.productId === it.productId && (l.lotNumber === inv_no || String(l.lotNumber || '').startsWith(`${inv_no}-L`)));
        if (already) return;
        const kg = Math.round(Number(it.quantity) * per * 1000) / 1000;
        out.push({
          key: `${inv.id}:${it.id}`, productId: it.productId, productName: it.product.name, invoiceNumber: inv_no,
          lotNumber: items.length > 1 ? `${inv_no}-L${idx + 1}` : inv_no,
          supplier: inv.supplier?.name || '', date: String(inv.date || inv.createdAt || '').slice(0, 10), kg,
          ratePerUnit: Math.round((Number(it.cost) || 0) / per * 100) / 100,
        });
      });
    }
    return out;
  }, [purchasesResp, allLots]);

  const { data: godowns = [] } = useSWR<any[]>(activeShopId ? ['/godowns', activeShopId] : null, ([u]) => fetcher(u));
  const { data: suppliers = [] } = useSWR<any[]>(activeShopId ? ['/suppliers', activeShopId] : null, ([u]) => fetcher(u));
  const [importKey, setImportKey] = useState('');
  const [slipId, setSlipId] = useState('');
  const { data: slips = [] } = useSWR<any[]>(activeShopId ? ['/mill/weighbridge?status=completed', activeShopId] : null, ([u]) => fetcher(u));
  const imported = !!importKey || !!slipId;
  const [newProd, setNewProd] = useState<string | null>(null);
  const [creatingProd, setCreatingProd] = useState(false);
  const [form, setForm] = useState({
    productId: '', supplierId: '', farmerName: '', purchaseDate: new Date().toISOString().slice(0, 10),
    quantity: '', unit: '', moisturePct: '', ratePerUnit: '', notes: '', godownId: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const qty = Number(form.quantity) || 0;
  const ratePerUnit = Number(form.ratePerUnit) || 0;
  const computedTotal = qty > 0 && ratePerUnit > 0 ? Math.round(qty * ratePerUnit * 100) / 100 : null;
  const [successMsg, setSuccessMsg] = useState('');

  const importFromSlip = (id: string) => {
    setSlipId(id);
    setImportKey('');
    const w = slips.find((x: any) => x.id === id);
    if (!w) return;
    setForm(f => ({
      ...f,
      productId: w.productId || f.productId,
      supplierId: w.supplierId || f.supplierId,
      farmerName: w.supplier?.name || f.farmerName,
      purchaseDate: String(w.secondWeighedAt || w.createdAt || '').slice(0, 10) || f.purchaseDate,
      quantity: String(w.netWeightKg ?? ''),
      unit: w.product?.baseUnit || f.unit || 'kg',
      moisturePct: w.moisturePct != null ? String(w.moisturePct) : f.moisturePct,
      ratePerUnit: w.ratePerUnit != null ? String(w.ratePerUnit) : f.ratePerUnit,
      notes: `Weighbridge slip ${w.slipNumber}`
    }));
  };

  const importFromPurchase = (key: string) => {
    setImportKey(key);
    const c = candidates.find(x => x.key === key);
    if (!c) return;
    setSlipId('');
    setForm(f => ({
      ...f,
      productId: c.productId,
      supplierId: (c as any).supplierId || '',
      farmerName: c.supplier || '',
      purchaseDate: c.date || f.purchaseDate,
      quantity: String(c.kg),
      unit: (c as any).baseUnit || f.unit || 'kg',
      ratePerUnit: c.ratePerUnit ? String(c.ratePerUnit) : '',
      notes: `Imported from Purchase Invoice ${c.invoiceNumber}`
    }));
  };

  const createProduct = async () => {
    const name = (newProd || '').trim();
    if (!name) return;
    setCreatingProd(true); setError('');
    try {
      const { data: created } = await api.post('/products', {
        name, category: 'Raw Material', millCategory: 'raw_material', baseUnit: 'kg', currentStock: 0, sellingPrice: 0
      });
      await globalMutate(['/products', activeShopId]);
      products.push({ id: created.id, name, millCategory: 'raw_material' } as any);
      setForm(f => ({ ...f, productId: created.id }));
      setNewProd(null);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || 'Failed to create product');
    } finally {
      setCreatingProd(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.productId) { setError('Select the raw material product (or create it with "+ New product").'); return; }
    setSaving(true); setError(''); setSuccessMsg('');
    try {
      if (slipId) {
        const res = await api.post(`/mill/weighbridge/${slipId}/convert-to-lot`, {
          productId: form.productId, farmerName: form.farmerName,
          ratePerUnit: form.ratePerUnit ? Number(form.ratePerUnit) : undefined, moisturePct: form.moisturePct ? Number(form.moisturePct) : undefined,
        });
        setSuccessMsg(`Lot ${res.data?.lotNumber || 'created'} successfully!`);
        setTimeout(onAdded, 1500);
        return;
      }
      const res = await api.post('/mill/raw-lots', {
        purchaseItemId: importKey ? importKey.split(':')[1] : undefined,
        productId: form.productId,
        godownId: form.godownId || undefined,
        supplierId: form.supplierId || undefined,
        farmerName: form.farmerName,
        purchaseDate: form.purchaseDate,
        quantity: Number(form.quantity),
        unit: form.unit,
        moisturePct: form.moisturePct ? Number(form.moisturePct) : null,
        ratePerUnit: form.ratePerUnit ? Number(form.ratePerUnit) : null,
        notes: form.notes,
      });
      setSuccessMsg(`Lot ${res.data?.lotNumber || 'created'} successfully!`);
      setTimeout(onAdded, 1500);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || 'Failed to add lot');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900">
          <h2 className="text-lg font-black">Add Raw Material Lot</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 space-y-1.5" data-testid="import-from-purchase">
            <span className="block text-xs font-bold uppercase text-slate-500">Import from Purchase (optional)</span>
            <select
              value={importKey}
              onChange={e => e.target.value ? importFromPurchase(e.target.value) : setImportKey('')}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm"
            >
              <option value="">{candidates.length ? '— Select a purchase line —' : 'No purchase lines waiting to be added'}</option>
              {candidates.map(c => <option key={c.key} value={c.key}>{c.invoiceNumber} · {c.productName} · {c.kg} kg{c.supplier ? ` · ${c.supplier}` : ''}</option>)}
            </select>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 space-y-1.5" data-testid="import-from-weighbridge">
            <span className="block text-xs font-bold uppercase text-slate-500">Import from Weighbridge (optional)</span>
            <select
              value={slipId}
              onChange={e => e.target.value ? importFromSlip(e.target.value) : setSlipId('')}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm"
            >
              <option value="">{slips.length ? '— Select a completed slip —' : 'No completed weighbridge slips waiting'}</option>
              {slips.map((w: any) => <option key={w.id} value={w.id}>{w.slipNumber} · {w.vehicleNumber}{w.product?.name ? ` · ${w.product.name}` : ''} · net {w.netWeightKg} kg</option>)}
            </select>
          </div>
          <div className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Product *</span>
            <select
              value={newProd !== null ? '__new__' : form.productId}
              required
              onChange={e => {
                if (e.target.value === '__new__') {
                  setNewProd('');
                } else {
                  const p = products.find(x => x.id === e.target.value);
                  setNewProd(null);
                  setForm(f => ({ ...f, productId: e.target.value, unit: p?.baseUnit || f.unit }));
                }
              }}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
            >
              <option value="" disabled hidden>Select product</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value="__new__">+ New product…</option>
            </select>
            {newProd !== null && (
              <div className="mt-2 flex flex-wrap items-end gap-2 p-2 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10">
                <input
                  autoFocus
                  value={newProd}
                  onChange={e => setNewProd(e.target.value)}
                  placeholder="Product name (e.g. Paddy)"
                  className="flex-1 min-w-[10rem] h-9 px-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-950 text-sm"
                />
                <button
                  type="button"
                  onClick={createProduct}
                  disabled={creatingProd || !newProd.trim()}
                  className="h-9 px-3 text-xs font-bold rounded-md bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
                >
                  {creatingProd ? '…' : 'Confirm & create'}
                </button>
                <button type="button" onClick={() => setNewProd(null)} className="h-9 px-2 text-xs font-semibold text-slate-500">Cancel</button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block col-span-2 sm:col-span-1">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Received Date</span>
              <input
                type="date"
                value={form.purchaseDate}
                onChange={e => setForm(f => ({ ...f, purchaseDate: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Farmer / Vendor</span>
              <select
                value={form.supplierId}
                onChange={e => setForm(f => ({ ...f, supplierId: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
              >
                <option value="">— Select Vendor —</option>
                {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Storage / Godown *</span>
              <select
                value={form.godownId}
                required
                onChange={e => setForm(f => ({ ...f, godownId: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
              >
                <option value="" disabled hidden>— Select Godown —</option>
                {godowns.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Quantity *</span>
              <input
                type="number"
                min="0"
                step="0.001"
                value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                readOnly={imported}
                className={cn('w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm', imported && 'opacity-70')}
                required
              />
            </label>
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Unit *</span>
              <select
                value={form.unit}
                onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
                required
              >
                <option value="" disabled hidden>Unit</option>
                <option value="kg">Kg</option>
                <option value="quintal">Quintal</option>
                <option value="ton">Ton</option>
                <option value="litre">Litre</option>
                <option value="piece">Piece</option>
                <option value="bag">Bag</option>
                <option value="box">Box</option>
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Moisture %</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={form.moisturePct}
                onChange={e => setForm(f => ({ ...f, moisturePct: e.target.value }))}
                placeholder="Optional"
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
              />
            </label>
          </div>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Rate per Unit (₹)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.ratePerUnit}
              onChange={e => setForm(f => ({ ...f, ratePerUnit: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
            />
            {computedTotal != null && <span className="block text-[11px] text-slate-400 mt-1">Total: {rupee(computedTotal)}</span>}
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Notes</span>
            <input
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
            />
          </label>
          {error && <p className="text-sm text-red-500">{error}</p>}
          {successMsg && <p className="text-sm font-bold text-emerald-600 bg-emerald-50 p-2 rounded-lg border border-emerald-200">{successMsg}</p>}
          <button
            type="submit"
            disabled={saving || !form.quantity || !form.productId || !!successMsg}
            className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Add Lot
          </button>
        </form>
      </div>
    </div>
  );
}
