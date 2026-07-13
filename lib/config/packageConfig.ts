export type PackageType = 'dukan' | 'vyapar' | 'wholesale';

export interface PackageConfig {
  id: PackageType;
  label: string;
  modules: string[];
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
      'stock',
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
      'stock',
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
      'billing',
      'products',
      'party',
      'suppliers',
      'warehouses',
      'purchases',
      'stock',
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
  }
};

export const getPackageConfig = (type: PackageType | string | null | undefined): PackageConfig => {
  if (!type || !PACKAGE_CONFIGS[type as PackageType]) {
    return PACKAGE_CONFIGS['dukan'];
  }
  return PACKAGE_CONFIGS[type as PackageType];
};
