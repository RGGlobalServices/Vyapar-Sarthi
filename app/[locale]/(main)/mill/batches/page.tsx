'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { Loader2 } from 'lucide-react';

// Batches now live inside Raw Material (where production starts); old links and bookmarks land there.
export default function MillBatchesPage() {
  const router = useRouter();
  const locale = useLocale();
  useEffect(() => { router.replace(`/${locale}/raw-material?view=batches`); }, [router, locale]);
  return <div className="min-h-[50vh] flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div>;
}
