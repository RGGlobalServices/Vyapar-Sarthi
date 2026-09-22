'use client';

import { Suspense } from 'react';
import BatchesModule from '@/components/mill/BatchesModule';

// Production — the execution screen: start a batch, work through its stages and finalize it
// (raw material out, outputs in). Batches are created on the Batches screen.
export default function ProductionPage() {
  return <Suspense fallback={null}><BatchesModule mode="production" /></Suspense>;
}
