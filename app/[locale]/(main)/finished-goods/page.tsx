'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { Loader2 } from 'lucide-react';

// Finished Goods — filtered VIEW of Products (Rice / Wheat Flour / Dal /
// Oil / …). See raw-material/page.tsx for the same-source-of-truth
// reasoning; three sidebar entry points, one catalogue.
export default function FinishedGoodsRedirect() {
  const router = useRouter();
  const locale = useLocale();
  useEffect(() => {
    router.replace(`/${locale}/products?view=finished-goods`);
  }, [router, locale]);
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
    </div>
  );
}
