'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

/**
 * Detects the current screen context from the URL pathname.
 * This is sent to the AI chat API so the assistant gives contextual answers.
 */
export function useAIContext(): { screenContext: string; screenLabel: string } {
  const pathname = usePathname();

  return useMemo(() => {
    const segments = pathname.split('/').filter(Boolean);
    // Strip locale prefix (en, hi, mr)
    const mainSegment = segments.length > 0 && ['en', 'hi', 'mr'].includes(segments[0])
      ? segments[1]
      : segments[0];

    const screenMap: Record<string, string> = {
      billing: 'Billing / POS',
      'wholesale-billing': 'Wholesale Billing',
      stock: 'Inventory / Stock',
      products: 'Products',
      purchases: 'Purchases',
      udhar: 'Outstanding / Udhar',
      customers: 'Customers',
      suppliers: 'Suppliers',
      reports: 'Reports & Analytics',
      expenses: 'Expenses',
      staff: 'Staff Management',
      transfers: 'Stock Transfers',
      godowns: 'Warehouses',
      dashboard: 'Dashboard',
      'ai-dashboard': 'AI Dashboard',
    };

    const context = mainSegment || 'dashboard';
    const label = screenMap[context] || context;

    return { screenContext: context, screenLabel: label };
  }, [pathname]);
}
