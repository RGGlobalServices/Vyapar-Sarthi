'use client';

import { Suspense } from 'react';
import BatchesModule from '@/components/mill/BatchesModule';

// Stage-wise production — the execution screen for batches worked step by step: start a batch, work through its stages and
// finalize it (raw material out, outputs in). Not in the sidebar: reached from Batches. Direct production starts on Raw Material.
export default function ProductionPage() {
  return <Suspense fallback={null}><BatchesModule mode="production" /></Suspense>;
}
