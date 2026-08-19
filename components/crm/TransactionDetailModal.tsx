'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { X, ReceiptText, Loader2, ImageIcon, Camera, Upload, Trash2, AlertTriangle, ExternalLink } from 'lucide-react';
import { useLocale } from 'next-intl';
import { useBusinessStore } from '@/lib/businessStore';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { generateCustomerBillPDF } from '@/lib/pdf/customerBillDetail';

type BillItem = {
  name: string;
  quantity: number;
  sellingPrice: number;
  costPrice: number;
  profitPerUnit: number;
  profitPercent: number | null;
};

type Transaction = {
  id: string;
  type: string;
  amount: number;
  note: string;
  billNumber: string;
  date: string;
  gstPercent: string | null;
  gstAmount: number | null;
  items: BillItem[];
  documents?: { id: string; url: string; uploadedAt: string }[];
  // Per-bill money breakdown — populated by /crm/ledger for rows tied to
  // a Sale. `outstandingAmount` = total − paid (still-owed Udhar).
  // paymentType is 'Cash' | 'UPI' | 'Card' | 'Split' | 'Udhar' etc; when
  // Split, paymentDetails carries `{cash, upi, card}`.
  saleTotalAmount?: number | null;
  saleAmountPaid?: number | null;
  outstandingAmount?: number | null;
  paymentType?: string | null;
  paymentDetails?: { cash?: number; upi?: number; card?: number } | null;
};

const rupee = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/**
 * Party/Customer equivalent of the Supplier module's transaction detail
 * modal — shown here as a shared component (not local to one page) because
 * LedgerView itself is shared across three call sites (/party's two tabs,
 * Dukan/Vyapar's /customers).
 *
 * When opened from LedgerView, `transaction` already carries its `items[]`
 * (see api/v1/crm/ledger's per-row GST+profit enrichment), so it renders
 * instantly with no fetch. When opened from the cross-entity rollup view
 * (CustomerRollupView), items aren't pre-loaded there (fetching every
 * pending bill's line items across every party up front would be wasteful
 * when only a few ever get clicked) — passing `entityId`/`entityType` makes
 * this component lazily resolve them itself via the same /crm/ledger
 * endpoint LedgerView already uses, finding the matching row by id.
 */
