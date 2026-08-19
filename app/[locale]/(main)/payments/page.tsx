'use client';
import ComingInV2 from '@/components/mill/ComingInV2';

export default function PaymentsPage() {
  return (
    <ComingInV2
      title="Payments"
      emoji="💸"
      accent="emerald"
      tagline="Every rupee going OUT — to farmers, suppliers, brokers, transporters, hamali crew — one dashboard, one voucher trail."
      features={[
        'Payment voucher — Cash / UPI / Cheque / NEFT / RTGS',
        'Attach against one or many pending bills (FIFO auto-suggest)',
        'Split-payment across bills in a single voucher',
        'Cheque register with clearing date + bounce-tracking',
        'Auto-updates every affected Party Ledger + Cash Book row',
        'Printable payment receipt with revenue-stamp placement',
      ]}
      relatedLink={{ href: '/party', label: 'Party Ledger' }}
    />
  );
}
