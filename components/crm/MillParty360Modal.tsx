'use client';

import { useState } from 'react';
import useSWR from 'swr';
import {
  X,
  Phone,
  MapPin,
  Loader2,
  Wheat,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  Clock,
  Plus,
  RefreshCw,
  FileText,
  Building2,
  Share2,
  PackageCheck
} from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { Link } from '@/i18n/routing';
import PaymentCollectionModal from './PaymentCollectionModal';
import toast from 'react-hot-toast';
import MaterialFlowCard, { kg } from '@/components/mill/MaterialFlowCard';

const fetcher = (url: string) => api.get(url).then(res => res.data);
const rupee = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

type MillParty360Props = {
  partyId: string;
  onClose: () => void;
  onUpdated?: () => void;
};

export default function MillParty360Modal({ partyId, onClose, onUpdated }: MillParty360Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'grain' | 'production' | 'ledger'>('overview');
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const { data, isLoading, mutate } = useSWR(
    partyId ? `/crm/customers/${partyId}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const customer = data?.customer;
  const jobWorkOrders: any[] = data?.jobWorkOrders || [];
  const linkedBatches: any[] = data?.linkedBatches || [];
  const rawLots: any[] = data?.rawLots || [];
  const flow = data?.materialFlow;
  const finance = data?.finance || { totalDue: 0, totalCharged: 0, totalPaid: 0, status: 'clear' };

  // Material Stats
  const totalJwInputKg = jobWorkOrders.reduce((s, j) => s + (Number(j.inputWeightKg) || 0), 0);
  const totalProcessedKg = jobWorkOrders.reduce((s, j) => s + (Number(j.outputWeightKg) || 0), 0);
  const activeBatchesCount = linkedBatches.filter(b => b.status === 'open' || b.status === 'in_progress').length;

  const handleShareWhatsApp = () => {
    if (!customer) return;
    const dueText = finance.totalDue > 0
      ? `Total Due / बाकी रक्कम: ₹${finance.totalDue.toLocaleString('en-IN')}`
      : finance.totalDue < 0
        ? `Advance Balance / ॲडव्हान्स: ₹${Math.abs(finance.totalDue).toLocaleString('en-IN')}`
        : `Account Status: Clear / हिशोब पूर्ण`;

    const text = `*Radhesham Mill Statement*\nParty: ${customer.name}\n${dueText}\nTotal Grain Received: ${totalJwInputKg.toLocaleString('en-IN')} Kg\nActive Batches: ${activeBatchesCount}\nThank you!`;
    const url = `https://wa.me/${customer.mobile ? customer.mobile.replace(/\D/g, '') : ''}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4 animate-in fade-in">
      <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 w-full max-w-4xl rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col h-[94vh] max-h-[94vh] overflow-hidden">
        
        {/* Modal Header */}
        <div className="p-4 sm:p-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight truncate">
                  {customer?.name || 'Party Profile'}
                </h2>
                {customer?.shopName && (
                  <span className="text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                    {customer.shopName}
                  </span>
                )}
                <span className="text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  🌾 Farmer / Customer
                </span>
                {finance.status === 'due' && (
                  <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300">
                    🔴 Due: {rupee(finance.totalDue)}
                  </span>
                )}
                {finance.status === 'advance' && (
                  <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                    🔵 Advance: {rupee(Math.abs(finance.totalDue))}
                  </span>
                )}
                {finance.status === 'clear' && (
                  <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    🟢 Clear: ₹0
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4 text-xs text-slate-500 mt-1.5 flex-wrap">
                {customer?.mobile && (
                  <a href={`tel:${customer.mobile}`} className="flex items-center gap-1 hover:text-emerald-600 font-semibold">
                    <Phone size={13} className="text-emerald-500" /> {customer.mobile}
                  </a>
                )}
                {customer?.address && (
                  <span className="flex items-center gap-1 text-slate-400 truncate max-w-xs">
                    <MapPin size={13} className="shrink-0" /> {customer.address}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleShareWhatsApp}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 text-emerald-600 transition-colors"
                title="Share Statement on WhatsApp"
              >
                <Share2 size={16} />
              </button>
              <button
                onClick={() => setShowPaymentModal(true)}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <Plus size={14} /> Record Payment / Advance
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 mt-5 border-b border-slate-100 dark:border-slate-800 -mb-4 overflow-x-auto">
            <button
              onClick={() => setActiveTab('overview')}
              className={cn(
                "pb-3 px-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5",
                activeTab === 'overview'
                  ? "border-amber-500 text-amber-600 dark:text-amber-400"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              )}
            >
              <Building2 size={14} /> 360° Overview
            </button>
            <button
              onClick={() => setActiveTab('grain')}
              className={cn(
                "pb-3 px-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5",
                activeTab === 'grain'
                  ? "border-amber-500 text-amber-600 dark:text-amber-400"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              )}
            >
              <Wheat size={14} /> Grain & Job Work ({jobWorkOrders.length + rawLots.length})
            </button>
            <button
              onClick={() => setActiveTab('production')}
              className={cn(
                "pb-3 px-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5",
                activeTab === 'production'
                  ? "border-amber-500 text-amber-600 dark:text-amber-400"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              )}
            >
              <Layers size={14} /> Live Batches ({linkedBatches.length})
            </button>
            <button
              onClick={() => setActiveTab('ledger')}
              className={cn(
                "pb-3 px-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5",
                activeTab === 'ledger'
                  ? "border-amber-500 text-amber-600 dark:text-amber-400"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              )}
            >
              <FileText size={14} /> Khata & Statement ({customer?.customer_transactions?.length || 0})
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {isLoading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="animate-spin text-amber-600" size={32} />
            </div>
          ) : (
            <>
              {/* Top Financial & Material Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Grain Received</span>
                  <p className="text-lg sm:text-xl font-black text-slate-900 dark:text-white mt-0.5">
                    {totalJwInputKg.toLocaleString('en-IN')} <span className="text-xs font-normal text-slate-400">Kg</span>
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">{jobWorkOrders.length} Job Work Order(s)</p>
                </div>

                <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Processed Output</span>
                  <p className="text-lg sm:text-xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {totalProcessedKg.toLocaleString('en-IN')} <span className="text-xs font-normal text-slate-400">Kg</span>
                  </p>
                  <p className="text-[11px] text-emerald-600/80 mt-1">Milled & Delivered</p>
                </div>

                <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Charges Billed</span>
                  <p className="text-lg sm:text-xl font-black text-slate-900 dark:text-white mt-0.5">
                    {rupee(finance.totalCharged)}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">Milling & Services</p>
                </div>

                <div className={cn(
                  "p-3.5 rounded-2xl border",
                  finance.status === 'due'
                    ? "bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40"
                    : finance.status === 'advance'
                      ? "bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/40"
                      : "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40"
                )}>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    {finance.status === 'due' ? 'Outstanding Due (बाकी)' : finance.status === 'advance' ? 'Advance Balance' : 'Account Balance'}
                  </span>
                  <p className={cn(
                    "text-lg sm:text-xl font-black mt-0.5",
                    finance.status === 'due' ? "text-red-600 dark:text-red-400" : finance.status === 'advance' ? "text-blue-600 dark:text-blue-400" : "text-emerald-600 dark:text-emerald-400"
                  )}>
                    {finance.status === 'due' ? rupee(finance.totalDue) : finance.status === 'advance' ? rupee(Math.abs(finance.totalDue)) : '₹0 (Clear)'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {finance.status === 'due' ? 'Payment Pending' : finance.status === 'advance' ? 'Credit available' : 'Fully Settled'}
                  </p>
                </div>
              </div>

              {/* OVERVIEW TAB */}
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  <MaterialFlowCard flow={flow} />
                  {/* Active Production Pipeline for this Customer */}
                  <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Layers size={16} className="text-amber-500" />
                        <h3 className="font-bold text-sm text-slate-900 dark:text-white">Active Production Status</h3>
                      </div>
                      <span className="text-xs font-semibold text-slate-400">{linkedBatches.length} Total Batches</span>
                    </div>

                    {linkedBatches.length === 0 ? (
                      <p className="text-xs text-slate-400 py-2">No production batches currently linked to this customer.</p>
                    ) : (
                      <div className="space-y-2">
                        {linkedBatches.slice(0, 3).map((b: any) => (
                          <div key={b.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-sm text-slate-800 dark:text-slate-200">{b.batchNumber}</span>
                                <span className={cn(
                                  "text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full",
                                  b.status === 'closed' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                                )}>
                                  {b.status === 'closed' ? 'Completed' : `Stage: ${b.currentStage || 'Running'}`}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5">
                                Input: {b.inputKg} Kg · Output: {b.outputKg ? `${b.outputKg} Kg` : 'In Progress'}
                              </p>
                            </div>
                            <Link
                              href={`/batches` as any}
                              className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline inline-flex items-center gap-1"
                            >
                              View Batch →
                            </Link>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Recent Job Work Grain Summary */}
                  <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Wheat size={16} className="text-amber-500" />
                        <h3 className="font-bold text-sm text-slate-900 dark:text-white">Recent Job Work Orders</h3>
                      </div>
                      <Link href={`/job-work` as any} className="text-xs font-bold text-amber-600 hover:underline">
                        + New Job Work Order
                      </Link>
                    </div>

                    {jobWorkOrders.length === 0 ? (
                      <p className="text-xs text-slate-400 py-2">No Job Work orders recorded yet.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="text-slate-400 font-semibold border-b border-slate-100 dark:border-slate-800">
                              <th className="pb-2">Order #</th>
                              <th className="pb-2">Material</th>
                              <th className="pb-2 text-right">Input (Kg)</th>
                              <th className="pb-2 text-right">Output (Kg)</th>
                              <th className="pb-2 text-right">Rate</th>
                              <th className="pb-2 text-right">Fee</th>
                              <th className="pb-2 text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {jobWorkOrders.slice(0, 5).map((jw: any) => (
                              <tr key={jw.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                                <td className="py-2.5 font-mono font-bold text-slate-800 dark:text-slate-200">{jw.orderNumber}</td>
                                <td className="py-2.5 font-medium">{jw.materialDescription}</td>
                                <td className="py-2.5 text-right font-mono">{jw.inputWeightKg}</td>
                                <td className="py-2.5 text-right font-mono text-emerald-600 font-semibold">{jw.outputWeightKg || '—'}</td>
                                <td className="py-2.5 text-right font-mono">₹{jw.ratePerKg}/Kg</td>
                                <td className="py-2.5 text-right font-mono font-bold">{jw.feeAmount ? rupee(jw.feeAmount) : '—'}</td>
                                <td className="py-2.5 text-center">
                                  <span className={cn(
                                    "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full",
                                    jw.status === 'delivered' ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                                      : jw.status === 'completed' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                        : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                                  )}>
                                    {jw.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* GRAIN & MATERIAL TAB */}
              {activeTab === 'grain' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                      <Wheat size={16} className="text-amber-500" /> All Job Work Orders ({jobWorkOrders.length})
                    </h3>
                    <div className="space-y-3">
                      {jobWorkOrders.map((jw: any) => (
                        <div key={jw.id} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-2">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-mono font-black text-sm text-slate-900 dark:text-white">{jw.orderNumber}</span>
                            <span className={cn(
                              "text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full",
                              jw.status === 'delivered' ? "bg-blue-100 text-blue-700" : jw.status === 'completed' ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                            )}>
                              {jw.status}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            <div>
                              <span className="text-slate-400">Material</span>
                              <p className="font-semibold text-slate-800 dark:text-slate-200">{jw.materialDescription}</p>
                            </div>
                            <div>
                              <span className="text-slate-400">Input Weight</span>
                              <p className="font-semibold font-mono">{jw.inputWeightKg} Kg</p>
                            </div>
                            <div>
                              <span className="text-slate-400">Milled Output</span>
                              <p className="font-semibold font-mono text-emerald-600">{jw.outputWeightKg ? `${jw.outputWeightKg} Kg` : 'In Process'}</p>
                            </div>
                            <div>
                              <span className="text-slate-400">Processing Fee</span>
                              <p className="font-bold font-mono">{jw.feeAmount ? rupee(jw.feeAmount) : `₹${jw.ratePerKg}/Kg`}</p>
                            </div>
                          </div>
                          <div className="text-[11px] text-slate-500 pt-1.5 border-t border-slate-200/50 dark:border-slate-800 flex justify-between items-center">
                            <span>🌾 Deal: {jw.byproductRetainedByMill ? 'Mill keeps Husk/Bran' : 'Customer takes By-products'}</span>
                            <span>Received: {new Date(jw.receivedAt).toLocaleDateString('en-IN')}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* LIVE BATCHES TAB */}
              {activeTab === 'production' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                      <Layers size={16} className="text-amber-500" /> Linked Production Batches ({linkedBatches.length})
                    </h3>
                    {linkedBatches.length === 0 ? (
                      <p className="text-xs text-slate-400 py-4 text-center">No production batches started for this customer yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {linkedBatches.map((b: any) => (
                          <div key={b.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="font-mono font-black text-sm">{b.batchNumber}</span>
                              <span className={cn(
                                "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full",
                                b.status === 'closed' ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                              )}>
                                {b.status}
                              </span>
                            </div>

                            {/* Stage Pipeline */}
                            {b.stages && b.stages.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {b.stages.map((st: any, idx: number) => (
                                  <span
                                    key={st.id}
                                    className={cn(
                                      "text-[10px] font-semibold px-2 py-0.5 rounded-md border",
                                      st.completedAt
                                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800"
                                        : st.stageName === b.currentStage
                                          ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800 font-bold"
                                          : "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:border-slate-700"
                                    )}
                                  >
                                    {idx + 1}. {st.stageName}
                                  </span>
                                ))}
                              </div>
                            )}

                            <div className="grid grid-cols-3 gap-2 text-xs pt-1 border-t border-slate-200/50 dark:border-slate-800">
                              <div>
                                <span className="text-slate-400">Input Grain</span>
                                <p className="font-semibold font-mono">{b.inputKg} Kg</p>
                              </div>
                              <div>
                                <span className="text-slate-400">Finished Output</span>
                                <p className="font-semibold font-mono text-emerald-600">{b.outputKg != null ? `${b.outputKg} Kg` : 'Processing'}</p>
                              </div>
                              <div>
                                <span className="text-slate-400">Recovery %</span>
                                <p className="font-semibold font-mono">{b.recoveryPct != null ? `${b.recoveryPct}%` : '—'}</p>
                              </div>
                            </div>
                            {(() => {
                              const f = flow?.perBatch?.find((x: any) => x.id === b.id);
                              if (!f) return null;
                              const cell = (label: string, v: number, cls = '') => (
                                <div key={label}>
                                  <span className="text-slate-400">{label}</span>
                                  <p className={cn('font-semibold font-mono', cls)}>{kg(v)}</p>
                                </div>
                              );
                              return (
                                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs pt-2 border-t border-slate-200/50 dark:border-slate-800">
                                  {cell('Finished', f.finishedKg, 'text-emerald-600')}
                                  {cell('WIP', f.wipKg, 'text-blue-600')}
                                  {cell('Rejected', f.rejectedKg, 'text-rose-600')}
                                  {cell('Reprocessed', f.reprocessedKg, 'text-violet-600')}
                                  {cell('By-products', f.byProductKg, 'text-violet-600')}
                                  {cell('Waste', f.wastageKg, 'text-rose-600')}
                                </div>
                              );
                            })()}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* KHATA LEDGER & STATEMENT TAB */}
              {activeTab === 'ledger' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                        <FileText size={16} className="text-amber-500" /> Account Statement & Ledger
                      </h3>
                      <button
                        onClick={() => setShowPaymentModal(true)}
                        className="text-xs font-bold text-emerald-600 hover:underline"
                      >
                        + Add Payment / Advance
                      </button>
                    </div>

                    {(!customer?.customer_transactions || customer.customer_transactions.length === 0) ? (
                      <p className="text-xs text-slate-400 py-4 text-center">No transactions recorded yet.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="text-slate-400 font-semibold border-b border-slate-100 dark:border-slate-800">
                              <th className="pb-2">Date</th>
                              <th className="pb-2">Particulars / Details</th>
                              <th className="pb-2 text-right">Debit (Charge)</th>
                              <th className="pb-2 text-right">Credit (Paid)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {customer.customer_transactions.map((tx: any) => {
                              const isCharge = tx.type === 'charge' || tx.type === 'debit';
                              return (
                                <tr key={tx.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                                  <td className="py-2.5 text-slate-500 whitespace-nowrap">
                                    {new Date(tx.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                  </td>
                                  <td className="py-2.5 font-medium">
                                    {tx.note || (isCharge ? 'Milling / Goods Charge' : 'Payment Received')}
                                  </td>
                                  <td className="py-2.5 text-right font-mono font-bold text-red-600">
                                    {isCharge ? rupee(tx.amount) : '—'}
                                  </td>
                                  <td className="py-2.5 text-right font-mono font-bold text-emerald-600">
                                    {!isCharge ? rupee(tx.amount) : '—'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Payment / Advance Modal */}
      {showPaymentModal && customer && (
        <PaymentCollectionModal
          entityId={customer.id}
          entityType="party"
          entityName={customer.name}
          entityMobile={customer.mobile}
          outstanding={finance.totalDue}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={() => {
            mutate();
            if (onUpdated) onUpdated();
          }}
        />
      )}
    </div>
  );
}
