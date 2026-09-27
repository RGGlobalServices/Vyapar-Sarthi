/**
 * CategoryConfig — type definitions and default seed data.
 *
 * A CategoryConfig drives:
 *   1. Which attributes a product master shows (brand, color, size, batch…)
 *   2. Which axes form separate variant rows in the product table
 *   3. Which fields appear in the billing cart and invoice
 *   4. Whether dual-unit math (Bags × KgPerBag = TotalKg) is needed
 */

export type AttributeType = 'select' | 'text' | 'number' | 'date' | 'boolean';

export interface AttributeDef {
  key: string;           // machine key used in product.variants[] JSON
  label: string;
  labelHi?: string;
  labelMr?: string;
  type: AttributeType;
  required: boolean;
  inVariant: boolean;    // true → separate cart line per distinct value
  options?: string[];    // for type='select'; empty = free-form entry
  placeholder?: string;
}

export interface DualUnitConfig {
  primaryUnit: string;   // e.g. 'Bag', 'Carton', 'Piece'
  secondaryUnit: string; // e.g. 'Kg', 'Unit', 'ml'
  conversionFactor: number; // primaryUnit → secondaryUnit multiplier
  conversionLabel: string;  // e.g. '25 Kg / Bag'
}

export interface CategoryAttributeSchema {
  variantAxes: string[];           // subset of AttributeDef.key values
  attributes: AttributeDef[];
  billingDisplayFields: string[];  // shown as sub-text under product name in cart
  cartColumns: string[];           // column headers rendered in cart table
  showBatch: boolean;
  showExpiry: boolean;
  showSerial: boolean;
  showWarranty: boolean;
  dualUnit: boolean;
  dualUnitConfig?: DualUnitConfig;
}

export interface CategoryConfig {
  id?: string;
  slug: string;
  name: string;
  nameHi?: string;
  nameMr?: string;
  emoji?: string;
  industryCategoryName?: string;
  attributeSchema: CategoryAttributeSchema;
  active: boolean;
  sortOrder: number;
}

// ---------------------------------------------------------------------------
// Default configs — seeded into DB on first run via autoMigrate
// ---------------------------------------------------------------------------

