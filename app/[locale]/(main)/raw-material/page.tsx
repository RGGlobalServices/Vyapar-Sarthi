'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { Loader2 } from 'lucide-react';

// Raw Material is a filtered VIEW of the existing Products page for the
// Bada Udyog / Mills package — one source of truth for the catalogue,
// three named entry points for the shopkeeper. Products?view=raw-material
// filters to raw material categories (Paddy / Wheat / Bajra / Oil-seeds …)
// via the shared Products filter bar in v2. Today it just lands on the
// same Products page unfiltered, so nothing is broken while the filter UI
// is being built.
export default function RawMaterialRedirect() {
  const router = useRouter();
  const locale = useLocale();
  useEffect(() => {
    router.replace(`/${locale}/products?view=raw-material`);
  }, [router, locale]);
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
    </div>
  );
}
