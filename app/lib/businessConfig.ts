/**
 * Business Type Configuration
 * Central source of truth for all business-type-specific settings
 */

export type BusinessType =
  | 'kirana'
  | 'medical'
  | 'cosmetics'
  | 'shoes'
  | 'clothes'
  | 'electronics'
  | 'general';

export interface BusinessConfig {
  type: BusinessType;
  label: string;
  labelHi: string;
  labelMr: string;
  emoji: string;
  color: string;         // Tailwind color base class (e.g. 'emerald')
  gradient: string;      // Tailwind gradient classes
  description: string;
  features: string[];    // Feature bullets shown on setup screen
  // Field flags
  hasExpiry: boolean;
  hasExpiryRequired: boolean;   // Mandatory (medical) vs optional (kirana)
  hasBatch: boolean;
  hasDrugSchedule: boolean;
  hasSizes: boolean;
  hasShades: boolean;
  hasWarranty: boolean;
  hasModel: boolean;
  hasGender: boolean;
  hasFabric: boolean;     // Clothes only — fabric/material field
  // Catalog
  defaultCategories: string[];
  defaultUnits: string[];
  productPlaceholder: string;
  productPlaceholderHi?: string;
  productPlaceholderMr?: string;
  sizeChart?: string[];
}

export const BUSINESS_CONFIGS: Record<BusinessType, BusinessConfig> = {
  kirana: {
    type: 'kirana',
    label: 'Kirana / Grocery',
    labelHi: 'किराना / खाद्य',
    labelMr: 'किराणा / किराणा',
    emoji: '🛒',
    color: 'emerald',
    gradient: 'from-emerald-600 to-teal-600',
    description: 'General grocery & FMCG products',
    features: ['Expiry date tracking', 'Weight/volume units', 'Khata (credit) management', 'Low stock alerts'],
    hasExpiry: true,
    hasExpiryRequired: false,
    hasBatch: false,
    hasDrugSchedule: false,
    hasSizes: false,
    hasShades: false,
    hasWarranty: false,
    hasModel: false,
    hasGender: false,
    hasFabric: false,
    defaultCategories: ['Oil', 'Spice', 'Dal', 'Atta', 'Rice', 'Sugar', 'Salt', 'Soap', 'Snacks', 'Dairy'],
    defaultUnits: ['Kg', 'Gram', 'Ltr', 'Packet', 'Box', 'Bottle', 'Unit'],
    productPlaceholder: 'e.g. Tata Salt (1kg)',
    productPlaceholderHi: 'जैसे टाटा नमक (1kg)',
    productPlaceholderMr: 'उदा. टाटा मीठ (1kg)',
  },
  medical: {
    type: 'medical',
    label: 'Medical / Pharmacy',
    labelHi: 'मेडिकल / दवाखाना',
    labelMr: 'मेडिकल / औषधालय',
    emoji: '💊',
    color: 'blue',
    gradient: 'from-blue-600 to-cyan-600',
    description: 'Pharmaceutical products, medicines, health supplies',
    features: ['Expiry date (mandatory)', 'Batch number tracking', 'Drug schedule (OTC/Rx/H1/H2)', 'Expiry alerts dashboard'],
    hasExpiry: true,
    hasExpiryRequired: true,
    hasBatch: true,
    hasDrugSchedule: true,
    hasSizes: false,
    hasShades: false,
    hasWarranty: false,
    hasModel: false,
    hasGender: false,
    hasFabric: false,
    defaultCategories: ['Tablet', 'Syrup', 'Injection', 'Capsule', 'Cream/Ointment', 'Drops', 'Surgical', 'Vitamins', 'Ayurvedic'],
    defaultUnits: ['Strip', 'Bottle', 'Box', 'Vial', 'Tube', 'Packet', 'Unit'],
    productPlaceholder: 'e.g. Paracetamol 500mg',
    productPlaceholderHi: 'जैसे पैरासिटामोल 500mg',
    productPlaceholderMr: 'उदा. पॅरासिटामॉल 500mg',
  },
  cosmetics: {
    type: 'cosmetics',
    label: 'Cosmetics / Beauty',
    labelHi: 'कॉस्मेटिक्स / ब्यूटी',
    labelMr: 'सौंदर्य प्रसाधने',
    emoji: '💄',
    color: 'pink',
    gradient: 'from-pink-600 to-rose-600',
    description: 'Beauty products, skincare, haircare, makeup',
    features: ['Expiry date tracking', 'Shade / color variants', 'Skin type categorization', 'Brand tracking'],
    hasExpiry: true,
    hasExpiryRequired: false,
    hasBatch: false,
    hasDrugSchedule: false,
    hasSizes: false,
    hasShades: true,
    hasWarranty: false,
    hasModel: false,
    hasGender: false,
    hasFabric: false,
    defaultCategories: ['Lipstick', 'Foundation', 'Skincare', 'Haircare', 'Perfume', 'Nail Polish', 'Eye Makeup', 'Moisturizer'],
    defaultUnits: ['Piece', 'Bottle', 'Tube', 'Box', 'Set', 'Packet'],
    productPlaceholder: 'e.g. Lakme Lipstick (Red)',
    productPlaceholderHi: 'जैसे लैक्मे लिपस्टिक (लाल)',
    productPlaceholderMr: 'उदा. लॅक्मे लिपस्टिक (लाल)',
  },
  shoes: {
    type: 'shoes',
    label: 'Shoes / Footwear',
    labelHi: 'जूते / फुटवियर',
    labelMr: 'बूट / फुटवेअर',
    emoji: '👟',
    color: 'amber',
    gradient: 'from-amber-600 to-orange-600',
    description: 'Footwear — shoes, sandals, chappals, boots',
    features: ['Size-wise inventory (UK 5–12)', 'Color & gender tracking', 'Total stock auto-calculated from sizes', 'Size-level low stock alerts'],
    hasExpiry: false,
    hasExpiryRequired: false,
    hasBatch: false,
    hasDrugSchedule: false,
    hasSizes: true,
    hasShades: false,
    hasWarranty: false,
    hasModel: false,
    hasGender: true,
    hasFabric: false,
    defaultCategories: ['Sports Shoes', 'Formal Shoes', 'Sandals', 'Slippers', 'Boots', 'Casual Shoes', 'Kids Shoes'],
    defaultUnits: ['Pair'],
    productPlaceholder: 'e.g. Nike Air Max (UK9)',
    productPlaceholderHi: 'जैसे नाइकी एयर मैक्स (UK9)',
    productPlaceholderMr: 'उदा. नायकी एअर मॅक्स (UK9)',
    sizeChart: ['UK4', 'UK5', 'UK6', 'UK7', 'UK8', 'UK9', 'UK10', 'UK11', 'UK12'],
  },
  clothes: {
    type: 'clothes',
    label: 'Clothes / Textiles',
    labelHi: 'कपड़े / वस्त्र',
    labelMr: 'कपडे / वस्त्र',
    emoji: '👔',
    color: 'violet',
    gradient: 'from-violet-600 to-purple-600',
    description: 'Garments, textiles, readymade clothes',
    features: ['Size-wise stock (XS–XXXL)', 'Color & fabric tracking', 'Gender categorization', 'Size-level stock alerts'],
    hasExpiry: false,
    hasExpiryRequired: false,
    hasBatch: false,
    hasDrugSchedule: false,
    hasSizes: true,
    hasShades: false,
    hasWarranty: false,
    hasModel: false,
    hasGender: true,
    hasFabric: true,
    defaultCategories: ['T-Shirt', 'Shirt', 'Pant', 'Jeans', 'Saree', 'Kurta', 'Dress', 'Jacket', 'Kids Wear'],
    defaultUnits: ['Piece', 'Meter', 'Set'],
    productPlaceholder: 'e.g. Cotton T-Shirt (M)',
    productPlaceholderHi: 'जैसे कॉटन टी-शर्ट (M)',
    productPlaceholderMr: 'उदा. कॉटन टी-शर्ट (M)',
    sizeChart: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
  },
  electronics: {
    type: 'electronics',
    label: 'Electronics',
    labelHi: 'इलेक्ट्रॉनिक्स',
    labelMr: 'इलेक्ट्रॉनिक्स',
    emoji: '⚡',
    color: 'sky',
    gradient: 'from-sky-600 to-blue-600',
    description: 'Electronic goods, appliances, gadgets, accessories',
    features: ['Model number tracking', 'Warranty period management', 'Brand & specs', 'Warranty expiry alerts'],
    hasExpiry: false,
    hasExpiryRequired: false,
    hasBatch: false,
    hasDrugSchedule: false,
    hasSizes: false,
    hasShades: false,
    hasWarranty: true,
    hasModel: true,
    hasGender: false,
    hasFabric: false,
    defaultCategories: ['Mobile', 'Laptop', 'TV', 'Appliances', 'Accessories', 'Audio', 'Camera', 'Wires & Cables'],
    defaultUnits: ['Piece', 'Box', 'Set', 'Unit'],
    productPlaceholder: 'e.g. Samsung Galaxy S23',
    productPlaceholderHi: 'जैसे सैमसंग गैलेक्सी S23',
    productPlaceholderMr: 'उदा. सॅमसंग गॅलेक्सी S23',
  },
  general: {
    type: 'general',
    label: 'General Wholesale',
    labelHi: 'सामान्य थोक',
    labelMr: 'सर्वसाधारण घाऊक',
    emoji: '🏪',
    color: 'slate',
    gradient: 'from-slate-600 to-gray-600',
    description: 'Any other wholesale business',
    features: ['Basic inventory management', 'Stock tracking', 'Udhar / credit management', 'Sales & billing'],
    hasExpiry: false,
    hasExpiryRequired: false,
    hasBatch: false,
    hasDrugSchedule: false,
    hasSizes: false,
    hasShades: false,
    hasWarranty: false,
    hasModel: false,
    hasGender: false,
    hasFabric: false,
    defaultCategories: ['Category 1', 'Category 2', 'General'],
    defaultUnits: ['Piece', 'Box', 'Unit', 'Kg', 'Ltr'],
    productPlaceholder: 'e.g. Product Name',
    productPlaceholderHi: 'जैसे उत्पाद का नाम',
    productPlaceholderMr: 'उदा. उत्पादनाचे नाव',
  },
};

export function getBusinessConfig(type: BusinessType | string): BusinessConfig {
  return BUSINESS_CONFIGS[type as BusinessType] ?? BUSINESS_CONFIGS.general;
}

export const ALL_BUSINESS_TYPES = Object.values(BUSINESS_CONFIGS);
