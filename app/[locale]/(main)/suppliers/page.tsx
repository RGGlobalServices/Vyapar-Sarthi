'use client';

import { useBusinessStore } from '@/lib/businessStore';
import { useTranslations, useLocale } from 'next-intl';
import { useState, useEffect } from 'react';
import { Users, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import SuppliersUI from './SuppliersUI';

export default function SuppliersPage() {
  const { profile } = useBusinessStore();
  const locale = useLocale();
  const t = useTranslations('Godowns'); // Reusing Udyog required message from Godowns
  const [mounted, setMounted] = useState(false);
  const isWholesale = profile.subscriptionPlan === 'wholesale';

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="flex justify-center h-32 items-center"><Loader2 className="animate-spin text-emerald-500 w-8 h-8" /></div>;
  }

  if (!isWholesale) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3"><Users className="text-emerald-400" /> Suppliers</h1>
        <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-600/5">
          <CardContent className="p-8 text-center">
            <Users className="w-16 h-16 mx-auto mb-4 text-amber-400" />
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

  return <SuppliersUI />;
}
