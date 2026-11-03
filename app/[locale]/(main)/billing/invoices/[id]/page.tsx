'use client';

import { pickCaptureScale } from '@/lib/pdfCapture';
import { useState, useEffect, use, useRef } from 'react';
import { useTranslations } from 'next-intl';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link, useRouter } from '@/i18n/routing';
import MillInvoicePreviewModal from '@/components/invoice/MillInvoicePreviewModal';
import { isMillInvoice } from '@/lib/millInvoice';
import { IndianRupee, ArrowLeft, RefreshCw, Calendar, User, Package, Clock, Printer, CreditCard, ChevronRight, Download, ArrowRightLeft, RotateCcw } from 'lucide-react';
import { cn, fmtDate } from '@/lib/utils';
import { BillSlip } from '@/components/BillSlip';
import { useAuthStore } from '@/lib/store';
import { useBusinessStore } from '@/lib/businessStore';
import { isWholesaleTierPackage } from '@/lib/config/packageConfig';
import { waitForImages, waitForQrCode } from '@/lib/waitForImages';
import { printBill } from '@/lib/printBill';

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const t = useTranslations('Invoices');
  const { id } = use(params);
  const router = useRouter();
  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [confirmReturnId, setConfirmReturnId] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);
  const componentRef = useRef<HTMLDivElement>(null);
  const { user } = useAuthStore();
  const { profile, fetchProfile, activeShopId, allShops } = useBusinessStore();
  const activeShopEntry = allShops.find(s => s.id === activeShopId) ?? null;
  const activeShopName = activeShopEntry?.name || profile?.shopName;

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const res = await api.get(`/billing/${id}`);
        setInvoice(res.data);
      } catch (err) {
        console.error('Failed to fetch invoice detail', err);
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [id]);

  const handleDownloadPDF = async () => {
    if (!invoice || !componentRef.current) return;
    setDownloading(true);
    let clone: HTMLElement | null = null;
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas-pro'),
        import('jspdf'),
      ]);

      await waitForQrCode(componentRef.current, !!billData.upiId);

      clone = componentRef.current.cloneNode(true) as HTMLElement;
      clone.classList.remove('hidden');
      clone.style.display = 'block';
      clone.style.position = 'fixed';
      clone.style.top = '0';
      clone.style.left = '-9999px';
      const isA4 = billData.invoiceFormat === 'a4' || billData.invoiceFormat === 'wholesale';
      clone.style.width = isA4 ? '800px' : '320px';
      clone.style.height = 'auto';
      clone.style.backgroundColor = '#ffffff';
      clone.style.visibility = 'visible';
      document.body.appendChild(clone);

      await waitForImages(clone);

      // scale 2.2 is still noticeably sharper than the original blurry
      // capture, without the page ballooning past ~100KB. JPEG (not PNG)
      // does the rest of the size work — this is a document of white space,
      // thin borders and text, which JPEG compresses far better than
      // lossless PNG; only the QR/barcode's fine detail resists it much.
      const canvas = await html2canvas(clone, {
        scale: pickCaptureScale(clone.scrollWidth, clone.scrollHeight),
        useCORS: true,
        backgroundColor: '#ffffff',
        windowWidth: isA4 ? 800 : 320
      });

      const imgData = canvas.toDataURL('image/png');
      const pdfWidth = isA4 ? 210 : 80;
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [pdfWidth, pdfHeight]
      });

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`bill-${invoice.id.substring(0, 8)}.pdf`);
    } catch (err) {
      console.error('PDF Download Error', err);
      alert(t('pdfGenerationFailed'));
    } finally {
      if (clone && clone.parentNode) clone.parentNode.removeChild(clone);
      setDownloading(false);
    }
  };

  const handlePrint = async () => {
    if (componentRef.current) await waitForQrCode(componentRef.current, !!billData.upiId);
    printBill();
  };

  const handleReturnItem = async (itemId: string, remaining: number) => {
    if (confirmReturnId !== itemId) { setConfirmReturnId(itemId); return; }
    setReturning(true);
    try {
      await api.post('/billing/returns', { bill_id: invoice.id, items: [{ item_id: itemId, quantity: remaining }] });
      const res = await api.get(`/billing/${id}`);
      setInvoice(res.data);
      setConfirmReturnId(null);
      alert(t('returnItemSuccess'));
    } catch (e: any) {
      alert(e?.response?.data?.detail || t('returnFailed'));
    } finally {
      setReturning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] gap-4">
        <RefreshCw className="animate-spin text-emerald-500" size={40} />
        <p className="text-slate-400 font-medium">{t('fetchingDetails')}</p>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] gap-6">
        <div className="w-20 h-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl flex items-center justify-center shadow-sm">
          <Clock size={40} className="text-slate-400 dark:text-slate-700" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{t('invoiceNotFound')}</h2>
          <p className="text-slate-500 mt-1">{t('invoiceNotFoundHint')}</p>
        </div>
        <Link href="/billing/invoices" className="bg-emerald-500 text-white dark:text-slate-900 px-8 py-3 rounded-2xl font-bold hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20">
          {t('backToHistory')}
        </Link>
      </div>
    );
  }

  // Mill (mill_v2) invoices have their own invoice: it prints the STORED figures and stored invoice number. The legacy
  // template below (inclusive GST, id-derived bill number) is never used for them.
  if (isMillInvoice(invoice)) {
    return (
      <div className="max-w-4xl mx-auto py-10 text-center">
        <Link href="/billing/invoices" className="text-emerald-600 font-bold text-sm">{t('backToHistory')}</Link>
        <MillInvoicePreviewModal invoiceId={invoice.id} onClose={() => router.push('/billing/invoices' as any)} />
      </div>
    );
  }

  const gstDetails = invoice.gst_details
    ? (typeof invoice.gst_details === 'string' ? JSON.parse(invoice.gst_details) : invoice.gst_details)
    : undefined;

  // Wholesale vs Retail — NOT derivable from customer_id: the server
  // auto-links/creates a Customer by name whenever one is typed (POST
  // /billing), including for a plain Retail walk-in sale, so customer_id
  // being set never safely means "this was a Wholesale sale". The real
  // signal is pricingMode, which WholesaleBillingUI stamps into
  // payment_details at the time of billing. Absent on bills saved before
  // this field existed — those show no badge rather than a guess.
  const paymentDetailsParsed = invoice.payment_details
    ? (typeof invoice.payment_details === 'string' ? JSON.parse(invoice.payment_details) : invoice.payment_details)
    : undefined;
  const pricingMode: 'wholesale' | 'retail' | undefined =
    paymentDetailsParsed?.pricingMode === 'wholesale' || paymentDetailsParsed?.pricingMode === 'retail'
      ? paymentDetailsParsed.pricingMode
      : undefined;

  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const totalAmount = Number(invoice.total_amount) || 0;
  const discountAmount = Number(invoice.discount_amount) || 0;
  const gstAmount = Number(invoice.gst_amount) || 0;
  // charges_total is a Mill-only sale column (null on legacy bills) — for
  // Dukan/Vyapar/Udyog bills, reconstruct it from the discount-exempt charge
  // lines (Transport/Loading/Packing/Other) themselves, which are now always
  // shown at their full, undiscounted amount (see GET /billing/[identifier]).
  const chargesFromItems = items.reduce((s: number, i: any) => s + (i.is_charge ? (Number(i.total) || 0) : 0), 0);
  const chargesTotal = Number(invoice.charges_total) || chargesFromItems;
  const roundOffAmount = Number(invoice.round_off_amount) || 0;

  const billData = {
    items: items.map((i: any) => ({
      id: i.id,
      name: i.name,
      unit: i.unit,
      quantity: i.quantity,
      price: i.price_per_unit,
      total: i.total,
      hsnCode: i.hsnCode || '',
      gstPercent: i.gstPercent || 0,
      // Which colour/size this line was actually billed at — ThermalInvoice/
      // A4Invoice already know how to print this, it just never had the data.
      variant: i.variant || undefined,
      color: i.color || undefined,
      size: i.size || undefined,
    })),
    total: totalAmount,
    paymentMethod: invoice.payment_type,
    amountPaid: invoice.amount_paid ?? (invoice.payment_type === 'Udhar' ? 0 : totalAmount),
    remainingAmount: Math.max(0, totalAmount - (invoice.amount_paid ?? (invoice.payment_type === 'Udhar' ? 0 : totalAmount))),
    billNumber: `INV-${invoice.id.substring(0, 8)}`,
    date: fmtDate(invoice.created_at),
    storeName: activeShopName || user?.storeName || 'Store',
    storeAddress: profile?.address || undefined,
    storeMobile: profile?.mobile || undefined,
    logoUrl: profile?.logoUrl || undefined,
    gst: profile?.gst || undefined,
    pan: profile?.pan || undefined,
    invoiceFormat: profile?.invoiceFormat || 'thermal80',
    invoiceTheme: profile?.invoiceTheme || 'standard',
    invoiceColor: profile?.invoiceColor || null,
    businessType: profile?.businessType || 'kirana',
    showQrCode: profile?.showQrCode || false,
    invoiceFooter: profile?.invoiceFooter || undefined,
    ownerSignature: profile?.signatureUrl || undefined,
    // Scan-to-pay QR is wholesale-A4-only — reprints follow the same rule so a
    // retail / thermal reprint never surfaces it. See WholesaleBillingUI.
    upiId: ((isWholesaleTierPackage(profile?.subscriptionPlan) || isWholesaleTierPackage(profile?.packageType))
      && (profile?.invoiceFormat === 'a4' || profile?.invoiceFormat === 'wholesale'))
      ? (profile?.upiId || undefined)
      : undefined,
    bankName: profile?.bankName || undefined,
    bankAccountName: profile?.bankAccountName || undefined,
    bankAccountNumber: profile?.bankAccountNumber || undefined,
    bankIfsc: profile?.bankIfsc || undefined,
    customerName: invoice.customer_name || undefined,
    splitPayments: invoice.payment_type === 'Split' ? (typeof invoice.payment_details === 'string' ? JSON.parse(invoice.payment_details) : invoice.payment_details) : undefined,
    // GST invoice data (from stored bill_type / gst_details)
    billType: invoice.bill_type || 'non_gst',
    gstBreakdown: gstDetails,
    isEmi: invoice.payment_type === 'EMI',
  };

  const paymentStatusLabel = billData.remainingAmount <= 0 ? t('paidStatus') : billData.amountPaid > 0 ? t('partiallyPaidStatus') : t('creditUdharStatus');
  const paymentStatusColor = billData.remainingAmount <= 0 ? 'text-emerald-500' : billData.amountPaid > 0 ? 'text-amber-500' : 'text-orange-500';

  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-in fade-in duration-500 pb-20 relative">
      {/* ── PRINT-ONLY CONTAINER ── */}
      <div id="print-area" className="hidden print:block print:absolute print:inset-0 print:z-[9999] bg-white">
        <BillSlip {...billData} />
      </div>

      {/* ── SCREEN-ONLY UI ── */}
      <div className="print:hidden space-y-5">
        {/* Hidden element for PDF generation capture */}
        <div className="hidden">
          <div ref={componentRef} className="bg-white">
            <BillSlip {...billData} />
          </div>
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-600">
          <Link href="/" className="hover:text-emerald-500 transition-colors">{t('dashboard')}</Link>
          <ChevronRight size={10} />
          <Link href="/billing/invoices" className="hover:text-emerald-500 transition-colors">{t('invoicesBreadcrumb')}</Link>
          <ChevronRight size={10} />
          <span className="text-slate-400">INV-{invoice.id.substring(0, 8)}</span>
        </div>

        {/* ① Hero strip */}
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
          <CardContent className="p-5 flex flex-col md:flex-row md:items-center gap-4">
            <Link href="/billing/invoices" className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-2xl text-slate-500 hover:text-slate-900 dark:hover:text-white transition-all self-start shrink-0">
              <ArrowLeft size={20} />
            </Link>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mb-2">
                INV-{invoice.id.substring(0, 8).toUpperCase()}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn(
                  "text-[10px] font-black px-3 py-1 rounded-full border uppercase tracking-wider",
                  invoice.payment_type === 'Cash' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                  invoice.payment_type === 'UPI' ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" :
                  "bg-orange-500/10 text-orange-400 border-orange-500/20"
                )}>
                  {invoice.payment_type}
                </span>
                <span className={cn(
                  "text-[10px] font-black px-3 py-1 rounded-full border uppercase tracking-wider",
                  billData.billType === 'gst'
                    ? "bg-indigo-500/10 text-indigo-500 border-indigo-500/20"
                    : "bg-slate-500/10 text-slate-500 border-slate-500/20"
                )}>
                  {billData.billType === 'gst' ? t('gstInvoiceBadge') : t('nonGstInvoiceBadge')}
                </span>
                {(isWholesaleTierPackage(profile?.subscriptionPlan) || isWholesaleTierPackage(profile?.packageType)) && pricingMode && (
                  <span className={cn(
                    "text-[10px] font-black px-3 py-1 rounded-full border uppercase tracking-wider",
                    pricingMode === 'wholesale'
                      ? "bg-purple-500/10 text-purple-500 border-purple-500/20"
                      : "bg-teal-500/10 text-teal-500 border-teal-500/20"
                  )}>
                    {pricingMode === 'wholesale' ? t('wholesaleSaleBadge') : t('retailSaleBadge')}
                  </span>
                )}
                <span className="text-[11px] text-slate-400 font-medium">
                  {new Date(invoice.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <div className="text-right">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('grandTotal')}</p>
                <p className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter">₹{totalAmount.toLocaleString('en-IN')}</p>
              </div>
              <button
                onClick={handlePrint}
                className="hidden md:flex items-center gap-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-5 py-3 rounded-2xl font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all"
              >
                <Printer size={18} /> {t('printRecord')}
              </button>
            </div>
          </CardContent>
        </Card>

        {/* ② Quick stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
              <Package size={11} /> {t('totalItems')}
            </p>
            <p className="text-2xl font-black text-slate-900 dark:text-white">{items.length}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
              <User size={11} /> {t('customer')}
            </p>
            <p className="text-lg font-black text-slate-900 dark:text-white truncate">{invoice.customer_name || '—'}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
              <CreditCard size={11} /> {t('paymentStatus')}
            </p>
            <p className={cn("text-lg font-black uppercase tracking-wide", paymentStatusColor)}>{paymentStatusLabel}</p>
          </div>
        </div>

        {/* ③ Items table — full width */}
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
          <CardHeader className="bg-slate-50 dark:bg-slate-800/20 border-b border-slate-200 dark:border-slate-800 p-5">
            <CardTitle className="text-sm font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2 uppercase tracking-widest">
              <Package size={15} className="text-emerald-500" /> {t('purchasedItems')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto w-full">
            <table className="w-full text-left min-w-[500px]">
              <thead className="bg-slate-100 dark:bg-slate-800/30 text-slate-500 text-[10px] font-black uppercase tracking-widest border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4">{t('colProductName')}</th>
                  <th className="px-6 py-4 text-center">{t('colHsn')}</th>
                  <th className="px-6 py-4 text-center">{t('colQty')}</th>
                  <th className="px-6 py-4 text-right">{t('colPrice')}</th>
                  <th className="px-6 py-4 text-right">{t('colGstPercent')}</th>
                  <th className="px-6 py-4 text-right">{t('colTotal')}</th>
                  <th className="px-6 py-4 text-center w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50 text-slate-900 dark:text-slate-200">
                {items.map((item: any) => {
                  const remaining = Math.max(0, (item.quantity || 0) - (item.returned_quantity || 0));
                  const isPending = confirmReturnId === item.id;
                  return (
                  <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold">{item.name}</div>
                      {(item.color || item.size || item.variant) && (
                        <div className="text-[10px] text-slate-500 font-semibold">
                          {[item.color, item.size].filter(Boolean).join(' / ') || item.variant}
                        </div>
                      )}
                      <div className="text-[10px] text-slate-500 font-bold uppercase">{item.unit}</div>
                    </td>
                    <td className="px-6 py-4 text-center text-slate-500 font-medium">{item.hsnCode || '-'}</td>
                    <td className="px-6 py-4 text-center font-black">
                      {item.quantity}
                      {item.returned_quantity > 0 && (
                        <div className="text-[10px] text-orange-500 font-bold">−{item.returned_quantity} {t('returnedBadge')}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right text-slate-600 dark:text-slate-400 font-medium">₹{(Number(item.price_per_unit) || 0).toLocaleString('en-IN')}</td>
                    <td className="px-6 py-4 text-right text-slate-600 dark:text-slate-400 font-medium">{item.gstPercent ? `${item.gstPercent}%` : '-'}</td>
                    <td className="px-6 py-4 text-right font-black">₹{(Number(item.total) || 0).toLocaleString('en-IN')}</td>
                    <td className="px-6 py-4 text-center">
                      {!item.is_charge && remaining > 0 && (
                        <button
                          onClick={() => handleReturnItem(item.id, remaining)}
                          disabled={returning}
                          title={t('returnItemBtn')}
                          className={cn(
                            'flex items-center gap-1 mx-auto px-2 py-1 rounded-lg text-[10px] font-bold transition-all',
                            isPending
                              ? 'bg-orange-500 text-white hover:bg-orange-600'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-orange-500 hover:bg-orange-500/10'
                          )}
                        >
                          <RotateCcw size={11} />
                          {isPending ? t('confirmReturn') : t('returnItemBtn')}
                        </button>
                      )}
                      {!item.is_charge && remaining === 0 && item.returned_quantity > 0 && (
                        <span className="text-[10px] text-slate-400 font-medium">{t('returnedBadge')}</span>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Exchange / Returns section — full width, below table */}
        {Array.isArray(invoice.returns) && invoice.returns.length > 0 && (
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
            <CardHeader className="bg-amber-500/5 border-b border-amber-500/10 p-5">
              <CardTitle className="text-sm font-bold text-amber-500 flex items-center gap-2 uppercase tracking-widest">
                <ArrowRightLeft size={15} /> {t('exchangeSection')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              {invoice.returns.map((r: any, i: number) => (
                <div key={i} className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 font-medium">{t('returnedItem')}</span>
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      {r.itemName} × {r.quantity} — ₹{Number(r.amount).toLocaleString('en-IN')}
                    </span>
                  </div>
                  {r.exchange && r.exchangeInvoiceNumber && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500 font-medium">{t('exchangeInvoiceLabel')}</span>
                      <span className="font-black text-amber-600 dark:text-amber-400 tracking-wide">{r.exchangeInvoiceNumber}</span>
                    </div>
                  )}
                  {r.exchange && Array.isArray(r.exchangedFor) && r.exchangedFor.length > 0 && (
                    <div>
                      <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">{t('exchangedForLabel')}</p>
                      <div className="space-y-1">
                        {r.exchangedFor.map((e: any, j: number) => (
                          <div key={j} className="flex items-center justify-between text-sm bg-slate-50 dark:bg-slate-800/50 rounded-xl px-3 py-2">
                            <span className="font-bold text-slate-800 dark:text-slate-200">{e.name}{e.variant ? ` (${e.variant})` : ''}</span>
                            <span className="text-slate-500 font-medium">{e.quantity} × ₹{Number(e.price).toLocaleString('en-IN')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* ④ Bottom 3-col: Bill summary | Customer | Payment + Download */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Bill summary */}
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
            <CardHeader className="bg-emerald-500/5 border-b border-emerald-500/10 p-5">
              <CardTitle className="text-sm font-bold text-emerald-500 flex items-center gap-2 uppercase tracking-widest">
                {t('billSummary')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-3">
              {discountAmount > 0 && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500 font-medium">{t('subtotal')}</span>
                    <span className="text-slate-900 dark:text-slate-100 font-bold">₹{(totalAmount + discountAmount).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500 font-medium">{t('discountApplied')}</span>
                    <span className="text-orange-500 font-bold">− ₹{discountAmount.toLocaleString('en-IN')}</span>
                  </div>
                </>
              )}
              {gstAmount > 0 && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500 font-medium">{t('taxableValue')}</span>
                    <span className="text-slate-900 dark:text-slate-100 font-bold">₹{Math.max(0, totalAmount - gstAmount - chargesTotal).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500 font-medium">{t('gstAmount')}</span>
                    <span className="text-slate-900 dark:text-slate-100 font-bold">₹{gstAmount.toLocaleString('en-IN')}</span>
                  </div>
                </>
              )}
              {chargesTotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 font-medium">{t('chargesTotal')}</span>
                  <span className="text-slate-900 dark:text-slate-100 font-bold">₹{chargesTotal.toLocaleString('en-IN')}</span>
                </div>
              )}
              {roundOffAmount !== 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 font-medium">{t('roundOff')}</span>
                  <span className="text-slate-900 dark:text-slate-100 font-bold">₹{roundOffAmount.toLocaleString('en-IN')}</span>
                </div>
              )}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center">
                <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">{t('grandTotal')}</span>
                <span className="text-2xl font-black text-slate-900 dark:text-white">₹{totalAmount.toLocaleString('en-IN')}</span>
              </div>
            </CardContent>
          </Card>

          {/* Customer info */}
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
            <CardHeader className="bg-slate-50 dark:bg-slate-800/20 border-b border-slate-200 dark:border-slate-800 p-5">
              <CardTitle className="text-sm font-bold text-slate-500 flex items-center gap-2 uppercase tracking-widest">
                <User size={14} /> {t('customer')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{t('customer')}</p>
                <p className="text-slate-900 dark:text-slate-100 font-bold">{invoice.customer_name || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{t('billType')}</p>
                <p className={cn("font-bold uppercase tracking-wide text-sm", billData.billType === 'gst' ? "text-indigo-500" : "text-slate-500")}>
                  {billData.billType === 'gst' ? t('gstInvoiceBadge') : t('nonGstInvoiceBadge')}
                </p>
              </div>
              {(isWholesaleTierPackage(profile?.subscriptionPlan) || isWholesaleTierPackage(profile?.packageType)) && pricingMode && (
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{t('pricingType')}</p>
                  <p className={cn("font-bold uppercase tracking-wide text-sm", pricingMode === 'wholesale' ? "text-purple-500" : "text-teal-500")}>
                    {pricingMode === 'wholesale' ? t('wholesaleSaleBadge') : t('retailSaleBadge')}
                  </p>
                </div>
              )}
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{t('date')}</p>
                <p className="text-slate-900 dark:text-slate-100 font-bold">{fmtDate(invoice.created_at)}</p>
              </div>
            </CardContent>
          </Card>

          {/* Payment + Download */}
          <div className="space-y-4">
            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
              <CardHeader className="bg-slate-50 dark:bg-slate-800/20 border-b border-slate-200 dark:border-slate-800 p-5">
                <CardTitle className="text-sm font-bold text-slate-500 flex items-center gap-2 uppercase tracking-widest">
                  <CreditCard size={14} /> {t('paymentMode')}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{t('paymentMode')}</p>
                  <p className="text-slate-900 dark:text-slate-100 font-bold">{invoice.payment_type}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{t('paymentStatus')}</p>
                  <p className={cn("font-black uppercase tracking-wide text-sm", paymentStatusColor)}>{paymentStatusLabel}</p>
                </div>
                {billData.amountPaid > 0 && billData.remainingAmount > 0 && (
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{t('remainingAmount') || 'Remaining'}</p>
                    <p className="text-orange-500 font-black">₹{billData.remainingAmount.toLocaleString('en-IN')}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <button
              onClick={handleDownloadPDF}
              disabled={downloading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-2xl font-bold transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {downloading ? <RefreshCw size={18} className="animate-spin" /> : <Download size={18} />}
              {t('downloadPdfReceipt')}
            </button>
          </div>
        </div>

        {/* Original Bill (manual uploads only) */}
        {invoice.is_manual && invoice.bill_image_url && (
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
            <CardHeader className="bg-amber-500/5 border-b border-amber-500/10 p-5">
              <CardTitle className="text-sm font-bold text-amber-600 dark:text-amber-400 flex items-center gap-2 uppercase tracking-widest">
                {t('originalBill')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {/\.pdf(\?|$)/i.test(invoice.bill_image_url) ? (
                <a
                  href={invoice.bill_image_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 py-6 text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 font-semibold text-sm border border-dashed border-slate-200 dark:border-slate-700 rounded-xl transition-colors"
                >
                  {t('viewUploadedPdf')}
                </a>
              ) : (
                <a href={invoice.bill_image_url} target="_blank" rel="noopener noreferrer">
                  <img
                    src={invoice.bill_image_url}
                    alt="Uploaded bill"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 object-contain max-h-80"
                  />
                </a>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
