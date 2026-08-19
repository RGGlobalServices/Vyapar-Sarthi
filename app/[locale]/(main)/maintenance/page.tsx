'use client';
import ComingInV2 from '@/components/mill/ComingInV2';

export default function MaintenancePage() {
  return (
    <ComingInV2
      title="Maintenance"
      emoji="🔧"
      accent="slate"
      tagline="Preventive + breakdown maintenance schedules, work orders, and mechanic-wise labour tracking."
      features={[
        'PM schedule per machine (weekly / monthly / hours-based triggers)',
        'Breakdown ticket → assign mechanic → time-track → close-out',
        'Spare parts consumed per work order (linked to Spare Parts stock)',
        'External vendor bills captured against a work order',
        'MTBF / MTTR report per machine',
        'Reminder push notifications to the assigned mechanic',
      ]}
      relatedLink={{ href: '/spare-parts', label: 'Spare Parts' }}
    />
  );
}
