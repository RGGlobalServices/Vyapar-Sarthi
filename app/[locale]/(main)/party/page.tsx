'use client';

import { useState, useEffect } from 'react';
import { Search, Loader2, Phone, X, Plus, Wallet, MapPin, ReceiptText, Building2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import PaymentCollectionModal from '@/components/crm/PaymentCollectionModal';
import LedgerView from '@/components/crm/LedgerView';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';

type Party = {
  id: string;
  name: string;
  shopName: string;
  mobile: string;
  email: string;
  gst: string;
  totalDue: number;
  creditDays: number;
  creditLimit: number;
  address: string;
};

export default function PartyPage() {
  const t = useTranslations('Party');
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [showNewParty, setShowNewParty] = useState(false);

  const [form, setForm] = useState({ name: '', shopName: '', mobile: '', gst: '', address: '', creditLimit: '0', creditDays: '0', openingBalance: '0' });

  useEffect(() => {
    fetchParties();
  }, [activeShopId]);

  const fetchParties = async () => {
    try {
      const res = await api.get('/crm/customers?type=party');
      setParties(res.data);
    } catch (e) {
      console.error('Failed to load parties', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateParty = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/crm/customers', { ...form, customerType: 'party' });
      fetchParties();
      setShowNewParty(false);
      setForm({ name: '', shopName: '', mobile: '', gst: '', address: '', creditLimit: '0', creditDays: '0', openingBalance: '0' });
    } catch (e) {
      console.error(e);
    }
  };

  const filtered = parties.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.shopName && p.shopName.toLowerCase().includes(search.toLowerCase())) ||
    (p.mobile && p.mobile.includes(search))
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{t('title')}</h1>
          <p className="text-slate-500 text-sm font-medium">{t('subtitle')}</p>
        </div>
        <button
          onClick={() => setShowNewParty(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors"
        >
          <Plus size={18} /> {t('addParty')}
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-4">
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(p => (
              <div
                key={p.id}
                onClick={() => setSelectedParty(p)}
                className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-500 cursor-pointer transition-colors bg-slate-50 dark:bg-slate-800/50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 font-bold">
                    <Building2 size={18} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-900 dark:text-white text-sm truncate">{p.shopName || p.name}</h3>
                    <p className="text-xs text-slate-500 truncate flex items-center gap-1">
                      {p.name} • <Phone size={10} /> {p.mobile || t('noNumber')}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  {p.totalDue > 0 ? (
                    <span className="text-sm font-bold text-orange-600">₹{p.totalDue.toLocaleString()}</span>
                  ) : (
                    <span className="text-sm font-bold text-emerald-600">{t('settled')}</span>
                  )}
                </div>
              </div>
            ))}

            {filtered.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-500">
                {t('noPartiesFound', { search })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Party Panel */}
      {selectedParty && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-slate-50 dark:bg-slate-900 w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-xl flex flex-col h-[90vh] sm:h-auto sm:max-h-[90vh] animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95">

            <div className="p-6 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sm:rounded-t-2xl flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                  {selectedParty.shopName || selectedParty.name}
                </h2>
                <div className="flex flex-wrap gap-4 mt-2 text-sm text-slate-500">
                  <span className="font-bold text-slate-700 dark:text-slate-300">{selectedParty.name}</span>
                  <span className="flex items-center gap-1"><Phone size={14}/> {selectedParty.mobile || t('notApplicable')}</span>
                  {selectedParty.gst && <span className="flex items-center gap-1 font-mono">GST: {selectedParty.gst}</span>}
                  {selectedParty.address && <span className="flex items-center gap-1"><MapPin size={14}/> {selectedParty.address}</span>}
                </div>
              </div>
              <button
                onClick={() => setSelectedParty(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 grid grid-cols-2 gap-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <div className="p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-900/50 rounded-xl">
                <p className="text-xs font-bold text-orange-800 dark:text-orange-400 uppercase tracking-wider mb-1">{t('totalOutstanding')}</p>
                <p className="text-2xl font-black text-orange-600 dark:text-orange-500">₹{selectedParty.totalDue.toLocaleString()}</p>
                {selectedParty.totalDue > 0 && (
                  <button
                    onClick={() => setShowPayment(true)}
                    className="mt-2 text-xs font-bold bg-orange-600 text-white px-3 py-1.5 rounded-lg w-full flex items-center justify-center gap-1 hover:bg-orange-700"
                  >
                    <Wallet size={14} /> {t('collectPayment')}
                  </button>
                )}
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700 rounded-xl">
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">{t('creditTerms')}</p>
                <div className="space-y-1 mt-2">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 flex justify-between">
                    <span>{t('limit')}</span> <span>{selectedParty.creditLimit > 0 ? `₹${selectedParty.creditLimit.toLocaleString()}` : t('noLimit')}</span>
                  </p>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 flex justify-between">
                    <span>{t('days')}</span> <span>{selectedParty.creditDays > 0 ? `${selectedParty.creditDays} ${t('daysSuffix')}` : t('notApplicable')}</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-50 dark:bg-slate-900">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <ReceiptText size={16} /> {t('partyLedgerTimeline')}
              </h3>
              <LedgerView entityId={selectedParty.id} entityType="party" />
            </div>
          </div>
        </div>
      )}

      {showPayment && selectedParty && (
        <PaymentCollectionModal
          entityId={selectedParty.id}
          entityType="party"
          entityName={selectedParty.shopName || selectedParty.name}
          outstanding={selectedParty.totalDue}
          onClose={() => setShowPayment(false)}
          onSuccess={() => {
            setShowPayment(false);
            fetchParties();
            setSelectedParty(null);
          }}
        />
      )}

      {/* New Party Modal */}
      {showNewParty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl flex flex-col overflow-hidden max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800">
              <h2 className="text-lg font-bold">{t('addWholesaleParty')}</h2>
              <button onClick={() => setShowNewParty(false)}><X size={20} className="text-slate-400"/></button>
            </div>
            <div className="overflow-y-auto">
              <form onSubmit={handleCreateParty} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-bold mb-1">{t('shopBusinessName')}</label>
                  <input required value={form.shopName} onChange={e=>setForm({...form, shopName: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800" placeholder={t('shopNamePlaceholder')} />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1">{t('ownerName')}</label>
                  <input required value={form.name} onChange={e=>setForm({...form, name: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold mb-1">{t('mobile')}</label>
                    <input value={form.mobile} onChange={e=>setForm({...form, mobile: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-1">{t('gstin')}</label>
                    <input value={form.gst} onChange={e=>setForm({...form, gst: e.target.value.toUpperCase()})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800 font-mono text-sm" maxLength={15} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1">{t('address')}</label>
                  <input value={form.address} onChange={e=>setForm({...form, address: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-bold mb-1 truncate" title={t('openingBalanceFull')}>{t('openingBalance')}</label>
                    <input type="number" value={form.openingBalance} onChange={e=>setForm({...form, openingBalance: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-1 truncate" title={t('creditLimitFull')}>{t('creditLimit')}</label>
                    <input type="number" value={form.creditLimit} onChange={e=>setForm({...form, creditLimit: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-1 truncate" title={t('creditDaysFull')}>{t('creditDays')}</label>
                    <input type="number" value={form.creditDays} onChange={e=>setForm({...form, creditDays: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800" />
                  </div>
                </div>
                <button type="submit" className="w-full h-12 mt-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700">{t('saveParty')}</button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
