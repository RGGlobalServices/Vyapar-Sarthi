'use client';
import ComingInV2 from '@/components/mill/ComingInV2';

export default function HamaliPage() {
  return (
    <ComingInV2
      title="Hamali / Labour"
      emoji="👷"
      accent="orange"
      tagline="Loading & unloading labour master, per-truck / per-bag rates, and daily wage settlement."
      features={[
        'Labour master with Aadhaar / phone / daily-wage default',
        'Per-truck OR per-bag OR per-Quintal rate — mix on same day',
        'Attendance for loading / unloading crews',
        'Auto-computed daily wages + partial advances',
        'Weekly / monthly wage register (printable)',
        'Cash payout ledger with signature capture',
      ]}
      relatedLink={{ href: '/staff', label: 'Staff' }}
    />
  );
}
