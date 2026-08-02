'use client';

import { useState, useEffect } from 'react';
import { Search, Loader2, User, Phone, ChevronRight, X, Calendar, Plus, Wallet, MapPin, ReceiptText, FileText, FileImage, Eye, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import PaymentCollectionModal from '@/components/crm/PaymentCollectionModal';
import LedgerView from '@/components/crm/LedgerView';
import DocumentViewerModal from '@/components/DocumentViewerModal';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { getBusinessConfig } from '@/lib/businessConfig';
import { cn } from '@/lib/utils';
import { ExportButton } from '@/lib/hooks/useExport';

type TypeTranslator = (key: string) => string;

// True for any business type in the Agro category (Agro Retail Store, Agro
// Wholesale, Seed/Fertilizer/Pesticide Distributor, Organic Products, Farm
// Equipment) — not just the original 'agrostore' type.
function isAgroBusiness(bizType: string | undefined): boolean {
  return getBusinessConfig(bizType || '').category === 'agro';
}

// Business-type-aware customer roles. Agro shops sell to Farmers as their
// core retail customer, plus Dealers / Distributors / Institutions for bulk
// off-take — each with a different pricing and credit posture, so shopkeepers
// want to see outstanding split by type. Other categories get a generic list.
function getCustomerTypeOptions(bizType: string | undefined, tt: TypeTranslator): { value: string; label: string }[] {
  if (isAgroBusiness(bizType)) {
    return [
      { value: 'farmer', label: tt('farmer') },
      { value: 'dealer', label: tt('dealer') },
      { value: 'distributor', label: tt('distributor') },
      { value: 'institution', label: tt('institution') },
      { value: 'customer', label: tt('customer') },
    ];
  }
  return [
    { value: 'customer', label: tt('customer') },
    { value: 'dealer', label: tt('dealer') },
    { value: 'distributor', label: tt('distributor') },
    { value: 'institution', label: tt('institution') },
  ];
}

function customerTypeLabel(bizType: string | undefined, type: string | undefined | null, tt: TypeTranslator): string {
  const opts = getCustomerTypeOptions(bizType, tt);
  return opts.find(o => o.value === (type || 'customer'))?.label || tt('customer');
}

// Distinct badge colour per type so the shopkeeper can scan the list visually.
function customerTypeTone(type: string | undefined | null): string {
  switch ((type || 'customer').toLowerCase()) {
    case 'farmer':      return 'bg-lime-100 text-lime-700 dark:bg-lime-500/20 dark:text-lime-300';
    case 'dealer':      return 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300';
    case 'distributor': return 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300';
    case 'institution': return 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300';
    default:            return 'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300';
  }
}

// --- CustomerSalesView Component ---
function CustomerSalesView({ entityId }: { entityId: string }) {
  const t = useTranslations('Customers');
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSales = async () => {
      try {
        const res = await api.get(`/customers/${entityId}/history`);
        setSales(res.data);
      } catch (e) {
        console.error(t('salesHistoryFailed'), e);
      } finally {
        setLoading(false);
      }
    };
    if (entityId) fetchSales();
  }, [entityId, t]);

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>;

  if (sales.length === 0) return (
    <div className="text-center py-12 text-slate-500">
      <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
      <p>{t('noSalesHistory')}</p>
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

type CustomerDocument = { id: string; url: string; uploadedAt: string };

type Customer = {
  id: string;
  name: string;
  mobile: string;
  email: string;
  totalDue: number;
  creditDays: number;
  creditLimit: number;
  address: string;
  customerType?: string;
  documents?: CustomerDocument[];
};

export default function CustomersPage() {
  const t = useTranslations('Customers');
  const tt = useTranslations('Customers.type');
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const profile = useBusinessStore(s => s.profile);
  const bizConfig = getBusinessConfig(profile.businessType);
  const typeOptions = getCustomerTypeOptions(profile.businessType, tt);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortOption, setSortOption] = useState('new');
  
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [activeTab, setActiveTab] = useState<'ledger' | 'sales'>('ledger');
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<{ url: string; label: string } | null>(null);

  const [form, setForm] = useState({
    name: '', mobile: '', address: '', creditLimit: '0', creditDays: '0', openingBalance: '0',
    customerType: isAgroBusiness(profile.businessType) ? 'farmer' : 'customer',
  });

  function updateCustomerDocuments(customerId: string, documents: CustomerDocument[]) {
    setSelectedCustomer(prev => (prev && prev.id === customerId ? { ...prev, documents } : prev));
    setCustomers(prev => prev.map(c => (c.id === customerId ? { ...c, documents } : c)));
  }

  async function handleUploadDocument(e: React.ChangeEvent<HTMLInputElement>) {
    if (!selectedCustomer || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    e.target.value = '';
    setUploadingDoc(true);
    const body = new FormData();
    body.append('file', file);
    body.append('folder', 'customer-docs');
    try {
      const res = await api.post('/upload', body);
      if (res.data.url) {
        const next = [...(selectedCustomer.documents || []), { id: crypto.randomUUID(), url: res.data.url, uploadedAt: new Date().toISOString() }];
        await api.patch(`/customers/${selectedCustomer.id}`, { documents: next });
        updateCustomerDocuments(selectedCustomer.id, next);
      }
    } catch (err) {
      console.error(err);
      alert(t('uploadFailed'));
    } finally {
      setUploadingDoc(false);
    }
  }

  async function handleDeleteDocument(docId: string) {
    if (!selectedCustomer) return;
    if (!confirm(t('removeConfirm'))) return;
    const next = (selectedCustomer.documents || []).filter(d => d.id !== docId);
    try {
      await api.patch(`/customers/${selectedCustomer.id}`, { documents: next });
      updateCustomerDocuments(selectedCustomer.id, next);
    } catch (err) {
      console.error(err);
      alert(t('deleteFailed'));
    }
  }

  useEffect(() => {
    fetchCustomers();
  }, [activeShopId]);

  const fetchCustomers = async () => {
    try {
      // ?type=all: the CRM page now covers every customer role (Farmer /
      // Dealer / Distributor / Institution / Retail Customer) so the roll-up
      // strip and badges below aren't missing any of them.
      const res = await api.get('/crm/customers?type=all');
      setCustomers(res.data);
    } catch (e) {
      console.error(t('loadFailed'), e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // customerType now flows from the picker instead of a hard-coded value —
      // an agro shop can register a Farmer / Dealer / Distributor / Institution
      // and the roll-up below will bucket the outstanding balance accordingly.
      await api.post('/crm/customers', { ...form });
      fetchCustomers();
      setShowNewCustomer(false);
      setForm({
        name: '', mobile: '', address: '', creditLimit: '0', creditDays: '0', openingBalance: '0',
        customerType: isAgroBusiness(profile.businessType) ? 'farmer' : 'customer',
      });
    } catch (e) {
      console.error(e);
    }
  };

  // Per-type roll-up: count of customers + total outstanding per customerType,
  // computed from the already-loaded list so no extra API call is needed.
  // Sorted with the highest outstanding first — the type that most needs
  // follow-up sits at the top.
  const typeRollup = (() => {
    const map = new Map<string, { count: number; outstanding: number }>();
    for (const c of customers) {
      const key = (c.customerType || 'customer').toLowerCase();
      const cur = map.get(key) || { count: 0, outstanding: 0 };
      cur.count += 1;
      cur.outstanding += Number(c.totalDue) || 0;
      map.set(key, cur);
    }
    return Array.from(map.entries())
      .map(([type, v]) => ({ type, ...v }))
      .sort((a, b) => b.outstanding - a.outstanding || b.count - a.count);
  })();

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
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{t('pageTitle')}</h1>
          <p className="text-slate-500 text-sm font-medium">{t('pageSubtitle')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ExportButton
            filename="customers"
            title={t('exportTitle')}
            summary={typeRollup.length > 0 ? [
              { label: t('kpiCustomers'), value: String(customers.length) },
              { label: t('kpiOutstanding'), value: `₹${Math.round(customers.reduce((s, c) => s + (Number(c.totalDue) || 0), 0)).toLocaleString('en-IN')}`, tone: 'negative' },
              { label: t('kpiWithDues'), value: String(customers.filter(c => (Number(c.totalDue) || 0) > 0).length) },
            ] : undefined}
            columns={[
              { key: 'name', label: t('nameLabel') },
              { key: 'mobile', label: t('mobileLabel') },
              { key: 'customerType', label: t('customerTypeLabel') },
              { key: 'address', label: t('addressLabel') },
              { key: 'creditLimit', label: t('creditLimitLabel'), type: 'currency' },
              { key: 'creditDays', label: t('creditDaysLabel'), type: 'number' },
              { key: 'totalDue', label: t('kpiOutstanding'), type: 'currency' },
            ]}
            data={filtered.map(c => ({
              ...c,
              customerType: customerTypeLabel(profile.businessType, c.customerType, tt),
            }))}
          />
          <button
            onClick={() => setShowNewCustomer(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors"
          >
            <Plus size={18} /> {t('addCustomer')}
          </button>
        </div>
      </div>

      {typeRollup.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {typeRollup.map(r => (
            <div key={r.type} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <span className={cn('text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full', customerTypeTone(r.type))}>
                  {customerTypeLabel(profile.businessType, r.type, tt)}
                </span>
                <span className="text-[10px] font-bold text-slate-400">{r.count}</span>
              </div>
              <p className={cn('text-lg font-black', r.outstanding > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-emerald-600 dark:text-emerald-400')}>
                ₹{Math.round(r.outstanding).toLocaleString('en-IN')}
              </p>
              <p className="text-[10px] text-slate-500">{t('outstandingWord')}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-4">
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
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
              <option value="new">{t('sortNew')}</option>
              <option value="old">{t('sortOld')}</option>
              <option value="az">{t('sortAZ')}</option>
              <option value="za">{t('sortZA')}</option>
              <option value="recent_tx">{t('sortRecentTx')}</option>
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
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-bold text-slate-900 dark:text-white text-sm truncate">{c.name || t('unknown')}</h3>
                      <span className={cn('text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full shrink-0', customerTypeTone(c.customerType))}>
                        {customerTypeLabel(profile.businessType, c.customerType, tt)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <Phone size={12} /> {c.mobile || t('noNumber')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  {c.totalDue > 0 ? (
                    <span className="text-sm font-bold text-orange-600">₹{c.totalDue.toLocaleString()}</span>
                  ) : (
                    <span className="text-sm font-bold text-emerald-600">{t('settled')}</span>
                  )}
                </div>
              </div>
            ))}
            
            {filtered.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-500">
                {t('noCustomersMatching', { search })}
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
                  <span className="flex items-center gap-1"><Phone size={14}/> {selectedCustomer.mobile || t('na')}</span>
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
                <p className="text-xs font-bold text-orange-800 dark:text-orange-400 uppercase tracking-wider mb-1">{t('totalOutstanding')}</p>
                <p className="text-2xl font-black text-orange-600 dark:text-orange-500">₹{selectedCustomer.totalDue.toLocaleString()}</p>
                {selectedCustomer.totalDue > 0 && (
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
                    <span>{t('limitLabel')}</span> <span>{selectedCustomer.creditLimit > 0 ? `₹${selectedCustomer.creditLimit.toLocaleString()}` : t('noLimit')}</span>
                  </p>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 flex justify-between">
                    <span>{t('daysLabel')}</span> <span>{selectedCustomer.creditDays > 0 ? t('daysCount', { count: selectedCustomer.creditDays }) : t('na')}</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Documents: photos / bill PDFs */}
            <div className="px-4 sm:px-6 py-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">{t('documents')}</h3>
                <label className={`cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${uploadingDoc ? 'bg-slate-100 text-slate-400 dark:bg-slate-800' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 dark:hover:bg-indigo-500/20'}`}>
                  {uploadingDoc ? (
                    <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Plus size={14} />
                  )}
                  {t('addBtn')}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={handleUploadDocument}
                    disabled={uploadingDoc}
                  />
                </label>
              </div>
              {(selectedCustomer.documents || []).length === 0 ? (
                <p className="text-xs text-slate-500">{t('noDocuments')}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(selectedCustomer.documents || []).map(doc => (
                    <div
                      key={doc.id}
                      className="flex items-center gap-2 pl-3 pr-1.5 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300"
                    >
                      <FileImage size={14} className="text-slate-400 shrink-0" />
                      <span>
                        {new Date(doc.uploadedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </span>
                      <button
                        onClick={() => setViewingDoc({ url: doc.url, label: t('documents') })}
                        title={t('viewDocument')}
                        className="p-1 rounded text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteDocument(doc.id)}
                        title={t('deleteDocument')}
                        className="p-1 rounded text-slate-500 hover:text-red-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 gap-4">
              <button
                onClick={() => setActiveTab('ledger')}
                className={`py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'ledger' ? 'border-orange-500 text-orange-600 dark:text-orange-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
              >
                {t('ledgerTimeline')}
              </button>
              <button
                onClick={() => setActiveTab('sales')}
                className={`py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'sales' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
              >
                {t('salesHistoryTitle')}
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

      {viewingDoc && (
        <DocumentViewerModal url={viewingDoc.url} label={viewingDoc.label} onClose={() => setViewingDoc(null)} />
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
              <h2 className="text-lg font-bold">{t('addModalTitle')}</h2>
              <button onClick={() => setShowNewCustomer(false)}><X size={20} className="text-slate-400"/></button>
            </div>
            <form onSubmit={handleCreateCustomer} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold mb-1">{t('nameLabel')} *</label>
                <input required value={form.name} onChange={e=>setForm({...form, name: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800" />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">{t('mobileLabel')}</label>
                <input value={form.mobile} onChange={e=>setForm({...form, mobile: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800" />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">{t('addressLabel')}</label>
                <input value={form.address} onChange={e=>setForm({...form, address: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800" />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">{t('customerTypeLabel')}</label>
                <select
                  value={form.customerType}
                  onChange={e => setForm({ ...form, customerType: e.target.value })}
                  className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800"
                >
                  {typeOptions.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-1">{t('openingBalanceLabel')}</label>
                  <input type="number" value={form.openingBalance} onChange={e=>setForm({...form, openingBalance: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800" />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1">{t('creditLimitLabel')}</label>
                  <input type="number" value={form.creditLimit} onChange={e=>setForm({...form, creditLimit: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800" />
                </div>
              </div>
              <button type="submit" className="w-full h-10 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700">{t('saveCustomer')}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
