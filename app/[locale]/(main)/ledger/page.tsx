'use client';
import ComingInV2 from '@/components/mill/ComingInV2';

export default function LedgerPage() {
  return (
    <ComingInV2
      title="Ledger"
      emoji="📒"
      accent="purple"
      tagline="Every account's day-book — parties, brokers, transporters, hamali, machines — with running balance and printable statement."
      features={[
        'One-click account selection (party / broker / transporter / hamali)',
        'Full day-book: Dr / Cr / Balance for every row',
        'Date-range filter + opening balance carry-forward',
        'Printable statement (PDF / Excel / thermal)',
        'WhatsApp-ready one-line summary — "Balance ₹X as of DATE"',
        'Reuses the same source-of-truth as Party Ledger — one number everywhere',
      ]}
      relatedLink={{ href: '/party', label: 'Party Ledger' }}
    />
  );
}
