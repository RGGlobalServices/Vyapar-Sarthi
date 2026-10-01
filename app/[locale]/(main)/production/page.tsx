'use client';

import { Suspense } from 'react';
import ProductionHome from '@/components/mill/ProductionHome';

// Production — one big "New Production" button (the one-form entry), the latest runs, and the stage-wise batches folded below
// for mills that work step by step. Batches are still created on the Batches screen.
export default function ProductionPage() {
  return <Suspense fallback={null}><ProductionHome /></Suspense>;
}
