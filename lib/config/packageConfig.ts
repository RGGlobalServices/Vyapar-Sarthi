export type PackageType = 'dukan' | 'vyapar' | 'wholesale' | 'badaudyog';

export interface PackageConfig {
  id: PackageType;
  label: string;
  modules: string[];
}

// Package tiers gated to the "wholesale-style" module set (purchases, warehouses,
// party ledger, transfers) — Udyog (general wholesale/distribution) and Bada Udyog
// (manufacturing) both need it, just for different business categories.
export function isWholesaleTierPackage(type: PackageType | string | null | undefined): boolean {
  return type === 'wholesale' || type === 'badaudyog';
}

/**
 * Mill Billing (`mill_v2`: GST-exclusive rates, non-GST charges, round-off) is for the Bada Udyog
 * package ONLY — deliberately narrower than isWholesaleTierPackage, which also covers Wholesale.
 * Server-side callers must pass shop.packageType (never a client-supplied value).
 */
export function isMillBillingPackage(type: PackageType | string | null | undefined): boolean {
  return type === 'badaudyog';
}

export const PACKAGE_CONFIGS: Record<PackageType, PackageConfig> = {
  dukan: {
    id: 'dukan',
    label: 'Dukan Package',
    modules: [
      'dashboard',
      'billing',
      'products',
      'customers',
      'suppliers',
      'purchases',
      'stock',
      'stock-take',
      'expenses',
      'udhar',
      'staff',
      'reports',
      'settings',
      'profile',
      'calendar',
      'returns',
      'referral',
      'dukandar'
    ]
  },
  vyapar: {
    id: 'vyapar',
    label: 'Vyapar Package',
    modules: [
      'dashboard',
      'billing',
      'products',
      'customers',
      'suppliers',
      'purchases',
      'stock',
      'stock-take',
      'expenses',
      'udhar',
      'staff',
      'reports',
      'import',
      'settings',
      'profile',
      'calendar',
      'returns',
      'referral',
      'dukandar'
    ]
  },
  wholesale: {
    id: 'wholesale',
    label: 'Udyog Package',
    modules: [
      'dashboard',
      'orders',
      'challans',
      'billing',
      'products',
      'party',
      'suppliers',
      'warehouses',
      'purchases',
      'stock',
      'stock-take',
      'transfers',
      'expenses',
      'staff',
      'reports',
      'import',
      'settings',
      'profile',
      'calendar',
      'returns',
      'referral',
      'dukandar'
    ]
  },
  badaudyog: {
    id: 'badaudyog',
    label: 'Bada Udyog Package',
    // Full mill / grain-processing feature set. All modules below — core
    // (dashboard, billing, products, party, suppliers, purchases, stock,
    // warehouses, transfers, expenses, staff, returns, reports, import,
    // settings, profile, calendar, referral, dukandar) and mill-specific
    // (gate-entry, weighbridge, transport, dispatch, production, quality-lab,
    // batches, brokers, hamali, machines, maintenance, spare-parts,
    // settlement, documents, outstanding, payments, receipts, ledger,
    // raw-material, finished-goods, by-products, job-work) — ship with real
    // pages, API routes and Prisma models as of 2026-09-11 (gate-entry/
    // weighbridge/batches/quality-lab/raw-material/by-products/job-work
    // under app/api/v1/mill/, transport/dispatch under app/api/v1/logistics/,
    // brokers/machines/maintenance/spare-parts under app/api/v1/management/).
    // None of it is a placeholder; this comment previously said otherwise and
    // was stale. job-work (added 2026-09-14) is intentionally separate from
    // the raw-material/ProductionBatch pipeline — it never touches
    // Product.currentStock or RawMaterialLot, since the mill doesn't own that
    // grain (see app/[locale]/(main)/job-work/page.tsx's header comment).
    modules: [
      // Core (existing)
      'dashboard',
      'billing',
      'products',
      'party',
      'suppliers',
      'purchases',
      'stock',
      'stock-take',
      'warehouses',
      'transfers',
      'expenses',
      'staff',
      'reports',
      'import',
      'settings',
      'profile',
      'calendar',
      'returns',
      'referral',
      'dukandar',
      'orders',
      'challans',
      // Mill Operations
      'gate-entry',
      'weighbridge',
      'production',
      'quality-lab',
      'batches',
      'raw-material',
      'finished-goods',
      'by-products',
      'job-work',
      // Logistics
      'transport',
      'dispatch',
      'hamali',
      // Finance
      'payments',
      'receipts',
      'outstanding',
      'ledger',
      'settlement',
      // Management
      'brokers',
      'machines',
      'maintenance',
      'spare-parts',
      // Documents (v2 scaffold)
      'documents'
    ]
  }
};

export const getPackageConfig = (type: PackageType | string | null | undefined): PackageConfig => {
  if (!type || !PACKAGE_CONFIGS[type as PackageType]) {
    return PACKAGE_CONFIGS['dukan'];
  }
  return PACKAGE_CONFIGS[type as PackageType];
};
