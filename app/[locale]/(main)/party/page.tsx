'use client';

import { useState } from 'react';
import { Search, Loader2, Phone, X, Plus, Wallet, MapPin, ReceiptText, Building2, Pencil, Trash2, Users, Truck, ArrowRight, AlertCircle, CheckCircle2, NotebookText, ScanLine, Handshake, Wheat, Landmark, Warehouse, Tag, ShieldCheck } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import PaymentCollectionModal from '@/components/crm/PaymentCollectionModal';
import LedgerView from '@/components/crm/LedgerView';
import CustomerRollupView from '@/components/crm/CustomerRollupView';
import MillParty360Modal from '@/components/crm/MillParty360Modal';
import { ExportButton } from '@/lib/hooks/useExport';
import { generateCollectionRegisterPDF } from '@/lib/pdf/collectionRegister';
import ScanCollectionModal from '@/components/party/ScanCollectionModal';
import AddBillModal from '@/components/party/AddBillModal';
import api from '@/lib/api';
import { stateFromGstin } from '@/lib/indiaStates';
import { useBusinessStore } from '@/lib/businessStore';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { ConfirmPasswordModal } from '@/components/trash/ConfirmPasswordModal';
import { SelectionActionBar } from '@/components/trash/SelectionActionBar';
import { useRowSelection } from '@/lib/hooks/useRowSelection';
import { cn } from '@/lib/utils';

const fetcher = (url: string) => api.get(url, { cache: 'no-store' }).then(res => res.data);

type Party = {
  id: string;
  name: string;
  shopName: string;
  mobile: string;
  email: string;
  gst: string;
  pan?: string;
  notes?: string;
  totalDue: number;
  creditDays: number;
  creditLimit: number;
  address: string;
  createdAt: string;
  documents?: any;
};

/** Money in from Suppliers (what we owe them) — headline-only card here,
 *  full management stays on /suppliers so this page doesn't duplicate it. */
function SupplierCreditCard() {
  const t = useTranslations('Party');
  const { data } = useSWR('/suppliers/ledger', fetcher);
  const summary = data?.summary || { totalRemaining: 0, unpaidCount: 0 };

  return (
    <Link
      href="/suppliers"
      className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-amber-400 dark:hover:border-amber-600 transition-colors"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 shrink-0">
          <Truck size={18} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-black text-slate-500 uppercase tracking-widest">{t('ourSupplierCredit')}</p>
          <p className="text-lg font-black text-slate-900 dark:text-white">
            ₹{Math.round(summary.totalRemaining || 0).toLocaleString('en-IN')}
            {summary.unpaidCount > 0 && (
              <span className="ml-2 text-xs font-bold text-amber-600 dark:text-amber-400 align-middle">{t('suppliersWithDues', { count: summary.unpaidCount })}</span>
            )}
          </p>
        </div>
      </div>
      <ArrowRight size={18} className="text-slate-400 shrink-0" />
    </Link>
  );
}

