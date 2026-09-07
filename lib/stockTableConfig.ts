import { getBusinessConfig, MILL_CATEGORIES, type BusinessType } from './businessConfig';
import { formatMillStock, computeStockStatus, STOCK_STATUS_LABELS } from './millStock';

// ── Column Definition ────────────────────────────────────────────
export interface StockColumn {
  key: string;
  labelKey: string;           // i18n key in Stock namespace
  align?: 'left' | 'right' | 'center';
  getValue: (item: any) => any;
  format?: (value: any, item: any) => string;
  exportFormat?: (value: any, item: any) => string;
  type?: 'text' | 'currency' | 'number' | 'date';
  minWidth?: number;
}

// ── Filter Definition ────────────────────────────────────────────
export interface StockFilter {
  key: string;
  labelKey: string;
  allLabelKey: string;
  getOptions: (data: any) => { value: string; label: string }[];
  filterFn: (item: any, value: string) => boolean;
}

// ── KPI Card Definition ──────────────────────────────────────────
export interface StockKPI {
  key: string;
  labelKey: string;
  color: string;
  getValue: (items: any[], data?: any) => string | number;
  icon?: string;
}

// ── Business Type Groups ─────────────────────────────────────────
type BizGroup = 'fashion' | 'footwear' | 'kirana' | 'medical' | 'electronics'
  | 'electric' | 'mill' | 'agro' | 'liquor' | 'general';

const MILL_TYPES: BusinessType[] = [
  'millprocessing', 'ricemill', 'flourmill', 'oilmill', 'foodprocessing',
  'smallmanufacturing',
];

const FASHION_TYPES: BusinessType[] = [
  'clothes', 'boutique', 'garmentwholesale', 'textilewholesale', 'fabricdistributor',
];

const FOOTWEAR_TYPES: BusinessType[] = [
  'shoes', 'footwearwholesale',
];

const KIRANA_TYPES: BusinessType[] = [
  'kirana', 'generalstore', 'fmcgdistributor', 'grocerywholesale', 'kiranawholesale',
];

const MEDICAL_TYPES: BusinessType[] = [
  'medical', 'medicaldistributor', 'pharmaceuticaldistributor',
];

const ELECTRONICS_TYPES: BusinessType[] = [
  'electronics', 'electronicsdistributor', 'electronicswholesale',
];

const ELECTRIC_TYPES: BusinessType[] = [
  'electric', 'electricaldistributor', 'electricalwholesale',
];

const AGRO_TYPES: BusinessType[] = [
  'agrostore', 'agrowholesale', 'seeddistributor', 'fertilizerdistributor',
  'pesticidedistributor', 'organicproducts', 'farmequipment',
];

const LIQUOR_TYPES: BusinessType[] = [
  'liquor', 'wineliquordistributor', 'wineliquorwholesale',
];

export function getBizGroup(businessType: string): BizGroup {
  const bt = businessType as BusinessType;
  if (MILL_TYPES.includes(bt)) return 'mill';
  if (FASHION_TYPES.includes(bt)) return 'fashion';
  if (FOOTWEAR_TYPES.includes(bt)) return 'footwear';
  if (KIRANA_TYPES.includes(bt)) return 'kirana';
  if (MEDICAL_TYPES.includes(bt)) return 'medical';
  if (ELECTRONICS_TYPES.includes(bt)) return 'electronics';
  if (ELECTRIC_TYPES.includes(bt)) return 'electric';
  if (AGRO_TYPES.includes(bt)) return 'agro';
  if (LIQUOR_TYPES.includes(bt)) return 'liquor';
  return 'general';
}

// ── Column Builders ──────────────────────────────────────────────

const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtCur = (n: number) => `₹${fmt(n)}`;

