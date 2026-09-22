'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle, Printer } from 'lucide-react';
import { MILL_CHARGE_KEYS } from '@/lib/millBilling';
import MillInvoicePreviewModal from '@/components/invoice/MillInvoicePreviewModal';

const money = (n: number) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Shown after a Mill (mill_v2) bill is saved. EVERY number comes from the SERVER's response (the stored bill), never
 * from the client's preview. Print / PDF / WhatsApp open the dedicated Mill invoice (MillInvoicePreviewModal), which
 * re-loads the STORED sale — the legacy GST-inclusive templates are never used for a Mill invoice.
 */
export default function MillBillSavedModal({ bill, customerName, onClose }: { bill: any; customerName?: string; onClose: () => void }) {
  const t = useTranslations('MillBilling');
  const [showInvoice, setShowInvoice] = useState(false);
  const m = bill?.mill || {};
  const total = Number(bill?.totalAmount) || 0;
  const paid = Number(bill?.amountPaid) || 0;
  const balance = Math.max(0, Math.round(total * 100) - Math.round(paid * 100)) / 100;
  const gst = m.gst || {};
  const Row = ({ k, label, value, strong }: { k: string; label: string; value: string; strong?: boolean }) => (
    <div className={`flex justify-between gap-3 text-sm ${strong ? 'font-bold text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}>
      <span>{label}</span><span data-testid={`saved-${k}`} className="font-mono">{value}</span>
    </div>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-testid="mill-saved-modal">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md max-h-[92vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-5">
        <div className="text-center mb-4">
          <CheckCircle className="mx-auto text-emerald-500 mb-2" size={40} />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">{t('savedTitle')}</h3>
          <p className="text-sm text-slate-500 mt-1">{t('invoiceNumber')}: <span data-testid="saved-invoice" className="font-mono font-bold text-slate-800 dark:text-slate-200">{bill?.invoice_number || '—'}</span></p>
          {customerName && <p className="text-xs text-slate-500">{t('customer')}: {customerName}</p>}
        </div>
        <div className="space-y-1.5 border-y border-slate-200 dark:border-slate-800 py-3 mb-3">
          <Row k="goods" label={t('goodsSubtotal')} value={money(m.goods_subtotal)} />
          <Row k="discount" label={t('discount')} value={`− ${money(m.discount)}`} />
          <Row k="taxable" label={t('taxableAmount')} value={money(m.taxable)} />
          {gst.billed ? (
            gst.inter_state
              ? <Row k="igst" label={t('igst')} value={money(gst.igst)} />
              : (<><Row k="cgst" label={t('cgst')} value={money(gst.cgst)} /><Row k="sgst" label={t('sgst')} value={money(gst.sgst)} /></>)
          ) : null}
          <Row k="gst" label={gst.billed ? t('gst') : t('gstNotApplicable')} value={money(gst.total)} />
          {MILL_CHARGE_KEYS.map((k) => (
            <Row key={k} k={k} label={t(k === 'other' ? 'otherCharges' : k)} value={money(m.charges?.[k])} />
          ))}
          <Row k="roundoff" label={t('roundOff')} value={`${(m.round_off ?? 0) >= 0 ? '+' : '−'} ${money(Math.abs(m.round_off ?? 0))}`} />
          <div className="pt-2 mt-1 border-t border-slate-200 dark:border-slate-800">
            <Row k="grand" label={t('grandTotal')} value={money(total)} strong />
          </div>
          <Row k="received" label={t('amountReceived')} value={money(paid)} />
          <Row k="balance" label={t('balanceUdhar')} value={money(balance)} />
        </div>
        {bill?.id ? (
          <button type="button" onClick={() => setShowInvoice(true)} data-testid="saved-open-invoice"
            className="w-full mb-3 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700">
            <Printer size={16} /> {t('openInvoice')}
          </button>
        ) : (
          <p data-testid="saved-print-notice" className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg px-3 py-2 mb-3">{t('printAfterSync')}</p>
        )}
        <button onClick={onClose} data-testid="saved-new-bill" className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold">{t('newBill')}</button>
      </div>
      {showInvoice && bill?.id && <MillInvoicePreviewModal invoiceId={bill.id} onClose={() => setShowInvoice(false)} />}
    </div>
  );
}
