export type BusinessType = 
  | 'kirana' 
  | 'medical' 
  | 'clothes' 
  | 'shoes' 
  | 'electronics' 
  | 'hardware' 
  | 'cosmetics' 
  | 'general_wholesale';

export interface BusinessConfig {
  id: BusinessType;
  label: string;
  billingLayout: 'standard' | 'medical' | 'garments' | 'wholesale';
  productFields: {
    showExpiry: boolean;
    showBatch: boolean;
    showSizes: boolean;
    showColors: boolean;
    showSerial: boolean;
    showWarranty: boolean;
    showHsn: boolean;
    showWeight: boolean;
  };
  reports: string[];
  importTemplate: string;
}

export const BUSINESS_CONFIGS: Record<BusinessType, BusinessConfig> = {
  kirana: {
    id: 'kirana',
    label: 'Kirana & Grocery',
    billingLayout: 'standard',
    productFields: {
      showExpiry: true,
      showBatch: false,
      showSizes: false,
      showColors: false,
      showSerial: false,
      showWarranty: false,
      showHsn: true,
      showWeight: true,
    },
    reports: ['sales_trend', 'top_products', 'low_stock'],
    importTemplate: 'grocery_template',
  },
  medical: {
    id: 'medical',
    label: 'Pharmacy & Medical',
    billingLayout: 'medical',
    productFields: {
      showExpiry: true,
      showBatch: true,
      showSizes: false,
      showColors: false,
      showSerial: false,
      showWarranty: false,
      showHsn: true,
      showWeight: false,
    },
    reports: ['sales_trend', 'expiry_risk', 'schedule_h_sales'],
    importTemplate: 'medical_template',
  },
  clothes: {
    id: 'clothes',
    label: 'Apparel & Clothes',
    billingLayout: 'garments',
    productFields: {
      showExpiry: false,
      showBatch: false,
      showSizes: true,
      showColors: true,
      showSerial: false,
      showWarranty: false,
      showHsn: true,
      showWeight: false,
    },
    reports: ['sales_trend', 'dead_stock_sizes', 'top_categories'],
    importTemplate: 'garment_template',
  },
  shoes: {
    id: 'shoes',
    label: 'Footwear & Shoes',
    billingLayout: 'garments',
    productFields: {
      showExpiry: false,
      showBatch: false,
      showSizes: true,
      showColors: true,
      showSerial: false,
      showWarranty: false,
      showHsn: true,
      showWeight: false,
    },
    reports: ['sales_trend', 'dead_stock_sizes'],
    importTemplate: 'garment_template',
  },
  electronics: {
    id: 'electronics',
    label: 'Electronics & Mobiles',
    billingLayout: 'standard',
    productFields: {
      showExpiry: false,
      showBatch: false,
      showSizes: false,
      showColors: false,
      showSerial: true,
      showWarranty: true,
      showHsn: true,
      showWeight: false,
    },
    reports: ['sales_trend', 'warranty_claims'],
    importTemplate: 'electronics_template',
  },
  hardware: {
    id: 'hardware',
    label: 'Hardware & Tools',
    billingLayout: 'standard',
    productFields: {
      showExpiry: false,
      showBatch: false,
      showSizes: true,
      showColors: false,
      showSerial: false,
      showWarranty: true,
      showHsn: true,
      showWeight: true,
    },
    reports: ['sales_trend', 'top_products'],
    importTemplate: 'hardware_template',
  },
  cosmetics: {
    id: 'cosmetics',
    label: 'Cosmetics & Beauty',
    billingLayout: 'standard',
    productFields: {
      showExpiry: true,
      showBatch: true,
      showSizes: false,
      showColors: true,
      showSerial: false,
      showWarranty: false,
      showHsn: true,
      showWeight: true,
    },
    reports: ['sales_trend', 'expiry_risk'],
    importTemplate: 'cosmetics_template',
  },
  general_wholesale: {
    id: 'general_wholesale',
    label: 'General Wholesale',
    billingLayout: 'wholesale',
    productFields: {
      showExpiry: true,
      showBatch: true,
      showSizes: false,
      showColors: false,
      showSerial: false,
      showWarranty: false,
      showHsn: true,
      showWeight: true,
    },
    reports: ['sales_trend', 'top_parties', 'outstanding_dues'],
    importTemplate: 'wholesale_template',
  }
};

export const getBusinessConfig = (type: BusinessType | string | null | undefined): BusinessConfig => {
  if (!type || !BUSINESS_CONFIGS[type as BusinessType]) {
    return BUSINESS_CONFIGS['kirana'];
  }
  return BUSINESS_CONFIGS[type as BusinessType];
};
