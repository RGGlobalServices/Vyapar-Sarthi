'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Loader2, ArrowUpRight, ArrowDownLeft, FileText, Calendar, Search, X, Paperclip, ExternalLink } from 'lucide-react';
import api from '@/lib/api';
import { fmtDate } from '@/lib/utils';
import { ExportButton } from '@/lib/hooks/useExport';
import TransactionDetailModal from './TransactionDetailModal';

// Per-product line from the Sale that produced a credit bill. costPrice is
// the product's CURRENT cost (see route.ts comment — historical per-sale
// cost isn't persisted), so it can drift from what it was on the actual bill
// date; profitPerUnit is the real, historically-accurate ₹ figure computed
// at billing time regardless.
type BillItem = {
  name: string;
  quantity: number;
  sellingPrice: number;
  costPrice: number;
  mrp?: number | null;
  purchaseDiscountPercent?: number | null;
  profitPerUnit: number;
  profitPercent: number | null;
};

type Transaction = {
  id: string;
  pricingModel?: string | null;
  mill?: import('./TransactionDetailModal').MillLedgerBreakdown | null;
  type: string;
  amount: number;
  note: string;
  billNumber: string;
  date: string;
  /** e.g. "5" or "5, 18" for a mixed-rate bill. null = not a GST bill (or not
   *  a bill at all, e.g. a payment/opening balance). */
  gstPercent: string | null;
  gstAmount: number | null;
  items: BillItem[];
  /** Photo(s) of the physical bill, attached via Add Bill (see
   *  AddBillModal) — empty for entries that never had one. */
  documents: { id: string; url: string; uploadedAt: string }[];
  // Per-bill money breakdown from /crm/ledger. Nulls on non-sale rows.
  saleTotalAmount?: number | null;
  saleAmountPaid?: number | null;
  outstandingAmount?: number | null;
  paymentType?: string | null;
  paymentDetails?: { cash?: number; upi?: number; card?: number } | null;
};

// Raw shapes as they actually come back from /crm/ledger — customer_transactions
// columns are snake_case with no @map (bill_number, created_at), while
// SupplierTransaction is @map'd to camelCase (billNumber, createdAt). Both are
// normalized into one Transaction shape below so the rest of this component
// never has to care which entityType it's rendering.
type RawTransaction = {
  id: string;
  pricingModel?: string | null;
  mill?: import('./TransactionDetailModal').MillLedgerBreakdown | null;
  type: string | null;
  amount: number | null;
  note: string | null;
  billNumber?: string | null;
  bill_number?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
  gstPercent?: string | null;
  gstAmount?: number | null;
  items?: BillItem[];
  documents?: { id: string; url: string; uploadedAt: string }[];
  saleTotalAmount?: number | null;
  saleAmountPaid?: number | null;
  outstandingAmount?: number | null;
  paymentType?: string | null;
  paymentDetails?: { cash?: number; upi?: number; card?: number } | null;
};

