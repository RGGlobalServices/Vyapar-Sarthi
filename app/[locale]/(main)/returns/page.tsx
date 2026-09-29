'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import api from '@/lib/api';
import { invalidateReturnCaches } from '@/lib/swrInvalidate';
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
  Eye,
  Repeat,
  Plus,
  Trash2
} from 'lucide-react';
import { cn, fmtDate } from '@/lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface VariantOption {
  key: string;
  colour: string | null;
  size: string | null;
  stock: number | null;
  price: number | null;
}

interface ExchangeProductRow {
  id: string;
  name: string;
  price: number;
  currentStock: number | null;
  variants: VariantOption[];
}

interface ExchangeLine {
  key: string;
  productId: string;
  name: string;
  variant: string | null;
  qty: number;
  price: number;
  maxStock: number | null;
}

/** Same "<colour> / <size>" convention used across the app's billing/variant
 *  stock code (components/party/AddBillModal.tsx, app/api/v1/billing/route.ts). */
function variantKeyOf(colour: string | null | undefined, size: string | null | undefined): string {
  const c = (colour || '').trim();
  const sz = (size || '').trim();
  if (c && sz) return `${c} / ${sz}`;
  return sz || c || '';
}

function computeVariantOptions(raw: any): VariantOption[] {
  const opts: VariantOption[] = [];
  const seen = new Set<string>();
  const push = (colour: string | null, size: string | null, stock: number | null, price: number | null) => {
    const key = variantKeyOf(colour, size);
    if (!key || seen.has(key)) return;
    seen.add(key);
    opts.push({ key, colour, size, stock, price });
  };
  if (Array.isArray(raw?.variants)) {
    for (const v of raw.variants) {
      const colour = v?.color ? String(v.color) : null;
      const size = v?.size ? String(v.size) : null;
      const stock = v?.stock !== undefined && v?.stock !== null ? Number(v.stock) : null;
      const price = v?.sellingPrice !== undefined && v?.sellingPrice !== null ? Number(v.sellingPrice) : null;
      push(colour, size, stock, price);
    }
  }
  if (raw?.size_variants) {
    try {
      const sv = typeof raw.size_variants === 'string' ? JSON.parse(raw.size_variants) : raw.size_variants;
      for (const [size, stock] of Object.entries(sv || {})) {
        push(null, size, Number(stock) || 0, null);
      }
    } catch {}
  }
  return opts;
}

