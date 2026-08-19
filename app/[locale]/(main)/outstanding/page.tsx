'use client';
import ComingInV2 from '@/components/mill/ComingInV2';

export default function OutstandingPage() {
  return (
    <ComingInV2
      title="Outstanding"
      emoji="⏳"
      accent="rose"
      tagline="Everyone who owes you and everyone you owe — bucketed by aging, ready to send reminders in one tap."
      features={[
        'Aging buckets — 0-15 / 16-30 / 31-60 / 60+ days',
        'Receivables (from Parties / Customers) + Payables (to Suppliers / Brokers)',
        'One-tap WhatsApp / SMS reminder with a pre-formatted statement',
        'Bulk export as an Aging PDF for cash-flow reviews',
        'Drill-down: click a party → open their full Ledger',
        'Auto-sync with existing Udhar / Party Payment flows — no double entry',
      ]}
      relatedLink={{ href: '/party', label: 'Party Ledger' }}
    />
  );
}
