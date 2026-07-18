'use client';

import { useState, useEffect, use, useRef } from 'react';
import { useTranslations } from 'next-intl';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/routing';
import { IndianRupee, ArrowLeft, RefreshCw, Calendar, User, Package, Clock, Printer, CreditCard, ChevronRight, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BillSlip } from '@/components/BillSlip';
import { useAuthStore } from '@/lib/store';

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const componentRef = useRef<HTMLDivElement>(null);
  const { user } = useAuthStore();

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
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas-pro'),
        import('jspdf'),
      ]);

      // Create a clean clone
      const clone = componentRef.current.cloneNode(true) as HTMLElement;
      
      // CRITICAL: Remove the 'hidden' or 'display: none' styles/classes from the clone
      clone.classList.remove('hidden');
      clone.style.display = 'block';
      clone.style.position = 'fixed';
      clone.style.top = '0';
      clone.style.left = '-9999px';
      clone.style.width = '320px';
      clone.style.height = 'auto';
      clone.style.backgroundColor = '#ffffff';
      clone.style.visibility = 'visible';
      document.body.appendChild(clone);

      // Wait for layout
      await new Promise(r => setTimeout(r, 200));
      
      const canvas = await html2canvas(clone, { 
        scale: 3,
        useCORS: true,
        backgroundColor: '#ffffff',
        windowWidth: 320
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdfWidth = 80;
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      const pdf = new jsPDF({ 
        orientation: 'portrait', 
        unit: 'mm', 
        format: [pdfWidth, pdfHeight] 
      });
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`bill-${invoice.id.substring(0, 8)}.pdf`);
      document.body.removeChild(clone);
    } catch (err) {
      console.error('PDF Download Error', err);
      alert('Failed to generate PDF');
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] gap-4">
        <RefreshCw className="animate-spin text-emerald-500" size={40} />
        <p className="text-slate-400 font-medium">Fetching invoice details...</p>
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
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Invoice Not Found</h2>
          <p className="text-slate-500 mt-1">This record might have been deleted or moved.</p>
        </div>
        <Link href="/billing/invoices" className="bg-emerald-500 text-white dark:text-slate-900 px-8 py-3 rounded-2xl font-bold hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20">
          Back to History
        </Link>
      </div>
    );
  }

  const gstDetails = invoice.gst_details
    ? (typeof invoice.gst_details === 'string' ? JSON.parse(invoice.gst_details) : invoice.gst_details)
    : undefined;

  const billData = {
    items: invoice.items.map((i: any) => ({
      id: i.id,
      name: i.name,
      unit: i.unit,
      quantity: i.quantity,
      price: i.price_per_unit,
      total: i.total,
      hsnCode: i.hsnCode || '',
      gstPercent: i.gstPercent || 0,
    })),
    total: invoice.total_amount,
    paymentMethod: invoice.payment_type,
    amountPaid: invoice.amount_paid ?? (invoice.payment_type === 'Udhar' ? 0 : invoice.total_amount),
    remainingAmount: Math.max(0, invoice.total_amount - (invoice.amount_paid ?? (invoice.payment_type === 'Udhar' ? 0 : invoice.total_amount))),
    billNumber: `INV-${invoice.id.substring(0, 8)}`,
    date: new Date(invoice.created_at).toLocaleDateString(),
    storeName: user?.storeName || 'Store',
    customerName: invoice.customer_name || undefined,
    splitPayments: invoice.payment_type === 'Split' ? (typeof invoice.payment_details === 'string' ? JSON.parse(invoice.payment_details) : invoice.payment_details) : undefined,
    // GST invoice data (from stored bill_type / gst_details)
    billType: invoice.bill_type || 'non_gst',
    gstBreakdown: gstDetails,
    isEmi: invoice.payment_type === 'EMI',
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20 relative">
      {/* ── PRINT-ONLY CONTAINER ── */}
      <div id="print-area" className="hidden print:block print:absolute print:inset-0 print:z-[9999] bg-white">
        <BillSlip {...billData} />
      </div>

      {/* ── SCREEN-ONLY UI ── */}
      <div className="print:hidden space-y-8">
        {/* Hidden element for PDF generation capture */}
        <div className="hidden">
          <div ref={componentRef} className="bg-white">
            <BillSlip {...billData} />
          </div>
        </div>

        {/* Breadcrumbs & Header */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-600">
            <Link href="/" className="hover:text-emerald-500 transition-colors">Dashboard</Link>
            <ChevronRight size={10} />
            <Link href="/billing/invoices" className="hover:text-emerald-500 transition-colors">Invoices</Link>
            <ChevronRight size={10} />
            <span className="text-slate-400">INV-{invoice.id.substring(0, 8)}</span>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-5">
              <Link href="/billing/invoices" className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-500 hover:text-slate-900 dark:hover:text-white transition-all shadow-sm">
                <ArrowLeft size={24} />
              </Link>
              <div>
                <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
                  INV-{invoice.id.substring(0, 8).toUpperCase()}
                  <span className={cn(
                    "text-[10px] font-black px-3 py-1 rounded-full border uppercase tracking-wider",
                    invoice.payment_type === 'Cash' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                    invoice.payment_type === 'UPI' ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" :
                    "bg-orange-500/10 text-orange-400 border-orange-500/20"
                  )}>
                    {invoice.payment_type}
                  </span>
                </h1>
                <p className="text-slate-500 text-sm font-medium mt-1">Record created on {new Date(invoice.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            </div>
            <button 
              onClick={handlePrint}
              className="hidden md:flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-6 py-3 rounded-2xl font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-all shadow-sm"
            >
              <Printer size={18} /> Print Record
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Left Column: Items */}
          <div className="md:col-span-2 space-y-6 min-w-0">
            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xl">
              <CardHeader className="bg-slate-50 dark:bg-slate-800/20 border-b border-slate-200 dark:border-slate-800 p-6">
                <CardTitle className="text-sm font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2 uppercase tracking-widest">
                  <Package size={16} className="text-emerald-500" /> Purchased Items
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto w-full">
                <table className="w-full text-left min-w-[500px]">
                  <thead className="bg-slate-100 dark:bg-slate-800/30 text-slate-500 text-[10px] font-black uppercase tracking-widest border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-6 py-4">Product Name</th>
                      <th className="px-6 py-4 text-center">Qty</th>
                      <th className="px-6 py-4 text-right">Price</th>
                      <th className="px-6 py-4 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50 text-slate-900 dark:text-slate-200">
                    {invoice.items.map((item: any) => (
                      <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-bold">{item.name}</div>
                          <div className="text-[10px] text-slate-500 font-bold uppercase">{item.unit}</div>
                        </td>
                        <td className="px-6 py-4 text-center font-black">{item.quantity}</td>
                        <td className="px-6 py-4 text-right text-slate-600 dark:text-slate-400 font-medium">₹{item.price_per_unit.toLocaleString('en-IN')}</td>
                        <td className="px-6 py-4 text-right font-black">₹{item.total.toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Summary & Info */}
          <div className="space-y-6">
            {/* Summary Card */}
            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xl border-b-4 border-b-emerald-500/20 dark:border-b-emerald-500/20">
              <CardHeader className="bg-emerald-500/5 border-b border-emerald-500/10 p-6">
                <CardTitle className="text-sm font-bold text-emerald-500 flex items-center gap-2 uppercase tracking-widest">
                  Bill Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 font-medium tracking-tight">Total Items</span>
                  <span className="text-slate-900 dark:text-slate-100 font-bold">{invoice.items.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 font-medium tracking-tight">Payment Status</span>
                  <span className={cn(
                    "font-bold uppercase tracking-wider text-xs",
                    billData.remainingAmount <= 0 ? "text-emerald-500" : billData.amountPaid > 0 ? "text-amber-500" : "text-orange-500"
                  )}>
                    {billData.remainingAmount <= 0 ? 'Paid' : billData.amountPaid > 0 ? 'Partially Paid' : 'Credit (Udhar)'}
                  </span>
                </div>
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-between items-end">
                  <span className="text-sm font-bold text-slate-400 uppercase tracking-widest pb-1">Grand Total</span>
                  <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter">₹{invoice.total_amount.toLocaleString('en-IN')}</span>
                </div>
              </CardContent>
            </Card>

            {/* Original Bill (manual uploads only) */}
            {invoice.is_manual && invoice.bill_image_url && (
              <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xl">
                <CardHeader className="bg-amber-500/5 border-b border-amber-500/10 p-6">
                  <CardTitle className="text-sm font-bold text-amber-600 dark:text-amber-400 flex items-center gap-2 uppercase tracking-widest">
                    Original Bill
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
                      View uploaded PDF
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

            {/* Customer Info Card */}
            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xl">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-500">
                    <User size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Customer</p>
                    <p className="text-slate-900 dark:text-slate-100 font-bold">{invoice.customer_name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-500">
                    <CreditCard size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Payment Mode</p>
                    <p className="text-slate-900 dark:text-slate-100 font-bold">{invoice.payment_type}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-500">
                    <Calendar size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Date</p>
                    <p className="text-slate-900 dark:text-slate-100 font-bold">{new Date(invoice.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <button 
              onClick={handleDownloadPDF}
              disabled={downloading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-2xl font-bold transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {downloading ? (
                <RefreshCw size={18} className="animate-spin" />
              ) : (
                <Download size={18} />
              )}
              Download PDF Receipt
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