export default function LedgerView({
  entityId,
  entityType,
  entityName,
  onLedgerChanged,
}: {
  entityId: string;
  entityType: 'customer' | 'party' | 'supplier';
  entityName?: string;
  // Fires when a bill was deleted or a photo attached — used by the
  // parent page (/party, /customers) to re-fetch the outer customer
  // list so the panel header's outstanding total stays in sync with the
  // just-refetched ledger below.
  onLedgerChanged?: () => void;
}) {
  const t = useTranslations('LedgerView');
  const locale = useLocale();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState({ from: '', to: '' });
  const [billSearch, setBillSearch] = useState('');
  const [viewingTransaction, setViewingTransaction] = useState<Transaction | null>(null);

  const fetchLedger = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ entityType, entityId });
      if (range.from) params.set('from', range.from);
      if (range.to) params.set('to', range.to);
      const res = await api.get(`/crm/ledger?${params.toString()}`);
      const normalized: Transaction[] = (res.data || []).map((tx: RawTransaction) => ({
        id: tx.id,
        pricingModel: tx.pricingModel ?? null,
        mill: tx.mill ?? null,
        type: tx.type || '',
        amount: tx.amount || 0,
        note: tx.note || '',
        billNumber: tx.billNumber || tx.bill_number || '',
        date: tx.createdAt || tx.created_at || '',
        gstPercent: tx.gstPercent ?? null,
        gstAmount: tx.gstAmount ?? null,
        items: Array.isArray(tx.items) ? tx.items : [],
        documents: Array.isArray(tx.documents) ? tx.documents : [],
        saleTotalAmount: tx.saleTotalAmount ?? null,
        saleAmountPaid: tx.saleAmountPaid ?? null,
        outstandingAmount: tx.outstandingAmount ?? null,
        paymentType: tx.paymentType ?? null,
        paymentDetails: tx.paymentDetails ?? null,
      }));
      setTransactions(normalized);
    } catch (e) {
      console.error('Failed to load ledger', e);
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType, range.from, range.to]);

  useEffect(() => { fetchLedger(); }, [fetchLedger]);

  // Credit = money the party/customer owes (a bill on account); Payment =
  // money they actually handed over. Reused for both the on-screen +/- glyph
  // and the exported "Direction" column so the two can never disagree.
  const isCredit = (tx: Transaction) => tx.type === 'credit' || tx.type === 'udhar' || tx.type === 'sale';
  // Discount/write-off reduces the outstanding balance like a payment does
  const totalCredit = transactions.filter(isCredit).reduce((sum, tx) => sum + (tx.amount || 0), 0);
  const totalPayments = transactions.filter(tx => !isCredit(tx)).reduce((sum, tx) => sum + (tx.amount || 0), 0);

  // 'sale' = a bill paid in FULL at billing time — synthesized server-side
  // (see api/v1/crm/ledger/route.ts) since those never get a real 'udhar'
  // row and would otherwise be invisible in this history, even though a
  // real sale happened.
  const typeLabel = (tx: Transaction) => tx.type === 'udhar' ? t('creditBill') : tx.type === 'payment' ? t('paymentReceived') : tx.type === 'sale' ? (t('salePaidInFull') || 'Sale (Paid in Full)') : tx.type === 'discount' ? 'Discount / Write-off' : tx.type;

  // Oldest-first for the exported document only — a printed/downloaded
  // ledger reads as a running history (and lets whoever's reading it clear
  // the OLDEST outstanding bills first), unlike the on-screen list above
  // which stays newest-first for at-a-glance recent activity.
  //
  // A credit bill can carry multiple products, so it expands into one export
  // row per product (repeating the bill-level columns on each row — the
  // standard way to lay out one-to-many invoice lines in a flat CSV/Excel/PDF
  // table). Payments and bills with no resolvable items (e.g. a manually
  // entered opening balance) stay a single row with the product columns blank.
  const exportData = [...transactions].reverse().flatMap(tx => {
    const base = {
      date: tx.date,
      type: typeLabel(tx),
      direction: isCredit(tx) ? 'Credit' : 'Payment',
      billNumber: tx.billNumber || '',
      amount: tx.amount,
      gstPercent: tx.gstPercent != null ? `${tx.gstPercent}%` : '',
      gstAmount: tx.gstPercent != null ? tx.gstAmount : '',
      note: tx.note || '',
    };
    if (tx.items.length === 0) {
      return [{ ...base, product: '', qty: 0, mrp: '', purchaseDiscountPercent: '', costPrice: '', sellingPrice: 0, itemProfit: 0, itemProfitPercent: '' }];
    }
    return tx.items.map(it => ({
      ...base,
      product: it.name,
      qty: it.quantity,
      mrp: it.mrp || '',
      purchaseDiscountPercent: it.purchaseDiscountPercent != null ? `${it.purchaseDiscountPercent}%` : '',
      costPrice: it.costPrice || '',
      sellingPrice: it.sellingPrice,
      itemProfit: Math.round(it.profitPerUnit * it.quantity * 100) / 100,
      itemProfitPercent: it.profitPercent != null ? `${it.profitPercent}%` : '',
    }));
  });

  // Short, single-word-where-possible labels — with 14 columns now (up from
  // 8 before the per-product breakdown), autoTable's auto-width squeezes
  // every column hard enough that a multi-word header like "Selling Price"
  // wraps letter-by-letter instead of word-by-word. Landscape orientation
  // (below) is the main fix; short labels are the belt-and-suspenders half.
  const exportColumns = [
    { key: 'date', label: 'Date', type: 'date' as const },
    { key: 'type', label: 'Type' },
    { key: 'direction', label: 'Direction' },
    { key: 'billNumber', label: 'Bill No' },
    { key: 'product', label: 'Product' },
    { key: 'qty', label: 'Qty' },
    { key: 'mrp', label: 'MRP', type: 'currency' as const },
    { key: 'purchaseDiscountPercent', label: 'Purch%' },
    { key: 'costPrice', label: 'Cost', type: 'currency' as const },
    { key: 'sellingPrice', label: 'Price', type: 'currency' as const },
    { key: 'itemProfit', label: 'Profit', type: 'currency' as const },
    { key: 'itemProfitPercent', label: 'Profit %' },
    { key: 'amount', label: 'Bill Amt', type: 'currency' as const },
    { key: 'gstPercent', label: 'GST %' },
    { key: 'gstAmount', label: 'GST Amt', type: 'currency' as const },
    { key: 'note', label: 'Note' },
  ];

  const dateRangeLabel = range.from && range.to
    ? `${new Date(range.from).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} – ${new Date(range.to).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`
    : undefined;

  // Bill-number search — filters the already-loaded list client-side, same
  // convention as the Supplier module's equivalent (see suppliers/page.tsx).
  const billSearchNeedle = billSearch.trim().toLowerCase();
  const visibleTransactions = billSearchNeedle
    ? transactions.filter(tx =>
        (tx.billNumber || '').toLowerCase().includes(billSearchNeedle) ||
        (tx.note || '').toLowerCase().includes(billSearchNeedle)
      )
    : transactions;

  return (
    <div className="space-y-4">
      {/* From above, To below — filters what's fetched AND what prints on the
          PDF/Excel/CSV letterhead via dateRangeLabel below. */}
      <div className="flex flex-col gap-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 max-w-xs">
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('fromDate') || 'From'}</label>
          <input
            type="date"
            value={range.from}
            onChange={e => setRange(r => ({ ...r, from: e.target.value }))}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('toDate') || 'Upto'}</label>
          <input
            type="date"
            value={range.to}
            onChange={e => setRange(r => ({ ...r, to: e.target.value }))}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        {(range.from || range.to) && (
          <button
            onClick={() => setRange({ from: '', to: '' })}
            className="text-[11px] font-bold text-slate-400 hover:text-red-500 text-left"
          >
            {t('clearDateFilter') || 'Clear date filter'}
          </button>
        )}
      </div>

      <div className="relative max-w-xs">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={billSearch}
          onChange={e => setBillSearch(e.target.value)}
          placeholder={t('searchByBillNumberPlaceholder') || 'Search by bill number or description...'}
          className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-1 focus:ring-emerald-500"
        />
        {billSearch && (
          <button
            onClick={() => setBillSearch('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-medium text-slate-500">
          {loading
            ? (t('loading') || 'Loading…')
            : `${visibleTransactions.length} ${visibleTransactions.length === 1 ? t('transaction') || 'transaction' : t('transactions') || 'transactions'}`}
        </p>
        <ExportButton
          filename={`ledger-${(entityName || entityType).toString().trim().replace(/\s+/g, '-').toLowerCase()}`}
          title={`${entityName || 'Account'} — Ledger`}
          dateRange={dateRangeLabel}
          orientation="landscape"
          summary={[
            { label: 'Total Credit', value: `₹${totalCredit.toLocaleString('en-IN')}` },
            { label: 'Total Payments', value: `₹${totalPayments.toLocaleString('en-IN')}` },
          ]}
          columns={exportColumns}
          data={exportData}
        />
      </div>

      {loading ? (
        <div className="flex justify-center p-8">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
        </div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p>{t('noTransactionsFound')}</p>
        </div>
      ) : visibleTransactions.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p>{t('noBillsMatchSearch') || 'No bills match your search.'}</p>
        </div>
      ) : (
        visibleTransactions.map((tx) => {
          const credit = isCredit(tx);

          return (
            <div
              key={tx.id}
              onClick={() => setViewingTransaction(tx)}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm flex items-center p-4 gap-4 cursor-pointer hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors"
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                credit
                  ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30'
                  : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30'
              }`}>
                {credit ? <ArrowUpRight size={20} /> : <ArrowDownLeft size={20} />}
              </div>

              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-slate-900 dark:text-white truncate">
                  {typeLabel(tx)}
                </h4>
                <p className="text-xs text-slate-500 truncate flex items-center gap-1.5 flex-wrap mt-0.5">
                  {tx.billNumber && <span className="font-mono bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">{tx.billNumber}</span>}
                  {tx.gstPercent != null && (
                    <span className="font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-1.5 py-0.5 rounded">
                      {tx.gstPercent}% GST · ₹{(tx.gstAmount || 0).toLocaleString('en-IN')}
                    </span>
                  )}
                  {/* At-a-glance Paid & Udhar chips — sourced from the same
                      per-bill breakdown block the modal shows on open. Only
                      rendered when the row has a real Sale attached (payment/
                      opening-balance rows keep the strip lean). */}
                  {tx.saleAmountPaid != null && (tx.saleAmountPaid || 0) > 0 && (
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.5 rounded" title="Amount already paid on this bill">
                      Paid ₹{Math.round(tx.saleAmountPaid || 0).toLocaleString('en-IN')}
                    </span>
                  )}
                  {tx.outstandingAmount != null && (tx.outstandingAmount || 0) > 0 && (
                    <span className="font-bold text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-500/10 px-1.5 py-0.5 rounded" title="Still owed on this bill">
                      Udhar ₹{Math.round(tx.outstandingAmount || 0).toLocaleString('en-IN')}
                    </span>
                  )}
                  {tx.documents.length > 0 && (
                    <span className="flex items-center gap-0.5 font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-1.5 py-0.5 rounded" title="Bill photo attached">
                      <Paperclip size={10} /> Photo
                    </span>
                  )}
                  {tx.note && <span>{tx.note}</span>}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="text-right">
                  <div className={`font-black ${credit ? 'text-orange-600 dark:text-orange-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {credit ? '+' : '-'}₹{tx.amount.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-slate-400 flex items-center justify-end gap-1">
                    <Calendar size={10} /> {fmtDate(tx.date)}
                  </div>
                </div>
                {/* Direct link to the original invoice detail page. Only for
                    real bill rows (udhar/sale) — payments/opening-balance
                    rows have no invoice to open. stopPropagation so the row's
                    modal-open click doesn't also fire underneath. */}
                {tx.billNumber && (tx.type === 'udhar' || tx.type === 'sale') && (
                  <a
                    href={`/${locale}/billing/invoices/${encodeURIComponent(tx.billNumber)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title="Open the original invoice page"
                    className="p-2 rounded-lg text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/10 border border-transparent hover:border-orange-200 dark:hover:border-orange-500/30 transition-colors"
                  >
                    <ExternalLink size={16} />
                  </a>
                )}
              </div>
            </div>
          );
        })
      )}

      {viewingTransaction && (
        <TransactionDetailModal
          // Pass the entity context so the modal can (a) attach photos to
          // the right customer.documents array, and (b) know which
          // customer to refetch after a delete. Supplier ledgers use a
          // different pipeline and don't have per-bill delete here.
          entityId={entityType === 'supplier' ? undefined : entityId}
          entityType={entityType === 'supplier' ? undefined : (entityType as 'customer' | 'party')}
          entityName={entityName || entityType}
          transaction={viewingTransaction}
          onClose={() => setViewingTransaction(null)}
          onDeleted={() => { fetchLedger(); onLedgerChanged?.(); }}
          onPhotoUploaded={() => { fetchLedger(); onLedgerChanged?.(); }}
        />
      )}
    </div>
  );
}
