'use client';

import React from 'react';
import { CartItem } from '@/lib/store';
import { useTranslations } from 'next-intl';
import { getInvoiceColumns } from '@/lib/invoice-helpers';
import { BusinessType } from '@/lib/businessConfig';
import { Barcode } from './Barcode';

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
}, ref) => {
  const t = useTranslations('BillSlip');
  const subtotal = items.reduce((acc, item) => acc + item.total, 0);
  const paid = amountPaid ?? total;
  
  const columns = getInvoiceColumns(businessType);
  const is58mm = invoiceFormat === 'thermal58';
  
  const widthClass = is58mm ? 'max-w-[220px]' : 'max-w-[320px]';
  const textClass = is58mm ? 'text-[9px]' : 'text-[11px]';
  const smallTextClass = is58mm ? 'text-[7px]' : 'text-[9px]';
  const headerTextClass = is58mm ? 'text-[13px]' : 'text-[17px]';
  
  return (
    <div
      ref={ref}
      style={{ backgroundColor: '#ffffff', color: '#000000', fontFamily: 'monospace' }}
      className={`p-3 w-full mx-auto ${widthClass} ${textClass} leading-snug`}
    >
      {/* Header */}
      <div className="text-center mb-3 pb-2" style={{ borderBottom: '1px solid #000' }}>
        {logoUrl && (
          <div className="flex justify-center mb-2">
            <img src={logoUrl} alt="Logo" style={{ maxHeight: is58mm ? '30px' : '40px', maxWidth: '100px' }} />
          </div>
        )}
        <h1 className={`${headerTextClass} font-black uppercase tracking-tight`}>{storeName || t('storeNameFallback')}</h1>
        {storeAddress && <p className={`${smallTextClass} mt-0.5`}>{storeAddress}</p>}
        {storeMobile && <p className={smallTextClass}>{t('mob')} {storeMobile}</p>}
        {gst && <p className={smallTextClass}>{t('gstin')} {gst}</p>}
        {pan && <p className={smallTextClass}>{t('pan')} {pan}</p>}
      </div>

      {/* Bill meta & Barcode */}
      <div className={`flex justify-between items-center mb-1 ${smallTextClass} font-bold`}>
        <div className="flex flex-col gap-0.5">
          <span>{t('bill')} {billNumber}</span>
          <Barcode value={billNumber} height={20} displayValue={false} />
        </div>
        <span>{date}</span>
      </div>
      
      {(customerName || customerMobile) && (
        <div className={`mb-1 ${smallTextClass}`}>
          {t('customer')} <strong>{customerName || '-'}</strong> {customerMobile && `(${customerMobile})`}
        </div>
      )}
      {customerAddress && <div className={`mb-1 ${smallTextClass}`}>Address: {customerAddress}</div>}
      {customerGst && <div className={`mb-1 ${smallTextClass}`}>GSTIN: {customerGst}</div>}

      {/* Items table */}
      <table className="w-full mb-3" style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000' }}>
        <thead>
          <tr className={smallTextClass}>
            {columns.map(col => (
              <th key={col.id} className={`py-1 text-${col.align} ${col.width || ''}`}>{t(col.labelKey) || col.labelKey}</th>
            ))}
          </tr>
        </thead>
        <tbody style={{ borderTop: '1px dotted #000' }}>
          {items.map((item, idx) => (
            <tr key={idx} className="align-top">
              {columns.map(col => (
                <td key={col.id} className={`py-0.5 text-${col.align} ${textClass} ${col.id === 'item' ? 'pr-2' : ''}`}>
                  {col.render(item)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="space-y-0.5">
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
        <div className="flex justify-between font-black text-[14px] pt-1" style={{ borderTop: '1px solid #000' }}>
          <span>{t('total')}</span>
          <span>₹{total.toLocaleString('en-IN')}</span>
        </div>
      </div>

      {/* Payment Summary */}
      {isEmi && emiMonths && emiMonthlyAmount !== undefined ? (
        <div className="mt-2 pt-2 space-y-0.5" style={{ borderTop: '1px dashed #000' }}>
          <div className={`${smallTextClass} font-bold text-center mb-1`}>{t('emiDetails')}</div>
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
          <div className={`flex justify-between ${smallTextClass} font-bold`} style={{ borderTop: '1px dotted #000', paddingTop: '2px' }}>
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
          <div className="mt-2 pt-2 space-y-0.5" style={{ borderTop: '1px dashed #000' }}>
            <div className={`${smallTextClass} font-bold mb-1`}>{t('paymentMode')}</div>

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
            <div style={{ borderTop: '1px dotted #000', paddingTop: '2px' }} className="mt-1">
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
            <div className={`${smallTextClass} font-bold mt-1 pt-1`} style={{ borderTop: '1px dotted #000' }}>
              <span>{t('paymentStatus')}</span> <strong>{paymentStatus}</strong>
            </div>

            {remainingAmount > 0 && customerName && (
              <div className="text-[8px] text-center mt-1 italic">
                {t('savedToUdharKhata')}
              </div>
            )}
          </div>
        );
      })()}

      {/* QR Code Placeholder */}
      {showQrCode && (
        <div className="mt-4 pt-3 flex flex-col items-center" style={{ borderTop: '1px solid #000' }}>
           {/* Replace with actual QR Code later if react-qr-code is installed */}
           <div className="w-16 h-16 border border-black flex items-center justify-center text-[8px] bg-slate-50">
             QR
           </div>
           <p className="text-[8px] mt-1">Scan to Verify</p>
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 pt-3 text-center" style={{ borderTop: '1px solid #000' }}>
        {ownerSignature && (
          <div className="mb-2">
            <img src={ownerSignature} alt="Signature" className="mx-auto" style={{ maxHeight: '30px' }} />
          </div>
        )}
        <p className={`font-bold ${textClass} mb-1`}>{t('thankYou')}</p>
        {invoiceFooter && <p className="text-[9px] mb-1 whitespace-pre-wrap">{invoiceFooter}</p>}
        <p className="text-[8px] text-gray-500">Powered by Vyapar Sarthi</p>
      </div>
    </div>
  );
});

ThermalInvoice.displayName = 'ThermalInvoice';
