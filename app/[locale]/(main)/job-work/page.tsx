'use client';

import { useState } from 'react';
import useSWR from 'swr';
import DeleteButton from '@/components/mill/DeleteButton';
import { Plus, X, Loader2, Wheat, PlayCircle, CheckCircle2 } from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import ModalPortal from '@/components/mill/ModalPortal';
import MaterialFlowCard from '@/components/mill/MaterialFlowCard';

type JobWorkOrder = {
  id: string; orderNumber: string; materialDescription: string; inputWeightKg: number;
  outputDescription: string | null; outputWeightKg: number | null;
  ratePerKg: number; feeBasis: 'input' | 'output'; feeAmount: number | null;
  byproductRetainedByMill: boolean; status: 'received' | 'processing' | 'completed' | 'delivered';
  notes: string | null; receivedAt: string; deliveredAt?: string | null;
  customer?: { id: string; name: string; mobile: string | null } | null;
  gateEntry?: { id: string; entryNumber: string } | null;
};
type Customer = { id: string; name: string; mobile?: string | null };
type GateEntry = { id: string; entryNumber: string; vehicleNumber: string };

const fetcher = (u: string) => api.get(u).then(r => r.data);
const rupee = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const statusTone = (s: string) => s === 'delivered'
  ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
  : s === 'completed'
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
    : s === 'processing'
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';

