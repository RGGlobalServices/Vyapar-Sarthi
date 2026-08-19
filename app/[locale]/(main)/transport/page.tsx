'use client';
import ComingInV2 from '@/components/mill/ComingInV2';

export default function TransportPage() {
  return (
    <ComingInV2
      title="Transport"
      emoji="🚚"
      accent="orange"
      tagline="Vehicle master, freight ledger, and per-trip cost tracking for both inward and outward movement."
      features={[
        'Vehicle master — RC no., owner, capacity, driver contacts',
        'Freight ledger — per trip / per Kg / per Km / per Quintal',
        'Third-party transporter accounts + monthly settlement',
        'Fuel + toll expense capture with per-trip P/L',
        'GPS-ready: link a trip to a truck for future tracking integrations',
        'Freight cost auto-added to Purchase / Sale landing cost',
      ]}
      relatedLink={{ href: '/expenses', label: 'Expenses' }}
    />
  );
}
