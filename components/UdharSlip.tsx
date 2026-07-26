'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

interface UdharSlipProps {
  type: 'udhar' | 'payment';
  amount: number;
  customerName: string;
  customerMobile?: string;
  date: string;
  note?: string;
  storeName?: string;
  storeAddress?: string;
  storeMobile?: string;
  logoUrl?: string;
  due: number;
}

export const UdharSlip = React.forwardRef<HTMLDivElement, UdharSlipProps>(({
  type,
  amount,
  customerName,
  customerMobile,
  date,
  note,
  storeName = 'My Store',
  storeAddress,
  storeMobile,
  logoUrl,
  due,
}, ref) => {
  const t = useTranslations('UdharSlip');
  const tBill = useTranslations('BillSlip');
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
        <h1 className="text-[17px] font-black uppercase tracking-tight">{storeName}</h1>
        {storeAddress && <p className="text-[9px] mt-0.5">{storeAddress}</p>}
        {storeMobile && <p className="text-[9px]">{tBill('mob')} {storeMobile}</p>}
      </div>

      <div className="text-center mb-4 text-[13px] font-bold uppercase border border-black rounded-sm py-1">
        {type === 'payment' ? t('paymentReceipt') : t('udharGiven')}
      </div>

      {/* Meta */}
      <div className="mb-3 space-y-1 text-[10px]">
        <div className="flex justify-between">
          <span>{t('date')}</span>
          <span className="font-bold">{date}</span>
        </div>
        <div className="flex justify-between">
          <span>{tBill('customer')}</span>
          <span className="font-bold uppercase text-right max-w-[150px] truncate">{customerName}</span>
        </div>
        {customerMobile && (
          <div className="flex justify-between">
            <span>{t('mobile')}</span>
            <span>{customerMobile}</span>
          </div>
        )}
      </div>

      {/* Amount Box */}
      <div className="my-4 p-3 border-2 border-black text-center">
        <p className="text-[10px] mb-1">{type === 'payment' ? t('amountReceived') : t('amountGiven')}</p>
        <p className="text-xl font-black">₹{amount.toLocaleString('en-IN')}</p>
      </div>

      {/* Note */}
      {note && (
        <div className="mb-3 text-[10px] italic bg-gray-50 p-2 border border-dashed border-gray-400">
          {t('note')} {note}
        </div>
      )}

      {/* Balance */}
      <div className="mt-3 pt-2 space-y-1" style={{ borderTop: '1px dashed #000' }}>
        <div className="flex justify-between text-[11px] font-bold">
          <span>{t('totalBalanceDue')}</span>
          <span>₹{due.toLocaleString('en-IN')}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center mt-5 pt-3" style={{ borderTop: '1px dashed #000' }}>
        <p className="font-bold text-[9px] uppercase">
          {type === 'payment' ? t('thankYouPayment') : t('pleasePayDues')}
        </p>
        <p className="text-[7px] mt-2 text-gray-500">{t('poweredBy')}</p>
      </div>
    </div>
  );
});

UdharSlip.displayName = 'UdharSlip';

/** Generates a plain-text receipt summary for WhatsApp sharing */
export function generateUdharWhatsAppText(slip: {
  type: 'udhar' | 'payment';
  storeName?: string;
  customerName: string;
  amount: number;
  date: string;
  due: number;
  note?: string;
  pdfUrl?: string;
  t?: (key: string, values?: Record<string, any>) => string;
}): string {
  const lines: string[] = [];
  const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;
  const t = slip.t;

  lines.push(`*${slip.storeName ?? (t ? t('waStoreFallback') : 'Store')}*`);
  lines.push('');
  lines.push(slip.type === 'payment'
    ? (t ? t('waPaymentReceived') : '✅ *Payment Received*')
    : (t ? t('waUdharGiven') : '💸 *Udhar Given*'));
  lines.push(t ? t('waCustomerLabel', { name: slip.customerName }) : `Customer: ${slip.customerName}`);
  lines.push(t ? t('waDateLabel', { date: slip.date }) : `Date: ${slip.date}`);
  lines.push('');
  lines.push(t ? t('waAmountLabel', { amount: fmt(slip.amount) }) : `Amount: *${fmt(slip.amount)}*`);
  if (slip.note) lines.push(t ? t('waNoteLabel', { note: slip.note }) : `Note: _${slip.note}_`);
  lines.push('');
  lines.push(t ? t('waTotalBalanceDue', { amount: fmt(slip.due) }) : `*Total Balance Due: ${fmt(slip.due)}*`);

  if (slip.pdfUrl) {
    lines.push('');
    lines.push(t ? t('waDownloadReceipt', { url: slip.pdfUrl }) : `📄 Download Receipt: ${slip.pdfUrl}`);
  }

  return lines.join('\n');
}
