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
  // (Removed `!mounted` spinner — page reads from stores that are safe to
  //  render synchronously; the guard was making every navigation flash.)

  return <WarehousesUI />;
}
