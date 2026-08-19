'use client';
import ComingInV2 from '@/components/mill/ComingInV2';

export default function ReceiptsPage() {
  return (
    <ComingInV2
      title="Receipts"
      emoji="🧾"
      accent="blue"
      tagline="Every rupee coming IN — from dukandars, retail customers, brokers — matched to open bills, no orphan receipts."
      features={[
        'Receipt voucher — Cash / UPI / Cheque / NEFT / RTGS',
        'Auto-suggest which open bills to knock off (FIFO or manual pick)',
        'Advance receipts held against the party until a bill lands',
        'UPI QR generation with amount pre-filled (party-specific)',
        'Daily receipt register + cash-drawer denomination sheet',
        'Auto-updates every affected Party Ledger + Cash Book row',
      ]}
      relatedLink={{ href: '/party', label: 'Party Ledger' }}
    />
  );
}
