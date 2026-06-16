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
  // EMI fields
  isEmi?: boolean;
  emiMonths?: number;
  emiDownPayment?: number;
  emiMonthlyAmount?: number;
  emiInterestRate?: number;
  emiTotalAmount?: number;
}

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
  storeName = 'Kirana Store',
  storeAddress,
  storeMobile,
  logoUrl,
  ownerSignature,
  isEmi,
  emiMonths,
  emiDownPayment,
  emiMonthlyAmount,
  emiInterestRate,
  emiTotalAmount,
}, ref) => {
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
        <h1 className="text-[17px] font-black uppercase tracking-tight">{storeName}</h1>
        <p className="text-[9px] font-bold mt-0.5">SMART DASHBOARD POS</p>
        {storeAddress && <p className="text-[9px] mt-0.5">{storeAddress}</p>}
        {storeMobile && <p className="text-[9px]">Mob: {storeMobile}</p>}
      </div>

      {/* Bill meta */}
      <div className="flex justify-between mb-1 text-[9px] font-bold">
        <span>Bill: {billNumber}</span>
        <span>{date}</span>
      </div>
      {customerName && (
        <div className="mb-1 text-[9px]">Customer: <strong>{customerName}</strong></div>
      )}
      <div className="mb-3 text-[9px]">
        Payment: <strong>{isEmi ? 'EMI' : paymentMethod.toUpperCase()}</strong>
      </div>

      {/* Items table */}
      <table className="w-full mb-3" style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000' }}>
        <thead>
          <tr className="text-[9px]">
            <th className="text-left py-1">ITEM</th>
            <th className="text-center py-1 w-8">QTY</th>
            <th className="text-right py-1 w-16">AMT</th>
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
          <span>Subtotal:</span>
          <span>₹{subtotal.toLocaleString('en-IN')}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-[9px]">
            <span>Discount:</span>
            <span>- ₹{discount.toLocaleString('en-IN')}</span>
          </div>
        )}
        <div className="flex justify-between font-black text-[14px] pt-1" style={{ borderTop: '1px solid #000' }}>
          <span>TOTAL</span>
          <span>₹{total.toLocaleString('en-IN')}</span>
        </div>
      </div>

      {/* EMI breakdown */}
      {isEmi && emiMonths && emiMonthlyAmount !== undefined ? (
        <div className="mt-2 pt-2 space-y-0.5" style={{ borderTop: '1px dashed #000' }}>
          <div className="text-[9px] font-bold text-center mb-1">── EMI DETAILS ──</div>
          <div className="flex justify-between text-[9px]">
            <span>Down Payment:</span>
            <span className="font-bold">₹{(emiDownPayment ?? 0).toLocaleString('en-IN')}</span>
          </div>
          <div className="flex justify-between text-[9px]">
            <span>Monthly EMI × {emiMonths}:</span>
            <span className="font-bold">₹{emiMonthlyAmount.toLocaleString('en-IN')}/mo</span>
          </div>
          {emiInterestRate !== undefined && (
            <div className="flex justify-between text-[9px]">
              <span>Interest Rate:</span>
              <span>{emiInterestRate === 0 ? 'No Cost EMI' : `${emiInterestRate}% p.a.`}</span>
            </div>
          )}
          <div className="flex justify-between text-[9px] font-bold" style={{ borderTop: '1px dotted #000', paddingTop: '2px' }}>
            <span>Total Payable:</span>
            <span>₹{(emiTotalAmount ?? 0).toLocaleString('en-IN')}</span>
          </div>
        </div>
      ) : (
        /* Cash / UPI / Udhar summary */
        <div className="mt-2 pt-2 space-y-0.5" style={{ borderTop: '1px dashed #000' }}>
          <div className="flex justify-between text-[10px] font-bold">
            <span>Amount Paid:</span>
            <span>₹{paid.toLocaleString('en-IN')}</span>
          </div>
          <div className="flex justify-between text-[10px] font-bold">
            <span>Remaining (Udhar):</span>
            <span>{remainingAmount > 0 ? `₹${remainingAmount.toLocaleString('en-IN')}` : '₹0'}</span>
          </div>
          {remainingAmount > 0 && customerName && (
            <div className="text-[8px] text-center mt-1 italic">
              ₹{remainingAmount.toLocaleString('en-IN')} added to Udhar Khata for {customerName}
            </div>
          )}
        </div>
      )}

      {/* Owner Signature */}
      {ownerSignature && (
        <div className="mt-5 pt-2" style={{ borderTop: '1px dashed #000' }}>
          <div className="flex justify-end">
            <div className="text-center">
              <div style={{ borderTop: '1px solid #000', width: '120px', marginBottom: '2px' }} />
              <p className="text-[9px] font-black">{ownerSignature}</p>
              <p className="text-[8px]">Authorized Signatory</p>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-center mt-4 pt-3" style={{ borderTop: '1px dashed #000' }}>
        <p className="font-bold text-[9px]">THANK YOU FOR SHOPPING!</p>
        <p className="text-[8px] italic">Please check items before leaving</p>
        <p className="text-[7px] mt-1.5">Powered by Vyapar Sarthi</p>
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
}): string {
  const lines: string[] = [];
  const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;

  lines.push(`*${bill.storeName ?? 'Store'}*`);
  lines.push(`Bill: *${bill.billNumber}*  |  Date: ${bill.date}`);
  if (bill.customerName) lines.push(`Customer: ${bill.customerName}`);
  lines.push(`Payment: *${bill.isEmi ? 'EMI' : bill.paymentMethod.toUpperCase()}*`);
  lines.push('');
  lines.push('*Items:*');
  bill.items.forEach(item => {
    lines.push(`  • ${item.name} × ${item.quantity}  =  ${fmt(item.total)}`);
  });
  lines.push('');
  if ((bill.discount ?? 0) > 0) lines.push(`Discount: -${fmt(bill.discount!)}`);
  lines.push(`*TOTAL: ${fmt(bill.total)}*`);

  if (bill.isEmi && bill.emiMonths) {
    lines.push('');
    lines.push('*EMI Details:*');
    lines.push(`  Down Payment: ${fmt(bill.emiDownPayment ?? 0)}`);
    lines.push(`  Monthly EMI: ${fmt(bill.emiMonthlyAmount ?? 0)} × ${bill.emiMonths} months`);
    if (bill.emiInterestRate === 0) lines.push(`  ✅ No Cost EMI`);
    else if (bill.emiInterestRate) lines.push(`  Interest: ${bill.emiInterestRate}% p.a.`);
    lines.push(`  Total Payable: ${fmt(bill.emiTotalAmount ?? 0)}`);
  } else {
    lines.push(`Amount Paid: ${fmt(bill.amountPaid ?? bill.total)}`);
    if ((bill.remainingAmount ?? 0) > 0) {
      lines.push(`Remaining (Udhar): *${fmt(bill.remainingAmount!)}*`);
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
