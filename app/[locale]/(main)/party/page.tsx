'use client';

import { useState } from 'react';
import { Search, Loader2, Phone, X, Plus, Wallet, MapPin, ReceiptText, Building2, Pencil, Trash2, Users, Truck, ArrowRight, AlertCircle, CheckCircle2, NotebookText, ScanLine, Handshake } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import PaymentCollectionModal from '@/components/crm/PaymentCollectionModal';
import LedgerView from '@/components/crm/LedgerView';
import CustomerRollupView from '@/components/crm/CustomerRollupView';
import { ExportButton } from '@/lib/hooks/useExport';
import { generateCollectionRegisterPDF } from '@/lib/pdf/collectionRegister';
import ScanCollectionModal from '@/components/party/ScanCollectionModal';
import AddBillModal from '@/components/party/AddBillModal';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { ConfirmPasswordModal } from '@/components/trash/ConfirmPasswordModal';
import { SelectionActionBar } from '@/components/trash/SelectionActionBar';
import { useRowSelection } from '@/lib/hooks/useRowSelection';

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
  createdAt: string;
  documents?: { id: string; url: string; uploadedAt: string; transactionId?: string }[];
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
        <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{t('creditCenterTitle')}</h1>
        <p className="text-slate-500 text-sm font-medium">{t('creditCenterSubtitle')}</p>
      </div>

      <SupplierCreditCard />

      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit overflow-x-auto max-w-full">
        {tabBtn('parties',   <Building2 size={15} />, t('title'))}
        {tabBtn('customers', <Users size={15} />,     t('customersUdharTab'))}
        {isMill && tabBtn('brokers',      <Handshake size={15} />, 'Brokers')}
        {isMill && tabBtn('transporters', <Truck size={15} />,     'Transporters')}
      </div>

      {activeTab === 'parties'      && <PartiesPanel />}
      {activeTab === 'customers'    && <CustomersPanel />}
      {activeTab === 'brokers'      && <MillPartyPanel customerType="broker"      label="Broker"      icon={<Handshake size={15} />} accent="rose" />}
      {activeTab === 'transporters' && <MillPartyPanel customerType="transporter" label="Transporter" icon={<Truck size={15} />}      accent="orange" />}
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
  const { data: rows = [], isLoading, mutate } = useSWR<any[]>(
    activeShopId ? `/crm/customers?type=${customerType}&_shop=${activeShopId}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ name: '', mobile: '', address: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const openNew = () => { setEditing(null); setForm({ name: '', mobile: '', address: '', notes: '' }); setShowAdd(true); };
  const openEdit = (row: any) => { setEditing(row); setForm({ name: row.name || '', mobile: row.mobile || '', address: row.address || '', notes: row.notes || '' }); setShowAdd(true); };

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
    return (r.name || '').toLowerCase().includes(q) || (r.mobile || '').includes(q);
  });

  const accentClasses = accent === 'rose'
    ? { chip: 'bg-rose-100 text-rose-800 dark:bg-rose-500/10 dark:text-rose-300', btn: 'bg-rose-500 hover:bg-rose-600', ring: 'focus:ring-rose-500' }
    : { chip: 'bg-orange-100 text-orange-800 dark:bg-orange-500/10 dark:text-orange-300', btn: 'bg-orange-500 hover:bg-orange-600', ring: 'focus:ring-orange-500' };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${label.toLowerCase()}s by name or mobile`}
            className={`w-full pl-9 pr-3 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 ${accentClasses.ring}`}
          />
        </div>
        <button
          onClick={openNew}
          className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm transition-colors ${accentClasses.btn}`}
        >
          <Plus size={15} /> Add {label}
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
              ? `Add your first ${label.toLowerCase()} — ${customerType === 'broker' ? 'they earn commission per deal you close through them.' : 'they carry the goods; freight is billed separately.'}`
              : 'Try a different search.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((row: any) => (
            <div key={row.id} className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-slate-900 dark:text-white truncate">{row.name}</h3>
                    <span className={`text-[10px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${accentClasses.chip}`}>{label}</span>
                  </div>
                  {row.mobile && (
                    <a href={`tel:${row.mobile}`} className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 hover:text-emerald-600">
                      <Phone size={11} /> {row.mobile}
                    </a>
                  )}
                  {row.address && (
                    <p className="mt-1 flex items-start gap-1.5 text-xs text-slate-400 line-clamp-2">
                      <MapPin size={11} className="mt-0.5 shrink-0" /> {row.address}
                    </p>
                  )}
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
          ))}
        </div>
      )}

      {/* Add/Edit modal */}
      {showAdd && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">{icon} {editing ? `Edit ${label}` : `Add ${label}`}</h2>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white"><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Name <span className="text-red-500">*</span></label>
                <input
                  value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={`w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 ${accentClasses.ring}`}
                  placeholder={customerType === 'broker' ? 'e.g. Ramesh Dalal' : 'e.g. Prakash Transport'}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Mobile</label>
                <input
                  value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                  className={`w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 ${accentClasses.ring}`}
                  placeholder="+91 98765 43210"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Address</label>
                <input
                  value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className={`w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 ${accentClasses.ring}`}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Notes</label>
                <textarea
                  rows={2}
                  value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className={`w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm resize-none focus:outline-none focus:ring-2 ${accentClasses.ring}`}
                  placeholder={customerType === 'broker' ? 'e.g. default commission 2%, area Solapur' : 'e.g. per-Km ₹28, 10-ton capacity'}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-300">Cancel</button>
                <button type="submit" disabled={saving} className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm transition-colors disabled:opacity-60 ${accentClasses.btn}`}>
                  {saving ? <Loader2 size={15} className="animate-spin inline" /> : (editing ? 'Save Changes' : `Add ${label}`)}
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

