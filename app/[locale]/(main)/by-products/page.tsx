'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { Loader2 } from 'lucide-react';

// By-Products — filtered VIEW of Products (Bran / Husk / Chuni / Polish /
// Oil Cake / Chokar). Same source-of-truth as Raw Material + Finished
// Goods; the Products page's `view` param picks which slice to show.
export default function ByProductsRedirect() {
  const router = useRouter();
  const locale = useLocale();
  useEffect(() => {
    router.replace(`/${locale}/products?view=by-products`);
  }, [router, locale]);
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
    </div>
  );
}