export default function JobWorkPage() {
  const t = useTranslations('JobWork');
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [completingOrder, setCompletingOrder] = useState<JobWorkOrder | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [deliveringId, setDeliveringId] = useState<string | null>(null);

  const { data: orders = [], mutate: refetch, isLoading } = useSWR<JobWorkOrder[]>(
    activeShopId ? ['/mill/job-work', activeShopId] : null,
    ([u]) => fetcher(u),
  );
  const { data: customers = [], mutate: refetchCustomers } = useSWR<Customer[]>(
    activeShopId ? ['/crm/customers?type=party', activeShopId] : null,
    ([u]) => fetcher(u),
  );
  const { data: gateEntries = [] } = useSWR<GateEntry[]>(
    activeShopId ? ['/mill/gate-entries', activeShopId] : null,
    ([u]) => fetcher(u),
  );

  const stats = {
    received: orders.filter(o => o.status === 'received').length,
    processing: orders.filter(o => o.status === 'processing').length,
    completed: orders.filter(o => o.status === 'completed').length,
    delivered: orders.filter(o => o.status === 'delivered').length,
  };

  const startProcessing = async (order: JobWorkOrder) => {
    setStartingId(order.id);
    try {
      await api.patch(`/mill/job-work/${order.id}`, { action: 'start' });
      refetch();
    } catch (err: any) {
      alert(err?.response?.data?.detail || err?.response?.data?.error || err?.message || t('failedToStart'));
    } finally { setStartingId(null); }
  };

  const markDelivered = async (order: JobWorkOrder) => {
    if (!confirm(`Mark Order ${order.orderNumber} as Returned / Delivered to customer ${order.customer?.name || ''}?`)) return;
    setDeliveringId(order.id);
    try {
      await api.patch(`/mill/job-work/${order.id}`, { action: 'deliver' });
      refetch();
    } catch (err: any) {
      alert(err?.response?.data?.detail || err?.response?.data?.error || err?.message || 'Failed to deliver');
    } finally { setDeliveringId(null); }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Wheat size={22} className="text-amber-600" /> {t('title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
        </div>
        <button onClick={() => setCreating(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors">
          <Plus size={18} /> {t('newOrder')}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label={t('received')} value={stats.received} tone="slate" />
        <StatCard label={t('processing')} value={stats.processing} tone="amber" />
        <StatCard label={t('completed')} value={stats.completed} tone="emerald" />
        <StatCard label="Delivered / Returned" value={stats.delivered} tone="blue" />
      </div>

      {isLoading ? (
        <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
      ) : orders.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
          <Wheat size={40} className="mx-auto text-slate-300 dark:text-slate-700" />
          <p className="mt-3 text-sm text-slate-500">{t('noOrders')}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {orders.map(o => (
              <li key={o.id} onClick={() => setDetailId(o.id)} className="p-4 flex items-center justify-between gap-4 flex-wrap cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-slate-900 dark:text-white">{o.orderNumber}</span>
                    <span className={cn('text-[10px] font-bold uppercase px-2 py-0.5 rounded-full', statusTone(o.status))}>
                      {o.status === 'delivered' ? 'RETURNED / CLOSED' : t(o.status)}
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-950/30 dark:text-purple-300">
                      🌾 Customer Grain
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {o.customer?.name ? `${o.customer.name} · ` : ''}
                    {t('inputLabel')} {o.materialDescription} × {o.inputWeightKg} Kg
                    {o.outputWeightKg != null ? ` · ${t('outputLabel')} ${o.outputDescription || ''} × ${o.outputWeightKg} Kg` : ''}
                    {o.feeAmount != null ? ` · ${rupee(o.feeAmount)}` : ` · ₹${o.ratePerKg}/Kg`}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  {o.status === 'received' && <DeleteButton url={`/mill/job-work/${o.id}`} name={o.orderNumber} onDone={() => refetch()} />}
                  {o.status === 'received' && (
                    <button onClick={() => startProcessing(o)} disabled={startingId === o.id}
                      className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-100 disabled:opacity-50">
                      {startingId === o.id ? <Loader2 size={13} className="animate-spin" /> : <PlayCircle size={13} />} {t('startProcessing')}
                    </button>
                  )}
                  {o.status === 'processing' && (
                    <button onClick={() => setCompletingOrder(o)}
                      className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100">
                      <CheckCircle2 size={13} /> {t('completeAndCollect')}
                    </button>
                  )}
                  {o.status === 'completed' && (
                    <button onClick={() => markDelivered(o)} disabled={deliveringId === o.id}
                      className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 hover:bg-blue-100 disabled:opacity-50">
                      {deliveringId === o.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Return / Deliver
                    </button>
                  )}
                  {o.status === 'delivered' && (
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                      ✓ Closed
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {detailId && <ModalPortal><OrderDetailModal id={detailId} onClose={() => setDetailId(null)} /></ModalPortal>}
      {creating && (
        <ModalPortal><CreateOrderModal
          customers={customers}
          gateEntries={gateEntries}
          onClose={() => setCreating(false)}
          onCustomerAdded={() => refetchCustomers()}
          onCreated={() => { setCreating(false); refetch(); }}
        /></ModalPortal>
      )}
      {completingOrder && (
        <ModalPortal><CompleteOrderModal
          order={completingOrder}
          onClose={() => setCompletingOrder(null)}
          onCompleted={(paymentFailed) => {
            setCompletingOrder(null);
            refetch();
            if (paymentFailed) alert(t('paymentNotRecordedWarning'));
          }}
        /></ModalPortal>
      )}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: 'slate' | 'amber' | 'emerald' | 'blue' }) {
  const map = { slate: 'text-slate-400', amber: 'text-amber-500', emerald: 'text-emerald-500', blue: 'text-blue-500' };
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <p className={cn('text-2xl font-black', map[tone])}>{value}</p>
      <p className="text-[11px] text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

function CreateOrderModal({ customers, gateEntries, onClose, onCreated, onCustomerAdded }: {
  customers: Customer[]; gateEntries: GateEntry[]; onClose: () => void; onCreated: () => void; onCustomerAdded: () => void;
}) {
  const t = useTranslations('JobWork');
  const [form, setForm] = useState({
    customerId: '', materialDescription: '', inputWeightKg: '', outputDescription: '',
    ratePerKg: '', feeBasis: 'input' as 'input' | 'output', byproductRetainedByMill: true,
    gateEntryId: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Quick "Add customer" — creates the same Party record the Party section lists, so it shows up there too.
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [newCust, setNewCust] = useState({ name: '', mobile: '', village: '' });
  const [savingCust, setSavingCust] = useState(false);
  const [extraCustomers, setExtraCustomers] = useState<Customer[]>([]);

  const saveCustomer = async () => {
    if (!newCust.name.trim()) return;
    setSavingCust(true); setError('');
    try {
      const res = await api.post('/crm/customers', {
        name: newCust.name.trim(),
        mobile: newCust.mobile.trim() || undefined,
        village: newCust.village.trim() || undefined,
        address: newCust.village.trim() || undefined,
        customerType: 'party',
      });
      const created = res.data?.customer ?? res.data;
      if (created?.id) {
        setExtraCustomers(list => [...list, { id: created.id, name: created.name || newCust.name.trim(), mobile: created.mobile }]);
        setForm(f => ({ ...f, customerId: created.id }));
      }
      onCustomerAdded();
      setNewCust({ name: '', mobile: '', village: '' });
      setAddingCustomer(false);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || t('failedToAddCustomer'));
    } finally { setSavingCust(false); }
  };

  const customerOptions = [...customers, ...extraCustomers.filter(x => !customers.some(c => c.id === x.id))];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/mill/job-work', {
        ...form,
        inputWeightKg: Number(form.inputWeightKg),
        ratePerKg: Number(form.ratePerKg),
        gateEntryId: form.gateEntryId || null,
      });
      onCreated();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || t('failedToCreate'));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900">
          <h2 className="text-lg font-black">{t('newOrder')}</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="block text-xs font-bold uppercase text-slate-500">{t('customer')} *</span>
              <button type="button" onClick={() => setAddingCustomer(v => !v)} className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
                <Plus size={13} /> {t('addCustomer')}
              </button>
            </div>
            <select value={form.customerId} onChange={e => setForm(f => ({ ...f, customerId: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" required>
              <option value="">{t('selectCustomer')}</option>
              {customerOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {addingCustomer && (
              <div className="mt-2 p-3 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/20 space-y-2">
                <p className="text-[11px] font-black uppercase text-emerald-700 dark:text-emerald-400">{t('newCustomerTitle')}</p>
                <input value={newCust.name} onChange={e => setNewCust(n => ({ ...n, name: e.target.value }))} placeholder={t('customerName')} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveCustomer(); } }} autoFocus
                  className="w-full h-9 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-sm" />
                <div className="grid grid-cols-2 gap-2">
                  <input value={newCust.mobile} onChange={e => setNewCust(n => ({ ...n, mobile: e.target.value }))} placeholder={t('customerMobile')} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveCustomer(); } }} inputMode="tel"
                    className="w-full h-9 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-sm" />
                  <input value={newCust.village} onChange={e => setNewCust(n => ({ ...n, village: e.target.value }))} placeholder={t('customerVillage')} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveCustomer(); } }}
                    className="w-full h-9 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-sm" />
                </div>
                <button type="button" onClick={saveCustomer} disabled={savingCust || !newCust.name.trim()}
                  className="w-full h-9 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1.5">
                  {savingCust ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} {t('saveCustomer')}
                </button>
              </div>
            )}
          </div>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('material')} *</span>
            <input value={form.materialDescription} onChange={e => setForm(f => ({ ...f, materialDescription: e.target.value }))}
              placeholder={t('materialPlaceholder')}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" required />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('inputWeight')} *</span>
              <input type="number" min="0" step="0.01" value={form.inputWeightKg} onChange={e => setForm(f => ({ ...f, inputWeightKg: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" required />
            </label>
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('rate')} *</span>
              <input type="number" min="0" step="0.01" value={form.ratePerKg} onChange={e => setForm(f => ({ ...f, ratePerKg: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" required />
            </label>
          </div>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('outputMaterialOptional')}</span>
            <input value={form.outputDescription} onChange={e => setForm(f => ({ ...f, outputDescription: e.target.value }))}
              placeholder={t('outputMaterialPlaceholder')}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('feeBasis')}</span>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setForm(f => ({ ...f, feeBasis: 'input' }))}
                className={cn('h-9 rounded-lg text-xs font-bold border-2 transition-colors px-2',
                  form.feeBasis === 'input' ? 'border-amber-500 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'border-slate-200 dark:border-slate-700 text-slate-500')}>
                {t('feeBasisInput')}
              </button>
              <button type="button" onClick={() => setForm(f => ({ ...f, feeBasis: 'output' }))}
                className={cn('h-9 rounded-lg text-xs font-bold border-2 transition-colors px-2',
                  form.feeBasis === 'output' ? 'border-amber-500 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'border-slate-200 dark:border-slate-700 text-slate-500')}>
                {t('feeBasisOutput')}
              </button>
            </div>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.byproductRetainedByMill} onChange={e => setForm(f => ({ ...f, byproductRetainedByMill: e.target.checked }))}
              className="w-4 h-4 rounded border-slate-300" />
            <span className="text-xs text-slate-600 dark:text-slate-400">{t('byproductRetained')}</span>
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('gateEntryOptional')}</span>
            <select value={form.gateEntryId} onChange={e => setForm(f => ({ ...f, gateEntryId: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm">
              <option value="">{t('noGateEntry')}</option>
              {gateEntries.map(g => <option key={g.id} value={g.id}>{g.entryNumber} — {g.vehicleNumber}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('notesOptional')}</span>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </label>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={saving}
            className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {t('createOrder')}
          </button>
        </form>
      </div>
    </div>
  );
}

function CompleteOrderModal({ order, onClose, onCompleted }: {
  order: JobWorkOrder; onClose: () => void; onCompleted: (paymentFailed?: boolean) => void;
}) {
  const t = useTranslations('JobWork');
  const [outputWeightKg, setOutputWeightKg] = useState('');
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'UPI' | 'Card'>('Cash');
  const [amountPaid, setAmountPaid] = useState('');
  const [bps, setBps] = useState<{ name: string; kg: string; productId: string }[]>([]);
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const { data: products = [] } = useSWR<any[]>(activeShopId && order.byproductRetainedByMill ? ['/products', activeShopId] : null, ([u]) => fetcher(u));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const bpTotal = bps.reduce((a, b) => a + (Number(b.kg) > 0 ? Number(b.kg) : 0), 0);
  const balanceLeft = Math.round((order.inputWeightKg - (Number(outputWeightKg) || 0) - bpTotal) * 1000) / 1000;

  const basisWeight = order.feeBasis === 'output' ? Number(outputWeightKg) || 0 : order.inputWeightKg;
  const projectedFee = Math.round(basisWeight * order.ratePerKg * 100) / 100;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const res = await api.patch(`/mill/job-work/${order.id}`, {
        action: 'complete',
        outputWeightKg: Number(outputWeightKg),
        paymentMode,
        amountPaid: amountPaid === '' ? 0 : Number(amountPaid),
        byProducts: bps.filter(b => b.name.trim() || b.kg).map(b => ({ name: b.name.trim(), quantityKg: Number(b.kg), productId: b.productId || undefined })),
      });
      onCompleted(res.data?.paymentApplied === false);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || t('failedToComplete'));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-black">{t('completeTitle')}</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{order.orderNumber} — {order.customer?.name}</p>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('outputWeight')} *</span>
            <input type="number" min="0" step="0.01" autoFocus value={outputWeightKg} onChange={e => setOutputWeightKg(e.target.value)}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" required />
          </label>
          <div className="space-y-2" data-testid="jw-byproducts">
            <p className="text-xs font-bold uppercase text-slate-500">{t('byProductsTitle')}</p>
            <p className="text-[11px] text-slate-500">{order.byproductRetainedByMill ? t('byProductsKept') : t('byProductsReturned')}</p>
            {bps.map((b, i) => (
              <div key={i} className="grid grid-cols-[1fr_5.5rem_auto] gap-2 items-center">
                <input value={b.name} onChange={e => setBps(x => x.map((r, j) => j === i ? { ...r, name: e.target.value } : r))} placeholder={t('byProductNamePlaceholder')}
                  className="h-9 px-2 border border-slate-300 dark:border-slate-700 rounded-md bg-slate-50 dark:bg-slate-950 text-sm min-w-0" />
                <input type="number" min="0" step="0.01" value={b.kg} onChange={e => setBps(x => x.map((r, j) => j === i ? { ...r, kg: e.target.value } : r))} placeholder="Kg"
                  className="h-9 px-2 border border-slate-300 dark:border-slate-700 rounded-md bg-slate-50 dark:bg-slate-950 text-sm" />
                <button type="button" onClick={() => setBps(x => x.filter((_, j) => j !== i))} aria-label="Remove" className="h-9 w-9 flex items-center justify-center text-red-500"><X size={14} /></button>
                {order.byproductRetainedByMill && (
                  <select value={b.productId} onChange={e => setBps(x => x.map((r, j) => j === i ? { ...r, productId: e.target.value } : r))}
                    className="col-span-3 h-9 px-2 border border-slate-300 dark:border-slate-700 rounded-md bg-slate-50 dark:bg-slate-950 text-xs">
                    <option value="">{t('byProductNoProduct')}</option>
                    {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                )}
              </div>
            ))}
            <button type="button" onClick={() => setBps(x => [...x, { name: '', kg: '', productId: '' }])}
              className="text-xs font-bold px-3 py-1.5 rounded-lg border border-dashed border-emerald-400 text-emerald-700 dark:text-emerald-400 flex items-center gap-1"><Plus size={12} /> {t('addByProduct')}</button>
            <p className={cn('text-[11px] font-semibold', balanceLeft < -0.005 ? 'text-red-500' : 'text-slate-500')}>
              {balanceLeft < -0.005 ? t('jwOver', { qty: Math.abs(balanceLeft) }) : t('jwLeft', { qty: balanceLeft })}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3 flex items-center justify-between">
            <span className="text-xs text-slate-500">{t('feeAmount')}</span>
            <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">{rupee(projectedFee)}</span>
          </div>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('amountCollectedNow')}</span>
            <input type="number" min="0" max={projectedFee} step="0.01" value={amountPaid} onChange={e => setAmountPaid(e.target.value)}
              placeholder="0"
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('paymentMode')}</span>
            <div className="grid grid-cols-3 gap-2">
              {(['Cash', 'UPI', 'Card'] as const).map(m => (
                <button key={m} type="button" onClick={() => setPaymentMode(m)}
                  className={cn('h-9 rounded-lg text-sm font-bold border-2 transition-colors',
                    paymentMode === m ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'border-slate-200 dark:border-slate-700 text-slate-500')}>
                  {m}
                </button>
              ))}
            </div>
          </label>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={saving || !outputWeightKg || balanceLeft < -0.005}
            className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {t('confirmComplete')}
          </button>
        </form>
      </div>
    </div>
  );
}

function OrderDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations('JobWork');
  const { data: o } = useSWR<any>(['/mill/job-work/' + id], ([u]) => fetcher(u));
  const Row = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <div className="flex items-start justify-between gap-3 text-xs py-1"><span className="text-slate-500 shrink-0">{k}</span><span className="font-semibold text-slate-800 dark:text-slate-200 text-right break-words min-w-0">{children}</span></div>
  );
  const box = 'rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4';
  const head = 'text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1';
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-50 dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto" data-testid="jw-detail">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-slate-50 dark:bg-slate-900">
          <h2 className="text-lg font-black">{o?.orderNumber || '…'}</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        {!o ? <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={22} /></div> : (
          <div className="p-5 space-y-3">
            <div className={box}>
              <p className={head}>{t('detailCustomer')}</p>
              <Row k={t('customer')}>{o.customer?.name || '—'}{o.customer?.mobile ? ` · ${o.customer.mobile}` : ''}</Row>
              <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">{t('customerOwned')}</p>
            </div>
            <div className={box}>
              <p className={head}>{t('detailInput')}</p>
              <Row k={t('material')}>{o.materialDescription}</Row>
              <Row k={t('inputWeight')}>{o.inputWeightKg} Kg</Row>
              <Row k={t('gateEntryOptional')}>{o.gateEntry?.entryNumber || '—'}</Row>
              <Row k={t('detailDate')}>{new Date(o.receivedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Row>
            </div>
            <div className={box}>
              <p className={head}>{t('detailProcessing')}</p>
              <Row k={t('detailStatus')}>{t(o.status)}</Row>
              <Row k={t('outputMaterialOptional')}>{o.outputDescription || '—'}</Row>
              <Row k={t('outputWeight')}>{o.outputWeightKg != null ? `${o.outputWeightKg} Kg` : '—'}</Row>
              <Row k={t('byProductsTitle')}>{o.byproductRetainedByMill ? t('byProductsKeptShort') : t('byProductsReturnedShort')}</Row>
              {o.byProductsKept?.length > 0 && <Row k={t('byProductsKeptList')}>{o.byProductsKept.map((b: any) => `${b.name} ${b.quantityKg} Kg`).join(', ')}</Row>}
            </div>
            <MaterialFlowCard flow={o.materialFlow} />
            <div className={box}>
              <p className={head}>{t('detailCharges')}</p>
              <Row k={t('feeBasis')}>{o.feeBasis === 'output' ? t('feeBasisOutput') : t('feeBasisInput')}</Row>
              <Row k={t('rate')}>₹{o.ratePerKg}/Kg</Row>
              <Row k={o.status === 'completed' ? t('feeAmount') : t('feePreview')}>
                {o.feeCalculated != null
                  ? `${o.feeBasis === 'output' ? (o.outputWeightKg ?? 0) : o.inputWeightKg} Kg × ₹${o.ratePerKg} = ${rupee(o.feeCalculated)}`
                  : t('feeAfterOutput')}
              </Row>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
