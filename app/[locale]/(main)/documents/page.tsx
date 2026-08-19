'use client';
import ComingInV2 from '@/components/mill/ComingInV2';

export default function DocumentsPage() {
  return (
    <ComingInV2
      title="Documents"
      emoji="📄"
      accent="blue"
      tagline="Every printable document a mill hands out — GST invoice, purchase bill, freight challan, gate pass, weighbridge slip, receipt — organized in one place."
      features={[
        'GST invoice + Non-GST bill templates (thermal / A5 / A4)',
        'Purchase Bill printable directly from a farmer weighbridge slip',
        'Freight Challan (LR) with per-truck cost split',
        'Gate Pass — inward + outward, QR-coded',
        'Weighbridge Slip — with tare / gross / net + moisture % capture',
        'Payment Receipt with signature + revenue-stamp placement',
        'Bulk-reprint by date range for audit / GST filing',
      ]}
      relatedLink={{ href: '/billing', label: 'Billing' }}
    />
  );
}
