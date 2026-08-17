'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { X, ReceiptText, Loader2, ImageIcon } from 'lucide-react';
import { useBusinessStore } from '@/lib/businessStore';
import api from '@/lib/api';
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
}: {
  entityId?: string;
  entityType?: 'customer' | 'party';
  entityName: string;
  transaction: Transaction;
  onClose: () => void;
}) {
  const t = useTranslations('LedgerView');
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
  const typeLabel = transaction.type === 'udhar'
    ? (t('creditBill') || 'Credit Bill')
    : isPayment
      ? (t('paymentReceived') || 'Payment Received')
      : isSale
        ? (t('salePaidInFull') || 'Sale (Paid in Full)')
        : transaction.type;

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

        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-60"
          >
            {downloading ? <Loader2 size={16} className="animate-spin" /> : <ReceiptText size={16} />}
            {t('downloadBillPdfBtn') || 'Download PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
