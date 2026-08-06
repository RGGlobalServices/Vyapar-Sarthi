'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { getInvoiceColumns, isChargeLineItem } from '@/lib/invoice-helpers';
import { BaseInvoiceProps } from './ThermalInvoice';
import { Barcode } from './Barcode';
import { useUpiQrCode } from './useUpiQrCode';
import { amountInWords } from '@/lib/numberToWords';

export const A4Invoice = React.forwardRef<HTMLDivElement, BaseInvoiceProps>(({
  items,
  total,
  discount = 0,
  amountPaid,
  remainingAmount = 0,
  customerName,
  customerMobile,
  customerAddress,
  customerGst,
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
  invoiceFooter,
  billType,
  gstBreakdown,
  upiId,
  qrSvg,
  qrDataUrl: qrDataUrlProp,
  bankName,
  bankAccountName,
  bankAccountNumber,
  bankIfsc,
}, ref) => {
  const t = useTranslations('BillSlip');
  const isGstBill = billType === 'gst';
  const columns = getInvoiceColumns(businessType);

  // Transport/Loading/Packing/Other charges ride in the same items array (so
  // they persist with the sale for reprints) but aren't goods — pulling them
  // out of the product grid and listing them as their own total line is what
  // makes Subtotal + Charges + Tax actually add up to the Total on screen,
  // instead of a "0% GST" charge row sitting in the middle of a tax table.
  const goodsItems = items.filter((item) => !isChargeLineItem(item.name));
  const chargeItems = items.filter((item) => isChargeLineItem(item.name));
  const goodsSubtotal = goodsItems.reduce((acc, item) => acc + item.total, 0);
  const chargesTotal = chargeItems.reduce((acc, item) => acc + item.total, 0);
  const paid = amountPaid ?? total;

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
    size: 180,
  });
  const qrDataUrl = qrDataUrlProp !== undefined ? qrDataUrlProp : liveQrDataUrl;

  const hasBankDetails = !!(bankName || bankAccountNumber || bankAccountName || bankIfsc);

  return (
    <div
      ref={ref}
      style={{ backgroundColor: '#ffffff', color: '#0f172a', fontFamily: 'Calibri, sans-serif' }}
      className="w-full max-w-[800px] mx-auto text-sm leading-snug min-h-[1056px] flex flex-col border-2 border-slate-900"
    >
      <div className="p-8 flex flex-col flex-1">
        {/* Letterhead */}
        <div className="flex justify-between items-start gap-6 pb-5 mb-6 border-b-2 border-slate-900">
          <div className="flex gap-4">
            {logoUrl && <img src={logoUrl} alt="Logo" className="max-h-20 object-contain" />}
            <div>
              <h1 className="text-3xl font-black uppercase tracking-tight">{storeName || t('storeNameFallback')}</h1>
              <div className="text-slate-600 mt-1.5 space-y-0.5 text-xs">
                {storeAddress && <p>{storeAddress}</p>}
                <p>
                  {storeMobile && <span>{t('mob')} {storeMobile}</span>}
                  {gst && <span className="ml-3 font-bold text-slate-800">{t('gstin')}: {gst}</span>}
                  {pan && <span className="ml-3 font-bold text-slate-800">{t('pan')}: {pan}</span>}
                </p>
              </div>
            </div>
          </div>

          <div className="text-right shrink-0">
            <h2 className="text-2xl font-black uppercase tracking-wide border-2 border-slate-900 px-3 py-1 inline-block mb-2">
              {isGstBill ? (t('gstInvoice') || 'Tax Invoice') : (t('invoiceLabel') || 'Invoice')}
            </h2>
            <div className="flex flex-col items-end gap-1 text-xs">
              <Barcode value={billNumber} height={26} displayValue={false} />
              <p><span className="text-slate-500 mr-2">{t('bill')}:</span><strong className="text-sm">{billNumber}</strong></p>
              <p><span className="text-slate-500 mr-2">Date:</span><strong>{date}</strong></p>
            </div>
          </div>
        </div>

        {/* Bill To / Payment meta */}
        <div className="grid grid-cols-2 border border-slate-900 mb-6">
          <div className="p-3 border-r border-slate-900">
            <h3 className="text-[10px] font-bold uppercase text-slate-500 tracking-wider mb-1.5">Bill To</h3>
            <p className="font-bold text-base">{customerName || 'Cash Customer'}</p>
            {customerMobile && <p className="text-slate-600 mt-0.5 text-xs">{customerMobile}</p>}
            {customerAddress && <p className="text-slate-600 mt-0.5 text-xs">{customerAddress}</p>}
            {customerGst && <p className="text-slate-800 mt-1 text-xs font-bold">GSTIN: {customerGst}</p>}
          </div>
          <div className="p-3">
            <h3 className="text-[10px] font-bold uppercase text-slate-500 tracking-wider mb-1.5">Payment Details</h3>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">Mode</span>
              <strong>
                {isEmi ? t('emi')
                  : paymentMethod === 'Cash' ? t('cash')
                  : paymentMethod === 'UPI' ? t('upi')
                  : paymentMethod === 'Card' ? t('card')
                  : paymentMethod === 'Udhar' ? t('udhar')
                  : paymentMethod === 'Split' ? 'Split'
                  : paymentMethod}
              </strong>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Status</span>
              <strong className={remainingAmount > 0 ? (paid > 0 ? 'text-amber-600' : 'text-orange-600') : 'text-emerald-700'}>
                {remainingAmount <= 0 ? t('paid') : paid > 0 ? t('partiallyPaid') : t('creditUdhar')}
              </strong>
            </div>
          </div>
        </div>

        {/* Items table */}
        <div className="flex-1">
          <table className="w-full border border-slate-900 mb-6">
            <thead>
              <tr className="bg-slate-900 text-white text-[11px] uppercase tracking-wide">
                <th className="py-2 px-3 text-left font-bold w-8">#</th>
                {columns.map((col) => (
                  <th key={col.id} className={`py-2 px-3 text-${col.align} font-bold`}>{t(col.labelKey) || col.labelKey}</th>
                ))}
                {isGstBill && <th className="py-2 px-3 text-left font-bold">{t('hsn') || 'HSN'}</th>}
                {isGstBill && <th className="py-2 px-3 text-right font-bold">GST%</th>}
              </tr>
            </thead>
            <tbody>
              {goodsItems.map((item, idx) => (
                <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50' : undefined} style={{ borderTop: '1px solid #cbd5e1' }}>
                  <td className="py-2 px-3 text-slate-500">{idx + 1}</td>
                  {columns.map((col) => (
                    <td key={col.id} className={`py-2 px-3 text-${col.align}`}>{col.render(item)}</td>
                  ))}
                  {isGstBill && <td className="py-2 px-3 text-left">{(item as any).hsnCode || '-'}</td>}
                  {isGstBill && <td className="py-2 px-3 text-right">{Number((item as any).gstPercent) || 0}%</td>}
                </tr>
              ))}
            </tbody>
          </table>

          {/* GST Tax Summary — standalone rate-wise breakdown, separate from
              the totals box below (goods only; charges are additive, see the
              Additional Charges line in the totals box). */}
          {isGstBill && gstBreakdown && gstBreakdown.groups.length > 0 && (
            <table className="w-full border border-slate-900 mb-6">
              <caption className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wide px-3 py-2 text-left caption-top">
                {t('gstSummary') || 'GST Tax Summary'}
              </caption>
              <thead>
                <tr className="bg-slate-100 text-[11px] uppercase text-slate-600">
                  <th className="py-2 px-3 text-left font-bold border-t border-slate-300">Rate</th>
                  <th className="py-2 px-3 text-right font-bold border-t border-slate-300">Taxable Value</th>
                  {gstBreakdown.interState ? (
                    <th className="py-2 px-3 text-right font-bold border-t border-slate-300">IGST</th>
                  ) : (
                    <>
                      <th className="py-2 px-3 text-right font-bold border-t border-slate-300">CGST</th>
                      <th className="py-2 px-3 text-right font-bold border-t border-slate-300">SGST</th>
                    </>
                  )}
                  <th className="py-2 px-3 text-right font-bold border-t border-slate-300">Total Tax</th>
                </tr>
              </thead>
              <tbody>
                {gstBreakdown.groups.map((g) => (
                  <tr key={g.rate} className="border-t border-slate-200">
                    <td className="py-1.5 px-3 text-left">{g.rate}%</td>
                    <td className="py-1.5 px-3 text-right">₹{g.taxable.toLocaleString('en-IN')}</td>
                    {gstBreakdown.interState ? (
                      <td className="py-1.5 px-3 text-right">₹{g.igst.toLocaleString('en-IN')}</td>
                    ) : (
                      <>
                        <td className="py-1.5 px-3 text-right">₹{g.cgst.toLocaleString('en-IN')}</td>
                        <td className="py-1.5 px-3 text-right">₹{g.sgst.toLocaleString('en-IN')}</td>
                      </>
                    )}
                    <td className="py-1.5 px-3 text-right font-semibold">₹{(g.cgst + g.sgst + g.igst).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-bold border-t-2 border-slate-900">
                  <td className="py-1.5 px-3 text-left">Total</td>
                  <td className="py-1.5 px-3 text-right">₹{gstBreakdown.taxable.toLocaleString('en-IN')}</td>
                  {gstBreakdown.interState ? (
                    <td className="py-1.5 px-3 text-right">₹{gstBreakdown.igst.toLocaleString('en-IN')}</td>
                  ) : (
                    <>
                      <td className="py-1.5 px-3 text-right">₹{gstBreakdown.cgst.toLocaleString('en-IN')}</td>
                      <td className="py-1.5 px-3 text-right">₹{gstBreakdown.sgst.toLocaleString('en-IN')}</td>
                    </>
                  )}
                  <td className="py-1.5 px-3 text-right">₹{gstBreakdown.totalGst.toLocaleString('en-IN')}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Bottom split: QR/Bank/Terms (left) vs Totals (right) */}
        <div className="flex justify-between items-start gap-8 mt-auto pt-2">
          <div className="w-1/2">
            {upiId && (
              <div className="mb-4 flex items-center gap-4">
                {qrSvg ? (
                  <div className="w-24 h-24 border border-slate-900 p-1 shrink-0 [&>svg]:w-full [&>svg]:h-full [&>svg]:block" dangerouslySetInnerHTML={{ __html: qrSvg }} />
                ) : qrDataUrl ? (
                  <img src={qrDataUrl} alt="UPI QR" className="w-24 h-24 border border-slate-900 p-1 shrink-0" />
                ) : (
                  <div className="w-24 h-24 border border-slate-900 flex items-center justify-center shrink-0">
                    <span className="text-[10px] text-slate-400">QR Code</span>
                  </div>
                )}
                <div className="text-xs">
                  <p className="font-bold">Scan to Pay via UPI</p>
                  <p className="font-mono mt-0.5 text-slate-600">{upiId}</p>
                </div>
              </div>
            )}

            {hasBankDetails && (
              <div className="mb-4 border border-slate-900 p-3 text-xs">
                <p className="font-bold uppercase tracking-wide mb-1.5">Bank Details</p>
                <div className="space-y-0.5">
                  {bankAccountName && <div className="flex justify-between gap-4"><span className="text-slate-500">Account Holder</span><span className="font-semibold text-right">{bankAccountName}</span></div>}
                  {bankName && <div className="flex justify-between gap-4"><span className="text-slate-500">Bank</span><span className="font-semibold text-right">{bankName}</span></div>}
                  {bankAccountNumber && <div className="flex justify-between gap-4"><span className="text-slate-500">Account No.</span><span className="font-semibold text-right">{bankAccountNumber}</span></div>}
                  {bankIfsc && <div className="flex justify-between gap-4"><span className="text-slate-500">IFSC</span><span className="font-semibold text-right">{bankIfsc}</span></div>}
                </div>
              </div>
            )}

            <div className="text-xs text-slate-500">
              <h4 className="font-bold text-slate-700 mb-1">Terms & Conditions</h4>
              <p className="whitespace-pre-wrap leading-relaxed">{invoiceFooter || '1. Goods once sold will not be taken back.\n2. Warranty applicable as per manufacturer terms.'}</p>
            </div>
          </div>

          <div className="w-1/2 max-w-[340px]">
            <div className="border border-slate-900">
              <div className="p-4 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">{t('subtotal')}</span>
                  <span className="font-semibold">₹{goodsSubtotal.toLocaleString('en-IN')}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>{t('discount')}</span>
                    <span className="font-semibold">- ₹{discount.toLocaleString('en-IN')}</span>
                  </div>
                )}
                {chargeItems.map((item, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span className="text-slate-500">{item.name}</span>
                    <span className="font-semibold">₹{item.total.toLocaleString('en-IN')}</span>
                  </div>
                ))}
                {/* GST breakdown (prices are GST-inclusive, so this is embedded
                    in the total). Shown for every GST bill, even at 0% — a
                    proper tax invoice always carries this structure. */}
                {isGstBill && gstBreakdown && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-500">{t('taxableValue') || 'Taxable Value'}</span>
                      <span className="font-semibold">₹{gstBreakdown.taxable.toLocaleString('en-IN')}</span>
                    </div>
                    {gstBreakdown.interState ? (
                      <div className="flex justify-between">
                        <span className="text-slate-500">IGST</span>
                        <span className="font-semibold">₹{gstBreakdown.igst.toLocaleString('en-IN')}</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-500">CGST</span>
                          <span className="font-semibold">₹{gstBreakdown.cgst.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">SGST</span>
                          <span className="font-semibold">₹{gstBreakdown.sgst.toLocaleString('en-IN')}</span>
                        </div>
                      </>
                    )}
                  </>
                )}
                {chargeItems.length > 1 && (
                  <div className="flex justify-between font-semibold border-t border-slate-200 pt-1.5">
                    <span className="text-slate-500">Total Charges</span>
                    <span>₹{chargesTotal.toLocaleString('en-IN')}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center px-4 py-3 border-t-2 border-slate-900 bg-slate-50">
                <span className="text-base font-black uppercase">{t('total')}</span>
                <span className="text-xl font-black">₹{total.toLocaleString('en-IN')}</span>
              </div>

              <p className="text-[11px] text-slate-600 px-4 py-2 border-t border-slate-200 italic">
                <span className="font-semibold not-italic">Amount in Words: </span>
                {amountInWords(total)}
              </p>

              {/* Payment Summary */}
              <div className="px-4 py-3 border-t border-slate-200 text-xs">
                {isEmi && emiMonths && emiMonthlyAmount !== undefined ? (
                  <div className="space-y-1.5">
                    <div className="font-bold uppercase tracking-wide text-[10px] text-slate-500 mb-1">{t('emiDetails')}</div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">{t('downPayment')}</span>
                      <span className="font-semibold">₹{(emiDownPayment ?? 0).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">{emiMonths} &times; {t('monthlyEmi')}</span>
                      <span className="font-semibold">₹{emiMonthlyAmount.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                ) : (() => {
                  const udharAmount = splitPayments?.udhar ?? remainingAmount;
                  const cashAmt = splitPayments?.cash ?? 0;
                  const upiAmt = splitPayments?.upi ?? 0;
                  const cardAmt = splitPayments?.card ?? 0;
                  const isSplitMode = paymentMethod === 'Split';
                  const paymentStatus = remainingAmount <= 0 ? t('paid') : paid > 0 ? t('partiallyPaid') : t('creditUdhar');

                  return (
                    <div className="space-y-1.5">
                      <div className="font-bold uppercase tracking-wide text-[10px] text-slate-500 mb-1">{t('paymentMode')}</div>
                      {isSplitMode ? (
                        <>
                          {cashAmt > 0 && <div className="flex justify-between"><span className="text-slate-500">{t('cash')}</span><span className="font-semibold">₹{cashAmt.toLocaleString('en-IN')}</span></div>}
                          {upiAmt > 0 && <div className="flex justify-between"><span className="text-slate-500">{t('upi')}</span><span className="font-semibold">₹{upiAmt.toLocaleString('en-IN')}</span></div>}
                          {cardAmt > 0 && <div className="flex justify-between"><span className="text-slate-500">{t('card')}</span><span className="font-semibold">₹{cardAmt.toLocaleString('en-IN')}</span></div>}
                          {udharAmount > 0 && <div className="flex justify-between text-orange-600"><span>{t('udhar')}</span><span className="font-semibold">₹{udharAmount.toLocaleString('en-IN')}</span></div>}
                        </>
                      ) : (
                        <div className="flex justify-between">
                          <span className="text-slate-500">{paymentMethod === 'Cash' ? t('cash') : paymentMethod === 'UPI' ? t('upi') : paymentMethod === 'Card' ? t('card') : paymentMethod === 'Udhar' ? t('udhar') : paymentMethod}</span>
                          <span className="font-semibold">₹{paymentMethod === 'Udhar' ? '0' : paid.toLocaleString('en-IN')}</span>
                        </div>
                      )}
                      <div className="border-t border-slate-200 pt-1.5 space-y-1">
                        <div className="flex justify-between font-semibold">
                          <span>{t('collected')}</span>
                          <span>₹{paid.toLocaleString('en-IN')}</span>
                        </div>
                        <div className={`flex justify-between font-semibold ${remainingAmount > 0 ? 'text-orange-600' : ''}`}>
                          <span>{t('remainingDue')}</span>
                          <span>₹{(remainingAmount > 0 ? remainingAmount : 0).toLocaleString('en-IN')}</span>
                        </div>
                        {paid > total && (
                          <div className="flex justify-between text-blue-600">
                            <span>{t('changeReturn')}</span>
                            <span>₹{(paid - total).toLocaleString('en-IN')}</span>
                          </div>
                        )}
                      </div>
                      <div className={`flex items-center justify-between mt-2 px-2 py-1.5 border font-bold ${
                        remainingAmount <= 0 ? 'border-emerald-700 text-emerald-700' : paid > 0 ? 'border-amber-600 text-amber-600' : 'border-orange-600 text-orange-600'
                      }`}>
                        <span>{t('paymentStatus')}</span>
                        <span>{paymentStatus}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Signature */}
            <div className="mt-8 text-center">
              {ownerSignature ? (
                <img src={ownerSignature} alt="Signature" className="mx-auto max-h-14 mb-2" />
              ) : (
                <div className="h-14 mb-2" />
              )}
              <div className="w-44 mx-auto border-t border-slate-900 pt-1.5 text-xs">
                Authorized Signatory
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Brand Footer */}
      <div className="px-8 py-3 border-t-2 border-slate-900 text-center text-slate-400 text-[10px]">
        <p>Generated by <strong>Vyapar Sarthi</strong> — The Smart Retail Management System</p>
      </div>
    </div>
  );
});

A4Invoice.displayName = 'A4Invoice';
