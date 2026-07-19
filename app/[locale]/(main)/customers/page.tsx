'use client';

import { useState, useEffect } from 'react';
import { Search, Loader2, User, Phone, ChevronRight, X, Calendar, Plus, Wallet, MapPin, ReceiptText, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import PaymentCollectionModal from '@/components/crm/PaymentCollectionModal';
import LedgerView from '@/components/crm/LedgerView';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';

// --- CustomerSalesView Component ---
function CustomerSalesView({ entityId }: { entityId: string }) {
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSales = async () => {
      try {
        const res = await api.get(`/customers/${entityId}/history`);
        setSales(res.data);
      } catch (e) {
        console.error('Failed to fetch sales history', e);
      } finally {
        setLoading(false);
      }
    };
    if (entityId) fetchSales();
  }, [entityId]);

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>;
  
  if (sales.length === 0) return (
    <div className="text-center py-12 text-slate-500">
      <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
      <p>No sales history found for this customer.</p>
    </div>
  );

  return (
    <div className="space-y-4 p-4">
      {sales.map((sale: any) => (
        <div key={sale.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
          <div className="flex justify-between items-start mb-3 border-b border-slate-100 dark:border-slate-700/50 pb-3">
            <div>
              <p className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="font-mono bg-slate-100 dark:bg-slate-700 px-1.5 rounded text-xs">{sale.invoice_number}</span>
              </p>
              <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                <Calendar size={10} /> {new Date(sale.created_at).toLocaleDateString()}
              </p>
            </div>
            <div className="text-right">
              <p className="font-black text-emerald-600 dark:text-emerald-400">₹{(sale.total_amount || 0).toLocaleString()}</p>
            </div>
          </div>
          <div className="space-y-2">
            {sale.items?.map((item: any, idx: number) => (
              <div key={idx} className="flex justify-between items-center text-xs">
                <span className="text-slate-600 dark:text-slate-300">
                  {item.quantity}x {item.product_name}
                </span>
                <span className="font-medium text-slate-900 dark:text-white">₹{(item.total || 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

type Customer = {
  id: string;
  name: string;
  mobile: string;
  email: string;
  totalDue: number;
  creditDays: number;
  creditLimit: number;
  address: string;
};

export default function CustomersPage() {
  const t = useTranslations();
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortOption, setSortOption] = useState('new');
  
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [activeTab, setActiveTab] = useState<'ledger' | 'sales'>('ledger');
  
  const [form, setForm] = useState({ name: '', mobile: '', address: '', creditLimit: '0', creditDays: '0', openingBalance: '0' });

  useEffect(() => {
    fetchCustomers();
  }, [activeShopId]);

  const fetchCustomers = async () => {
    try {
      const res = await api.get('/crm/customers?type=customer');
      setCustomers(res.data);
    } catch (e) {
      console.error('Failed to load customers', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/crm/customers', { ...form, customerType: 'customer' });
      fetchCustomers();
      setShowNewCustomer(false);
      setForm({ name: '', mobile: '', address: '', creditLimit: '0', creditDays: '0', openingBalance: '0' });
    } catch (e) {
      console.error(e);
    }
  };

  const filtered = customers
    .filter(c => 
      c.name.toLowerCase().includes(search.toLowerCase()) || 
      (c.mobile && c.mobile.includes(search))
    )
    .sort((a: any, b: any) => {
      if (sortOption === 'az') return (a.name || '').localeCompare(b.name || '');
      if (sortOption === 'za') return (b.name || '').localeCompare(a.name || '');
      
      const getLatestTxDate = (c: any) => {
        if (!c.customer_transactions || c.customer_transactions.length === 0) return 0;
        return Math.max(...c.customer_transactions.map((t: any) => new Date(t.created_at).getTime()));
      };

      if (sortOption === 'recent_tx') {
        return getLatestTxDate(b) - getLatestTxDate(a);
      }
      
      const getSortDate = (c: any) => {
        const txDate = getLatestTxDate(c);
        const createdDate = c.created_at ? new Date(c.created_at).getTime() : 0;
        return Math.max(txDate, createdDate);
      };

      const dateA = getSortDate(a);
      const dateB = getSortDate(b);
      
      if (sortOption === 'old') return dateA - dateB;
      // Default: new (Recently Added / Recent Activity)
      return dateB - dateA;
    });

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Customers CRM</h1>
          <p className="text-slate-500 text-sm font-medium">Manage your retail customers, ledger, and outstanding balances.</p>
        </div>
        <button 
          onClick={() => setShowNewCustomer(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors"
        >
          <Plus size={18} /> Add Customer
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-4">
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Search by name or mobile number..."
              className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="sm:w-48">
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value)}
              className="w-full py-3 px-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none cursor-pointer"
            >
              <option value="new">Recently Added</option>
              <option value="old">Oldest Added</option>
              <option value="az">Alphabetical (A to Z)</option>
              <option value="za">Alphabetical (Z to A)</option>
              <option value="recent_tx">Recent Transactions</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(c => (
              <div 
                key={c.id} 
                onClick={() => setSelectedCustomer(c)}
                className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-emerald-500 cursor-pointer transition-colors bg-slate-50 dark:bg-slate-800/50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 font-bold">
                    {c.name.charAt(0).toUpperCase() || <User size={18} />}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white text-sm">{c.name || 'Unknown'}</h3>
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <Phone size={12} /> {c.mobile || 'No Number'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  {c.totalDue > 0 ? (
                    <span className="text-sm font-bold text-orange-600">₹{c.totalDue.toLocaleString()}</span>
                  ) : (
                    <span className="text-sm font-bold text-emerald-600">Settled</span>
                  )}
                </div>
              </div>
            ))}
            
            {filtered.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-500">
                No customers found matching "{search}"
              </div>
            )}
          </div>
        )}
      </div>

      {/* Customer Panel */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-slate-50 dark:bg-slate-900 w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-xl flex flex-col h-[90vh] sm:h-auto sm:max-h-[90vh] animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95">
            
            <div className="p-6 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sm:rounded-t-2xl flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                  {selectedCustomer.name}
                </h2>
                <div className="flex flex-wrap gap-4 mt-2 text-sm text-slate-500">
                  <span className="flex items-center gap-1"><Phone size={14}/> {selectedCustomer.mobile || 'N/A'}</span>
                  {selectedCustomer.address && <span className="flex items-center gap-1"><MapPin size={14}/> {selectedCustomer.address}</span>}
                </div>
              </div>
              <button 
                onClick={() => { setSelectedCustomer(null); setActiveTab('ledger'); }}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 grid grid-cols-2 gap-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <div className="p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-900/50 rounded-xl">
                <p className="text-xs font-bold text-orange-800 dark:text-orange-400 uppercase tracking-wider mb-1">Total Outstanding</p>
                <p className="text-2xl font-black text-orange-600 dark:text-orange-500">₹{selectedCustomer.totalDue.toLocaleString()}</p>
                {selectedCustomer.totalDue > 0 && (
                  <button 
                    onClick={() => setShowPayment(true)}
                    className="mt-2 text-xs font-bold bg-orange-600 text-white px-3 py-1.5 rounded-lg w-full flex items-center justify-center gap-1 hover:bg-orange-700"
                  >
                    <Wallet size={14} /> Collect Payment
                  </button>
                )}
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700 rounded-xl">
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Credit Terms</p>
                <div className="space-y-1 mt-2">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 flex justify-between">
                    <span>Limit:</span> <span>{selectedCustomer.creditLimit > 0 ? `₹${selectedCustomer.creditLimit.toLocaleString()}` : 'No Limit'}</span>
                  </p>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 flex justify-between">
                    <span>Days:</span> <span>{selectedCustomer.creditDays > 0 ? `${selectedCustomer.creditDays} days` : 'N/A'}</span>
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 gap-4">
              <button
                onClick={() => setActiveTab('ledger')}
                className={`py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'ledger' ? 'border-orange-500 text-orange-600 dark:text-orange-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
              >
                Ledger Timeline
              </button>
              <button
                onClick={() => setActiveTab('sales')}
                className={`py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'sales' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
              >
                All Sales History
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-50 dark:bg-slate-900">
              {activeTab === 'ledger' ? (
                <LedgerView entityId={selectedCustomer.id} entityType="customer" />
              ) : (
                <CustomerSalesView entityId={selectedCustomer.id} />
              )}
            </div>
          </div>
        </div>
      )}

      {showPayment && selectedCustomer && (
        <PaymentCollectionModal 
          entityId={selectedCustomer.id}
          entityType="customer"
          entityName={selectedCustomer.name}
          outstanding={selectedCustomer.totalDue}
          onClose={() => setShowPayment(false)}
          onSuccess={() => {
            setShowPayment(false);
            fetchCustomers();
            setSelectedCustomer(null);
          }}
        />
      )}

      {/* New Customer Modal */}
      {showNewCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-bold">Add Retail Customer</h2>
              <button onClick={() => setShowNewCustomer(false)}><X size={20} className="text-slate-400"/></button>
            </div>
            <form onSubmit={handleCreateCustomer} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold mb-1">Name *</label>
                <input required value={form.name} onChange={e=>setForm({...form, name: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800" />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">Mobile</label>
                <input value={form.mobile} onChange={e=>setForm({...form, mobile: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800" />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">Address</label>
                <input value={form.address} onChange={e=>setForm({...form, address: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-1">Opening Balance</label>
                  <input type="number" value={form.openingBalance} onChange={e=>setForm({...form, openingBalance: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800" />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1">Credit Limit</label>
                  <input type="number" value={form.creditLimit} onChange={e=>setForm({...form, creditLimit: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800" />
                </div>
              </div>
              <button type="submit" className="w-full h-10 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700">Save Customer</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
