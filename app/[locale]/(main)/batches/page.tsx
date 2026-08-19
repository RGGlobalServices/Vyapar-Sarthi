'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { Loader2 } from 'lucide-react';

// The real production-batches page already lives at /mill/batches (built
// before the Bada Udyog sidebar existed). The sidebar's `batches` link
// points here so the top-level URL stays clean; this simply forwards to
// the existing implementation with no data loss.
export default function BatchesRedirect() {
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
