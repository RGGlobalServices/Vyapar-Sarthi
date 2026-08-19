'use client';
import ComingInV2 from '@/components/mill/ComingInV2';

export default function QualityLabPage() {
  return (
    <ComingInV2
      title="Quality / Lab"
      emoji="🧪"
      accent="purple"
      tagline="Log lab readings per raw material lot and finished batch — moisture, foreign matter, broken %, protein, oil content."
      features={[
        'Test template per grain (paddy, wheat, dal, oil-seed) with target ranges',
        'Reading capture — moisture %, foreign matter %, broken %, damaged %, DOC %',
        'Auto flag: green / amber / red vs. purchase-grade thresholds',
        'Reject / accept decision recorded against the Purchase',
        'Attach photos + PDF lab certificates per lot',
        'Batch-level quality certificate printable for buyers',
      ]}
      relatedLink={{ href: '/purchases', label: 'Purchases' }}
    />
  );
}
