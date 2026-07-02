'use client';

import { useBusinessStore } from '@/lib/businessStore';
import LegacyStockUI from './LegacyStockUI';
import WholesaleStockUI from './WholesaleStockUI';

export default function StockPage() {
  const { profile } = useBusinessStore();
  
  if (profile.subscriptionPlan === 'wholesale') {
    return <WholesaleStockUI />;
  }
  
  return <LegacyStockUI />;
}
