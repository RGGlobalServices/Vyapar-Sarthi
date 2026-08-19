'use client';
import ComingInV2 from '@/components/mill/ComingInV2';

export default function ProductionPage() {
  return (
    <ComingInV2
      title="Production"
      emoji="⚙️"
      accent="amber"
      tagline="Turn a raw material lot into finished stock — full milling workflow with yield %, wastage, and by-product accounting."
      features={[
        'Start a production run from a specific Raw Material lot',
        'Stage tracking: Cleaning → Drying → Shelling → Polishing → Packing',
        'Input Kg vs. Output Kg vs. Wastage Kg — auto recovery % per stage',
        'By-product capture (Bran, Husk, Chuni, Polish, Oil Cake) into their own stock',
        'Multi-size packing output — 5 / 10 / 25 / 50 Kg SKUs per run',
        'Operator + shift log for accountability',
        'Batches page already shows an early build of this workflow — link below',
      ]}
      relatedLink={{ href: '/mill/batches', label: 'Batches (early)' }}
    />
  );
}
