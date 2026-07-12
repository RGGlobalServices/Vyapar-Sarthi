'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import api from '@/lib/api';
import { Link, useRouter } from '@/i18n/routing';
import { useAuthStore, useCartStore } from '@/lib/store';
import { useBusinessStore } from '@/lib/businessStore';
import { BillSlip, generateWhatsAppText } from '@/components/BillSlip';
import { cn } from '@/lib/utils';
import {
  IndianRupee, Search, Filter, ArrowLeft, RefreshCw, Eye, Calendar,
  User, Printer, Download, MessageCircle, Copy, RotateCcw, Trash2,
  X, ChevronLeft, ChevronRight, CheckCircle, AlertCircle, Clock,
  Package, CreditCard, Banknote, Smartphone, FileText, Loader2,
  SlidersHorizontal, ChevronDown, ClipboardList
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────
interface Invoice {
  id: string;
  invoice_number: string;
  total_amount: number;
  payment_type: string;
  amount_paid: number | null;
  payment_details: any;
  customer_name: string | null;
  customer_mobile: string | null;
  customer_email: string | null;
  created_at: string;
  items?: InvoiceItem[];
}

interface InvoiceItem {
  id: string;
  product_id: string | null;
  name: string;
  price_per_unit: number;
  quantity: number;
  total: number;
  unit?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getPaymentStatus(inv: Invoice): 'paid' | 'partial' | 'credit' {
  const paid = inv.amount_paid ?? (inv.payment_type === 'Udhar' ? 0 : inv.total_amount);
  const remaining = Math.max(0, inv.total_amount - paid);
  if (remaining <= 0) return 'paid';
  if (paid > 0) return 'partial';
  return 'credit';
}

function getStatusBadge(status: 'paid' | 'partial' | 'credit') {
  if (status === 'paid') return { label: 'Paid', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' };
  if (status === 'partial') return { label: 'Partial', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' };
  return { label: 'Credit', cls: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20' };
}

function getPaymentBadge(type: string) {
  if (type === 'Cash') return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
  if (type === 'UPI') return 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20';
  if (type === 'Card') return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
  if (type === 'Udhar') return 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20';
  if (type === 'Split') return 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20';
  return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20';
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function formatTime(d: string) {
  return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

const PAGE_SIZE = 20;

// ─── Return Dialog ────────────────────────────────────────────────────────────
function ReturnDialog({ invoice, onClose, onDone }: { invoice: Invoice; onClose: () => void; onDone: () => void }) {
  const [returnItems, setReturnItems] = useState<Array<{ item_id: string; name: string; quantity: number; maxQty: number; price: number; selected: boolean }>>([]);
  const [reason, setReason] = useState('Customer Return');
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(true);

  useEffect(() => {
    api.get(`/billing/${invoice.id}`)
      .then(res => {
        setReturnItems((res.data.items || []).map((i: any) => ({
          item_id: i.id,
          name: i.name,
          quantity: i.quantity,
          maxQty: i.quantity,
          price: i.price_per_unit,
          selected: true,
        })));
      })
      .catch(console.error)
      .finally(() => setDetailLoading(false));
  }, [invoice.id]);

  const handleSubmit = async () => {
    const toReturn = returnItems.filter(i => i.selected && i.quantity > 0);
    if (!toReturn.length) return alert('Select at least one item to return.');
    setLoading(true);
    try {
      await api.post('/billing/returns', {
        bill_id: invoice.id,
        items: toReturn.map(i => ({ item_id: i.item_id, quantity: i.quantity, reason, price: i.price })),
      });
      alert('Return processed successfully! Stock has been updated.');
      onDone();
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Return failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-orange-500/10 rounded-xl flex items-center justify-center">
              <RotateCcw size={18} className="text-orange-500" />
            </div>
            <div>
              <h2 className="font-black text-slate-900 dark:text-white">Return / Refund</h2>
              <p className="text-xs text-slate-500">INV-{invoice.id.substring(0, 8).toUpperCase()}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {detailLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-emerald-500" size={24} /></div>
          ) : (
            <>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Select items to return:</p>
              <div className="space-y-2">
                {returnItems.map((item, idx) => (
                  <div key={item.item_id} className={cn(
                    'flex items-center gap-3 p-3 rounded-xl border transition-colors',
                    item.selected ? 'bg-orange-50 dark:bg-orange-500/5 border-orange-200 dark:border-orange-500/20' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                  )}>
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={e => setReturnItems(prev => prev.map((r, i) => i === idx ? { ...r, selected: e.target.checked } : r))}
                      className="w-4 h-4 accent-orange-500"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.name}</p>
                      <p className="text-xs text-slate-500">₹{item.price.toLocaleString('en-IN')} each</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        disabled={!item.selected}
                        onClick={() => setReturnItems(prev => prev.map((r, i) => i === idx ? { ...r, quantity: Math.max(1, r.quantity - 1) } : r))}
                        className="w-7 h-7 bg-slate-200 dark:bg-slate-700 rounded-lg flex items-center justify-center text-sm font-bold disabled:opacity-30"
                      >-</button>
                      <span className="w-8 text-center font-black text-slate-900 dark:text-white">{item.quantity}</span>
                      <button
                        disabled={!item.selected}
                        onClick={() => setReturnItems(prev => prev.map((r, i) => i === idx ? { ...r, quantity: Math.min(r.maxQty, r.quantity + 1) } : r))}
                        className="w-7 h-7 bg-slate-200 dark:bg-slate-700 rounded-lg flex items-center justify-center text-sm font-bold disabled:opacity-30"
                      >+</button>
                      <span className="text-xs text-slate-500 w-16 text-right">of {item.maxQty}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Reason</label>
                <select
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option>Customer Return</option>
                  <option>Damaged Product</option>
                  <option>Wrong Item Delivered</option>
                  <option>Quality Issue</option>
                  <option>Expired Product</option>
                  <option>Other</option>
                </select>
              </div>
              <div className="bg-orange-50 dark:bg-orange-500/5 border border-orange-200 dark:border-orange-500/20 rounded-xl p-3 text-xs text-orange-700 dark:text-orange-400">
                ⚠️ Return will automatically update stock, customer ledger, and reports.
              </div>
            </>
          )}
        </div>

        <div className="p-5 border-t border-slate-200 dark:border-slate-800 flex gap-3">
          <button onClick={onClose} className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 py-3 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || detailLoading}
            className="flex-[2] bg-orange-500 text-white py-3 rounded-xl font-bold hover:bg-orange-400 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
            {loading ? 'Processing...' : 'Process Return'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Invoice Preview Modal ───────────────────────────────────────────────────
function InvoicePreviewModal({ invoice, onClose, storeName, storeAddress, storeMobile, gst, pan, profile }: {
  invoice: Invoice;
  onClose: () => void;
  storeName?: string;
  storeAddress?: string;
  storeMobile?: string;
  gst?: string;
  pan?: string;
  profile: any;
}) {
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const componentRef = useRef<HTMLDivElement>(null);
  const tBill = useTranslations('BillSlip');

  const paid = invoice.amount_paid ?? (invoice.payment_type === 'Udhar' ? 0 : invoice.total_amount);
  const remaining = Math.max(0, invoice.total_amount - paid);

  const billData = {
    items: (invoice.items || []).map(i => ({
      id: i.id,
      name: i.name,
      unit: i.unit || 'Unit',
      quantity: i.quantity,
      price: i.price_per_unit,
      total: i.total,
      profit: 0,
    })),
    total: invoice.total_amount,
    discount: 0,
    paymentMethod: invoice.payment_type,
    amountPaid: paid,
    remainingAmount: remaining,
    billNumber: invoice.invoice_number || `INV-${invoice.id.substring(0, 8).toUpperCase()}`,
    date: formatDate(invoice.created_at),
    storeName,
    storeAddress,
    storeMobile,
    gst,
    pan,
    customerName: invoice.customer_name || undefined,
    customerMobile: invoice.customer_mobile || undefined,
    splitPayments: invoice.payment_type === 'Split'
      ? (typeof invoice.payment_details === 'string' ? JSON.parse(invoice.payment_details) : invoice.payment_details)
      : undefined,
    invoiceFormat: profile?.invoiceFormat || 'thermal80',
    businessType: profile?.businessType || 'kirana',
    showQrCode: profile?.showQrCode || false,
    invoiceFooter: profile?.invoiceFooter || undefined,
  };

  const handleDownloadPDF = async () => {
    if (!componentRef.current) return;
    setDownloading(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas-pro'),
        import('jspdf'),
      ]);
      const clone = componentRef.current.cloneNode(true) as HTMLElement;
      clone.style.position = 'fixed';
      clone.style.top = '0';
      clone.style.left = '-9999px';
      clone.style.width = '320px';
      clone.style.height = 'auto';
      clone.style.backgroundColor = '#ffffff';
      clone.style.visibility = 'visible';
      document.body.appendChild(clone);
      await new Promise(r => setTimeout(r, 200));
      const canvas = await html2canvas(clone, { scale: 3, useCORS: true, backgroundColor: '#ffffff', logging: false });
      const imgData = canvas.toDataURL('image/png');
      const pdfWidth = 80;
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pdfWidth, pdfHeight] });
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${billData.billNumber}.pdf`);
      document.body.removeChild(clone);
    } catch (e) {
      console.error(e);
      alert('PDF generation failed.');
    } finally {
      setDownloading(false);
    }
  };

  const handleWhatsApp = async () => {
    if (!invoice.customer_mobile) return alert('No mobile number for this customer.');
    setSharing(true);
    try {
      const text = generateWhatsAppText({
        ...billData,
        t: (key: string) => tBill(key as any) || key,
      });
      let phone = invoice.customer_mobile.replace(/\D/g, '');
      if (phone.length === 10) phone = `91${phone}`;
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl w-full max-w-sm shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <h2 className="font-black text-slate-900 dark:text-white">Invoice Preview</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"><X size={20} /></button>
        </div>

        {/* Print area */}
        <div id="print-area-modal" className="hidden print:block print:fixed print:inset-0 print:z-[9999] bg-white">
          <div ref={componentRef}><BillSlip {...billData} /></div>
        </div>

        {/* Preview */}
        <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-4">
          <div className="flex justify-center">
            <div ref={componentRef} className="bg-white shadow-xl rounded-lg">
              <BillSlip {...billData} />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-4 gap-2 shrink-0">
          <button onClick={() => window.print()} className="flex flex-col items-center gap-1 bg-slate-100 dark:bg-slate-800 py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
            <Printer size={16} />Print
          </button>
          <button
            onClick={handleDownloadPDF}
            disabled={downloading}
            className="flex flex-col items-center gap-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 py-2.5 rounded-xl text-xs font-bold hover:bg-blue-500/20 transition-colors disabled:opacity-60"
          >
            {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            PDF
          </button>
          <button
            onClick={handleWhatsApp}
            disabled={sharing || !invoice.customer_mobile}
            className="flex flex-col items-center gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 py-2.5 rounded-xl text-xs font-bold hover:bg-emerald-500/20 transition-colors disabled:opacity-60"
          >
            {sharing ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />}
            WA
          </button>
          <button onClick={onClose} className="flex flex-col items-center gap-1 bg-slate-100 dark:bg-slate-800 py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
            <X size={16} />Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function InvoiceHistoryPage() {
  const locale = useLocale();
  const router = useRouter();
  const { user } = useAuthStore();
  const { profile } = useBusinessStore();
  const { addItem, setDiscount, clearCart } = useCartStore();

  // Data
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | '7d' | '30d' | 'custom'>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);

  // Modals
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [returnInvoice, setReturnInvoice] = useState<Invoice | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const shopId = profile?.id;

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('q', search);
      if (dateFilter !== 'all') params.set('date', dateFilter);
      if (dateFilter === 'custom') {
        if (customFrom) params.set('from', customFrom);
        if (customTo) params.set('to', customTo);
      }
      if (paymentFilter !== 'All') params.set('payment', paymentFilter);
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));

      const res = await api.get(`/billing/?${params.toString()}`);
      const data = Array.isArray(res.data) ? res.data : (res.data?.data || []);
      setInvoices(data);
      setTotalCount(res.data?.total ?? data.length);
    } catch (e) {
      console.error('Failed to fetch invoices', e);
    } finally {
      setLoading(false);
    }
  }, [search, dateFilter, customFrom, customTo, paymentFilter, page]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // ── Client-side status filter (since API may not support it)
  const filtered = statusFilter === 'All' ? invoices : invoices.filter(inv => {
    const s = getPaymentStatus(inv);
    if (statusFilter === 'Paid') return s === 'paid';
    if (statusFilter === 'Partial') return s === 'partial';
    if (statusFilter === 'Credit') return s === 'credit';
    return true;
  });

  // ── Duplicate bill into cart
  const handleDuplicate = async (inv: Invoice) => {
    try {
      const res = await api.get(`/billing/${inv.id}`);
      const detail = res.data;
      clearCart();
      for (const item of (detail.items || [])) {
        addItem({
          id: item.product_id || `manual-${item.id}`,
          name: item.name,
          sellingPrice: item.price_per_unit,
          baseUnit: item.unit || 'Unit',
          wholesaleCost: 0,
          barcode: null,
        }, undefined);
      }
      router.push('/billing' as any);
    } catch (e) {
      alert('Failed to load invoice for duplication.');
    }
  };

  // ── Delete (soft-delete via activityLog — API level)
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this invoice? This action will be logged in the audit trail.')) return;
    setDeleting(id);
    try {
      await api.delete(`/billing/${id}`);
      setInvoices(prev => prev.filter(i => i.id !== id));
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Delete failed. You may not have permission.');
    } finally {
      setDeleting(null);
    }
  };

  // ── Load full invoice for preview
  const handlePreview = async (inv: Invoice) => {
    if (inv.items) { setPreviewInvoice(inv); return; }
    try {
      const res = await api.get(`/billing/${inv.id}`);
      setPreviewInvoice({ ...inv, items: res.data.items });
    } catch { setPreviewInvoice(inv); }
  };

  const totalPages = Math.ceil((statusFilter === 'All' ? totalCount : filtered.length) / PAGE_SIZE) || 1;

  return (
    <div className="space-y-5 max-w-7xl mx-auto animate-in fade-in duration-300 pb-16">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/billing" className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white transition-all shadow-sm shrink-0">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <ClipboardList size={22} className="text-emerald-500" />
              Invoice History
            </h1>
            <p className="text-slate-500 text-sm font-medium">{totalCount} records · {profile?.shopName || 'Your Store'}</p>
          </div>
        </div>
        <button
          onClick={fetchInvoices}
          disabled={loading}
          className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-2.5 rounded-xl font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all text-sm shadow-sm disabled:opacity-60"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* ── Search + Filters Bar ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex gap-3 flex-col sm:flex-row">
          {/* Search */}
          <div className="relative flex-1 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors" size={16} />
            <input
              type="text"
              placeholder="Search by Invoice No, Customer Name, Mobile..."
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          {/* Quick date */}
          <div className="flex gap-2 flex-wrap">
            {(['all', 'today', 'yesterday', '7d', '30d'] as const).map(d => (
              <button
                key={d}
                onClick={() => { setDateFilter(d); setPage(1); }}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border whitespace-nowrap',
                  dateFilter === d
                    ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-emerald-500 hover:text-emerald-600'
                )}
              >
                {d === 'all' ? 'All Time' : d === 'today' ? 'Today' : d === 'yesterday' ? 'Yesterday' : d === '7d' ? '7 Days' : '30 Days'}
              </button>
            ))}
            <button
              onClick={() => setShowFilters(f => !f)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border',
                showFilters
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
                  : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-400'
              )}
            >
              <SlidersHorizontal size={13} />
              Filters
              {(paymentFilter !== 'All' || statusFilter !== 'All' || dateFilter === 'custom') && (
                <span className="w-4 h-4 bg-emerald-500 text-white rounded-full text-[9px] flex items-center justify-center">!</span>
              )}
            </button>
          </div>
        </div>

        {/* Extended filters */}
        {showFilters && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Payment Mode</label>
              <select
                value={paymentFilter}
                onChange={e => { setPaymentFilter(e.target.value); setPage(1); }}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="All">All Modes</option>
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
                <option value="Card">Card</option>
                <option value="Udhar">Udhar</option>
                <option value="Split">Split</option>
                <option value="EMI">EMI</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Payment Status</label>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="All">All Statuses</option>
                <option value="Paid">Paid</option>
                <option value="Partial">Partially Paid</option>
                <option value="Credit">Credit (Udhar)</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Custom Date Range</label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customFrom}
                  onChange={e => { setCustomFrom(e.target.value); setDateFilter('custom'); setPage(1); }}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <span className="text-slate-400 text-xs">to</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={e => { setCustomTo(e.target.value); setDateFilter('custom'); setPage(1); }}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
            {(paymentFilter !== 'All' || statusFilter !== 'All' || dateFilter === 'custom') && (
              <button
                onClick={() => { setPaymentFilter('All'); setStatusFilter('All'); setDateFilter('all'); setCustomFrom(''); setCustomTo(''); setPage(1); }}
                className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 font-bold px-3 py-2 border border-red-200 dark:border-red-500/30 rounded-lg bg-red-50 dark:bg-red-500/5 transition-colors"
              >
                <X size={12} />Clear Filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Table ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="animate-spin text-emerald-500" size={36} />
            <p className="text-slate-500 font-medium">Loading invoices...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center">
              <FileText size={28} className="text-slate-400" />
            </div>
            <p className="text-slate-700 dark:text-slate-300 font-bold text-lg">No invoices found</p>
            <p className="text-slate-400 text-sm">Try adjusting your search or filters</p>
            {(search || paymentFilter !== 'All' || dateFilter !== 'all') && (
              <button onClick={() => { setSearch(''); setPaymentFilter('All'); setDateFilter('all'); setStatusFilter('All'); }} className="mt-2 text-sm text-emerald-500 hover:text-emerald-600 font-bold underline">
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[900px]">
              <thead className="bg-slate-50 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-5 py-4">Invoice</th>
                  <th className="px-5 py-4">Date & Time</th>
                  <th className="px-5 py-4">Customer</th>
                  <th className="px-5 py-4 text-right">Total</th>
                  <th className="px-5 py-4 text-right">Collected</th>
                  <th className="px-5 py-4 text-right">Due</th>
                  <th className="px-5 py-4 text-center">Mode</th>
                  <th className="px-5 py-4 text-center">Status</th>
                  <th className="px-5 py-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {filtered.map(inv => {
                  const status = getPaymentStatus(inv);
                  const statusBadge = getStatusBadge(status);
                  const paid = inv.amount_paid ?? (inv.payment_type === 'Udhar' ? 0 : inv.total_amount);
                  const due = Math.max(0, inv.total_amount - paid);
                  const isDeleting = deleting === inv.id;

                  return (
                    <tr key={inv.id} className={cn('hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group', isDeleting && 'opacity-50 pointer-events-none')}>
                      {/* Invoice No */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center shrink-0">
                            <IndianRupee size={14} className="text-emerald-500" />
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-900 dark:text-slate-100 font-mono tracking-tight">
                              {inv.invoice_number || `INV-${inv.id.substring(0, 8).toUpperCase()}`}
                            </p>
                            <p className="text-[10px] text-slate-400">{(inv.items?.length ?? '?')} items</p>
                          </div>
                        </div>
                      </td>
                      {/* Date */}
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{formatDate(inv.created_at)}</p>
                        <p className="text-[10px] text-slate-500 font-bold">{formatTime(inv.created_at)}</p>
                      </td>
                      {/* Customer */}
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[130px]">{inv.customer_name || 'Walk-in'}</p>
                        {inv.customer_mobile && <p className="text-[10px] text-slate-500 font-mono">{inv.customer_mobile}</p>}
                      </td>
                      {/* Total */}
                      <td className="px-5 py-3.5 text-right">
                        <span className="text-sm font-black text-slate-900 dark:text-slate-100">₹{inv.total_amount.toLocaleString('en-IN')}</span>
                      </td>
                      {/* Collected */}
                      <td className="px-5 py-3.5 text-right">
                        <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">₹{paid.toLocaleString('en-IN')}</span>
                      </td>
                      {/* Due */}
                      <td className="px-5 py-3.5 text-right">
                        <span className={cn('text-sm font-bold', due > 0 ? 'text-orange-500' : 'text-slate-400')}>
                          {due > 0 ? `₹${due.toLocaleString('en-IN')}` : '—'}
                        </span>
                      </td>
                      {/* Mode */}
                      <td className="px-5 py-3.5 text-center">
                        <span className={cn('px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border', getPaymentBadge(inv.payment_type))}>
                          {inv.payment_type}
                        </span>
                      </td>
                      {/* Status */}
                      <td className="px-5 py-3.5 text-center">
                        <span className={cn('px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border', statusBadge.cls)}>
                          {statusBadge.label}
                        </span>
                      </td>
                      {/* Actions */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handlePreview(inv)}
                            title="View Invoice"
                            className="w-7 h-7 flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-emerald-500 text-slate-500 hover:text-white dark:hover:text-slate-900 rounded-lg transition-all"
                          >
                            <Eye size={13} />
                          </button>
                          <Link
                            href={`/billing/invoices/${inv.id}` as any}
                            title="Full Details"
                            className="w-7 h-7 flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-indigo-500 text-slate-500 hover:text-white dark:hover:text-slate-900 rounded-lg transition-all"
                          >
                            <FileText size={13} />
                          </Link>
                          <button
                            onClick={() => handleDuplicate(inv)}
                            title="Duplicate Bill"
                            className="w-7 h-7 flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-sky-500 text-slate-500 hover:text-white dark:hover:text-slate-900 rounded-lg transition-all"
                          >
                            <Copy size={13} />
                          </button>
                          <button
                            onClick={() => setReturnInvoice(inv)}
                            title="Return / Refund"
                            className="w-7 h-7 flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-orange-500 text-slate-500 hover:text-white dark:hover:text-slate-900 rounded-lg transition-all"
                          >
                            <RotateCcw size={13} />
                          </button>
                          {user?.role === 'admin' && (
                            <button
                              onClick={() => handleDelete(inv.id)}
                              title="Delete (Admin)"
                              disabled={isDeleting}
                              className="w-7 h-7 flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-red-500 text-slate-500 hover:text-white dark:hover:text-slate-900 rounded-lg transition-all disabled:opacity-50"
                            >
                              {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Pagination ── */}
        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/20">
            <p className="text-xs text-slate-500 font-medium">
              Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount} invoices
            </p>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="w-8 h-8 flex items-center justify-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300 px-2">{page} / {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="w-8 h-8 flex items-center justify-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {previewInvoice && (
        <InvoicePreviewModal
          invoice={previewInvoice}
          onClose={() => setPreviewInvoice(null)}
          storeName={profile?.shopName || user?.storeName}
          storeAddress={profile?.address}
          storeMobile={profile?.mobile}
          gst={profile?.gst || undefined}
          pan={profile?.pan || undefined}
          profile={profile}
        />
      )}
      {returnInvoice && (
        <ReturnDialog
          invoice={returnInvoice}
          onClose={() => setReturnInvoice(null)}
          onDone={() => { setReturnInvoice(null); fetchInvoices(); }}
        />
      )}
    </div>
  );
}
