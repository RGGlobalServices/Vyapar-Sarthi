'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import {
  Truck, Plus, X, Loader2, ChevronRight, ChevronDown,
  ReceiptText, Wallet, ArrowLeft,
} from 'lucide-react';
import toast from 'react-hot-toast';
import DeleteButton from '@/components/mill/DeleteButton';
import EditEntryModal, { EditButton } from '@/components/mill/EditEntryModal';
import { ExportButton } from '@/lib/hooks/useExport';

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
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddTransporter, setShowAddTransporter] = useState(false);
  const [addMode, setAddMode] = useState<'charge' | 'payment' | null>(null);
  const [dirFilter, setDirFilter] = useState<'all' | 'purchase' | 'sale'>('all');
  const [editing, setEditing] = useState<FreightEntry | null>(null);

  const { data, mutate, isLoading } = useSWR<{ transporters: Transporter[]; entries: FreightEntry[] }>(
    activeShopId ? ['/logistics/freight', activeShopId] : null,
    ([u]) => fetcher(u),
  );

  const transporters = data?.transporters || [];
  const allEntries = data?.entries || [];

  const selected = selectedId ? transporters.find(t => t.id === selectedId) : null;
  const selectedEntries = useMemo(
    () => allEntries.filter(e => e.transporterId === selectedId && (dirFilter === 'all' || e.direction === dirFilter)).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    ),
    [allEntries, selectedId, dirFilter],
  );
  const chargeTotal = (d: 'purchase' | 'sale') => allEntries.filter(e => e.type === 'charge' && e.direction === d).reduce((a, e) => a + e.amount, 0);

  const totalOwed = transporters.reduce((s, t) => s + (t.balance > 0 ? t.balance : 0), 0);

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
            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Freight</h1>
            <p className="text-sm text-slate-500 font-medium mt-1">Transporter charges & payments</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            title="Freight Statement"
            filename="freight-statement"
            orientation="landscape"
            columns={[
              { key: 'date', label: 'Date', format: (v: string) => new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
              { key: 'transporterName', label: 'Transporter' },
              { key: 'type', label: 'Type', format: (v: string) => v === 'charge' ? 'Charge' : 'Payment' },
              { key: 'vehicleNumber', label: 'Vehicle #', format: (v: any) => v || '—' },
              { key: 'amount', label: 'Amount (₹)', format: (v: number) => v.toLocaleString('en-IN') },
              { key: 'paymentMethod', label: 'Mode', format: (v: any) => v || '—' },
              { key: 'note', label: 'Note', format: (v: any) => v || '' },
            ]}
            data={allEntries.map(e => ({
              ...e,
              transporterName: transporters.find(t => t.id === e.transporterId)?.name || e.transporterId,
            }))}
          />
          <button
            onClick={() => setShowAddTransporter(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm active:scale-95"
          >
            <Plus size={18} /> Add Transporter
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Transporters</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white">{transporters.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Owed</p>
          <p className="text-2xl font-black text-rose-600 dark:text-rose-400">{rupee(totalOwed)}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Entries</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white">{allEntries.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-bold text-sky-600 uppercase tracking-wider mb-1">Purchase freight</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white">{rupee(chargeTotal('purchase'))}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-bold text-violet-600 uppercase tracking-wider mb-1">Sale freight</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white">{rupee(chargeTotal('sale'))}</p>
        </div>
      </div>

      <div className="flex gap-4 flex-col lg:flex-row">
        {/* Transporters list */}
        <div className="w-full lg:w-72 shrink-0">
          {transporters.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center shadow-sm">
              <Truck size={32} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
              <p className="text-sm font-bold text-slate-500 mb-1">No transporters yet</p>
              <p className="text-xs text-slate-400">Add a transporter to start tracking freight charges.</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Transporters</p>
              </div>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {transporters.map(t => (
                  <li key={t.id}>
                    <button
                      onClick={() => setSelectedId(selectedId === t.id ? null : t.id)}
                      className={`w-full flex items-center justify-between px-4 py-3.5 text-left transition-colors ${
                        selectedId === t.id
                          ? 'bg-blue-50 dark:bg-blue-900/20'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{t.name}</p>
                        {t.mobile && <p className="text-xs text-slate-400">{t.mobile}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className={`text-sm font-black ${t.balance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {t.balance > 0 ? `−${rupee(t.balance)}` : t.balance < 0 ? `+${rupee(t.balance)}` : '₹0'}
                        </span>
                        {selectedId === t.id ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
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
                    Balance:{' '}
                    <span className={`font-bold ${selected.balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {selected.balance > 0 ? `You owe ${rupee(selected.balance)}` : selected.balance < 0 ? `Overpaid ${rupee(selected.balance)}` : 'Settled'}
                    </span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAddMode('charge')}
                    className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-900/20 dark:hover:bg-rose-900/30 text-rose-600 dark:text-rose-400 px-4 py-2 rounded-xl text-sm font-bold transition-colors"
                  >
                    <ReceiptText size={14} /> Add Charge
                  </button>
                  <button
                    onClick={() => setAddMode('payment')}
                    className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 px-4 py-2 rounded-xl text-sm font-bold transition-colors"
                  >
                    <Wallet size={14} /> Record Payment
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
                    {k === 'all' ? 'All' : k === 'purchase' ? 'Purchase' : 'Sale'}
                  </button>
                ))}
              </div>

              {/* Entries list */}
              {selectedEntries.length === 0 ? (
                <div className="p-10 text-center">
                  <p className="text-sm text-slate-400">No entries yet for this transporter.</p>
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
                            {e.type === 'charge' ? 'Charge' : 'Payment'}
                          </span>
                          {e.direction && (
                            <span className={'text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ' + DIR_BADGE[e.direction]}>{e.direction === 'purchase' ? 'Purchase' : 'Sale'}{e.billLabel ? ' · ' + e.billLabel : ''}</span>
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
                        <EditButton onClick={() => setEditing(e)} />
                        <DeleteButton url={`/logistics/freight/${e.id}`} name={`${e.type === 'charge' ? 'freight charge' : 'freight payment'} ${rupee(e.amount)}`} onDone={() => mutate()} />
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
        <EditEntryModal url={`/logistics/freight/${editing.id}`} title={editing.type === 'charge' ? 'Edit freight charge' : 'Edit freight payment'} onClose={() => setEditing(null)} onDone={() => { setEditing(null); mutate(); }}
          initial={{ amount: editing.amount, vehicleNumber: editing.vehicleNumber || '', note: editing.note || '', direction: editing.direction || '', paymentMethod: editing.paymentMethod || 'Cash' }}
          fields={[
            { key: 'amount', label: 'Amount (₹)', type: 'number' },
            { key: 'direction', label: 'Freight for', type: 'choice', options: [{ value: 'purchase', label: 'Purchase' }, { value: 'sale', label: 'Sale' }] },
            { key: 'vehicleNumber', label: 'Vehicle number' },
            ...(editing.type === 'payment' ? [{ key: 'paymentMethod', label: 'Paid by', type: 'select' as const, options: ['Cash', 'UPI', 'Card', 'Bank', 'Cheque', 'Seller'].map(v => ({ value: v, label: v })) }] : []),
            { key: 'note', label: 'Note' },
          ]} />
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
      toast.success(mode === 'charge' ? 'Charge added' : 'Payment recorded');
      onDone();
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="px-5 py-4 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-700">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
        {mode === 'charge' ? 'New Freight Charge' : 'Record Payment to Transporter'}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Amount (₹) *</label>
          <input
            required autoFocus type="number" min="1" step="0.01"
            value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="0"
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
        {mode === 'charge' && (
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Vehicle No.</label>
            <input
              value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value)}
              placeholder="MH-12-AB-1234"
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        )}
        {mode === 'payment' && (
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Payment Mode</label>
            <select
              value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-blue-500"
            >
              {['Cash', 'UPI', 'Bank', 'Cheque'].map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
        )}
        <div className="col-span-2">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Freight for</label>
          <div className="flex gap-2">
            {(['purchase', 'sale'] as const).map(k => (
              <button key={k} type="button" onClick={() => setDirection(k)}
                className={'flex-1 px-3 py-2 rounded-lg text-sm font-bold border ' + (direction === k ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900' : 'border-slate-200 dark:border-slate-700 text-slate-500')}>
                {k === 'purchase' ? 'Purchase (inward)' : 'Sale (outward)'}
              </button>
            ))}
          </div>
        </div>
        <div className="col-span-2">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Note</label>
          <input
            value={note} onChange={e => setNote(e.target.value)}
            placeholder="Optional note"
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
          Cancel
        </button>
        <button
          type="submit" disabled={saving}
          className={`px-5 py-2 rounded-lg text-sm font-bold text-white transition-colors flex items-center gap-2 disabled:opacity-60 ${
            mode === 'charge' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
          }`}
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {mode === 'charge' ? 'Add Charge' : 'Record Payment'}
        </button>
      </div>
    </form>
  );
}

function AddTransporterModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.post('/crm/customers', { name: name.trim(), mobile: mobile.trim() || undefined, customerType: 'transporter' });
      toast.success('Transporter added');
      onSaved();
    } catch {
      toast.error('Failed to add transporter');
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
            <h3 className="text-base font-black text-slate-900 dark:text-white">Add Transporter</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Transporter Name *</label>
            <input
              required autoFocus
              value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Ramesh Transport"
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Mobile (optional)</label>
            <input
              type="tel"
              value={mobile} onChange={e => setMobile(e.target.value)}
              placeholder="10-digit mobile"
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
              Cancel
            </button>
            <button
              type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              + Add Transporter
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
