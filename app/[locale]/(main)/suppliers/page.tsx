'use client';

import { useState, useEffect } from 'react';
import { Search, Loader2, Phone, X, Plus, Wallet, MapPin, ReceiptText, Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import PaymentCollectionModal from '@/components/crm/PaymentCollectionModal';
import LedgerView from '@/components/crm/LedgerView';
import api from '@/lib/api';

type Supplier = {
  id: string;
  name: string;
  mobile: string;
  email: string;
  gst: string;
  balance: number;
  creditDays: number;
  creditLimit: number;
  address: string;
};

export default function SuppliersPage() {
  const t = useTranslations();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  
  const [form, setForm] = useState({ name: '', mobile: '', gst: '', address: '', creditLimit: '0', creditDays: '0', openingBalance: '0' });

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    try {
      const res = await api.get('/crm/suppliers');
      setSuppliers(res.data);
    } catch (e) {
      console.error('Failed to load suppliers', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/crm/suppliers', form);
      fetchSuppliers();
      setShowNewSupplier(false);
      setForm({ name: '', mobile: '', gst: '', address: '', creditLimit: '0', creditDays: '0', openingBalance: '0' });
    } catch (e) {
      console.error(e);
    }
  };

  const filtered = suppliers.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) || 
    (s.mobile && s.mobile.includes(search))
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Suppliers CRM</h1>
          <p className="text-slate-500 text-sm font-medium">Manage vendors, ledger, and payables.</p>
        </div>
        <button 
          onClick={() => setShowNewSupplier(true)}
          className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors"
        >
          <Plus size={18} /> Add Supplier
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-4">
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="Search by supplier name or mobile..."
            className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none transition-all"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(s => (
              <div 
                key={s.id} 
                onClick={() => setSelectedSupplier(s)}
                className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-amber-500 cursor-pointer transition-colors bg-slate-50 dark:bg-slate-800/50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 font-bold">
                    <Truck size={18} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-900 dark:text-white text-sm truncate">{s.name}</h3>
                    <p className="text-xs text-slate-500 truncate flex items-center gap-1">
                      <Phone size={10} /> {s.mobile || 'No Number'}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  {s.balance > 0 ? (
                    <span className="text-sm font-bold text-red-600">₹{s.balance.toLocaleString()}</span>
                  ) : (
                    <span className="text-sm font-bold text-emerald-600">Settled</span>
                  )}
                </div>
              </div>
            ))}
            
            {filtered.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-500">
                No suppliers found matching "{search}"
              </div>
            )}
          </div>
        )}
      </div>

      {/* Supplier Panel */}
      {selectedSupplier && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-slate-50 dark:bg-slate-900 w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-xl flex flex-col h-[90vh] sm:h-auto sm:max-h-[90vh] animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95">
            
            <div className="p-6 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sm:rounded-t-2xl flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                  {selectedSupplier.name}
                </h2>
                <div className="flex flex-wrap gap-4 mt-2 text-sm text-slate-500">
                  <span className="flex items-center gap-1"><Phone size={14}/> {selectedSupplier.mobile || 'N/A'}</span>
                  {selectedSupplier.gst && <span className="flex items-center gap-1 font-mono">GST: {selectedSupplier.gst}</span>}
                  {selectedSupplier.address && <span className="flex items-center gap-1"><MapPin size={14}/> {selectedSupplier.address}</span>}
                </div>
              </div>
              <button 
                onClick={() => setSelectedSupplier(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 grid grid-cols-2 gap-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/50 rounded-xl">
                <p className="text-xs font-bold text-red-800 dark:text-red-400 uppercase tracking-wider mb-1">To Pay</p>
                <p className="text-2xl font-black text-red-600 dark:text-red-500">₹{selectedSupplier.balance.toLocaleString()}</p>
                {selectedSupplier.balance > 0 && (
                  <button 
                    onClick={() => setShowPayment(true)}
                    className="mt-2 text-xs font-bold bg-red-600 text-white px-3 py-1.5 rounded-lg w-full flex items-center justify-center gap-1 hover:bg-red-700"
                  >
                    <Wallet size={14} /> Pay Supplier
                  </button>
                )}
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700 rounded-xl">
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Credit Terms</p>
                <div className="space-y-1 mt-2">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 flex justify-between">
                    <span>Limit:</span> <span>{selectedSupplier.creditLimit > 0 ? `₹${selectedSupplier.creditLimit.toLocaleString()}` : 'No Limit'}</span>
                  </p>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 flex justify-between">
                    <span>Days:</span> <span>{selectedSupplier.creditDays > 0 ? `${selectedSupplier.creditDays} days` : 'N/A'}</span>
                  </p>
                </div>
              </div>
            </div>
            
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-50 dark:bg-slate-900">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <ReceiptText size={16} /> Supplier Ledger
              </h3>
              <LedgerView entityId={selectedSupplier.id} entityType="supplier" />
            </div>
          </div>
        </div>
      )}

      {showPayment && selectedSupplier && (
        <PaymentCollectionModal 
          entityId={selectedSupplier.id}
          entityType="supplier"
          entityName={selectedSupplier.name}
          outstanding={selectedSupplier.balance}
          onClose={() => setShowPayment(false)}
          onSuccess={() => {
            setShowPayment(false);
            fetchSuppliers();
            setSelectedSupplier(null);
          }}
        />
      )}

      {/* New Supplier Modal */}
      {showNewSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl flex flex-col overflow-hidden max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800">
              <h2 className="text-lg font-bold">Add Supplier</h2>
              <button onClick={() => setShowNewSupplier(false)}><X size={20} className="text-slate-400"/></button>
            </div>
            <div className="overflow-y-auto">
              <form onSubmit={handleCreateSupplier} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-bold mb-1">Supplier Name *</label>
                  <input required value={form.name} onChange={e=>setForm({...form, name: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold mb-1">Mobile</label>
                    <input value={form.mobile} onChange={e=>setForm({...form, mobile: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-1">GSTIN</label>
                    <input value={form.gst} onChange={e=>setForm({...form, gst: e.target.value.toUpperCase()})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800 font-mono text-sm" maxLength={15} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1">Address</label>
                  <input value={form.address} onChange={e=>setForm({...form, address: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-bold mb-1 truncate" title="Opening Balance">Op. Bal</label>
                    <input type="number" value={form.openingBalance} onChange={e=>setForm({...form, openingBalance: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-1 truncate" title="Credit Limit">Cr. Limit</label>
                    <input type="number" value={form.creditLimit} onChange={e=>setForm({...form, creditLimit: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-1 truncate" title="Credit Days">Cr. Days</label>
                    <input type="number" value={form.creditDays} onChange={e=>setForm({...form, creditDays: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800" />
                  </div>
                </div>
                <button type="submit" className="w-full h-12 mt-4 bg-amber-600 text-white rounded-xl font-bold hover:bg-amber-700">Save Supplier</button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