export default function PartyPage() {
  const t = useTranslations('Party');
  const locale = useLocale();
  // Bada Udyog / Mills adds two new party roles — brokers (earn commission)
  // and transporters (carry goods). Tabs render only when the shop is on
  // millprocessing so the retail/general Udyog UX stays unchanged.
  const [activeTab, setActiveTab] = useState<'parties' | 'customers' | 'brokers' | 'transporters'>('parties');
  const businessType = useBusinessStore(s => s.profile.businessType);
  const isMill = businessType === 'millprocessing';

  const tabBtn = (id: typeof activeTab, icon: React.ReactNode, label: string) => (
    <button
      key={id}
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-colors whitespace-nowrap ${
        activeTab === id
          ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
          : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
      }`}
    >
      {icon} {label}
    </button>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{isMill ? t('millTitle') : t('creditCenterTitle')}</h1>
        <p className="text-slate-500 text-sm font-medium">{isMill ? t('millSubtitle') : t('creditCenterSubtitle')}</p>
      </div>

      <SupplierCreditCard />

      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit overflow-x-auto max-w-full">
        {tabBtn('parties',   <Building2 size={15} />, isMill ? t('millFarmersTab') : t('title'))}
        {tabBtn('customers', <Users size={15} />,     isMill ? t('millTradersTab') : t('customersUdharTab'))}
        {isMill && tabBtn('brokers',      <Handshake size={15} />, locale === 'mr' ? 'दलाल' : locale === 'hi' ? 'दलाल' : 'Brokers')}
        {isMill && tabBtn('transporters', <Truck size={15} />,     locale === 'mr' ? 'वाहतूकदार' : locale === 'hi' ? 'ट्रांसपोर्टर' : 'Transporters')}
      </div>

      {activeTab === 'parties'      && <PartiesPanel />}
      {activeTab === 'customers'    && <CustomersPanel />}
      {activeTab === 'brokers'      && <MillPartyPanel customerType="broker"      label={locale === 'mr' ? 'दलाल' : locale === 'hi' ? 'दलाल' : 'Broker'} icon={<Handshake size={15} />} accent="rose" />}
      {activeTab === 'transporters' && <MillPartyPanel customerType="transporter" label={locale === 'mr' ? 'वाहतूकदार' : locale === 'hi' ? 'ट्रांसपोर्टर' : 'Transporter'} icon={<Truck size={15} />} accent="orange" />}
    </div>
  );
}

/* ─── Mill-only lightweight party panel ─────────────────────────────────
 * Bada Udyog Brokers + Transporters share the same Customer table (with
 * customerType='broker' / 'transporter') but the ledger workflow they need
 * (commission tracking, freight ledger) lives in Sprint 2/3. This panel
 * covers CRUD + contact info + notes so the shopkeeper can start capturing
 * their broker/transporter roster today; billing-side integration lands
 * with the Sales & Purchase mill enhancements. */
function MillPartyPanel({ customerType, label, icon, accent }: {
  customerType: 'broker' | 'transporter';
  label: string;
  icon: React.ReactNode;
  accent: 'rose' | 'orange';
}) {
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const locale = useLocale();
  const { data: rows = [], isLoading, mutate } = useSWR<any[]>(
    activeShopId ? `/crm/customers?type=${customerType}&_shop=${activeShopId}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({
    name: '',
    transporterCode: '',
    mobile: '',
    alternateMobile: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    gst: '',
    pan: '',
    vehicleNumbers: '',
    driverName: '',
    driverMobile: '',
    paymentTerms: customerType === 'transporter' ? 'Per Trip' : 'Immediate',
    openingBalance: '0',
    balanceType: 'payable',
    notes: '',
    brokerType: customerType === 'broker' ? 'grain_purchase' : '',
    // Broker Commission & Banking Details
    commissionType: customerType === 'broker' ? 'per_quintal' : '',
    commissionRate: '',
    commissionApplicableOn: customerType === 'broker' ? 'purchase' : '',
    bankName: '',
    accountHolder: '',
    accountNumber: '',
    ifsc: '',
    upiId: '',
    status: 'active',
  });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const resetForm = () => {
    setForm({
      name: '',
      transporterCode: '',
      mobile: '',
      alternateMobile: '',
      address: '',
      city: '',
      state: '',
      pincode: '',
      gst: '',
      pan: '',
      vehicleNumbers: '',
      driverName: '',
      driverMobile: '',
      paymentTerms: customerType === 'transporter' ? 'Per Trip' : 'Immediate',
      openingBalance: '0',
      balanceType: 'payable',
      notes: '',
      brokerType: customerType === 'broker' ? 'grain_purchase' : '',
      commissionType: customerType === 'broker' ? 'per_quintal' : '',
      commissionRate: '',
      commissionApplicableOn: customerType === 'broker' ? 'purchase' : '',
      bankName: '',
      accountHolder: '',
      accountNumber: '',
      ifsc: '',
      upiId: '',
      status: 'active',
    });
  };

  const openNew = () => {
    setEditing(null);
    resetForm();
    setShowAdd(true);
  };

  const openEdit = (row: any) => {
    setEditing(row);
    const doc = (row.documents && typeof row.documents === 'object' && !Array.isArray(row.documents)) ? row.documents : {};
    setForm({
      name: row.name || '',
      transporterCode: doc.transporterCode || '',
      mobile: row.mobile || '',
      alternateMobile: doc.alternateMobile || '',
      address: row.address || '',
      city: doc.city || '',
      state: doc.state || '',
      pincode: doc.pincode || '',
      gst: row.gst || '',
      pan: row.pan || '',
      vehicleNumbers: doc.vehicleNumbers || '',
      driverName: doc.driverName || '',
      driverMobile: doc.driverMobile || '',
      paymentTerms: doc.paymentTerms || (customerType === 'transporter' ? 'Per Trip' : 'Immediate'),
      openingBalance: String(Math.abs(row.totalDue || 0)),
      balanceType: (row.totalDue || 0) < 0 ? 'payable' : 'receivable',
      notes: row.notes || '',
      brokerType: row.brokerType || doc.brokerType || (customerType === 'broker' ? 'grain_purchase' : ''),
      commissionType: doc.commissionType || (customerType === 'broker' ? 'per_quintal' : ''),
      commissionRate: doc.commissionRate !== undefined && doc.commissionRate !== null ? String(doc.commissionRate) : '',
      commissionApplicableOn: doc.commissionApplicableOn || (customerType === 'broker' ? 'purchase' : ''),
      bankName: doc.bankName || '',
      accountHolder: doc.accountHolder || '',
      accountNumber: doc.accountNumber || '',
      ifsc: doc.ifsc || '',
      upiId: doc.upiId || '',
      status: doc.status || 'active',
    });
    setShowAdd(true);
  };

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/crm/customers/${editing.id}`, { ...form, customerType });
        toast.success(`${label} updated`);
      } else {
        await api.post('/crm/customers', { ...form, customerType });
        toast.success(`${label} added`);
      }
      setShowAdd(false);
      resetForm();
      mutate();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || `Failed to save ${label.toLowerCase()}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row: any) {
    if (!confirm(`Delete ${label.toLowerCase()} "${row.name}"?`)) return;
    try {
      await api.delete(`/crm/customers/${row.id}`);
      toast.success(`${label} deleted`);
      mutate();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || `Failed to delete ${label.toLowerCase()}`);
    }
  }

  const filtered = rows.filter((r: any) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    const doc = (r.documents && typeof r.documents === 'object' && !Array.isArray(r.documents)) ? r.documents : {};
    return (
      (r.name || '').toLowerCase().includes(q) ||
      (r.mobile || '').includes(q) ||
      (doc.vehicleNumbers || '').toLowerCase().includes(q) ||
      (doc.transporterCode || '').toLowerCase().includes(q) ||
      (doc.bankName || '').toLowerCase().includes(q) ||
      (doc.upiId || '').toLowerCase().includes(q)
    );
  });

  const accentClasses = accent === 'rose'
    ? { chip: 'bg-rose-100 text-rose-800 dark:bg-rose-500/10 dark:text-rose-300', btn: 'bg-rose-500 hover:bg-rose-600', ring: 'focus:ring-rose-500' }
    : { chip: 'bg-orange-100 text-orange-800 dark:bg-orange-500/10 dark:text-orange-300', btn: 'bg-orange-500 hover:bg-orange-600', ring: 'focus:ring-orange-500' };

  const getBrokerTypeLabel = (type: string) => {
    switch (type) {
      case 'grain_purchase':
      case 'supplier':
        return locale === 'mr' ? 'धान्य खरेदी दलाल' : locale === 'hi' ? 'अनाज खरीद दलाल' : 'Grain Purchase Broker';
      case 'finished_sales':
      case 'customer':
        return locale === 'mr' ? 'माल विक्री दलाल' : locale === 'hi' ? 'माल बिक्री दलाल' : 'Sales Broker';
      case 'job_work':
        return locale === 'mr' ? 'जॉब वर्क दलाल' : locale === 'hi' ? 'जॉब वर्क दलाल' : 'Job Work Broker';
      case 'transport_logistics':
        return locale === 'mr' ? 'वाहतूक दलाल' : locale === 'hi' ? 'परिवहन दलाल' : 'Transport Broker';
      case 'both':
      case 'general':
      default:
        return locale === 'mr' ? 'सर्वसाधारण दलाल' : locale === 'hi' ? 'सामान्य दलाल' : 'General Broker';
    }
  };

  const getCommissionTypeLabel = (type: string) => {
    switch (type) {
      case 'per_quintal': return locale === 'mr' ? '/ क्विंटल' : locale === 'hi' ? '/ क्विंटल' : '/ Quintal';
      case 'per_ton': return locale === 'mr' ? '/ टन' : locale === 'hi' ? '/ टन' : '/ Ton';
      case 'per_kg': return locale === 'mr' ? '/ किलो' : locale === 'hi' ? '/ किलो' : '/ Kg';
      case 'per_trip': return locale === 'mr' ? '/ ट्रिप' : locale === 'hi' ? '/ ट्रिप' : '/ Trip';
      case 'percentage': return '%';
      case 'fixed': return locale === 'mr' ? '(ठरलेली)' : locale === 'hi' ? '(फिक्स)' : '(Fixed)';
      default: return '';
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={customerType === 'transporter' ? (locale === 'mr' ? 'नाव, मोबाईल, कोड किंवा गाडी नंबरने शोधा...' : 'Search by name, mobile, code or vehicle no...') : (locale === 'mr' ? 'दलालाचे नाव, मोबाईल किंवा कमिशन शोधा...' : 'Search brokers by name or mobile...')}
            className={`w-full pl-9 pr-3 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 ${accentClasses.ring}`}
          />
        </div>
        <button
          onClick={openNew}
          className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm transition-colors ${accentClasses.btn}`}
        >
          <Plus size={15} /> {locale === 'mr' ? `नवीन ${label} जोडा` : locale === 'hi' ? `नया ${label} जोड़ें` : `Add ${label}`}
        </button>
      </div>

      {/* Empty / loading / list */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
          <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
            {icon}
          </div>
          <p className="font-bold text-slate-700 dark:text-slate-300">
            {rows.length === 0 ? `No ${label.toLowerCase()}s yet` : 'No matches'}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {rows.length === 0
              ? `Add your first ${label.toLowerCase()} — ${customerType === 'broker' ? 'they earn commission per deal closed through them.' : 'logistics service provider carrying inbound grain & outward dispatches.'}`
              : 'Try a different search.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((row: any) => {
            const doc = (row.documents && typeof row.documents === 'object' && !Array.isArray(row.documents)) ? row.documents : {};
            const isInactive = doc.status === 'inactive';

            return (
              <div key={row.id} className={cn("p-4 bg-white dark:bg-slate-900 border rounded-xl hover:border-slate-300 dark:hover:border-slate-700 transition-colors shadow-sm", isInactive ? "border-slate-200 dark:border-slate-800 opacity-70" : "border-slate-200 dark:border-slate-800")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-slate-900 dark:text-white truncate">{row.name}</h3>
                      {doc.transporterCode && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold">
                          {doc.transporterCode}
                        </span>
                      )}
                      <span className={`text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full ${accentClasses.chip}`}>
                        {customerType === 'broker' ? getBrokerTypeLabel(row.brokerType || doc.brokerType || 'general') : label}
                      </span>
                      {doc.status && (
                        <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase", isInactive ? "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300")}>
                          {isInactive ? (locale === 'mr' ? 'निष्क्रिय' : 'Inactive') : (locale === 'mr' ? 'सक्रिय' : 'Active')}
                        </span>
                      )}
                    </div>

                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                      {row.mobile && (
                        <a href={`tel:${row.mobile}`} className="flex items-center gap-1 hover:text-emerald-600 font-medium">
                          <Phone size={11} /> {row.mobile}
                        </a>
                      )}
                      {doc.alternateMobile && (
                        <span className="text-slate-400">Alt: {doc.alternateMobile}</span>
                      )}
                    </div>

                    {/* Broker Commission Highlight */}
                    {customerType === 'broker' && (doc.commissionRate || doc.commissionType) && (
                      <div className="mt-2.5 flex items-center gap-2 flex-wrap text-xs bg-rose-50/60 dark:bg-rose-950/20 p-2 rounded-lg border border-rose-100 dark:border-rose-900/30">
                        <span className="font-bold text-rose-700 dark:text-rose-300 font-mono">
                          {locale === 'mr' ? 'कमिशन:' : 'Commission:'} {doc.commissionType === 'percentage' ? `${doc.commissionRate}%` : `₹${doc.commissionRate} ${getCommissionTypeLabel(doc.commissionType)}`}
                        </span>
                        {doc.commissionApplicableOn && (
                          <span className="text-[11px] text-slate-500">
                            ({doc.commissionApplicableOn === 'purchase' ? (locale === 'mr' ? 'खरेदीवर' : 'On Purchases') : doc.commissionApplicableOn === 'sales' ? (locale === 'mr' ? 'विक्रीवर' : 'On Sales') : doc.commissionApplicableOn === 'job_work' ? (locale === 'mr' ? 'जॉब वर्कवर' : 'On Job Work') : (locale === 'mr' ? 'सर्व व्यवहारांवर' : 'All Deals')})
                          </span>
                        )}
                      </div>
                    )}

                    {customerType === 'transporter' && doc.vehicleNumbers && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                        <Truck size={12} className="text-orange-500 shrink-0" />
                        <span className="font-mono font-medium truncate">{doc.vehicleNumbers}</span>
                      </div>
                    )}

                    {customerType === 'transporter' && doc.driverName && (
                      <p className="mt-1 text-xs text-slate-500">
                        Driver: <span className="font-semibold text-slate-700 dark:text-slate-300">{doc.driverName}</span> {doc.driverMobile ? `(${doc.driverMobile})` : ''}
                      </p>
                    )}

                    {row.address && (
                      <p className="mt-1.5 flex items-start gap-1.5 text-xs text-slate-400 line-clamp-2">
                        <MapPin size={11} className="mt-0.5 shrink-0" /> {row.address}
                      </p>
                    )}

                    {/* Bank / UPI snippet */}
                    {(doc.bankName || doc.upiId) && (
                      <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                        {doc.bankName && <span>Bank: <b className="text-slate-700 dark:text-slate-300">{doc.bankName}</b> {doc.accountNumber ? `(..${doc.accountNumber.slice(-4)})` : ''}</span>}
                        {doc.upiId && <span>UPI: <b className="font-mono text-slate-700 dark:text-slate-300">{doc.upiId}</b></span>}
                      </div>
                    )}

                    <div className="mt-2 flex items-center gap-3 text-[11px] font-medium text-slate-500 flex-wrap">
                      {row.gst && <span>GST: <b className="font-mono text-slate-700 dark:text-slate-300">{row.gst}</b></span>}
                      {row.pan && <span>PAN: <b className="font-mono text-slate-700 dark:text-slate-300">{row.pan}</b></span>}
                      {doc.paymentTerms && <span>Terms: <b>{doc.paymentTerms}</b></span>}
                    </div>

                    {row.notes && <p className="mt-2 text-xs text-slate-500 italic line-clamp-2">{row.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openEdit(row)} className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10" title="Edit">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleDelete(row)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10" title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit modal */}
      {showAdd && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800 shrink-0">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                {icon} {editing ? (locale === 'mr' ? `${label} संपादित करा` : locale === 'hi' ? `${label} संपादित करें` : `Edit ${label}`) : (locale === 'mr' ? `नवीन ${label} जोडा` : locale === 'hi' ? `नया ${label} जोड़ें` : `Add ${label}`)}
              </h2>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white"><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    {customerType === 'transporter'
                      ? (locale === 'mr' ? 'वाहतूकदार / एजन्सीचे नाव' : locale === 'hi' ? 'ट्रांसपोर्टर / एजेंसी का नाम' : 'Transporter / Agency Name')
                      : (locale === 'mr' ? 'दलाल / एजंटचे नाव' : locale === 'hi' ? 'दलाल / एजेंट का नाम' : 'Broker / Agent Name')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className={`w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 ${accentClasses.ring}`}
                    placeholder={customerType === 'transporter' ? (locale === 'mr' ? 'उदा. महादेव रोडवेज व लॉजिस्टिक्स' : 'e.g. Mahadev Roadways & Logistics') : (locale === 'mr' ? 'उदा. रमेश दलाल' : 'e.g. Ramesh Dalal')}
                  />
                </div>

                {customerType === 'transporter' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      {locale === 'mr' ? 'वाहतूकदार कोड' : locale === 'hi' ? 'ट्रांसपोर्टर कोड' : 'Transporter Code'}
                    </label>
                    <input
                      value={form.transporterCode} onChange={(e) => setForm({ ...form, transporterCode: e.target.value.toUpperCase() })}
                      className={`w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm font-mono focus:outline-none focus:ring-2 ${accentClasses.ring}`}
                      placeholder="TRP-01"
                    />
                  </div>
                )}

                {customerType === 'broker' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      {locale === 'mr' ? 'दलाली प्रकार' : locale === 'hi' ? 'दलाली प्रकार' : 'Broker Type'} *
                    </label>
                    <select value={form.brokerType} onChange={(e) => setForm({ ...form, brokerType: e.target.value })}
                      className={`w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 ${accentClasses.ring}`}>
                      <option value="grain_purchase">{locale === 'mr' ? 'धान्य / कच्चा माल खरेदी दलाल' : locale === 'hi' ? 'अनाज / कच्चा माल खरीद दलाल' : 'Grain / Purchase Broker'}</option>
                      <option value="finished_sales">{locale === 'mr' ? 'तयार माल विक्री दलाल' : locale === 'hi' ? 'तैयार माल बिक्री दलाल' : 'Finished Goods Sales Broker'}</option>
                      <option value="job_work">{locale === 'mr' ? 'जॉब वर्क दलाल' : locale === 'hi' ? 'जॉब वर्क दलाल' : 'Job Work Broker'}</option>
                      <option value="transport_logistics">{locale === 'mr' ? 'वाहतूक / ट्रान्सपोर्ट दलाल' : locale === 'hi' ? 'परिवहन / ट्रांसपोर्ट दलाल' : 'Transport & Logistics Broker'}</option>
                      <option value="general">{locale === 'mr' ? 'सर्वसाधारण / बहुउद्देशीय दलाल' : locale === 'hi' ? 'सामान्य / बहुउद्देशीय दलाल' : 'General / Multi-trade Broker'}</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    {locale === 'mr' ? 'मोबाईल' : locale === 'hi' ? 'मोबाइल' : 'Mobile'} <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                    className={`w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 ${accentClasses.ring}`}
                    placeholder="+91 98765 43210"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    {locale === 'mr' ? 'पर्यायी मोबाईल' : locale === 'hi' ? 'वैकल्पिक मोबाइल' : 'Alternate Mobile'}
                  </label>
                  <input
                    value={form.alternateMobile} onChange={(e) => setForm({ ...form, alternateMobile: e.target.value })}
                    className={`w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 ${accentClasses.ring}`}
                    placeholder="98230 11223"
                  />
                </div>
              </div>

              {/* Broker Commission Section */}
              {customerType === 'broker' && (
                <div className="p-3.5 bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/30 rounded-2xl space-y-3">
                  <p className="text-xs font-black text-rose-800 dark:text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Handshake size={14} /> {locale === 'mr' ? 'कमिशन रचना (Commission Setup)' : locale === 'hi' ? 'कमीशन सेटअप (Commission Setup)' : 'Commission Setup'}
                  </p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                        {locale === 'mr' ? 'कमिशन प्रकार' : locale === 'hi' ? 'कमीशन प्रकार' : 'Commission Type'} *
                      </label>
                      <select
                        value={form.commissionType}
                        onChange={(e) => setForm({ ...form, commissionType: e.target.value })}
                        className="w-full h-9 px-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-rose-500"
                      >
                        <option value="per_quintal">{locale === 'mr' ? 'प्रति क्विंटल (₹/Qtl)' : 'Per Quintal (₹/Qtl)'}</option>
                        <option value="per_ton">{locale === 'mr' ? 'प्रति टन (₹/Ton)' : 'Per Ton (₹/Ton)'}</option>
                        <option value="per_kg">{locale === 'mr' ? 'प्रति किलो (₹/Kg)' : 'Per Kg (₹/Kg)'}</option>
                        <option value="per_trip">{locale === 'mr' ? 'प्रति ट्रिप / गाडी' : 'Per Trip / Vehicle'}</option>
                        <option value="percentage">{locale === 'mr' ? 'टक्केवारी (%)' : 'Percentage (%)'}</option>
                        <option value="fixed">{locale === 'mr' ? 'ठरलेली रक्कम (₹)' : 'Fixed Amount (₹)'}</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                        {locale === 'mr' ? 'कमिशन दर (Rate)' : locale === 'hi' ? 'कमीशन दर (Rate)' : 'Commission Rate'} *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={form.commissionRate}
                        onChange={(e) => setForm({ ...form, commissionRate: e.target.value })}
                        placeholder={form.commissionType === 'percentage' ? 'e.g. 1.5' : 'e.g. 50'}
                        className="w-full h-9 px-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-rose-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                        {locale === 'mr' ? 'कमिशन लागू (On)' : locale === 'hi' ? 'कमीशन लागू (On)' : 'Applicable On'}
                      </label>
                      <select
                        value={form.commissionApplicableOn}
                        onChange={(e) => setForm({ ...form, commissionApplicableOn: e.target.value })}
                        className="w-full h-9 px-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-rose-500"
                      >
                        <option value="purchase">{locale === 'mr' ? 'खरेदी (Purchase)' : 'Purchase'}</option>
                        <option value="sales">{locale === 'mr' ? 'विक्री (Sales)' : 'Sales'}</option>
                        <option value="job_work">{locale === 'mr' ? 'जॉब वर्क (Job Work)' : 'Job Work'}</option>
                        <option value="transport">{locale === 'mr' ? 'वाहतूक (Transport)' : 'Transport'}</option>
                        <option value="all">{locale === 'mr' ? 'सर्व व्यवहार (All)' : 'All Deals'}</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {customerType === 'transporter' && (
                <div className="p-3 bg-orange-50/60 dark:bg-orange-950/20 border border-orange-200/60 dark:border-orange-900/30 rounded-xl space-y-3">
                  <p className="text-xs font-black text-orange-800 dark:text-orange-400 uppercase tracking-wider">
                    {locale === 'mr' ? 'वाहन व ड्रायव्हर तपशील' : locale === 'hi' ? 'वाहन व ड्राइवर विवरण' : 'Vehicle & Driver Details'}
                  </p>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                      {locale === 'mr' ? 'गाडी क्रमांक (स्वल्पविरामाने वेगळे करा)' : locale === 'hi' ? 'गाड़ी नंबर (कॉमा से अलग करें)' : 'Vehicle Numbers (comma separated)'}
                    </label>
                    <input
                      value={form.vehicleNumbers} onChange={(e) => setForm({ ...form, vehicleNumbers: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-mono"
                      placeholder="MH-12-AB-1234, MH-14-CD-5678"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                        {locale === 'mr' ? 'मुख्य ड्रायव्हरचे नाव' : locale === 'hi' ? 'मुख्य ड्राइवर का नाम' : 'Primary Driver Name'}
                      </label>
                      <input
                        value={form.driverName} onChange={(e) => setForm({ ...form, driverName: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                        placeholder={locale === 'mr' ? 'ड्रायव्हरचे नाव' : 'Driver Name'}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                        {locale === 'mr' ? 'ड्रायव्हर मोबाईल' : locale === 'hi' ? 'ड्राइवर मोबाइल' : 'Driver Mobile'}
                      </label>
                      <input
                        value={form.driverMobile} onChange={(e) => setForm({ ...form, driverMobile: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                        placeholder={locale === 'mr' ? 'ड्रायव्हर मोबाईल' : 'Driver Mobile'}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    {locale === 'mr' ? 'जीएसटी (ऐच्छिक)' : locale === 'hi' ? 'जीएसटी (वैकल्पिक)' : 'GSTIN (Optional)'}
                  </label>
                  <input
                    value={form.gst} onChange={(e) => setForm({ ...form, gst: e.target.value.toUpperCase() })}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm font-mono"
                    placeholder="27AAAAA0000A1Z5"
                    maxLength={15}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    {locale === 'mr' ? 'पॅन (ऐच्छिक)' : locale === 'hi' ? 'पैन (वैकल्पिक)' : 'PAN (Optional)'}
                  </label>
                  <input
                    value={form.pan} onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm font-mono"
                    placeholder="ABCDE1234F"
                    maxLength={10}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  {locale === 'mr' ? 'पत्ता' : locale === 'hi' ? 'पता' : 'Address'}
                </label>
                <input
                  value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className={`w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 ${accentClasses.ring}`}
                  placeholder={locale === 'mr' ? 'रस्ता / परिसर / मार्केट' : 'Street / Area / Market'}
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    {locale === 'mr' ? 'शहर' : locale === 'hi' ? 'शहर' : 'City'}
                  </label>
                  <input
                    value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm"
                    placeholder={locale === 'mr' ? 'शहर' : 'City'}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    {locale === 'mr' ? 'राज्य' : locale === 'hi' ? 'राज्य' : 'State'}
                  </label>
                  <input
                    value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm"
                    placeholder={locale === 'mr' ? 'राज्य' : 'State'}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    {locale === 'mr' ? 'पिनकोड' : locale === 'hi' ? 'पिनकोड' : 'Pincode'}
                  </label>
                  <input
                    value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm"
                    placeholder="413001"
                  />
                </div>
              </div>

              {/* Payment Terms & Opening Balance */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    {locale === 'mr' ? 'पेमेंट अटी' : locale === 'hi' ? 'भुगतान शर्तें' : 'Payment Terms'}
                  </label>
                  <select
                    value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm"
                  >
                    <option value="Per Trip">{locale === 'mr' ? 'प्रति ट्रिप' : locale === 'hi' ? 'प्रति ट्रिप' : 'Per Trip'}</option>
                    <option value="Immediate">{locale === 'mr' ? 'रोख / तातडीने' : locale === 'hi' ? 'नकद / तत्काल' : 'Immediate / Cash'}</option>
                    <option value="Net 7">{locale === 'mr' ? '७ दिवस' : locale === 'hi' ? '७ दिन' : 'Net 7 Days'}</option>
                    <option value="Net 15">{locale === 'mr' ? '१५ दिवस' : locale === 'hi' ? '१५ दिन' : 'Net 15 Days'}</option>
                    <option value="Net 30">{locale === 'mr' ? '३० दिवस' : locale === 'hi' ? '३० दिन' : 'Net 30 Days'}</option>
                    <option value="Advance">{locale === 'mr' ? 'आगाऊ' : locale === 'hi' ? 'अग्रिम' : 'Advance'}</option>
                  </select>
                </div>

                {!editing && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      {locale === 'mr' ? 'सुरुवातीची बाकी' : locale === 'hi' ? 'प्रारंभिक शेष' : 'Opening Balance'}
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        type="number"
                        value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm font-mono"
                        placeholder="0"
                      />
                      <select
                        value={form.balanceType} onChange={(e) => setForm({ ...form, balanceType: e.target.value })}
                        className="px-2 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold shrink-0"
                      >
                        <option value="payable">{locale === 'mr' ? 'देणे' : locale === 'hi' ? 'देय' : 'Payable'}</option>
                        <option value="receivable">{locale === 'mr' ? 'घेणे' : locale === 'hi' ? 'प्राप्य' : 'Receivable'}</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Bank & Payment Details (Optional) */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 rounded-2xl space-y-3">
                <p className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Wallet size={14} /> {locale === 'mr' ? 'बँक व पेमेंट तपशील (Bank & Payment Details - ऐच्छिक)' : locale === 'hi' ? 'बैंक और भुगतान विवरण (ऐच्छिक)' : 'Bank & Payment Details (Optional)'}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-0.5">{locale === 'mr' ? 'बँकेचे नाव' : 'Bank Name'}</label>
                    <input
                      value={form.bankName}
                      onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                      placeholder="e.g. State Bank of India"
                      className="w-full h-8 px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-0.5">{locale === 'mr' ? 'खातेदाराचे नाव' : 'Account Holder'}</label>
                    <input
                      value={form.accountHolder}
                      onChange={(e) => setForm({ ...form, accountHolder: e.target.value })}
                      placeholder="e.g. Ramesh Dalal"
                      className="w-full h-8 px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-0.5">{locale === 'mr' ? 'खाते क्रमांक' : 'Account Number'}</label>
                    <input
                      value={form.accountNumber}
                      onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                      placeholder="e.g. 123456789012"
                      className="w-full h-8 px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-0.5">{locale === 'mr' ? 'IFSC कोड' : 'IFSC Code'}</label>
                    <input
                      value={form.ifsc}
                      onChange={(e) => setForm({ ...form, ifsc: e.target.value.toUpperCase() })}
                      placeholder="SBIN0001234"
                      className="w-full h-8 px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">UPI ID (GPay / PhonePe / Paytm)</label>
                  <input
                    value={form.upiId}
                    onChange={(e) => setForm({ ...form, upiId: e.target.value })}
                    placeholder="e.g. ramesh@okhdfcbank"
                    className="w-full h-8 px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                </div>
              </div>

              {/* Status & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    {locale === 'mr' ? 'स्थिती (Status)' : 'Status'}
                  </label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm font-semibold"
                  >
                    <option value="active">{locale === 'mr' ? 'सक्रिय (Active)' : 'Active'}</option>
                    <option value="inactive">{locale === 'mr' ? 'निष्क्रिय (Inactive)' : 'Inactive'}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    {locale === 'mr' ? 'शेरा / नोट्स' : locale === 'hi' ? 'टिप्पणी / नोट्स' : 'Notes'}
                  </label>
                  <input
                    value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className={`w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 ${accentClasses.ring}`}
                    placeholder={customerType === 'broker' ? (locale === 'mr' ? 'उदा. सोलापूर मार्केट संदर्भ' : 'e.g. Solapur APMC reference') : (locale === 'mr' ? 'उदा. भाडे दर प्रति टन ₹३२०' : 'e.g. Rate per Ton ₹320')}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-300">
                  {locale === 'mr' ? 'रद्द करा' : locale === 'hi' ? 'रद्द करें' : 'Cancel'}
                </button>
                <button type="submit" disabled={saving} className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm transition-colors disabled:opacity-60 ${accentClasses.btn}`}>
                  {saving ? <Loader2 size={15} className="animate-spin inline" /> : (editing ? (locale === 'mr' ? 'बदल जतन करा' : locale === 'hi' ? 'बदलाव सहेजें' : 'Save Changes') : (locale === 'mr' ? `${label} जोडा` : locale === 'hi' ? `${label} जोड़ें` : `Add ${label}`))}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>

  );
}

