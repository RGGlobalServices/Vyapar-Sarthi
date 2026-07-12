'use client';

import { useTranslations, useLocale } from 'next-intl';
import { ArrowRightLeft, Box, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';

export default function TransfersPage() {
  const t = useTranslations('Nav');
  const ts = useTranslations('StockTransfers');
  const locale = useLocale();

  return (
    <div className="space-y-6 max-w-4xl mx-auto pt-10">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
        <ArrowRightLeft className="text-blue-500" /> {t('transfers')}
      </h1>
      
      <Card className="border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-blue-600/5">
        <CardContent className="p-12 text-center">
          <div className="w-20 h-20 bg-blue-100 dark:bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-500/20">
            <ArrowRightLeft className="w-10 h-10 text-blue-600 dark:text-blue-400" />
          </div>
          
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
            {ts('manageTitle')}
          </h2>
          
          <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-md mx-auto leading-relaxed">
            {ts('manageDesc')}
          </p>
          
          <Link href={`/${locale}/stock`}
            className="inline-flex items-center gap-2 px-8 py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/30">
            <Box size={20} />
            {ts('goToStockBtn')}
            <ArrowRight size={18} />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
