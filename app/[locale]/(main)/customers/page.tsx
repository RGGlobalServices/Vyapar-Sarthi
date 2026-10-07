'use client';

import { useState, useEffect } from 'react';
import { Search, Loader2, User, Phone, ChevronRight, X, Calendar, Plus, Wallet, MapPin, ReceiptText, FileText, FileImage, Eye, Trash2, AlertCircle, CheckCircle2, NotebookText, ScanLine, Pencil, Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import useSWR from 'swr';
import PaymentCollectionModal from '@/components/crm/PaymentCollectionModal';
import LedgerView from '@/components/crm/LedgerView';
import CustomerRollupView from '@/components/crm/CustomerRollupView';
import DocumentViewerModal from '@/components/DocumentViewerModal';
// Collection features carried over from the Udyog Parties tab so Vyapar/
// Dukan users get the same "collect from many customers in a round"
// workflow — printable register PDF, AI-scanned handwritten sheet, and
// per-customer Add Bill for manual paper-bill entry.
import AddBillModal from '@/components/party/AddBillModal';
import ScanCollectionModal from '@/components/party/ScanCollectionModal';
import toast from 'react-hot-toast';
import { generateCollectionRegisterPDF } from '@/lib/pdf/collectionRegister';
import { downloadDispatchChallan } from '@/lib/pdf/slipGenerator';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { getBusinessConfig } from '@/lib/businessConfig';
import { cn, fmtDate } from '@/lib/utils';
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
                <Calendar size={10} /> {fmtDate(sale.created_at)}
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
  const [showEditCustomer, setShowEditCustomer] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '', mobile: '', address: '', creditLimit: '0', creditDays: '0', customerType: 'customer',
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [showAddBill, setShowAddBill] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [generatingRegister, setGeneratingRegister] = useState(false);
  const [activeTab, setActiveTab] = useState<'ledger' | 'sales' | 'slips'>('ledger');
  const [downloadingSlipId, setDownloadingSlipId] = useState<string | null>(null);
  const [slipSales, setSlipSales] = useState<any[]>([]);
  const [slipSalesLoading, setSlipSalesLoading] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<{ url: string; label: string } | null>(null);
  const [rollupMode, setRollupMode] = useState<'pending' | 'paid' | null>(null);

  // Just for the "Total Collected" card below — CustomerRollupView itself is
  // the real source of truth for the full payment list, this only needs the summary.
  const { data: paymentsSummary } = useSWR(
    activeShopId ? `/crm/payments-all?entityType=customer&_shop=${activeShopId}` : null,
    (url: string) => api.get(url).then(res => res.data)
  );

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

  useEffect(() => {
    if (activeTab !== 'slips' || !selectedCustomer) return;
    setSlipSalesLoading(true);
    api.get(`/customers/${selectedCustomer.id}/history`)
      .then(res => setSlipSales(res.data || []))
      .catch(() => setSlipSales([]))
      .finally(() => setSlipSalesLoading(false));
  }, [activeTab, selectedCustomer?.id]);

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

  function openEditCustomer(c: Customer) {
    setEditForm({
      name: c.name || '',
      mobile: c.mobile || '',
      address: (c as any).address || '',
      creditLimit: String(c.creditLimit ?? 0),
      creditDays: String(c.creditDays ?? 0),
      customerType: c.customerType || 'customer',
    });
    setShowEditCustomer(true);
  }

  async function handleUpdateCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCustomer) return;
    setSavingEdit(true);
    try {
      const res = await api.put(`/customers/${selectedCustomer.id}`, {
        name: editForm.name,
        mobile: editForm.mobile,
        address: editForm.address,
        customerType: editForm.customerType,
        creditLimit: editForm.creditLimit,
        creditDays: editForm.creditDays,
      });
      const updated = res.data;
      setSelectedCustomer(prev => (prev ? { ...prev, ...updated } : prev));
      setCustomers(prev => prev.map(c => (c.id === selectedCustomer.id ? { ...c, ...updated } : c)));
      setShowEditCustomer(false);
      toast.success(t('editSuccess') || 'Customer updated');
    } catch (err) {
      console.error(err);
      toast.error(t('editFailed') || 'Failed to update customer');
    } finally {
      setSavingEdit(false);
    }
  }

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

  // Ported from the Udyog Parties tab — printable collection round sheet,
  // outstanding customers only. Same generator + PDF layout every other
  // module uses, so the file that comes out of Vyapar/Dukan reads
  // identically to the Udyog one.
  const handleDownloadCollectionRegister = async () => {
    const outstanding = customers.filter(c => (c.totalDue || 0) > 0);
    if (outstanding.length === 0) {
      toast.error('No outstanding customers to collect from');
      return;
    }
    setGeneratingRegister(true);
    try {
      await generateCollectionRegisterPDF({
        shop: {
          name: profile?.shopName || 'Vyapar Sarthi',
          address: profile?.address || null,
          mobile: profile?.mobile || null,
          gst: profile?.gst || null,
          pan: profile?.pan || null,
        },
        parties: outstanding.map(c => ({
          name: c.name,
          shopName: null,
          address: (c as any).address || null,
          totalDue: c.totalDue || 0,
        })),
      });
    } catch (e) {
      console.error(e);
      toast.error('Failed to generate collection register');
    } finally {
      setGeneratingRegister(false);
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
            onClick={handleDownloadCollectionRegister}
            disabled={generatingRegister}
            title="Printable route sheet for today's collection round — outstanding customers only"
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-emerald-400 dark:hover:border-emerald-600 hover:text-emerald-600 dark:hover:text-emerald-400 px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors disabled:opacity-60"
          >
            {generatingRegister ? <Loader2 size={18} className="animate-spin" /> : <NotebookText size={18} />}
            Collection Register
          </button>
          <button
            onClick={() => setShowScanModal(true)}
            title="Photograph your collection round notebook — AI reads each customer's Cash/Chq and lets you apply them as payments"
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-emerald-400 dark:hover:border-emerald-600 hover:text-emerald-600 dark:hover:text-emerald-400 px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors"
          >
            <ScanLine size={18} />
            Scan Collection Sheet
          </button>
          <button
            onClick={() => setShowNewCustomer(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors"
          >
            <Plus size={18} /> {t('addCustomer')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 max-w-md">
        <button
          onClick={() => setRollupMode('pending')}
          className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 border-b-4 border-b-orange-500/40 rounded-2xl p-4 hover:shadow-md hover:-translate-y-0.5 transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('kpiOutstanding')}</p>
            <AlertCircle size={16} className="text-orange-500" />
          </div>
          <p className="text-xl font-black text-orange-600 dark:text-orange-400">
            ₹{Math.round(customers.reduce((s, c) => s + (Number(c.totalDue) || 0), 0)).toLocaleString('en-IN')}
          </p>
        </button>
        <button
          onClick={() => setRollupMode('paid')}
          className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 border-b-4 border-b-emerald-500/40 rounded-2xl p-4 hover:shadow-md hover:-translate-y-0.5 transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('totalCollected') || 'Total Collected'}</p>
            <CheckCircle2 size={16} className="text-emerald-500" />
          </div>
          <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">
            ₹{Math.round(paymentsSummary?.summary?.totalPaid || 0).toLocaleString('en-IN')}
          </p>
        </button>
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

      {/* Customer Panel — same full-screen-on-mobile pattern as the party
          page (z-[60] so it beats the sidebar in desktop-mode-on-mobile;
          h-[100dvh] so the mobile keyboard doesn't push content off-screen). */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-slate-50 dark:bg-slate-900 w-full sm:max-w-2xl rounded-none sm:rounded-2xl shadow-xl flex flex-col h-[100dvh] sm:h-auto sm:max-h-[90vh] animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95">
            
            <div className="p-6 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sm:rounded-t-2xl flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                  {selectedCustomer.name}
                  <button
                    onClick={() => openEditCustomer(selectedCustomer)}
                    title={t('editCustomer') || 'Edit customer'}
                    className="p-1 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                  >
                    <Pencil size={16} />
                  </button>
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
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => setShowAddBill(true)}
                    className="text-xs font-bold bg-white dark:bg-slate-800 border border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-400 px-3 py-1.5 rounded-lg flex items-center justify-center gap-1 hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors"
                  >
                    <ReceiptText size={14} /> Add Bill
                  </button>
                  {selectedCustomer.totalDue > 0 && (
                    <button
                      onClick={() => setShowPayment(true)}
                      className="text-xs font-bold bg-orange-600 text-white px-3 py-1.5 rounded-lg flex items-center justify-center gap-1 hover:bg-orange-700 transition-colors"
                    >
                      <Wallet size={14} /> {t('collectPayment')}
                    </button>
                  )}
                </div>
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
              <button
                onClick={() => setActiveTab('slips')}
                className={`py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'slips' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
              >
                {t('tabSlips') || 'Slips'}
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-50 dark:bg-slate-900">
              {activeTab === 'ledger' ? (
                <LedgerView entityId={selectedCustomer.id} entityType="customer" entityName={selectedCustomer.name} onLedgerChanged={() => fetchCustomers()} />
              ) : activeTab === 'sales' ? (
                <CustomerSalesView entityId={selectedCustomer.id} />
              ) : (
                /* Slips tab — Dispatch Challans generated from existing sales data */
                <div className="space-y-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{t('slipsNote') || 'Download dispatch challans for each sale. No new records are created.'}</p>
                  {slipSalesLoading ? (
                    <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>
                  ) : slipSales.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                      <FileText className="w-10 h-10 mx-auto mb-2 opacity-20" />
                      <p className="text-sm">{t('noSalesHistory') || 'No sales found'}</p>
                    </div>
                  ) : (
                    slipSales.map((sale: any) => (
                      <div key={sale.id} className="flex items-center justify-between bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 shadow-sm">
                        <div>
                          <p className="text-sm font-semibold text-slate-800 dark:text-white flex items-center gap-1.5">
                            <ReceiptText size={14} className="text-emerald-500" />
                            {sale.invoice_number || t('dispatchChallan') || 'Dispatch Challan'}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                            <Calendar size={10} /> {fmtDate(sale.created_at)}
                            <span className="ml-2 font-semibold text-emerald-600">₹{(sale.total_amount || 0).toLocaleString()}</span>
                          </p>
                        </div>
                        <button
                          disabled={downloadingSlipId === sale.id}
                          onClick={async () => {
                            setDownloadingSlipId(sale.id);
                            try {
                              await downloadDispatchChallan({
                                sale: {
                                  billNumber: sale.invoice_number,
                                  date: sale.created_at,
                                  items: sale.items?.map((it: any) => ({
                                    name: it.product_name,
                                    quantity: it.quantity,
                                    price: it.total,
                                  })),
                                  total: sale.total_amount,
                                },
                                customer: {
                                  name: selectedCustomer.name,
                                  mobile: selectedCustomer.mobile,
                                  address: selectedCustomer.address,
                                },
                                shopInfo: {
                                  name: profile.shopName || 'Vyapar Sarthi',
                                  address: profile.address,
                                  mobile: profile.mobile,
                                  gst: profile.gst,
                                },
                              });
                            } catch (e) {
                              toast.error('Failed to generate slip');
                            } finally {
                              setDownloadingSlipId(null);
                            }
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 disabled:opacity-50 transition-colors"
                        >
                          {downloadingSlipId === sale.id ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                          {t('downloadChallan') || 'Challan'}
                        </button>
                      </div>
                    ))
                  )}
                </div>
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
          entityMobile={selectedCustomer.mobile}
          outstanding={selectedCustomer.totalDue}
          onClose={() => { setShowPayment(false); setSelectedCustomer(null); }}
          onSuccess={() => fetchCustomers()}
        />
      )}

      {/* Add Bill for the selected customer — reuses the same modal
          Udyog's Parties tab uses, entityType='customer' so the photo-
          attachment step targets the customer row (not a party). Wraps
          the existing POST /billing flow so stock decrement + udhar
          posting go through the identical pipeline as normal billing. */}
      {showAddBill && selectedCustomer && (
        <AddBillModal
          partyId={selectedCustomer.id}
          partyDocuments={(selectedCustomer as any).documents || []}
          entityType="customer"
          onClose={() => setShowAddBill(false)}
          onSaved={() => { setShowAddBill(false); setSelectedCustomer(null); fetchCustomers(); }}
        />
      )}

      {/* Scan handwritten collection notebook for retail customers. Same
          AI vision pipeline as Udyog, entityType='customer' so the fuzzy
          match targets the customer roster instead of the party roster. */}
      {showScanModal && (
        <ScanCollectionModal
          entityType="customer"
          onClose={() => setShowScanModal(false)}
          onApplied={() => { setShowScanModal(false); fetchCustomers(); }}
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

      {/* Edit Customer Modal */}
      {showEditCustomer && selectedCustomer && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-bold">{t('editModalTitle') || 'Edit Customer'}</h2>
              <button onClick={() => setShowEditCustomer(false)}><X size={20} className="text-slate-400"/></button>
            </div>
            <form onSubmit={handleUpdateCustomer} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold mb-1">{t('nameLabel')} *</label>
                <input required disabled={savingEdit} value={editForm.name} onChange={e=>setEditForm({...editForm, name: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800 disabled:opacity-50" />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">{t('mobileLabel')}</label>
                <input disabled={savingEdit} value={editForm.mobile} onChange={e=>setEditForm({...editForm, mobile: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800 disabled:opacity-50" />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">{t('addressLabel')}</label>
                <input disabled={savingEdit} value={editForm.address} onChange={e=>setEditForm({...editForm, address: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800 disabled:opacity-50" />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">{t('customerTypeLabel')}</label>
                <select
                  disabled={savingEdit}
                  value={editForm.customerType}
                  onChange={e => setEditForm({ ...editForm, customerType: e.target.value })}
                  className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800 disabled:opacity-50"
                >
                  {typeOptions.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-1">{t('creditLimitLabel')}</label>
                  <input disabled={savingEdit} type="number" value={editForm.creditLimit} onChange={e=>setEditForm({...editForm, creditLimit: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800 disabled:opacity-50" />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1">{t('creditDaysLabel')}</label>
                  <input disabled={savingEdit} type="number" value={editForm.creditDays} onChange={e=>setEditForm({...editForm, creditDays: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800 disabled:opacity-50" />
                </div>
              </div>
              <button type="submit" disabled={savingEdit} className="w-full h-10 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {savingEdit ? <Loader2 size={16} className="animate-spin" /> : null}
                {savingEdit ? t('saving') : (t('saveChanges') || 'Save Changes')}
              </button>
            </form>
          </div>
        </div>
      )}

      {rollupMode && (
        <CustomerRollupView
          entityType="customer"
          mode={rollupMode}
          onBack={() => setRollupMode(null)}
          onOpenEntity={(id) => {
            setRollupMode(null);
            const c = customers.find(x => x.id === id);
            if (c) setSelectedCustomer(c);
          }}
        />
      )}
    </div>
  );
}
