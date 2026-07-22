'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import api from '@/lib/api';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from '@/components/ui/card';
import { 
  RotateCcw, 
  Search, 
  Package, 
  AlertCircle, 
  CheckCircle,
  ArrowRight,
  History,
  X,
  Download,
  FileText,
  IndianRupee,
  Calendar,
  Eye
} from 'lucide-react';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function ReturnsPage() {
  const t = useTranslations('Returns');
  const locale = useLocale();
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [bill, setBill] = useState<any>(null);
  const [returnItems, setReturnItems] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [historyTimeframe, setHistoryTimeframe] = useState('Last 30 Days');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [returnsHistory, setReturnsHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState<any>(null);

  const downloadReturnPDF = (ret: any) => {
    let noteData: any = {};
    try {
      if (ret.note) noteData = JSON.parse(ret.note);
    } catch (e) {}

    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text('Return Receipt', 14, 22);

    doc.setFontSize(10);
    doc.text(`Date: ${new Date(ret.date).toLocaleDateString()}`, 14, 32);
    if (noteData.invoiceNumber) {
      doc.text(`Original Invoice: ${noteData.invoiceNumber}`, 14, 38);
    }
    if (noteData.customerName) {
      doc.text(`Customer: ${noteData.customerName}`, 14, 44);
    }

    autoTable(doc, {
      startY: 50,
      head: [['Product Name', 'Reason', 'Quantity', 'Total Refund']],
      body: [
        [
          ret.itemName || 'Unknown Item',
          ret.reason || 'Customer Return',
          ret.quantity.toString(),
          `Rs ${ret.amount.toLocaleString()}`
        ]
      ],
      theme: 'grid',
      headStyles: { fillColor: [249, 115, 22] } // orange-500
    });

    doc.save(`Return_Receipt_${ret.id.substring(0, 8)}.pdf`);
  };

  useEffect(() => {
    fetchHistory();
  }, [historyTimeframe, customStartDate, customEndDate]);

  const fetchHistory = async () => {
    if (historyTimeframe === 'Custom' && (!customStartDate || !customEndDate)) {
      return; // Do not fetch until both dates are selected
    }

    setLoadingHistory(true);
    try {
      let start = new Date();
      let end = new Date();
      
      if (historyTimeframe === 'Today') {
        // Keep start and end as today
      } else if (historyTimeframe === 'Last 7 Days') {
        start.setDate(start.getDate() - 6);
      } else if (historyTimeframe === 'Last 30 Days') {
        start.setDate(start.getDate() - 29);
      } else if (historyTimeframe === 'This Year') {
        start.setMonth(0, 1);
        start.setDate(1);
      } else if (historyTimeframe === 'Custom') {
        start = new Date(customStartDate);
        end = new Date(customEndDate);
      }
      
      const res = await api.get(`/returns?start_date=${start.toISOString().split('T')[0]}&end_date=${end.toISOString().split('T')[0]}`);
      setReturnsHistory(res.data);
    } catch (err) {
      console.error('Failed to fetch returns history', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchBill = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      // URL encode to handle special characters like #
      const res = await api.get(`/billing/${encodeURIComponent(searchQuery.trim())}`);
      
      if (!res.data || Array.isArray(res.data)) {
        throw new Error('Invoice not found or invalid response');
      }

      setBill(res.data);
      // Initialize returnable items (quantity 0 initially)
      if (res.data.items) {
        const availableItems = res.data.items
          .filter((item: any) => (item.quantity - (item.returned_quantity || 0)) > 0)
          .map((item: any) => ({ 
            ...item, 
            availableQty: item.quantity - (item.returned_quantity || 0),
            returnQty: 0, 
            returnReason: 'Customer Return' 
          }));
        
        setReturnItems(availableItems);
        
        if (availableItems.length === 0) {
          alert(t('allReturned') || 'All items from this invoice have already been returned.');
        }
      } else {
        setReturnItems([]);
      }
    } catch (err: any) {
      console.error('Failed to fetch bill detail:', err);
      // Better error detail logging
      const errorDetail = {
        status: err.response?.status || err.status,
        data: err.response?.data || err.data,
        message: err.message || (typeof err === 'string' ? err : JSON.stringify(err))
      };
      console.error('Failed to fetch bill detail error detail:', errorDetail);
      alert(`Error: ${errorDetail.data?.detail || errorDetail.message || 'Bill not found or error fetching data'}`);
      setBill(null);
    } finally {
      setLoading(false);
    }
  };

  const handleReturnSubmit = async () => {
    const itemsToReturn = returnItems.filter(item => item.returnQty > 0);
    if (itemsToReturn.length === 0) return;

    setSubmitting(true);
    try {
      await api.post(`/billing/returns`, {
        bill_id: bill.id,
        items: itemsToReturn.map(item => ({
          item_id: item.id,
          quantity: item.returnQty,
          reason: item.returnReason || 'Customer Return',
          product_id: item.product_id,
          name: item.name,
          price: item.price_per_unit
        }))
      });
      alert('Return processed successfully!');
      setBill(null);
      setReturnItems([]);
      setSearchQuery('');
      fetchHistory(); // refresh history
    } catch (err: any) {
      console.error('Failed to process return detail:', err);
      const errorDetail = {
        status: err.response?.status || err.status,
        data: err.response?.data || err.data,
        message: err.message || (typeof err === 'string' ? err : JSON.stringify(err))
      };
      console.error('Failed to process return error detail:', errorDetail);
      alert(`Error processing return: ${errorDetail.data?.detail || errorDetail.message || 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <RotateCcw className="text-orange-500" />
            {t('title') || 'Returns & Refunds'}
          </h1>
          <p className="text-slate-500 text-sm font-medium">{t('subtitle') || 'Process product returns and manage refunds'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Search & Bill Info */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
            <CardHeader>
              <CardTitle className="text-sm font-bold text-slate-900 dark:text-slate-200">{t('findInvoice') || 'Find Invoice'}</CardTitle>
              <CardDescription className="text-xs text-slate-500">{t('enterInvoiceId') || 'Enter Invoice ID to start return'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-emerald-500 transition-all">
                <Search size={18} className="text-slate-500" />
                <input 
                  type="text" 
                  placeholder="INV-XXXXXX"
                  className="bg-transparent border-none text-slate-900 dark:text-white text-sm outline-none w-full"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchBill()}
                />
              </div>
              <button 
                onClick={fetchBill}
                disabled={loading || !searchQuery.trim()}
                className="w-full bg-emerald-500 text-white dark:text-slate-900 py-2.5 rounded-xl font-bold hover:bg-emerald-400 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {loading ? t('searching') || 'Searching...' : t('searchInvoice') || 'Search Invoice'}
              </button>
            </CardContent>
          </Card>

          {bill && (
            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 animate-in slide-in-from-left-4">
              <CardHeader className="border-b border-slate-200 dark:border-slate-800/50 pb-4">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-sm font-bold text-slate-900 dark:text-slate-200">{t('invoiceSummary') || 'Invoice Summary'}</CardTitle>
                  <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    {bill.invoice_number || `ID: ${bill.id.substring(0, 8)}`}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">{t('customer') || 'Customer'}</span>
                  <span className="text-slate-900 dark:text-slate-200 font-bold">{bill.customer_name || t('guest') || 'Guest'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">{t('date') || 'Date'}</span>
                  <span className="text-slate-900 dark:text-slate-200 font-bold">{new Date(bill.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">{t('totalPaid') || 'Total Paid'}</span>
                  <span className="text-slate-900 dark:text-slate-200 font-bold">₹{bill.total_amount.toLocaleString()}</span>
                </div>
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800/50 flex justify-between items-center">
                   <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('payment') || 'Payment'}</span>
                   <span className="bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded text-[10px] font-black uppercase border border-emerald-500/20">
                     {bill.payment_type}
                   </span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Return Items */}
        <div className="lg:col-span-2">
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 h-full flex flex-col shadow-sm">
            <CardHeader className="border-b border-slate-200 dark:border-slate-800/50">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-slate-900 dark:text-slate-200">{t('returnItems') || 'Return Items'}</CardTitle>
                  <CardDescription className="text-slate-500">{t('selectItemsToReturn') || 'Select items and quantity to return'}</CardDescription>
                </div>
                {bill && (
                   <div className="flex items-center gap-2 text-xs font-bold text-orange-400 bg-orange-400/10 px-3 py-1 rounded-full border border-orange-400/20">
                     <History size={14} /> {t('readyForReturn') || 'Ready for Return'}
                   </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-auto">
              {!bill ? (
                <div className="flex flex-col items-center justify-center h-64 text-center p-6">
                  <Package size={48} className="text-slate-200 dark:text-slate-800 mb-4" />
                  <p className="text-slate-500 font-medium">{t('searchInvoicePrompt') || 'Search for an invoice to start processing a return'}</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800/50">
                  {returnItems.map((item, idx) => (
                    <div key={idx} className="p-6 hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <h4 className="font-bold text-slate-900 dark:text-slate-200">{item.name || `Product #${item.product_id}`}</h4>
                        <p className="text-xs text-slate-500">{t('price') || 'Price'}: ₹{item.price_per_unit} | {t('purchased') || 'Purchased'}: {item.quantity} {item.returned_quantity > 0 ? `| Returned: ${item.returned_quantity} | Avail: ${item.availableQty}` : ''}</p>
                        {item.returnQty > 0 && (
                          <div className="mt-2">
                            <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">{t('reason') || 'Reason'}</label>
                            <select 
                              className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-200 rounded px-2 py-1 w-full max-w-[200px]"
                              value={item.returnReason}
                              onChange={e => setReturnItems(prev => prev.map((it, i) => i === idx ? { ...it, returnReason: e.target.value } : it))}
                            >
                              <option value="Customer Return">{t('reasons.customerReturn') || 'Customer Return'}</option>
                              <option value="Damage">{t('reasons.damage') || 'Damage / Breakage'}</option>
                              <option value="Defect">{t('reasons.defect') || 'Manufacturing Defect'}</option>
                              <option value="Wrong Item">{t('reasons.wrongItem') || 'Wrong Item Delivered'}</option>
                              <option value="Expired">{t('reasons.expired') || 'Expired'}</option>
                              <option value="Other">{t('reasons.other') || 'Other Issue'}</option>
                            </select>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <div className="flex items-center bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-1">
                          <button 
                            onClick={() => setReturnItems(prev => prev.map((it, i) => i === idx ? { ...it, returnQty: Math.max(0, it.returnQty - 1) } : it))}
                            className="w-8 h-8 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                          >
                            -
                          </button>
                          <span className="w-10 text-center text-sm font-bold text-slate-900 dark:text-white">
                            {item.returnQty}
                          </span>
                          <button 
                            onClick={() => setReturnItems(prev => prev.map((it, i) => i === idx ? { ...it, returnQty: Math.min(item.availableQty, it.returnQty + 1) } : it))}
                            className="w-8 h-8 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                          >
                            +
                          </button>
                        </div>
                        <div className="w-24 text-right">
                          <p className="text-xs text-slate-500 font-bold uppercase">{t('returnVal') || 'Return Val'}</p>
                          <p className="text-sm font-black text-emerald-400">₹{(item.returnQty * item.price_per_unit).toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
            {bill && (
              <div className="p-6 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-200 dark:border-slate-800 mt-auto">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">{t('totalRefundAmount') || 'Total Refund Amount'}</p>
                    <p className="text-2xl font-black text-slate-900 dark:text-white">
                      ₹{returnItems.reduce((acc, item) => acc + (item.returnQty * item.price_per_unit), 0).toLocaleString()}
                    </p>
                  </div>
                  <button 
                    onClick={handleReturnSubmit}
                    disabled={submitting || returnItems.every(i => i.returnQty === 0)}
                    className="bg-orange-500 text-white px-8 py-3 rounded-xl font-black hover:bg-orange-400 transition-all flex items-center gap-2 active:scale-95 disabled:opacity-30 disabled:active:scale-100 shadow-lg shadow-orange-500/20"
                  >
                    {submitting ? t('processing') || 'Processing...' : t('completeReturn') || 'Complete Return'}
                    <ArrowRight size={18} />
                  </button>
                </div>
                <div className="flex items-start gap-2 text-[10px] text-slate-500 bg-slate-100 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                  <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                  {t('returnWarning') || 'Processing a return will automatically adjust your inventory levels and record a refund transaction in your ledger.'}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      <div className="mt-8 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2">
            <History className="text-purple-500" /> {t('returnHistory') || 'Return History'}
          </h2>
          <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3">
            <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-1 shadow-sm overflow-x-auto max-w-full">
              {[
                { id: 'Today', label: t('today') || 'Today' },
                { id: 'Last 7 Days', label: t('last7Days') || 'Last 7 Days' },
                { id: 'Last 30 Days', label: t('last30Days') || 'Last 30 Days' },
                { id: 'This Year', label: t('thisYear') || 'This Year' },
                { id: 'Custom', label: t('custom') || 'Custom' }
              ].map(tf => (
                <button 
                  key={tf.id} 
                  onClick={() => setHistoryTimeframe(tf.id)} 
                  className={cn(
                    "px-3 py-1.5 text-xs font-bold rounded-md transition-colors whitespace-nowrap",
                    historyTimeframe === tf.id ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  )}
                >
                  {tf.label}
                </button>
              ))}
            </div>
            
            {historyTimeframe === 'Custom' && (
              <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-1.5 shadow-sm animate-in fade-in slide-in-from-right-4">
                <input 
                  type="date" 
                  value={customStartDate} 
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-200 rounded px-2 py-1 outline-none"
                />
                <span className="text-xs text-slate-400 font-bold">-</span>
                <input 
                  type="date" 
                  value={customEndDate} 
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-200 rounded px-2 py-1 outline-none"
                />
              </div>
            )}
          </div>
        </div>

        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
          <CardContent className="p-0">
            {loadingHistory ? (
              <div className="flex justify-center p-8"><CheckCircle className="animate-spin text-slate-500" /></div>
            ) : returnsHistory.length > 0 ? (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase">
                  <tr>
                    <th className="px-6 py-3 font-bold">{t('date') || 'Date'}</th>
                    <th className="px-6 py-3 font-bold">{t('itemName') || 'Item Name'}</th>
                    <th className="px-6 py-3 font-bold">{t('reason') || 'Reason'}</th>
                    <th className="px-6 py-3 font-bold text-right">{t('qty') || 'Qty'}</th>
                    <th className="px-6 py-3 font-bold text-right">{t('value') || 'Value (₹)'}</th>
                    <th className="px-6 py-3 font-bold text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
                  {returnsHistory.map((r: any) => (
                    <tr key={r.id} className="text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">{new Date(r.date).toLocaleDateString()}</td>
                      <td className="px-6 py-4 font-bold">
                        <button 
                          onClick={() => setSelectedReturn(r)} 
                          className="text-emerald-600 dark:text-emerald-400 hover:underline text-left"
                        >
                          {r.itemName}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <span className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-1 rounded text-[10px] font-bold uppercase">{r.reason}</span>
                      </td>
                      <td className="px-6 py-4 text-right font-medium">{r.quantity}</td>
                      <td className="px-6 py-4 text-right font-black text-orange-400">₹{r.amount.toLocaleString()}</td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => setSelectedReturn(r)}
                          className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1.5"
                        >
                          <Eye size={14} /> Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="py-12 flex flex-col items-center text-center">
                <CheckCircle size={32} className="text-emerald-500/50 mb-3" />
                <p className="text-slate-500 font-medium text-sm">
                  {t('noReturns') || 'No returns recorded for'} {[
                    { id: 'Today', label: t('today') || 'Today' },
                    { id: 'Last 7 Days', label: t('last7Days') || 'Last 7 Days' },
                    { id: 'Last 30 Days', label: t('last30Days') || 'Last 30 Days' },
                    { id: 'This Year', label: t('thisYear') || 'This Year' },
                    { id: 'Custom', label: t('custom') || 'Custom' }
                  ].find(tf => tf.id === historyTimeframe)?.label || historyTimeframe}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Return Details Modal */}
      {selectedReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <FileText className="text-orange-500" size={20} />
                  Return Details
                </h2>
                <p className="text-xs text-slate-500 mt-1">ID: {selectedReturn.id}</p>
              </div>
              <button 
                onClick={() => setSelectedReturn(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2 bg-white dark:bg-slate-800 rounded-full border border-slate-200 dark:border-slate-700 shadow-sm"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* Product Info */}
              <div className="bg-orange-50 dark:bg-orange-900/10 rounded-xl p-4 border border-orange-100 dark:border-orange-900/20">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-black text-slate-900 dark:text-white text-lg">{selectedReturn.itemName}</h3>
                    <span className="inline-block bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-1 rounded text-[10px] font-bold uppercase border border-slate-200 dark:border-slate-700 mt-2">
                      Reason: {selectedReturn.reason}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500 font-bold uppercase mb-1">Refund Amount</p>
                    <p className="text-2xl font-black text-orange-500 flex items-center justify-end">
                      <IndianRupee size={18} />
                      {selectedReturn.amount.toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex gap-4 pt-3 border-t border-orange-200 dark:border-orange-900/30">
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase">Returned Qty</p>
                    <p className="font-bold text-slate-900 dark:text-white">{selectedReturn.quantity}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase">Date</p>
                    <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1">
                      <Calendar size={12} className="text-slate-400" />
                      {new Date(selectedReturn.date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Billing Context */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Package size={16} className="text-emerald-500" /> Original Billing Details
                </h4>
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                  {(() => {
                    let noteData: any = null;
                    try {
                      if (selectedReturn.note) noteData = JSON.parse(selectedReturn.note);
                    } catch (e) {}

                    if (noteData) {
                      return (
                        <div className="space-y-3 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Invoice Number</span>
                            <span className="font-bold text-slate-900 dark:text-white">{noteData.invoiceNumber || noteData.billId?.substring(0, 8)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Customer Name</span>
                            <span className="font-bold text-slate-900 dark:text-white">{noteData.customerName || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Payment Type</span>
                            <span className="font-bold text-slate-900 dark:text-white capitalize">{noteData.paymentType || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Sale Date</span>
                            <span className="font-bold text-slate-900 dark:text-white">
                              {noteData.saleDate ? new Date(noteData.saleDate).toLocaleDateString() : 'N/A'}
                            </span>
                          </div>
                        </div>
                      );
                    } else {
                      return <p className="text-sm text-slate-500 text-center py-2">Billing details not available for this return.</p>;
                    }
                  })()}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3">
              <button 
                onClick={() => setSelectedReturn(null)}
                className="px-4 py-2 rounded-lg font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Close
              </button>
              <button 
                onClick={() => downloadReturnPDF(selectedReturn)}
                className="px-4 py-2 rounded-lg font-bold bg-orange-500 text-white hover:bg-orange-400 transition-colors flex items-center gap-2 shadow-sm shadow-orange-500/20"
              >
                <Download size={16} /> Download PDF
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
