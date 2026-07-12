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

  return <WarehousesUI />;
}
