'use client';
import ComingInV2 from '@/components/mill/ComingInV2';

export default function MachinesPage() {
  return (
    <ComingInV2
      title="Machines"
      emoji="🏭"
      accent="slate"
      tagline="Every mill machine — sheller, polisher, expeller, packer — with capacity, purchase date, and utilization tracking."
      features={[
        'Machine master — model, capacity, make, purchase date, cost',
        'Uptime / downtime log with reason codes',
        'Per-batch machine allocation → per-machine yield report',
        'Depreciation schedule (SLM / WDV) linked to Reports',
        'Photo attachment + service manual PDFs',
      ]}
      relatedLink={{ href: '/maintenance', label: 'Maintenance' }}
    />
  );
}
