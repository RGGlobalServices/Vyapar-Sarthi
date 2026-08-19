'use client';
import ComingInV2 from '@/components/mill/ComingInV2';

export default function BrokersPage() {
  return (
    <ComingInV2
      title="Brokers"
      emoji="🤝"
      accent="rose"
      tagline="Broker master, per-deal commission (Dalali), and monthly settlement — separate from Suppliers so payables don't mix up."
      features={[
        'Broker master — name, mobile, PAN, commission rate defaults',
        'Per-Purchase / per-Sale broker attribution with editable Dalali %',
        'Commission auto-computed on invoice value or on Kg / Quintal',
        'Broker-wise commission ledger + monthly statement',
        'Settlement flow with cash / cheque / UPI + auto Party ledger entry',
        'Broker performance report — deals brokered, volume, total commission',
      ]}
      relatedLink={{ href: '/suppliers?view=brokers', label: 'Suppliers → Brokers view' }}
    />
  );
}