const COL = {
  product: (): StockColumn => ({
    key: 'name', labelKey: 'colProduct', align: 'left',
    getValue: (i) => i.name || '',
    type: 'text',
  }),
  barcode: (): StockColumn => ({
    key: 'barcode', labelKey: 'barcode', align: 'left',
    getValue: (i) => i.barcode || i.sku || '',
    type: 'text',
  }),
  brand: (): StockColumn => ({
    key: 'brand', labelKey: 'colBrand', align: 'left',
    getValue: (i) => i.brand || '',
    type: 'text',
  }),
  category: (): StockColumn => ({
    key: 'category', labelKey: 'colCategory', align: 'left',
    getValue: (i) => i.category || '',
    type: 'text',
  }),
  location: (): StockColumn => ({
    key: 'location', labelKey: 'productLocation', align: 'left',
    getValue: (i) => i.location || '',
    type: 'text',
  }),
  colourSize: (): StockColumn => ({
    key: 'colourSize', labelKey: 'colVariants', align: 'left',
    getValue: (i) => {
      const v = i.variants;
      if (!Array.isArray(v) || v.length === 0) return '';
      const colors = new Set(v.map((x: any) => x.color).filter(Boolean));
      const sizes = new Set(v.map((x: any) => x.size).filter(Boolean));
      return `${colors.size}C × ${sizes.size}S`;
    },
    type: 'text',
  }),
  size: (): StockColumn => ({
    key: 'size', labelKey: 'sizeLabel', align: 'left',
    getValue: (i) => {
      const v = i.variants;
      if (!Array.isArray(v) || v.length === 0) return '';
      const sizes = new Set(v.map((x: any) => x.size).filter(Boolean));
      return sizes.size > 0 ? `${sizes.size} sizes` : '';
    },
    type: 'text',
  }),
  colour: (): StockColumn => ({
    key: 'colour', labelKey: 'colourLabel', align: 'left',
    getValue: (i) => {
      const v = i.variants;
      if (!Array.isArray(v) || v.length === 0) return '';
      const colors = new Set(v.map((x: any) => x.color).filter(Boolean));
      return colors.size > 0 ? `${colors.size} colours` : '';
    },
    type: 'text',
  }),
  currentStock: (): StockColumn => ({
    key: 'currentStock', labelKey: 'colCurrentStock', align: 'right',
    getValue: (i) => i.computedStock ?? i.currentStock ?? 0,
    format: (v) => fmt(v),
    type: 'number',
  }),
  unit: (): StockColumn => ({
    key: 'unit', labelKey: 'colUnit', align: 'left',
    getValue: (i) => i.baseUnit || 'Pcs',
    type: 'text',
  }),
  purchasePrice: (): StockColumn => ({
    key: 'purchasePrice', labelKey: 'purchasePrice', align: 'right',
    getValue: (i) => i.costPrice || i.wholesaleCost || 0,
    format: (v) => fmtCur(v),
    exportFormat: (v) => String(v),
    type: 'currency',
  }),
  mrp: (): StockColumn => ({
    key: 'mrp', labelKey: 'mrpLabel', align: 'right',
    getValue: (i) => i.mrp || 0,
    format: (v) => v > 0 ? fmtCur(v) : '—',
    type: 'currency',
  }),
  sellingPrice: (): StockColumn => ({
    key: 'sellingPrice', labelKey: 'sellingPrice', align: 'right',
    getValue: (i) => i.sellingPrice || 0,
    format: (v) => v > 0 ? fmtCur(v) : '—',
    type: 'currency',
  }),
  partyDisc: (): StockColumn => ({
    key: 'partyDisc', labelKey: 'partyDiscPercent', align: 'right',
    getValue: (i) => {
      const mrp = i.mrp || 0;
      const wp = i.wholesaleCost || i.sellingPrice || 0;
      if (mrp <= 0 || wp <= 0) return 0;
      return ((mrp - wp) / mrp) * 100;
    },
    format: (v) => v > 0 ? `${v.toFixed(1)}%` : '—',
    type: 'number',
  }),
  stockValue: (): StockColumn => ({
    key: 'stockValue', labelKey: 'stockValue', align: 'right',
    getValue: (i) => i.computedValue || ((i.computedStock ?? i.currentStock ?? 0) * (i.costPrice || i.wholesaleCost || 0)),
    format: (v) => fmtCur(v),
    exportFormat: (v) => String(v),
    type: 'currency',
  }),
  warehouse: (): StockColumn => ({
    key: 'warehouse', labelKey: 'warehouse', align: 'left',
    getValue: (i) => {
      const gp = i.godownProducts || i._count?.godownProducts;
      if (typeof gp === 'number') return gp > 0 ? `${gp} loc.` : '';
      if (Array.isArray(gp)) return gp.length > 0 ? `${gp.length} loc.` : '';
      return '';
    },
    type: 'text',
  }),
  // Mill-specific
  millCategory: (): StockColumn => ({
    key: 'millCategory', labelKey: 'colMillCategory', align: 'left',
    getValue: (i) => {
      if (!i.millCategory) return '';
      const cat = MILL_CATEGORIES.find((c) => c.key === i.millCategory);
      return cat?.label || i.millCategory;
    },
    type: 'text',
  }),
  grade: (): StockColumn => ({
    key: 'grade', labelKey: 'colGrade', align: 'left',
    getValue: (i) => i.grade || '',
    type: 'text',
  }),
  variety: (): StockColumn => ({
    key: 'variety', labelKey: 'colVariety', align: 'left',
    getValue: (i) => i.variety || '',
    type: 'text',
  }),
  batch: (): StockColumn => ({
    key: 'batch', labelKey: 'batch', align: 'left',
    getValue: (i) => i.batch_number || '',
    type: 'text',
  }),
  expiry: (): StockColumn => ({
    key: 'expiry', labelKey: 'expiry', align: 'left',
    getValue: (i) => i.expiryDate || '',
    format: (v) => v ? new Date(v).toLocaleDateString('en-IN') : '',
    type: 'date',
  }),
  packSize: (): StockColumn => ({
    key: 'packSize', labelKey: 'colPackSize', align: 'left',
    getValue: (i) => {
      if (!i.packSize) return '';
      return `${i.packSize} ${i.packUnit || ''}`.trim();
    },
    type: 'text',
  }),
  bags: (): StockColumn => ({
    key: 'bags', labelKey: 'colBags', align: 'right',
    getValue: (i) => {
      if (!i.packSize || i.packSize <= 0) return '';
      return i.computedStock ?? i.currentStock ?? 0;
    },
    format: (v) => v !== '' ? fmt(v) : '',
    type: 'number',
  }),
  weight: (): StockColumn => ({
    key: 'weight', labelKey: 'colWeight', align: 'right',
    getValue: (i) => {
      const stock = i.computedStock ?? i.currentStock ?? 0;
      if (i.packSize && i.packSize > 0) return stock * i.packSize;
      return stock;
    },
    format: (v, i) => {
      const unit = i.packUnit || i.baseUnit || 'Kg';
      return `${fmt(v)} ${unit}`;
    },
    type: 'number',
  }),
  // Electronics-specific
  model: (): StockColumn => ({
    key: 'model', labelKey: 'colModel', align: 'left',
    getValue: (i) => i.model_number || '',
    type: 'text',
  }),
  warranty: (): StockColumn => ({
    key: 'warranty', labelKey: 'colWarranty', align: 'left',
    getValue: (i) => i.warranty_months ? `${i.warranty_months}m` : '',
    type: 'text',
  }),
  minStock: (): StockColumn => ({
    key: 'minStock', labelKey: 'colMinLevel', align: 'right',
    getValue: (i) => i.minStock || i.reorderLevel || 0,
    format: (v) => v > 0 ? fmt(v) : '—',
    type: 'number',
  }),
};

