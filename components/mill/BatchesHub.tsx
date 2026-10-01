'use client';

import { useTranslations } from 'next-intl';
import { ClipboardCheck } from 'lucide-react';
import ProductionRuns from '@/components/mill/ProductionRuns';

/**
 * Batches — the record of production: every finished run with its Slip, and the reports (daily register, yield by material, all runs).
 * Production itself is started from Raw Material.
 */
export default function BatchesHub() {
  const t = useTranslations('Mill');
  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
      <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
        <ClipboardCheck size={22} className="text-amber-600" /> {t('br_tabRuns')}
      </h1>
      <ProductionRuns />
    </div>
  );
}
