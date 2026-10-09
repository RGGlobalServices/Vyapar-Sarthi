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

/** Title-above, boxed-value-below tile — the compact "field" unit the GST/charges grid is built from. */
function Tile({ label, value, testid, muted, highlight }: { label: ReactNode; value: ReactNode; testid?: string; muted?: boolean; highlight?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1 truncate">{label}</div>
      <div
        data-testid={testid}
        className={cn(
          'h-9 px-2.5 flex items-center justify-end rounded-lg border font-mono text-sm truncate',
          highlight
            ? 'border-orange-300 dark:border-orange-500/40 bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 font-bold'
            : muted
            ? 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 text-slate-400 dark:text-slate-600'
            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200'
        )}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * Mill Billing totals, in the approved order:
 *   Goods Subtotal → Discount → Taxable → GST → Freight → Hamali → Loading → Unloading → Other → Round Off →
 *   Grand Total → Amount Received → Balance / Udhar
 * Every figure comes from the shared engine (lib/millBilling.ts) — the same maths the server runs — so this preview
 * equals what the server will store. The server's own numbers are shown again after the bill is saved.
 *
 * Layout: the running subtotal (Goods → Discount → Taxable) reads top-to-bottom as a list since each line
 * depends on the one above it; GST and the charge breakdown don't depend on each other, so they sit in a
 * 3-per-row tile grid (label on top, value boxed below) instead of one long list of rows.
 */
export default function MillTotalsSummary({
  calc, itemsCount, discountSlot, collected, balance, showPaymentStatus = true,
}: {
  calc: MillResult | null;
  itemsCount: number;
  discountSlot: ReactNode;
  collected: number;
  balance: number;
  /** Hide Amount Received / Balance-Udhar — the main billing page shows the running total only;
   *  payment collection and the final balance are the Checkout modal's job, so showing them twice
   *  (with the main page's copy frozen before payment is even entered) was redundant and confusing. */
  showPaymentStatus?: boolean;
}) {
  const t = useTranslations('MillBilling');
  const zero = { freight: 0, hamali: 0, loading: 0, unloading: 0, other: 0 };
  const charges = calc?.charges ?? zero;
  const gstBilled = !!calc?.gstBilled;

  const taxTiles = gstBilled
    ? (calc!.interState
        ? [{ key: 'igst', label: t('igst'), value: money(calc!.igst) }]
        : [
            { key: 'cgst', label: t('cgst'), value: money(calc!.cgst) },
            { key: 'sgst', label: t('sgst'), value: money(calc!.sgst) },
          ]
      ).concat([{ key: 'gst', label: t('gst'), value: money(calc!.totalGst) }])
    : [{ key: 'gst', label: t('gst'), value: money(0), muted: true, note: t('gstNotApplicable') }];

  const chargeTiles = MILL_CHARGE_KEYS.map((k) => ({
    key: k,
    label: t(k === 'other' ? 'otherCharges' : k),
    value: money(charges[k]),
    muted: !charges[k],
  }));

  const roundOffTile = {
    key: 'roundoff',
    label: t('roundOff'),
    value: `${(calc?.roundOff ?? 0) >= 0 ? '+' : '−'} ${money(Math.abs(calc?.roundOff ?? 0))}`,
    muted: !(calc?.roundOff),
  };

  return (
    <div data-testid="mill-totals" className="space-y-3">
      {/* Running subtotal — each line depends on the one above, so it stays a simple list */}
      <div className="space-y-2">
        <Row label={<>{t('goodsSubtotal')} <span className="text-[11px] text-slate-400">({itemsCount} {t('itemsLabel')})</span></>} value={money(calc?.goodsSubtotal ?? 0)} testid="mill-goods-subtotal" />
        <div className="flex justify-between items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
          <span>{t('discount')}</span>
          <div className="flex items-center gap-2">{discountSlot}</div>
        </div>
        <Row label={t('discount')} sub muted={!(calc?.discount)} value={`− ${money(calc?.discount ?? 0)}`} testid="mill-discount" />
        <Row label={t('taxableAmount')} value={money(calc?.taxable ?? 0)} strong testid="mill-taxable" />
      </div>

      {/* Tax + charges — independent figures, shown as labelled tiles, 3 per row */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-2">
        {taxTiles.map((tile) => (
          <Tile key={tile.key} label={tile.label} value={tile.value} muted={(tile as any).muted} testid={`mill-${tile.key}`} />
        ))}
        {chargeTiles.map((tile) => (
          <Tile key={tile.key} label={tile.label} value={tile.value} muted={tile.muted} testid={`mill-${tile.key}`} />
        ))}
        <Tile label={roundOffTile.label} value={roundOffTile.value} muted={roundOffTile.muted} testid="mill-roundoff" />
      </div>

      {/* Grand total — the one figure that matters most, kept as a full-width banner */}
      <div className="pt-3 mt-1 border-t border-slate-200 dark:border-slate-800 flex justify-between items-end gap-3">
        <span className="text-sm font-bold text-slate-900 dark:text-slate-200">{t('grandTotal')}</span>
        <span data-testid="mill-grand-total" className="text-3xl font-black text-emerald-600 dark:text-emerald-400 font-mono tracking-tight">{money(calc?.grandTotal ?? 0)}</span>
      </div>

      {/* Payment status — received vs outstanding, side by side. Checkout-only: this page's
          "collected" is always ₹0 before the Checkout modal is even opened. */}
      {showPaymentStatus && (
        <div className="grid grid-cols-2 gap-2">
          <Tile label={t('amountReceived')} value={money(collected)} testid="mill-received" />
          <Tile label={t('balanceUdhar')} value={money(balance)} highlight={balance > 0} testid="mill-balance" />
        </div>
      )}
    </div>
  );
}
