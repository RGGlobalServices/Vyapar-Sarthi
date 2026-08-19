'use client';
import ComingInV2 from '@/components/mill/ComingInV2';

export default function SparePartsPage() {
  return (
    <ComingInV2
      title="Spare Parts"
      emoji="🔩"
      accent="slate"
      tagline="Bearings, belts, sieves, rollers — dedicated stock for the mill's own upkeep, separate from finished-goods inventory."
      features={[
        'Spare-parts stock separate from Products, but same Godown model',
        'Per-machine BOM — which spares fit which machines',
        'Reorder alerts based on min-stock thresholds',
        'Auto-consume from stock when a Maintenance work order closes',
        'Supplier attribution per spare part (for repeat orders)',
        'Value on hand + last-purchase price tracking',
      ]}
      relatedLink={{ href: '/maintenance', label: 'Maintenance' }}
    />
  );
}