// ── Column Sets per Business Group ───────────────────────────────

function getColumnKeys(group: BizGroup): StockColumn[] {
  switch (group) {
    case 'fashion':
      return [
        COL.product(), COL.barcode(), COL.brand(), COL.category(),
        COL.colour(), COL.size(), COL.currentStock(), COL.unit(),
        COL.purchasePrice(), COL.stockValue(),
      ];
    case 'footwear':
      return [
        COL.product(), COL.barcode(), COL.brand(), COL.category(),
        COL.size(), COL.colour(), COL.currentStock(), COL.unit(),
        COL.purchasePrice(), COL.stockValue(),
      ];
    case 'kirana':
      return [
        COL.product(), COL.barcode(), COL.category(), COL.brand(),
        COL.batch(), COL.expiry(), COL.packSize(),
        COL.currentStock(), COL.unit(), COL.purchasePrice(), COL.mrp(),
        COL.stockValue(),
      ];
    case 'medical':
      return [
        COL.product(), COL.barcode(), COL.brand(), COL.category(),
        COL.batch(), COL.expiry(), COL.packSize(),
        COL.currentStock(), COL.unit(), COL.mrp(), COL.purchasePrice(),
        COL.stockValue(),
      ];
    case 'electronics':
      return [
        COL.product(), COL.barcode(), COL.brand(), COL.model(),
        COL.warranty(), COL.currentStock(), COL.unit(),
        COL.purchasePrice(), COL.stockValue(),
      ];
    case 'electric':
      return [
        COL.product(), COL.barcode(), COL.brand(), COL.category(),
        COL.model(), COL.currentStock(), COL.unit(),
        COL.purchasePrice(), COL.stockValue(),
      ];
    case 'mill':
      return [
        COL.product(), COL.barcode(), COL.millCategory(), COL.category(),
        COL.grade(), COL.variety(), COL.batch(),
        COL.bags(), COL.weight(), COL.unit(), COL.warehouse(),
        COL.purchasePrice(), COL.stockValue(),
      ];
    case 'agro':
      return [
        COL.product(), COL.barcode(), COL.category(), COL.brand(),
        COL.batch(), COL.expiry(), COL.packSize(),
        COL.currentStock(), COL.unit(), COL.purchasePrice(),
        COL.stockValue(),
      ];
    case 'liquor':
      return [
        COL.product(), COL.barcode(), COL.brand(), COL.category(),
        COL.batch(), COL.packSize(), COL.currentStock(), COL.unit(),
        COL.purchasePrice(), COL.mrp(), COL.stockValue(),
      ];
    case 'general':
    default:
      return [
        COL.product(), COL.barcode(), COL.category(), COL.brand(),
        COL.currentStock(), COL.unit(), COL.location(),
        COL.purchasePrice(), COL.stockValue(),
      ];
  }
}

