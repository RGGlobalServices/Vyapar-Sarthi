'use client';

import React from 'react';
import { CartItem } from '@/lib/store';
import { useTranslations } from 'next-intl';
import { getInvoiceColumns, isChargeLineItem } from '@/lib/invoice-helpers';
import { BusinessType } from '@/lib/businessConfig';
import { Barcode } from './Barcode';
import type { GstBreakdown } from '@/lib/gst';
import { useUpiQrCode } from './useUpiQrCode';

// Column widths for the thermal items table (table-layout: fixed). The Item
// name column deliberately has no entry — it absorbs whatever's left after
// these, which is what keeps it readable instead of being squeezed by
// however many extra columns a given business type/GST bill tacks on.
const THERMAL_COL_WIDTH: Record<string, string> = {
  qty: '7%',
  rate: '15%',
  amt: '15%',
  color: '11%',
  size: '8%',
  batch: '14%',
  expiry: '12%',
  serial: '13%',
  warranty: '13%',
  hsn: '10%',
  gstPercent: '9%',
};

export interface BaseInvoiceProps {
  items: CartItem[];
  total: number;
  discount?: number;
  amountPaid?: number;
  remainingAmount?: number;
  customerName?: string;
  customerMobile?: string;
  customerType?: string;
  customerGst?: string;
  customerAddress?: string;
  paymentMethod: string;
  billNumber: string;
  date: string;
  storeName?: string;
  storeAddress?: string;
  storeMobile?: string;
  logoUrl?: string;
  ownerSignature?: string;
  gst?: string;
  pan?: string;
  isEmi?: boolean;
  emiMonths?: number;
  emiDownPayment?: number;
  emiMonthlyAmount?: number;
  emiInterestRate?: number;
  emiTotalAmount?: number;
  splitPayments?: { cash?: number; upi?: number; card?: number; udhar?: number };
  businessType?: BusinessType | string;
  invoiceFormat?: 'thermal58' | 'thermal80' | 'a4' | 'wholesale';
  invoiceFooter?: string | null;
  showQrCode?: boolean;
  // GST invoice: billType 'gst' shows tax breakdown + HSN; gstBreakdown carries the numbers.
  billType?: 'gst' | 'non_gst' | string;
  gstBreakdown?: GstBreakdown;
  billImageUrl?: string;
  // Scan-to-pay UPI QR + bank transfer box — set once in Profile, shown on
  // every bill (GST and Non-GST, every package tier) once a shop has a UPI ID.
  upiId?: string;
  // Pre-generated inline-SVG QR (awaited at checkout, before the bill is
  // shown). Preferred over qrDataUrl because it's real DOM html2canvas
  // rasterises synchronously — a raster <img> QR intermittently captured
  // blank in the PDF. See generateUpiQrSvg().
  qrSvg?: string | null;
  // Pre-generated raster QR (data URL). Kept as a fallback for callers that
  // haven't moved to qrSvg yet. Undefined (not null) means "not provided" and
  // falls back to generating it here reactively.
  qrDataUrl?: string | null;
  bankName?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
}

