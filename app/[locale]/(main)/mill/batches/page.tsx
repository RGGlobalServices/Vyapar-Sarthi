'use client';

import BatchesHub from '@/components/mill/BatchesHub';

// Batches — the record of production: every finished run with its Slip and the reports, plus the optional stage-wise batches.
// Direct production is started from Raw Material.
export default function MillBatchesPage() {
  return <BatchesHub />;
}
