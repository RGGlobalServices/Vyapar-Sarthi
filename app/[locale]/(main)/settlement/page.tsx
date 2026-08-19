'use client';
import ComingInV2 from '@/components/mill/ComingInV2';

export default function SettlementPage() {
  return (
    <ComingInV2
      title="Settlement & Discounts"
      emoji="🧾"
      accent="emerald"
      tagline="Wrap up any pending balance with a farmer, broker, or dukandar — with cash discount, rate difference, or write-off recorded cleanly."
      features={[
        'Pick any party (farmer, broker, dukandar, transporter)',
        'Auto-list every open bill / advance / commission line',
        'One-shot settle: cash + UPI + cheque + adjustment in one voucher',
        'Discount / rate-difference / write-off with reason code',
        'Prints a signed Settlement Voucher (thermal + A5)',
        'Auto-updates every affected Party Ledger + Cash Book row atomically',
      ]}
      relatedLink={{ href: '/party', label: 'Party Ledger' }}
    />
  );
}
