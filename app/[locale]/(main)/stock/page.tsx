'use client';

import { useBusinessStore } from '@/lib/businessStore';
import { isWholesaleTierPackage } from '@/lib/config/packageConfig';
import LegacyStockUI from './LegacyStockUI';
import WholesaleStockUI from './WholesaleStockUI';

export default function StockPage() {
  const { profile } = useBusinessStore();

  if (isWholesaleTierPackage(profile.subscriptionPlan)) {
    return <WholesaleStockUI />;
  }

  return <LegacyStockUI />;
}
