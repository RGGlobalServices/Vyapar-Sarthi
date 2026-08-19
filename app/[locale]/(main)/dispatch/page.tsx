'use client';
import ComingInV2 from '@/components/mill/ComingInV2';

export default function DispatchPage() {
  return (
    <ComingInV2
      title="Dispatch"
      emoji="📤"
      accent="emerald"
      tagline="Outward gate pass, LR/e-way bill capture, and driver acknowledgement for every truck leaving the mill."
      features={[
        'Outward gate pass linked to a Sale invoice + vehicle',
        'LR (Lorry Receipt) + e-way bill number capture',
        'Loading time, sealed-bag count, driver signature capture',
        'Auto-print: Delivery Challan + Weighbridge Slip + Invoice as one bundle',
        'Live outward queue — trucks loading / loaded / dispatched',
        'Freight-to-pay vs. paid tracking per LR',
      ]}
      relatedLink={{ href: '/billing', label: 'Billing' }}
    />
  );
}
