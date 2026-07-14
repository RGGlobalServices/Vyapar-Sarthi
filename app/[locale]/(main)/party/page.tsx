'use client';

import { useState } from 'react';
import { Search, Loader2, Phone, X, Plus, Wallet, MapPin, ReceiptText, Building2, Pencil, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import PaymentCollectionModal from '@/components/crm/PaymentCollectionModal';
import LedgerView from '@/components/crm/LedgerView';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import useSWR from 'swr';
import toast from 'react-hot-toast';

const fetcher = (url: string) => api.get(url, { cache: 'no-store' }).then(res => res.data);

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
  const [search, setSearch] = useState('');

  const { data: partiesData = [], mutate: mutateParties, isLoading } = useSWR(
    activeShopId ? `/crm/customers?type=party&_shop=${activeShopId}` : null,
    fetcher
  );
  const parties: Party[] = Array.isArray(partiesData) ? partiesData : [];
  console.log("SWR partiesData:", partiesData);

  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [showNewParty, setShowNewParty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Edit / Delete states
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  
  const [deletingParty, setDeletingParty] = useState<Party | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [form, setForm] = useState({ name: '', shopName: '', mobile: '', gst: '', address: '', creditLimit: '0', creditDays: '0', openingBalance: '0' });

  const handleCreateParty = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await api.post('/crm/customers', { ...form, customerType: 'party' });
      toast.success(t('partyCreated') || 'Party added successfully');
      await mutateParties();
      setShowNewParty(false);
      setForm({ name: '', shopName: '', mobile: '', gst: '', address: '', creditLimit: '0', creditDays: '0', openingBalance: '0' });
    } catch (e) {
      console.error(e);
      toast.error('Failed to add party');
    } finally {
      setIsSaving(false);
    }
  };

  const openEditModal = () => {
    if (!selectedParty) return;
    setForm({
      name: selectedParty.name,
      shopName: selectedParty.shopName || '',
      mobile: selectedParty.mobile || '',
      gst: selectedParty.gst || '',
      address: selectedParty.address || '',
      creditLimit: (selectedParty.creditLimit || 0).toString(),
      creditDays: (selectedParty.creditDays || 0).toString(),
      openingBalance: '0'
    });
    setEditingParty(selectedParty);
  };

  const handleEditParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingParty) return;
    setIsEditing(true);
    try {
      await api.put(`/crm/customers/${editingParty.id}`, { ...form, customerType: 'party' });
      toast.success('Party updated successfully');
      await mutateParties();
      setEditingParty(null);
      setSelectedParty(null);
      setForm({ name: '', shopName: '', mobile: '', gst: '', address: '', creditLimit: '0', creditDays: '0', openingBalance: '0' });
    } catch (e) {
      console.error(e);
      toast.error('Failed to update party');
    } finally {
      setIsEditing(false);
    }
  };

  const handleDeleteParty = async () => {
    if (!deletingParty) return;
    setIsDeleting(true);
    try {
      await api.delete(`/crm/customers/${deletingParty.id}`);
      toast.success('Party deleted successfully');
      mutateParties();
      setDeletingParty(null);
      setSelectedParty(null);
    } catch (e) {
      console.error(e);
      toast.error('Failed to delete party');
    } finally {
      setIsDeleting(false);
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

        {isLoading ? (
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
              <div className="flex items-center gap-2">
                <button
                  onClick={openEditModal}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  title="Edit Party"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => setDeletingParty(selectedParty)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                  title="Delete Party"
                >
                  <Trash2 size={16} />
                </button>
                <button
                  onClick={() => setSelectedParty(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
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
            mutateParties();
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
                <button type="submit" disabled={isSaving} className="w-full h-12 mt-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-70 flex items-center justify-center gap-2 transition-colors">
                  {isSaving ? <Loader2 size={20} className="animate-spin" /> : t('saveParty')}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Party Modal */}
      {editingParty && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl flex flex-col overflow-hidden max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Pencil size={18} className="text-indigo-500" />
                Edit Party
              </h2>
              <button onClick={() => { setEditingParty(null); setForm({ name: '', shopName: '', mobile: '', gst: '', address: '', creditLimit: '0', creditDays: '0', openingBalance: '0' }); }}><X size={20} className="text-slate-400 hover:text-slate-700 transition-colors"/></button>
            </div>
            <div className="overflow-y-auto">
              <form onSubmit={handleEditParty} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-bold mb-1">{t('shopBusinessName')}</label>
                  <input required value={form.shopName} onChange={e=>setForm({...form, shopName: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 transition-shadow" placeholder={t('shopNamePlaceholder')} />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1">{t('ownerName')}</label>
                  <input required value={form.name} onChange={e=>setForm({...form, name: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 transition-shadow" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold mb-1">{t('mobile')}</label>
                    <input value={form.mobile} onChange={e=>setForm({...form, mobile: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 transition-shadow" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-1">{t('gstin')}</label>
                    <input value={form.gst} onChange={e=>setForm({...form, gst: e.target.value.toUpperCase()})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800 font-mono text-sm focus:ring-2 focus:ring-indigo-500 transition-shadow" maxLength={15} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1">{t('address')}</label>
                  <input value={form.address} onChange={e=>setForm({...form, address: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 transition-shadow" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold mb-1 truncate" title={t('creditLimitFull')}>{t('creditLimit')}</label>
                    <input type="number" value={form.creditLimit} onChange={e=>setForm({...form, creditLimit: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 transition-shadow" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-1 truncate" title={t('creditDaysFull')}>{t('creditDays')}</label>
                    <input type="number" value={form.creditDays} onChange={e=>setForm({...form, creditDays: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 transition-shadow" />
                  </div>
                </div>
                <button type="submit" disabled={isEditing} className="w-full h-12 mt-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-70 flex items-center justify-center gap-2 transition-colors">
                  {isEditing ? <Loader2 size={20} className="animate-spin" /> : 'Save Changes'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deletingParty && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-xl flex flex-col overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 text-red-500 flex items-center justify-center mx-auto mb-5">
                <Trash2 size={32} />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Delete Party?</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">Are you sure you want to delete <strong className="text-slate-700 dark:text-slate-300">{deletingParty.shopName || deletingParty.name}</strong>? This will not delete their associated ledgers but will remove them from the active parties list. This action cannot be undone.</p>
              <div className="flex gap-3 w-full">
                <button onClick={() => setDeletingParty(null)} className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 dark:text-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors">Cancel</button>
                <button onClick={handleDeleteParty} disabled={isDeleting} className="flex-1 bg-red-500 hover:bg-red-600 text-white px-4 py-3 rounded-xl font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {isDeleting ? <><Loader2 size={16} className="animate-spin" /> Deleting</> : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
