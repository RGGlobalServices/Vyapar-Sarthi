'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { Loader2 } from 'lucide-react';

// Production — the sidebar's "Production" link used to land on a "Coming in
// V2" placeholder describing a workflow (stage tracking, input/output/
// wastage, recovery %, by-product capture, planned-vs-actual) that the real
// /mill/batches page already builds and has for a while. Redirect straight
// there instead of showing a stale "coming soon" card for a feature that
// already shipped — same pattern as raw-material/finished-goods/by-products.
export default function ProductionRedirect() {
  const router = useRouter();
  const locale = useLocale();
  useEffect(() => {
    router.replace(`/${locale}/mill/batches`);
  }, [router, locale]);
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
    </div>
  );
}
