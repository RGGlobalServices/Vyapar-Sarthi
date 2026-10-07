'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import {
  Truck, Plus, X, Loader2, ChevronRight, ChevronDown,
  ReceiptText, Wallet, ArrowLeft, Download,
} from 'lucide-react';
import toast from 'react-hot-toast';
import DeleteButton from '@/components/mill/DeleteButton';
import EditEntryModal, { EditButton } from '@/components/mill/EditEntryModal';
import { ExportButton } from '@/lib/hooks/useExport';
import { useTranslations } from 'next-intl';
import { downloadTransportSlip } from '@/lib/pdf/slipGenerator';

type Transporter = { id: string; name: string; mobile?: string | null; balance: number; entryCount: number };
type FreightEntry = {
  id: string; transporterId: string; type: 'charge' | 'payment';
  amount: number; vehicleNumber?: string | null; paymentMethod?: string | null;
  note?: string | null; date: string;
  direction?: 'purchase' | 'sale' | null; billType?: 'purchase' | 'sale' | null; billLabel?: string | null;
};

const DIR_BADGE: Record<string, string> = {
  purchase: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  sale: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
};

const fetcher = (u: string) => api.get(u).then(r => r.data);
const rupee = (n: number) => `₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 0 })}`;
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export default function FreightPage() {
  const t = useTranslations('Freight');
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddTransporter, setShowAddTransporter] = useState(false);
  const [addMode, setAddMode] = useState<'charge' | 'payment' | null>(null);
  const [dirFilter, setDirFilter] = useState<'all' | 'purchase' | 'sale'>('all');
  const [editing, setEditing] = useState<FreightEntry | null>(null);
  const [downloadingSlipId, setDownloadingSlipId] = useState<string | null>(null);
  const profile = useBusinessStore(s => s.profile);

  const { data, mutate, isLoading } = useSWR<{ transporters: Transporter[]; entries: FreightEntry[] }>(
    activeShopId ? ['/logistics/freight', activeShopId] : null,
    ([u]) => fetcher(u),
  );

  const transporters = data?.transporters || [];
  const allEntries = data?.entries || [];

  const selected = selectedId ? transporters.find(tr => tr.id === selectedId) : null;
  const selectedEntries = useMemo(
    () => allEntries.filter(e => e.transporterId === selectedId && (dirFilter === 'all' || e.direction === dirFilter)).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    ),
    [allEntries, selectedId, dirFilter],
  );
  const chargeTotal = (d: 'purchase' | 'sale') => allEntries.filter(e => e.type === 'charge' && e.direction === d).reduce((a, e) => a + e.amount, 0);

  const totalOwed = transporters.reduce((s, tr) => s + (tr.balance > 0 ? tr.balance : 0), 0);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-sm border border-blue-200 dark:border-blue-800">
            <Truck size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{t('title')}</h1>
            <p className="text-sm text-slate-500 font-medium mt-1">{t('subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            title={t('exportTitle')}
            filename="freight-statement"
            orientation="landscape"
            columns={[
              { key: 'date', label: t('exportDate'), format: (v: string) => new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
              { key: 'transporterName', label: t('exportTransporter') },
              { key: 'type', label: t('exportType'), format: (v: string) => v === 'charge' ? t('exportCharge') : t('exportPayment') },
              { key: 'vehicleNumber', label: t('exportVehicle'), format: (v: any) => v || '—' },
              { key: 'amount', label: t('exportAmount'), format: (v: number) => v.toLocaleString('en-IN') },
              { key: 'paymentMethod', label: t('exportMode'), format: (v: any) => v || '—' },
              { key: 'note', label: t('exportNote'), format: (v: any) => v ? String(v).replace(/^\[[A-Z]{2,4}\s+[0-9a-f-]{36}\]\s*/i, '') : '' },
            ]}
            data={allEntries.map(e => ({
              ...e,
              transporterName: transporters.find(tr => tr.id === e.transporterId)?.name || e.transporterId,
            }))}
          />
          <button
            onClick={() => setShowAddTransporter(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm active:scale-95"
          >
            <Plus size={18} /> {t('addTransporter')}
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{t('transporters')}</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white">{transporters.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{t('totalOwed')}</p>
          <p className="text-2xl font-black text-rose-600 dark:text-rose-400">{rupee(totalOwed)}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{t('totalEntries')}</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white">{allEntries.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-bold text-sky-600 uppercase tracking-wider mb-1">{t('purchaseFreight')}</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white">{rupee(chargeTotal('purchase'))}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-bold text-violet-600 uppercase tracking-wider mb-1">{t('saleFreight')}</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white">{rupee(chargeTotal('sale'))}</p>
        </div>
      </div>

      <div className="flex gap-4 flex-col lg:flex-row">
        {/* Transporters list */}
        <div className="w-full lg:w-72 shrink-0">
          {transporters.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center shadow-sm">
              <Truck size={32} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
              <p className="text-sm font-bold text-slate-500 mb-1">{t('noTransporters')}</p>
              <p className="text-xs text-slate-400">{t('noTransportersHint')}</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t('transporters')}</p>
              </div>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {transporters.map(tr => (
                  <li key={tr.id}>
                    <button
                      onClick={() => setSelectedId(selectedId === tr.id ? null : tr.id)}
                      className={`w-full flex items-center justify-between px-4 py-3.5 text-left transition-colors ${
                        selectedId === tr.id
                          ? 'bg-blue-50 dark:bg-blue-900/20'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{tr.name}</p>
                        {tr.mobile && <p className="text-xs text-slate-400">{tr.mobile}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className={`text-sm font-black ${tr.balance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {tr.balance > 0 ? `−${rupee(tr.balance)}` : tr.balance < 0 ? `+${rupee(tr.balance)}` : '₹0'}
                        </span>
                        {selectedId === tr.id ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Transporter detail */}
        {selected && (
          <div className="flex-1 min-w-0">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
              {/* Detail header */}
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-lg font-black text-slate-900 dark:text-white">{selected.name}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {t('balance')}:{' '}
                    <span className={`font-bold ${selected.balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {selected.balance > 0
                        ? t('youOwe', { amount: rupee(selected.balance) })
                        : selected.balance < 0
                        ? t('overpaid', { amount: rupee(selected.balance) })
                        : t('settled')}
                    </span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAddMode('charge')}
                    className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-900/20 dark:hover:bg-rose-900/30 text-rose-600 dark:text-rose-400 px-4 py-2 rounded-xl text-sm font-bold transition-colors"
                  >
                    <ReceiptText size={14} /> {t('addCharge')}
                  </button>
                  <button
                    onClick={() => setAddMode('payment')}
                    className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 px-4 py-2 rounded-xl text-sm font-bold transition-colors"
                  >
                    <Wallet size={14} /> {t('recordPayment')}
                  </button>
                </div>
              </div>

              {/* Entry form */}
              {addMode && (
                <EntryForm
                  transporterId={selected.id}
                  mode={addMode}
                  onDone={() => { setAddMode(null); mutate(); }}
                  onCancel={() => setAddMode(null)}
                />
              )}

              <div className="px-5 py-2 flex gap-1.5 border-b border-slate-100 dark:border-slate-800">
                {(['all', 'purchase', 'sale'] as const).map(k => (
                  <button key={k} type="button" onClick={() => setDirFilter(k)}
                    className={'text-xs font-bold px-3 py-1 rounded-full border ' + (dirFilter === k ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900' : 'border-slate-200 dark:border-slate-700 text-slate-500')}>
                    {k === 'all' ? t('filterAll') : k === 'purchase' ? t('filterPurchase') : t('filterSale')}
                  </button>
                ))}
              </div>

              {/* Entries list */}
              {selectedEntries.length === 0 ? (
                <div className="p-10 text-center">
                  <p className="text-sm text-slate-400">{t('noEntries')}</p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {selectedEntries.map(e => (
                    <li key={e.id} className="px-5 py-3.5 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                            e.type === 'charge'
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                          }`}>
                            {e.type === 'charge' ? t('charge') : t('payment')}
                          </span>
                          {e.direction && (
                            <span className={'text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ' + DIR_BADGE[e.direction]}>
                              {e.direction === 'purchase' ? t('purchase') : t('sale')}{e.billLabel ? ' · ' + e.billLabel : ''}
                            </span>
                          )}
                          {e.vehicleNumber && (
                            <span className="text-xs text-slate-500 font-medium">{e.vehicleNumber}</span>
                          )}
                          {e.paymentMethod && e.type === 'payment' && (
                            <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full font-bold uppercase">{e.paymentMethod}</span>
                          )}
                        </div>
                        {e.note && <p className="text-xs text-slate-400 mt-1">{e.note}</p>}
                        <p className="text-xs text-slate-400 mt-0.5">{fmtDate(e.date)}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className={`text-sm font-black mr-1 ${e.type === 'charge' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {e.type === 'charge' ? '−' : '+'}{rupee(e.amount)}
                        </span>
                        <button
                          disabled={downloadingSlipId === e.id}
                          title={t('downloadSlip') || 'Download Slip'}
                          onClick={async () => {
                            setDownloadingSlipId(e.id);
                            try {
                              await downloadTransportSlip({
                                entry: {
                                  id: e.id,
                                  date: e.date,
                                  amount: e.amount,
                                  type: e.type,
                                  direction: e.direction,
                                  vehicleNumber: e.vehicleNumber,
                                  paymentMethod: e.paymentMethod,
                                  note: e.note,
                                  freightFor: e.billLabel,
                                },
                                transporter: { name: selected!.name },
                                shopInfo: {
                                  name: profile.shopName || 'Vyapar Sarthi',
                                  address: profile.address,
                                  mobile: profile.mobile,
                                  gst: profile.gst,
                                },
                              });
                            } catch (err) {
                              toast.error('Failed to generate slip');
                            } finally {
                              setDownloadingSlipId(null);
                            }
                          }}
                          className="p-1.5 rounded text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-40 transition-colors"
                        >
                          {downloadingSlipId === e.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                        </button>
                        <EditButton onClick={() => setEditing(e)} />
                        <DeleteButton url={`/logistics/freight/${e.id}`} name={`${e.type === 'charge' ? t('freightChargeDelete') : t('freightPaymentDelete')} ${rupee(e.amount)}`} onDone={() => mutate()} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {editing && (
        <EditEntryModal
          url={`/logistics/freight/${editing.id}`}
          title={editing.type === 'charge' ? t('editCharge') : t('editPayment')}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); mutate(); }}
          initial={{ amount: editing.amount, vehicleNumber: editing.vehicleNumber || '', note: editing.note || '', direction: editing.direction || '', paymentMethod: editing.paymentMethod || 'Cash' }}
          fields={[
            { key: 'amount', label: t('amountLabel'), type: 'number' },
            { key: 'direction', label: t('freightFor'), type: 'choice', options: [{ value: 'purchase', label: t('purchase') }, { value: 'sale', label: t('sale') }] },
            { key: 'vehicleNumber', label: t('vehicleNumber') },
            ...(editing.type === 'payment' ? [{ key: 'paymentMethod', label: t('paidBy'), type: 'select' as const, options: ['Cash', 'UPI', 'Card', 'Bank', 'Cheque', 'Seller'].map(v => ({ value: v, label: v })) }] : []),
            { key: 'note', label: t('noteLabel') },
          ]}
        />
      )}

      {/* Add Transporter modal */}
      {showAddTransporter && (
        <AddTransporterModal
          onClose={() => setShowAddTransporter(false)}
          onSaved={() => { setShowAddTransporter(false); mutate(); }}
        />
      )}
    </div>
  );
}

function EntryForm({
  transporterId, mode, onDone, onCancel,
}: {
  transporterId: string; mode: 'charge' | 'payment'; onDone: () => void; onCancel: () => void;
}) {
  const t = useTranslations('Freight');
  const [amount, setAmount] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [note, setNote] = useState('');
  const [direction, setDirection] = useState<'purchase' | 'sale'>('purchase');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;
    setSaving(true);
    try {
      await api.post('/logistics/freight', {
        transporterId,
        type: mode,
        amount: parseFloat(amount),
        vehicleNumber: vehicleNumber.trim() || undefined,
        paymentMethod: mode === 'payment' ? paymentMethod : undefined,
        note: note.trim() || undefined,
        direction,
      });
      toast.success(mode === 'charge' ? t('chargeAdded') : t('paymentRecorded'));
      onDone();
    } catch {
      toast.error(t('failedToSave'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="px-5 py-4 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-700">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
        {mode === 'charge' ? t('newFreightCharge') : t('recordPaymentTo')}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{t('amountLabel')} *</label>
          <input
            required autoFocus type="number" min="1" step="0.01"
            value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="0"
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
        {mode === 'charge' && (
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{t('vehicleNo')}</label>
            <input
              value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value)}
              placeholder="MH-12-AB-1234"
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        )}
        {mode === 'payment' && (
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{t('paymentMode')}</label>
            <select
              value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-blue-500"
            >
              {['Cash', 'UPI', 'Bank', 'Cheque'].map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
        )}
        <div className="col-span-2">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{t('freightFor')}</label>
          <div className="flex gap-2">
            {(['purchase', 'sale'] as const).map(k => (
              <button key={k} type="button" onClick={() => setDirection(k)}
                className={'flex-1 px-3 py-2 rounded-lg text-sm font-bold border ' + (direction === k ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900' : 'border-slate-200 dark:border-slate-700 text-slate-500')}>
                {k === 'purchase' ? t('purchaseInward') : t('saleOutward')}
              </button>
            ))}
          </div>
        </div>
        <div className="col-span-2">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{t('noteLabel')}</label>
          <input
            value={note} onChange={e => setNote(e.target.value)}
            placeholder={t('noteOptional')}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
          {t('cancel')}
        </button>
        <button
          type="submit" disabled={saving}
          className={`px-5 py-2 rounded-lg text-sm font-bold text-white transition-colors flex items-center gap-2 disabled:opacity-60 ${
            mode === 'charge' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
          }`}
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {mode === 'charge' ? t('addCharge') : t('recordPayment')}
        </button>
      </div>
    </form>
  );
}

function AddTransporterModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const t = useTranslations('Freight');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.post('/crm/customers', { name: name.trim(), mobile: mobile.trim() || undefined, customerType: 'transporter' });
      toast.success(t('transporterAdded'));
      onSaved();
    } catch {
      toast.error(t('failedToAddTransporter'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm mx-4 animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Truck size={18} className="text-blue-600" />
            <h3 className="text-base font-black text-slate-900 dark:text-white">{t('addTransporter')}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('transporterName')} *</label>
            <input
              required autoFocus
              value={name} onChange={e => setName(e.target.value)}
              placeholder={t('transporterNamePlaceholder')}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('mobileOptional')}</label>
            <input
              type="tel"
              value={mobile} onChange={e => setMobile(e.target.value)}
              placeholder={t('mobilePlaceholder')}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
              {t('cancel')}
            </button>
            <button
              type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              + {t('addTransporter')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
