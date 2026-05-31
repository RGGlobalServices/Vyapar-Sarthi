'use client';
import { useState, useMemo, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import {
  Search, UserPlus, Phone, Calendar, ArrowRight,
  X, Check, Pencil, Trash2, Plus, Minus,
  ArrowDownLeft, ArrowUpRight, ChevronLeft, Trash,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUdharStore, UdharCustomer, UdharTransaction } from '@/lib/store';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import dynamic from 'next/dynamic';

const TopProductsPieChart = dynamic(() => import('@/components/TopProductsPieChart'), { ssr: false });

function totalDue(c: UdharCustomer) {
  return (c.transactions || []).reduce((sum, t) => t.type === 'udhar' ? sum + t.amount : sum - t.amount, 0);
}

function relativeDate(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)     return 'Just now';
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return 'Yesterday';
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const inp = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';

export default function UdharPage() {
  const t = useTranslations('Udhar');
  const { profile } = useBusinessStore();
  const {
    customers, loading,
    fetchCustomers,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    addTransaction,
    deleteTransaction,
  } = useUdharStore();

  const [search, setSearch]       = useState('');
  const [selected, setSelected]   = useState<UdharCustomer | null>(null);
  const [modal, setModal]         = useState<'newCustomer' | 'udhar' | 'payment' | 'editCustomer' | null>(null);
  const [deleteId, setDeleteId]   = useState<number | string | null>(null);
  const [txDeleteId, setTxDeleteId] = useState<number | string | null>(null);
  const [insightData, setInsightData] = useState<{items: any[], total: number, currency: boolean} | null>(null);

  useEffect(() => {
    fetchCustomers();
    api.get('/reports/top-products?group_by=udhar&limit=10')
      .then(res => setInsightData(res.data))
      .catch(() => {});
  }, [fetchCustomers]);
  const [custForm, setCustForm]   = useState({ name: '', mobile: '' });
  const [txForm, setTxForm]       = useState({ amount: '', note: '' });
  const [txError, setTxError]     = useState('');
  const [custError, setCustError] = useState('');

  const filtered = useMemo(() =>
    customers.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.mobile.includes(search)),
  [customers, search]);

  const totalOutstanding = useMemo(() => customers.reduce((s, c) => s + totalDue(c), 0), [customers]);

  function openNew()  { setCustForm({ name: '', mobile: '' }); setCustError(''); setModal('newCustomer'); }
  function openEdit(c: UdharCustomer) { setCustForm({ name: c.name, mobile: c.mobile }); setCustError(''); setModal('editCustomer'); }
  function openUdhar()   { setTxForm({ amount: '', note: '' }); setTxError(''); setModal('udhar'); }
  function openPayment() { setTxForm({ amount: '', note: '' }); setTxError(''); setModal('payment'); }

  function handleAddCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!custForm.name.trim()) { setCustError(t('nameRequired')); return; }
    addCustomer(custForm.name.trim(), custForm.mobile.trim());
    setModal(null);
  }

  function handleEditCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!custForm.name.trim()) { setCustError(t('nameRequired')); return; }
    updateCustomer(selected!.id, custForm.name.trim(), custForm.mobile.trim());
    setModal(null);
  }

  function handleDeleteCustomer() {
    deleteCustomer(deleteId!);
    setDeleteId(null);
    setSelected(null);
  }

  function handleAddUdhar(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(txForm.amount);
    if (!amt || amt <= 0) { setTxError(t('validAmount')); return; }
    addTransaction(selected!.id, { type: 'udhar', amount: amt, note: txForm.note, date: new Date().toISOString() });
    setModal(null);
  }

  function handlePayment(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(txForm.amount);
    if (!amt || amt <= 0) { setTxError(t('validAmount')); return; }
    const customer = customers.find(c => c.id === selected!.id)!;
    const due = totalDue(customer);
    if (amt > due) { setTxError(`${t('exceedsDue')} ₹${due}.`); return; }
    addTransaction(selected!.id, { type: 'payment', amount: amt, note: txForm.note, date: new Date().toISOString() });
    setModal(null);
  }

  function handleDeleteTx(txId: number | string) {
    deleteTransaction(selected!.id, txId);
    setTxDeleteId(null);
  }

  // Detail view
  if (selected) {
    const customer = customers.find(c => c.id === selected.id) ?? selected;
    const due = totalDue(customer);
    const sorted = [...(customer.transactions || [])].reverse();

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelected(null)}
              className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors">
              <ChevronLeft size={20} />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-100">{customer.name}</h1>
              <p className="text-sm text-slate-400 flex items-center gap-1 mt-0.5">
                <Phone size={13} />{customer.mobile || t('noMobile')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => openEdit(customer)} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-emerald-400 transition-colors"><Pencil size={17} /></button>
            <button onClick={() => setDeleteId(customer.id)} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-red-400 transition-colors"><Trash2 size={17} /></button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-6">
              <p className="text-xs text-slate-400 uppercase font-bold">{t('totalDue')}</p>
              <p className={cn('text-4xl font-black mt-1', due > 0 ? 'text-orange-500' : 'text-emerald-400')}>
                ₹{due.toLocaleString('en-IN')}
              </p>
              {due === 0 && <p className="text-xs text-emerald-400 mt-1">{t('allCleared')}</p>}
            </CardContent>
          </Card>
          <div className="md:col-span-2 flex flex-col sm:flex-row gap-3">
            <button onClick={openUdhar}
              className="flex-1 bg-orange-500/10 border border-orange-500/30 text-orange-400 rounded-xl py-4 font-bold flex items-center justify-center gap-2 hover:bg-orange-500/20 transition-colors text-sm">
              <Plus size={18} />{t('addUdhar')}
            </button>
            <button onClick={openPayment} disabled={due <= 0}
              className="flex-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl py-4 font-bold flex items-center justify-center gap-2 hover:bg-emerald-500/20 transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed">
              <Minus size={18} />{t('recordPayment')}
            </button>
          </div>
        </div>

        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-0">
            <div className="px-6 py-4 border-b border-slate-800">
              <p className="text-sm font-bold text-slate-300">{t('transactionHistory')}</p>
            </div>
            {sorted.length === 0 ? (
              <p className="px-6 py-10 text-center text-slate-500 text-sm">{t('noTransactions')}</p>
            ) : (
              <div className="divide-y divide-slate-800">
                {sorted.map(tx => (
                  <div key={tx.id} className="flex items-center justify-between px-6 py-4 hover:bg-slate-800/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={cn('w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0',
                        tx.type === 'udhar' ? 'bg-orange-500/15 text-orange-400' : 'bg-emerald-500/15 text-emerald-400')}>
                        {tx.type === 'udhar' ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-200">
                          {tx.type === 'udhar' ? t('udharGiven') : t('paymentReceived')}
                          {tx.billNumber && <span className="ml-2 text-xs text-slate-500">#{tx.billNumber}</span>}
                        </p>
                        {tx.note && <p className="text-xs text-slate-500">{tx.note}</p>}
                        <p className="text-xs text-slate-600 mt-0.5">{relativeDate(tx.date)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className={cn('font-bold text-base', tx.type === 'udhar' ? 'text-orange-400' : 'text-emerald-400')}>
                        {tx.type === 'udhar' ? '+' : '-'}₹{tx.amount.toLocaleString('en-IN')}
                      </p>
                      {txDeleteId === tx.id ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleDeleteTx(tx.id)} className="text-red-400 hover:text-red-300 p-1"><Check size={14} /></button>
                          <button onClick={() => setTxDeleteId(null)} className="text-slate-400 p-1"><X size={14} /></button>
                        </div>
                      ) : (
                        <button onClick={() => setTxDeleteId(tx.id)} className="text-slate-600 hover:text-red-400 p-1 transition-colors"><Trash size={14} /></button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit Customer Modal */}
        {modal === 'editCustomer' && (
          <UModal title={t('editCustomer')} onClose={() => setModal(null)}>
            <form onSubmit={handleEditCustomer} className="space-y-4">
              <UField label={t('nameLabel')}><input required className={inp} value={custForm.name} onChange={e => setCustForm(f => ({ ...f, name: e.target.value }))} /></UField>
              <UField label={t('mobileLabel')}><input className={inp} type="tel" value={custForm.mobile} onChange={e => setCustForm(f => ({ ...f, mobile: e.target.value }))} /></UField>
              {custError && <p className="text-red-400 text-sm">{custError}</p>}
              <UActions onCancel={() => setModal(null)} submitLabel={t('save')} submitCls="bg-emerald-500 text-slate-900 hover:bg-emerald-400" />
            </form>
          </UModal>
        )}

        {/* Add Udhar Modal */}
        {modal === 'udhar' && (
          <UModal title={t('addUdhar')} icon={<Plus size={17} className="text-orange-400" />} onClose={() => setModal(null)}>
            <form onSubmit={handleAddUdhar} className="space-y-4">
              <UField label={t('amountLabel')}><input type="number" min="1" required className={inp} placeholder="0" value={txForm.amount} onChange={e => { setTxForm(f => ({ ...f, amount: e.target.value })); setTxError(''); }} /></UField>
              <UField label={t('noteLabel')}><input className={inp} placeholder={t('noteHint')} value={txForm.note} onChange={e => setTxForm(f => ({ ...f, note: e.target.value }))} /></UField>
              {txError && <p className="text-red-400 text-sm">{txError}</p>}
              <UActions onCancel={() => setModal(null)} submitLabel={t('addUdhar')} submitCls="bg-orange-500 text-slate-900 hover:bg-orange-400" />
            </form>
          </UModal>
        )}

        {/* Payment Modal */}
        {modal === 'payment' && (
          <UModal title={t('recordPayment')} icon={<Minus size={17} className="text-emerald-400" />} onClose={() => setModal(null)}>
            <form onSubmit={handlePayment} className="space-y-4">
              <div className="bg-slate-800 rounded-lg px-4 py-2 text-sm text-slate-400">
                {t('totalDueLabel')}: <span className="text-orange-400 font-bold">₹{totalDue(customer).toLocaleString('en-IN')}</span>
              </div>
              <UField label={t('amountPaid')}><input type="number" min="1" max={totalDue(customer)} required className={inp} placeholder="0" value={txForm.amount} onChange={e => { setTxForm(f => ({ ...f, amount: e.target.value })); setTxError(''); }} /></UField>
              <UField label={t('noteLabel')}><input className={inp} placeholder={t('paymentNoteHint')} value={txForm.note} onChange={e => setTxForm(f => ({ ...f, note: e.target.value }))} /></UField>
              {txError && <p className="text-red-400 text-sm">{txError}</p>}
              <UActions onCancel={() => setModal(null)} submitLabel={t('recordPayment')} submitCls="bg-emerald-500 text-slate-900 hover:bg-emerald-400" />
            </form>
          </UModal>
        )}

        {/* Delete Customer */}
        {deleteId === customer.id && (
          <ConfirmDel name={customer.name} t={t} onConfirm={handleDeleteCustomer} onCancel={() => setDeleteId(null)} />
        )}
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-orange-500">{t('title')}</h1>
          <p className="text-sm text-slate-400 mt-1">
            {t('totalOutstanding')}: <span className="text-orange-400 font-bold">₹{totalOutstanding.toLocaleString('en-IN')}</span>
            {' · '}{customers.length} {t('customers')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {(() => {
            return (
              <div className="text-right">
                <p className="text-xs font-bold text-slate-400">
                  {customers.length} / Unlimited customers
                </p>
              </div>
            );
          })()}
          <button onClick={openNew}
            className="bg-orange-500 text-slate-900 px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-orange-400 transition-colors">
            <UserPlus size={20} />{t('newCustomer')}
          </button>
        </div>
      </div>

      {/* Top Udhar Analysis */}
      {insightData && insightData.items.length > 0 && !selected && (
        <Card className="bg-slate-900 border-slate-800 shadow-xl overflow-hidden mb-6">
          <CardContent className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <div className="w-1.5 h-6 bg-orange-500 rounded-full"></div>
              <h2 className="text-lg font-bold text-slate-100 uppercase tracking-wide">Top Debtors Analysis</h2>
            </div>
            <TopProductsPieChart 
              items={insightData.items} 
              total={insightData.total} 
              currency={insightData.currency}
              valueLabel="Udhar Due" 
            />
          </CardContent>
        </Card>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
        <input type="text" placeholder={t('searchPlaceholder')}
          className="w-full bg-slate-900 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(customer => {
          const due = totalDue(customer);
          const lastTx = [...(customer.transactions || [])].pop();
          return (
            <Card key={customer.id} onClick={() => setSelected(customer)}
              className="bg-slate-900 border-slate-800 hover:border-orange-500/50 transition-all cursor-pointer group">
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-slate-100">{customer.name}</h3>
                    <div className="flex items-center gap-2 text-slate-400 text-sm mt-1">
                      <Phone size={14} />{customer.mobile || t('noMobile')}
                    </div>
                  </div>
                  <div className="bg-orange-500/10 text-orange-500 p-2 rounded-lg group-hover:bg-orange-500 group-hover:text-slate-900 transition-colors">
                    <ArrowRight size={20} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 border-t border-slate-800 pt-4">
                  <div>
                    <p className="text-xs text-slate-500 uppercase font-bold">{t('totalDue')}</p>
                    <p className={cn('text-2xl font-black', due > 0 ? 'text-orange-500' : 'text-emerald-400')}>
                      ₹{due.toLocaleString('en-IN')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500 uppercase font-bold">{t('lastActivity')}</p>
                    <div className="flex items-center justify-end gap-1 text-slate-300 mt-1">
                      <Calendar size={14} />
                      <span className="text-sm">{lastTx ? relativeDate(lastTx.date) : t('none')}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-3 py-16 text-center text-slate-500">{t('noCustomers')}</div>
        )}
      </div>

      {/* New Customer Modal */}
      {modal === 'newCustomer' && (
        <UModal title={t('newCustomer')} icon={<UserPlus size={17} className="text-orange-400" />} onClose={() => setModal(null)}>
          <form onSubmit={handleAddCustomer} className="space-y-4">
            <UField label={t('nameLabel')}><input required className={inp} placeholder={t('namePlaceholder')} value={custForm.name} onChange={e => setCustForm(f => ({ ...f, name: e.target.value }))} /></UField>
            <UField label={t('mobileLabel')}><input className={inp} type="tel" placeholder={t('mobilePlaceholder')} value={custForm.mobile} onChange={e => setCustForm(f => ({ ...f, mobile: e.target.value }))} /></UField>
            {custError && <p className="text-red-400 text-sm">{custError}</p>}
            <UActions onCancel={() => setModal(null)} submitLabel={t('addCustomer')} submitCls="bg-orange-500 text-slate-900 hover:bg-orange-400" />
          </form>
        </UModal>
      )}
    </div>
  );
}

function UModal({ title, icon, onClose, children }: { title: string; icon?: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">{icon}<h2 className="text-lg font-bold text-slate-100">{title}</h2></div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={20} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function UField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs text-slate-400 mb-1">{label}</label>{children}</div>;
}

function UActions({ onCancel, submitLabel, submitCls }: { onCancel: () => void; submitLabel: string; submitCls: string }) {
  return (
    <div className="flex gap-3 pt-1">
      <button type="button" onClick={onCancel} className="flex-1 bg-slate-800 text-slate-300 py-2.5 rounded-xl font-medium hover:bg-slate-700 transition-colors">Cancel</button>
      <button type="submit" className={cn('flex-1 py-2.5 rounded-xl font-bold transition-colors', submitCls)}>{submitLabel}</button>
    </div>
  );
}

function ConfirmDel({ name, t, onConfirm, onCancel }: { name: string; t: any; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-red-500/30 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center"><Trash2 size={18} className="text-red-400" /></div>
          <div>
            <p className="font-bold text-slate-100">{t('deleteCustomer')}</p>
            <p className="text-sm text-slate-400">{t('deleteWarning')}</p>
          </div>
        </div>
        <div className="bg-slate-800 rounded-lg px-4 py-3 text-sm text-slate-200 font-medium">{name}</div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 bg-slate-800 text-slate-300 py-2.5 rounded-xl font-medium hover:bg-slate-700 transition-colors">{t('cancel')}</button>
          <button onClick={onConfirm} className="flex-1 bg-red-500 text-white py-2.5 rounded-xl font-bold hover:bg-red-400 transition-colors">{t('delete')}</button>
        </div>
      </div>
    </div>
  );
}
