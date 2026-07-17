'use client';

import React from 'react';
import { CartItem } from '@/lib/store';
import { useTranslations } from 'next-intl';
import { BaseInvoiceProps, ThermalInvoice } from './invoice/ThermalInvoice';
import { A4Invoice } from './invoice/A4Invoice';

export interface BillSlipProps extends BaseInvoiceProps {}

export const BillSlip = React.forwardRef<HTMLDivElement, BillSlipProps>((props, ref) => {
  const { invoiceFormat = 'thermal80' } = props;
  
  if (invoiceFormat === 'a4' || invoiceFormat === 'wholesale') {
    return <A4Invoice ref={ref} {...props} />;
  }
  
  return <ThermalInvoice ref={ref} {...props} />;
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
  emiProvider?: string;
  splitPayments?: { cash?: number; upi?: number; card?: number; udhar?: number };
  pdfUrl?: string;
  gst?: string;
  pan?: string;
  t: (key: string) => string;
}): string {
  const { t, storeName, billNumber, date, customerName, items, total, discount, amountPaid, remainingAmount, isEmi, emiProvider, splitPayments } = bill;
  const subtotal = items.reduce((acc, item) => acc + item.total, 0);
  const paid = amountPaid ?? total;
  const parts: string[] = [];

  parts.push(`Thank you for shopping at *${storeName || t('storeNameFallback')}*`);
  parts.push(`Invoice No: *${billNumber}*`);
  parts.push(`Amount: *₹${total}*`);
  
  if (customerName) {
    parts.push(`${t('customer')} ${customerName}`);
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
    parts.push(`\n*${t('paymentMode')}* EMI${emiProvider ? ` (${emiProvider})` : ''}`);
    parts.push(`${t('collected')} ₹${total}`);
    parts.push(`*${t('paymentStatus')} ${t('paid')}*`);
  } else {
    parts.push(`\n*${t('paymentMode')}*`);
    const isSplit = bill.paymentMethod === 'Split';
    const udharAmt = splitPayments?.udhar ?? (remainingAmount ?? 0);
    if (isSplit && splitPayments) {
      if ((splitPayments.cash || 0) > 0) parts.push(`  ${t('cash')} ₹${splitPayments.cash}`);
      if ((splitPayments.upi || 0) > 0) parts.push(`  ${t('upi')} ₹${splitPayments.upi}`);
      if ((splitPayments.card || 0) > 0) parts.push(`  ${t('card')} ₹${splitPayments.card}`);
      if (udharAmt > 0) parts.push(`  ${t('udhar')} ₹${udharAmt}`);
    } else {
      const method = bill.paymentMethod === 'Cash' ? t('cash')
        : bill.paymentMethod === 'UPI' ? t('upi')
        : bill.paymentMethod === 'Card' ? t('card')
        : bill.paymentMethod === 'Udhar' ? t('udhar')
        : bill.paymentMethod;
      parts.push(`  ${method} ₹${bill.paymentMethod === 'Udhar' ? '0' : paid}`);
    }
    parts.push(`${t('collected')} ₹${paid}`);
    parts.push(`${t('remainingDue')} ₹${remainingAmount ?? 0}`);
    // Payment status
    const status = (remainingAmount ?? 0) <= 0 ? t('paid') : paid > 0 ? t('partiallyPaid') : t('creditUdhar');
    parts.push(`*${t('paymentStatus')} ${status}*`);
  }

  if (bill.pdfUrl) {
    parts.push('');
    parts.push(`Please find your invoice attached or view it here:`);
    parts.push('');
    parts.push(`📄 *View/Download PDF Bill:*`);
    parts.push(bill.pdfUrl);
  }

  parts.push('');
  parts.push('_Powered by Vyapar Sarthi_');

  return parts.join('\n');
}
