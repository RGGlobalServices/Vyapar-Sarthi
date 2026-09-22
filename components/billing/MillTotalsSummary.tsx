'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { MILL_CHARGE_KEYS, type MillResult } from '@/lib/millBilling';
import { cn } from '@/lib/utils';

const money = (n: number) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Row({ label, value, testid, muted, strong, sub }: { label: ReactNode; value: ReactNode; testid?: string; muted?: boolean; strong?: boolean; sub?: boolean }) {
  return (
    <div className={cn('flex justify-between items-baseline gap-3', sub ? 'pl-3 text-xs' : 'text-sm', muted ? 'text-slate-400 dark:text-slate-500' : 'text-slate-600 dark:text-slate-400', strong && 'font-bold text-slate-900 dark:text-slate-200')}>
      <span className="min-w-0">{label}</span>
      <span data-testid={testid} className="font-mono shrink-0 text-right">{value}</span>
    </div>
  );
}

/**
 * Mill Billing totals, in the approved order:
 *   Goods Subtotal → Discount → Taxable → GST → Freight → Hamali → Loading → Unloading → Other → Round Off →
 *   Grand Total → Amount Received → Balance / Udhar
 * Every figure comes from the shared engine (lib/millBilling.ts) — the same maths the server runs — so this preview
 * equals what the server will store. The server's own numbers are shown again after the bill is saved.
 */
export default function MillTotalsSummary({
  calc, itemsCount, discountSlot, collected, balance,
}: {
  calc: MillResult | null;
  itemsCount: number;
  discountSlot: ReactNode;
  collected: number;
  balance: number;
}) {
  const t = useTranslations('MillBilling');
  const zero = { freight: 0, hamali: 0, loading: 0, unloading: 0, other: 0 };
  const charges = calc?.charges ?? zero;
  const gstBilled = !!calc?.gstBilled;
  return (
    <div data-testid="mill-totals" className="space-y-2">
      <Row label={<>{t('goodsSubtotal')} <span className="text-[11px] text-slate-400">({itemsCount} {t('itemsLabel')})</span></>} value={money(calc?.goodsSubtotal ?? 0)} testid="mill-goods-subtotal" />
      <div className="flex justify-between items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
        <span>{t('discount')}</span>
        <div className="flex items-center gap-2">
          {discountSlot}
        </div>
      </div>
      <Row label={t('discount')} sub muted={!(calc?.discount)} value={`− ${money(calc?.discount ?? 0)}`} testid="mill-discount" />
      <Row label={t('taxableAmount')} value={money(calc?.taxable ?? 0)} testid="mill-taxable" />
      {gstBilled ? (
        <>
          {calc!.interState ? (
            <Row label={t('igst')} sub value={money(calc!.igst)} testid="mill-igst" />
          ) : (
            <>
              <Row label={t('cgst')} sub value={money(calc!.cgst)} testid="mill-cgst" />
              <Row label={t('sgst')} sub value={money(calc!.sgst)} testid="mill-sgst" />
            </>
          )}
          <Row label={t('gst')} value={money(calc!.totalGst)} testid="mill-gst" />
        </>
      ) : (
        <Row label={t('gstNotApplicable')} muted value={money(0)} testid="mill-gst" />
      )}
      {MILL_CHARGE_KEYS.map((k) => (
        <Row key={k} label={t(k === 'other' ? 'otherCharges' : k)} muted={!charges[k]} value={money(charges[k])} testid={`mill-${k}`} />
      ))}
      <Row label={t('roundOff')} muted={!(calc?.roundOff)} value={`${(calc?.roundOff ?? 0) >= 0 ? '+' : '−'} ${money(Math.abs(calc?.roundOff ?? 0))}`} testid="mill-roundoff" />
      <div className="pt-3 mt-1 border-t border-slate-200 dark:border-slate-800 flex justify-between items-end gap-3">
        <span className="text-sm font-bold text-slate-900 dark:text-slate-200">{t('grandTotal')}</span>
        <span data-testid="mill-grand-total" className="text-3xl font-black text-emerald-600 dark:text-emerald-400 font-mono tracking-tight">{money(calc?.grandTotal ?? 0)}</span>
      </div>
      <Row label={t('amountReceived')} value={money(collected)} testid="mill-received" strong />
      <Row label={<span className={balance > 0 ? 'text-orange-500 font-bold' : ''}>{t('balanceUdhar')}</span>} value={<span className={balance > 0 ? 'text-orange-500 font-black' : ''}>{money(balance)}</span>} testid="mill-balance" />
    </div>
  );
}
