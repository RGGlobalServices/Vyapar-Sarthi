'use client';

import React from 'react';
import { CartItem } from '@/lib/store';

interface BillSlipProps {
  items: CartItem[];
  total: number;
  discount?: number;
  amountPaid?: number;
  remainingAmount?: number;
  customerName?: string;
  paymentMethod: string;
  billNumber: string;
  date: string;
  storeName?: string;
  storeAddress?: string;
  storeMobile?: string;
  logoUrl?: string;
  ownerSignature?: string;
  customerMobile?: string;
  gst?: string;
  pan?: string;
  // EMI fields
  isEmi?: boolean;
  emiMonths?: number;
  emiDownPayment?: number;
  emiMonthlyAmount?: number;
  emiInterestRate?: number;
  emiTotalAmount?: number;
}

import { useTranslations } from 'next-intl';

export const BillSlip = React.forwardRef<HTMLDivElement, BillSlipProps>(({
  items,
  total,
  discount = 0,
  amountPaid,
  remainingAmount = 0,
  customerName,
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
}, ref) => {
  const t = useTranslations('BillSlip');
  const subtotal = items.reduce((acc, item) => acc + item.total, 0);
  const paid = amountPaid ?? total;

  return (
    <div
      ref={ref}
      style={{ backgroundColor: '#ffffff', color: '#000000', fontFamily: 'monospace' }}
      className="p-5 w-full max-w-[320px] mx-auto text-[11px] leading-snug"
    >
      {/* Header */}
      <div className="text-center mb-3 pb-2" style={{ borderBottom: '1px solid #000' }}>
        {logoUrl && (
          <div className="flex justify-center mb-2">
            <img src={logoUrl} alt="Logo" style={{ maxHeight: '40px', maxWidth: '100px' }} />
          </div>
        )}
        <h1 className="text-[17px] font-black uppercase tracking-tight">{storeName || t('storeNameFallback')}</h1>
        {storeAddress && <p className="text-[9px] mt-0.5">{storeAddress}</p>}
        {storeMobile && <p className="text-[9px]">{t('mob')} {storeMobile}</p>}
        {gst && <p className="text-[9px]">{t('gstin')} {gst}</p>}
        {pan && <p className="text-[9px]">{t('pan')} {pan}</p>}
      </div>

      {/* Bill meta */}
      <div className="flex justify-between mb-1 text-[9px] font-bold">
        <span>{t('bill')} {billNumber}</span>
        <span>{date}</span>
      </div>
      {customerName && (
        <div className="mb-1 text-[9px]">{t('customer')} <strong>{customerName}</strong></div>
      )}
      <div className="mb-3 text-[9px]">
        {t('payment')} <strong>{isEmi ? t('emi') : paymentMethod.toUpperCase()}</strong>
      </div>

      {/* Items table */}
      <table className="w-full mb-3" style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000' }}>
        <thead>
          <tr className="text-[9px]">
            <th className="text-left py-1">{t('item')}</th>
            <th className="text-center py-1 w-8">{t('qty')}</th>
            <th className="text-right py-1 w-16">{t('amt')}</th>
          </tr>
        </thead>
        <tbody style={{ borderTop: '1px dotted #000' }}>
          {items.map((item, idx) => (
            <tr key={idx} className="align-top">
              <td className="py-0.5 pr-2 text-[10px]">{item.name}</td>
              <td className="text-center py-0.5 text-[10px] whitespace-nowrap">{item.quantity}</td>
              <td className="text-right py-0.5 font-bold text-[10px]">₹{item.total.toLocaleString('en-IN')}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="space-y-0.5">
        <div className="flex justify-between text-[9px]">
          <span>{t('subtotal')}</span>
          <span>₹{subtotal.toLocaleString('en-IN')}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-[9px]">
            <span>{t('discount')}</span>
            <span>- ₹{discount.toLocaleString('en-IN')}</span>
          </div>
        )}
        <div className="flex justify-between font-black text-[14px] pt-1" style={{ borderTop: '1px solid #000' }}>
          <span>{t('total')}</span>
          <span>₹{total.toLocaleString('en-IN')}</span>
        </div>
      </div>

      {/* EMI breakdown */}
      {isEmi && emiMonths && emiMonthlyAmount !== undefined ? (
        <div className="mt-2 pt-2 space-y-0.5" style={{ borderTop: '1px dashed #000' }}>
          <div className="text-[9px] font-bold text-center mb-1">{t('emiDetails')}</div>
          <div className="flex justify-between text-[9px]">
            <span>{t('downPayment')}</span>
            <span className="font-bold">₹{(emiDownPayment ?? 0).toLocaleString('en-IN')}</span>
          </div>
          <div className="flex justify-between text-[9px]">
            <span>{t('monthlyEmi')} &times; {emiMonths}:</span>
            <span className="font-bold">₹{emiMonthlyAmount.toLocaleString('en-IN')}{t('mo')}</span>
          </div>
          {emiInterestRate !== undefined && (
            <div className="flex justify-between text-[9px]">
              <span>{t('interestRate')}</span>
              <span>{emiInterestRate === 0 ? t('noCostEmi') : `${emiInterestRate}% ${t('pa')}`}</span>
            </div>
          )}
          <div className="flex justify-between text-[9px] font-bold" style={{ borderTop: '1px dotted #000', paddingTop: '2px' }}>
            <span>{t('totalPayable')}</span>
            <span>₹{(emiTotalAmount ?? 0).toLocaleString('en-IN')}</span>
          </div>
        </div>
      ) : (
        /* Cash / UPI / Udhar summary */
        <div className="mt-2 pt-2 space-y-0.5" style={{ borderTop: '1px dashed #000' }}>
          <div className="flex justify-between text-[10px] font-bold">
            <span>{t('amountPaid')}</span>
            <span>₹{paid.toLocaleString('en-IN')}</span>
          </div>
          <div className="flex justify-between text-[10px] font-bold">
            <span>{t('remainingUdhar')}</span>
            <span>{remainingAmount > 0 ? `₹${remainingAmount.toLocaleString('en-IN')}` : '₹0'}</span>
          </div>
          {remainingAmount > 0 && customerName && (
            <div className="text-[8px] text-center mt-1 italic">
              {t('savedToUdharKhata')}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 pt-3 text-center" style={{ borderTop: '1px solid #000' }}>
        {ownerSignature && (
          <div className="mb-2">
            <img src={ownerSignature} alt="Signature" className="mx-auto" style={{ maxHeight: '30px' }} />
          </div>
        )}
        <p className="font-bold text-[11px] mb-1">{t('thankYou')}</p>
        <p className="text-[8px] text-gray-500">vyaparsarthii.com</p>
      </div>
    </div>
  );
});

BillSlip.displayName = 'BillSlip';

/** Generates a plain-text bill summary for WhatsApp sharing */
export function generateWhatsAppText(bill: {
  storeName?: string;
  billNumber: string;
  date: string;
  customerName?: string;
  paymentMethod: string;
  items: CartItem[];
  total: number;
  discount?: number;
  amountPaid?: number;
  remainingAmount?: number;
  isEmi?: boolean;
  emiMonths?: number;
  emiDownPayment?: number;
  emiMonthlyAmount?: number;
  emiInterestRate?: number;
  emiTotalAmount?: number;
  pdfUrl?: string;
  gst?: string;
  pan?: string;
  t: (key: string) => string;
}): string {
  const { t, storeName, billNumber, date, customerName, items, total, discount, amountPaid, remainingAmount, isEmi, emiMonths, emiDownPayment, emiMonthlyAmount, emiTotalAmount } = bill;
  const subtotal = items.reduce((acc, item) => acc + item.total, 0);
  const paid = amountPaid ?? total;
  const parts: string[] = [];

  parts.push(`*${t('bill')} ${billNumber}*`);
  parts.push(`*${storeName || t('storeNameFallback')}*`);
  
  if (customerName) {
    parts.push(`\n${t('customer')} ${customerName}`);
  }
  
  parts.push('\n*Items:*');
  items.forEach(item => {
    parts.push(`${item.name} x ${item.quantity} = ₹${item.total}`);
  });
  
  if ((discount ?? 0) > 0) {
    parts.push(`\n${t('subtotal')} ₹${subtotal}`);
    parts.push(`${t('discount')} -₹${discount}`);
  }
  
  parts.push(`\n*${t('total')} ₹${total}*`);
  
  if (isEmi) {
    parts.push(`\n${t('emiDetails')}`);
    parts.push(`${t('downPayment')} ₹${emiDownPayment ?? 0}`);
    parts.push(`${t('monthlyEmi')} x ${emiMonths}: ₹${emiMonthlyAmount ?? 0}${t('mo')}`);
    parts.push(`${t('totalPayable')} ₹${emiTotalAmount ?? 0}`);
  } else {
    parts.push(`\n${t('amountPaid')} ₹${paid}`);
    if ((remainingAmount ?? 0) > 0) {
      parts.push(`*${t('remainingUdhar')} ₹${remainingAmount}*`);
    }
  }

  if (bill.pdfUrl) {
    lines.push('');
    lines.push(`📄 *View/Download PDF Bill:*`);
    lines.push(bill.pdfUrl);
  }

  lines.push('');
  lines.push('_Thank you for shopping!_');
  lines.push('_Powered by Vyapar Sarthi_');

  return lines.join('\n');
}
