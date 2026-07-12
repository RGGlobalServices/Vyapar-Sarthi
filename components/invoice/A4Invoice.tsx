'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { getInvoiceColumns } from '@/lib/invoice-helpers';
import { BaseInvoiceProps } from './ThermalInvoice';
import { Barcode } from './Barcode';

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
  showQrCode = false,
}, ref) => {
  const t = useTranslations('BillSlip');
  const subtotal = items.reduce((acc, item) => acc + item.total, 0);
  const paid = amountPaid ?? total;
  
  const columns = getInvoiceColumns(businessType);

  return (
    <div
      ref={ref}
      style={{ backgroundColor: '#ffffff', color: '#000000', fontFamily: 'sans-serif' }}
      className="p-8 w-full max-w-[800px] mx-auto text-sm leading-snug border border-slate-200 min-h-[1056px] flex flex-col"
    >
      {/* Header Row */}
      <div className="flex justify-between items-start mb-8 pb-6 border-b-2 border-slate-800">
        <div className="flex gap-4">
          {logoUrl && (
            <img src={logoUrl} alt="Logo" className="max-h-24 object-contain" />
          )}
          <div>
            <h1 className="text-3xl font-black uppercase text-slate-900 tracking-tight">{storeName || t('storeNameFallback')}</h1>
            <div className="text-slate-600 mt-2 space-y-1">
              {storeAddress && <p>{storeAddress}</p>}
              {storeMobile && <p>{t('mob')} {storeMobile}</p>}
              <div className="flex gap-4 mt-1 font-semibold">
                {gst && <p>{t('gstin')}: {gst}</p>}
                {pan && <p>{t('pan')}: {pan}</p>}
              </div>
            </div>
          </div>
        </div>
        
        <div className="text-right">
          <h2 className="text-4xl font-light text-slate-300 uppercase tracking-widest mb-2">Invoice</h2>
          <div className="space-y-1 text-slate-700 flex flex-col items-end">
            <div className="mb-2">
              <Barcode value={billNumber} height={30} displayValue={false} />
            </div>
            <p><span className="font-semibold text-slate-500 mr-2">{t('bill')}:</span> <strong className="text-lg">{billNumber}</strong></p>
            <p><span className="font-semibold text-slate-500 mr-2">Date:</span> <strong>{date}</strong></p>
          </div>
        </div>
      </div>

      {/* Bill To & Meta Row */}
      <div className="grid grid-cols-2 gap-8 mb-8">
        <div>
          <h3 className="text-xs font-bold uppercase text-slate-400 mb-2 tracking-wider">Bill To</h3>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
            <p className="font-bold text-lg text-slate-900">{customerName || 'Cash Customer'}</p>
            {customerMobile && <p className="text-slate-600 mt-1">{customerMobile}</p>}
            {customerAddress && <p className="text-slate-600 mt-1">{customerAddress}</p>}
            {customerGst && <p className="text-slate-600 mt-2 font-semibold">GSTIN: {customerGst}</p>}
          </div>
        </div>
        <div>
          <h3 className="text-xs font-bold uppercase text-slate-400 mb-2 tracking-wider">Payment Details</h3>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Mode</span>
              <strong className="text-slate-900">
                {isEmi ? t('emi')
                  : paymentMethod === 'Cash' ? t('cash')
                  : paymentMethod === 'UPI' ? t('upi')
                  : paymentMethod === 'Card' ? t('card')
                  : paymentMethod === 'Udhar' ? t('udhar')
                  : paymentMethod === 'Split' ? 'Split'
                  : paymentMethod}
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Status</span>
              <strong className={remainingAmount > 0 ? (paid > 0 ? "text-amber-600" : "text-orange-600") : "text-emerald-600"}>
                {remainingAmount <= 0 ? t('paid') : paid > 0 ? t('partiallyPaid') : t('creditUdhar')}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* Items table */}
      <div className="flex-1">
        <table className="w-full mb-8">
          <thead>
            <tr className="bg-slate-100 text-slate-700 uppercase text-xs tracking-wider">
              {columns.map(col => (
                <th key={col.id} className={`py-3 px-4 text-${col.align} font-bold`}>{t(col.labelKey) || col.labelKey}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 border-b border-slate-200">
            {items.map((item, idx) => (
              <tr key={idx} className="hover:bg-slate-50 transition-colors">
                {columns.map(col => (
                  <td key={col.id} className={`py-4 px-4 text-${col.align} text-slate-700`}>
                    {col.render(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals & Footer Area */}
      <div className="flex justify-between items-start mt-auto pt-8">
        {/* Left Side: Notes & QR */}
        <div className="w-1/2 pr-8">
          {showQrCode && (
            <div className="mb-6 flex items-start gap-4">
               <div className="w-24 h-24 border-2 border-slate-200 rounded-lg flex items-center justify-center bg-white">
                 <span className="text-xs text-slate-400">QR Code</span>
               </div>
               <div className="text-sm text-slate-500 pt-2">
                 <p className="font-semibold text-slate-700">Scan to verify invoice</p>
                 <p>Or pay via UPI apps</p>
               </div>
            </div>
          )}
          
          <div className="text-sm text-slate-500">
            <h4 className="font-bold text-slate-700 mb-2">Terms & Conditions</h4>
            <p className="whitespace-pre-wrap leading-relaxed">{invoiceFooter || '1. Goods once sold will not be taken back.\n2. Warranty applicable as per manufacturer terms.'}</p>
          </div>
        </div>

        {/* Right Side: Totals */}
        <div className="w-1/2 max-w-sm">
          <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
            <div className="space-y-3 text-slate-600 mb-4">
              <div className="flex justify-between">
                <span>{t('subtotal')}</span>
                <span className="font-semibold">₹{subtotal.toLocaleString('en-IN')}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>{t('discount')}</span>
                  <span className="font-semibold">- ₹{discount.toLocaleString('en-IN')}</span>
                </div>
              )}
            </div>
            
            <div className="flex justify-between items-center py-4 border-y border-slate-200 mb-4">
              <span className="text-lg font-bold text-slate-900">{t('total')}</span>
              <span className="text-2xl font-black text-slate-900">₹{total.toLocaleString('en-IN')}</span>
            </div>

            {/* Payment Summary */}
            {isEmi && emiMonths && emiMonthlyAmount !== undefined ? (
              <div className="space-y-2 text-sm">
                <div className="font-bold text-slate-900 mb-2">{t('emiDetails')}</div>
                <div className="flex justify-between text-slate-600">
                  <span>{t('downPayment')}</span>
                  <span className="font-semibold">₹{(emiDownPayment ?? 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>{emiMonths} &times; {t('monthlyEmi')}</span>
                  <span className="font-semibold">₹{emiMonthlyAmount.toLocaleString('en-IN')}</span>
                </div>
              </div>
            ) : (() => {
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
                <div className="space-y-2 text-sm">
                  <div className="font-bold text-slate-700 text-xs uppercase tracking-wider mb-2">{t('paymentMode')}</div>

                  {isSplitMode ? (
                    <>
                      {cashAmt > 0 && (
                        <div className="flex justify-between text-slate-600">
                          <span>{t('cash')}</span><span className="font-semibold">₹{cashAmt.toLocaleString('en-IN')}</span>
                        </div>
                      )}
                      {upiAmt > 0 && (
                        <div className="flex justify-between text-slate-600">
                          <span>{t('upi')}</span><span className="font-semibold">₹{upiAmt.toLocaleString('en-IN')}</span>
                        </div>
                      )}
                      {cardAmt > 0 && (
                        <div className="flex justify-between text-slate-600">
                          <span>{t('card')}</span><span className="font-semibold">₹{cardAmt.toLocaleString('en-IN')}</span>
                        </div>
                      )}
                      {udharAmount > 0 && (
                        <div className="flex justify-between text-orange-600">
                          <span>{t('udhar')}</span><span className="font-semibold">₹{udharAmount.toLocaleString('en-IN')}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex justify-between text-slate-600">
                      <span>{paymentMethod === 'Cash' ? t('cash') : paymentMethod === 'UPI' ? t('upi') : paymentMethod === 'Card' ? t('card') : paymentMethod === 'Udhar' ? t('udhar') : paymentMethod}</span>
                      <span className="font-semibold">₹{paymentMethod === 'Udhar' ? '0' : paid.toLocaleString('en-IN')}</span>
                    </div>
                  )}

                  <div className="border-t border-slate-200 pt-2 mt-1 space-y-1">
                    <div className="flex justify-between text-slate-700 font-semibold">
                      <span>{t('collected')}</span>
                      <span>₹{paid.toLocaleString('en-IN')}</span>
                    </div>
                    <div className={`flex justify-between font-semibold ${remainingAmount > 0 ? 'text-orange-600' : 'text-slate-600'}`}>
                      <span>{t('remainingDue')}</span>
                      <span>₹{(remainingAmount > 0 ? remainingAmount : 0).toLocaleString('en-IN')}</span>
                    </div>
                    {paid > total && (
                      <div className="flex justify-between text-blue-600 text-xs">
                        <span>{t('changeReturn')}</span>
                        <span>₹{(paid - total).toLocaleString('en-IN')}</span>
                      </div>
                    )}
                  </div>

                  <div className={`flex items-center justify-between mt-3 px-3 py-2 rounded-lg text-sm font-bold ${
                    remainingAmount <= 0
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : paid > 0
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-orange-50 text-orange-700 border border-orange-200'
                  }`}>
                    <span>{t('paymentStatus')}</span>
                    <span>{paymentStatus}</span>
                  </div>
                </div>
              );
            })()}
          </div>
          
          {/* Signature */}
          <div className="mt-8 text-center">
            {ownerSignature ? (
              <img src={ownerSignature} alt="Signature" className="mx-auto max-h-16 mb-2" />
            ) : (
              <div className="h-16 mb-2" /> // Placeholder for signature
            )}
            <div className="w-48 mx-auto border-t border-slate-300 pt-2 text-slate-500 text-sm">
              Authorized Signatory
            </div>
          </div>
        </div>
      </div>
      
      {/* Brand Footer */}
      <div className="mt-8 pt-4 border-t border-slate-100 text-center text-slate-400 text-xs">
        <p>Generated by <strong>Vyapar Sarthi</strong> - The Smart Retail Management System</p>
      </div>
    </div>
  );
});

A4Invoice.displayName = 'A4Invoice';
