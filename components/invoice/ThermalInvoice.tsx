'use client';

import { variantLabel } from '@/lib/variants';
import React from 'react';
import { CartItem } from '@/lib/store';
import { useTranslations } from 'next-intl';
import { getInvoiceColumns, isChargeLineItem, inr } from '@/lib/invoice-helpers';
import { BusinessType } from '@/lib/businessConfig';
import { Barcode } from './Barcode';
import type { GstBreakdown } from '@/lib/gst';
import type { DualUnitConfig } from '@/lib/categoryConfig';
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
  hsn: '13%',
  gstPercent: '8%',
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
  // Visual design (A4 only — thermal is too narrow for the modern/stylish
  // layouts, so ThermalInvoice ignores this) + accent color for the theme's
  // header/borders/highlights. '' / null / undefined color means no accent —
  // the original plain black-on-white look.
  invoiceTheme?: 'standard' | 'modern' | 'stylish' | 'advanced_gst' | 'minimal';
  invoiceColor?: string | null;
  invoiceFooter?: string | null;
  showQrCode?: boolean;
  // GST invoice: billType 'gst' shows tax breakdown + HSN; gstBreakdown carries the numbers.
  billType?: 'gst' | 'non_gst' | string;
  gstBreakdown?: GstBreakdown;
  billImageUrl?: string;
  // Category attribute keys whose values are printed under the item name
  // (driven by CategoryConfig.attributeSchema.billingDisplayFields).
  billingDisplayFields?: string[];
  dualUnitConfig?: DualUnitConfig;
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
  billingDisplayFields,
  dualUnitConfig,
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
  const textClass = is58mm ? 'text-[10px]' : 'text-[11px]';
  const smallTextClass = is58mm ? 'text-[8px]' : 'text-[10px]';
  const headerTextClass = is58mm ? 'text-[14px]' : 'text-[17px]';
  // The items-table column HEADERS run a notch smaller than the row text so
  // long single-word labels (WARRANTY, SERIAL, COLOR) fit their narrow fixed
  // columns on ONE line — the alternative, letting them wrap, breaks the word
  // itself (WARR/ANTY) which reads as broken. Cells and headers use nowrap so
  // currency values never split mid-number (₹5,2/00) either; only the Item
  // name column is allowed to wrap, onto clean extra lines.
  const tableHeadClass = is58mm ? 'text-[8px]' : 'text-[9px]';
  const cellPad = is58mm ? 'px-0.5' : 'px-1';
  
  // A thin horizontal rule used between sections — a shared visual weight instead
  // of the previous mix of dashed/dotted/solid borders scattered across the file.
  const rule = { borderTop: '1px solid #000' };
  const boxBorder = { border: '1px solid #000' };

  return (
    <div
      ref={ref}
      data-print-format={is58mm ? 'thermal58' : 'thermal80'}
      style={{ backgroundColor: '#ffffff', color: '#000000', fontFamily: 'Calibri, sans-serif' }}
      className={`p-3 w-full mx-auto ${widthClass} ${textClass} leading-snug`}
    >
      <div style={boxBorder}>
        {/* Header */}
        <div className="text-center px-2 pt-3 pb-2" style={{ borderBottom: '2px solid #000' }}>
          {/* No logo on thermal receipts: a thermal head prints a photo/logo as a solid black box and wastes paper. */}
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
          className={`thermal-invert text-center font-black uppercase tracking-wider ${textClass}`}
          style={{ backgroundColor: '#000', color: '#fff', padding: '4px 0' }}
        >
          {isGstBill ? (t('gstInvoice') || 'GST Invoice') : (t('invoiceLabel') || 'Invoice')}
        </div>

        {/* Bill meta & Barcode */}
        <div className="px-2 pt-2">
          <div className={`flex justify-between items-baseline gap-2 ${smallTextClass} font-bold`}>
            <span style={{ whiteSpace: 'nowrap' }}>{t('bill')} {billNumber}</span>
            <span style={{ whiteSpace: 'nowrap' }}>{date}</span>
          </div>
          {/* Barcode on its own full-width line, as large as the roll allows, with the number printed big underneath.
              It encodes the bill number WITHOUT the fixed "INV-" prefix (fewer bars = wider bars = reliable scan);
              bill lookup accepts both "D2431C95" and "INV-D2431C95". */}
          <div className="flex justify-center mt-1" style={{ background: '#fff' }}>
            <Barcode value={billNumber.replace(/^INV[-_]?/i, '') || billNumber} width={is58mm ? 1.25 : 2.2} height={is58mm ? 56 : 70} margin={4} displayValue printCrisp />
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
        {/* Stacked item rows instead of a column table. A real thermal roll is 58 mm / 72 mm printable (and printers
            differ), so a table of 7-8 fixed columns (Item, Serial, Warranty, Qty, Rate, Amt, HSN, GST%) overlapped its own
            headers and squeezed the item name into one letter per line. Name on its own full-width line, then
            "Qty x Rate ........ Amount", then a small grey line for the extras — readable at ANY width, and the same on
            screen, in the PDF and on paper. */}
        <div style={rule}>
          <div className={`flex justify-between gap-2 ${tableHeadClass} uppercase font-bold px-1 py-1.5`} style={{ backgroundColor: '#eee', borderBottom: '1.5px solid #000' }}>
            <span>{t('item')}</span>
            <span>{t('qty')} × {t('rate')}</span>
            <span>{t('amt')}</span>
          </div>
          {goodsItems.map((item, idx) => {
            const attrs = billingDisplayFields?.length
              ? (item as any).categoryAttributes as Record<string, string> | undefined
              : undefined;
            const attrParts = attrs ? billingDisplayFields!.map(k => attrs[k]).filter(Boolean) : [];
            const color = (item as any).color || '';
            const size = (item as any).size || '';
            const variant = item.variant || '';
            const variantLine = (color || size) ? [color, size].filter(Boolean).join(' / ') : (variant ? variantLabel(variant) : '');
            const byId = (id: string) => columns.find(col => col.id === id)?.render(item);
            // Everything that is not name / qty / rate / amount goes into one small extras line (serial, warranty,
            // batch, expiry, HSN, GST %). Colour/size are already shown under the name.
            const extras = columns
              .filter(col => !['item', 'qty', 'rate', 'amt', 'color', 'size'].includes(col.id))
              .map(col => ({ label: t(col.labelKey) || col.labelKey, value: String(col.render(item) ?? '') }))
              .filter(x => x.value && x.value !== '-');
            if (isGstBill) {
              if (!is58mm && (item as any).hsnCode) extras.push({ label: t('hsn') || 'HSN', value: String((item as any).hsnCode) });
              extras.push({ label: 'GST', value: `${Number((item as any).gstPercent) || 0}%` });
            }
            return (
              <div key={idx} className="px-1 py-1" style={idx < goodsItems.length - 1 ? { borderBottom: '1px dashed #000' } : undefined}>
                <div className={`${textClass} font-semibold`} style={{ overflowWrap: 'anywhere' }}>{byId('item')}</div>
                {variantLine && <div style={{ fontSize: '80%', color: '#222' }}>{variantLine}</div>}
                {attrParts.length > 0 && <div style={{ fontSize: '80%', color: '#222' }}>{attrParts.join(' · ')}</div>}
                <div className={`flex justify-between items-baseline gap-2 ${textClass}`}>
                  <span style={{ whiteSpace: 'nowrap' }}>{byId('qty')} × {byId('rate')}</span>
                  <span className="font-bold" style={{ whiteSpace: 'nowrap' }}>{byId('amt')}</span>
                </div>
                {dualUnitConfig && (
                  <div style={{ fontSize: '75%', color: '#000' }}>
                    ={(item.quantity * dualUnitConfig.conversionFactor).toLocaleString('en-IN')} {dualUnitConfig.secondaryUnit}
                  </div>
                )}
                {extras.length > 0 && (
                  <div style={{ fontSize: '80%', color: '#222', overflowWrap: 'anywhere' }}>
                    {extras.map(x => `${x.label}: ${x.value}`).join(' · ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-2">
          {/* Totals */}
          <div className="space-y-0.5 pt-2">
            <div className={`flex justify-between ${smallTextClass}`}>
              <span>{t('subtotal')}</span>
              <span>₹{inr(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className={`flex justify-between ${smallTextClass}`}>
                <span>{t('discount')}</span>
                <span>- ₹{inr(discount)}</span>
              </div>
            )}
            {chargeItems.map((item, idx) => (
              <div key={idx} className={`flex justify-between ${smallTextClass}`}>
                <span>{item.name}</span>
                <span>₹{inr(item.total)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between font-black text-[15px] mt-1 py-1.5 px-2 -mx-2" style={{ ...rule, borderBottom: '1px solid #000', backgroundColor: '#f5f5f5' }}>
            <span>{t('total')}</span>
            <span>₹{inr(total)}</span>
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
                      <td className="text-right py-0.5">₹{inr(g.taxable)}</td>
                      {gstBreakdown.interState
                        ? <td className="text-right py-0.5">₹{inr(g.igst)}</td>
                        : <><td className="text-right py-0.5">₹{inr(g.cgst)}</td><td className="text-right py-0.5">₹{inr(g.sgst)}</td></>}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className={`flex justify-between font-bold mt-1 ${smallTextClass}`} style={{ borderTop: '1px solid #000', paddingTop: '2px' }}>
                <span>{t('totalGst') || 'Total GST'}</span>
                <span>₹{inr(gstBreakdown.totalGst)}</span>
              </div>
            </div>
          )}

          {/* Payment Summary */}
          {isEmi && emiMonths && emiMonthlyAmount !== undefined ? (
            <div className="mt-2 pt-2 pb-2 space-y-0.5" style={rule}>
              <div className={`${smallTextClass} font-bold text-center mb-1 uppercase tracking-wide`}>{t('emiDetails')}</div>
              <div className={`flex justify-between ${smallTextClass}`}>
                <span>{t('downPayment')}</span>
                <span className="font-bold">₹{inr((emiDownPayment ?? 0))}</span>
              </div>
              <div className={`flex justify-between ${smallTextClass}`}>
                <span>{t('monthlyEmi')} &times; {emiMonths}:</span>
                <span className="font-bold">₹{inr(emiMonthlyAmount)}{t('mo')}</span>
              </div>
              {emiInterestRate !== undefined && (
                <div className={`flex justify-between ${smallTextClass}`}>
                  <span>{t('interestRate')}</span>
                  <span>{emiInterestRate === 0 ? t('noCostEmi') : `${emiInterestRate}% ${t('pa')}`}</span>
                </div>
              )}
              <div className={`flex justify-between ${smallTextClass} font-bold`} style={{ borderTop: '1px solid #000', paddingTop: '2px' }}>
                <span>{t('totalPayable')}</span>
                <span>₹{inr((emiTotalAmount ?? 0))}</span>
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
                        <span>{t('cash')}</span><span>₹{inr(cashAmt)}</span>
                      </div>
                    )}
                    {upiAmt > 0 && (
                      <div className={`flex justify-between ${smallTextClass}`}>
                        <span>{t('upi')}</span><span>₹{inr(upiAmt)}</span>
                      </div>
                    )}
                    {cardAmt > 0 && (
                      <div className={`flex justify-between ${smallTextClass}`}>
                        <span>{t('card')}</span><span>₹{inr(cardAmt)}</span>
                      </div>
                    )}
                    {udharAmount > 0 && (
                      <div className={`flex justify-between ${smallTextClass}`}>
                        <span>{t('udhar')}</span><span>₹{inr(udharAmount)}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className={`flex justify-between ${smallTextClass}`}>
                    <span>{paymentMethod === 'Cash' ? t('cash') : paymentMethod === 'UPI' ? t('upi') : paymentMethod === 'Card' ? t('card') : paymentMethod === 'Udhar' ? t('udhar') : paymentMethod}</span>
                    <span>₹{paymentMethod === 'Udhar' ? '0' : inr(paid)}</span>
                  </div>
                )}

                {/* Divider */}
                <div style={{ borderTop: '1px dashed #000', paddingTop: '2px' }} className="mt-1">
                  <div className={`flex justify-between ${smallTextClass} font-bold`}>
                    <span>{t('collected')}</span>
                    <span>₹{inr(paid)}</span>
                  </div>
                  <div className={`flex justify-between ${smallTextClass} font-bold`}>
                    <span>{t('remainingDue')}</span>
                    <span>₹{inr((remainingAmount > 0 ? remainingAmount : 0))}</span>
                  </div>
                  {paid > total && (
                    <div className={`flex justify-between ${smallTextClass}`}>
                      <span>{t('changeReturn')}</span>
                      <span>₹{inr((paid - total))}</span>
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
              <img src={ownerSignature} alt="Signature" crossOrigin="anonymous" className="mx-auto" style={{ maxHeight: '30px' }} />
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
