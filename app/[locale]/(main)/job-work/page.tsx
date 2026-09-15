'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Plus, X, Loader2, Wheat, PlayCircle, CheckCircle2 } from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

type JobWorkOrder = {
  id: string; orderNumber: string; materialDescription: string; inputWeightKg: number;
  outputDescription: string | null; outputWeightKg: number | null;
  ratePerKg: number; feeBasis: 'input' | 'output'; feeAmount: number | null;
  byproductRetainedByMill: boolean; status: 'received' | 'processing' | 'completed';
  notes: string | null; receivedAt: string;
  customer?: { id: string; name: string; mobile: string | null } | null;
  gateEntry?: { id: string; entryNumber: string } | null;
};
type Customer = { id: string; name: string; mobile?: string | null };
type GateEntry = { id: string; entryNumber: string; vehicleNumber: string };

const fetcher = (u: string) => api.get(u).then(r => r.data);
const rupee = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const statusTone = (s: string) => s === 'completed'
  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
  : s === 'processing'
    ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';

export default function JobWorkPage() {
  const t = useTranslations('JobWork');
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const [creating, setCreating] = useState(false);
  const [completingOrder, setCompletingOrder] = useState<JobWorkOrder | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);

  const { data: orders = [], mutate: refetch, isLoading } = useSWR<JobWorkOrder[]>(
    activeShopId ? ['/mill/job-work', activeShopId] : null,
    ([u]) => fetcher(u),
  );
  const { data: customers = [] } = useSWR<Customer[]>(
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

      <div className="grid grid-cols-3 gap-3">
        <StatCard label={t('received')} value={stats.received} tone="slate" />
        <StatCard label={t('processing')} value={stats.processing} tone="amber" />
        <StatCard label={t('completed')} value={stats.completed} tone="emerald" />
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
              <li key={o.id} className="p-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-slate-900 dark:text-white">{o.orderNumber}</span>
                    <span className={cn('text-[10px] font-bold uppercase px-2 py-0.5 rounded-full', statusTone(o.status))}>{t(o.status)}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {o.customer?.name ? `${o.customer.name} · ` : ''}
                    {t('inputLabel')} {o.materialDescription} × {o.inputWeightKg} Kg
                    {o.outputWeightKg != null ? ` · ${t('outputLabel')} ${o.outputDescription || ''} × ${o.outputWeightKg} Kg` : ''}
                    {o.feeAmount != null ? ` · ${rupee(o.feeAmount)}` : ` · ₹${o.ratePerKg}/Kg`}
                  </p>
                </div>
                <div className="shrink-0">
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
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {creating && (
        <CreateOrderModal
          customers={customers}
          gateEntries={gateEntries}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); refetch(); }}
        />
      )}
      {completingOrder && (
        <CompleteOrderModal
          order={completingOrder}
          onClose={() => setCompletingOrder(null)}
          onCompleted={(paymentFailed) => {
            setCompletingOrder(null);
            refetch();
            if (paymentFailed) alert(t('paymentNotRecordedWarning'));
          }}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: 'slate' | 'amber' | 'emerald' }) {
  const map = { slate: 'text-slate-400', amber: 'text-amber-500', emerald: 'text-emerald-500' };
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <p className={cn('text-2xl font-black', map[tone])}>{value}</p>
      <p className="text-[11px] text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

function CreateOrderModal({ customers, gateEntries, onClose, onCreated }: {
  customers: Customer[]; gateEntries: GateEntry[]; onClose: () => void; onCreated: () => void;
}) {
  const t = useTranslations('JobWork');
  const [form, setForm] = useState({
    customerId: '', materialDescription: '', inputWeightKg: '', outputDescription: '',
    ratePerKg: '', feeBasis: 'input' as 'input' | 'output', byproductRetainedByMill: true,
    gateEntryId: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900">
          <h2 className="text-lg font-black">{t('newOrder')}</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">{t('customer')} *</span>
            <select value={form.customerId} onChange={e => setForm(f => ({ ...f, customerId: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" required>
              <option value="">{t('selectCustomer')}</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
      });
      onCompleted(res.data?.paymentApplied === false);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || t('failedToComplete'));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
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
          <button type="submit" disabled={saving || !outputWeightKg}
            className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {t('confirmComplete')}
          </button>
        </form>
      </div>
    </div>
  );
}
