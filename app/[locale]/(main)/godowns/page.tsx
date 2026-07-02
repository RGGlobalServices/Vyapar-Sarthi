'use client';

import { useState, useEffect } from 'react';
import { useBusinessStore } from '@/lib/businessStore';
import { useTranslations, useLocale } from 'next-intl';
import { Warehouse, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import WarehousesUI from './WarehousesUI';

export default function GodownsPage() {
  const { profile } = useBusinessStore();
  const locale = useLocale();
  const t = useTranslations('Godowns');
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>;
  }

  const isWholesale = profile.subscriptionPlan === 'wholesale';

  if (!isWholesale) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3"><Warehouse className="text-emerald-400" /> {t('title')}</h1>
        <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-600/5">
          <CardContent className="p-8 text-center">
            <Warehouse className="w-16 h-16 mx-auto mb-4 text-amber-400" />
            <h2 className="text-xl font-bold text-white mb-2">{t('udyogRequired')}</h2>
            <p className="text-slate-400 mb-6">{t('udyogDesc')}</p>
            <a href={`/${locale}/payment?plan=wholesale`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-500 text-slate-900 font-bold rounded-xl hover:bg-emerald-400 transition-all">
              {t('upgradeBtn')}
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <WarehousesUI />;
}
