'use client';
import ComingInV2 from '@/components/mill/ComingInV2';

export default function WeighbridgePage() {
  return (
    <ComingInV2
      title="Weighbridge"
      emoji="⚖️"
      accent="blue"
      tagline="Capture gross / tare / net weights, moisture %, and auto-generate the weighbridge slip that becomes the Purchase entry."
      features={[
        'Gross → Tare → Net weight capture with two-weigh workflow',
        'Auto-pull vehicle + supplier from the linked Gate Entry',
        'Moisture % + dockage % → auto-adjusted paid weight',
        'Printable weighbridge slip (thermal + A5) with QR',
        'One-click: convert weighbridge slip → Purchase invoice',
        'Serial-based slip numbering, non-editable once printed',
        'Daily inward register export (Excel / PDF) — per-farmer summary',
      ]}
      relatedLink={{ href: '/purchases', label: 'Purchases' }}
    />
  );
}