export default function ReturnsPage() {
  const t = useTranslations('Returns');
  const tMill = useTranslations('MillBilling');
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

  // Browser back button closes the modal on mobile
  useEffect(() => {
    if (!selectedReturn) return;
    window.history.pushState({ returnModal: true }, '');
    const onPop = () => setSelectedReturn(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [selectedReturn]);

  // ── Exchange mode ──────────────────────────────────────────────────────
  const [exchangeMode, setExchangeMode] = useState(false);
  const [exchangeLines, setExchangeLines] = useState<ExchangeLine[]>([]);
  const [exchangeProducts, setExchangeProducts] = useState<ExchangeProductRow[] | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [pickedProduct, setPickedProduct] = useState<ExchangeProductRow | null>(null);
  const [pickedVariant, setPickedVariant] = useState<string>('');
  const [settlementMethod, setSettlementMethod] = useState<'Cash' | 'UPI' | 'Card' | 'Udhar' | 'Mix'>('Cash');
  const [mixAmounts, setMixAmounts] = useState<{ cash: number; upi: number; card: number }>({ cash: 0, upi: 0, card: 0 });
  const [cashRefundOverride, setCashRefundOverride] = useState<number | null>(null);

  async function loadExchangeProducts(): Promise<ExchangeProductRow[]> {
    if (exchangeProducts) return exchangeProducts;
    try {
      const res = await api.get('/products');
      const list = Array.isArray(res.data) ? res.data : [];
      const mapped: ExchangeProductRow[] = list.map((p: any) => ({
        id: p.id,
        name: p.name,
        price: Number(p.sellingPrice ?? p.mrp ?? 0),
        currentStock: p.currentStock === null || p.currentStock === undefined ? null : Number(p.currentStock),
        variants: computeVariantOptions(p),
      }));
      setExchangeProducts(mapped);
      return mapped;
    } catch {
      return [];
    }
  }

  function addExchangeLine() {
    if (!pickedProduct) return;
    const variantOpt = pickedProduct.variants.find(v => v.key === pickedVariant) || null;
    const line: ExchangeLine = {
      key: `${pickedProduct.id}-${pickedVariant || 'plain'}-${Date.now()}`,
      productId: pickedProduct.id,
      name: pickedProduct.name,
      variant: pickedVariant || null,
      qty: 1,
      price: variantOpt?.price ?? pickedProduct.price,
      maxStock: variantOpt ? variantOpt.stock : pickedProduct.currentStock,
    };
    setExchangeLines(prev => [...prev, line]);
    setPickedProduct(null);
    setPickedVariant('');
    setProductSearch('');
  }

  function updateExchangeLine(key: string, patch: Partial<ExchangeLine>) {
    setExchangeLines(prev => prev.map(l => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeExchangeLine(key: string) {
    setExchangeLines(prev => prev.filter(l => l.key !== key));
  }

  const downloadReturnPDF = (ret: any) => {
    let noteData: any = {};
    try {
      if (ret.note) noteData = JSON.parse(ret.note);
    } catch (e) {}

    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text('Return Receipt', 14, 22);

    doc.setFontSize(10);
    doc.text(`Date: ${fmtDate(ret.date)}`, 14, 32);
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
      setCashRefundOverride(null);
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
        })),
        cash_refund: actualCashRefund,
        credit_to_add: creditToAdd,
      });
      alert('Return processed successfully!');
      setBill(null);
      setReturnItems([]);
      setSearchQuery('');
      setCashRefundOverride(null);
      fetchHistory(); // refresh return history in-page
      // Every screen that reads customer.totalDue, product stock, dashboard
      // KPIs or the cashbook has just been changed by this return — nudge
      // SWR so those pages don't show yesterday's numbers on next visit.
      invalidateReturnCaches();
    } catch (err: any) {
      console.error('Failed to process return detail:', err);
      const status = err.response?.status || err.status;
      const detail = err.response?.data?.detail || err.data?.detail || err.message || 'Unknown error';
      if (status === 409) {
        alert('Customer udhar balance mismatch. Please refresh the page and try again.\n\nPossible reason: balance was updated from another device.');
      } else {
        alert(`Error processing return: ${detail}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const returnValueForExchange = returnItems.reduce((acc, it) => acc + it.returnQty * it.price_per_unit, 0);
  const exchangeValueTotal = exchangeLines.reduce((acc, l) => acc + l.qty * l.price, 0);

  // Bill payment breakdown at component level (safe when bill is null)
  const billTotalAmt = bill ? Number(bill.total_amount) || 0 : 0;
  const billPaidAmt = bill ? Number(bill.amount_paid ?? bill.amountPaid ?? bill.total_amount) || 0 : 0;
  const billUdharAmt = Math.max(0, billTotalAmt - billPaidAmt);
  const billPd = bill ? (bill.payment_details || bill.paymentDetails || {}) : {};
  const billCashPaid = Number(billPd?.cash) || (bill?.payment_type === 'Cash' ? billPaidAmt : 0);
  const billUpiPaid = Number(billPd?.upi) || (bill?.payment_type === 'UPI' ? billPaidAmt : 0);
  const billCardPaid = Number(billPd?.card) || (bill?.payment_type === 'Card' ? billPaidAmt : 0);

  // Simple return: udhar clears first; remaining is cash refund (editable by shopkeeper)
  const totalRefund = returnValueForExchange;
  const willClearUdhar = Math.min(totalRefund, billUdharAmt);
  const willRefundCash = totalRefund - willClearUdhar;
  const actualCashRefund = cashRefundOverride !== null
    ? Math.max(0, Math.min(Math.round(cashRefundOverride), willRefundCash))
    : willRefundCash;
  const creditToAdd = willRefundCash - actualCashRefund;

  // Exchange: return credit = only the portion the customer actually PAID
  // (udhar debt is cleared separately but must not count as exchange credit —
  //  otherwise the shop effectively forgives the unpaid debt for free)
  const udharForExchange = Math.min(returnValueForExchange, billUdharAmt);
  const effectiveReturnCredit = returnValueForExchange - udharForExchange;
  const exchangeDifference = Math.round((exchangeValueTotal - effectiveReturnCredit) * 100) / 100;

  const handleExchangeSubmit = async () => {
    const itemsToReturn = returnItems.filter(item => item.returnQty > 0);
    if (itemsToReturn.length === 0) return;
    if (exchangeLines.length === 0) {
      alert(t('pickAtLeastOneExchangeItem') || 'Add at least one item to exchange for');
      return;
    }

    if (exchangeDifference > 0 && settlementMethod === 'Mix') {
      const mixTotal = Math.round((mixAmounts.cash + mixAmounts.upi + mixAmounts.card) * 100) / 100;
      if (Math.abs(mixTotal - exchangeDifference) > 0.5) {
        alert(`Mix payment total ₹${mixTotal.toLocaleString('en-IN')} must equal the difference ₹${exchangeDifference.toLocaleString('en-IN')}`);
        return;
      }
      if (mixTotal <= 0) {
        alert('Please enter payment amounts for Mix payment');
        return;
      }
    }

    setSubmitting(true);
    try {
      const settlementPayload = exchangeDifference > 0
        ? settlementMethod === 'Mix'
          ? { mix_payment: { cash: mixAmounts.cash, upi: mixAmounts.upi, card: mixAmounts.card } }
          : { settlement_method: settlementMethod }
        : {};

      await api.post(`/billing/exchange`, {
        bill_id: bill.id,
        return_items: itemsToReturn.map(item => ({
          item_id: item.id,
          quantity: item.returnQty,
          reason: item.returnReason || 'Customer Return',
          product_id: item.product_id,
          name: item.name,
          price: item.price_per_unit
        })),
        exchange_items: exchangeLines.map(l => ({
          product_id: l.productId,
          variant: l.variant,
          quantity: l.qty,
          price: l.price,
          name: l.name
        })),
        ...settlementPayload
      });
      alert(t('exchangeProcessed') || 'Exchange processed successfully!');
      setBill(null);
      setReturnItems([]);
      setSearchQuery('');
      setExchangeMode(false);
      setExchangeLines([]);
      fetchHistory();
      invalidateReturnCaches();
    } catch (err: any) {
      console.error('Failed to process exchange detail:', err);
      const status = err.response?.status || err.status;
      const detail = err.response?.data?.detail || err.data?.detail || err.message || 'Unknown error';
      if (status === 409) {
        alert('Customer udhar balance mismatch. Please refresh the page and try again.\n\nPossible reason: balance was updated from another device.');
      } else {
        alert(`${t('failedToProcessExchange') || 'Failed to process exchange'}: ${detail}`);
      }
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

          {bill && (() => {
            return (
              <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 animate-in slide-in-from-left-4">
                <CardHeader className="border-b border-slate-200 dark:border-slate-800/50 pb-4">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-sm font-bold text-slate-900 dark:text-slate-200">{t('invoiceSummary') || 'Invoice Summary'}</CardTitle>
                    <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      {bill.invoice_number || `ID: ${bill.id.substring(0, 8)}`}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">{t('customer') || 'Customer'}</span>
                    <span className="text-slate-900 dark:text-slate-200 font-bold">{bill.customer_name || t('guest') || 'Guest'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">{t('date') || 'Date'}</span>
                    <span className="text-slate-900 dark:text-slate-200 font-bold">{fmtDate(bill.created_at)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">{t('billTotal') || 'Bill Total'}</span>
                    <span className="text-slate-900 dark:text-slate-200 font-bold">₹{billTotalAmt.toLocaleString('en-IN')}</span>
                  </div>

                  {/* Payment breakdown */}
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5 bg-slate-50 dark:bg-slate-800/40 space-y-1.5">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('howBillWasPaid') || 'How this bill was paid'}</p>
                    {billCashPaid > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-600 dark:text-slate-300">💵 {t('cashPaidLabel') || 'Cash paid'}</span>
                        <span className="font-bold text-slate-900 dark:text-slate-100">₹{billCashPaid.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                    {billUpiPaid > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-600 dark:text-slate-300">📱 {t('upiOnlineLabel') || 'UPI / Online'}</span>
                        <span className="font-bold text-slate-900 dark:text-slate-100">₹{billUpiPaid.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                    {billCardPaid > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-600 dark:text-slate-300">💳 {t('settleCard') || 'Card'}</span>
                        <span className="font-bold text-slate-900 dark:text-slate-100">₹{billCardPaid.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                    {billUdharAmt > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-orange-600 dark:text-orange-400 font-semibold">🧾 {t('udharUnpaidLabel') || 'Udhar (unpaid)'}</span>
                        <span className="font-bold text-orange-600 dark:text-orange-400">₹{billUdharAmt.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                    {billPaidAmt === 0 && billUdharAmt === 0 && (
                      <p className="text-[11px] text-slate-500 italic">{t('noPaymentDetailsRecorded') || 'No payment details recorded.'}</p>
                    )}
                  </div>

                  {/* Live refund plan — udhar clears first, remaining cash is editable */}
                  {!exchangeMode && totalRefund > 0 && (
                    <div className="rounded-lg border border-emerald-300 dark:border-emerald-700 p-2.5 bg-emerald-50 dark:bg-emerald-500/10 space-y-1.5">
                      <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">{t('thisReturnWillLabel') || 'This return will'}</p>
                      {willClearUdhar > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-emerald-800 dark:text-emerald-300">{t('clearFromUdhar') || "↓ Clear from party's udhar"}</span>
                          <span className="font-black text-emerald-700 dark:text-emerald-400">₹{willClearUdhar.toLocaleString('en-IN')}</span>
                        </div>
                      )}
                      {willClearUdhar > 0 && willRefundCash === 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500 dark:text-slate-400">💵 {t('cashRefundZero') || 'Cash refund to customer'}</span>
                          <span className="font-black text-slate-400 dark:text-slate-500">₹0</span>
                        </div>
                      )}
                      {willRefundCash > 0 && (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-emerald-800 dark:text-emerald-300 shrink-0">{t('refundCashOut') || '💵 Cash refund to customer'}</span>
                            <div className="flex items-center gap-0.5 ml-auto min-w-0">
                              <span className="text-emerald-700 dark:text-emerald-400 font-bold text-xs shrink-0">₹</span>
                              <input
                                type="number"
                                min={0}
                                max={willRefundCash}
                                value={actualCashRefund}
                                onChange={e => {
                                  const v = Math.round(Math.max(0, Math.min(parseFloat(e.target.value) || 0, willRefundCash)));
                                  setCashRefundOverride(v);
                                }}
                                className="w-28 min-w-0 text-right text-xs font-black text-emerald-700 dark:text-emerald-400 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                              />
                            </div>
                          </div>
                          {creditToAdd > 0 && (
                            <div className="flex justify-between text-xs">
                              <span className="text-indigo-600 dark:text-indigo-400 shrink-0">💳 {t('addToCustomerCredit') || 'Add to customer credit (udhar)'}</span>
                              <span className="font-black text-indigo-600 dark:text-indigo-400 ml-2">₹{creditToAdd.toLocaleString('en-IN')}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}
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
                        <p className="text-xs text-slate-500">
                          {t('price') || 'Price'}: ₹{item.price_per_unit}
                          {item.original_price_per_unit && item.original_price_per_unit !== item.price_per_unit && (bill?.discount_factor ?? 1) <= 1 && (
                            <span className="line-through text-slate-400 ml-1">₹{item.original_price_per_unit}</span>
                          )}
                          {bill?.pricing_model === 'mill_v2' && (
                            <span className="ml-1 text-indigo-500 dark:text-indigo-400 text-[10px] font-bold">(incl. GST+charges)</span>
                          )}
                          {' '}| {t('purchased') || 'Purchased'}: {item.quantity} {item.returned_quantity > 0 ? `| Returned: ${item.returned_quantity} | Avail: ${item.availableQty}` : ''}
                        </p>
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
              <div className="p-6 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-200 dark:border-slate-800 mt-auto space-y-4">
                {returnItems.some(i => i.returnQty > 0) && (
                  <button
                    type="button"
                    onClick={() => setExchangeMode(v => !v)}
                    className={cn(
                      'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold border-2 transition-colors',
                      exchangeMode
                        ? 'bg-indigo-500 border-indigo-500 text-white'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-400'
                    )}
                  >
                    <Repeat size={16} /> {t('exchangeToggle') || '🔁 Exchange for another item'}
                  </button>
                )}

                {exchangeMode && (
                  <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-500/5 p-4 space-y-3">
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-200">{t('exchangeItems') || 'Exchange Items'}</p>
                      <p className="text-xs text-slate-500">{t('exchangeItemsSubtitle') || "Pick what the customer takes instead of a refund"}</p>
                    </div>

                    {/* Product picker */}
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="relative flex-1">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={productSearch}
                          onFocus={() => loadExchangeProducts()}
                          onChange={e => { setProductSearch(e.target.value); setPickedProduct(null); loadExchangeProducts(); }}
                          placeholder={t('searchProductPlaceholder') || 'Search product by name...'}
                          className="w-full pl-8 pr-2 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        {productSearch.trim() && !pickedProduct && (
                          <div className="absolute z-10 mt-1 w-full max-h-52 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg">
                            {(exchangeProducts || []).filter(p => p.name?.toLowerCase().includes(productSearch.trim().toLowerCase())).slice(0, 20).map(p => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => { setPickedProduct(p); setPickedVariant(''); setProductSearch(p.name); }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between gap-2"
                              >
                                <span className="text-slate-800 dark:text-slate-200 truncate">{p.name}</span>
                                <span className="text-xs text-emerald-500 font-bold shrink-0">₹{p.price.toLocaleString('en-IN')}</span>
                              </button>
                            ))}
                            {(exchangeProducts || []).filter(p => p.name?.toLowerCase().includes(productSearch.trim().toLowerCase())).length === 0 && (
                              <p className="px-3 py-2 text-xs text-slate-500">{t('noProductsFound') || 'No products found'}</p>
                            )}
                          </div>
                        )}
                      </div>
                      {pickedProduct && pickedProduct.variants.length > 0 && (
                        <select
                          value={pickedVariant}
                          onChange={e => setPickedVariant(e.target.value)}
                          className="text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-2 text-slate-900 dark:text-slate-100"
                        >
                          <option value="">{t('selectVariant') || 'Select variant'}</option>
                          {pickedProduct.variants.map(v => (
                            <option key={v.key} value={v.key}>{v.key}{v.stock !== null ? ` (${v.stock})` : ''}</option>
                          ))}
                        </select>
                      )}
                      <button
                        type="button"
                        onClick={addExchangeLine}
                        disabled={!pickedProduct || (pickedProduct.variants.length > 0 && !pickedVariant)}
                        className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-bold disabled:opacity-40 transition-colors shrink-0"
                      >
                        <Plus size={15} /> {t('addExchangeItem') || 'Add Item'}
                      </button>
                    </div>

                    {/* Exchange line items */}
                    {exchangeLines.length === 0 ? (
                      <p className="text-xs text-slate-500 italic py-2">{t('noExchangeItemsYet') || 'No exchange items added yet.'}</p>
                    ) : (
                      <div className="space-y-2">
                        {exchangeLines.map(line => (
                          <div key={line.key} className="flex flex-wrap items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
                            <div className="w-full sm:w-auto sm:flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-900 dark:text-slate-200 truncate">{line.name}</p>
                              {line.variant && <p className="text-[10px] text-indigo-500 font-bold">{line.variant}</p>}
                            </div>
                            <div className="flex items-center gap-2 ml-auto">
                              <input
                                type="number" min={1}
                                value={line.qty}
                                onChange={e => updateExchangeLine(line.key, { qty: Math.max(1, parseInt(e.target.value) || 1) })}
                                className="w-14 text-center text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1 py-1 text-slate-900 dark:text-slate-100"
                              />
                              <input
                                type="number" min={0}
                                value={line.price}
                                onChange={e => updateExchangeLine(line.key, { price: Math.max(0, parseFloat(e.target.value) || 0) })}
                                className="w-20 text-center text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1 py-1 text-slate-900 dark:text-slate-100"
                              />
                              <p className="w-20 text-right text-sm font-black text-indigo-500 shrink-0">₹{(line.qty * line.price).toLocaleString('en-IN')}</p>
                              <button type="button" onClick={() => removeExchangeLine(line.key)} title={t('remove') || 'Remove'} className="text-slate-400 hover:text-red-500 shrink-0">
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Settlement summary */}
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-white dark:bg-slate-900 space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">{t('returnValueLabel') || 'Return Value'}</span>
                        <span className="font-bold text-slate-900 dark:text-slate-100">₹{returnValueForExchange.toLocaleString('en-IN')}</span>
                      </div>
                      {udharForExchange > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-orange-500">{t('udharClearedLabel') || '↓ Udhar cleared (not exchange credit)'}</span>
                          <span className="font-bold text-orange-500">-₹{udharForExchange.toLocaleString('en-IN')}</span>
                        </div>
                      )}
                      {udharForExchange > 0 && (
                        <div className="flex justify-between text-xs border-t border-slate-100 dark:border-slate-800 pt-1">
                          <span className="text-slate-500 font-semibold">{t('netExchangeCredit') || 'Net Exchange Credit'}</span>
                          <span className="font-bold text-slate-900 dark:text-slate-100">₹{effectiveReturnCredit.toLocaleString('en-IN')}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">{t('exchangeValueLabel') || 'Exchange Value'}</span>
                        <span className="font-bold text-slate-900 dark:text-slate-100">₹{exchangeValueTotal.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between text-sm pt-1.5 border-t border-slate-100 dark:border-slate-800">
                        <span className="font-bold text-slate-700 dark:text-slate-300">{t('differenceLabel') || 'Difference'}</span>
                        <span className={cn('font-black', exchangeDifference > 0 ? 'text-orange-500' : exchangeDifference < 0 ? 'text-emerald-500' : 'text-slate-500')}>
                          {exchangeDifference > 0 ? '+' : ''}₹{exchangeDifference.toLocaleString('en-IN')}
                        </span>
                      </div>

                      {exchangeDifference === 0 && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold pt-1">{t('noDifference') || 'Even exchange — no money changes hands.'}</p>
                      )}

                      {exchangeDifference < 0 && (() => {
                        const excess = -exchangeDifference;
                        // Udhar is already cleared via effectiveReturnCredit; excess is pure cash back
                        return (
                          <div className="pt-1.5 space-y-1">
                            <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">{t('shopRefundsDifference') || 'This exchange will'}</p>
                            <div className="flex justify-between text-xs">
                              <span className="text-emerald-700 dark:text-emerald-300">{t('refundCashOut') || '💵 Refund to customer (cash out)'}</span>
                              <span className="font-black text-emerald-600 dark:text-emerald-400">₹{excess.toLocaleString('en-IN')}</span>
                            </div>
                          </div>
                        );
                      })()}

                      {exchangeDifference > 0 && (
                        <div className="pt-1.5 space-y-1.5">
                          <p className="text-[10px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider">{t('customerPaysMore') || 'Customer needs to pay the difference'}</p>
                          <label className="text-[10px] text-slate-500 font-bold uppercase block">{t('settleVia') || 'Settle difference via'}</label>
                          <div className="flex gap-1.5 flex-wrap">
                            {([['Cash', t('settleCash') || 'Cash'], ['UPI', t('settleUpi') || 'UPI'], ['Card', t('settleCard') || 'Card']] as const).map(([v, lbl]) => (
                              <button
                                key={v} type="button"
                                onClick={() => setSettlementMethod(v)}
                                className={cn('px-3 py-1.5 rounded-lg text-xs font-bold border', settlementMethod === v ? 'bg-indigo-500 border-indigo-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300')}
                              >
                                {lbl}
                              </button>
                            ))}
                            <button
                              type="button"
                              disabled={!bill.customer_id}
                              onClick={() => setSettlementMethod('Udhar')}
                              title={!bill.customer_id ? (t('settleUdharNoCustomer') || 'Add to Udhar (needs a linked customer)') : undefined}
                              className={cn('px-3 py-1.5 rounded-lg text-xs font-bold border disabled:opacity-40', settlementMethod === 'Udhar' ? 'bg-indigo-500 border-indigo-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300')}
                            >
                              {t('settleUdhar') || 'Add to Udhar'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSettlementMethod('Mix');
                                setMixAmounts({ cash: exchangeDifference, upi: 0, card: 0 });
                              }}
                              className={cn('px-3 py-1.5 rounded-lg text-xs font-bold border', settlementMethod === 'Mix' ? 'bg-indigo-500 border-indigo-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300')}
                            >
                              {t('settleMix') || 'Mix'}
                            </button>
                          </div>

                          {settlementMethod === 'Mix' && (
                            <div className="mt-2 space-y-2 p-3 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl border border-indigo-200 dark:border-indigo-800">
                              <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                                {t('mixPaymentBreakdown') || 'Enter amount for each method'}
                              </p>
                              {([['cash', '💵 Cash'], ['upi', '📱 UPI'], ['card', '💳 Card']] as const).map(([key, label]) => (
                                <div key={key} className="flex items-center gap-2">
                                  <span className="text-xs text-slate-600 dark:text-slate-300 w-16 shrink-0">{label}</span>
                                  <div className="flex-1 flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                                    <span className="pl-2 text-xs text-slate-400">₹</span>
                                    <input
                                      type="number"
                                      min={0}
                                      step={0.01}
                                      value={mixAmounts[key] || ''}
                                      onChange={e => {
                                        const val = parseFloat(e.target.value) || 0;
                                        setMixAmounts(prev => ({ ...prev, [key]: val }));
                                      }}
                                      className="flex-1 py-1.5 pr-2 text-xs font-bold text-slate-900 dark:text-white bg-transparent outline-none"
                                      placeholder="0"
                                    />
                                  </div>
                                </div>
                              ))}
                              {(() => {
                                const mixTotal = Math.round((mixAmounts.cash + mixAmounts.upi + mixAmounts.card) * 100) / 100;
                                const remaining = Math.round((exchangeDifference - mixTotal) * 100) / 100;
                                return (
                                  <div className={cn('flex justify-between text-xs font-bold pt-1 border-t border-indigo-200 dark:border-indigo-800', remaining === 0 ? 'text-emerald-600 dark:text-emerald-400' : remaining > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-red-600 dark:text-red-400')}>
                                    <span>{remaining === 0 ? '✓ All set' : remaining > 0 ? `₹${remaining.toLocaleString('en-IN')} remaining` : `₹${Math.abs(remaining).toLocaleString('en-IN')} over`}</span>
                                    <span>Total: ₹{mixTotal.toLocaleString('en-IN')}</span>
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  {!exchangeMode && (
                    <div>
                      {willClearUdhar > 0 && willRefundCash === 0 ? (
                        <>
                          <p className="text-xs text-orange-500 dark:text-orange-400 font-bold uppercase tracking-wider">{t('udharClearedLabel') || 'Udhar Cleared'}</p>
                          <p className="text-2xl font-black text-orange-600 dark:text-orange-400">
                            ₹{willClearUdhar.toLocaleString('en-IN')}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">{t('cashRefundZero') || 'Cash refund: ₹0 (unpaid bill)'}</p>
                        </>
                      ) : willClearUdhar > 0 ? (
                        <>
                          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">{t('cashRefundLabel') || 'Cash Refund'}</p>
                          <p className="text-2xl font-black text-slate-900 dark:text-white">
                            ₹{actualCashRefund.toLocaleString('en-IN')}
                          </p>
                          <p className="text-xs text-orange-500 dark:text-orange-400 mt-0.5">{t('plusUdharCleared') || '+ Udhar cleared:'} ₹{willClearUdhar.toLocaleString('en-IN')}</p>
                        </>
                      ) : (
                        <>
                          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">{t('totalRefundAmount') || 'Total Refund Amount'}</p>
                          <p className="text-2xl font-black text-slate-900 dark:text-white">
                            ₹{actualCashRefund.toLocaleString('en-IN')}
                          </p>
                        </>
                      )}
                    </div>
                  )}
                  <button
                    onClick={exchangeMode ? handleExchangeSubmit : handleReturnSubmit}
                    disabled={submitting || returnItems.every(i => i.returnQty === 0) || (exchangeMode && exchangeLines.length === 0)}
                    className={cn(
                      'text-white px-8 py-3 rounded-xl font-black transition-all flex items-center gap-2 active:scale-95 disabled:opacity-30 disabled:active:scale-100 shadow-lg ml-auto',
                      exchangeMode ? 'bg-indigo-500 hover:bg-indigo-400 shadow-indigo-500/20' : 'bg-orange-500 hover:bg-orange-400 shadow-orange-500/20'
                    )}
                  >
                    {submitting ? t('processing') || 'Processing...' : (exchangeMode ? (t('completeExchange') || 'Complete Exchange') : (t('completeReturn') || 'Complete Return'))}
                    <ArrowRight size={18} />
                  </button>
                </div>
                <div className="flex items-start gap-2 text-[10px] text-slate-500 bg-slate-100 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                  <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                  {exchangeMode
                    ? (t('exchangeWarning') || 'Processing an exchange will restock the returned item, deduct stock for the replacement, and settle only the price difference in your ledger.')
                    : (t('returnWarning') || 'Processing a return will automatically adjust your inventory levels and record a refund transaction in your ledger.')}
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
                    <th className="px-6 py-3 font-bold text-center">{t('action') || 'Action'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
                  {returnsHistory.map((r: any) => {
                    let isExchange = false;
                    try { isExchange = !!(r.note && JSON.parse(r.note)?.exchange); } catch {}
                    return (
                    <tr key={r.id} className="text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">{fmtDate(r.date)}</td>
                      <td className="px-6 py-4 font-bold">
                        <button
                          onClick={() => setSelectedReturn(r)}
                          className="text-emerald-600 dark:text-emerald-400 hover:underline text-left"
                        >
                          {r.itemName}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-1 rounded text-[10px] font-bold uppercase">{r.reason}</span>
                          {isExchange && (
                            <span className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2 py-1 rounded text-[10px] font-bold whitespace-nowrap">
                              {t('exchangedBadge') || '🔁 Exchanged'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-medium">{r.quantity}</td>
                      <td className="px-6 py-4 text-right font-black text-orange-400">₹{r.amount.toLocaleString()}</td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => setSelectedReturn(r)}
                          className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1.5"
                        >
                          <Eye size={14} /> {t('details') || 'Details'}
                        </button>
                      </td>
                    </tr>
                    );
                  })}
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
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedReturn(null); }}
        >
          <div className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92dvh] sm:max-h-[90dvh] animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex justify-between items-center p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex-shrink-0">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <FileText className="text-orange-500" size={20} />
                  {t('returnDetails') || 'Return Details'}
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
            <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto flex-1 min-h-0">
              {/* Product Info */}
              <div className="bg-orange-50 dark:bg-orange-900/10 rounded-xl p-4 border border-orange-100 dark:border-orange-900/20">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-black text-slate-900 dark:text-white text-lg">{selectedReturn.itemName}</h3>
                    <span className="inline-block bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-1 rounded text-[10px] font-bold uppercase border border-slate-200 dark:border-slate-700 mt-2">
                      {t('reason') || 'Reason'}: {selectedReturn.reason}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500 font-bold uppercase mb-1">{t('refundAmount') || 'Refund Amount'}</p>
                    <p className="text-2xl font-black text-orange-500 flex items-center justify-end">
                      <IndianRupee size={18} />
                      {selectedReturn.amount.toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex gap-4 pt-3 border-t border-orange-200 dark:border-orange-900/30">
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase">{t('returnedQty') || 'Returned Qty'}</p>
                    <p className="font-bold text-slate-900 dark:text-white">{selectedReturn.quantity}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase">{t('date') || 'Date'}</p>
                    <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1">
                      <Calendar size={12} className="text-slate-400" />
                      {fmtDate(selectedReturn.date)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Billing Context */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Package size={16} className="text-emerald-500" /> {t('originalBillingDetails') || 'Original Billing Details'}
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
                            <span className="text-slate-500">{t('invoiceNumber') || 'Invoice Number'}</span>
                            <span className="font-bold text-slate-900 dark:text-white">{noteData.invoiceNumber || noteData.billId?.substring(0, 8)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">{t('customerName') || 'Customer Name'}</span>
                            <span className="font-bold text-slate-900 dark:text-white">{noteData.customerName || (t('notAvailable') || 'N/A')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">{t('paymentType') || 'Payment Type'}</span>
                            <span className="font-bold text-slate-900 dark:text-white capitalize">{noteData.paymentType || (t('notAvailable') || 'N/A')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">{t('saleDate') || 'Sale Date'}</span>
                            <span className="font-bold text-slate-900 dark:text-white">
                              {noteData.saleDate ? fmtDate(noteData.saleDate) : (t('notAvailable') || 'N/A')}
                            </span>
                          </div>
                        </div>
                      );
                    } else {
                      return <p className="text-sm text-slate-500 text-center py-2">{t('billingDetailsUnavailable') || 'Billing details not available for this return.'}</p>;
                    }
                  })()}
                </div>
              </div>

              {/* Exchanged For — only when this return was part of an exchange */}
              {(() => {
                let noteData: any = null;
                try { if (selectedReturn.note) noteData = JSON.parse(selectedReturn.note); } catch (e) {}
                if (!noteData?.exchange || !Array.isArray(noteData?.exchangedFor)) return null;
                return (
                  <div className="space-y-3">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Repeat size={16} className="text-indigo-500" /> {t('exchangedForLabel') || 'Exchanged For'}
                    </h4>
                    <div className="bg-indigo-50 dark:bg-indigo-500/5 rounded-xl border border-indigo-100 dark:border-indigo-900/30 p-4 space-y-2">
                      {noteData.exchangeInvoiceNumber && (
                        <div className="flex justify-between text-sm mb-2 pb-2 border-b border-indigo-100 dark:border-indigo-900/30">
                          <span className="text-slate-500">{t('exchangeInvoiceLabel') || 'Exchange Invoice'}</span>
                          <span className="font-bold text-slate-900 dark:text-white">{noteData.exchangeInvoiceNumber}</span>
                        </div>
                      )}
                      {noteData.exchangedFor.map((it: any, i: number) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="text-slate-700 dark:text-slate-300">{it.name}{it.variant ? ` (${it.variant})` : ''} × {it.quantity}</span>
                          <span className="font-bold text-indigo-600 dark:text-indigo-400">₹{(it.quantity * it.price).toLocaleString('en-IN')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3 flex-shrink-0">
              <button
                onClick={() => setSelectedReturn(null)}
                className="px-4 py-2 rounded-lg font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                {t('close') || 'Close'}
              </button>
              <button
                onClick={() => downloadReturnPDF(selectedReturn)}
                className="px-4 py-2 rounded-lg font-bold bg-orange-500 text-white hover:bg-orange-400 transition-colors flex items-center gap-2 shadow-sm shadow-orange-500/20"
              >
                <Download size={16} /> {t('downloadPdf') || 'Download PDF'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