// ── Filter Sets per Business Group ───────────────────────────────

function getFilterKeys(group: BizGroup): string[] {
  switch (group) {
    case 'fashion':
    case 'footwear':
      return ['category', 'brand', 'warehouse', 'status'];
    case 'kirana':
    case 'agro':
    case 'liquor':
      return ['category', 'brand', 'warehouse', 'status'];
    case 'medical':
      return ['category', 'brand', 'warehouse', 'status'];
    case 'electronics':
    case 'electric':
      return ['category', 'brand', 'warehouse', 'status'];
    case 'mill':
      return ['millCategory', 'category', 'grade', 'warehouse', 'status'];
    default:
      return ['category', 'warehouse', 'status'];
  }
}

// ── KPI Sets per Business Group ──────────────────────────────────

function getKPIKeys(group: BizGroup): StockKPI[] {
  const common: StockKPI[] = [
    {
      key: 'available', labelKey: 'available', color: 'emerald',
      getValue: (items) => items.filter(i => (i.computedStock ?? i.currentStock ?? 0) > 0).length,
    },
    {
      key: 'lowStock', labelKey: 'lowStock', color: 'amber',
      getValue: (items) => items.filter(i => {
        const s = i.computedStock ?? i.currentStock ?? 0;
        const min = i.reorderLevel || i.minStock || 0;
        return s > 0 && min > 0 && s <= min;
      }).length,
    },
    {
      key: 'outOfStock', labelKey: 'outOfStock', color: 'rose',
      getValue: (items) => items.filter(i => (i.computedStock ?? i.currentStock ?? 0) <= 0).length,
    },
    {
      key: 'stockValue', labelKey: 'stockValue', color: 'blue',
      getValue: (items) => {
        const total = items.reduce((sum, i) => {
          const stock = i.computedStock ?? i.currentStock ?? 0;
          const cost = i.costPrice || i.wholesaleCost || 0;
          return sum + (i.computedValue || stock * cost);
        }, 0);
        return `₹${total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
      },
    },
  ];

  if (group === 'mill') {
    return [
      ...common,
      {
        key: 'totalWeight', labelKey: 'kpiTotalWeight', color: 'purple',
        getValue: (items) => {
          const total = items.reduce((sum, i) => {
            const stock = i.computedStock ?? i.currentStock ?? 0;
            const w = (i.packSize && i.packSize > 0) ? stock * i.packSize : stock;
            return sum + w;
          }, 0);
          return `${total.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Kg`;
        },
      },
      {
        key: 'totalBags', labelKey: 'kpiTotalBags', color: 'indigo',
        getValue: (items) => {
          const total = items.reduce((sum, i) => {
            if (!i.packSize || i.packSize <= 0) return sum;
            return sum + (i.computedStock ?? i.currentStock ?? 0);
          }, 0);
          return `${total.toLocaleString('en-IN')} Bags`;
        },
      },
    ];
  }

  if (group === 'medical' || group === 'kirana') {
    return [
      ...common,
      {
        key: 'nearExpiry', labelKey: 'nearExpiry', color: 'orange',
        getValue: (items) => {
          const now = new Date();
          const threshold = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
          return items.filter(i => {
            if (!i.expiryDate) return false;
            const exp = new Date(i.expiryDate);
            return exp <= threshold && exp >= now;
          }).length;
        },
      },
    ];
  }

  return common;
}

// ── Main Config Function ─────────────────────────────────────────

export interface StockTableConfig {
  group: BizGroup;
  columns: StockColumn[];
  filterKeys: string[];
  kpis: StockKPI[];
  showPartyDisc: boolean;
  showMRP: boolean;
  showBatchExpiry: boolean;
  showColourSize: boolean;
  showMillFields: boolean;
  showWarehouse: boolean;
}

export function getStockTableConfig(businessType: string): StockTableConfig {
  const group = getBizGroup(businessType);
  const bizConfig = getBusinessConfig(businessType as BusinessType);

  return {
    group,
    columns: getColumnKeys(group),
    filterKeys: getFilterKeys(group),
    kpis: getKPIKeys(group),
    showPartyDisc: group === 'fashion' || group === 'footwear' || group === 'general',
    showMRP: group === 'kirana' || group === 'medical' || group === 'liquor',
    showBatchExpiry: bizConfig.hasBatch || bizConfig.hasExpiry || group === 'mill',
    showColourSize: bizConfig.hasColors || bizConfig.hasSizes || false,
    showMillFields: group === 'mill',
    showWarehouse: true,
    showWarranty: group === 'electronics' || group === 'electric',
  } as StockTableConfig;
}

// ── Export Column Helper ─────────────────────────────────────────
export function getExportColumns(config: StockTableConfig): { key: string; label: string; type?: string }[] {
  return config.columns.map(col => ({
    key: col.key,
    label: col.labelKey,
    type: col.type,
  }));
}

// Re-export for convenience
export { formatMillStock, computeStockStatus, STOCK_STATUS_LABELS, MILL_CATEGORIES };