function PartiesPanel() {
  const t = useTranslations('Party');
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const profile = useBusinessStore(s => s.profile);
  const [search, setSearch] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [generatingRegister, setGeneratingRegister] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);

  const { data: partiesData = [], mutate: mutateParties, isLoading } = useSWR(
    activeShopId ? `/crm/customers?type=party&_shop=${activeShopId}` : null,
    fetcher
  );
  const parties: Party[] = Array.isArray(partiesData) ? partiesData : [];
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

  const filtered = parties.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.shopName && p.shopName.toLowerCase().includes(search.toLowerCase())) ||
    (p.mobile && p.mobile.includes(search))
  );

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

  // Collection Register — the printable route sheet a collection agent
  // carries door-to-door (Party / Amt / Cash / Chq / Dis, grouped by
  // route/area, totalled at the bottom). Replaces the old standalone
  // "Collection" module: that page was a full CRUD sheet-builder nobody
  // needed since the actual workflow is "print the round, collect cash,
  // enter payments back in the app" — this one button does exactly that
  // step without the extra data-entry ceremony. Uses the same search-
  // filtered list already on screen, same convention as the Export button.
  const handleDownloadCollectionRegister = async () => {
    // Only parties who still owe something belong on a collection round —
    // a settled party has nothing for the agent to collect, so including
    // them would just pad the printout with rows to skip over.
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
  const exportRows = filtered.filter(p => inRange(p.createdAt));
  const exportColumns = [
    { key: 'shopName', label: 'Business Name' },
    { key: 'name', label: 'Owner Name' },
    { key: 'mobile', label: 'Phone' },
    { key: 'address', label: 'Address' },
    { key: 'gst', label: 'GSTIN' },
    { key: 'creditLimit', label: 'Credit Limit', type: 'currency' as const },
    { key: 'creditDays', label: 'Credit Days', type: 'number' as const },
    { key: 'totalDue', label: 'Remaining Amount', type: 'currency' as const },
    { key: 'status', label: 'Status' },
    { key: 'dateAdded', label: 'Date Added', type: 'date' as const },
  ];
  const exportData = exportRows.map(p => ({
    shopName: p.shopName || '',
    name: p.name || '',
    mobile: p.mobile || '',
    address: p.address || '',
    gst: p.gst || '',
    creditLimit: p.creditLimit || 0,
    creditDays: p.creditDays || 0,
    totalDue: p.totalDue || 0,
    status: (p.totalDue || 0) > 0 ? 'Due' : 'Settled',
    dateAdded: p.createdAt,
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
          filename="wholesale-parties"
          title={t('title') || 'Wholesale Parties'}
          dateRange={dateRangeLabel}
          summary={[
            { label: 'Total Parties', value: String(exportData.length) },
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

        <SelectionActionBar
          count={selectedIds.length}
          itemLabel="party"
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
              {filtered.map(p => (
                <div
                  key={p.id}
                  onClick={() => setSelectedParty(p)}
                  className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-500 cursor-pointer transition-colors bg-slate-50 dark:bg-slate-800/50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(p.id)}
                      onChange={() => toggleOne(p.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer shrink-0"
                    />
                    <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 font-bold shrink-0">
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
          </>
        )}
      </div>

      {/* Party Panel */}
      {selectedParty && (
        // z-[60] beats the app's sticky sidebar (default z-40/50 range) so
        // the drawer never renders BEHIND the nav on tablets in landscape.
        // On mobile: full-screen (h-[100dvh]), no radii, no top gap — the
        // earlier h-[90vh] bottom-sheet left a 10vh strip of the party
        // list showing at the top which read as "overlap" to the client.
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

      {showScanModal && (
        <ScanCollectionModal
          onClose={() => setShowScanModal(false)}
          onApplied={() => mutateParties()}
        />
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

  const [editingCustomer, setEditingCustomer] = useState<UdharCustomer | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [deletingCustomer, setDeletingCustomer] = useState<UdharCustomer | null>(null);
  const [confirmBulkDeleteCustomers, setConfirmBulkDeleteCustomers] = useState(false);
  const [bulkDeletingCustomers, setBulkDeletingCustomers] = useState(false);

  const [form, setForm] = useState({ name: '', mobile: '', address: '', creditLimit: '0', creditDays: '0', openingBalance: '0' });

  const resetForm = () => setForm({ name: '', mobile: '', address: '', creditLimit: '0', creditDays: '0', openingBalance: '0' });

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await api.post('/crm/customers', { ...form, customerType: 'customer' });
      toast.success(t('customerCreated') || 'Customer added successfully');
      await mutateCustomers();
      setShowNewCustomer(false);
      resetForm();
    } catch (e) {
      console.error(e);
      toast.error('Failed to add customer');
    } finally {
      setIsSaving(false);
    }
  };

  const openEditModal = () => {
    if (!selectedCustomer) return;
    setForm({
      name: selectedCustomer.name,
      mobile: selectedCustomer.mobile || '',
      address: selectedCustomer.address || '',
      creditLimit: (selectedCustomer.creditLimit || 0).toString(),
      creditDays: (selectedCustomer.creditDays || 0).toString(),
      openingBalance: '0'
    });
    setEditingCustomer(selectedCustomer);
  };

  const handleEditCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;
    setIsEditing(true);
    try {
      await api.put(`/crm/customers/${editingCustomer.id}`, { ...form, customerType: 'customer' });
      toast.success('Customer updated successfully');
      await mutateCustomers();
      setEditingCustomer(null);
      setSelectedCustomer(null);
      resetForm();
    } catch (e) {
      console.error(e);
      toast.error('Failed to update customer');
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

      {/* Customer Panel */}
      {selectedCustomer && (
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

      {/* New Customer Modal */}
      {showNewCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl flex flex-col overflow-hidden max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800">
              <h2 className="text-lg font-bold">{t('addUdharCustomerTitle')}</h2>
              <button onClick={() => setShowNewCustomer(false)}><X size={20} className="text-slate-400"/></button>
            </div>
            <div className="overflow-y-auto">
              <form onSubmit={handleCreateCustomer} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-bold mb-1">{t('customerNameFieldLabel')}</label>
                  <input required value={form.name} onChange={e=>setForm({...form, name: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800" />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1">{t('mobile')}</label>
                  <input value={form.mobile} onChange={e=>setForm({...form, mobile: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800" />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1">{t('address')}</label>
                  <input value={form.address} onChange={e=>setForm({...form, address: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800" />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1 truncate" title={t('openingBalanceFull')}>{t('openingBalance')}</label>
                  <input type="number" value={form.openingBalance} onChange={e=>setForm({...form, openingBalance: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800" />
                </div>
                <button type="submit" disabled={isSaving} className="w-full h-12 mt-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-70 flex items-center justify-center gap-2 transition-colors">
                  {isSaving ? <Loader2 size={20} className="animate-spin" /> : t('saveCustomerBtn')}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {editingCustomer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl flex flex-col overflow-hidden max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Pencil size={18} className="text-indigo-500" />
                Edit Customer
              </h2>
              <button onClick={() => { setEditingCustomer(null); resetForm(); }}><X size={20} className="text-slate-400 hover:text-slate-700 transition-colors"/></button>
            </div>
            <div className="overflow-y-auto">
              <form onSubmit={handleEditCustomer} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-bold mb-1">{t('customerNameFieldLabel')}</label>
                  <input required value={form.name} onChange={e=>setForm({...form, name: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 transition-shadow" />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1">{t('mobile')}</label>
                  <input value={form.mobile} onChange={e=>setForm({...form, mobile: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 transition-shadow" />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1">{t('address')}</label>
                  <input value={form.address} onChange={e=>setForm({...form, address: e.target.value})} className="w-full h-10 px-3 border rounded-lg dark:bg-slate-950 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 transition-shadow" />
                </div>
                <button type="submit" disabled={isEditing} className="w-full h-12 mt-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-70 flex items-center justify-center gap-2 transition-colors">
                  {isEditing ? <Loader2 size={20} className="animate-spin" /> : 'Save Changes'}
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