/* ─── Parties (Udyog B2B wholesale credit) ──────────────────────────────── */

const initialPartyForm = {
  shippingAddress: '',
  name: '',
  shopName: '',
  farmerType: 'Farmer',
  mobile: '',
  alternateMobile: '',
  pan: '',
  gst: '',
  address: '',
  village: '',
  taluka: '',
  district: '',
  state: 'Maharashtra',
  pincode: '',
  openingBalance: '0',
  balanceType: 'payable',
  creditLimit: '0',
  creditDays: '0',
  paymentTerms: 'Immediate',
  defaultGodownId: '',
  bankName: '',
  accountHolder: '',
  accountNumber: '',
  ifsc: '',
  upiId: '',
  status: 'active',
  notes: ''
};

function PartiesPanel() {
  const t = useTranslations('Party');
  const locale = useLocale();
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const profile = useBusinessStore(s => s.profile);
  const isMill = profile?.businessType === 'millprocessing';
  const [search, setSearch] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [generatingRegister, setGeneratingRegister] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);

  const { data: partiesData = [], mutate: mutateParties, isLoading } = useSWR(
    activeShopId ? `/crm/customers?type=party&_shop=${activeShopId}` : null,
    fetcher
  );
  const parties: Party[] = Array.isArray(partiesData) ? partiesData : [];

  const { data: godownsData = [] } = useSWR<any[]>(
    activeShopId && isMill ? `/godowns?_shop=${activeShopId}` : null,
    fetcher
  );
  const godowns: any[] = Array.isArray(godownsData) ? godownsData : [];

  // Just for the "Total Collected" card below — the rollup view itself is
  // the real source of truth for the full payment list, this only needs its summary.
  const { data: paymentsSummary } = useSWR(
    activeShopId ? `/crm/payments-all?entityType=party&_shop=${activeShopId}` : null,
    fetcher
  );
  const [rollupMode, setRollupMode] = useState<'pending' | 'paid' | null>(null);

  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [showAddBill, setShowAddBill] = useState(false);
  const [showNewParty, setShowNewParty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Edit / Delete states
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [deletingParty, setDeletingParty] = useState<Party | null>(null);
  const [confirmBulkDeleteParties, setConfirmBulkDeleteParties] = useState(false);
  const [bulkDeletingParties, setBulkDeletingParties] = useState(false);

  const [form, setForm] = useState(initialPartyForm);

  const handleCreateParty = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await api.post('/crm/customers', { ...form, customerType: 'party' });
      toast.success(isMill ? (locale === 'mr' ? 'शेतकरी खाते यशस्वीरित्या जोडले' : locale === 'hi' ? 'किसान खाता सफलतापूर्वक जोड़ा गया' : 'Farmer account created') : (t('partyCreated') || 'Party added successfully'));
      await mutateParties();
      setShowNewParty(false);
      setForm(initialPartyForm);
    } catch (e) {
      console.error(e);
      toast.error('Failed to add party');
    } finally {
      setIsSaving(false);
    }
  };

  const openEditModal = () => {
    if (!selectedParty) return;
    const docs = (selectedParty.documents && typeof selectedParty.documents === 'object' && !Array.isArray(selectedParty.documents))
      ? (selectedParty.documents as any)
      : {};
    setForm({
      name: selectedParty.name || '',
      shopName: selectedParty.shopName || '',
      farmerType: docs.farmerType || 'Farmer',
      mobile: selectedParty.mobile || '',
      alternateMobile: docs.alternateMobile || '',
      pan: (selectedParty as any).pan || '',
      gst: selectedParty.gst || '',
      address: docs.address || (selectedParty.address || '').split(', गाव:')[0] || '',
      village: docs.village || '',
      taluka: docs.taluka || '',
      district: docs.district || docs.city || '',
      state: docs.state || 'Maharashtra',
      pincode: docs.pincode || '',
      shippingAddress: docs.shippingAddress || '',
      openingBalance: '0',
      balanceType: docs.balanceType || ((selectedParty.totalDue || 0) < 0 ? 'payable' : 'receivable'),
      creditLimit: (selectedParty.creditLimit || 0).toString(),
      creditDays: (selectedParty.creditDays || 0).toString(),
      paymentTerms: docs.paymentTerms || 'Immediate',
      defaultGodownId: docs.defaultGodownId || '',
      bankName: docs.bankName || '',
      accountHolder: docs.accountHolder || '',
      accountNumber: docs.accountNumber || '',
      ifsc: docs.ifsc || '',
      upiId: docs.upiId || '',
      status: docs.status || 'active',
      notes: (selectedParty as any).notes || docs.notes || ''
    });
    setEditingParty(selectedParty);
  };

  const handleEditParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingParty) return;
    setIsEditing(true);
    try {
      await api.put(`/crm/customers/${editingParty.id}`, { ...form, customerType: 'party' });
      toast.success(isMill ? (locale === 'mr' ? 'शेतकरी खाते अपडेट केले' : locale === 'hi' ? 'किसान खाता अपडेट किया' : 'Farmer updated successfully') : 'Party updated successfully');
      await mutateParties();
      setEditingParty(null);
      setSelectedParty(null);
      setForm(initialPartyForm);
    } catch (e) {
      console.error(e);
      toast.error('Failed to update party');
    } finally {
      setIsEditing(false);
    }
  };

  const handleDeleteParty = async () => {
    if (!deletingParty) return;
    try {
      await api.delete(`/crm/customers/${deletingParty.id}`);
      toast.success('Party deleted successfully');
      mutateParties();
      setDeletingParty(null);
      setSelectedParty(null);
    } catch (e) {
      console.error(e);
      toast.error('Failed to delete party');
    }
  };

  const filtered = parties.filter(p => {
    const docs = (p.documents && typeof p.documents === 'object' && !Array.isArray(p.documents)) ? (p.documents as any) : {};
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.shopName && p.shopName.toLowerCase().includes(q)) ||
      (p.mobile && p.mobile.includes(search)) ||
      (docs.village && docs.village.toLowerCase().includes(q)) ||
      (docs.taluka && docs.taluka.toLowerCase().includes(q)) ||
      (docs.district && docs.district.toLowerCase().includes(q))
    );
  });

  const { selectedIds, isAllSelected, toggleOne, toggleAll, clear: clearSelection } = useRowSelection(filtered.map(p => p.id));

  const handleBulkDeleteParties = async () => {
    setBulkDeletingParties(true);
    try {
      const res = await api.delete(`/crm/customers/bulk?ids=${selectedIds.join(',')}`);
      const failed = res.data?.failed || [];
      if (failed.length > 0) {
        toast.error(`${failed.length} ${failed.length === 1 ? 'party' : 'parties'} could not be deleted`);
      } else {
        toast.success('Parties deleted successfully');
      }
      await mutateParties();
      clearSelection();
    } catch (e) {
      console.error(e);
      toast.error('Failed to delete parties');
    } finally {
      setBulkDeletingParties(false);
      setConfirmBulkDeleteParties(false);
    }
  };

  // Collection Register
  const handleDownloadCollectionRegister = async () => {
    const outstanding = filtered.filter(p => (p.totalDue || 0) > 0);
    if (outstanding.length === 0) {
      toast.error('No outstanding parties to collect from');
      return;
    }
    setGeneratingRegister(true);
    try {
      await generateCollectionRegisterPDF({
        shop: {
          name: profile.shopName || 'Vyapar Sarthi',
          address: profile.address || null,
          mobile: profile.mobile || null,
          gst: profile.gst || null,
          pan: profile.pan || null,
        },
        parties: outstanding.map(p => ({
          name: p.name,
          shopName: p.shopName,
          address: p.address,
          totalDue: p.totalDue || 0,
        })),
      });
    } catch (e) {
      console.error(e);
      toast.error('Failed to generate collection register');
    } finally {
      setGeneratingRegister(false);
    }
  };

  // Report export
  const inRange = (createdAt: string) => {
    if (!range.from && !range.to) return true;
    const d = new Date(createdAt).getTime();
    if (range.from && d < new Date(range.from).getTime()) return false;
    if (range.to) {
      const to = new Date(range.to);
      to.setHours(23, 59, 59, 999);
      if (d > to.getTime()) return false;
    }
    return true;
  };
  const exportRows = filtered.filter(p => inRange(p.createdAt));
  const exportColumns = [
    { key: 'shopName', label: isMill ? 'Farm / Business Name' : 'Business Name' },
    { key: 'name', label: isMill ? 'Farmer Name' : 'Owner Name' },
    { key: 'farmerType', label: 'Farmer Type' },
    { key: 'mobile', label: 'Phone' },
    { key: 'village', label: 'Village' },
    { key: 'taluka', label: 'Taluka' },
    { key: 'district', label: 'District' },
    { key: 'address', label: 'Address' },
    { key: 'bankName', label: 'Bank Name' },
    { key: 'accountNumber', label: 'Account No' },
    { key: 'ifsc', label: 'IFSC' },
    { key: 'upiId', label: 'UPI ID' },
    { key: 'creditLimit', label: 'Credit Limit', type: 'currency' as const },
    { key: 'creditDays', label: 'Credit Days', type: 'number' as const },
    { key: 'totalDue', label: 'Remaining Amount', type: 'currency' as const },
    { key: 'status', label: 'Status' },
    { key: 'dateAdded', label: 'Date Added', type: 'date' as const },
  ];
  const exportData = exportRows.map(p => {
    const docs = (p.documents && typeof p.documents === 'object' && !Array.isArray(p.documents)) ? (p.documents as any) : {};
    return {
      shopName: p.shopName || '',
      name: p.name || '',
      farmerType: docs.farmerType || (isMill ? 'Farmer' : ''),
      mobile: p.mobile || '',
      village: docs.village || '',
      taluka: docs.taluka || '',
      district: docs.district || '',
      address: p.address || '',
      bankName: docs.bankName || '',
      accountNumber: docs.accountNumber || '',
      ifsc: docs.ifsc || '',
      upiId: docs.upiId || '',
      creditLimit: p.creditLimit || 0,
      creditDays: p.creditDays || 0,
      totalDue: p.totalDue || 0,
      status: docs.status || ((p.totalDue || 0) > 0 ? 'Due' : 'Settled'),
      dateAdded: p.createdAt,
    };
  });
  const dateRangeLabel = range.from && range.to
    ? `${new Date(range.from).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} – ${new Date(range.to).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`
    : undefined;

  // Render modal form content for Farmer vs Wholesale Party
  const renderFarmerFormFields = () => (
    <div className="space-y-6">
      {/* 1. Basic / Identity */}
      <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700/70 space-y-3">
        <div className="flex items-center gap-2 text-xs font-black uppercase text-amber-700 dark:text-amber-400 tracking-wider">
          <Wheat size={15} />
          {locale === 'mr' ? '१. शेतकरी / पुरवठादार माहिती' : locale === 'hi' ? '१. किसान / आपूर्तिकर्ता जानकारी' : '1. Farmer / Identity Details'}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">
              {locale === 'mr' ? 'शेतकरी / फर्म / व्यवसायाचे नाव *' : locale === 'hi' ? 'किसान / फार्म / व्यापार का नाम *' : 'Farmer / Farm / Business Name *'}
            </label>
            <input
              required
              value={form.shopName}
              onChange={e => setForm({ ...form, shopName: e.target.value })}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 focus:ring-2 focus:ring-amber-500 outline-none"
              placeholder={locale === 'mr' ? 'उदा. ज्ञानेश्वर पाटील फार्म' : locale === 'hi' ? 'उदा. ज्ञानेश्वर किसान / फार्म' : 'e.g. Ramesh Patil Farm'}
            />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">
              {locale === 'mr' ? 'शेतकऱ्याचे / खातेदाराचे नाव *' : locale === 'hi' ? 'किसान / संपर्क व्यक्ति का नाम *' : 'Farmer / Contact Name *'}
            </label>
            <input
              required
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 focus:ring-2 focus:ring-amber-500 outline-none"
              placeholder={locale === 'mr' ? 'उदा. ज्ञानेश्वर विठ्ठल पाटील' : locale === 'hi' ? 'उदा. ज्ञानेश्वर विट्ठल पाटील' : 'e.g. Ramesh Patil'}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">
              {locale === 'mr' ? 'शेतकरी प्रकार' : locale === 'hi' ? 'किसान प्रकार' : 'Farmer Type'}
            </label>
            <select
              value={form.farmerType}
              onChange={e => setForm({ ...form, farmerType: e.target.value })}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 focus:ring-2 focus:ring-amber-500 outline-none"
            >
              <option value="Farmer">{locale === 'mr' ? 'शेतकरी (Farmer)' : locale === 'hi' ? 'किसान (Farmer)' : 'Farmer'}</option>
              <option value="Trader">{locale === 'mr' ? 'व्यापारी (Trader)' : locale === 'hi' ? 'व्यापारी (Trader)' : 'Trader'}</option>
              <option value="Supplier">{locale === 'mr' ? 'पुरवठादार (Supplier)' : locale === 'hi' ? 'आपूर्तिकर्ता (Supplier)' : 'Supplier'}</option>
              <option value="FPO">{locale === 'mr' ? 'FPO / शेतकरी संस्था' : locale === 'hi' ? 'FPO / किसान संस्था' : 'FPO (Farmer Producer Org)'}</option>
              <option value="Other">{locale === 'mr' ? 'इतर (Other)' : locale === 'hi' ? 'अन्य (Other)' : 'Other'}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">
              {locale === 'mr' ? 'मोबाइल क्रमांक *' : locale === 'hi' ? 'मोबाइल नंबर *' : 'Mobile Number *'}
            </label>
            <input
              required
              value={form.mobile}
              onChange={e => setForm({ ...form, mobile: e.target.value })}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 focus:ring-2 focus:ring-amber-500 outline-none"
              placeholder="9876543210"
              maxLength={10}
            />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">
              {locale === 'mr' ? 'पर्यायी मोबाइल' : locale === 'hi' ? 'वैकल्पिक मोबाइल' : 'Alternate Mobile'}
            </label>
            <input
              value={form.alternateMobile}
              onChange={e => setForm({ ...form, alternateMobile: e.target.value })}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 focus:ring-2 focus:ring-amber-500 outline-none"
              placeholder="9876543211"
              maxLength={10}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">
              {locale === 'mr' ? 'पॅन क्रमांक (PAN)' : locale === 'hi' ? 'पैन नंबर (PAN)' : 'PAN Number'}
            </label>
            <input
              value={form.pan}
              onChange={e => setForm({ ...form, pan: e.target.value.toUpperCase() })}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 font-mono focus:ring-2 focus:ring-amber-500 outline-none uppercase"
              placeholder="ABCDE1234F"
              maxLength={10}
            />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">
              {locale === 'mr' ? 'खाते स्थिती (Status)' : locale === 'hi' ? 'खाता स्थिति (Status)' : 'Account Status'}
            </label>
            <select
              value={form.status}
              onChange={e => setForm({ ...form, status: e.target.value })}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 focus:ring-2 focus:ring-amber-500 outline-none font-bold"
            >
              <option value="active">{locale === 'mr' ? 'सक्रिय (Active)' : locale === 'hi' ? 'सक्रिय (Active)' : 'Active'}</option>
              <option value="inactive">{locale === 'mr' ? 'निष्क्रिय (Inactive)' : locale === 'hi' ? 'निष्क्रिय (Inactive)' : 'Inactive'}</option>
            </select>
          </div>
        </div>
      </div>

      {isMill && (
        <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700/70 space-y-2" data-testid="party-gstin-card">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
            {locale === 'mr' ? 'GSTIN (बिलावर छापला जातो)' : locale === 'hi' ? 'GSTIN (बिल पर छपता है)' : 'GSTIN (printed on the bill)'}
          </label>
          <input
            value={form.gst}
            onChange={e => { const g = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15); const st = stateFromGstin(g); setForm({ ...form, gst: g, ...(st ? { state: st } : {}) }); }}
            className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 font-mono focus:ring-2 focus:ring-amber-500 outline-none uppercase"
            placeholder="27ABCDE1234F1Z5" maxLength={15}
          />
          <p className="text-[11px] text-slate-500">{locale === 'mr' ? 'पहिल्या २ अंकांवरून राज्य आपोआप भरले जाते (उदा. 27 = Maharashtra).' : locale === 'hi' ? 'पहले 2 अंकों से राज्य अपने आप भर जाता है (जैसे 27 = Maharashtra).' : 'The state is filled from the first two digits (27 = Maharashtra).'}</p>
        </div>
      )}

      {/* 2. Complete Address */}
      <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700/70 space-y-3">
        <div className="flex items-center gap-2 text-xs font-black uppercase text-indigo-700 dark:text-indigo-400 tracking-wider">
          <MapPin size={15} />
          {locale === 'mr' ? '२. पूर्ण पत्ता व लोकेशन' : locale === 'hi' ? '२. पूरा पता व लोकेशन' : '2. Complete Address Details'}
        </div>
        <div>
          <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">
            {locale === 'mr' ? 'पत्ता / शेताचा पत्ता / वस्ती' : locale === 'hi' ? 'पता / खेत का पता' : 'Street Address / Land / Wasti'}
          </label>
          <input
            value={form.address}
            onChange={e => setForm({ ...form, address: e.target.value })}
            className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 focus:ring-2 focus:ring-indigo-500 outline-none"
            placeholder={locale === 'mr' ? 'उदा. गट क्र. ४५, पाटील वस्ती' : locale === 'hi' ? 'उदा. गट क्र. ४५, पाटील वस्ती' : 'e.g. Gut No 45, Near Hanuman Mandir'}
          />
        </div>
        {isMill && (
          <div data-testid="party-shipping">
            <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">
              {locale === 'mr' ? 'माल पाठवण्याचा पत्ता (Shipped to)' : locale === 'hi' ? 'माल भेजने का पता (Shipped to)' : 'Shipping address (Shipped to)'}
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 mb-1.5">
              <input type="checkbox" checked={!form.shippingAddress} onChange={e => setForm({ ...form, shippingAddress: e.target.checked ? '' : (form.address || ' ') })} />
              {locale === 'mr' ? 'बिलिंग पत्त्यासारखाच' : locale === 'hi' ? 'बिलिंग पते जैसा ही' : 'Same as billing address'}
            </label>
            {form.shippingAddress !== '' && (
              <input
                value={form.shippingAddress.trim() === '' ? '' : form.shippingAddress}
                onChange={e => setForm({ ...form, shippingAddress: e.target.value === '' ? ' ' : e.target.value })}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder={locale === 'mr' ? 'पूर्ण पत्ता जिथे माल पाठवायचा' : 'Full address where the goods are sent'}
              />
            )}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">
              {locale === 'mr' ? 'गाव (Village)' : locale === 'hi' ? 'गांव (Village)' : 'Village'}
            </label>
            <input
              value={form.village}
              onChange={e => setForm({ ...form, village: e.target.value })}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder={locale === 'mr' ? 'उदा. नांदूर' : locale === 'hi' ? 'उदा. नांदूर' : 'e.g. Nandur'}
            />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">
              {locale === 'mr' ? 'तालुका (Taluka)' : locale === 'hi' ? 'तहसील / तालुका (Taluka)' : 'Taluka'}
            </label>
            <input
              value={form.taluka}
              onChange={e => setForm({ ...form, taluka: e.target.value })}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder={locale === 'mr' ? 'उदा. निफाड' : locale === 'hi' ? 'उदा. निफाड' : 'e.g. Niphad'}
            />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">
              {locale === 'mr' ? 'जिल्हा (District)' : locale === 'hi' ? 'जिला (District)' : 'District'}
            </label>
            <input
              value={form.district}
              onChange={e => setForm({ ...form, district: e.target.value })}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder={locale === 'mr' ? 'उदा. नाशिक' : locale === 'hi' ? 'उदा. नाशिक' : 'e.g. Nashik'}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">
              {locale === 'mr' ? 'राज्य (State)' : locale === 'hi' ? 'राज्य (State)' : 'State'}
            </label>
            <input
              value={form.state}
              onChange={e => setForm({ ...form, state: e.target.value })}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="Maharashtra"
            />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">
              {locale === 'mr' ? 'पिनकोड (Pincode)' : locale === 'hi' ? 'पिनकोड (Pincode)' : 'Pincode'}
            </label>
            <input
              value={form.pincode}
              onChange={e => setForm({ ...form, pincode: e.target.value })}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="422303"
              maxLength={6}
            />
          </div>
        </div>
      </div>

      {/* 3. Bank / Payment Details */}
      <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700/70 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-black uppercase text-emerald-700 dark:text-emerald-400 tracking-wider">
            <Landmark size={15} />
            {locale === 'mr' ? '३. बँक व देयक तपशील (खरेदी पेआउट्स)' : locale === 'hi' ? '३. बैंक व भुगतान विवरण' : '3. Bank & Payout Details'}
          </div>
          <span className="text-[10px] text-slate-500 font-bold uppercase">{locale === 'mr' ? 'ऐच्छिक (Optional)' : locale === 'hi' ? 'वैकल्पिक' : 'Optional'}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">
              {locale === 'mr' ? 'खातेदाराचे नाव (Bank Holder Name)' : locale === 'hi' ? 'खाताधारक का नाम (Holder Name)' : 'Bank Account Holder Name'}
            </label>
            <input
              value={form.accountHolder}
              onChange={e => setForm({ ...form, accountHolder: e.target.value })}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 focus:ring-2 focus:ring-emerald-500 outline-none"
              placeholder={locale === 'mr' ? 'उदा. ज्ञानेश्वर विठ्ठल पाटील' : locale === 'hi' ? 'उदा. ज्ञानेश्वर विट्ठल पाटील' : 'e.g. Ramesh Patil'}
            />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">
              {locale === 'mr' ? 'बँकेचे नाव (Bank Name)' : locale === 'hi' ? 'बैंक का नाम (Bank Name)' : 'Bank Name'}
            </label>
            <input
              value={form.bankName}
              onChange={e => setForm({ ...form, bankName: e.target.value })}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 focus:ring-2 focus:ring-emerald-500 outline-none"
              placeholder={locale === 'mr' ? 'उदा. SBI / बँक ऑफ महाराष्ट्र' : locale === 'hi' ? 'उदा. SBI / HDFC' : 'e.g. State Bank of India'}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">
              {locale === 'mr' ? 'खाते क्रमांक (Account No)' : locale === 'hi' ? 'खाता संख्या (Account No)' : 'Account Number'}
            </label>
            <input
              value={form.accountNumber}
              onChange={e => setForm({ ...form, accountNumber: e.target.value })}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
              placeholder="123456789012"
            />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">
              {locale === 'mr' ? 'IFSC कोड' : locale === 'hi' ? 'IFSC कोड' : 'IFSC Code'}
            </label>
            <input
              value={form.ifsc}
              onChange={e => setForm({ ...form, ifsc: e.target.value.toUpperCase() })}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 font-mono focus:ring-2 focus:ring-emerald-500 outline-none uppercase"
              placeholder="SBIN0001234"
              maxLength={11}
            />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">
              {locale === 'mr' ? 'UPI ID' : locale === 'hi' ? 'UPI ID' : 'UPI ID'}
            </label>
            <input
              value={form.upiId}
              onChange={e => setForm({ ...form, upiId: e.target.value })}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
              placeholder="9876543210@upi"
            />
          </div>
        </div>
      </div>

      {/* 4. Account & Purchase Information */}
      <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700/70 space-y-3">
        <div className="flex items-center gap-2 text-xs font-black uppercase text-blue-700 dark:text-blue-400 tracking-wider">
          <ReceiptText size={15} />
          {locale === 'mr' ? '४. खाते व खरेदी अटी' : locale === 'hi' ? '४. खाता व खरीद शर्तें' : '4. Account & Purchase Terms'}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">
              {locale === 'mr' ? 'आरंभीची शिल्लक (Opening Balance)' : locale === 'hi' ? 'शुरुआती शेष (Opening Balance)' : 'Opening Balance'}
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.openingBalance}
                onChange={e => setForm({ ...form, openingBalance: e.target.value })}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                placeholder="0"
              />
              <select
                value={form.balanceType}
                onChange={e => setForm({ ...form, balanceType: e.target.value })}
                className="h-10 px-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold bg-white dark:bg-slate-950 focus:ring-2 focus:ring-blue-500 outline-none shrink-0"
              >
                <option value="payable">{locale === 'mr' ? 'देणे (Payable)' : locale === 'hi' ? 'देना है (Payable)' : 'Payable'}</option>
                <option value="receivable">{locale === 'mr' ? 'येणे (Receivable)' : locale === 'hi' ? 'लेना है (Receivable)' : 'Receivable'}</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">
              {locale === 'mr' ? 'डिफॉल्ट गोडावून (Default Godown)' : locale === 'hi' ? 'डिफ़ॉल्ट गोदाम (Default Godown)' : 'Default Godown'}
            </label>
            <select
              value={form.defaultGodownId}
              onChange={e => setForm({ ...form, defaultGodownId: e.target.value })}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">{locale === 'mr' ? '-- गोडावून निवडा --' : locale === 'hi' ? '-- गोदाम चुनें --' : '-- Select Default Godown --'}</option>
              {godowns.map(g => (
                <option key={g.id} value={g.id}>{g.name} {g.location ? `(${g.location})` : ''}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">
              {locale === 'mr' ? 'क्रेडिट मर्यादा (₹)' : locale === 'hi' ? 'क्रेडिट सीमा (₹)' : 'Credit Limit (₹)'}
            </label>
            <input
              type="number"
              min="0"
              value={form.creditLimit}
              onChange={e => setForm({ ...form, creditLimit: e.target.value })}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">
              {locale === 'mr' ? 'उधारीचे दिवस' : locale === 'hi' ? 'उधार के दिन' : 'Credit Days'}
            </label>
            <input
              type="number"
              min="0"
              value={form.creditDays}
              onChange={e => setForm({ ...form, creditDays: e.target.value })}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">
              {locale === 'mr' ? 'खरेदी देयक अटी' : locale === 'hi' ? 'भुगतान शर्तें' : 'Default Payment Terms'}
            </label>
            <select
              value={form.paymentTerms}
              onChange={e => setForm({ ...form, paymentTerms: e.target.value })}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="Immediate">{locale === 'mr' ? 'तात्काळ / रोख (Immediate)' : locale === 'hi' ? 'तुरंत / नकद' : 'Immediate / Cash'}</option>
              <option value="Net 7">{locale === 'mr' ? '७ दिवस (Net 7 Days)' : locale === 'hi' ? '७ दिन' : 'Net 7 Days'}</option>
              <option value="Net 15">{locale === 'mr' ? '१५ दिवस (Net 15 Days)' : locale === 'hi' ? '१५ दिन' : 'Net 15 Days'}</option>
              <option value="Net 30">{locale === 'mr' ? '३० दिवस (Net 30 Days)' : locale === 'hi' ? '३० दिन' : 'Net 30 Days'}</option>
              <option value="On Delivery">{locale === 'mr' ? 'माल पोहोचल्यावर (On Delivery)' : locale === 'hi' ? 'माल डिलीवरी पर' : 'On Delivery'}</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">
            {locale === 'mr' ? 'नोंदी / विशेष सूचना (Notes)' : locale === 'hi' ? 'नोट्स / विशेष निर्देश' : 'Notes'}
          </label>
          <textarea
            rows={2}
            value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })}
            className="w-full p-2.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder={locale === 'mr' ? 'उदा. माल थेट ट्रॅक्टरने आणतात, वजनकाटा पावती अनिवार्य...' : locale === 'hi' ? 'उदा. विशेष निर्देश...' : 'e.g. Delivered by tractor, weighbridge slip required...'}
          />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 max-w-md">
        <button
          onClick={() => setRollupMode('pending')}
          className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 border-b-4 border-b-orange-500/40 rounded-2xl p-4 hover:shadow-md hover:-translate-y-0.5 transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('totalOutstanding') || 'Total Outstanding'}</p>
            <AlertCircle size={16} className="text-orange-500" />
          </div>
          <p className="text-xl font-black text-orange-600 dark:text-orange-400">
            ₹{Math.round(filtered.reduce((s, p) => s + (p.totalDue || 0), 0)).toLocaleString('en-IN')}
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

      <div className="flex flex-col md:flex-row md:items-center justify-end gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('fromDate') || 'From'}</span>
          <input
            type="date"
            value={range.from}
            onChange={e => setRange(r => ({ ...r, from: e.target.value }))}
            className="text-xs bg-transparent outline-none text-slate-700 dark:text-slate-200 w-[110px]"
          />
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('toDate') || 'Upto'}</span>
          <input
            type="date"
            value={range.to}
            onChange={e => setRange(r => ({ ...r, to: e.target.value }))}
            className="text-xs bg-transparent outline-none text-slate-700 dark:text-slate-200 w-[110px]"
          />
          {(range.from || range.to) && (
            <button
              type="button"
              onClick={() => setRange({ from: '', to: '' })}
              className="text-slate-400 hover:text-red-500 transition-colors"
              title={t('clearDateFilter') || 'Clear date filter'}
            >
              <X size={13} />
            </button>
          )}
        </div>
        <ExportButton
          filename={isMill ? "farmers-accounts" : "wholesale-parties"}
          title={isMill ? (locale === 'mr' ? 'शेतकरी / पुरवठादार यादी' : 'Farmers & Suppliers List') : (t('title') || 'Wholesale Parties')}
          dateRange={dateRangeLabel}
          summary={[
            { label: isMill ? 'Total Farmers' : 'Total Parties', value: String(exportData.length) },
            { label: 'Total Remaining', value: `₹${exportData.reduce((s, r) => s + (r.totalDue || 0), 0).toLocaleString('en-IN')}`, tone: 'negative' },
          ]}
          columns={exportColumns}
          data={exportData}
        />
        <button
          onClick={handleDownloadCollectionRegister}
          disabled={generatingRegister}
          title="Printable route sheet for today's collection round — outstanding parties only, Party / Amt / Cash / Chq / Dis, grouped by area"
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-indigo-400 dark:hover:border-indigo-600 hover:text-indigo-600 dark:hover:text-indigo-400 px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors disabled:opacity-60"
        >
          {generatingRegister ? <Loader2 size={18} className="animate-spin" /> : <NotebookText size={18} />}
          Collection Register
        </button>
        <button
          onClick={() => setShowScanModal(true)}
          title="Photograph your collection round notebook — AI reads each party's Cash/Chq and lets you apply them as payments"
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-indigo-400 dark:hover:border-indigo-600 hover:text-indigo-600 dark:hover:text-indigo-400 px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors"
        >
          <ScanLine size={18} />
          Scan Collection Sheet
        </button>
        <button
          onClick={() => { setForm(initialPartyForm); setShowNewParty(true); }}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-sm"
        >
          <Plus size={18} /> {isMill ? (locale === 'mr' ? 'नवीन शेतकरी जोडा' : locale === 'hi' ? 'नया किसान जोड़ें' : 'Add Farmer') : t('addParty')}
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-4">
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder={isMill ? (locale === 'mr' ? 'शेतकऱ्याचे नाव, गाव, तालुका किंवा मोबाइलने शोधा...' : locale === 'hi' ? 'किसान का नाम, गांव, तालुका या मोबाइल से खोजें...' : 'Search by farmer name, village, taluka or mobile...') : t('searchPlaceholder')}
            className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <SelectionActionBar
          count={selectedIds.length}
          itemLabel={isMill ? 'farmer' : 'party'}
          onDelete={() => setConfirmBulkDeleteParties(true)}
          onClear={clearSelection}
          disabled={bulkDeletingParties}
        />

        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          </div>
        ) : (
          <>
            {filtered.length > 0 && (
              <label className="flex items-center gap-2 mb-3 px-1 w-fit cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={toggleAll}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Select All</span>
              </label>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(p => {
                const isDue = (p.totalDue || 0) > 0;
                const isAdvance = (p.totalDue || 0) < 0;
                const docs = (p.documents && typeof p.documents === 'object' && !Array.isArray(p.documents)) ? (p.documents as any) : {};
                const farmerType = docs.farmerType || (isMill ? 'Farmer' : null);
                const village = docs.village || '';
                const taluka = docs.taluka || '';
                const hasBank = !!(docs.accountNumber || docs.upiId);
                const isInactive = docs.status === 'inactive';

                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedParty(p)}
                    className="flex flex-col justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-500 cursor-pointer transition-all bg-slate-50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800 group shadow-sm hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(p.id)}
                          onChange={() => toggleOne(p.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer mt-1 shrink-0"
                        />
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center font-bold shrink-0 shadow-sm",
                          isMill ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" : "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600"
                        )}>
                          {isMill ? <Wheat size={18} /> : <Building2 size={18} />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h3 className="font-bold text-slate-900 dark:text-white text-sm truncate">{p.shopName || p.name}</h3>
                            {isMill && farmerType && (
                              <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200/50 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/30">
                                {farmerType}
                              </span>
                            )}
                            {isInactive && (
                              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                Inactive
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 truncate flex items-center gap-1 mt-0.5">
                            <span className="font-medium text-slate-700 dark:text-slate-300">{p.name}</span>
                            <span>•</span>
                            <Phone size={10} />
                            <span>{p.mobile || t('noNumber')}</span>
                          </p>
                          {(village || taluka) && (
                            <p className="text-[11px] text-slate-500 truncate flex items-center gap-1 mt-0.5">
                              <MapPin size={10} className="text-slate-400 shrink-0" />
                              <span>{village}{village && taluka ? `, ${taluka}` : taluka}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        {isDue ? (
                          <span className="text-xs font-bold text-red-600 bg-red-50 dark:bg-red-950/30 px-2 py-0.5 rounded-md block">
                            Due: ₹{p.totalDue.toLocaleString()}
                          </span>
                        ) : isAdvance ? (
                          <span className="text-xs font-bold text-blue-600 bg-blue-50 dark:bg-blue-950/30 px-2 py-0.5 rounded-md block">
                            Adv: ₹{Math.abs(p.totalDue).toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-md block">
                            {t('settled')}
                          </span>
                        )}
                        {hasBank && (
                          <span className="text-[9px] font-bold text-emerald-700 dark:text-emerald-400 mt-1 inline-flex items-center gap-0.5">
                            <Landmark size={9} /> Bank
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {filtered.length === 0 && (
                <div className="col-span-full py-12 text-center text-slate-500">
                  {t('noPartiesFound', { search })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Party Panel / Mill 360 View */}
      {selectedParty && isMill && (
        <MillParty360Modal
          partyId={selectedParty.id}
          onClose={() => setSelectedParty(null)}
          onUpdated={() => mutateParties()}
        />
      )}

      {selectedParty && !isMill && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-slate-50 dark:bg-slate-900 w-full sm:max-w-2xl rounded-none sm:rounded-2xl shadow-xl flex flex-col h-[100dvh] sm:h-auto sm:max-h-[90vh] animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95">

            <div className="p-4 sm:p-6 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sm:rounded-t-2xl flex items-start justify-between">
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
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => setShowAddBill(true)}
                    className="text-xs font-bold bg-white dark:bg-slate-800 border border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-400 px-3 py-1.5 rounded-lg flex items-center justify-center gap-1 hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors"
                  >
                    <ReceiptText size={14} /> Add Bill
                  </button>
                  {selectedParty.totalDue > 0 && (
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
              <LedgerView entityId={selectedParty.id} entityType="party" entityName={selectedParty.shopName || selectedParty.name} onLedgerChanged={() => mutateParties()} />
            </div>
          </div>
        </div>
      )}

      {showPayment && selectedParty && (
        <PaymentCollectionModal
          entityId={selectedParty.id}
          entityType="party"
          entityName={selectedParty.shopName || selectedParty.name}
          entityMobile={selectedParty.mobile}
          outstanding={selectedParty.totalDue}
          onClose={() => { setShowPayment(false); setSelectedParty(null); }}
          onSuccess={() => mutateParties()}
        />
      )}

      {showAddBill && selectedParty && (
        <AddBillModal
          partyId={selectedParty.id}
          partyDocuments={selectedParty.documents || []}
          onClose={() => setShowAddBill(false)}
          onSaved={() => { setShowAddBill(false); setSelectedParty(null); mutateParties(); }}
        />
      )}

      {/* New Party / Farmer Modal */}
      {showNewParty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className={cn(
            "bg-white dark:bg-slate-900 w-full rounded-2xl shadow-xl flex flex-col overflow-hidden max-h-[92vh]",
            isMill ? "max-w-2xl" : "max-w-md"
          )}>
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800">
              <h2 className="text-lg font-bold flex items-center gap-2">
                {isMill ? <Wheat size={18} className="text-amber-600" /> : <Building2 size={18} className="text-indigo-600" />}
                {isMill ? (locale === 'mr' ? 'नवीन शेतकरी / पुरवठादार खाते' : locale === 'hi' ? 'नया किसान / आपूर्तिकर्ता खाता' : 'Add Farmer / Supplier Account') : t('addWholesaleParty')}
              </h2>
              <button onClick={() => setShowNewParty(false)}><X size={20} className="text-slate-400 hover:text-slate-700 transition-colors"/></button>
            </div>
            <div className="overflow-y-auto">
              <form onSubmit={handleCreateParty} className="p-6 space-y-4">
                {isMill ? (
                  renderFarmerFormFields()
                ) : (
                  <>
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
                  </>
                )}
                <button type="submit" disabled={isSaving} className="w-full h-12 mt-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-70 flex items-center justify-center gap-2 transition-colors shadow-sm">
                  {isSaving ? <Loader2 size={20} className="animate-spin" /> : (isMill ? (locale === 'mr' ? 'शेतकरी खाते जतन करा' : locale === 'hi' ? 'किसान खाता सहेजें' : 'Save Farmer Account') : t('saveParty'))}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {showScanModal && (
        <ScanCollectionModal
          onClose={() => setShowScanModal(false)}
          onApplied={() => mutateParties()}
        />
      )}

      {/* Edit Party / Farmer Modal */}
      {editingParty && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className={cn(
            "bg-white dark:bg-slate-900 w-full rounded-2xl shadow-xl flex flex-col overflow-hidden max-h-[92vh]",
            isMill ? "max-w-2xl" : "max-w-md"
          )}>
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Pencil size={18} className={isMill ? "text-amber-500" : "text-indigo-500"} />
                {isMill ? (locale === 'mr' ? 'शेतकरी खाते संपादित करा' : locale === 'hi' ? 'किसान खाता संपादित करें' : 'Edit Farmer Account') : 'Edit Party'}
              </h2>
              <button onClick={() => { setEditingParty(null); setForm(initialPartyForm); }}><X size={20} className="text-slate-400 hover:text-slate-700 transition-colors"/></button>
            </div>
            <div className="overflow-y-auto">
              <form onSubmit={handleEditParty} className="p-6 space-y-4">
                {isMill ? (
                  renderFarmerFormFields()
                ) : (
                  <>
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
                  </>
                )}
                <button type="submit" disabled={isEditing} className="w-full h-12 mt-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-70 flex items-center justify-center gap-2 transition-colors shadow-sm">
                  {isEditing ? <Loader2 size={20} className="animate-spin" /> : (isMill ? (locale === 'mr' ? 'बदल जतन करा' : locale === 'hi' ? 'परिवर्तन सहेजें' : 'Save Changes') : 'Save Changes')}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation (single) */}
      <ConfirmPasswordModal
        open={!!deletingParty}
        itemLabel="party"
        onConfirm={handleDeleteParty}
        onCancel={() => setDeletingParty(null)}
      />

      {/* Delete Confirmation (bulk) */}
      <ConfirmPasswordModal
        open={confirmBulkDeleteParties}
        itemLabel="party"
        itemCount={selectedIds.length}
        onConfirm={handleBulkDeleteParties}
        onCancel={() => setConfirmBulkDeleteParties(false)}
      />

      {rollupMode && (
        <CustomerRollupView
          entityType="party"
          mode={rollupMode}
          onBack={() => setRollupMode(null)}
          onOpenEntity={(id) => {
            setRollupMode(null);
            const p = parties.find(x => x.id === id);
            if (p) setSelectedParty(p);
          }}
        />
      )}
    </div>
  );
}

/* ─── Customers / Udhar (Udyog retail counter-sale credit) ─────────────────
   Same Customer model as Parties (customerType='customer' instead of
   'party') — this is the UI surface that was missing for the retail Udhar
   debt WholesaleBillingUI's Retail-pricing-mode checkout already creates:
   before this tab, a Udyog shop had no way to even see, let alone collect
   payment on, those customers. */

type UdharCustomer = {
  id: string;
  name: string;
  mobile: string;
  email: string;
  totalDue: number;
  creditDays: number;
  creditLimit: number;
  address: string;
  createdAt: string;
};

function CustomersPanel() {
  const t = useTranslations('Party');
  const locale = useLocale();
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const [search, setSearch] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });

  const { data: customersData = [], mutate: mutateCustomers, isLoading } = useSWR(
    activeShopId ? `/crm/customers?type=customer&_shop=${activeShopId}` : null,
    fetcher
  );
  const customers: UdharCustomer[] = Array.isArray(customersData) ? customersData : [];
  const { data: paymentsSummary } = useSWR(
    activeShopId ? `/crm/payments-all?entityType=customer&_shop=${activeShopId}` : null,
    fetcher
  );
  const [rollupMode, setRollupMode] = useState<'pending' | 'paid' | null>(null);

  const [selectedCustomer, setSelectedCustomer] = useState<UdharCustomer | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // Collection features ported from the Wholesale Parties tab so retail
  // Udhar shopkeepers get the same "collect from N customers in a round"
  // workflow — printable register PDF, AI-scanned handwritten sheet, and
  // per-customer Add Bill for manual paper-bill entry.
  const [showAddBill, setShowAddBill] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [generatingRegister, setGeneratingRegister] = useState(false);
  const profile = useBusinessStore(s => s.profile);
  const isMill = profile?.businessType === 'millprocessing';

  const [editingCustomer, setEditingCustomer] = useState<UdharCustomer | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [deletingCustomer, setDeletingCustomer] = useState<UdharCustomer | null>(null);
  const [confirmBulkDeleteCustomers, setConfirmBulkDeleteCustomers] = useState(false);
  const [bulkDeletingCustomers, setBulkDeletingCustomers] = useState(false);

  const [form, setForm] = useState({
    name: '',
    partyType: 'Customer',
    mobile: '',
    alternateMobile: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    gst: '',
    pan: '',
    openingBalance: '',
    balanceType: 'receivable',
    creditLimit: '0',
    creditDays: '0',
    paymentTerms: 'Immediate',
    notes: '',
  });

  const resetForm = () => setForm({
    name: '',
    partyType: 'Customer',
    mobile: '',
    alternateMobile: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    gst: '',
    pan: '',
    openingBalance: '',
    balanceType: 'receivable',
    creditLimit: '0',
    creditDays: '0',
    paymentTerms: 'Immediate',
    notes: '',
  });

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await api.post('/crm/customers', { ...form, customerType: 'customer' });
      toast.success(t('customerCreated') || 'Customer / Party added successfully');
      await mutateCustomers();
      setShowNewCustomer(false);
      resetForm();
    } catch (e) {
      console.error(e);
      toast.error('Failed to add customer / party');
    } finally {
      setIsSaving(false);
    }
  };

  const openEditModal = () => {
    if (!selectedCustomer) return;
    const doc = ((selectedCustomer as any).documents && typeof (selectedCustomer as any).documents === 'object') ? (selectedCustomer as any).documents : {};
    setForm({
      name: selectedCustomer.name,
      partyType: doc.partyType || 'Customer',
      mobile: selectedCustomer.mobile || '',
      alternateMobile: doc.alternateMobile || '',
      address: selectedCustomer.address || '',
      city: doc.city || '',
      state: doc.state || '',
      pincode: doc.pincode || '',
      gst: (selectedCustomer as any).gst || '',
      pan: (selectedCustomer as any).pan || '',
      creditLimit: (selectedCustomer.creditLimit || 0).toString(),
      creditDays: (selectedCustomer.creditDays || 0).toString(),
      paymentTerms: doc.paymentTerms || 'Immediate',
      openingBalance: String(Math.abs(selectedCustomer.totalDue || 0)),
      balanceType: (selectedCustomer.totalDue || 0) < 0 ? 'payable' : 'receivable',
      notes: (selectedCustomer as any).notes || '',
    });
    setEditingCustomer(selectedCustomer);
  };

  const handleEditCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;
    setIsEditing(true);
    try {
      await api.put(`/crm/customers/${editingCustomer.id}`, { ...form, customerType: 'customer' });
      toast.success('Customer / Party updated successfully');
      await mutateCustomers();
      setEditingCustomer(null);
      setSelectedCustomer(null);
      resetForm();
    } catch (e) {
      console.error(e);
      toast.error('Failed to update customer / party');
    } finally {
      setIsEditing(false);
    }
  };

  const handleDeleteCustomer = async () => {
    if (!deletingCustomer) return;
    try {
      await api.delete(`/crm/customers/${deletingCustomer.id}`);
      toast.success('Customer deleted successfully');
      mutateCustomers();
      setDeletingCustomer(null);
      setSelectedCustomer(null);
    } catch (e) {
      console.error(e);
      toast.error('Failed to delete customer');
    }
  };

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.mobile && c.mobile.includes(search))
  );

  const { selectedIds, isAllSelected, toggleOne, toggleAll, clear: clearSelection } = useRowSelection(filtered.map(c => c.id));

  // Ported from the wholesale Parties tab — printable collection round
  // sheet, outstanding customers only, same generator + PDF layout.
  const handleDownloadCollectionRegister = async () => {
    const outstanding = filtered.filter(c => (c.totalDue || 0) > 0);
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
          address: c.address || null,
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

  const handleBulkDeleteCustomers = async () => {
    setBulkDeletingCustomers(true);
    try {
      const res = await api.delete(`/crm/customers/bulk?ids=${selectedIds.join(',')}`);
      const failed = res.data?.failed || [];
      if (failed.length > 0) {
        toast.error(`${failed.length} customer${failed.length === 1 ? '' : 's'} could not be deleted`);
      } else {
        toast.success('Customers deleted successfully');
      }
      await mutateCustomers();
      clearSelection();
    } catch (e) {
      console.error(e);
      toast.error('Failed to delete customers');
    } finally {
      setBulkDeletingCustomers(false);
      setConfirmBulkDeleteCustomers(false);
    }
  };

  // Report export: same search-filtered set shown on screen, further narrowed
  // by an optional date-added range — doesn't affect the always-visible card
  // list above, only what goes into the generated document.
  const inRange = (createdAt: string) => {
    if (!range.from && !range.to) return true;
    const d = new Date(createdAt).getTime();
    if (range.from && d < new Date(range.from).getTime()) return false;
    if (range.to) {
      const to = new Date(range.to);
      to.setHours(23, 59, 59, 999);
      if (d > to.getTime()) return false;
    }
    return true;
  };
  const exportRows = filtered.filter(c => inRange(c.createdAt));
  const exportColumns = [
    { key: 'name', label: 'Customer Name' },
    { key: 'mobile', label: 'Phone' },
    { key: 'address', label: 'Address' },
    { key: 'totalDue', label: 'Remaining Amount', type: 'currency' as const },
    { key: 'status', label: 'Status' },
    { key: 'dateAdded', label: 'Date Added', type: 'date' as const },
  ];
  const exportData = exportRows.map(c => ({
    name: c.name || '',
    mobile: c.mobile || '',
    address: c.address || '',
    totalDue: c.totalDue || 0,
    status: (c.totalDue || 0) > 0 ? 'Due' : 'Settled',
    dateAdded: c.createdAt,
  }));
  const dateRangeLabel = range.from && range.to
    ? `${new Date(range.from).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} – ${new Date(range.to).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`
    : undefined;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 max-w-md">
        <button
          onClick={() => setRollupMode('pending')}
          className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 border-b-4 border-b-orange-500/40 rounded-2xl p-4 hover:shadow-md hover:-translate-y-0.5 transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('totalOutstanding') || 'Total Outstanding'}</p>
            <AlertCircle size={16} className="text-orange-500" />
          </div>
          <p className="text-xl font-black text-orange-600 dark:text-orange-400">
            ₹{Math.round(filtered.reduce((s, c) => s + (c.totalDue || 0), 0)).toLocaleString('en-IN')}
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

      <div className="flex flex-col md:flex-row md:items-center justify-end gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('fromDate') || 'From'}</span>
          <input
            type="date"
            value={range.from}
            onChange={e => setRange(r => ({ ...r, from: e.target.value }))}
            className="text-xs bg-transparent outline-none text-slate-700 dark:text-slate-200 w-[110px]"
          />
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('toDate') || 'Upto'}</span>
          <input
            type="date"
            value={range.to}
            onChange={e => setRange(r => ({ ...r, to: e.target.value }))}
            className="text-xs bg-transparent outline-none text-slate-700 dark:text-slate-200 w-[110px]"
          />
          {(range.from || range.to) && (
            <button
              type="button"
              onClick={() => setRange({ from: '', to: '' })}
              className="text-slate-400 hover:text-red-500 transition-colors"
              title={t('clearDateFilter') || 'Clear date filter'}
            >
              <X size={13} />
            </button>
          )}
        </div>
        <ExportButton
          filename="udhar-customers"
          title={t('customersUdharTab') || 'Customers / Udhar'}
          dateRange={dateRangeLabel}
          summary={[
            { label: 'Total Customers', value: String(exportData.length) },
            { label: 'Total Remaining', value: `₹${exportData.reduce((s, r) => s + (r.totalDue || 0), 0).toLocaleString('en-IN')}`, tone: 'negative' },
          ]}
          columns={exportColumns}
          data={exportData}
        />
        <button
          onClick={handleDownloadCollectionRegister}
          disabled={generatingRegister}
          title="Printable route sheet for today's collection round — outstanding customers only"
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-indigo-400 dark:hover:border-indigo-600 hover:text-indigo-600 dark:hover:text-indigo-400 px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors disabled:opacity-60"
        >
          {generatingRegister ? <Loader2 size={18} className="animate-spin" /> : <NotebookText size={18} />}
          Collection Register
        </button>
        <button
          onClick={() => setShowScanModal(true)}
          title="Photograph your collection round notebook — AI reads each customer's Cash/Chq and lets you apply them as payments"
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-indigo-400 dark:hover:border-indigo-600 hover:text-indigo-600 dark:hover:text-indigo-400 px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors"
        >
          <ScanLine size={18} />
          Scan Collection Sheet
        </button>
        <button
          onClick={() => setShowNewCustomer(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors"
        >
          <Plus size={18} /> {t('addCustomerBtn')}
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-4">
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder={t('searchCustomerPlaceholder')}
            className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <SelectionActionBar
          count={selectedIds.length}
          itemLabel="customer"
          onDelete={() => setConfirmBulkDeleteCustomers(true)}
          onClear={clearSelection}
          disabled={bulkDeletingCustomers}
        />

        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          </div>
        ) : (
          <>
            {filtered.length > 0 && (
              <label className="flex items-center gap-2 mb-3 px-1 w-fit cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={toggleAll}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Select All</span>
              </label>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(c => (
                <div
                  key={c.id}
                  onClick={() => setSelectedCustomer(c)}
                  className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-500 cursor-pointer transition-colors bg-slate-50 dark:bg-slate-800/50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(c.id)}
                      onChange={() => toggleOne(c.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer shrink-0"
                    />
                    <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 font-bold shrink-0">
                      <Users size={18} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-900 dark:text-white text-sm truncate">{c.name}</h3>
                      <p className="text-xs text-slate-500 truncate flex items-center gap-1">
                        <Phone size={10} /> {c.mobile || t('noNumber')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
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
                  {t('noCustomersFound', { search })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Customer Panel / Mill 360 View */}
      {selectedCustomer && isMill && (
        <MillParty360Modal
          partyId={selectedCustomer.id}
          onClose={() => setSelectedCustomer(null)}
          onUpdated={() => mutateCustomers()}
        />
      )}

      {selectedCustomer && !isMill && (
        // Same full-screen treatment as the Party panel above — see comment
        // there for why z-[60] and h-[100dvh] matter on mobile.
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-slate-50 dark:bg-slate-900 w-full sm:max-w-2xl rounded-none sm:rounded-2xl shadow-xl flex flex-col h-[100dvh] sm:h-auto sm:max-h-[90vh] animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95">

            <div className="p-4 sm:p-6 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sm:rounded-t-2xl flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                  {selectedCustomer.name}
                </h2>
                <div className="flex flex-wrap gap-4 mt-2 text-sm text-slate-500">
                  <span className="flex items-center gap-1"><Phone size={14}/> {selectedCustomer.mobile || t('notApplicable')}</span>
                  {selectedCustomer.address && <span className="flex items-center gap-1"><MapPin size={14}/> {selectedCustomer.address}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={openEditModal}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  title="Edit Customer"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => setDeletingCustomer(selectedCustomer)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                  title="Delete Customer"
                >
                  <Trash2 size={16} />
                </button>
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="p-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
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
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-50 dark:bg-slate-900">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <ReceiptText size={16} /> {t('customerLedgerTimeline')}
              </h3>
              <LedgerView entityId={selectedCustomer.id} entityType="customer" entityName={selectedCustomer.name} onLedgerChanged={() => mutateCustomers()} />
            </div>
          </div>
        </div>
      )}

      {showPayment && selectedCustomer && (
        <PaymentCollectionModal
          entityId={selectedCustomer.id}
          entityType="customer"
          entityName={selectedCustomer.name}
          entityMobile={selectedCustomer.mobile}
          outstanding={selectedCustomer.totalDue}
          onClose={() => { setShowPayment(false); setSelectedCustomer(null); }}
          onSuccess={() => mutateCustomers()}
        />
      )}

      {/* Add Bill for retail customer — same modal the Wholesale Parties
          tab uses, with entityType='customer' so the photo-attachment
          step targets the customer row's own documents array. */}
      {showAddBill && selectedCustomer && (
        <AddBillModal
          partyId={selectedCustomer.id}
          partyDocuments={[]}
          entityType="customer"
          onClose={() => setShowAddBill(false)}
          onSaved={() => { setShowAddBill(false); setSelectedCustomer(null); mutateCustomers(); }}
        />
      )}

      {/* Scan handwritten collection notebook for retail customers —
          same ScanCollectionModal, with entityType='customer' so the
          matched-against list is the retail customer roster. */}
      {showScanModal && (
        <ScanCollectionModal
          entityType="customer"
          onClose={() => setShowScanModal(false)}
          onApplied={() => { setShowScanModal(false); mutateCustomers(); }}
        />
      )}

      {/* New Customer / Party Modal */}
      {showNewCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-xl flex flex-col overflow-hidden max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800 shrink-0">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Users size={18} className="text-indigo-600" />
                {locale === 'mr' ? 'नवीन ग्राहक / खातेदार जोडा' : locale === 'hi' ? 'नया ग्राहक / पार्टी जोड़ें' : 'Add Customer / Party'}
              </h2>
              <button onClick={() => setShowNewCustomer(false)}><X size={20} className="text-slate-400"/></button>
            </div>
            <div className="overflow-y-auto flex-1">
              <form onSubmit={handleCreateCustomer} className="p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      {locale === 'mr' ? 'ग्राहक / पार्टीचे नाव' : locale === 'hi' ? 'ग्राहक / पार्टी का नाम' : 'Party / Customer Name'} <span className="text-red-500">*</span>
                    </label>
                    <input
                      required
                      value={form.name} onChange={e=>setForm({...form, name: e.target.value})}
                      className="w-full h-10 px-3 border rounded-xl dark:bg-slate-950 dark:border-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder={locale === 'mr' ? 'उदा. रमेश पाटील / बालाजी ट्रेडर्स' : 'e.g. Ramesh Patil / Balaji Traders'}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      {locale === 'mr' ? 'पार्टी प्रकार' : locale === 'hi' ? 'पार्टी प्रकार' : 'Party Type'}
                    </label>
                    <select
                      value={form.partyType} onChange={e=>setForm({...form, partyType: e.target.value})}
                      className="w-full h-10 px-3 border rounded-xl dark:bg-slate-950 dark:border-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="Customer">{locale === 'mr' ? 'ग्राहक' : locale === 'hi' ? 'ग्राहक' : 'Customer'}</option>
                      <option value="Trader">{locale === 'mr' ? 'व्यापारी' : locale === 'hi' ? 'व्यापारी' : 'Trader'}</option>
                      <option value="Dealer">{locale === 'mr' ? 'डीलर' : locale === 'hi' ? 'डीलर' : 'Dealer'}</option>
                      <option value="Institution">{locale === 'mr' ? 'संस्था / कंपनी' : locale === 'hi' ? 'संस्था / कंपनी' : 'Institution'}</option>
                      <option value="Other">{locale === 'mr' ? 'इतर' : locale === 'hi' ? 'अन्य' : 'Other'}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      {locale === 'mr' ? 'मोबाईल' : locale === 'hi' ? 'मोबाइल' : 'Mobile'} <span className="text-red-500">*</span>
                    </label>
                    <input
                      required
                      value={form.mobile} onChange={e=>setForm({...form, mobile: e.target.value})}
                      className="w-full h-10 px-3 border rounded-xl dark:bg-slate-950 dark:border-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="+91 98765 43210"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      {locale === 'mr' ? 'पर्यायी मोबाईल' : locale === 'hi' ? 'वैकल्पिक मोबाइल' : 'Alternate Mobile'}
                    </label>
                    <input
                      value={form.alternateMobile} onChange={e=>setForm({...form, alternateMobile: e.target.value})}
                      className="w-full h-10 px-3 border rounded-xl dark:bg-slate-950 dark:border-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="98220 12345"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      {locale === 'mr' ? 'जीएसटी (ऐच्छिक)' : locale === 'hi' ? 'जीएसटी (वैकल्पिक)' : 'GSTIN (Optional)'}
                    </label>
                    <input
                      value={form.gst} onChange={e=>setForm({...form, gst: e.target.value.toUpperCase()})}
                      className="w-full h-10 px-3 border rounded-xl dark:bg-slate-950 dark:border-slate-800 text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="27AAAAA0000A1Z5"
                      maxLength={15}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      {locale === 'mr' ? 'पॅन (ऐच्छिक)' : locale === 'hi' ? 'पैन (वैकल्पिक)' : 'PAN (Optional)'}
                    </label>
                    <input
                      value={form.pan} onChange={e=>setForm({...form, pan: e.target.value.toUpperCase()})}
                      className="w-full h-10 px-3 border rounded-xl dark:bg-slate-950 dark:border-slate-800 text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="ABCDE1234F"
                      maxLength={10}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    {locale === 'mr' ? 'पत्ता' : locale === 'hi' ? 'पता' : 'Address'}
                  </label>
                  <input
                    value={form.address} onChange={e=>setForm({...form, address: e.target.value})}
                    className="w-full h-10 px-3 border rounded-xl dark:bg-slate-950 dark:border-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder={locale === 'mr' ? 'गाव / परिसर / मार्केट' : 'Village / Street / Market'}
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      {locale === 'mr' ? 'शहर' : locale === 'hi' ? 'शहर' : 'City'}
                    </label>
                    <input
                      value={form.city} onChange={e=>setForm({...form, city: e.target.value})}
                      className="w-full h-10 px-3 border rounded-xl dark:bg-slate-950 dark:border-slate-800 text-sm"
                      placeholder={locale === 'mr' ? 'शहर' : 'City'}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      {locale === 'mr' ? 'राज्य' : locale === 'hi' ? 'राज्य' : 'State'}
                    </label>
                    <input
                      value={form.state} onChange={e=>setForm({...form, state: e.target.value})}
                      className="w-full h-10 px-3 border rounded-xl dark:bg-slate-950 dark:border-slate-800 text-sm"
                      placeholder={locale === 'mr' ? 'राज्य' : 'State'}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      {locale === 'mr' ? 'पिनकोड' : locale === 'hi' ? 'पिनकोड' : 'Pincode'}
                    </label>
                    <input
                      value={form.pincode} onChange={e=>setForm({...form, pincode: e.target.value})}
                      className="w-full h-10 px-3 border rounded-xl dark:bg-slate-950 dark:border-slate-800 text-sm"
                      placeholder="413001"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      {locale === 'mr' ? 'सुरुवातीची बाकी' : locale === 'hi' ? 'प्रारंभिक शेष' : 'Opening Balance'}
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        type="number"
                        value={form.openingBalance} onChange={e=>setForm({...form, openingBalance: e.target.value})}
                        className="w-full h-10 px-3 border rounded-xl dark:bg-slate-950 dark:border-slate-800 text-sm font-mono"
                        placeholder="0"
                      />
                      <select
                        value={form.balanceType} onChange={e=>setForm({...form, balanceType: e.target.value})}
                        className="px-2 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold shrink-0"
                      >
                        <option value="receivable">{locale === 'mr' ? 'घेणे' : locale === 'hi' ? 'प्राप्य' : 'Receivable'}</option>
                        <option value="payable">{locale === 'mr' ? 'देणे' : locale === 'hi' ? 'देय' : 'Payable'}</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      {locale === 'mr' ? 'पेमेंट अटी' : locale === 'hi' ? 'भुगतान शर्तें' : 'Payment Terms'}
                    </label>
                    <select
                      value={form.paymentTerms} onChange={e=>setForm({...form, paymentTerms: e.target.value})}
                      className="w-full h-10 px-3 border rounded-xl dark:bg-slate-950 dark:border-slate-800 text-sm"
                    >
                      <option value="Immediate">{locale === 'mr' ? 'रोख / तातडीने' : locale === 'hi' ? 'नकद / तत्काल' : 'Immediate / Cash'}</option>
                      <option value="Net 7">{locale === 'mr' ? '७ दिवस' : locale === 'hi' ? '७ दिन' : 'Net 7 Days'}</option>
                      <option value="Net 15">{locale === 'mr' ? '१५ दिवस' : locale === 'hi' ? '१५ दिन' : 'Net 15 Days'}</option>
                      <option value="Net 30">{locale === 'mr' ? '३० दिवस' : locale === 'hi' ? '३० दिन' : 'Net 30 Days'}</option>
                      <option value="Custom">{locale === 'mr' ? 'कस्टम' : locale === 'hi' ? 'कस्टम' : 'Custom'}</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      {locale === 'mr' ? 'उधारी मर्यादा (₹)' : locale === 'hi' ? 'उधार सीमा (₹)' : 'Credit Limit (₹)'}
                    </label>
                    <input
                      type="number"
                      value={form.creditLimit} onChange={e=>setForm({...form, creditLimit: e.target.value})}
                      className="w-full h-10 px-3 border rounded-xl dark:bg-slate-950 dark:border-slate-800 text-sm font-mono"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      {locale === 'mr' ? 'उधारीचे दिवस' : locale === 'hi' ? 'उधार के दिन' : 'Credit Days'}
                    </label>
                    <input
                      type="number"
                      value={form.creditDays} onChange={e=>setForm({...form, creditDays: e.target.value})}
                      className="w-full h-10 px-3 border rounded-xl dark:bg-slate-950 dark:border-slate-800 text-sm font-mono"
                      placeholder="0"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    {locale === 'mr' ? 'शेरा / नोट्स' : locale === 'hi' ? 'टिप्पणी / नोट्स' : 'Notes'}
                  </label>
                  <textarea
                    rows={2}
                    value={form.notes} onChange={e=>setForm({...form, notes: e.target.value})}
                    className="w-full p-2.5 border rounded-xl dark:bg-slate-950 dark:border-slate-800 text-sm resize-none focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder={locale === 'mr' ? 'उदा. नियमित खरेदीदार, सोलापूर मार्केट संदर्भ' : 'e.g. Regular buyer, Solapur APMC broker reference'}
                  />
                </div>

                <button type="submit" disabled={isSaving} className="w-full h-12 mt-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-70 flex items-center justify-center gap-2 transition-colors">
                  {isSaving ? <Loader2 size={20} className="animate-spin" /> : (locale === 'mr' ? 'ग्राहक / पार्टी जतन करा' : locale === 'hi' ? 'ग्राहक / पार्टी सहेजें' : 'Save Customer / Party')}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {editingCustomer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-xl flex flex-col overflow-hidden max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800 shrink-0">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Pencil size={18} className="text-indigo-500" />
                {locale === 'mr' ? 'ग्राहक / पार्टी संपादित करा' : locale === 'hi' ? 'ग्राहक / पार्टी संपादित करें' : 'Edit Customer / Party'}
              </h2>
              <button onClick={() => { setEditingCustomer(null); resetForm(); }}><X size={20} className="text-slate-400 hover:text-slate-700 transition-colors"/></button>
            </div>
            <div className="overflow-y-auto flex-1">
              <form onSubmit={handleEditCustomer} className="p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      {locale === 'mr' ? 'ग्राहक / पार्टीचे नाव' : locale === 'hi' ? 'ग्राहक / पार्टी का नाम' : 'Party / Customer Name'} <span className="text-red-500">*</span>
                    </label>
                    <input required value={form.name} onChange={e=>setForm({...form, name: e.target.value})} className="w-full h-10 px-3 border rounded-xl dark:bg-slate-950 dark:border-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 transition-shadow" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      {locale === 'mr' ? 'पार्टी प्रकार' : locale === 'hi' ? 'पार्टी प्रकार' : 'Party Type'}
                    </label>
                    <select
                      value={form.partyType} onChange={e=>setForm({...form, partyType: e.target.value})}
                      className="w-full h-10 px-3 border rounded-xl dark:bg-slate-950 dark:border-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="Customer">{locale === 'mr' ? 'ग्राहक' : locale === 'hi' ? 'ग्राहक' : 'Customer'}</option>
                      <option value="Trader">{locale === 'mr' ? 'व्यापारी' : locale === 'hi' ? 'व्यापारी' : 'Trader'}</option>
                      <option value="Dealer">{locale === 'mr' ? 'डीलर' : locale === 'hi' ? 'डीलर' : 'Dealer'}</option>
                      <option value="Institution">{locale === 'mr' ? 'संस्था / कंपनी' : locale === 'hi' ? 'संस्था / कंपनी' : 'Institution'}</option>
                      <option value="Other">{locale === 'mr' ? 'इतर' : locale === 'hi' ? 'अन्य' : 'Other'}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      {locale === 'mr' ? 'मोबाईल' : locale === 'hi' ? 'मोबाइल' : 'Mobile'}
                    </label>
                    <input value={form.mobile} onChange={e=>setForm({...form, mobile: e.target.value})} className="w-full h-10 px-3 border rounded-xl dark:bg-slate-950 dark:border-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 transition-shadow" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      {locale === 'mr' ? 'पर्यायी मोबाईल' : locale === 'hi' ? 'वैकल्पिक मोबाइल' : 'Alternate Mobile'}
                    </label>
                    <input value={form.alternateMobile} onChange={e=>setForm({...form, alternateMobile: e.target.value})} className="w-full h-10 px-3 border rounded-xl dark:bg-slate-950 dark:border-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 transition-shadow" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      {locale === 'mr' ? 'जीएसटी' : locale === 'hi' ? 'जीएसटी' : 'GSTIN'}
                    </label>
                    <input value={form.gst} onChange={e=>setForm({...form, gst: e.target.value.toUpperCase()})} className="w-full h-10 px-3 border rounded-xl dark:bg-slate-950 dark:border-slate-800 font-mono text-sm" maxLength={15} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      {locale === 'mr' ? 'पॅन' : locale === 'hi' ? 'पैन' : 'PAN'}
                    </label>
                    <input value={form.pan} onChange={e=>setForm({...form, pan: e.target.value.toUpperCase()})} className="w-full h-10 px-3 border rounded-xl dark:bg-slate-950 dark:border-slate-800 font-mono text-sm" maxLength={10} />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    {locale === 'mr' ? 'पत्ता' : locale === 'hi' ? 'पता' : 'Address'}
                  </label>
                  <input value={form.address} onChange={e=>setForm({...form, address: e.target.value})} className="w-full h-10 px-3 border rounded-xl dark:bg-slate-950 dark:border-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 transition-shadow" />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      {locale === 'mr' ? 'शहर' : locale === 'hi' ? 'शहर' : 'City'}
                    </label>
                    <input value={form.city} onChange={e=>setForm({...form, city: e.target.value})} className="w-full h-10 px-3 border rounded-xl dark:bg-slate-950 dark:border-slate-800 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      {locale === 'mr' ? 'राज्य' : locale === 'hi' ? 'राज्य' : 'State'}
                    </label>
                    <input value={form.state} onChange={e=>setForm({...form, state: e.target.value})} className="w-full h-10 px-3 border rounded-xl dark:bg-slate-950 dark:border-slate-800 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      {locale === 'mr' ? 'पिनकोड' : locale === 'hi' ? 'पिनकोड' : 'Pincode'}
                    </label>
                    <input value={form.pincode} onChange={e=>setForm({...form, pincode: e.target.value})} className="w-full h-10 px-3 border rounded-xl dark:bg-slate-950 dark:border-slate-800 text-sm" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      {locale === 'mr' ? 'उधारी मर्यादा (₹)' : locale === 'hi' ? 'उधार सीमा (₹)' : 'Credit Limit (₹)'}
                    </label>
                    <input type="number" value={form.creditLimit} onChange={e=>setForm({...form, creditLimit: e.target.value})} className="w-full h-10 px-3 border rounded-xl dark:bg-slate-950 dark:border-slate-800 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      {locale === 'mr' ? 'पेमेंट अटी' : locale === 'hi' ? 'भुगतान शर्तें' : 'Payment Terms'}
                    </label>
                    <select
                      value={form.paymentTerms} onChange={e=>setForm({...form, paymentTerms: e.target.value})}
                      className="w-full h-10 px-3 border rounded-xl dark:bg-slate-950 dark:border-slate-800 text-sm"
                    >
                      <option value="Immediate">{locale === 'mr' ? 'रोख / तातडीने' : locale === 'hi' ? 'नकद / तत्काल' : 'Immediate / Cash'}</option>
                      <option value="Net 7">{locale === 'mr' ? '७ दिवस' : locale === 'hi' ? '७ दिन' : 'Net 7 Days'}</option>
                      <option value="Net 15">{locale === 'mr' ? '१५ दिवस' : locale === 'hi' ? '१५ दिन' : 'Net 15 Days'}</option>
                      <option value="Net 30">{locale === 'mr' ? '३० दिवस' : locale === 'hi' ? '३० दिन' : 'Net 30 Days'}</option>
                      <option value="Custom">{locale === 'mr' ? 'कस्टम' : locale === 'hi' ? 'कस्टम' : 'Custom'}</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    {locale === 'mr' ? 'शेरा / नोट्स' : locale === 'hi' ? 'टिप्पणी / नोट्स' : 'Notes'}
                  </label>
                  <textarea rows={2} value={form.notes} onChange={e=>setForm({...form, notes: e.target.value})} className="w-full p-2.5 border rounded-xl dark:bg-slate-950 dark:border-slate-800 text-sm resize-none" />
                </div>

                <button type="submit" disabled={isEditing} className="w-full h-12 mt-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-70 flex items-center justify-center gap-2 transition-colors">
                  {isEditing ? <Loader2 size={20} className="animate-spin" /> : (locale === 'mr' ? 'बदल जतन करा' : locale === 'hi' ? 'बदलाव सहेजें' : 'Save Changes')}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}


      {/* Delete Confirmation (single) */}
      <ConfirmPasswordModal
        open={!!deletingCustomer}
        itemLabel="customer"
        onConfirm={handleDeleteCustomer}
        onCancel={() => setDeletingCustomer(null)}
      />

      {/* Delete Confirmation (bulk) */}
      <ConfirmPasswordModal
        open={confirmBulkDeleteCustomers}
        itemLabel="customer"
        itemCount={selectedIds.length}
        onConfirm={handleBulkDeleteCustomers}
        onCancel={() => setConfirmBulkDeleteCustomers(false)}
      />

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