export const DEFAULT_CATEGORY_CONFIGS: CategoryConfig[] = [
  {
    slug: 'footwear',
    name: 'Footwear Wholesale',
    nameHi: 'जूते थोक',
    nameMr: 'पादत्राणे घाऊक',
    emoji: '👟',
    industryCategoryName: 'Footwear Wholesale',
    sortOrder: 1,
    active: true,
    attributeSchema: {
      variantAxes: ['color', 'size'],
      attributes: [
        { key: 'brand',  label: 'Brand',  labelHi: 'ब्रांड', labelMr: 'ब्रँड', type: 'text',   required: false, inVariant: false },
        { key: 'gender', label: 'Gender', labelHi: 'लिंग',   labelMr: 'लिंग',  type: 'select', required: false, inVariant: false, options: ['Men', 'Women', 'Kids', 'Unisex'] },
        { key: 'color',  label: 'Color',  labelHi: 'रंग',    labelMr: 'रंग',   type: 'select', required: true,  inVariant: true,  options: [] },
        { key: 'size',   label: 'Size',   labelHi: 'आकार',   labelMr: 'आकार',  type: 'select', required: true,  inVariant: true,  options: ['5','6','7','8','9','10','11','12'] },
      ],
      billingDisplayFields: ['color', 'size'],
      cartColumns: ['color', 'size'],
      showBatch: false, showExpiry: false, showSerial: false, showWarranty: false,
      dualUnit: false,
    },
  },

  {
    slug: 'garment',
    name: 'Garment Wholesale',
    nameHi: 'वस्त्र थोक',
    nameMr: 'कपडे घाऊक',
    emoji: '👕',
    industryCategoryName: 'Garment Wholesale',
    sortOrder: 2,
    active: true,
    attributeSchema: {
      variantAxes: ['color', 'size'],
      attributes: [
        { key: 'brand',   label: 'Brand',   type: 'text',   required: false, inVariant: false },
        { key: 'gender',  label: 'Gender',  type: 'select', required: false, inVariant: false, options: ['Men', 'Women', 'Kids', 'Unisex'] },
        { key: 'fabric',  label: 'Fabric',  type: 'select', required: false, inVariant: false, options: ['Cotton', 'Polyester', 'Linen', 'Silk', 'Wool', 'Mixed'] },
        { key: 'pattern', label: 'Pattern', type: 'select', required: false, inVariant: false, options: ['Solid', 'Striped', 'Checked', 'Printed', 'Embroidered'] },
        { key: 'season',  label: 'Season',  type: 'select', required: false, inVariant: false, options: ['Summer', 'Winter', 'Monsoon', 'All Season'] },
        { key: 'color',   label: 'Color',   type: 'text',   required: true,  inVariant: true  },
        { key: 'size',    label: 'Size',    type: 'select', required: true,  inVariant: true,  options: ['XS','S','M','L','XL','2XL','3XL','28','30','32','34','36','38','40','42'] },
      ],
      billingDisplayFields: ['color', 'size'],
      cartColumns: ['color', 'size'],
      showBatch: false, showExpiry: false, showSerial: false, showWarranty: false,
      dualUnit: false,
    },
  },

  {
    slug: 'grocery',
    name: 'Grocery Wholesale',
    nameHi: 'किराना थोक',
    nameMr: 'किराणा घाऊक',
    emoji: '🌾',
    industryCategoryName: 'Grocery Wholesale',
    sortOrder: 3,
    active: true,
    attributeSchema: {
      variantAxes: [],
      attributes: [
        { key: 'brand',    label: 'Brand',     type: 'text',   required: false, inVariant: false },
        { key: 'grade',    label: 'Grade',     type: 'text',   required: false, inVariant: false },
        { key: 'variety',  label: 'Variety',   type: 'text',   required: false, inVariant: false },
        { key: 'packType', label: 'Pack Type', type: 'select', required: false, inVariant: false, options: ['Bag', 'Sack', 'Box', 'Pouch', 'Drum', 'Loose'] },
        { key: 'packSize', label: 'Pack Size', type: 'text',   required: false, inVariant: false, placeholder: 'e.g. 25 Kg' },
      ],
      billingDisplayFields: ['grade', 'variety', 'packType'],
      cartColumns: ['packType', 'batch'],
      showBatch: true, showExpiry: true, showSerial: false, showWarranty: false,
      dualUnit: true,
      dualUnitConfig: { primaryUnit: 'Bag', secondaryUnit: 'Kg', conversionFactor: 25, conversionLabel: '25 Kg / Bag' },
    },
  },

  {
    slug: 'fmcg',
    name: 'FMCG Distributor',
    nameHi: 'एफएमसीजी वितरक',
    nameMr: 'एफएमसीजी वितरक',
    emoji: '🛒',
    industryCategoryName: 'FMCG Distributor',
    sortOrder: 4,
    active: true,
    attributeSchema: {
      variantAxes: ['packSize'],
      attributes: [
        { key: 'brand',    label: 'Brand',           type: 'text',   required: false, inVariant: false },
        { key: 'flavour',  label: 'Flavour/Variant',  type: 'text',   required: false, inVariant: false },
        { key: 'packSize', label: 'Pack Size',         type: 'select', required: false, inVariant: true,  options: [] },
        { key: 'packType', label: 'Pack Type',         type: 'select', required: false, inVariant: false, options: ['Piece', 'Box', 'Carton', 'Strip', 'Pouch'] },
        { key: 'mrp',      label: 'MRP',               type: 'number', required: false, inVariant: false },
        { key: 'ptr',      label: 'PTR',               type: 'number', required: false, inVariant: false },
      ],
      billingDisplayFields: ['flavour', 'packSize'],
      cartColumns: ['packSize', 'batch'],
      showBatch: true, showExpiry: true, showSerial: false, showWarranty: false,
      dualUnit: true,
      dualUnitConfig: { primaryUnit: 'Carton', secondaryUnit: 'Piece', conversionFactor: 12, conversionLabel: '12 pcs / carton' },
    },
  },

  {
    slug: 'electronics',
    name: 'Electronics',
    nameHi: 'इलेक्ट्रॉनिक्स',
    nameMr: 'इलेक्ट्रॉनिक्स',
    emoji: '📱',
    industryCategoryName: 'Electronics',
    sortOrder: 5,
    active: true,
    attributeSchema: {
      variantAxes: ['color', 'storage'],
      attributes: [
        { key: 'brand',   label: 'Brand',    type: 'text',   required: false, inVariant: false },
        { key: 'model',   label: 'Model',    type: 'text',   required: false, inVariant: false },
        { key: 'color',   label: 'Color',    type: 'select', required: false, inVariant: true,  options: [] },
        { key: 'storage', label: 'Storage',  type: 'select', required: false, inVariant: true,  options: ['32GB','64GB','128GB','256GB','512GB','1TB'] },
        { key: 'ram',     label: 'RAM',      type: 'select', required: false, inVariant: false, options: ['2GB','3GB','4GB','6GB','8GB','12GB','16GB'] },
        { key: 'serial',  label: 'Serial/IMEI', type: 'text', required: false, inVariant: false },
      ],
      billingDisplayFields: ['color', 'storage', 'serial'],
      cartColumns: ['color', 'storage', 'serial'],
      showBatch: false, showExpiry: false, showSerial: true, showWarranty: true,
      dualUnit: false,
    },
  },

  {
    slug: 'electrical',
    name: 'Electrical Distributor',
    nameHi: 'इलेक्ट्रिकल वितरक',
    nameMr: 'इलेक्ट्रिकल वितरक',
    emoji: '💡',
    industryCategoryName: 'Electrical Distributor',
    sortOrder: 6,
    active: true,
    attributeSchema: {
      variantAxes: ['wattage'],
      attributes: [
        { key: 'brand',      label: 'Brand',            type: 'text',   required: false, inVariant: false },
        { key: 'model',      label: 'Model',            type: 'text',   required: false, inVariant: false },
        { key: 'wattage',    label: 'Wattage',          type: 'select', required: false, inVariant: true,  options: ['5W','7W','9W','12W','15W','18W','24W','36W','60W','100W'] },
        { key: 'voltage',    label: 'Voltage',          type: 'select', required: false, inVariant: false, options: ['12V','24V','110V','220V','240V'] },
        { key: 'colorTemp',  label: 'Color Temp (K)',   type: 'select', required: false, inVariant: false, options: ['2700K','3000K','4000K','5000K','6500K'] },
        { key: 'packSize',   label: 'Pack Size (pcs)',  type: 'number', required: false, inVariant: false },
      ],
      billingDisplayFields: ['wattage', 'voltage'],
      cartColumns: ['wattage'],
      showBatch: false, showExpiry: false, showSerial: false, showWarranty: true,
      dualUnit: false,
    },
  },

  {
    slug: 'medical',
    name: 'Medical / Pharma',
    nameHi: 'मेडिकल / फार्मा',
    nameMr: 'मेडिकल / फार्मा',
    emoji: '💊',
    industryCategoryName: 'Medical / Pharma',
    sortOrder: 7,
    active: true,
    attributeSchema: {
      variantAxes: [],
      attributes: [
        { key: 'manufacturer', label: 'Manufacturer', type: 'text',   required: false, inVariant: false },
        { key: 'composition',  label: 'Composition',  type: 'text',   required: false, inVariant: false },
        { key: 'packSize',     label: 'Pack Size',    type: 'text',   required: false, inVariant: false, placeholder: 'e.g. 10 Tablets' },
        { key: 'packType',     label: 'Pack Type',    type: 'select', required: false, inVariant: false, options: ['Strip','Bottle','Vial','Injection','Cream','Ointment','Syrup','Drops'] },
        { key: 'schedule',     label: 'Schedule',     type: 'select', required: false, inVariant: false, options: ['OTC','Schedule H','Schedule H1','Schedule X','NRx'] },
        { key: 'ptr',          label: 'PTR',          type: 'number', required: false, inVariant: false },
        { key: 'pts',          label: 'PTS',          type: 'number', required: false, inVariant: false },
      ],
      billingDisplayFields: ['composition', 'packSize'],
      cartColumns: ['batch', 'expiry'],
      showBatch: true, showExpiry: true, showSerial: false, showWarranty: false,
      dualUnit: false,
    },
  },

  {
    slug: 'agro',
    name: 'Agro / Seeds / Fertilizer',
    nameHi: 'कृषि / बीज / खाद',
    nameMr: 'कृषी / बियाणे / खत',
    emoji: '🌱',
    industryCategoryName: 'Agro',
    sortOrder: 8,
    active: true,
    attributeSchema: {
      variantAxes: [],
      attributes: [
        { key: 'brand',       label: 'Brand',       type: 'text',   required: false, inVariant: false },
        { key: 'crop',        label: 'Crop',        type: 'text',   required: false, inVariant: false },
        { key: 'variety',     label: 'Variety',     type: 'text',   required: false, inVariant: false },
        { key: 'grade',       label: 'Grade',       type: 'text',   required: false, inVariant: false },
        { key: 'composition', label: 'Composition', type: 'text',   required: false, inVariant: false },
        { key: 'packSize',    label: 'Pack Size',   type: 'text',   required: false, inVariant: false, placeholder: 'e.g. 50 Kg' },
        { key: 'packType',    label: 'Pack Type',   type: 'select', required: false, inVariant: false, options: ['Bag','Bottle','Can','Drum','Loose'] },
      ],
      billingDisplayFields: ['variety', 'grade', 'packSize'],
      cartColumns: ['batch', 'expiry'],
      showBatch: true, showExpiry: true, showSerial: false, showWarranty: false,
      dualUnit: false,
    },
  },

  {
    slug: 'general',
    name: 'General Wholesale',
    nameHi: 'सामान्य थोक',
    nameMr: 'सामान्य घाऊक',
    emoji: '🏪',
    industryCategoryName: null as any,
    sortOrder: 99,
    active: true,
    attributeSchema: {
      variantAxes: [],
      attributes: [
        { key: 'brand', label: 'Brand', type: 'text', required: false, inVariant: false },
      ],
      billingDisplayFields: [],
      cartColumns: [],
      showBatch: false, showExpiry: false, showSerial: false, showWarranty: false,
      dualUnit: false,
    },
  },
];

/** Returns the best-matching config for an industry category name. */
export function getConfigForIndustry(industryCategoryName: string | null | undefined): CategoryConfig {
  if (!industryCategoryName) return DEFAULT_CATEGORY_CONFIGS.find(c => c.slug === 'general')!;
  const lower = industryCategoryName.toLowerCase();
  const hit = DEFAULT_CATEGORY_CONFIGS.find(c =>
    c.industryCategoryName?.toLowerCase() === lower ||
    c.slug === lower ||
    c.name.toLowerCase().includes(lower) ||
    lower.includes(c.slug)
  );
  return hit ?? DEFAULT_CATEGORY_CONFIGS.find(c => c.slug === 'general')!;
}
