'use client';
import ComingInV2 from '@/components/mill/ComingInV2';

export default function GateEntryPage() {
  return (
    <ComingInV2
      title="Gate Entry"
      emoji="🚛"
      accent="amber"
      tagline="Log every truck as it enters the mill — vehicle, driver, farmer/supplier, expected material — before it reaches the weighbridge."
      features={[
        'Inward gate pass with unique serial + auto timestamp',
        'Truck / driver / RC number captured once, auto-suggested next time',
        'Farmer / supplier picker linked to your existing Suppliers list',
        'Expected material + estimated qty (moisture % on receipt)',
        'Live queue view — who is inside the gate right now',
        'Printable gate slip (thermal + A5) with QR for the weighbridge station',
        'Auto-links to the Weighbridge entry once weight is captured',
      ]}
      relatedLink={{ href: '/suppliers', label: 'Suppliers' }}
    />
  );
}