export default function TransactionDetailModal({
  entityId,
  entityType,
  entityName,
  transaction,
  onClose,
  onDeleted,
  onPhotoUploaded,
}: {
  entityId?: string;
  entityType?: 'customer' | 'party';
  entityName: string;
  transaction: Transaction;
  onClose: () => void;
  // Fired after a successful DELETE — LedgerView refetches so the deleted
  // row disappears + all downstream effects (stock, udhar, cashBook) get
  // rolled back on the server by reverseSaleEffects.
  onDeleted?: () => void;
  // Fired after a successful photo attach — LedgerView refetches so the
  // paperclip indicator shows up on the row.
  onPhotoUploaded?: () => void;
}) {
  const t = useTranslations('LedgerView');
  const locale = useLocale();
  const { profile } = useBusinessStore();
  const [resolved, setResolved] = useState<Transaction>(transaction);
  const [loadingItems, setLoadingItems] = useState(false);

  useEffect(() => {
    if (transaction.items.length > 0 || !entityId || !entityType) return;
    let cancelled = false;
    setLoadingItems(true);
    api.get(`/crm/ledger?entityType=${entityType}&entityId=${entityId}`)
      .then((res) => {
        if (cancelled) return;
        const match = (res.data || []).find((row: any) => row.id === transaction.id);
        if (match) {
          setResolved((r) => ({
            ...r,
            items: Array.isArray(match.items) ? match.items : [],
            gstPercent: match.gstPercent ?? null,
            gstAmount: match.gstAmount ?? null,
            documents: Array.isArray(match.documents) ? match.documents : [],
            saleTotalAmount: match.saleTotalAmount ?? null,
            saleAmountPaid: match.saleAmountPaid ?? null,
            outstandingAmount: match.outstandingAmount ?? null,
            paymentType: match.paymentType ?? null,
            paymentDetails: match.paymentDetails ?? null,
          }));
        }
      })
      .catch((e) => console.error('Failed to load transaction detail', e))
      .finally(() => { if (!cancelled) setLoadingItems(false); });
    return () => { cancelled = true; };
  }, [transaction.id, transaction.items.length, entityId, entityType]);

  const [downloading, setDownloading] = useState(false);

  const isPayment = transaction.type === 'payment';
  const isSale = transaction.type === 'sale';

  // Payment breakdown — paymentDetails may arrive as either a parsed object
  // or a raw JSON string depending on the Prisma driver's Json handling.
  // Normalise once so the render code stays flat.
  const paymentDetails: { cash?: number; upi?: number; card?: number } | null = (() => {
    const raw = resolved.paymentDetails as unknown;
    if (!raw) return null;
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch { return null; }
    }
    return raw as any;
  })();
  const billTotal = resolved.saleTotalAmount;
  const billPaid = resolved.saleAmountPaid;
  const billOutstanding = resolved.outstandingAmount;
  const showBreakdown = billTotal != null && billPaid != null && (transaction.type === 'udhar' || transaction.type === 'sale');
  const typeLabel = transaction.type === 'udhar'
    ? (t('creditBill') || 'Credit Bill')
    : isPayment
      ? (t('paymentReceived') || 'Payment Received')
      : isSale
        ? (t('salePaidInFull') || 'Sale (Paid in Full)')
        : transaction.type;

  // ─── Upload photo for THIS bill ─────────────────────────────────────────
  // Attaches to the customer/party's `documents` array, tagged with this
  // transaction's id — so the paperclip indicator shows on this row and
  // the photo lands in the "Bill Photo" section of this modal on next open.
  const [uploading, setUploading] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  async function handlePhotoUpload(file: File | null | undefined) {
    if (!file || !entityId || !entityType) return;
    setUploading(true);
    try {
      // 1) Upload file → get URL back
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', entityType === 'party' ? 'party-bills' : 'customer-bills');
      const uploadRes = await api.post('/upload', fd);
      const url = uploadRes.data?.url || uploadRes.data?.path;
      if (!url) throw new Error('Upload returned no URL');

      // 2) Fetch current customer row (need `name` for the PUT to pass
      //    the required-field validator).
      const custRes = await api.get(`/crm/customers?type=${entityType}`);
      const list = Array.isArray(custRes.data) ? custRes.data : [];
      const cust = list.find((c: any) => c.id === entityId);
      if (!cust) throw new Error('Customer not found');

      // 3) Merge new doc into documents[] and PUT it back.
      const existing = Array.isArray(cust.documents) ? cust.documents : [];
      const newDoc = {
        id: (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
        url,
        uploadedAt: new Date().toISOString(),
        transactionId: transaction.billNumber || transaction.id,
      };
      const nextDocs = [...existing, newDoc];
      await api.put(`/crm/customers/${entityId}`, {
        name: cust.name,
        shopName: cust.shopName,
        mobile: cust.mobile,
        gst: cust.gst,
        address: cust.address,
        creditLimit: cust.creditLimit,
        creditDays: cust.creditDays,
        customerType: entityType,
        documents: nextDocs,
      });

      // 4) Show it in this modal immediately (no refetch needed).
      setResolved(r => ({ ...r, documents: [...(r.documents || []), newDoc] }));
      toast.success('Photo attached to this bill');
      onPhotoUploaded?.();
    } catch (e: any) {
      console.error('Photo upload failed', e);
      toast.error(e?.response?.data?.detail || e?.message || 'Failed to attach photo');
    } finally {
      setUploading(false);
    }
  }

  // ─── Delete THIS bill ───────────────────────────────────────────────────
  // Backend DELETE /billing/:identifier now accepts either a Sale UUID or
  // an invoice_number, and its reverseSaleEffects call restores product
  // stock (currentStock + size_variants + Udyog variants[] + wholesale
  // batches), clears the udhar row + reduces customer.totalDue, drops the
  // cashBook sale row and any refund entry a return had written, and
  // deletes SaleItems + the Sale itself — all in one transaction. The
  // recycle bin holds a snapshot so an accidental delete stays undoable
  // via the /trash page.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Deleteable = this row is a real Sale (a Credit Bill or a fully-paid
  // Sale). A payment / refund / opening-balance row doesn't map to a Sale,
  // so the Delete button hides for those.
  const isBillRow = transaction.type === 'udhar' || transaction.type === 'sale';

  async function handleDelete() {
    if (!transaction.billNumber) {
      toast.error('This entry has no bill number to delete against.');
      return;
    }
    setDeleting(true);
    try {
      await api.delete(`/billing/${encodeURIComponent(transaction.billNumber)}`);
      toast.success(`Bill ${transaction.billNumber} deleted — stock and udhar reversed`);
      onDeleted?.();
      onClose();
    } catch (e: any) {
      console.error('Delete bill failed', e);
      toast.error(e?.response?.data?.detail || e?.message || 'Failed to delete bill');
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      await generateCustomerBillPDF({
        shop: {
          name: profile.shopName || 'Vyapar Sarthi',
          address: profile.address || null,
          mobile: profile.mobile || null,
          gst: profile.gst || null,
          pan: profile.pan || null,
        },
        entityName,
        bill: {
          type: transaction.type,
          amount: transaction.amount,
          note: transaction.note,
          billNumber: transaction.billNumber,
          date: transaction.date,
          gstPercent: resolved.gstPercent,
          gstAmount: resolved.gstAmount,
        },
        items: resolved.items,
        filename: `${isPayment ? 'payment' : 'bill'}-${(transaction.billNumber || transaction.id).toString().trim().replace(/\s+/g, '-').toLowerCase()}`,
      });
    } catch (e) {
      console.error('Failed to generate bill PDF', e);
      alert(t('failedToGeneratePdf') || 'Failed to generate the PDF.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-xl flex flex-col overflow-hidden max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{typeLabel}</h2>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide ${isPayment ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'}`}>
                {isPayment ? (t('paymentReceived') || 'Payment') : (t('creditBill') || 'Bill')}
              </span>
              {transaction.billNumber && <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">#{transaction.billNumber}</span>}
              <span>{transaction.date ? new Date(transaction.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-4">
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              {isPayment ? (t('paymentReceived') || 'Amount') : (t('amount') || 'Amount')}
            </span>
            <span className={`text-xl font-black ${isPayment ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'}`}>
              {isPayment ? '−' : '+'}{rupee(transaction.amount)}
            </span>
          </div>

          {resolved.gstPercent != null && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20">
              <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider">GST</span>
              <span className="text-sm font-bold text-indigo-700 dark:text-indigo-400">
                {resolved.gstPercent}% · {rupee(resolved.gstAmount || 0)}
              </span>
            </div>
          )}

          {showBreakdown && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                <h3 className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                  How this bill was paid
                </h3>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                <div className="px-3 py-2 flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-300">Bill Total</span>
                  <span className="font-bold text-slate-900 dark:text-white">{rupee(billTotal || 0)}</span>
                </div>
                {paymentDetails && (paymentDetails.cash || 0) > 0 && (
                  <div className="px-3 py-2 flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Cash Paid</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{rupee(paymentDetails.cash || 0)}</span>
                  </div>
                )}
                {paymentDetails && (paymentDetails.upi || 0) > 0 && (
                  <div className="px-3 py-2 flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">UPI Paid</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{rupee(paymentDetails.upi || 0)}</span>
                  </div>
                )}
                {paymentDetails && (paymentDetails.card || 0) > 0 && (
                  <div className="px-3 py-2 flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Card Paid</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{rupee(paymentDetails.card || 0)}</span>
                  </div>
                )}
                {!paymentDetails && (billPaid || 0) > 0 && (
                  <div className="px-3 py-2 flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">
                      Paid{resolved.paymentType ? ` (${resolved.paymentType})` : ''}
                    </span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{rupee(billPaid || 0)}</span>
                  </div>
                )}
                <div className={`px-3 py-2 flex items-center justify-between ${(billOutstanding || 0) > 0 ? 'bg-orange-50 dark:bg-orange-500/10' : 'bg-emerald-50 dark:bg-emerald-500/10'}`}>
                  <span className={`font-bold ${(billOutstanding || 0) > 0 ? 'text-orange-800 dark:text-orange-300' : 'text-emerald-800 dark:text-emerald-300'}`}>
                    {(billOutstanding || 0) > 0 ? 'Udhar (Unpaid)' : 'Fully Paid'}
                  </span>
                  <span className={`font-black ${(billOutstanding || 0) > 0 ? 'text-orange-800 dark:text-orange-300' : 'text-emerald-800 dark:text-emerald-300'}`}>
                    {rupee(billOutstanding || 0)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {transaction.note && (
            <p className="text-sm text-slate-600 dark:text-slate-300">{transaction.note}</p>
          )}

          {resolved.documents && resolved.documents.length > 0 && (
            <div>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <ImageIcon size={12} /> Bill Photo
              </h3>
              <div className="flex flex-wrap gap-2">
                {resolved.documents.map((d) => (
                  <a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer"
                    className="block rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 hover:border-orange-400 dark:hover:border-orange-600 transition-colors">
                    <img src={d.url} alt="Bill photo" className="h-28 w-28 object-cover" />
                  </a>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
              {t('itemsHeader') || 'Products'}
            </h3>
            {loadingItems ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
              </div>
            ) : resolved.items.length === 0 ? (
              <p className="text-xs text-slate-500 italic">
                {t('noItemBreakdown') || 'No itemised product breakdown is available for this entry.'}
              </p>
            ) : (
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-2 text-left font-bold">{t('product') || 'Product'}</th>
                      <th className="px-3 py-2 text-right font-bold">{t('qty') || 'Qty'}</th>
                      <th className="px-3 py-2 text-right font-bold">{t('costPrice') || 'Cost'}</th>
                      <th className="px-3 py-2 text-right font-bold">{t('profit') || 'Profit'}</th>
                      <th className="px-3 py-2 text-right font-bold">{t('profitPercent') || 'Profit %'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {resolved.items.map((it, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">{it.name}</td>
                        <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">{it.quantity}</td>
                        <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">{rupee(it.costPrice)}</td>
                        <td className="px-3 py-2 text-right font-bold text-emerald-600 dark:text-emerald-400">{rupee(it.profitPerUnit * it.quantity)}</td>
                        <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">{it.profitPercent != null ? `${it.profitPercent}%` : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-100 dark:border-slate-800 shrink-0 space-y-2">
          {/* Confirm-delete inline block — replaces the button row while
              the shopkeeper is deciding. Explicit list of what the delete
              will undo so nobody hits it thinking it's just a UI-tidy
              action. */}
          {confirmingDelete ? (
            <div className="rounded-xl border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-500/10 p-3 space-y-2">
              <p className="text-xs font-bold text-red-800 dark:text-red-300 flex items-center gap-1.5">
                <AlertTriangle size={13} /> Delete bill {transaction.billNumber}?
              </p>
              <ul className="text-[11px] text-red-700 dark:text-red-300 space-y-0.5 pl-4 list-disc">
                <li>Stock returns to inventory for every item on this bill</li>
                <li>Udhar entry is removed & customer's outstanding reduced</li>
                <li>Cash entry cleared from the day's cashbook</li>
                <li>Recoverable from the Recycle Bin for 30 days</li>
              </ul>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                  className="flex-1 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300"
                >Cancel</button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-black disabled:opacity-60 flex items-center justify-center gap-1"
                >
                  {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  {deleting ? 'Deleting…' : 'Yes, delete'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Hidden inputs — one accepts camera capture on mobile, one
                  picks from gallery/desktop file browser. */}
              <input
                ref={cameraInputRef} type="file" accept="image/*" capture="environment"
                className="hidden" onChange={e => { handlePhotoUpload(e.target.files?.[0]); e.currentTarget.value = ''; }}
              />
              <input
                ref={galleryInputRef} type="file" accept="image/*"
                className="hidden" onChange={e => { handlePhotoUpload(e.target.files?.[0]); e.currentTarget.value = ''; }}
              />

              {/* Photo upload row — only shows when we have entity context
                  (the CustomerRollupView opens without entityId, and
                  photos can't be attached without knowing which customer
                  row owns the `documents` array). */}
              {entityId && entityType && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold hover:border-orange-400 dark:hover:border-orange-600 disabled:opacity-60"
                  >
                    {uploading ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                    Take Photo
                  </button>
                  <button
                    onClick={() => galleryInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold hover:border-orange-400 dark:hover:border-orange-600 disabled:opacity-60"
                  >
                    {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                    Upload Photo
                  </button>
                </div>
              )}

              {/* View-Invoice button: opens the original bill page for this
                  invoice. Only rendered for bill rows (udhar/sale) that carry
                  a real invoice number — payments/opening-balance rows have
                  nothing to link to. `_blank` so the shopkeeper doesn't lose
                  their spot in the ledger. */}
              {isBillRow && transaction.billNumber && (
                <a
                  href={`/${locale}/billing/invoices/${encodeURIComponent(transaction.billNumber)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 bg-white dark:bg-slate-800 border border-orange-300 dark:border-orange-500/50 text-orange-700 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/10 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors"
                >
                  <ExternalLink size={16} /> View Original Invoice
                </a>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-60"
                >
                  {downloading ? <Loader2 size={16} className="animate-spin" /> : <ReceiptText size={16} />}
                  {t('downloadBillPdfBtn') || 'Download PDF'}
                </button>
                {isBillRow ? (
                  <button
                    onClick={() => setConfirmingDelete(true)}
                    className="flex items-center justify-center gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors"
                  >
                    <Trash2 size={16} /> Delete Bill
                  </button>
                ) : (
                  // Non-bill rows (payment received, opening balance) show
                  // nothing here — the download button spans full width.
                  <div />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
