'use client';

import { Suspense } from 'react';
import BatchesModule from '@/components/mill/BatchesModule';

// Batches — create and manage production batch records: the raw material lot, the input, the status and the result.
// Processing itself (stages, finalize) happens on the Production screen.
export default function MillBatchesPage() {
  return <Suspense fallback={null}><BatchesModule mode="batches" /></Suspense>;
}
