'use client';

import React from 'react';

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
        {storeMobile && <p className="text-[9px]">Mob: {storeMobile}</p>}
      </div>

      <div className="text-center mb-4 text-[13px] font-bold uppercase border border-black rounded-sm py-1">
        {type === 'payment' ? 'Payment Receipt' : 'Udhar Given'}
      </div>

      {/* Meta */}
      <div className="mb-3 space-y-1 text-[10px]">
        <div className="flex justify-between">
          <span>Date:</span>
          <span className="font-bold">{date}</span>
        </div>
        <div className="flex justify-between">
          <span>Customer:</span>
          <span className="font-bold uppercase text-right max-w-[150px] truncate">{customerName}</span>
        </div>
        {customerMobile && (
          <div className="flex justify-between">
            <span>Mobile:</span>
            <span>{customerMobile}</span>
          </div>
        )}
      </div>

      {/* Amount Box */}
      <div className="my-4 p-3 border-2 border-black text-center">
        <p className="text-[10px] mb-1">{type === 'payment' ? 'Amount Received' : 'Amount Given'}</p>
        <p className="text-xl font-black">₹{amount.toLocaleString('en-IN')}</p>
      </div>

      {/* Note */}
      {note && (
        <div className="mb-3 text-[10px] italic bg-gray-50 p-2 border border-dashed border-gray-400">
          Note: {note}
        </div>
      )}

      {/* Balance */}
      <div className="mt-3 pt-2 space-y-1" style={{ borderTop: '1px dashed #000' }}>
        <div className="flex justify-between text-[11px] font-bold">
          <span>Total Balance Due:</span>
          <span>₹{due.toLocaleString('en-IN')}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center mt-5 pt-3" style={{ borderTop: '1px dashed #000' }}>
        <p className="font-bold text-[9px] uppercase">
          {type === 'payment' ? 'THANK YOU FOR YOUR PAYMENT!' : 'PLEASE PAY YOUR DUES ON TIME'}
        </p>
        <p className="text-[7px] mt-2 text-gray-500">Powered by Vyapar Sarthi</p>
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
}): string {
  const lines: string[] = [];
  const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;

  lines.push(`*${slip.storeName ?? 'Store'}*`);
  lines.push('');
  lines.push(slip.type === 'payment' ? '✅ *Payment Received*' : '💸 *Udhar Given*');
  lines.push(`Customer: ${slip.customerName}`);
  lines.push(`Date: ${slip.date}`);
  lines.push('');
  lines.push(`Amount: *${fmt(slip.amount)}*`);
  if (slip.note) lines.push(`Note: _${slip.note}_`);
  lines.push('');
  lines.push(`*Total Balance Due: ${fmt(slip.due)}*`);
  
  if (slip.pdfUrl) {
    lines.push('');
    lines.push(`📄 Download Receipt: ${slip.pdfUrl}`);
  }

  return lines.join('\n');
}