export const ThermalInvoice = React.forwardRef<HTMLDivElement, BaseInvoiceProps>(({
  items,
  total,
  discount = 0,
  amountPaid,
  remainingAmount = 0,
  customerName,
  customerMobile,
  customerType,
  customerGst,
  customerAddress,
  paymentMethod,
  billNumber,
  date,
  storeName,
  storeAddress,
  storeMobile,
  logoUrl,
  ownerSignature,
  gst,
  pan,
  isEmi,
  emiMonths,
  emiDownPayment,
  emiMonthlyAmount,
  emiInterestRate,
  emiTotalAmount,
  splitPayments,
  businessType = 'kirana',
  invoiceFormat = 'thermal80',
  invoiceFooter,
  showQrCode = false,
  billType,
  gstBreakdown,
  upiId,
  qrSvg,
  qrDataUrl: qrDataUrlProp,
}, ref) => {
  const t = useTranslations('BillSlip');
  const isGstBill = billType === 'gst';

  // Transport/Loading/Packing/Other charges ride in the same items array (so
  // they persist with the sale for reprints) but aren't goods — pulling them
  // out of the product rows and listing them as their own total line is what
  // makes Subtotal + Charges + Tax actually add up to the Total, instead of a
  // "0% GST" charge row sitting among taxable products.
  const goodsItems = items.filter((item) => !isChargeLineItem(item.name));
  const chargeItems = items.filter((item) => isChargeLineItem(item.name));
  const subtotal = goodsItems.reduce((acc, item) => acc + item.total, 0);
  const chargesTotal = chargeItems.reduce((acc, item) => acc + item.total, 0);
  const paid = amountPaid ?? total;

  const columns = getInvoiceColumns(businessType);
  const is58mm = invoiceFormat === 'thermal58';
  // A caller-provided QR (computed eagerly at checkout) always wins — passing
  // upiId: undefined to the hook here just skips its own generation rather
  // than doing redundant work whose result would be thrown away. The inline
  // SVG (qrSvg) is preferred; qrDataUrl / the hook are raster fallbacks.
  const hasPreGenQr = qrSvg !== undefined || qrDataUrlProp !== undefined;
  const liveQrDataUrl = useUpiQrCode({
    upiId: hasPreGenQr ? undefined : upiId,
    payeeName: storeName,
    amount: remainingAmount > 0 ? remainingAmount : total,
    note: `Invoice ${billNumber}`,
    size: 140,
  });
  const qrDataUrl = qrDataUrlProp !== undefined ? qrDataUrlProp : liveQrDataUrl;
  
  const widthClass = is58mm ? 'max-w-[220px]' : 'max-w-[320px]';
  const textClass = is58mm ? 'text-[9px]' : 'text-[11px]';
  const smallTextClass = is58mm ? 'text-[7px]' : 'text-[9px]';
  const headerTextClass = is58mm ? 'text-[13px]' : 'text-[17px]';
  // The items-table column HEADERS run a notch smaller than the row text so
  // long single-word labels (WARRANTY, SERIAL, COLOR) fit their narrow fixed
  // columns on ONE line — the alternative, letting them wrap, breaks the word
  // itself (WARR/ANTY) which reads as broken. Cells and headers use nowrap so
  // currency values never split mid-number (₹5,2/00) either; only the Item
  // name column is allowed to wrap, onto clean extra lines.
  const tableHeadClass = is58mm ? 'text-[6px]' : 'text-[8px]';
  const cellPad = is58mm ? 'px-0.5' : 'px-1';
  
  // A thin horizontal rule used between sections — a shared visual weight instead
  // of the previous mix of dashed/dotted/solid borders scattered across the file.
  const rule = { borderTop: '1px solid #000' };
  const boxBorder = { border: '1px solid #000' };

  return (
    <div
      ref={ref}
      style={{ backgroundColor: '#ffffff', color: '#000000', fontFamily: 'Calibri, sans-serif' }}
      className={`p-3 w-full mx-auto ${widthClass} ${textClass} leading-snug`}
    >
      <div style={boxBorder}>
        {/* Header */}
        <div className="text-center px-2 pt-3 pb-2" style={{ borderBottom: '2px solid #000' }}>
          {logoUrl && (
            <div className="flex justify-center mb-2">
              <img src={logoUrl} alt="Logo" style={{ maxHeight: is58mm ? '30px' : '40px', maxWidth: '100px' }} />
            </div>
          )}
          <h1 className={`${headerTextClass} font-black uppercase tracking-tight`}>{storeName || t('storeNameFallback')}</h1>
          {storeAddress && <p className={`${smallTextClass} mt-0.5`}>{storeAddress}</p>}
          <div className={`flex justify-center gap-2 flex-wrap ${smallTextClass} mt-0.5`}>
            {storeMobile && <span>{t('mob')} {storeMobile}</span>}
            {gst && <span>· {t('gstin')} {gst}</span>}
            {pan && <span>· {t('pan')} {pan}</span>}
          </div>
        </div>

        {/* GST vs normal invoice label — a filled banner instead of a plain line */}
        <div
          className={`text-center font-black uppercase tracking-wider ${textClass}`}
          style={{ backgroundColor: '#000', color: '#fff', padding: '4px 0' }}
        >
          {isGstBill ? (t('gstInvoice') || 'GST Invoice') : (t('invoiceLabel') || 'Invoice')}
        </div>

        {/* Bill meta & Barcode */}
        <div className="px-2 pt-2">
          <div className={`flex justify-between items-start ${smallTextClass} font-bold`}>
            <div className="flex flex-col gap-0.5">
              <span>{t('bill')} {billNumber}</span>
              <Barcode value={billNumber} height={20} displayValue={false} />
            </div>
            <span>{date}</span>
          </div>

          {(customerName || customerMobile || customerAddress || customerGst) && (
            <div className={`mt-2 mb-2 p-2 ${smallTextClass}`} style={{ ...boxBorder, borderStyle: 'dashed' }}>
              {(customerName || customerMobile) && (
                <div>{t('customer')} <strong>{customerName || '-'}</strong> {customerMobile && `(${customerMobile})`}</div>
              )}
              {customerAddress && <div className="mt-0.5">Address: {customerAddress}</div>}
              {customerGst && <div className="mt-0.5">GSTIN: {customerGst}</div>}
            </div>
          )}
        </div>

        {/* Items table — a real bordered table instead of dashed row separators.
            HSN + GST% columns are appended for a GST bill regardless of
            business type/category — matching A4Invoice, and giving every
            shop a properly-formatted tax invoice, not just liquor.

            table-layout: fixed is load-bearing here, not decorative: without
            it a row with many short columns (e.g. clothes' Color+Size on top
            of HSN+GST%) can demand more total width than the 58mm/80mm
            container has, and a plain auto-layout table just overflows its
            box instead of shrinking — the Item name column collides with
            its neighbours. Fixed layout forces every column to the width we
            hand it and wrap instead. HSN drops out at 58mm specifically —
            least useful column on a slip this narrow, and freeing its share
            keeps the others (esp. Item name) legible. */}
        <table className="w-full border-collapse" style={{ ...rule, tableLayout: 'fixed' }}>
          <thead>
            <tr className={`${tableHeadClass} uppercase`} style={{ backgroundColor: '#eee', borderBottom: '1.5px solid #000' }}>
              {columns.map(col => (
                <th key={col.id} className={`py-1.5 ${cellPad} text-${col.align} font-bold`} style={{ width: col.id === 'item' ? undefined : (THERMAL_COL_WIDTH[col.id] || '14%'), whiteSpace: 'nowrap' }}>{t(col.labelKey) || col.labelKey}</th>
              ))}
              {isGstBill && !is58mm && <th className={`py-1.5 ${cellPad} text-left font-bold`} style={{ width: THERMAL_COL_WIDTH.hsn, whiteSpace: 'nowrap' }}>{t('hsn') || 'HSN'}</th>}
              {isGstBill && <th className={`py-1.5 ${cellPad} text-right font-bold`} style={{ width: THERMAL_COL_WIDTH.gstPercent, whiteSpace: 'nowrap' }}>GST%</th>}
            </tr>
          </thead>
          <tbody>
            {goodsItems.map((item, idx) => (
              <tr key={idx} className="align-top" style={idx < goodsItems.length - 1 ? { borderBottom: '1px solid #ddd' } : undefined}>
                {columns.map(col => (
                  <td key={col.id} className={`py-1 ${cellPad} text-${col.align} ${textClass} ${col.id === 'item' ? 'pr-2' : ''}`} style={col.id === 'item' ? { whiteSpace: 'normal', overflowWrap: 'break-word' } : { whiteSpace: 'nowrap' }}>
                    {col.render(item)}
                  </td>
                ))}
                {isGstBill && !is58mm && <td className={`py-1 ${cellPad} text-left ${textClass}`} style={{ whiteSpace: 'nowrap' }}>{(item as any).hsnCode || '-'}</td>}
                {isGstBill && <td className={`py-1 ${cellPad} text-right ${textClass}`} style={{ whiteSpace: 'nowrap' }}>{Number((item as any).gstPercent) || 0}%</td>}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="px-2">
          {/* Totals */}
          <div className="space-y-0.5 pt-2">
            <div className={`flex justify-between ${smallTextClass}`}>
              <span>{t('subtotal')}</span>
              <span>₹{subtotal.toLocaleString('en-IN')}</span>
            </div>
            {discount > 0 && (
              <div className={`flex justify-between ${smallTextClass}`}>
                <span>{t('discount')}</span>
                <span>- ₹{discount.toLocaleString('en-IN')}</span>
              </div>
            )}
            {chargeItems.map((item, idx) => (
              <div key={idx} className={`flex justify-between ${smallTextClass}`}>
                <span>{item.name}</span>
                <span>₹{item.total.toLocaleString('en-IN')}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between font-black text-[15px] mt-1 py-1.5 px-2 -mx-2" style={{ ...rule, borderBottom: '1px solid #000', backgroundColor: '#f5f5f5' }}>
            <span>{t('total')}</span>
            <span>₹{total.toLocaleString('en-IN')}</span>
          </div>

          {/* GST tax summary (rate-wise). Prices are GST-inclusive, so this is the
              tax embedded in the total above — the total does not change.
              Shown whenever this is a GST bill, even if every line happens to
              be 0%/exempt — a "GST Invoice" should always carry the proper tax
              invoice structure (GSTIN + rate-wise breakdown), not silently
              look identical to a Non-GST invoice just because a shop hasn't
              set per-product GST rates yet. */}
          {isGstBill && gstBreakdown && (
            <div className="mt-2 pt-2 pb-1" style={rule}>
              <div className={`${smallTextClass} font-bold text-center mb-1 uppercase tracking-wide`}>{t('gstSummary') || 'GST Tax Summary'}</div>
              <table className="w-full border-collapse">
                <thead>
                  <tr className={smallTextClass} style={{ borderBottom: '1px solid #000' }}>
                    <th className="text-left py-0.5">{t('rate') || 'Rate'}</th>
                    <th className="text-right py-0.5">{t('taxable') || 'Taxable'}</th>
                    {gstBreakdown.interState
                      ? <th className="text-right py-0.5">IGST</th>
                      : <><th className="text-right py-0.5">CGST</th><th className="text-right py-0.5">SGST</th></>}
                  </tr>
                </thead>
                <tbody>
                  {gstBreakdown.groups.map(g => (
                    <tr key={g.rate} className={smallTextClass}>
                      <td className="text-left py-0.5">{g.rate}%</td>
                      <td className="text-right py-0.5">₹{g.taxable.toLocaleString('en-IN')}</td>
                      {gstBreakdown.interState
                        ? <td className="text-right py-0.5">₹{g.igst.toLocaleString('en-IN')}</td>
                        : <><td className="text-right py-0.5">₹{g.cgst.toLocaleString('en-IN')}</td><td className="text-right py-0.5">₹{g.sgst.toLocaleString('en-IN')}</td></>}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className={`flex justify-between font-bold mt-1 ${smallTextClass}`} style={{ borderTop: '1px solid #000', paddingTop: '2px' }}>
                <span>{t('totalGst') || 'Total GST'}</span>
                <span>₹{gstBreakdown.totalGst.toLocaleString('en-IN')}</span>
              </div>
            </div>
          )}

          {/* Payment Summary */}
          {isEmi && emiMonths && emiMonthlyAmount !== undefined ? (
            <div className="mt-2 pt-2 pb-2 space-y-0.5" style={rule}>
              <div className={`${smallTextClass} font-bold text-center mb-1 uppercase tracking-wide`}>{t('emiDetails')}</div>
              <div className={`flex justify-between ${smallTextClass}`}>
                <span>{t('downPayment')}</span>
                <span className="font-bold">₹{(emiDownPayment ?? 0).toLocaleString('en-IN')}</span>
              </div>
              <div className={`flex justify-between ${smallTextClass}`}>
                <span>{t('monthlyEmi')} &times; {emiMonths}:</span>
                <span className="font-bold">₹{emiMonthlyAmount.toLocaleString('en-IN')}{t('mo')}</span>
              </div>
              {emiInterestRate !== undefined && (
                <div className={`flex justify-between ${smallTextClass}`}>
                  <span>{t('interestRate')}</span>
                  <span>{emiInterestRate === 0 ? t('noCostEmi') : `${emiInterestRate}% ${t('pa')}`}</span>
                </div>
              )}
              <div className={`flex justify-between ${smallTextClass} font-bold`} style={{ borderTop: '1px solid #000', paddingTop: '2px' }}>
                <span>{t('totalPayable')}</span>
                <span>₹{(emiTotalAmount ?? 0).toLocaleString('en-IN')}</span>
              </div>
            </div>
          ) : (() => {
            // Compute payment status
            const udharAmount = splitPayments?.udhar ?? remainingAmount;
            const cashAmt = splitPayments?.cash ?? 0;
            const upiAmt = splitPayments?.upi ?? 0;
            const cardAmt = splitPayments?.card ?? 0;
            const isSplitMode = paymentMethod === 'Split';
            const paymentStatus = remainingAmount <= 0
              ? t('paid')
              : paid > 0
                ? t('partiallyPaid')
                : t('creditUdhar');

            return (
              <div className="mt-2 pt-2 pb-2 space-y-0.5" style={rule}>
                <div className={`${smallTextClass} font-bold mb-1 uppercase tracking-wide`}>{t('paymentMode')}</div>

                {isSplitMode ? (
                  <>
                    {cashAmt > 0 && (
                      <div className={`flex justify-between ${smallTextClass}`}>
                        <span>{t('cash')}</span><span>₹{cashAmt.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                    {upiAmt > 0 && (
                      <div className={`flex justify-between ${smallTextClass}`}>
                        <span>{t('upi')}</span><span>₹{upiAmt.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                    {cardAmt > 0 && (
                      <div className={`flex justify-between ${smallTextClass}`}>
                        <span>{t('card')}</span><span>₹{cardAmt.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                    {udharAmount > 0 && (
                      <div className={`flex justify-between ${smallTextClass}`}>
                        <span>{t('udhar')}</span><span>₹{udharAmount.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className={`flex justify-between ${smallTextClass}`}>
                    <span>{paymentMethod === 'Cash' ? t('cash') : paymentMethod === 'UPI' ? t('upi') : paymentMethod === 'Card' ? t('card') : paymentMethod === 'Udhar' ? t('udhar') : paymentMethod}</span>
                    <span>₹{paymentMethod === 'Udhar' ? '0' : paid.toLocaleString('en-IN')}</span>
                  </div>
                )}

                {/* Divider */}
                <div style={{ borderTop: '1px dashed #000', paddingTop: '2px' }} className="mt-1">
                  <div className={`flex justify-between ${smallTextClass} font-bold`}>
                    <span>{t('collected')}</span>
                    <span>₹{paid.toLocaleString('en-IN')}</span>
                  </div>
                  <div className={`flex justify-between ${smallTextClass} font-bold`}>
                    <span>{t('remainingDue')}</span>
                    <span>₹{(remainingAmount > 0 ? remainingAmount : 0).toLocaleString('en-IN')}</span>
                  </div>
                  {paid > total && (
                    <div className={`flex justify-between ${smallTextClass}`}>
                      <span>{t('changeReturn')}</span>
                      <span>₹{(paid - total).toLocaleString('en-IN')}</span>
                    </div>
                  )}
                </div>

                {/* Status */}
                <div className={`${smallTextClass} font-bold mt-1.5 py-1 px-2 -mx-2 text-center`} style={{ backgroundColor: '#f5f5f5', borderTop: '1px solid #000', borderBottom: '1px solid #000' }}>
                  <span>{t('paymentStatus')} </span><strong className="uppercase">{paymentStatus}</strong>
                </div>

                {remainingAmount > 0 && customerName && (
                  <div className="text-[8px] text-center mt-1 italic">
                    {t('savedToUdharKhata')}
                  </div>
                )}
              </div>
            );
          })()}

          {/* UPI "Scan & Pay" QR — driven purely by whether the shop has set a
              UPI ID in Profile, not by showQrCode (that flag has no UI to set
              it, so gating on it too would leave this permanently hidden). */}
          {upiId && (
            <div className="pt-3 pb-2 flex flex-col items-center" style={rule}>
              {qrSvg ? (
                <div className="w-20 h-20 [&>svg]:w-full [&>svg]:h-full [&>svg]:block" dangerouslySetInnerHTML={{ __html: qrSvg }} />
              ) : qrDataUrl ? (
                <img src={qrDataUrl} alt="UPI QR" className="w-20 h-20" />
              ) : (
                <div className="w-16 h-16 border border-black flex items-center justify-center text-[8px] bg-slate-50">…</div>
              )}
              <p className={`${smallTextClass} font-black mt-1 uppercase tracking-wide`}>Scan to Pay</p>
              <p className="text-[8px]">{upiId}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-1 pt-3 pb-3 px-2 text-center" style={rule}>
          {ownerSignature && (
            <div className="mb-2">
              <img src={ownerSignature} alt="Signature" className="mx-auto" style={{ maxHeight: '30px' }} />
            </div>
          )}
          <p className={`font-black ${textClass} mb-1 uppercase tracking-wide`}>{t('thankYou')}</p>
          {invoiceFooter && <p className="text-[9px] mb-1 whitespace-pre-wrap">{invoiceFooter}</p>}
          <p className="text-[8px] text-gray-500 mt-1">Powered by Vyapar Sarthi</p>
        </div>
      </div>
    </div>
  );
});

ThermalInvoice.displayName = 'ThermalInvoice';
