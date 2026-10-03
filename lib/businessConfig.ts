/**
 * Business Type Configuration
 * Central source of truth for all business-type-specific settings
 */

import { PackageType } from './config/packageConfig';

export type BusinessType =
  | 'kirana'
  | 'generalstore'
  | 'medical'
  | 'boutique'
  | 'shoes'
  | 'clothes'
  | 'electric'
  | 'electronics'
  | 'liquor'
  | 'millprocessing'
  | 'ricemill'
  | 'flourmill'
  | 'oilmill'
  | 'foodprocessing'
  | 'smallmanufacturing'
  | 'agrostore'
  | 'agrowholesale'
  | 'seeddistributor'
  | 'fertilizerdistributor'
  | 'pesticidedistributor'
  | 'organicproducts'
  | 'farmequipment'
  | 'general'
  | 'fmcgdistributor'
  | 'electricaldistributor'
  | 'electricalwholesale'
  | 'medicaldistributor'
  | 'textilewholesale'
  | 'grocerywholesale'
  | 'kiranawholesale'
  | 'garmentwholesale'
  | 'fabricdistributor'
  | 'footwearwholesale'
  | 'pharmaceuticaldistributor'
  | 'electronicsdistributor'
  | 'electronicswholesale'
  | 'wineliquordistributor'
  | 'wineliquorwholesale'
  | 'cosmeticsdistributor'
  | 'beautywholesale'
  // Added for the Industry Category wizard (Profile → "Change Business
  // Category") — see schema.prisma's IndustryCategory model comment. These
  // give a real BusinessType (and so real units/fields) to categories that
  // previously had no equivalent in this list at all.
  | 'accountingca'
  | 'interiordesign'
  | 'salonspa'
  | 'repairservices'
  | 'restauranthotel'
  | 'laundryservice'
  | 'coachingtraining'
  | 'rentingleasing'
  | 'fitnesscenter'
  | 'realestate'
  | 'ngotrust'
  | 'toursandtravel'
  | 'autoparts'
  | 'constructionmaterials'
  | 'furniture'
  | 'jewellery'
  | 'hardware'
  | 'paperproducts'
  | 'sweetbakery'
  | 'giftstoys'
  | 'petrolstation'
  | 'oilgas';

// Top-level groups shown as sections wherever a shopkeeper picks a business
// type (signup, profile, add-shop). Retail + Agro are everyday shop-counter
// businesses that fit the Dukan / Vyapar packages; Manufacturing needs Bada
// Udyog; the Udyog package itself is split into fine-grained wholesale/
// distribution trade sections (FMCG & Grocery, Textile & Garments, Footwear,
// Medical & Pharma, Electrical, Electronics, Wine & Liquor, Cosmetics &
// Beauty) rather than one catch-all "Wholesale" bucket.
export type BusinessCategory =
  | 'retail'
  | 'agro'
  | 'manufacturing'
  | 'fmcg_grocery'
  | 'textile_garments'
  | 'footwear_wholesale'
  | 'medical_pharma'
  | 'electrical_wholesale'
  | 'electronics_wholesale'
  | 'liquor_wholesale'
  | 'cosmetics_wholesale'
  // Service businesses (Salon, Coaching, Repairs, Real Estate, …) — added
  // for the Industry Category wizard's 12 new service-type BusinessConfigs.
  | 'service';

export interface BusinessCategoryMeta {
  id: BusinessCategory;
  label: string;
  labelHi: string;
  labelMr: string;
  emoji: string;
  suggestedPackageLabel: string; // shown as a hint under the section header
}

export const BUSINESS_CATEGORIES: Record<BusinessCategory, BusinessCategoryMeta> = {
  retail: {
    id: 'retail',
    label: 'Retail Businesses',
    labelHi: 'खुदरा व्यवसाय',
    labelMr: 'किरकोळ व्यवसाय',
    emoji: '🏪',
    suggestedPackageLabel: 'Dukan / Vyapar Package',
  },
  agro: {
    id: 'agro',
    label: 'Agro Business',
    labelHi: 'कृषि व्यवसाय',
    labelMr: 'कृषी व्यवसाय',
    emoji: '🌾',
    // Mixed tier: retail-facing agro types (Agro Retail Store, Organic
    // Products, Farm Equipment) are Dukan/Vyapar; distributor/wholesale
    // agro types (Agro Wholesale, Seed/Fertilizer/Pesticide Distributor)
    // are Udyog — see each type's own defaultPackage, not this label.
    suggestedPackageLabel: 'Dukan/Vyapar (retail) or Udyog (distributor)',
  },
  manufacturing: {
    id: 'manufacturing',
    label: 'Manufacturing',
    labelHi: 'विनिर्माण',
    labelMr: 'उत्पादन',
    emoji: '🏭',
    suggestedPackageLabel: 'Bada Udyog Package (₹4999+GST)',
  },
  fmcg_grocery: {
    id: 'fmcg_grocery',
    label: 'FMCG & Grocery',
    labelHi: 'एफएमसीजी और किराना',
    labelMr: 'एफएमसीजी आणि किराणा',
    emoji: '📦',
    suggestedPackageLabel: 'Udyog Package',
  },
  textile_garments: {
    id: 'textile_garments',
    label: 'Textile & Garments',
    labelHi: 'कपड़ा और परिधान',
    labelMr: 'कापड आणि वस्त्र',
    emoji: '👕',
    suggestedPackageLabel: 'Udyog Package',
  },
  footwear_wholesale: {
    id: 'footwear_wholesale',
    label: 'Footwear',
    labelHi: 'फुटवियर',
    labelMr: 'फुटवेअर',
    emoji: '👟',
    suggestedPackageLabel: 'Udyog Package',
  },
  medical_pharma: {
    id: 'medical_pharma',
    label: 'Medical & Pharma',
    labelHi: 'मेडिकल और फार्मा',
    labelMr: 'मेडिकल आणि फार्मा',
    emoji: '💊',
    suggestedPackageLabel: 'Udyog Package',
  },
  electrical_wholesale: {
    id: 'electrical_wholesale',
    label: 'Electrical',
    labelHi: 'इलेक्ट्रिकल',
    labelMr: 'इलेक्ट्रिकल',
    emoji: '⚡',
    suggestedPackageLabel: 'Udyog Package',
  },
  electronics_wholesale: {
    id: 'electronics_wholesale',
    label: 'Electronics',
    labelHi: 'इलेक्ट्रॉनिक्स',
    labelMr: 'इलेक्ट्रॉनिक्स',
    emoji: '📱',
    suggestedPackageLabel: 'Udyog Package',
  },
  liquor_wholesale: {
    id: 'liquor_wholesale',
    label: 'Wine & Liquor',
    labelHi: 'वाइन और शराब',
    labelMr: 'वाईन आणि दारू',
    emoji: '🍷',
    suggestedPackageLabel: 'Udyog Package',
  },
  cosmetics_wholesale: {
    id: 'cosmetics_wholesale',
    label: 'Cosmetics & Beauty',
    labelHi: 'सौंदर्य प्रसाधन',
    labelMr: 'सौंदर्य प्रसाधने',
    emoji: '💄',
    suggestedPackageLabel: 'Udyog Package',
  },
  service: {
    id: 'service',
    label: 'Service Businesses',
    labelHi: 'सेवा व्यवसाय',
    labelMr: 'सेवा व्यवसाय',
    emoji: '🧰',
    suggestedPackageLabel: 'Dukan / Vyapar Package',
  },
};

const KNOWN_PACKAGES: PackageType[] = ['dukan', 'vyapar', 'wholesale', 'badaudyog'];

// Whether a business type (identified by its own defaultPackage) is visible
// to an account on the given package. Filtering happens per TYPE, not per
// whole category — categories are a display grouping only. Agro in
// particular mixes tiers: Agro Retail Store/Organic Products/Farm Equipment
// default to 'dukan' (shown to Dukan AND Vyapar accounts, which share the
// same shop-counter catalogue), while Agro Wholesale/Seed/Fertilizer/
// Pesticide Distributor default to 'wholesale' (Udyog only).
function packageAllowsType(accountPackage: PackageType, typeDefaultPackage: PackageType | undefined): boolean {
  const pkg = typeDefaultPackage || 'dukan';
  if (accountPackage === 'vyapar') return pkg === 'dukan' || pkg === 'vyapar';
  return pkg === accountPackage;
}

/**
 * BUSINESS_TYPES_BY_CATEGORY filtered down to the individual types a
 * package unlocks (per-type, via each config's defaultPackage — not a
 * blanket per-category cut, since Agro itself spans two tiers). Strictly
 * package-scoped — a Udyog account gets Wholesale/Distributor types only,
 * never a stray Retail category section. Groups that end up empty are
 * omitted entirely. Callers that need to handle a shop whose *current* type
 * doesn't belong to its current package (a legacy mismatch) should check
 * isBusinessTypeAllowedForPackage() themselves and surface that case
 * explicitly, rather than this function silently keeping it in the list.
 */
export function getBusinessTypesForPackage(packageType: PackageType | string | null | undefined): { meta: BusinessCategoryMeta; types: BusinessConfig[] }[] {
  const accountPackage = KNOWN_PACKAGES.includes(packageType as PackageType) ? (packageType as PackageType) : null;
  if (!accountPackage) return BUSINESS_TYPES_BY_CATEGORY;
  return BUSINESS_TYPES_BY_CATEGORY
    .map(g => ({
      meta: g.meta,
      types: g.types.filter(c => packageAllowsType(accountPackage, c.defaultPackage)),
    }))
    .filter(g => g.types.length > 0);
}

/**
 * Whether a specific business type belongs to what the given package
 * unlocks. A hidden type (e.g. the legacy catch-all 'general') is never
 * "allowed" even if its defaultPackage matches — it stays fully functional
 * via getBusinessConfig() for shops that already have it, but is never
 * offered going forward, so pickers should always treat it as a mismatch
 * needing a replacement, not a valid selection.
 */
export function isBusinessTypeAllowedForPackage(type: string, packageType: PackageType | string | null | undefined): boolean {
  const config = getBusinessConfig(type);
  if (config.hidden) return false;
  const accountPackage = KNOWN_PACKAGES.includes(packageType as PackageType) ? (packageType as PackageType) : null;
  if (!accountPackage) return true;
  return packageAllowsType(accountPackage, config.defaultPackage);
}

export const BUSINESS_CATEGORY_ORDER: BusinessCategory[] = [
  'retail', 'service', 'agro', 'manufacturing',
  'fmcg_grocery', 'textile_garments', 'footwear_wholesale', 'medical_pharma',
  'electrical_wholesale', 'electronics_wholesale', 'liquor_wholesale', 'cosmetics_wholesale',
];

export interface BusinessConfig {
  type: BusinessType;
  category: BusinessCategory;
  label: string;
  labelHi: string;
  labelMr: string;
  emoji: string;
  color: string;         // Tailwind color base class (e.g. 'emerald')
  gradient: string;      // Tailwind gradient classes
  description: string;
  features: string[];    // Feature bullets shown on setup screen
  // Excluded from every picker (signup/profile/add-shop) while remaining
  // fully valid via getBusinessConfig() — for types being phased out
  // (e.g. 'general') without breaking shops that still have them set.
  hidden?: boolean;
  // Field flags
  hasExpiry: boolean;
  hasExpiryRequired: boolean;
  hasBatch: boolean;
  hasDrugSchedule: boolean;
  hasSizes: boolean;
  hasShades: boolean;
  hasWarranty: boolean;
  hasModel: boolean;
  hasGender: boolean;
  hasFabric: boolean;     // Clothes/Boutique
  hasWireSpecs: boolean;  // Electric
  hasVoltWatt: boolean;   // Electric
  hasSoleMaterial: boolean; // Shoes
  hasLiquorSpecs?: boolean;  // Liquor — brand, volume, alcohol %, bottle type + case⇄bottle conversion
  defaultCategories: string[];
  // Optional grouped view of the same suggestions, for a nicer picker UI
  // (section headers instead of one flat list). When present, the picker
  // renders groups; `defaultCategories` still carries the flattened union
  // for any consumer that only wants a plain list (search matching, etc).
  categoryGroups?: CategoryGroup[];
  defaultUnits: string[];
  productPlaceholder: string;
  productPlaceholderHi?: string;
  productPlaceholderMr?: string;
  sizeChart?: string[];
  hasColors?: boolean;     // Colour × size matrix (clothes / shoes / boutique)
  colorChart?: string[];
  // Spec matrix (electric / electronics) — opt-in per product. The actual dimensions are
  // resolved from the product's CATEGORY via getCategoryVariantSpec(), not a fixed list,
  // so a Battery gets type × capacity, a Bulb gets type × watt, a Wire gets material × gauge…
  hasSpecs?: boolean;
  defaultPackage?: PackageType;
}

// A curated, professional starting taxonomy for the Product "Category"
// field — organized by what the item IS in a mill's ledger (raw grain vs.
// pulse vs. oil seed vs. finished product vs. by-product vs. waste vs.
// packaging), not by any specific mill's name. Every group carries an
// "Other …" entry so a shopkeeper can still type past this list for a mill
// type not explicitly covered; this only changes the SUGGESTION list shown
// while typing — Category itself stays a free-text field, so nothing here
// restricts what can actually be saved.
export interface CategoryGroup {
  label: string;
  options: string[];
}

export const MILL_CATEGORY_GROUPS: CategoryGroup[] = [
  { label: 'Grains', options: ['Paddy', 'Wheat', 'Maize', 'Jowar', 'Bajra', 'Ragi', 'Barnyard Millet', 'Other Millet', 'Other Grain'] },
  { label: 'Pulses / Dal Raw Materials', options: ['Tur', 'Chana', 'Moong', 'Urad', 'Masoor', 'Other Pulses'] },
  { label: 'Oil Seeds', options: ['Groundnut', 'Mustard Seed', 'Sesame', 'Sunflower Seed', 'Other Oil Seeds'] },
  { label: 'Processed Products', options: ['Rice', 'Flour', 'Atta', 'Maida', 'Suji / Rava', 'Dal', 'Millet Products', 'Other Finished Food Products'] },
  { label: 'By-Products', options: ['Bran', 'Husk', 'Broken Grain', 'Broken Rice', 'Broken Dal', 'Oil Cake', 'Other By-Product'] },
  { label: 'Waste / Rejection', options: ['Dust', 'Rejected Grain', 'Foreign Material', 'Processing Waste', 'Other Waste'] },
  { label: 'Packaging', options: ['PP Bag', 'Gunny Bag', 'Pouch', 'Label', 'Carton', 'Other Packaging'] },
];

export const BUSINESS_CONFIGS: Record<BusinessType, BusinessConfig> = {
  kirana: {
    type: 'kirana',
    category: 'retail',
    label: 'Kirana / Grocery',
    labelHi: 'किराना / खाद्य',
    labelMr: 'किराणा / किराणा',
    emoji: '🛒',
    color: 'emerald',
    gradient: 'from-emerald-600 to-teal-600',
    description: 'General grocery & FMCG products',
    features: ['Expiry date tracking', 'Weight/volume units', 'Khata (credit) management', 'Low stock alerts', 'Net weight / volume sizes'],
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
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: false,
    defaultCategories: [
      'Atta & Flours', 'Rice & Rice Products', 'Dals & Pulses', 'Edible Oils', 'Ghee', 
      'Sugar & Jaggery', 'Salt', 'Spices & Masalas', 'Dry Fruits & Nuts',
      'Tea', 'Coffee', 'Health Drinks & Supplements', 'Juices & Fruit Drinks', 
      'Soft Drinks & Soda', 'Water',
      'Biscuits & Cookies', 'Namkeen & Snacks', 'Noodles, Pasta & Vermicelli', 
      'Chocolates & Candies', 'Breakfast Cereals', 'Ready to Cook & Eat', 
      'Jams, Honey & Spreads', 'Sauces & Ketchup', 'Pickles & Chutney', 'Papad',
      'Milk & Milk Products', 'Butter & Cheese', 'Paneer', 'Breads & Buns', 'Bakery Snacks',
      'Bath & Body Wash', 'Hair Care (Shampoo & Oils)', 'Skin Care', 'Oral Care (Toothpaste)', 
      'Deodorants & Perfumes', 'Shaving Needs', 'Feminine Hygiene', 'Health & Pharma',
      'Detergents & Laundry', 'Dishwash', 'Floor & Toilet Cleaners', 'Repellents & Fresheners', 
      'Pooja Needs', 'Paper & Disposables', 'Shoe Care',
      'Baby Food', 'Baby Diapers & Wipes', 'Baby Skin & Hair Care',
      'Pet Food', 'Stationery', 'General'
    ],
    defaultUnits: ['Kg', 'Gram', 'Ltr', 'ML', 'Packet', 'Box', 'Bottle', 'Piece', 'Dozen', 'Pouch', 'Carton', 'Sachet', 'Tube', 'Can', 'Bundle', 'Unit'],
    productPlaceholder: 'e.g. Tata Salt (1kg)',
    productPlaceholderHi: 'जैसे टाटा नमक (1kg)',
    productPlaceholderMr: 'उदा. टाटा मीठ (1kg)',
    sizeChart: ['10g', '50g', '100g', '250g', '500g', '1kg', '5kg', '10kg', '50ml', '100ml', '200ml', '500ml', '1L'],
    defaultPackage: 'dukan',
  },
  medical: {
    type: 'medical',
    category: 'retail',
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
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: false,
    hasSpecs: true,
    defaultCategories: ['Tablet', 'Capsule', 'Syrup', 'Suspension', 'Injection', 'Drops', 'Cream/Ointment', 'Gel', 'Inhaler', 'Powder', 'Sachet', 'Vitamins', 'Supplements', 'Ayurvedic', 'Surgical', 'General'],
    defaultUnits: ['Strip', 'Bottle', 'Box', 'Vial', 'Tube', 'Packet', 'Unit'],
    productPlaceholder: 'e.g. Paracetamol 500mg',
    productPlaceholderHi: 'जैसे पैरासिटामोल 500mg',
    productPlaceholderMr: 'उदा. पॅरासिटामॉल 500mg',
    defaultPackage: 'dukan',
  },
  boutique: {
    type: 'boutique',
    category: 'retail',
    label: 'Boutique / Cosmetics',
    labelHi: 'बुटीक / कॉस्मेटिक्स',
    labelMr: 'बुटीक / सौंदर्य प्रसाधने',
    emoji: '💄',
    color: 'pink',
    gradient: 'from-pink-600 to-rose-600',
    description: 'Cosmetics, beauty & personal care products',
    features: ['Shade & finish variants', 'Volume / weight sizes', 'Expiry tracking', 'Per-shade pricing'],
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
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: false,
    // Category-driven cosmetics: lipstick → finish × shade, perfume → volume, skincare → volume.
    hasSpecs: true,
    defaultCategories: ['Lipstick', 'Lip Gloss', 'Foundation', 'Concealer', 'Compact', 'Nail Polish', 'Kajal', 'Eyeliner', 'Mascara', 'Eyeshadow', 'Perfume', 'Deodorant', 'Skincare', 'Face Wash', 'Moisturizer', 'Sunscreen', 'Serum', 'Hair Oil', 'Shampoo', 'Accessories'],
    defaultUnits: ['Piece', 'Bottle', 'Set'],
    productPlaceholder: 'e.g. Matte Lipstick / Rose Perfume',
    productPlaceholderHi: 'जैसे मैट लिपस्टिक / परफ्यूम',
    productPlaceholderMr: 'उदा. मॅट लिपस्टिक / परफ्यूम',
    defaultPackage: 'dukan',
  },
  shoes: {
    type: 'shoes',
    category: 'retail',
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
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: true,
    defaultCategories: ['Sports Shoes', 'Formal Shoes', 'Sandals', 'Slippers', 'Boots', 'Casual Shoes', 'Kids Shoes'],
    defaultUnits: ['Pair'],
    productPlaceholder: 'e.g. Nike Air Max (UK/IND 9)',
    productPlaceholderHi: 'जैसे नाइकी एयर मैक्स (UK/IND 9)',
    productPlaceholderMr: 'उदा. नायकी एअर मॅक्स (UK/IND 9)',
    // UK and Indian shoe sizes are numerically identical — labelling both keeps
    // the size chart unambiguous for shopkeepers used to either convention.
    // The slash has no spaces around it so the composite "Colour / Size" key
    // splitter (indexOf(' / ')) still parses cleanly.
    sizeChart: ['UK/IND 4', 'UK/IND 5', 'UK/IND 6', 'UK/IND 7', 'UK/IND 8', 'UK/IND 9', 'UK/IND 10', 'UK/IND 11', 'UK/IND 12'],
    hasColors: true,
    colorChart: ['Black', 'White', 'Brown', 'Tan', 'Blue', 'Red', 'Grey', 'Navy'],
    defaultPackage: 'dukan',
  },
  clothes: {
    type: 'clothes',
    category: 'retail',
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
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: false,
    defaultCategories: [
      'T-Shirt', 'Shirt', 'Jeans', 'Trousers / Pants', 'Track Pants', 'Shorts',
      'Kurta', 'Saree', 'Dress', 'Top', 'Skirt', 'Blazer', 'Suit', 'Jacket', 'Sweater',
      'Innerwear', 'Nightwear', 'Kids Wear', 'School Uniform', 'Sportswear', 'Ethnic Wear',
      'Pant Piece', 'Shirt Piece', 'Dress Material', 'Other',
    ],
    defaultUnits: ['Piece', 'Meter', 'Set'],
    productPlaceholder: 'e.g. Cotton T-Shirt (M)',
    productPlaceholderHi: 'जैसे कॉटन टी-शर्ट (M)',
    productPlaceholderMr: 'उदा. कॉटन टी-शर्ट (M)',
    sizeChart: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
    hasColors: true,
    colorChart: ['Black', 'White', 'Red', 'Blue', 'Green', 'Yellow', 'Pink', 'Grey', 'Maroon', 'Navy'],
    defaultPackage: 'dukan',
  },
  electric: {
    type: 'electric',
    category: 'retail',
    label: 'Electric / Hardware',
    labelHi: 'इलेक्ट्रिक / हार्डवेयर',
    labelMr: 'इलेक्ट्रिक / हार्डवेअर',
    emoji: '🔌',
    color: 'yellow',
    gradient: 'from-yellow-500 to-orange-500',
    description: 'Electrical hardware, wires, switches, bulbs, screws',
    features: ['Wire specs (MM/Type)', 'Voltage & Wattage', 'Bulk & loose inventory', 'Hardware brands'],
    hasExpiry: false,
    hasExpiryRequired: false,
    hasBatch: false,
    hasDrugSchedule: false,
    hasSizes: false,
    hasShades: true,
    hasWarranty: true,
    hasModel: true,
    hasGender: false,
    hasFabric: false,
    hasWireSpecs: true,
    hasVoltWatt: true,
    hasSoleMaterial: false,
    defaultCategories: [
      'Bulbs & LEDs', 'Tubelights', 'Decorative Lights', 'Panel Lights',
      'Wires & Cables', 'Switches & Boards', 'MCB & Distribution', 'Extension Boards',
      'Fans', 'Geyser', 'Water Heater', 'Room Heater', 'Iron', 'Mixer Grinder',
      'Stabilizer', 'Inverter', 'Battery', 'Water Pump', 'Pipes & Conduits', 'Screws & Nuts', 'Tools',
    ],
    defaultUnits: ['Piece', 'Meter', 'Box', 'Coil'],
    productPlaceholder: 'e.g. Philips LED Bulb 9W',
    productPlaceholderHi: 'जैसे सर्विस वायर 2.5mm',
    productPlaceholderMr: 'उदा. सर्विस वायर 2.5mm',
    hasSpecs: true,
    // Palette used by the 3-way variant grid — colour × type × spec. Hardware
    // colours skew utilitarian (housings, cable jackets), so the palette is
    // shorter than the apparel one but hits the everyday hardware finishes.
    colorChart: ['Black', 'White', 'Grey', 'Silver', 'Red', 'Blue', 'Green', 'Yellow', 'Brown'],
    defaultPackage: 'dukan',
  },
  electronics: {
    type: 'electronics',
    category: 'retail',
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
    hasShades: true,
    hasWarranty: true,
    hasModel: true,
    hasGender: false,
    hasFabric: false,
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: false,
    defaultCategories: [
      'Mobile', 'Laptop', 'TV', 'Camera', 'Earphones', 'Speaker', 'Power Bank', 'Charger', 'Smartwatch',
      'Mixer Grinder', 'Iron', 'Hair Dryer', 'Trimmer', 'Hair Straightener',
      'Geyser', 'Microwave', 'Induction Cooktop', 'Electric Kettle', 'Air Fryer', 'Toaster', 'Rice Cooker', 'Gas Stove',
      'Room Heater', 'Fan', 'Air Cooler', 'Air Conditioner', 'Refrigerator', 'Washing Machine', 'Vacuum Cleaner',
      'Accessories',
    ],
    defaultUnits: ['Piece', 'Box', 'Set', 'Unit'],
    productPlaceholder: 'e.g. Bajaj Mixer Grinder 750W',
    productPlaceholderHi: 'जैसे सैमसंग गैलेक्सी S23',
    productPlaceholderMr: 'उदा. सॅमसंग गॅलेक्सी S23',
    hasSpecs: true,
    // Palette used by the 3-way variant grid — a smartphone can now be tracked
    // as Black / 8GB / 128GB, White / 8GB / 128GB, etc. Kept to the finishes
    // Indian consumer electronics actually ship in so the chip row stays scannable.
    colorChart: ['Black', 'White', 'Blue', 'Green', 'Red', 'Gold', 'Silver', 'Grey', 'Purple', 'Pink'],
    defaultPackage: 'dukan',
  },
  liquor: {
    type: 'liquor',
    category: 'retail',
    label: 'Beer Bar & Wine Shop',
    labelHi: 'बीयर बार और वाइन शॉप',
    labelMr: 'बिअर बार आणि वाईन शॉप',
    emoji: '🍺',
    color: 'rose',
    gradient: 'from-rose-600 to-amber-600',
    description: 'Liquor retail — beer, wine, spirits, soft drinks, snacks & cigarettes',
    features: ['Volume-wise stock (90ml–1000ml)', 'Brand & alcohol % tracking', 'Case ⇄ bottle conversion', 'Batch + barcode billing', 'Fast barcode POS', 'Supplier & purchase tracking'],
    hasExpiry: false,
    hasExpiryRequired: false,
    hasBatch: true,          // batch number + supplier tracking on each stock lot
    hasDrugSchedule: false,
    hasSizes: false,
    hasShades: false,
    hasWarranty: false,
    hasModel: false,
    hasGender: false,
    hasFabric: false,
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: false,
    // Volume × Bottle Type variant matrix (resolved per category in LIQUOR_RULES),
    // e.g. Whisky → 90/180/375/750/1000 ml × Bottle/Nip/Pint/Case.
    hasSpecs: true,
    hasLiquorSpecs: true,    // shows Brand / Volume / Alcohol % / Bottle Type + Case⇄Bottle conversion
    defaultCategories: ['Beer', 'Wine', 'Whisky', 'Rum', 'Vodka', 'Gin', 'Brandy', 'Scotch', 'Water Bottle', 'Soft Drinks', 'Snacks', 'Cigarettes'],
    defaultUnits: ['Bottle', 'Can', 'PET', 'Peg', 'Pack', 'Case', 'Carton', 'Piece', 'Unit'],
    productPlaceholder: 'e.g. Kingfisher Premium (650ml)',
    productPlaceholderHi: 'जैसे किंगफिशर प्रीमियम (650ml)',
    productPlaceholderMr: 'उदा. किंगफिशर प्रीमियम (650ml)',
    sizeChart: ['90ml', '180ml', '275ml', '330ml', '375ml', '500ml', '650ml', '750ml', '1000ml'],
    defaultPackage: 'dukan',
  },
  general: {
    type: 'general',
    category: 'fmcg_grocery',
    // Legacy catch-all — kept fully working for shops that already have it
    // set, but no longer offered in any picker (see `hidden` on the
    // interface). Replaced going forward by the specific trade sections
    // below (FMCG & Grocery, Textile & Garments, etc.).
    hidden: true,
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
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: false,
    // Adaptive: the variant matrix is resolved from whatever category is typed (apparel,
    // footwear, beauty, electronics/electrical) — opt-in per product.
    hasSpecs: true,
    defaultCategories: ['Shirt', 'Pant', 'Footwear', 'Lipstick', 'Perfume', 'LED Bulb', 'Mixer Grinder', 'Battery', 'Charger', 'Earphones', 'Toys', 'Stationery', 'Hardware', 'Kitchenware', 'Bags', 'General'],
    defaultUnits: ['Piece', 'Box', 'Unit', 'Kg', 'Ltr'],
    productPlaceholder: 'e.g. Product Name',
    productPlaceholderHi: 'जैसे उत्पाद का नाम',
    productPlaceholderMr: 'उदा. उत्पादनाचे नाव',
    defaultPackage: 'wholesale',
  },
  agrowholesale: {
    type: 'agrowholesale',
    category: 'agro',
    label: 'Agro Wholesale',
    labelHi: 'कृषि थोक',
    labelMr: 'कृषी घाऊक',
    emoji: '🚜',
    color: 'emerald',
    gradient: 'from-emerald-700 to-teal-700',
    description: 'Bulk agri inputs to dealers, distributors, institutions — party ledger + credit terms',
    features: [
      'Party ledger + dealer/distributor credit terms',
      'Bulk packing sizes + case conversions',
      'Batch + expiry tracked per SKU',
      'Purchase invoice import with auto supplier ledger update',
      'Godown-wise stock + transfers',
    ],
    hasExpiry: true,
    hasExpiryRequired: true,
    hasBatch: true,
    hasDrugSchedule: false,
    hasSizes: false,
    hasShades: false,
    hasWarranty: false,
    hasModel: false,
    hasGender: false,
    hasFabric: false,
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: false,
    defaultCategories: [
      'Fertilizers', 'Organic Fertilizers', 'Bio Fertilizers', 'Micronutrients', 'Water Soluble Fertilizers',
      'Seeds', 'Vegetable Seeds', 'Crop Seeds', 'Hybrid Seeds',
      'Pesticides', 'Fungicides', 'Herbicides', 'Insecticides', 'Plant Growth Regulators',
      'Spray Pumps', 'Drip Accessories', 'Farm Tools', 'Animal Feed', 'Veterinary Products',
    ],
    defaultUnits: ['Kg', 'Quintal', 'Bag', 'Ton', 'Litre', 'ML', 'Packet', 'Box', 'Case'],
    productPlaceholder: 'e.g. Urea 50 Kg × 20 Bag Case',
    productPlaceholderHi: 'जैसे यूरिया 50 किलो × 20 बैग केस',
    productPlaceholderMr: 'उदा. यूरिया 50 किलो × 20 बॅग केस',
    // Wholesale/distributor businesses belong in the Udyog package even
    // though they're grouped under the Agro section — a shop-counter Dukan/
    // Vyapar account only sees the retail Agro types (Agro Retail Store,
    // Organic Products, Farm Equipment).
    defaultPackage: 'wholesale',
  },
  seeddistributor: {
    type: 'seeddistributor',
    category: 'agro',
    label: 'Seed Distributor',
    labelHi: 'बीज वितरक',
    labelMr: 'बियाणे वितरक',
    emoji: '🌾',
    color: 'lime',
    gradient: 'from-lime-600 to-emerald-600',
    description: 'Seed distribution — germination lot, batch + season traceability',
    features: [
      'Batch + lot tracking (regulatory requirement for seed sales)',
      'Season-wise stock planning (Kharif / Rabi / Zaid)',
      'Hybrid variety catalogue',
      'Dealer / farmer credit ledger',
      'Multi-godown stock + transfers',
    ],
    hasExpiry: true,
    hasExpiryRequired: true,
    hasBatch: true,
    hasDrugSchedule: false,
    hasSizes: false,
    hasShades: false,
    hasWarranty: false,
    hasModel: false,
    hasGender: false,
    hasFabric: false,
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: false,
    defaultCategories: [
      'Vegetable Seeds', 'Crop Seeds', 'Hybrid Seeds', 'Cereal Seeds',
      'Pulse Seeds', 'Oil Seeds', 'Fodder Seeds', 'Flower Seeds', 'Organic Seeds',
    ],
    defaultUnits: ['Gram', 'Kg', 'Packet', 'Bag', 'Sachet', 'Piece'],
    productPlaceholder: 'e.g. BT Cotton Hybrid 475g',
    productPlaceholderHi: 'जैसे बीटी कॉटन हाइब्रिड 475 ग्राम',
    productPlaceholderMr: 'उदा. बीटी कापूस हायब्रिड 475 ग्राम',
    defaultPackage: 'wholesale',
  },
  fertilizerdistributor: {
    type: 'fertilizerdistributor',
    category: 'agro',
    label: 'Fertilizer Distributor',
    labelHi: 'खाद वितरक',
    labelMr: 'खत वितरक',
    emoji: '🧪',
    color: 'amber',
    gradient: 'from-amber-600 to-yellow-600',
    description: 'Fertilizer distribution — bulk bags, NPK grade, subsidy tracking',
    features: [
      'NPK-grade & straight-fertilizer catalogue',
      'Batch tracking + subsidy scheme flagging',
      'Bulk bag / ton pricing to dealers',
      'Dealer credit ledger + payment terms',
      'Godown-wise stock + transfers',
    ],
    hasExpiry: true,
    hasExpiryRequired: false,
    hasBatch: true,
    hasDrugSchedule: false,
    hasSizes: false,
    hasShades: false,
    hasWarranty: false,
    hasModel: false,
    hasGender: false,
    hasFabric: false,
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: false,
    defaultCategories: [
      'Urea', 'DAP', 'MOP', 'NPK Complex', 'SSP', 'Zinc Sulphate', 'Sulphur',
      'Organic Fertilizers', 'Bio Fertilizers', 'Micronutrients', 'Water Soluble Fertilizers',
    ],
    defaultUnits: ['Kg', 'Bag', 'Quintal', 'Ton', 'Litre', 'Packet'],
    productPlaceholder: 'e.g. IFFCO Urea 45 Kg Bag',
    productPlaceholderHi: 'जैसे इफको यूरिया 45 किलो बैग',
    productPlaceholderMr: 'उदा. इफ्को यूरिया 45 किलो बॅग',
    defaultPackage: 'wholesale',
  },
  pesticidedistributor: {
    type: 'pesticidedistributor',
    category: 'agro',
    label: 'Pesticide Distributor',
    labelHi: 'कीटनाशक वितरक',
    labelMr: 'कीटकनाशक वितरक',
    emoji: '⚗️',
    color: 'red',
    gradient: 'from-red-600 to-orange-600',
    description: 'Agro-chemical distribution — batch + expiry mandatory, technical grade info',
    features: [
      'Batch + expiry mandatory (regulatory)',
      'Technical grade + AI concentration',
      'Toxicity class tagging (red / yellow / blue / green)',
      'Dealer credit ledger + payment terms',
      'Multi-godown stock + transfers',
    ],
    hasExpiry: true,
    hasExpiryRequired: true,
    hasBatch: true,
    hasDrugSchedule: false,
    hasSizes: false,
    hasShades: false,
    hasWarranty: false,
    hasModel: false,
    hasGender: false,
    hasFabric: false,
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: false,
    defaultCategories: [
      'Insecticides', 'Fungicides', 'Herbicides', 'Rodenticides',
      'Plant Growth Regulators', 'Bio Pesticides', 'Adjuvants', 'Nematicides',
    ],
    defaultUnits: ['ML', 'Litre', 'Gram', 'Kg', 'Bottle', 'Packet', 'Sachet'],
    productPlaceholder: 'e.g. Ridomil Gold MZ 250g',
    productPlaceholderHi: 'जैसे रिडोमिल गोल्ड एमजेड 250 ग्राम',
    productPlaceholderMr: 'उदा. रिडोमिल गोल्ड एमझेड 250 ग्राम',
    defaultPackage: 'wholesale',
  },
  agrostore: {
    type: 'agrostore',
    category: 'agro',
    label: 'Agro Retail Store',
    labelHi: 'कृषि रिटेल दुकान',
    labelMr: 'कृषी रिटेल दुकान',
    emoji: '🌱',
    color: 'emerald',
    gradient: 'from-emerald-600 to-lime-600',
    description: 'Fertilizers, seeds, pesticides & agricultural inputs — batch + expiry critical',
    features: [
      'Batch + expiry tracked per product (regulatory requirement)',
      'Farmer / dealer / distributor / institution customer types',
      'Brand + company-wise sales reports',
      'Multi-size packing (Kg / Litre / Packet / Bag / Bottle / Box)',
      'GST-ready with HSN codes',
      'Godown-wise stock + batch-wise valuation',
    ],
    // Agri-input regulation mandates batch + expiry. Expiry is REQUIRED (not
    // optional) so a shopkeeper can never accidentally sell an unlabelled
    // fertilizer / pesticide — matches how the medical category treats it.
    hasExpiry: true,
    hasExpiryRequired: true,
    hasBatch: true,
    hasDrugSchedule: false,
    hasSizes: false,
    hasShades: false,
    hasWarranty: false,
    hasModel: false,
    hasGender: false,
    hasFabric: false,
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: false,
    defaultCategories: [
      // Fertilizers
      'Fertilizers', 'Organic Fertilizers', 'Bio Fertilizers', 'Micronutrients', 'Water Soluble Fertilizers',
      // Seeds
      'Seeds', 'Vegetable Seeds', 'Crop Seeds', 'Hybrid Seeds',
      // Pesticides & agro-chemicals
      'Pesticides', 'Fungicides', 'Herbicides', 'Insecticides', 'Plant Growth Regulators',
      // Equipment
      'Agricultural Equipment', 'Spray Pumps', 'Drip Accessories', 'Farm Tools',
      // Animal
      'Animal Feed', 'Veterinary Products',
      // Catch-all
      'Other Agricultural Products',
    ],
    defaultUnits: ['Kg', 'Gram', 'Litre', 'ML', 'Packet', 'Bag', 'Bottle', 'Box', 'Piece'],
    productPlaceholder: 'e.g. Urea 50 Kg / Tata Rallis (Batch: URA2026-A)',
    productPlaceholderHi: 'जैसे यूरिया 50 किलो / टाटा रैलिस',
    productPlaceholderMr: 'उदा. यूरिया 50 किलो / टाटा रॅलिस',
    defaultPackage: 'dukan',
  },
  ricemill: {
    type: 'ricemill',
    category: 'manufacturing',
    label: 'Rice Mill & Bhagar Mill',
    labelHi: 'राइस मिल / दाल मिल',
    labelMr: 'राईस मिल / डाळ मिल',
    emoji: '🌾',
    color: 'amber',
    gradient: 'from-amber-600 to-yellow-600',
    // Superseded by the unified 'millprocessing' type — kept valid via
    // getBusinessConfig() for legacy shops but hidden from every new picker
    // so signups always land on the compound type instead.
    hidden: true,
    description: 'Rice mill, dal mill & grain processing — raw material lots, production batches, recovery %, by-products',
    features: [
      'Raw material lot tracking (moisture %, farmer, weight)',
      'Production batch workflow (cleaning → drying → shelling → polishing → packing)',
      'Yield / recovery % per batch',
      'By-product accounting (bran, husk, chuni, polish, dust)',
      'Multi-size packing (5/10/25/50 Kg bags)',
      'Godown-wise stock + batch-wise valuation',
    ],
    hasExpiry: true,             // grains rarely expire but optional field lets mills mark best-before
    hasExpiryRequired: false,
    hasBatch: true,              // every mill product is batched — mandatory
    hasDrugSchedule: false,
    hasSizes: false,             // packing sizes are modelled as separate SKUs, not variants
    hasShades: false,
    hasWarranty: false,
    hasModel: false,
    hasGender: false,
    hasFabric: false,
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: false,
    defaultCategories: [
      // Raw materials
      'Paddy', 'Wheat', 'Maize', 'Turad', 'Chana', 'Moong', 'Udad', 'Masoor', 'Other Grain',
      // Finished — rice varieties
      'Rice', 'Steam Rice', 'Premium Rice', 'Broken Rice',
      // Finished — dal varieties
      'Tur Dal', 'Chana Dal', 'Moong Dal', 'Masoor Dal', 'Udad Dal',
      // By-products
      'Bran', 'Husk', 'Chuni', 'Polish', 'Dust',
    ],
    defaultUnits: ['Kg', 'Quintal', 'Bag', 'Ton', '5 Kg', '10 Kg', '25 Kg', '50 Kg'],
    productPlaceholder: 'e.g. Basmati Rice 25 Kg',
    productPlaceholderHi: 'जैसे बासमती चावल 25 किलो',
    productPlaceholderMr: 'उदा. बासमती तांदूळ 25 किलो',
    defaultPackage: 'badaudyog',
  },
  generalstore: {
    type: 'generalstore',
    category: 'retail',
    label: 'General Store',
    labelHi: 'जनरल स्टोर',
    labelMr: 'जनरल स्टोअर',
    emoji: '🏬',
    color: 'teal',
    gradient: 'from-teal-600 to-cyan-600',
    description: 'Everyday essentials — stationery, toiletries, snacks, household items',
    features: ['Mixed-category inventory', 'Udhar (credit) management', 'Low stock alerts', 'Fast counter billing'],
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
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: false,
    // Adaptive: same opt-in spec matrix as `general`, resolved from whatever category is typed.
    hasSpecs: true,
    defaultCategories: ['Stationery', 'Toiletries', 'Snacks & Namkeen', 'Cold Drinks', 'Household Items', 'Toys', 'Gift Items', 'Plastic Ware', 'Bags', 'Umbrellas', 'Batteries', 'General'],
    defaultUnits: ['Piece', 'Packet', 'Box', 'Dozen', 'Set', 'Kg', 'Ltr'],
    productPlaceholder: 'e.g. Notebook 200 Pages',
    productPlaceholderHi: 'जैसे नोटबुक 200 पेज',
    productPlaceholderMr: 'उदा. वही 200 पाने',
    defaultPackage: 'dukan',
  },
  organicproducts: {
    type: 'organicproducts',
    category: 'agro',
    label: 'Organic Products',
    labelHi: 'जैविक उत्पाद',
    labelMr: 'सेंद्रिय उत्पादने',
    emoji: '🌿',
    color: 'green',
    gradient: 'from-green-600 to-emerald-600',
    description: 'Certified organic fertilizers, seeds, produce & farm inputs',
    features: [
      'Certification / batch traceability',
      'Expiry tracked per product',
      'Farmer / dealer customer types',
      'Brand-wise sales reports',
    ],
    hasExpiry: true,
    hasExpiryRequired: false,
    hasBatch: true,
    hasDrugSchedule: false,
    hasSizes: false,
    hasShades: false,
    hasWarranty: false,
    hasModel: false,
    hasGender: false,
    hasFabric: false,
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: false,
    defaultCategories: [
      'Organic Fertilizers', 'Bio Fertilizers', 'Vermicompost', 'Organic Pesticides',
      'Organic Seeds', 'Organic Produce', 'Bio Stimulants', 'Neem-based Products',
    ],
    defaultUnits: ['Kg', 'Gram', 'Litre', 'ML', 'Packet', 'Bag', 'Bottle', 'Piece'],
    productPlaceholder: 'e.g. Vermicompost 10 Kg Bag',
    productPlaceholderHi: 'जैसे वर्मीकम्पोस्ट 10 किलो बैग',
    productPlaceholderMr: 'उदा. गांडूळ खत 10 किलो बॅग',
    defaultPackage: 'dukan',
  },
  farmequipment: {
    type: 'farmequipment',
    category: 'agro',
    label: 'Farm Equipment',
    labelHi: 'कृषि उपकरण',
    labelMr: 'शेती अवजारे',
    emoji: '🚜',
    color: 'orange',
    gradient: 'from-orange-600 to-amber-600',
    description: 'Farm tools, implements, spray pumps & small agri-machinery',
    features: [
      'Model + warranty tracking',
      'Spare parts inventory',
      'Dealer / farmer credit ledger',
      'Service & repair history',
    ],
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
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: false,
    defaultCategories: [
      'Spray Pumps', 'Power Tillers', 'Water Pumps', 'Drip Accessories', 'Hand Tools',
      'Sprinklers', 'Harvesting Tools', 'Tractor Parts', 'Fencing', 'Poly House Accessories',
    ],
    defaultUnits: ['Piece', 'Set', 'Box', 'Unit'],
    productPlaceholder: 'e.g. Knapsack Sprayer 16L',
    productPlaceholderHi: 'जैसे नैपसैक स्प्रेयर 16 लीटर',
    productPlaceholderMr: 'उदा. नॅपसॅक स्प्रेयर 16 लिटर',
    defaultPackage: 'dukan',
  },
  flourmill: {
    type: 'flourmill',
    category: 'manufacturing',
    label: 'Flour Mill',
    labelHi: 'आटा चक्की',
    labelMr: 'पीठ गिरणी',
    emoji: '🌾',
    color: 'stone',
    gradient: 'from-stone-600 to-amber-700',
    hidden: true, // superseded by 'millprocessing' — legacy only
    description: 'Wheat, jowar & multi-grain flour milling — batch grinding, packing sizes',
    features: [
      'Raw material lot tracking',
      'Production batch workflow (cleaning → grinding → packing)',
      'By-product accounting (bran, chokar)',
      'Multi-size packing (1/5/10/25/50 Kg)',
      'Godown-wise stock + batch-wise valuation',
    ],
    hasExpiry: true,
    hasExpiryRequired: false,
    hasBatch: true,
    hasDrugSchedule: false,
    hasSizes: false,
    hasShades: false,
    hasWarranty: false,
    hasModel: false,
    hasGender: false,
    hasFabric: false,
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: false,
    defaultCategories: [
      'Wheat', 'Jowar', 'Bajra', 'Maize', 'Ragi', 'Other Grain',
      'Wheat Flour', 'Multi-grain Flour', 'Jowar Flour', 'Bajra Flour', 'Besan',
      'Bran', 'Chokar',
    ],
    defaultUnits: ['Kg', 'Quintal', 'Bag', '1 Kg', '5 Kg', '10 Kg', '25 Kg', '50 Kg'],
    productPlaceholder: 'e.g. Wheat Flour 10 Kg',
    productPlaceholderHi: 'जैसे गेहूं आटा 10 किलो',
    productPlaceholderMr: 'उदा. गहू पीठ 10 किलो',
    defaultPackage: 'badaudyog',
  },
  oilmill: {
    type: 'oilmill',
    category: 'manufacturing',
    label: 'Oil Mill',
    labelHi: 'तेल घानी',
    labelMr: 'तेल घाणी',
    emoji: '🛢️',
    color: 'yellow',
    gradient: 'from-yellow-600 to-amber-600',
    hidden: true, // superseded by 'millprocessing' — legacy only
    description: 'Groundnut, mustard & sesame oil pressing — batch extraction, by-products',
    features: [
      'Raw material lot tracking (seed weight, oil recovery %)',
      'Production batch workflow (cleaning → pressing → filtering → packing)',
      'By-product accounting (oil cake, husk)',
      'Multi-size packing (500ml–15L)',
      'Godown-wise stock + batch-wise valuation',
    ],
    hasExpiry: true,
    hasExpiryRequired: false,
    hasBatch: true,
    hasDrugSchedule: false,
    hasSizes: false,
    hasShades: false,
    hasWarranty: false,
    hasModel: false,
    hasGender: false,
    hasFabric: false,
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: false,
    defaultCategories: [
      'Groundnut', 'Mustard Seed', 'Sesame', 'Sunflower Seed', 'Coconut',
      'Groundnut Oil', 'Mustard Oil', 'Sesame Oil', 'Sunflower Oil', 'Coconut Oil',
      'Oil Cake', 'Husk',
    ],
    defaultUnits: ['Litre', 'ML', 'Kg', '500ml', '1L', '5L', '15L', 'Tin'],
    productPlaceholder: 'e.g. Groundnut Oil 5L Tin',
    productPlaceholderHi: 'जैसे मूंगफली तेल 5 लीटर टिन',
    productPlaceholderMr: 'उदा. भुईमूग तेल 5 लिटर टिन',
    defaultPackage: 'badaudyog',
  },
  foodprocessing: {
    type: 'foodprocessing',
    category: 'manufacturing',
    label: 'Food Processing',
    labelHi: 'खाद्य प्रसंस्करण',
    labelMr: 'अन्न प्रक्रिया',
    emoji: '🏭',
    color: 'lime',
    gradient: 'from-lime-600 to-green-600',
    hidden: true, // superseded by 'millprocessing' — legacy only
    description: 'Papad, pickle, masala, snacks & packaged food manufacturing',
    features: [
      'Raw material + batch tracking',
      'Production batch workflow (prep → process → pack)',
      'Expiry / best-before per batch',
      'Multi-size packing',
      'Godown-wise stock + batch-wise valuation',
    ],
    hasExpiry: true,
    hasExpiryRequired: true,
    hasBatch: true,
    hasDrugSchedule: false,
    hasSizes: false,
    hasShades: false,
    hasWarranty: false,
    hasModel: false,
    hasGender: false,
    hasFabric: false,
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: false,
    defaultCategories: [
      'Papad', 'Pickle', 'Masala & Spices', 'Namkeen & Snacks', 'Bakery Products',
      'Ready to Eat', 'Sauces & Ketchup', 'Jams & Preserves', 'Dairy Products', 'Packaged Sweets',
    ],
    defaultUnits: ['Kg', 'Gram', 'Packet', 'Box', 'Piece', 'Bottle', 'Jar'],
    productPlaceholder: 'e.g. Masala Papad 250g Packet',
    productPlaceholderHi: 'जैसे मसाला पापड़ 250 ग्राम पैकेट',
    productPlaceholderMr: 'उदा. मसाला पापड 250 ग्राम पाकीट',
    defaultPackage: 'badaudyog',
  },
  smallmanufacturing: {
    type: 'smallmanufacturing',
    category: 'manufacturing',
    label: 'Small Manufacturing',
    labelHi: 'लघु विनिर्माण',
    labelMr: 'लघु उत्पादन',
    emoji: '⚙️',
    color: 'indigo',
    gradient: 'from-indigo-600 to-slate-600',
    hidden: true, // superseded by 'millprocessing' — legacy only
    description: 'Small-scale production units — raw material to finished-goods stock',
    features: [
      'Raw material + finished goods tracking',
      'Production batch workflow',
      'BOM-style component consumption',
      'Godown-wise stock + transfers',
    ],
    hasExpiry: false,
    hasExpiryRequired: false,
    hasBatch: true,
    hasDrugSchedule: false,
    hasSizes: false,
    hasShades: false,
    hasWarranty: false,
    hasModel: false,
    hasGender: false,
    hasFabric: false,
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: false,
    defaultCategories: ['Raw Material', 'Work in Progress', 'Finished Goods', 'Packaging Material', 'Spare Parts', 'General'],
    defaultUnits: ['Piece', 'Kg', 'Box', 'Unit', 'Set'],
    productPlaceholder: 'e.g. Product Name / Batch No.',
    productPlaceholderHi: 'जैसे उत्पाद का नाम / बैच नंबर',
    productPlaceholderMr: 'उदा. उत्पादनाचे नाव / बॅच क्रमांक',
    defaultPackage: 'badaudyog',
  },
  // ────────────────────────────────────────────────────────────────────────
  // Unified compound type — covers every kind of mill / grain-processing
  // shop in one entry. The specific mill (Rice / Dal / Bhagar / Flour / Oil
  // / …) is recorded in Shop.businessSubtype (see MILL_TYPES below), and
  // the raw materials / products this shop processes are recorded as a
  // multi-select in Shop.businessProducts (see MILL_PRODUCT_TYPES below).
  //
  // Replaces the split ricemill / flourmill / oilmill / foodprocessing /
  // smallmanufacturing entries (all now hidden:true above), since a real
  // mill often does Rice + Dal + Flour together and shouldn't need three
  // separate business accounts to bill from.
  millprocessing: {
    type: 'millprocessing',
    category: 'manufacturing',
    label: 'Mills & Grain Processing',
    labelHi: 'मिल और अनाज प्रसंस्करण',
    labelMr: 'मिल आणि धान्य प्रक्रिया',
    emoji: '🌾',
    color: 'amber',
    gradient: 'from-amber-600 to-yellow-600',
    description: 'Every kind of mill under one setup — rice / dal / bhagar / wheat / bajra / jowar / oil / spice. Pick the mill type + products you process; a single shop can handle multiple.',
    features: [
      'One profile handles Rice + Dal + Flour + Oil together',
      'Raw material lot tracking (farmer, moisture %, weight)',
      'Production batch workflow (cleaning → drying → milling → packing)',
      'Yield / recovery % per batch',
      'By-product accounting (bran, husk, chuni, polish, cake)',
      'Multi-size packing (5 / 10 / 25 / 50 Kg)',
      'Godown-wise stock + batch-wise valuation',
    ],
    hasExpiry: true,
    hasExpiryRequired: false,
    hasBatch: true,
    hasDrugSchedule: false,
    hasSizes: false,
    hasShades: false,
    hasWarranty: false,
    hasModel: false,
    hasGender: false,
    hasFabric: false,
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: false,
    // Flattened union of MILL_CATEGORY_GROUPS below — kept in sync by
    // deriving it, so any plain-list consumer (search, export, etc.) sees
    // the exact same set the grouped picker offers. Products/Categories can
    // still be refined per-shop through the normal Category mgmt UI.
    defaultCategories: MILL_CATEGORY_GROUPS.flatMap(g => g.options),
    categoryGroups: MILL_CATEGORY_GROUPS,
    defaultUnits: ['Kg', 'Quintal', 'Bag', 'Ton', '1 Kg', '5 Kg', '10 Kg', '25 Kg', '50 Kg', 'Litre', 'ML', 'Tin'],
    // Generic across every mill type (Rice/Flour/Dal/Millet/Oil/…) — never
    // just one mill's product, so the form doesn't read as built for a
    // single commodity.
    productPlaceholder: 'e.g. Rice, Wheat Flour, Toor Dal, Groundnut Oil',
    productPlaceholderHi: 'जैसे चावल, गेहूं का आटा, तूर दाल, मूंगफली तेल',
    productPlaceholderMr: 'उदा. तांदूळ, गहू पीठ, तूर डाळ, भुईमूग तेल',
    defaultPackage: 'badaudyog',
  },
  fmcgdistributor: {
    type: 'fmcgdistributor',
    category: 'fmcg_grocery',
    label: 'FMCG Distributor',
    labelHi: 'एफएमसीजी वितरक',
    labelMr: 'एफएमसीजी वितरक',
    emoji: '📦',
    color: 'cyan',
    gradient: 'from-cyan-600 to-blue-600',
    description: 'Bulk FMCG supply to retailers — party ledger, scheme & margin tracking',
    features: [
      'Party ledger + retailer credit terms',
      'Scheme / margin tracking',
      'Case ⇄ piece conversion',
      'Purchase invoice import with auto supplier ledger update',
      'Godown-wise stock + transfers',
    ],
    hasExpiry: true,
    hasExpiryRequired: false,
    hasBatch: true,
    hasDrugSchedule: false,
    hasSizes: false,
    hasShades: false,
    hasWarranty: false,
    hasModel: false,
    hasGender: false,
    hasFabric: false,
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: false,
    defaultCategories: ['Food & Beverages', 'Personal Care', 'Home Care', 'Confectionery', 'Dairy', 'General'],
    defaultUnits: ['Piece', 'Box', 'Case', 'Carton', 'Dozen', 'Kg', 'Ltr'],
    productPlaceholder: 'e.g. Parle-G 100g × 96 Case',
    productPlaceholderHi: 'जैसे पार्ले-जी 100 ग्राम × 96 केस',
    productPlaceholderMr: 'उदा. पार्ले-जी 100 ग्राम × 96 केस',
    defaultPackage: 'wholesale',
  },
  electricaldistributor: {
    type: 'electricaldistributor',
    category: 'electrical_wholesale',
    label: 'Electrical Distributor',
    labelHi: 'इलेक्ट्रिकल वितरक',
    labelMr: 'इलेक्ट्रिकल वितरक',
    emoji: '🔌',
    color: 'amber',
    gradient: 'from-amber-600 to-yellow-700',
    description: 'Bulk electrical goods supply to dealers — wires, switchgear, lighting',
    features: [
      'Party ledger + dealer credit terms',
      'Bulk coil / box / case conversions',
      'Warranty tracking on appliances',
      'Purchase invoice import with auto supplier ledger update',
      'Godown-wise stock + transfers',
    ],
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
    hasWireSpecs: true,
    hasVoltWatt: true,
    hasSoleMaterial: false,
    defaultCategories: ['Wires & Cables', 'Switchgear', 'MCB & Distribution', 'Lighting', 'Fans & Motors', 'Conduits & Accessories'],
    defaultUnits: ['Piece', 'Box', 'Coil', 'Case', 'Meter'],
    productPlaceholder: 'e.g. Copper Wire 1.5mm × 90m Coil',
    productPlaceholderHi: 'जैसे कॉपर वायर 1.5mm × 90m कॉइल',
    productPlaceholderMr: 'उदा. कॉपर वायर 1.5mm × 90m कॉइल',
    defaultPackage: 'wholesale',
  },
  electricalwholesale: {
    type: 'electricalwholesale',
    category: 'electrical_wholesale',
    label: 'Electrical Wholesale',
    labelHi: 'इलेक्ट्रिकल थोक',
    labelMr: 'इलेक्ट्रिकल घाऊक',
    // Distinct from electricaldistributor's 🔌 (and the Electrical
    // category's own ⚡) so the two sibling types stay visually
    // distinguishable in the same dropdown group.
    emoji: '💡',
    color: 'yellow',
    gradient: 'from-yellow-500 to-amber-600',
    description: 'General bulk electrical goods trading to dealers — multi-brand, no exclusive tie-up needed',
    features: [
      'Party ledger + dealer credit terms',
      'Bulk coil / box / case conversions',
      'Multi-brand stock, no exclusive distributorship needed',
      'Purchase invoice import with auto supplier ledger update',
      'Godown-wise stock + transfers',
    ],
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
    hasWireSpecs: true,
    hasVoltWatt: true,
    hasSoleMaterial: false,
    defaultCategories: ['Wires & Cables', 'Switchgear', 'MCB & Distribution', 'Lighting', 'Fans & Motors', 'Conduits & Accessories'],
    defaultUnits: ['Piece', 'Box', 'Coil', 'Case', 'Meter'],
    productPlaceholder: 'e.g. LED Bulb 9W × 100 Box',
    productPlaceholderHi: 'जैसे LED बल्ब 9W × 100 बॉक्स',
    productPlaceholderMr: 'उदा. LED बल्ब 9W × 100 बॉक्स',
    defaultPackage: 'wholesale',
  },
  medicaldistributor: {
    type: 'medicaldistributor',
    category: 'medical_pharma',
    label: 'Medical Distributor',
    labelHi: 'मेडिकल वितरक',
    labelMr: 'मेडिकल वितरक',
    emoji: '💊',
    color: 'blue',
    gradient: 'from-blue-600 to-indigo-600',
    description: 'Bulk pharmaceutical supply to pharmacies — batch, expiry & drug schedule mandatory',
    features: [
      'Batch + expiry mandatory (regulatory)',
      'Drug schedule (OTC/Rx/H1/H2)',
      'Party ledger + pharmacy credit terms',
      'Purchase invoice import with auto supplier ledger update',
      'Godown-wise stock + transfers',
    ],
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
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: false,
    defaultCategories: ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Surgical', 'Ayurvedic', 'General'],
    defaultUnits: ['Strip', 'Box', 'Case', 'Carton', 'Unit'],
    productPlaceholder: 'e.g. Paracetamol 500mg × 10×10 Box',
    productPlaceholderHi: 'जैसे पैरासिटामोल 500mg × 10×10 बॉक्स',
    productPlaceholderMr: 'उदा. पॅरासिटामॉल 500mg × 10×10 बॉक्स',
    defaultPackage: 'wholesale',
  },
  textilewholesale: {
    type: 'textilewholesale',
    category: 'textile_garments',
    label: 'Textile Wholesale',
    labelHi: 'कपड़ा थोक',
    labelMr: 'कापड घाऊक',
    emoji: '🧵',
    color: 'fuchsia',
    gradient: 'from-fuchsia-600 to-purple-600',
    description: 'Bulk fabric & garment supply to retailers — piece goods, lot-wise stock',
    features: [
      'Party ledger + retailer credit terms',
      'Piece / bale / lot-wise stock',
      'Colour & size-wise inventory',
      'Purchase invoice import with auto supplier ledger update',
      'Godown-wise stock + transfers',
    ],
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
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: false,
    defaultCategories: ['Cotton Fabric', 'Silk Fabric', 'Synthetic Fabric', 'Readymade Garments', 'Sarees', 'Dress Material'],
    defaultUnits: ['Meter', 'Piece', 'Bale', 'Lot', 'Set'],
    productPlaceholder: 'e.g. Cotton Fabric 40m Bale',
    productPlaceholderHi: 'जैसे कॉटन फैब्रिक 40m बेल',
    productPlaceholderMr: 'उदा. कॉटन फॅब्रिक 40m बेल',
    sizeChart: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
    hasColors: true,
    colorChart: ['Black', 'White', 'Red', 'Blue', 'Green', 'Yellow', 'Pink', 'Grey', 'Maroon', 'Navy'],
    defaultPackage: 'wholesale',
  },
  grocerywholesale: {
    type: 'grocerywholesale',
    category: 'fmcg_grocery',
    label: 'Grocery Wholesale',
    labelHi: 'किराना थोक',
    labelMr: 'किराणा घाऊक',
    emoji: '🛒',
    color: 'lime',
    gradient: 'from-lime-600 to-green-600',
    description: 'Bulk packaged grocery supply to retailers — party ledger, case-lot pricing',
    features: [
      'Party ledger + retailer credit terms',
      'Case ⇄ piece conversion',
      'Scheme / margin tracking',
      'Purchase invoice import with auto supplier ledger update',
      'Godown-wise stock + transfers',
    ],
    hasExpiry: true,
    hasExpiryRequired: false,
    hasBatch: true,
    hasDrugSchedule: false,
    hasSizes: false,
    hasShades: false,
    hasWarranty: false,
    hasModel: false,
    hasGender: false,
    hasFabric: false,
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: false,
    defaultCategories: ['Edible Oils', 'Sugar & Jaggery', 'Tea', 'Coffee', 'Biscuits & Snacks', 'Soft Drinks', 'Detergents', 'General'],
    defaultUnits: ['Piece', 'Box', 'Case', 'Carton', 'Dozen', 'Kg', 'Ltr'],
    productPlaceholder: 'e.g. Sunflower Oil 1L × 12 Case',
    productPlaceholderHi: 'जैसे सूरजमुखी तेल 1L × 12 केस',
    productPlaceholderMr: 'उदा. सूर्यफूल तेल 1L × 12 केस',
    defaultPackage: 'wholesale',
  },
  kiranawholesale: {
    type: 'kiranawholesale',
    category: 'fmcg_grocery',
    label: 'Kirana Wholesale',
    labelHi: 'किराना होलसेल',
    labelMr: 'किराणा घाऊक व्यापार',
    // Was '🌾' (sheaf of grain) — identical to the Agro Business CATEGORY's
    // own emoji, so a Kirana Wholesale shop's icon looked like a farming
    // business instead of a grocery/FMCG one. 🧺 stays distinct from every
    // other fmcg_grocery sibling too (grocerywholesale='🛒', fmcgdistributor='📦').
    emoji: '🧺',
    color: 'emerald',
    gradient: 'from-emerald-600 to-lime-600',
    description: 'Bulk staples — grains, pulses, spices — supply to kirana stores',
    features: [
      'Party ledger + retailer credit terms',
      'Bulk bag / quintal pricing',
      'Godown-wise stock + batch-wise valuation',
      'Purchase invoice import with auto supplier ledger update',
    ],
    hasExpiry: true,
    hasExpiryRequired: false,
    hasBatch: true,
    hasDrugSchedule: false,
    hasSizes: false,
    hasShades: false,
    hasWarranty: false,
    hasModel: false,
    hasGender: false,
    hasFabric: false,
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: false,
    defaultCategories: ['Rice & Rice Products', 'Atta & Flours', 'Dals & Pulses', 'Spices & Masalas', 'Dry Fruits & Nuts', 'Salt', 'General'],
    defaultUnits: ['Kg', 'Quintal', 'Bag', 'Ton', 'Packet', 'Box'],
    productPlaceholder: 'e.g. Toor Dal 50 Kg Bag',
    productPlaceholderHi: 'जैसे तुअर दाल 50 किलो बैग',
    productPlaceholderMr: 'उदा. तूर डाळ 50 किलो बॅग',
    defaultPackage: 'wholesale',
  },
  garmentwholesale: {
    type: 'garmentwholesale',
    category: 'textile_garments',
    label: 'Garment Wholesale',
    labelHi: 'रेडीमेड वस्त्र थोक',
    labelMr: 'रेडिमेड कपडे घाऊक',
    emoji: '👕',
    color: 'violet',
    gradient: 'from-violet-600 to-purple-600',
    description: 'Bulk readymade garment supply to retailers — lot-wise, size × colour stock',
    features: [
      'Party ledger + retailer credit terms',
      'Lot / piece-wise stock',
      'Colour & size-wise inventory',
      'Purchase invoice import with auto supplier ledger update',
      'Godown-wise stock + transfers',
    ],
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
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: false,
    defaultCategories: ['T-Shirts', 'Shirts', 'Jeans & Trousers', 'Kids Wear', 'Ethnic Wear', 'Nightwear', 'General'],
    defaultUnits: ['Piece', 'Set', 'Lot', 'Dozen'],
    productPlaceholder: 'e.g. Cotton T-Shirt Lot (M/L/XL Mix)',
    productPlaceholderHi: 'जैसे कॉटन टी-शर्ट लॉट (M/L/XL मिक्स)',
    productPlaceholderMr: 'उदा. कॉटन टी-शर्ट लॉट (M/L/XL मिक्स)',
    sizeChart: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
    hasColors: true,
    colorChart: ['Black', 'White', 'Red', 'Blue', 'Green', 'Yellow', 'Pink', 'Grey', 'Maroon', 'Navy'],
    defaultPackage: 'wholesale',
  },
  fabricdistributor: {
    type: 'fabricdistributor',
    category: 'textile_garments',
    label: 'Fabric Distributor',
    labelHi: 'कपड़ा वितरक',
    labelMr: 'कापड वितरक',
    emoji: '🧵',
    color: 'fuchsia',
    gradient: 'from-fuchsia-600 to-pink-600',
    description: 'Raw fabric / piece-goods supply to tailors, garment units & retailers',
    features: [
      'Party ledger + dealer credit terms',
      'Piece / bale / roll-wise stock',
      'Purchase invoice import with auto supplier ledger update',
      'Godown-wise stock + transfers',
    ],
    hasExpiry: false,
    hasExpiryRequired: false,
    hasBatch: false,
    hasDrugSchedule: false,
    hasSizes: false,
    hasShades: false,
    hasWarranty: false,
    hasModel: false,
    hasGender: false,
    hasFabric: true,
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: false,
    defaultCategories: ['Cotton Fabric', 'Silk Fabric', 'Synthetic Fabric', 'Denim', 'Linen', 'Wool', 'General'],
    defaultUnits: ['Meter', 'Roll', 'Bale', 'Piece'],
    productPlaceholder: 'e.g. Cotton Poplin 50m Roll',
    productPlaceholderHi: 'जैसे कॉटन पॉपलिन 50m रोल',
    productPlaceholderMr: 'उदा. कॉटन पॉपलिन 50m रोल',
    defaultPackage: 'wholesale',
  },
  footwearwholesale: {
    type: 'footwearwholesale',
    category: 'footwear_wholesale',
    label: 'Footwear Wholesale',
    labelHi: 'फुटवियर थोक',
    labelMr: 'फुटवेअर घाऊक',
    emoji: '👟',
    color: 'amber',
    gradient: 'from-amber-600 to-orange-600',
    description: 'Bulk footwear supply to retailers — size × colour lot-wise stock',
    features: [
      'Party ledger + retailer credit terms',
      'Size & colour-wise lot stock',
      'Purchase invoice import with auto supplier ledger update',
      'Godown-wise stock + transfers',
    ],
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
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: true,
    defaultCategories: ['Sports Shoes', 'Formal Shoes', 'Sandals', 'Slippers', 'Boots', 'Kids Shoes', 'General'],
    defaultUnits: ['Pair', 'Dozen', 'Lot', 'Box'],
    productPlaceholder: 'e.g. Sports Shoes Lot (UK 6-10 Mix)',
    productPlaceholderHi: 'जैसे स्पोर्ट्स शूज़ लॉट (UK 6-10 मिक्स)',
    productPlaceholderMr: 'उदा. स्पोर्ट्स शूज लॉट (UK 6-10 मिक्स)',
    sizeChart: ['UK/IND 4', 'UK/IND 5', 'UK/IND 6', 'UK/IND 7', 'UK/IND 8', 'UK/IND 9', 'UK/IND 10', 'UK/IND 11', 'UK/IND 12'],
    hasColors: true,
    colorChart: ['Black', 'White', 'Brown', 'Tan', 'Blue', 'Red', 'Grey', 'Navy'],
    defaultPackage: 'wholesale',
  },
  pharmaceuticaldistributor: {
    type: 'pharmaceuticaldistributor',
    category: 'medical_pharma',
    label: 'Pharmaceutical Distributor',
    labelHi: 'फार्मास्युटिकल वितरक',
    labelMr: 'फार्मास्युटिकल वितरक',
    emoji: '💉',
    color: 'indigo',
    gradient: 'from-indigo-600 to-blue-600',
    description: 'Manufacturer-to-stockist pharma distribution — batch, expiry & drug schedule mandatory',
    features: [
      'Batch + expiry mandatory (regulatory)',
      'Drug schedule (OTC/Rx/H1/H2)',
      'Stockist / pharmacy credit ledger',
      'Purchase invoice import with auto supplier ledger update',
      'Godown-wise stock + transfers',
    ],
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
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: false,
    defaultCategories: ['Tablet', 'Capsule', 'Injection', 'Syrup', 'Vaccine', 'Surgical', 'General'],
    defaultUnits: ['Strip', 'Box', 'Case', 'Carton', 'Vial', 'Unit'],
    productPlaceholder: 'e.g. Amoxicillin 500mg × 10×10 Box',
    productPlaceholderHi: 'जैसे एमोक्सिसिलिन 500mg × 10×10 बॉक्स',
    productPlaceholderMr: 'उदा. अमोक्सिसिलिन 500mg × 10×10 बॉक्स',
    defaultPackage: 'wholesale',
  },
  electronicsdistributor: {
    type: 'electronicsdistributor',
    category: 'electronics_wholesale',
    label: 'Electronics Distributor',
    labelHi: 'इलेक्ट्रॉनिक्स वितरक',
    labelMr: 'इलेक्ट्रॉनिक्स वितरक',
    emoji: '📱',
    color: 'sky',
    gradient: 'from-sky-600 to-blue-600',
    description: 'Bulk electronics & appliance supply to retailers — model + warranty tracking',
    features: [
      'Party ledger + retailer credit terms',
      'Model number + warranty tracking',
      'Case ⇄ piece conversion',
      'Purchase invoice import with auto supplier ledger update',
      'Godown-wise stock + transfers',
    ],
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
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: false,
    hasSpecs: true,
    defaultCategories: ['Mobile', 'Accessories', 'Home Appliances', 'Kitchen Appliances', 'Audio', 'General'],
    defaultUnits: ['Piece', 'Box', 'Case', 'Carton', 'Unit'],
    productPlaceholder: 'e.g. Bluetooth Earphones × 50 Case',
    productPlaceholderHi: 'जैसे ब्लूटूथ ईयरफोन × 50 केस',
    productPlaceholderMr: 'उदा. ब्लूटूथ इयरफोन × 50 केस',
    defaultPackage: 'wholesale',
  },
  electronicswholesale: {
    type: 'electronicswholesale',
    category: 'electronics_wholesale',
    label: 'Electronics Wholesale',
    labelHi: 'इलेक्ट्रॉनिक्स थोक',
    labelMr: 'इलेक्ट्रॉनिक्स घाऊक',
    // electronicsdistributor and the Electronics category itself both
    // already use 📱 — pick something clearly different so all three don't
    // collapse into one indistinguishable icon in the same dropdown group.
    emoji: '📺',
    color: 'cyan',
    gradient: 'from-cyan-600 to-blue-700',
    description: 'General bulk electronics & appliance trading to retailers — multi-brand, no exclusive tie-up needed',
    features: [
      'Party ledger + retailer credit terms',
      'Model number + warranty tracking',
      'Multi-brand stock, no exclusive distributorship needed',
      'Purchase invoice import with auto supplier ledger update',
      'Godown-wise stock + transfers',
    ],
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
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: false,
    hasSpecs: true,
    defaultCategories: ['Mobile', 'Accessories', 'Home Appliances', 'Kitchen Appliances', 'Audio', 'General'],
    defaultUnits: ['Piece', 'Box', 'Case', 'Carton', 'Unit'],
    productPlaceholder: 'e.g. LED TV 32 inch × 10 Box',
    productPlaceholderHi: 'जैसे LED टीवी 32 इंच × 10 बॉक्स',
    productPlaceholderMr: 'उदा. LED टीव्ही 32 इंच × 10 बॉक्स',
    defaultPackage: 'wholesale',
  },
  wineliquordistributor: {
    type: 'wineliquordistributor',
    category: 'liquor_wholesale',
    label: 'Wine & Liquor Distributor',
    labelHi: 'वाइन और शराब वितरक',
    labelMr: 'वाईन आणि दारू वितरक',
    emoji: '🍷',
    color: 'rose',
    gradient: 'from-rose-600 to-amber-600',
    description: 'Bulk beer, wine & spirits supply to bars/shops — case ⇄ bottle conversion',
    features: [
      'Party ledger + retailer credit terms',
      'Case ⇄ bottle conversion',
      'Brand & alcohol % tracking',
      'Purchase invoice import with auto supplier ledger update',
      'Godown-wise stock + transfers',
    ],
    hasExpiry: false,
    hasExpiryRequired: false,
    hasBatch: true,
    hasDrugSchedule: false,
    hasSizes: false,
    hasShades: false,
    hasWarranty: false,
    hasModel: false,
    hasGender: false,
    hasFabric: false,
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: false,
    hasSpecs: true,
    hasLiquorSpecs: true,
    defaultCategories: ['Beer', 'Wine', 'Whisky', 'Rum', 'Vodka', 'Gin', 'Brandy', 'General'],
    defaultUnits: ['Bottle', 'Case', 'Carton', 'Pack', 'Unit'],
    productPlaceholder: 'e.g. Kingfisher Premium × 12 Case',
    productPlaceholderHi: 'जैसे किंगफिशर प्रीमियम × 12 केस',
    productPlaceholderMr: 'उदा. किंगफिशर प्रीमियम × 12 केस',
    sizeChart: ['90ml', '180ml', '275ml', '330ml', '375ml', '500ml', '650ml', '750ml', '1000ml'],
    defaultPackage: 'wholesale',
  },
  wineliquorwholesale: {
    type: 'wineliquorwholesale',
    category: 'liquor_wholesale',
    label: 'Wine & Liquor Wholesale',
    labelHi: 'वाइन और शराब थोक',
    labelMr: 'वाईन आणि दारू घाऊक',
    // wineliquordistributor and the Wine & Liquor category itself both
    // already use 🍷 — pick something clearly different.
    emoji: '🍺',
    color: 'orange',
    gradient: 'from-orange-600 to-rose-600',
    description: 'General bulk beer, wine & spirits trading to bars/shops — multi-brand, no exclusive tie-up needed',
    features: [
      'Party ledger + retailer credit terms',
      'Case ⇄ bottle conversion',
      'Multi-brand stock, no exclusive distributorship needed',
      'Purchase invoice import with auto supplier ledger update',
      'Godown-wise stock + transfers',
    ],
    hasExpiry: false,
    hasExpiryRequired: false,
    hasBatch: true,
    hasDrugSchedule: false,
    hasSizes: false,
    hasShades: false,
    hasWarranty: false,
    hasModel: false,
    hasGender: false,
    hasFabric: false,
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: false,
    hasSpecs: true,
    hasLiquorSpecs: true,
    defaultCategories: ['Beer', 'Wine', 'Whisky', 'Rum', 'Vodka', 'Gin', 'Brandy', 'General'],
    defaultUnits: ['Bottle', 'Case', 'Carton', 'Pack', 'Unit'],
    productPlaceholder: 'e.g. Assorted Beer Brands × 24 Case',
    productPlaceholderHi: 'जैसे मिश्रित बीयर ब्रांड × 24 केस',
    productPlaceholderMr: 'उदा. संमिश्र बिअर ब्रँड्स × 24 केस',
    sizeChart: ['90ml', '180ml', '275ml', '330ml', '375ml', '500ml', '650ml', '750ml', '1000ml'],
    defaultPackage: 'wholesale',
  },
  cosmeticsdistributor: {
    type: 'cosmeticsdistributor',
    category: 'cosmetics_wholesale',
    label: 'Cosmetics Distributor',
    labelHi: 'सौंदर्य प्रसाधन वितरक',
    labelMr: 'सौंदर्य प्रसाधने वितरक',
    emoji: '💄',
    color: 'pink',
    gradient: 'from-pink-600 to-rose-600',
    description: 'Bulk cosmetics & makeup supply to retailers — shade & batch tracking',
    features: [
      'Party ledger + retailer credit terms',
      'Shade / finish variant tracking',
      'Expiry tracked per batch',
      'Purchase invoice import with auto supplier ledger update',
      'Godown-wise stock + transfers',
    ],
    hasExpiry: true,
    hasExpiryRequired: false,
    hasBatch: true,
    hasDrugSchedule: false,
    hasSizes: false,
    hasShades: true,
    hasWarranty: false,
    hasModel: false,
    hasGender: false,
    hasFabric: false,
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: false,
    hasSpecs: true,
    defaultCategories: ['Lipstick', 'Foundation', 'Nail Polish', 'Kajal & Eyeliner', 'Perfume', 'General'],
    defaultUnits: ['Piece', 'Box', 'Case', 'Dozen', 'Set'],
    productPlaceholder: 'e.g. Matte Lipstick × 24 Box',
    productPlaceholderHi: 'जैसे मैट लिपस्टिक × 24 बॉक्स',
    productPlaceholderMr: 'उदा. मॅट लिपस्टिक × 24 बॉक्स',
    defaultPackage: 'wholesale',
  },
  beautywholesale: {
    type: 'beautywholesale',
    category: 'cosmetics_wholesale',
    label: 'Beauty Products Wholesale',
    labelHi: 'ब्यूटी प्रोडक्ट्स थोक',
    labelMr: 'ब्यूटी प्रोडक्ट्स घाऊक',
    emoji: '💅',
    color: 'fuchsia',
    gradient: 'from-fuchsia-600 to-pink-600',
    description: 'Bulk skincare, haircare & personal-care supply to salons & retailers',
    features: [
      'Party ledger + retailer/salon credit terms',
      'Expiry tracked per batch',
      'Case ⇄ piece conversion',
      'Purchase invoice import with auto supplier ledger update',
      'Godown-wise stock + transfers',
    ],
    hasExpiry: true,
    hasExpiryRequired: false,
    hasBatch: true,
    hasDrugSchedule: false,
    hasSizes: false,
    hasShades: false,
    hasWarranty: false,
    hasModel: false,
    hasGender: false,
    hasFabric: false,
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: false,
    defaultCategories: ['Skincare', 'Haircare', 'Face Wash', 'Sunscreen', 'Salon Supplies', 'General'],
    defaultUnits: ['Piece', 'Bottle', 'Box', 'Case', 'Set'],
    productPlaceholder: 'e.g. Face Wash 100ml × 48 Case',
    productPlaceholderHi: 'जैसे फेस वॉश 100ml × 48 केस',
    productPlaceholderMr: 'उदा. फेस वॉश 100ml × 48 केस',
    defaultPackage: 'wholesale',
  },

  // ── Service businesses ──────────────────────────────────────────────
  // Added for the Industry Category wizard (Profile → "Change Business
  // Category") — categories like Salon, Coaching, Repairs previously had no
  // matching BusinessType at all, so picking them saved the category label
  // but never changed which units/fields a shop saw. Each of these gives a
  // real, billable unit list (Session/Hour/Job/…) instead of leaving the
  // shop on whatever generic units it had before.
  accountingca: {
    type: 'accountingca', category: 'service',
    label: 'Accounting & CA', labelHi: 'अकाउंटिंग और सीए', labelMr: 'अकाउंटिंग आणि सीए',
    emoji: '📊', color: 'slate', gradient: 'from-slate-600 to-gray-600',
    description: 'Accounting, tax filing & CA practice services',
    features: ['Service/hour based billing', 'Retainer packages', 'Client history'],
    hasExpiry: false, hasExpiryRequired: false, hasBatch: false, hasDrugSchedule: false,
    hasSizes: false, hasShades: false, hasWarranty: false, hasModel: false, hasGender: false,
    hasFabric: false, hasWireSpecs: false, hasVoltWatt: false, hasSoleMaterial: false,
    defaultCategories: ['Tax Filing', 'Bookkeeping', 'Audit', 'GST Return', 'Payroll', 'Consultation', 'General'],
    defaultUnits: ['Service', 'Hour', 'Month', 'Package', 'Unit'],
    productPlaceholder: 'e.g. GST Return Filing (Monthly)',
    defaultPackage: 'dukan',
  },
  interiordesign: {
    type: 'interiordesign', category: 'service',
    label: 'Interior Designer', labelHi: 'इंटीरियर डिज़ाइनर', labelMr: 'इंटीरियर डिझायनर',
    emoji: '🎨', color: 'violet', gradient: 'from-violet-600 to-purple-600',
    description: 'Interior design & decor consultancy',
    features: ['Project-based billing', 'Sq. ft. based pricing', 'Client/site history'],
    hasExpiry: false, hasExpiryRequired: false, hasBatch: false, hasDrugSchedule: false,
    hasSizes: false, hasShades: false, hasWarranty: false, hasModel: false, hasGender: false,
    hasFabric: false, hasWireSpecs: false, hasVoltWatt: false, hasSoleMaterial: false,
    defaultCategories: ['Consultation', 'Design Package', 'Furnishing', 'Site Visit', 'Material Sourcing', 'General'],
    defaultUnits: ['Project', 'Sq Ft', 'Service', 'Unit'],
    productPlaceholder: 'e.g. 2BHK Full Interior Package',
    defaultPackage: 'dukan',
  },
  salonspa: {
    type: 'salonspa', category: 'service',
    label: 'Salon & Spa', labelHi: 'सैलून और स्पा', labelMr: 'सलून आणि स्पा',
    emoji: '💇', color: 'pink', gradient: 'from-pink-600 to-rose-600',
    description: 'Salon, spa & beauty parlour services',
    features: ['Per-session billing', 'Membership packages', 'Customer service history'],
    hasExpiry: false, hasExpiryRequired: false, hasBatch: false, hasDrugSchedule: false,
    hasSizes: false, hasShades: false, hasWarranty: false, hasModel: false, hasGender: false,
    hasFabric: false, hasWireSpecs: false, hasVoltWatt: false, hasSoleMaterial: false,
    defaultCategories: ['Haircut', 'Hair Color', 'Facial', 'Massage/Spa', 'Manicure/Pedicure', 'Bridal Package', 'General'],
    defaultUnits: ['Service', 'Session', 'Package', 'Unit'],
    productPlaceholder: 'e.g. Haircut & Styling',
    defaultPackage: 'dukan',
  },
  repairservices: {
    type: 'repairservices', category: 'service',
    label: 'Repairing / Plumbing / Electrician', labelHi: 'मरम्मत / प्लंबिंग / इलेक्ट्रीशियन', labelMr: 'दुरुस्ती / प्लंबिंग / इलेक्ट्रिशियन',
    emoji: '🔧', color: 'amber', gradient: 'from-amber-600 to-orange-600',
    description: 'Repair, plumbing & electrical service jobs',
    features: ['Job/visit based billing', 'Parts + labour split', 'Service history'],
    hasExpiry: false, hasExpiryRequired: false, hasBatch: false, hasDrugSchedule: false,
    hasSizes: false, hasShades: false, hasWarranty: true, hasModel: false, hasGender: false,
    hasFabric: false, hasWireSpecs: false, hasVoltWatt: false, hasSoleMaterial: false,
    defaultCategories: ['Plumbing', 'Electrical', 'Appliance Repair', 'Labour Charge', 'Spare Part', 'General'],
    defaultUnits: ['Job', 'Visit', 'Hour', 'Piece', 'Unit'],
    productPlaceholder: 'e.g. Tap Repair Visit',
    defaultPackage: 'dukan',
  },
  restauranthotel: {
    type: 'restauranthotel', category: 'service',
    label: 'Restaurant / Hotel', labelHi: 'रेस्टोरेंट / होटल', labelMr: 'रेस्टॉरंट / हॉटेल',
    emoji: '🍽️', color: 'red', gradient: 'from-red-600 to-orange-600',
    description: 'Restaurant, dhaba & hotel/lodging services',
    features: ['Plate/portion billing', 'Room-night billing', 'Ingredient expiry tracking'],
    hasExpiry: true, hasExpiryRequired: false, hasBatch: false, hasDrugSchedule: false,
    hasSizes: false, hasShades: false, hasWarranty: false, hasModel: false, hasGender: false,
    hasFabric: false, hasWireSpecs: false, hasVoltWatt: false, hasSoleMaterial: false,
    defaultCategories: ['Starters', 'Main Course', 'Beverages', 'Desserts', 'Room Booking', 'General'],
    defaultUnits: ['Plate', 'Piece', 'Kg', 'Room Night', 'Unit'],
    productPlaceholder: 'e.g. Paneer Butter Masala (Full)',
    defaultPackage: 'dukan',
  },
  laundryservice: {
    type: 'laundryservice', category: 'service',
    label: 'Laundry / Washing / Dry Clean', labelHi: 'लॉन्ड्री / धुलाई / ड्राई क्लीन', labelMr: 'लॉन्ड्री / धुलाई / ड्राय क्लीन',
    emoji: '🧺', color: 'sky', gradient: 'from-sky-600 to-blue-600',
    description: 'Laundry, washing & dry-cleaning services',
    features: ['Per-piece / per-kg billing', 'Pickup-drop tracking'],
    hasExpiry: false, hasExpiryRequired: false, hasBatch: false, hasDrugSchedule: false,
    hasSizes: false, hasShades: false, hasWarranty: false, hasModel: false, hasGender: false,
    hasFabric: false, hasWireSpecs: false, hasVoltWatt: false, hasSoleMaterial: false,
    defaultCategories: ['Wash & Fold', 'Dry Clean', 'Ironing', 'Stain Removal', 'General'],
    defaultUnits: ['Piece', 'Kg', 'Service', 'Unit'],
    productPlaceholder: 'e.g. Shirt Dry Clean',
    defaultPackage: 'dukan',
  },
  coachingtraining: {
    type: 'coachingtraining', category: 'service',
    label: 'Coaching & Training', labelHi: 'कोचिंग और प्रशिक्षण', labelMr: 'कोचिंग आणि प्रशिक्षण',
    emoji: '🎓', color: 'indigo', gradient: 'from-indigo-600 to-blue-600',
    description: 'Coaching classes, tuition & training institutes',
    features: ['Course/batch billing', 'Monthly fee tracking', 'Student history'],
    hasExpiry: false, hasExpiryRequired: false, hasBatch: false, hasDrugSchedule: false,
    hasSizes: false, hasShades: false, hasWarranty: false, hasModel: false, hasGender: false,
    hasFabric: false, hasWireSpecs: false, hasVoltWatt: false, hasSoleMaterial: false,
    defaultCategories: ['Course Fee', 'Admission Fee', 'Study Material', 'Test Series', 'General'],
    defaultUnits: ['Course', 'Month', 'Session', 'Batch', 'Unit'],
    productPlaceholder: 'e.g. 10th Grade Batch (Monthly)',
    defaultPackage: 'dukan',
  },
  rentingleasing: {
    type: 'rentingleasing', category: 'service',
    label: 'Renting & Leasing', labelHi: 'किराया और लीजिंग', labelMr: 'भाडे आणि लीजिंग',
    emoji: '📋', color: 'teal', gradient: 'from-teal-600 to-cyan-600',
    description: 'Equipment, vehicle & property rental/leasing',
    features: ['Day/month based billing', 'Security deposit tracking'],
    hasExpiry: false, hasExpiryRequired: false, hasBatch: false, hasDrugSchedule: false,
    hasSizes: false, hasShades: false, hasWarranty: false, hasModel: true, hasGender: false,
    hasFabric: false, hasWireSpecs: false, hasVoltWatt: false, hasSoleMaterial: false,
    defaultCategories: ['Equipment Rent', 'Vehicle Rent', 'Property Rent', 'Deposit', 'General'],
    defaultUnits: ['Day', 'Month', 'Piece', 'Unit'],
    productPlaceholder: 'e.g. Generator (Per Day)',
    defaultPackage: 'dukan',
  },
  fitnesscenter: {
    type: 'fitnesscenter', category: 'service',
    label: 'Fitness Center', labelHi: 'फिटनेस सेंटर', labelMr: 'फिटनेस सेंटर',
    emoji: '🏋️', color: 'lime', gradient: 'from-lime-600 to-green-600',
    description: 'Gym, yoga & fitness training centers',
    features: ['Membership billing', 'Session packages', 'Member history'],
    hasExpiry: false, hasExpiryRequired: false, hasBatch: false, hasDrugSchedule: false,
    hasSizes: false, hasShades: false, hasWarranty: false, hasModel: false, hasGender: false,
    hasFabric: false, hasWireSpecs: false, hasVoltWatt: false, hasSoleMaterial: false,
    defaultCategories: ['Membership', 'Personal Training', 'Diet Plan', 'Supplements', 'General'],
    defaultUnits: ['Month', 'Session', 'Package', 'Unit'],
    productPlaceholder: 'e.g. Gym Membership (Monthly)',
    defaultPackage: 'dukan',
  },
  realestate: {
    type: 'realestate', category: 'service',
    label: 'Real Estate', labelHi: 'रियल एस्टेट', labelMr: 'रिअल इस्टेट',
    emoji: '🏢', color: 'stone', gradient: 'from-stone-600 to-neutral-600',
    description: 'Real estate brokerage & property services',
    features: ['Sq. ft. / unit based listing', 'Brokerage tracking'],
    hasExpiry: false, hasExpiryRequired: false, hasBatch: false, hasDrugSchedule: false,
    hasSizes: false, hasShades: false, hasWarranty: false, hasModel: false, hasGender: false,
    hasFabric: false, hasWireSpecs: false, hasVoltWatt: false, hasSoleMaterial: false,
    defaultCategories: ['Property Sale', 'Property Rent', 'Brokerage', 'Documentation', 'General'],
    defaultUnits: ['Sq Ft', 'Unit', 'Property'],
    productPlaceholder: 'e.g. 2BHK Flat Sale',
    defaultPackage: 'dukan',
  },
  ngotrust: {
    type: 'ngotrust', category: 'service',
    label: 'NGO & Charitable Trust', labelHi: 'एनजीओ और चैरिटेबल ट्रस्ट', labelMr: 'एनजीओ आणि धर्मादाय संस्था',
    emoji: '🤝', color: 'emerald', gradient: 'from-emerald-600 to-green-600',
    description: 'NGO, trust & charitable organisation operations',
    features: ['Donation & kit tracking', 'Beneficiary records'],
    hasExpiry: false, hasExpiryRequired: false, hasBatch: false, hasDrugSchedule: false,
    hasSizes: false, hasShades: false, hasWarranty: false, hasModel: false, hasGender: false,
    hasFabric: false, hasWireSpecs: false, hasVoltWatt: false, hasSoleMaterial: false,
    defaultCategories: ['Donation Kit', 'Ration Kit', 'Medical Aid', 'Education Aid', 'General'],
    defaultUnits: ['Unit', 'Piece', 'Kit'],
    productPlaceholder: 'e.g. Ration Kit',
    defaultPackage: 'dukan',
  },
  toursandtravel: {
    type: 'toursandtravel', category: 'service',
    label: 'Tours & Travels', labelHi: 'टूर्स और ट्रैवल्स', labelMr: 'टूर्स आणि ट्रॅव्हल्स',
    emoji: '✈️', color: 'cyan', gradient: 'from-cyan-600 to-sky-600',
    description: 'Travel agency, tour packages & ticketing',
    features: ['Package/ticket billing', 'Per-person pricing'],
    hasExpiry: false, hasExpiryRequired: false, hasBatch: false, hasDrugSchedule: false,
    hasSizes: false, hasShades: false, hasWarranty: false, hasModel: false, hasGender: false,
    hasFabric: false, hasWireSpecs: false, hasVoltWatt: false, hasSoleMaterial: false,
    defaultCategories: ['Tour Package', 'Flight Ticket', 'Bus Ticket', 'Hotel Booking', 'Visa Service', 'General'],
    defaultUnits: ['Package', 'Person', 'Day', 'Ticket'],
    productPlaceholder: 'e.g. Goa Tour Package (3N/4D)',
    defaultPackage: 'dukan',
  },

  // ── Retail businesses without a prior equivalent ────────────────────
  autoparts: {
    type: 'autoparts', category: 'retail',
    label: 'Automobiles / Auto Parts', labelHi: 'ऑटोमोबाइल / ऑटो पार्ट्स', labelMr: 'ऑटोमोबाइल / ऑटो पार्ट्स',
    emoji: '🚗', color: 'zinc', gradient: 'from-zinc-600 to-slate-600',
    description: 'Automobile spare parts & accessories',
    features: ['Model-wise parts', 'Warranty tracking'],
    hasExpiry: false, hasExpiryRequired: false, hasBatch: false, hasDrugSchedule: false,
    hasSizes: false, hasShades: false, hasWarranty: true, hasModel: true, hasGender: false,
    hasFabric: false, hasWireSpecs: false, hasVoltWatt: false, hasSoleMaterial: false,
    defaultCategories: ['Engine Parts', 'Body Parts', 'Electricals', 'Tyres', 'Lubricants & Oils', 'Accessories', 'General'],
    defaultUnits: ['Piece', 'Set', 'Litre', 'Unit'],
    productPlaceholder: 'e.g. Brake Pad (Honda City)',
    defaultPackage: 'dukan',
  },
  constructionmaterials: {
    type: 'constructionmaterials', category: 'retail',
    label: 'Construction Materials & Equipment', labelHi: 'निर्माण सामग्री और उपकरण', labelMr: 'बांधकाम साहित्य आणि उपकरणे',
    emoji: '🏗️', color: 'orange', gradient: 'from-orange-600 to-amber-600',
    description: 'Cement, sand, tiles & construction equipment',
    features: ['Bag/Ton based units', 'Bulk quantity billing'],
    hasExpiry: false, hasExpiryRequired: false, hasBatch: false, hasDrugSchedule: false,
    hasSizes: false, hasShades: false, hasWarranty: false, hasModel: false, hasGender: false,
    hasFabric: false, hasWireSpecs: false, hasVoltWatt: false, hasSoleMaterial: false,
    defaultCategories: ['Cement', 'Sand & Aggregate', 'Steel & TMT', 'Tiles & Sanitary', 'Paints', 'Equipment', 'General'],
    defaultUnits: ['Bag', 'Kg', 'Ton', 'Piece', 'Bundle', 'Cubic Ft'],
    productPlaceholder: 'e.g. UltraTech Cement (50kg Bag)',
    defaultPackage: 'dukan',
  },
  furniture: {
    type: 'furniture', category: 'retail',
    label: 'Furniture', labelHi: 'फर्नीचर', labelMr: 'फर्निचर',
    emoji: '🪑', color: 'yellow', gradient: 'from-yellow-600 to-amber-600',
    description: 'Home & office furniture',
    features: ['Piece/set based billing'],
    hasExpiry: false, hasExpiryRequired: false, hasBatch: false, hasDrugSchedule: false,
    hasSizes: false, hasShades: false, hasWarranty: true, hasModel: false, hasGender: false,
    hasFabric: false, hasWireSpecs: false, hasVoltWatt: false, hasSoleMaterial: false,
    defaultCategories: ['Sofa', 'Bed', 'Dining Set', 'Wardrobe', 'Office Furniture', 'General'],
    defaultUnits: ['Piece', 'Set'],
    productPlaceholder: 'e.g. 3-Seater Sofa',
    defaultPackage: 'dukan',
  },
  jewellery: {
    type: 'jewellery', category: 'retail',
    label: 'Jewellery & Gems', labelHi: 'आभूषण और रत्न', labelMr: 'दागिने आणि रत्ने',
    emoji: '💎', color: 'yellow', gradient: 'from-yellow-500 to-amber-500',
    description: 'Gold, silver, gems & jewellery',
    features: ['Gram/carat based units'],
    hasExpiry: false, hasExpiryRequired: false, hasBatch: false, hasDrugSchedule: false,
    hasSizes: false, hasShades: false, hasWarranty: false, hasModel: false, hasGender: false,
    hasFabric: false, hasWireSpecs: false, hasVoltWatt: false, hasSoleMaterial: false,
    defaultCategories: ['Gold Jewellery', 'Silver Jewellery', 'Diamond', 'Gemstones', 'Artificial Jewellery', 'General'],
    defaultUnits: ['Gram', 'Piece', 'Carat', 'Set'],
    productPlaceholder: 'e.g. Gold Ring (22K)',
    defaultPackage: 'dukan',
  },
  hardware: {
    type: 'hardware', category: 'retail',
    label: 'Hardware Store', labelHi: 'हार्डवेयर स्टोर', labelMr: 'हार्डवेअर स्टोअर',
    emoji: '🔨', color: 'gray', gradient: 'from-gray-600 to-slate-600',
    description: 'Hardware, tools & building fittings',
    features: ['Piece/Kg/Box based units'],
    hasExpiry: false, hasExpiryRequired: false, hasBatch: false, hasDrugSchedule: false,
    hasSizes: false, hasShades: false, hasWarranty: false, hasModel: false, hasGender: false,
    hasFabric: false, hasWireSpecs: false, hasVoltWatt: false, hasSoleMaterial: false,
    defaultCategories: ['Hand Tools', 'Power Tools', 'Fasteners', 'Pipes & Fittings', 'Locks & Fittings', 'Paints', 'General'],
    defaultUnits: ['Piece', 'Kg', 'Box', 'Set', 'Meter'],
    productPlaceholder: 'e.g. Steel Hammer 500g',
    defaultPackage: 'dukan',
  },
  paperproducts: {
    type: 'paperproducts', category: 'retail',
    label: 'Paper & Paper Products', labelHi: 'कागज और कागज उत्पाद', labelMr: 'कागद आणि कागद उत्पादने',
    emoji: '📄', color: 'neutral', gradient: 'from-neutral-600 to-stone-600',
    description: 'Paper, printing & packaging paper products',
    features: ['Ream/Roll based units'],
    hasExpiry: false, hasExpiryRequired: false, hasBatch: false, hasDrugSchedule: false,
    hasSizes: false, hasShades: false, hasWarranty: false, hasModel: false, hasGender: false,
    hasFabric: false, hasWireSpecs: false, hasVoltWatt: false, hasSoleMaterial: false,
    defaultCategories: ['Printing Paper', 'Packaging Paper', 'Tissue & Disposables', 'Cardboard', 'General'],
    defaultUnits: ['Ream', 'Kg', 'Piece', 'Roll', 'Box'],
    productPlaceholder: 'e.g. A4 Paper (Ream)',
    defaultPackage: 'dukan',
  },
  sweetbakery: {
    type: 'sweetbakery', category: 'retail',
    label: 'Sweet Shop / Bakery', labelHi: 'मिठाई की दुकान / बेकरी', labelMr: 'मिठाई दुकान / बेकरी',
    emoji: '🍰', color: 'rose', gradient: 'from-rose-600 to-pink-600',
    description: 'Sweets, snacks & bakery items',
    features: ['Kg/piece based billing', 'Expiry tracking for perishables'],
    hasExpiry: true, hasExpiryRequired: false, hasBatch: false, hasDrugSchedule: false,
    hasSizes: false, hasShades: false, hasWarranty: false, hasModel: false, hasGender: false,
    hasFabric: false, hasWireSpecs: false, hasVoltWatt: false, hasSoleMaterial: false,
    defaultCategories: ['Sweets', 'Namkeen', 'Cakes & Pastries', 'Bread & Buns', 'Cookies', 'General'],
    defaultUnits: ['Kg', 'Piece', 'Box', 'Dozen'],
    productPlaceholder: 'e.g. Kaju Katli (1kg)',
    defaultPackage: 'dukan',
  },
  giftstoys: {
    type: 'giftstoys', category: 'retail',
    label: 'Gifts & Toys', labelHi: 'उपहार और खिलौने', labelMr: 'भेटवस्तू आणि खेळणी',
    emoji: '🎁', color: 'fuchsia', gradient: 'from-fuchsia-600 to-purple-600',
    description: 'Gift items & toys',
    features: ['Piece/set based billing'],
    hasExpiry: false, hasExpiryRequired: false, hasBatch: false, hasDrugSchedule: false,
    hasSizes: false, hasShades: false, hasWarranty: false, hasModel: false, hasGender: false,
    hasFabric: false, hasWireSpecs: false, hasVoltWatt: false, hasSoleMaterial: false,
    defaultCategories: ['Toys', 'Gift Items', 'Greeting Cards', 'Party Supplies', 'General'],
    defaultUnits: ['Piece', 'Set', 'Box'],
    productPlaceholder: 'e.g. Remote Control Car',
    defaultPackage: 'dukan',
  },
  petrolstation: {
    type: 'petrolstation', category: 'retail',
    label: 'Petroleum Bulk Stations / Petrol', labelHi: 'पेट्रोलियम स्टेशन / पेट्रोल', labelMr: 'पेट्रोलियम स्टेशन / पेट्रोल',
    emoji: '⛽', color: 'red', gradient: 'from-red-600 to-yellow-600',
    description: 'Petrol pump & bulk fuel stations',
    features: ['Litre/KL based billing'],
    hasExpiry: false, hasExpiryRequired: false, hasBatch: false, hasDrugSchedule: false,
    hasSizes: false, hasShades: false, hasWarranty: false, hasModel: false, hasGender: false,
    hasFabric: false, hasWireSpecs: false, hasVoltWatt: false, hasSoleMaterial: false,
    defaultCategories: ['Petrol', 'Diesel', 'CNG', 'Lubricants', 'General'],
    defaultUnits: ['Litre', 'KL'],
    productPlaceholder: 'e.g. Petrol (per Litre)',
    defaultPackage: 'dukan',
  },
  oilgas: {
    type: 'oilgas', category: 'retail',
    label: 'Oil & Gas', labelHi: 'तेल और गैस', labelMr: 'तेल आणि गॅस',
    emoji: '🛢️', color: 'orange', gradient: 'from-orange-600 to-red-600',
    description: 'Cooking gas, industrial oil & gas cylinder trade',
    features: ['Litre/Cylinder based billing'],
    hasExpiry: false, hasExpiryRequired: false, hasBatch: false, hasDrugSchedule: false,
    hasSizes: false, hasShades: false, hasWarranty: false, hasModel: false, hasGender: false,
    hasFabric: false, hasWireSpecs: false, hasVoltWatt: false, hasSoleMaterial: false,
    defaultCategories: ['LPG Cylinder', 'Industrial Gas', 'Lubricant Oil', 'General'],
    defaultUnits: ['Litre', 'KL', 'Cylinder', 'Kg'],
    productPlaceholder: 'e.g. LPG Cylinder (14.2kg)',
    defaultPackage: 'dukan',
  },
};

export function getBusinessConfig(type: BusinessType | string): BusinessConfig {
  return BUSINESS_CONFIGS[type as BusinessType] ?? BUSINESS_CONFIGS.general;
}

export const ALL_BUSINESS_TYPES = Object.values(BUSINESS_CONFIGS).filter(c => !c.hidden);

// ─── Mill sub-types ─────────────────────────────────────────────────────
// The specific kind of mill / grain-processing operation a shop runs.
// Persisted in Shop.businessSubtype whenever businessType='millprocessing'.
// The dropdown label + emoji shows in both the landing signup and the
// in-app Profile page — one source of truth for both.
export interface MillTypeOption {
  key: string;
  label: string;
  emoji: string;
}

export const MILL_TYPES: MillTypeOption[] = [
  { key: 'ricemill',        label: 'Rice Mill',                          emoji: '🌾' },
  { key: 'bhagarmill',      label: 'Bhagar / Barnyard Millet Mill',      emoji: '🌾' },
  { key: 'wheatflourmill',  label: 'Wheat Flour Mill',                   emoji: '🌽' },
  { key: 'jowarmill',       label: 'Jowar / Sorghum Mill',               emoji: '🌾' },
  { key: 'bajramill',       label: 'Bajra / Pearl Millet Mill',          emoji: '🌾' },
  { key: 'maizemill',       label: 'Maize / Corn Mill',                  emoji: '🌽' },
  { key: 'dalmill',         label: 'Dal Mill / Pulse Mill',              emoji: '🫘' },
  { key: 'grainprocessing', label: 'Grain Processing Mill',              emoji: '🌾' },
  { key: 'oilmill',         label: 'Oil Mill',                           emoji: '🛢️' },
  { key: 'spicemill',       label: 'Spice Grinding Mill',                emoji: '🌶️' },
  { key: 'multigrainmill',  label: 'Multi-Grain Mill',                   emoji: '🌾' },
  { key: 'flourgrain',      label: 'Flour & Grain Processing',           emoji: '🌾' },
  { key: 'pohamill',        label: 'Poha / Flattened Rice Mill',         emoji: '🍚' },
  { key: 'ravamill',        label: 'Rava / Semolina Mill',               emoji: '🌾' },
  { key: 'othermill',       label: 'Other Mill / Processing',            emoji: '⚙️' },
];

// ─── Mill product types ─────────────────────────────────────────────────
// The raw materials / finished products this shop actually handles. Stored
// as a Postgres String[] in Shop.businessProducts; the shop can process
// several at once (e.g. Rice + Dal + Flour) without needing multiple
// business accounts.
export interface MillProductOption {
  key: string;
  label: string;
}

// ─── Mill Product classification (Product.millCategory) ────────────────
// Every product in a mill catalogue is one of seven generic kinds — none of
// them named after any specific mill (Rice/Wheat/Dal/Bhagar/…), so the same
// 7-way split works whether the shop is a Rice Mill, Flour Mill, Dal Mill,
// Millet Mill, Oil Mill, or any future mill type. Powers the Products form
// dropdown, the Product Type filter, Dashboard's Raw/Finished split, and the
// Sidebar shortcuts to /raw-material / /finished-goods / /by-products.
// The key here is EXACTLY the value stored in Product.millCategory (see
// prisma/schema.prisma) — the API and DB agree on the same slug.
export interface MillCategoryOption {
  key: 'raw_material' | 'finished_goods' | 'by_product' | 'waste' | 'packaging_material' | 'consumable' | 'other';
  label: string;
  labelHi: string;
  labelMr: string;
  emoji: string;
  // Tailwind color used on chips/pills — same palette as the sidebar
  // accents so the visual language stays consistent.
  accent: 'amber' | 'emerald' | 'blue' | 'slate' | 'purple' | 'rose';
  description: string;
}

export const MILL_CATEGORIES: MillCategoryOption[] = [
  { key: 'raw_material',       label: 'Raw Material',       labelHi: 'कच्चा माल',     labelMr: 'कच्चा माल',     emoji: '🌾', accent: 'amber',   description: 'Paddy, Wheat, Bajra, Jowar, Oil-seeds — inputs that go into production.' },
  { key: 'finished_goods',     label: 'Finished Goods',     labelHi: 'तैयार माल',      labelMr: 'तयार माल',      emoji: '📦', accent: 'emerald', description: 'Rice, Flour, Oil, Bhagar — sellable output from the mill.' },
  { key: 'by_product',         label: 'By-Product',         labelHi: 'सह-उत्पाद',      labelMr: 'उप-उत्पादन',    emoji: '🌾', accent: 'blue',    description: 'Bran, Husk, Chuni, Oil Cake — secondary output that is also sold.' },
  { key: 'waste',              label: 'Waste / Rejection',  labelHi: 'अपशिष्ट',        labelMr: 'कचरा / नकार',   emoji: '♻️', accent: 'slate',   description: 'Damaged stock, process waste, rejected material — tracked for loss %.' },
  { key: 'packaging_material', label: 'Packaging Material', labelHi: 'पैकेजिंग सामग्री', labelMr: 'पॅकेजिंग साहित्य', emoji: '🎁', accent: 'purple',  description: 'PP Bags, Pouches, Boxes, Labels — used to pack the finished goods.' },
  { key: 'consumable',         label: 'Consumable',         labelHi: 'उपभोज्य',        labelMr: 'उपभोग्य',       emoji: '🧴', accent: 'rose',    description: 'Machine oil, stitching thread, cleaning supplies — used up in operations, not sold.' },
  { key: 'other',              label: 'Other',               labelHi: 'अन्य',           labelMr: 'इतर',           emoji: '📋', accent: 'slate',   description: 'Anything that doesn’t fit the categories above.' },
];

// ─── Quality / Lab grading thresholds (QualityTest) ─────────────────────
// Generic grain-grading bands — deliberately one shared set rather than a
// per-grain-type config table (paddy vs. wheat vs. dal each have their own
// real trade thresholds, but that's a materially bigger feature than v1
// needs). Good enough to flag an obviously bad lot; the shopkeeper's own
// accept/reject `decision` on QualityTest always wins over this suggestion.
export const QUALITY_FLAG_THRESHOLDS = {
  moisturePct: { amber: 14, red: 16 },
  foreignMatterPct: { amber: 1, red: 2 },
  brokenPct: { amber: 3, red: 5 },
  damagedPct: { amber: 1, red: 3 },
} as const;

export type QualityFlag = 'green' | 'amber' | 'red';

export function computeQualityFlag(reading: {
  moisturePct?: number | null; foreignMatterPct?: number | null;
  brokenPct?: number | null; damagedPct?: number | null;
}, thresholds: Record<'moisturePct' | 'foreignMatterPct' | 'brokenPct' | 'damagedPct', { amber: number; red: number }> = QUALITY_FLAG_THRESHOLDS): QualityFlag {
  const t = thresholds;
  const checks: [number | null | undefined, { amber: number; red: number }][] = [
    [reading.moisturePct, t.moisturePct],
    [reading.foreignMatterPct, t.foreignMatterPct],
    [reading.brokenPct, t.brokenPct],
    [reading.damagedPct, t.damagedPct],
  ];
  let worst: QualityFlag = 'green';
  for (const [value, band] of checks) {
    if (value == null || !isFinite(value)) continue;
    if (value >= band.red) return 'red'; // worst possible, short-circuit
    if (value >= band.amber) worst = 'amber';
  }
  return worst;
}

// ─── Party Types (Customer.customerType) ────────────────────────────────
// A single Customer row can play any of four roles in a mill's ledger.
// Extends the pre-existing 'customer' / 'party' distinction with the two
// mill-specific relationships. Slugs stay short (broker/transporter) so
// the customer_type column stays compact.
export interface PartyTypeOption {
  key: 'customer' | 'party' | 'broker' | 'transporter';
  label: string;
  emoji: string;
  // Included in the Party page tab list only when true — every mill and
  // wholesale-tier shop sees all four; retail-tier shops keep the
  // existing Customer / Party split only.
  mill: boolean;
  description: string;
}

export const PARTY_TYPES: PartyTypeOption[] = [
  { key: 'party',       label: 'Party',       emoji: '🧑‍💼', mill: true, description: 'Wholesale party you buy from or sell to (existing).' },
  { key: 'customer',    label: 'Customer',    emoji: '🛒',    mill: true, description: 'Retail customer / dukandar (existing).' },
  { key: 'broker',      label: 'Broker',      emoji: '🤝',    mill: true, description: 'Middleman who brings a deal — earns commission (dalali) per bill.' },
  { key: 'transporter', label: 'Transporter', emoji: '🚚',    mill: true, description: 'Truck operator / freight vendor — carries goods, billed separately.' },
];

export const MILL_PRODUCT_TYPES: MillProductOption[] = [
  { key: 'Rice',      label: 'Rice' },
  { key: 'Wheat',     label: 'Wheat' },
  { key: 'Jowar',     label: 'Jowar' },
  { key: 'Bajra',     label: 'Bajra' },
  { key: 'Maize',     label: 'Maize' },
  { key: 'Pulses',    label: 'Pulses / Dal' },
  { key: 'OilSeeds',  label: 'Oil Seeds' },
  { key: 'Bhagar',    label: 'Bhagar / Millet' },
  { key: 'Spices',    label: 'Spices' },
  { key: 'Poha',      label: 'Poha' },
  { key: 'Rava',      label: 'Rava / Semolina' },
  { key: 'Other',     label: 'Other' },
];

/** ALL_BUSINESS_TYPES grouped and ordered by category, for pickers that show section headers. */
export const BUSINESS_TYPES_BY_CATEGORY: { meta: BusinessCategoryMeta; types: BusinessConfig[] }[] =
  BUSINESS_CATEGORY_ORDER.map(cat => ({
    meta: BUSINESS_CATEGORIES[cat],
    types: ALL_BUSINESS_TYPES.filter(c => c.category === cat),
  }));

/**
 * A two-dimensional spec matrix tailored to a product's CATEGORY.
 * `typeOptions` = primary dimension (e.g. battery type), `sizeChart` = secondary (e.g. capacity).
 */
export interface CategoryVariantSpec {
  typeLabel: string;
  typeOptions: string[];
  sizeLabel: string;
  sizeChart: string[];
}

type SpecRule = { match: string[]; spec: CategoryVariantSpec };

// Appliances / electronics / electrical (used by electronics, electric, general, medical devices).
// Ordered keyword → spec rules. Category names are free-text, so we match on keywords.
// ORDER MATTERS: more specific / collision-prone rules come first (e.g. "hair dryer" before
// any "dryer", "headphone" before "phone", "fan heater" before "fan", "vacuum" before "ac").
const APPLIANCE_RULES: SpecRule[] = [
  // ───────── Personal care / grooming ─────────
  {
    match: ['hair dryer', 'hair drier', 'blow dry'],
    spec: { typeLabel: 'Type', typeOptions: ['Foldable', 'Professional', 'Ionic', 'Travel'], sizeLabel: 'Watt', sizeChart: ['1000W', '1200W', '1500W', '1800W', '2000W', '2200W'] },
  },
  {
    match: ['straighten', 'hair curler', 'curler', 'styler'],
    spec: { typeLabel: 'Type', typeOptions: ['Straightener', 'Curler', '2-in-1', 'Crimper'], sizeLabel: 'Watt', sizeChart: ['35W', '40W', '45W', '50W', '65W'] },
  },
  {
    match: ['trimmer', 'shaver', 'groom', 'clipper', 'epilator'],
    spec: { typeLabel: 'Type', typeOptions: ['Beard Trimmer', 'Multi-Grooming', 'Body Groomer', 'Nose Trimmer', 'Shaver', 'Hair Clipper', 'Epilator'], sizeLabel: 'Runtime', sizeChart: ['30 min', '45 min', '60 min', '90 min', '120 min'] },
  },

  // ───────── Kitchen / cooking appliances ─────────
  {
    match: ['mixer', 'grinder', 'blender', 'juicer', 'food processor', 'chopper'],
    spec: { typeLabel: 'Type', typeOptions: ['Mixer Grinder', 'Juicer Mixer', 'Hand Blender', 'Food Processor', 'Wet Grinder', 'Chopper'], sizeLabel: 'Watt', sizeChart: ['500W', '550W', '600W', '750W', '1000W'] },
  },
  {
    match: ['induction', 'cooktop', 'hot plate'],
    spec: { typeLabel: 'Type', typeOptions: ['Induction', 'Hot Plate'], sizeLabel: 'Watt', sizeChart: ['1200W', '1500W', '1800W', '2000W', '2100W'] },
  },
  {
    match: ['kettle'],
    spec: { typeLabel: 'Type', typeOptions: ['Electric Kettle', 'Multi Kettle', 'Travel Kettle'], sizeLabel: 'Capacity', sizeChart: ['0.5L', '1L', '1.2L', '1.5L', '1.8L', '2L'] },
  },
  {
    match: ['toaster', 'sandwich', 'griller'],
    spec: { typeLabel: 'Type', typeOptions: ['Pop-up Toaster', 'Sandwich Maker', 'Grill Maker'], sizeLabel: 'Spec', sizeChart: ['2 Slice', '4 Slice', '700W', '800W', '1000W'] },
  },
  {
    match: ['rice cooker'],
    spec: { typeLabel: 'Type', typeOptions: ['Electric', 'Multi Cooker'], sizeLabel: 'Capacity', sizeChart: ['1L', '1.5L', '1.8L', '2.2L', '2.8L'] },
  },
  {
    match: ['air fryer', 'fryer'],
    spec: { typeLabel: 'Type', typeOptions: ['Air Fryer', 'Digital', 'Manual'], sizeLabel: 'Capacity', sizeChart: ['2L', '3.5L', '4L', '5L', '6L', '8L'] },
  },
  {
    match: ['microwave', 'oven', 'otg'],
    spec: { typeLabel: 'Type', typeOptions: ['Solo', 'Grill', 'Convection', 'OTG'], sizeLabel: 'Capacity', sizeChart: ['20L', '23L', '25L', '28L', '30L', '32L'] },
  },
  {
    match: ['gas stove', 'gas cooktop', 'hob', 'cooktop gas'],
    spec: { typeLabel: 'Type', typeOptions: ['Manual', 'Auto Ignition', 'Glass Top', 'Hob'], sizeLabel: 'Burners', sizeChart: ['2 Burner', '3 Burner', '4 Burner', '5 Burner'] },
  },

  // ───────── Garment / cleaning ─────────
  {
    match: ['iron', 'garment steam'],
    spec: { typeLabel: 'Type', typeOptions: ['Dry Iron', 'Steam Iron', 'Garment Steamer'], sizeLabel: 'Watt', sizeChart: ['1000W', '1100W', '1200W', '1400W', '1600W', '2000W', '2400W'] },
  },
  {
    match: ['vacuum'],
    spec: { typeLabel: 'Type', typeOptions: ['Handheld', 'Upright', 'Robot', 'Wet & Dry', 'Canister'], sizeLabel: 'Watt', sizeChart: ['600W', '1000W', '1200W', '1400W', '1600W'] },
  },
  {
    match: ['washing', 'washer'],
    spec: { typeLabel: 'Type', typeOptions: ['Top Load', 'Front Load', 'Semi Automatic', 'Fully Automatic'], sizeLabel: 'Capacity', sizeChart: ['6kg', '6.5kg', '7kg', '7.5kg', '8kg', '9kg', '10kg'] },
  },

  // ───────── Cooling / heating ─────────
  {
    match: ['geyser', 'water heater'],
    spec: { typeLabel: 'Type', typeOptions: ['Instant', 'Storage', 'Gas'], sizeLabel: 'Capacity', sizeChart: ['1L', '3L', '6L', '10L', '15L', '25L'] },
  },
  {
    // Heater before fan so "Fan Heater" is matched here, not as a fan.
    match: ['room heater', 'heater', 'blower'],
    spec: { typeLabel: 'Type', typeOptions: ['Fan Heater', 'Halogen', 'Oil Filled', 'Infrared', 'Blower'], sizeLabel: 'Watt', sizeChart: ['1000W', '1200W', '1500W', '2000W', '2400W'] },
  },
  {
    match: ['cooler'],
    spec: { typeLabel: 'Type', typeOptions: ['Personal', 'Desert', 'Tower', 'Window'], sizeLabel: 'Capacity', sizeChart: ['20L', '35L', '50L', '70L', '90L', '100L'] },
  },
  {
    // Avoid bare 'ac' (collides with "vacuum" etc.) — match explicit phrases instead.
    match: ['air condition', 'air-condition', 'split ac', 'inverter ac', 'window ac'],
    spec: { typeLabel: 'Type', typeOptions: ['Split', 'Window', 'Inverter', 'Cassette'], sizeLabel: 'Capacity', sizeChart: ['0.8 Ton', '1 Ton', '1.5 Ton', '2 Ton'] },
  },
  {
    match: ['fridge', 'refriger'],
    spec: { typeLabel: 'Type', typeOptions: ['Single Door', 'Double Door', 'Side by Side', 'Mini'], sizeLabel: 'Capacity', sizeChart: ['90L', '165L', '190L', '253L', '340L', '500L', '600L'] },
  },
  {
    match: ['fan'],
    spec: { typeLabel: 'Type', typeOptions: ['Ceiling', 'Table', 'Wall', 'Exhaust', 'Pedestal', 'BLDC'], sizeLabel: 'Sweep', sizeChart: ['200mm', '300mm', '400mm', '600mm', '900mm', '1200mm', '1400mm'] },
  },

  // ───────── Audio / mobile accessories (before "phone" device rules) ─────────
  {
    match: ['earphone', 'headphone', 'earbud', 'tws', 'neckband'],
    spec: { typeLabel: 'Type', typeOptions: ['Wired', 'TWS Earbuds', 'Neckband', 'Over-Ear', 'Gaming'], sizeLabel: 'Colour', sizeChart: ['Black', 'White', 'Blue', 'Red', 'Green'] },
  },
  {
    match: ['speaker', 'soundbar', 'home theatre', 'home theater'],
    spec: { typeLabel: 'Type', typeOptions: ['Bluetooth', 'Tower', 'Soundbar', 'Party', 'Portable'], sizeLabel: 'Power', sizeChart: ['5W', '10W', '16W', '40W', '60W', '80W', '120W'] },
  },
  {
    match: ['power bank', 'powerbank'],
    spec: { typeLabel: 'Type', typeOptions: ['Standard', 'Fast Charge', 'Wireless', 'Solar'], sizeLabel: 'Capacity', sizeChart: ['5000mAh', '10000mAh', '20000mAh', '30000mAh'] },
  },
  {
    match: ['charger', 'adapter', 'adaptor'],
    spec: { typeLabel: 'Type', typeOptions: ['Wall Charger', 'Fast Charger', 'Car Charger', 'USB-C', 'Wireless'], sizeLabel: 'Watt', sizeChart: ['10W', '18W', '20W', '25W', '33W', '45W', '65W', '100W'] },
  },
  {
    match: ['smartwatch', 'smart watch', 'fitness band', 'smart band'],
    spec: { typeLabel: 'Type', typeOptions: ['Smartwatch', 'Fitness Band', 'Calling Watch', 'Kids Watch'], sizeLabel: 'Colour', sizeChart: ['Black', 'Blue', 'Silver', 'Rose Gold', 'Green'] },
  },
  {
    match: ['camera', 'cctv'],
    spec: { typeLabel: 'Type', typeOptions: ['DSLR', 'Mirrorless', 'Point & Shoot', 'Action', 'Instant', 'CCTV'], sizeLabel: 'Resolution', sizeChart: ['2MP', '5MP', '12MP', '16MP', '20MP', '24MP', '48MP'] },
  },

  // ───────── Devices ─────────
  {
    match: ['mobile', 'phone', 'smartphone'],
    spec: { typeLabel: 'RAM', typeOptions: ['2GB', '3GB', '4GB', '6GB', '8GB', '12GB', '16GB'], sizeLabel: 'Storage', sizeChart: ['16GB', '32GB', '64GB', '128GB', '256GB', '512GB', '1TB'] },
  },
  {
    match: ['laptop', 'computer', 'desktop'],
    spec: { typeLabel: 'RAM', typeOptions: ['4GB', '8GB', '16GB', '32GB', '64GB'], sizeLabel: 'Storage', sizeChart: ['128GB', '256GB', '512GB', '1TB', '2TB'] },
  },
  {
    // 'tv' is safe here because device rules run before the lighting rule below, so
    // "LED TV" matches TV (not lighting). No lighting category contains "tv".
    match: ['tv', 'television', 'monitor', 'display'],
    spec: { typeLabel: 'Type', typeOptions: ['LED', 'OLED', 'QLED', 'Smart', '4K', 'Full HD'], sizeLabel: 'Screen', sizeChart: ['24"', '32"', '40"', '43"', '50"', '55"', '65"', '75"'] },
  },

  // ───────── Lighting / wiring / electrical ─────────
  {
    match: ['bulb', 'led', 'tube', 'light', 'lamp', 'cfl', 'lighting'],
    spec: { typeLabel: 'Type', typeOptions: ['LED', 'Tubelight', 'CFL', 'Incandescent', 'Halogen', 'Panel Light', 'Smart Bulb', 'Strip Light', 'Decorative'], sizeLabel: 'Watt', sizeChart: ['3W', '5W', '7W', '9W', '12W', '15W', '18W', '20W', '22W', '36W', '40W', '50W'] },
  },
  {
    match: ['wire', 'cable'],
    spec: { typeLabel: 'Material', typeOptions: ['Copper', 'Aluminium', 'Flexible', 'Armoured'], sizeLabel: 'Gauge', sizeChart: ['0.5mm', '0.75mm', '1mm', '1.5mm', '2.5mm', '4mm', '6mm', '10mm', '16mm'] },
  },
  {
    match: ['pipe', 'conduit'],
    spec: { typeLabel: 'Type', typeOptions: ['PVC', 'CPVC', 'UPVC', 'Metal', 'Flexible'], sizeLabel: 'Size', sizeChart: ['16mm', '20mm', '25mm', '32mm', '40mm', '50mm', '63mm'] },
  },
  {
    match: ['extension', 'spike guard', 'surge', 'power strip'],
    spec: { typeLabel: 'Type', typeOptions: ['Extension Board', 'Spike Guard', 'Surge Protector'], sizeLabel: 'Sockets', sizeChart: ['2 Socket', '3 Socket', '4 Socket', '6 Socket', '8 Socket'] },
  },
  {
    match: ['switch', 'socket', 'board', 'mcb', 'breaker', 'distribution'],
    spec: { typeLabel: 'Type', typeOptions: ['Modular', 'Non-Modular', 'Smart', 'Industrial'], sizeLabel: 'Rating', sizeChart: ['6A', '10A', '16A', '20A', '32A', '40A', '63A'] },
  },
  {
    match: ['stabilizer'],
    spec: { typeLabel: 'For', typeOptions: ['TV', 'AC', 'Fridge', 'Mainline', 'Universal'], sizeLabel: 'Capacity', sizeChart: ['0.5kVA', '1kVA', '2kVA', '3kVA', '4kVA', '5kVA'] },
  },
  {
    match: ['pump', 'motor'],
    spec: { typeLabel: 'Type', typeOptions: ['Submersible', 'Monoblock', 'Centrifugal', 'Self Priming', 'Booster'], sizeLabel: 'HP', sizeChart: ['0.5HP', '1HP', '1.5HP', '2HP', '3HP', '5HP'] },
  },
  {
    // Battery before inverter so "Inverter Battery" is stocked by capacity (Ah), not VA.
    match: ['battery', 'accumulator'],
    spec: { typeLabel: 'Battery Type', typeOptions: ['Tubular', 'Flat Plate', 'SMF/VRLA', 'Lithium', 'Gel', 'Car', 'Bike', 'Solar'], sizeLabel: 'Capacity', sizeChart: ['7Ah', '12V', '24V', '35Ah', '80Ah', '100Ah', '120Ah', '135Ah', '150Ah', '180Ah', '200Ah', '220Ah'] },
  },
  {
    match: ['inverter', 'ups'],
    spec: { typeLabel: 'Type', typeOptions: ['Pure Sine Wave', 'Square Wave', 'Solar', 'Online', 'Line Interactive'], sizeLabel: 'Capacity', sizeChart: ['600VA', '800VA', '900VA', '1100VA', '1500VA', '2kVA', '3kVA', '5kVA'] },
  },
];

// Medical / pharmacy (1mg, Netmeds-style): strength × pack, volume, weight, doses.
const MEDICAL_RULES: SpecRule[] = [
  {
    match: ['tablet', 'capsule', 'caplet', 'pill'],
    spec: { typeLabel: 'Strength', typeOptions: ['10mg', '25mg', '50mg', '100mg', '250mg', '500mg', '650mg', '1000mg'], sizeLabel: 'Pack', sizeChart: ['10 Tabs', '15 Tabs', '20 Tabs', '30 Tabs', '100 Tabs'] },
  },
  {
    match: ['syrup', 'suspension', 'tonic', 'oral liquid'],
    spec: { typeLabel: 'Type', typeOptions: ['Syrup', 'Suspension', 'Tonic'], sizeLabel: 'Volume', sizeChart: ['30ml', '60ml', '100ml', '150ml', '200ml', '450ml'] },
  },
  {
    match: ['injection', 'vial', 'ampoule', 'injectable'],
    spec: { typeLabel: 'Type', typeOptions: ['Vial', 'Ampoule', 'Pre-filled'], sizeLabel: 'Volume', sizeChart: ['1ml', '2ml', '5ml', '10ml', '30ml'] },
  },
  {
    match: ['drop'],
    spec: { typeLabel: 'Type', typeOptions: ['Eye Drops', 'Ear Drops', 'Nasal Drops', 'Oral Drops'], sizeLabel: 'Volume', sizeChart: ['5ml', '10ml', '15ml', '30ml'] },
  },
  {
    match: ['cream', 'ointment', 'gel', 'lotion', 'balm', 'liniment'],
    spec: { typeLabel: 'Type', typeOptions: ['Cream', 'Ointment', 'Gel', 'Lotion'], sizeLabel: 'Weight', sizeChart: ['5g', '10g', '15g', '20g', '30g', '50g', '100g'] },
  },
  {
    match: ['inhaler', 'respule', 'rotacap', 'nebuliz'],
    spec: { typeLabel: 'Type', typeOptions: ['Inhaler', 'Respules', 'Rotacaps'], sizeLabel: 'Strength', sizeChart: ['100 mcg', '200 mcg', '250 mcg', '100 Doses', '200 Doses'] },
  },
  {
    match: ['powder', 'sachet', 'granule', 'sachets'],
    spec: { typeLabel: 'Type', typeOptions: ['Powder', 'Sachet', 'Granules'], sizeLabel: 'Weight', sizeChart: ['1g', '5g', '10g', '100g', '200g'] },
  },
  {
    match: ['vitamin', 'supplement', 'protein', 'multivitamin'],
    spec: { typeLabel: 'Type', typeOptions: ['Tablet', 'Capsule', 'Powder', 'Gummies'], sizeLabel: 'Pack', sizeChart: ['30', '60', '90', '120', '500g', '1kg'] },
  },
];

// Apparel / textiles (Myntra, Ajio-style): colour × size.
const APPAREL_RULES: SpecRule[] = [
  {
    match: ['t-shirt', 'tshirt', 'shirt', 'kurta', 'kurti', 'saree', 'sari', 'dress', 'jeans', 'pant', 'trouser', 'jacket', 'blouse', 'lehenga', 'salwar', 'suit', 'nightwear', 'topwear', 'tops', 'legging', 'ethnic', 'apparel', 'clothing', 'garment', 'frock', 'gown', 'sweater', 'hoodie', 'shorts'],
    spec: { typeLabel: 'Colour', typeOptions: ['Black', 'White', 'Red', 'Blue', 'Green', 'Yellow', 'Pink', 'Grey', 'Maroon', 'Navy'], sizeLabel: 'Size', sizeChart: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'Free Size'] },
  },
];

// Footwear (color × UK size).
const FOOTWEAR_RULES: SpecRule[] = [
  {
    match: ['shoe', 'sandal', 'slipper', 'chappal', 'boot', 'heel', 'sneaker', 'loafer', 'flip flop', 'flipflop', 'footwear', 'sneakers', 'moccasin'],
    spec: { typeLabel: 'Colour', typeOptions: ['Black', 'White', 'Brown', 'Tan', 'Blue', 'Red', 'Grey', 'Navy'], sizeLabel: 'Size', sizeChart: ['UK/IND 4', 'UK/IND 5', 'UK/IND 6', 'UK/IND 7', 'UK/IND 8', 'UK/IND 9', 'UK/IND 10', 'UK/IND 11', 'UK/IND 12'] },
  },
];

// ── Gender/category-aware size charts for the dedicated Clothes and Footwear
// shop types (hasColors: true — different from APPAREL_RULES/FOOTWEAR_RULES
// above, which only apply under the "general" business type's hasSpecs path).
// Real apparel doesn't use one alphabet chart for everything: bottoms (jeans/
// trousers) are sold by numeric waist size, sarees/dupattas are Free Size,
// kids' wear is age-based, and footwear UK ranges differ by Men/Women/Kids.
const CLOTHING_SIZE_CHARTS = {
  topwearAlpha: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'],
  topwearAlphaWomen: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL', 'Free Size'],
  bottomwearMen: ['28', '30', '32', '34', '36', '38', '40', '42', '44'],
  bottomwearWomen: ['26', '28', '30', '32', '34', '36', '38'],
  freeSize: ['Free Size'],
  kidsClothing: ['0-3M', '3-6M', '6-12M', '1-2Y', '2-3Y', '3-4Y', '4-5Y', '5-6Y', '6-7Y', '7-8Y', '8-9Y', '9-10Y', '10-11Y', '11-12Y', '12-13Y', '13-14Y'],
} as const;

/**
 * India/UK shoe sizes are numerically identical, so "UK" covers both — most
 * practical default for an Indian shopkeeper. US and EU columns are
 * index-aligned to the same row (UK 7 / US 8 / EU 41 are the same physical
 * shoe) using standard, commonly-cited conversion tables; exact numbers vary
 * slightly by brand in real life too, so this is a sensible approximation,
 * not meant to be lab-precise. Kids here means UK junior sizes 1-6 (the
 * range that precedes adult sizing), not the age-banded Kids clothing chart
 * above — footwear and clothing use genuinely different "kids" systems.
 */
const FOOTWEAR_SIZE_TABLES: Record<'men' | 'women' | 'kids', Record<FootwearSizeSystem, string[]>> = {
  men: {
    uk: ['UK 5', 'UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11', 'UK 12'],
    us: ['US 6', 'US 7', 'US 8', 'US 9', 'US 10', 'US 11', 'US 12', 'US 13'],
    eu: ['EU 38', 'EU 39', 'EU 41', 'EU 42', 'EU 43', 'EU 44', 'EU 45', 'EU 46'],
  },
  women: {
    uk: ['UK 3', 'UK 4', 'UK 5', 'UK 6', 'UK 7', 'UK 8', 'UK 9'],
    us: ['US 5', 'US 6', 'US 7', 'US 8', 'US 9', 'US 10', 'US 11'],
    eu: ['EU 35', 'EU 36', 'EU 37', 'EU 39', 'EU 40', 'EU 41', 'EU 42'],
  },
  kids: {
    uk: ['UK 1', 'UK 2', 'UK 3', 'UK 4', 'UK 5', 'UK 6'],
    us: ['US 2', 'US 3', 'US 4', 'US 5', 'US 6', 'US 7'],
    eu: ['EU 33', 'EU 34', 'EU 35', 'EU 36', 'EU 37', 'EU 38'],
  },
};

export type FootwearSizeSystem = 'uk' | 'us' | 'eu';

interface ClothingCategoryRule { match: string[]; group: 'topwear' | 'bottomwear' | 'freeSize'; }
const CLOTHING_CATEGORY_RULES: ClothingCategoryRule[] = [
  { match: ['jean', 'trouser', 'pant', 'chino', 'cargo', 'track pant', 'joggers', 'formal pant'], group: 'bottomwear' },
  { match: ['saree', 'sari', 'lehenga', 'dupatta', 'stole'], group: 'freeSize' },
  { match: ['t-shirt', 'tshirt', 'shirt', 'kurta', 'kurti', 'dress', 'jacket', 'blouse', 'salwar', 'suit', 'nightwear', 'topwear', 'tops', 'legging', 'sweater', 'hoodie', 'gown', 'frock', 'shorts', 'ethnic', 'apparel', 'clothing', 'garment'], group: 'topwear' },
];

/**
 * Real shopkeeper category data is messy — shops in the wild have literal
 * categories named "Kids", "men", "Female" etc. (gender/age typed straight
 * into the free-text Category field instead of using the separate Gender
 * dropdown, or in addition to it, e.g. "Kids Pant"). Detect the effective
 * gender/age signal from the Gender field first, and fall back to scanning
 * the category text itself so a bare "Kids" category resolves correctly
 * even when Gender is left at "Unisex". Word-boundary regex, not `.includes`
 * — "Women" contains the substring "men" and would false-positive as Men.
 */
function detectGenderSignal(
  gender: string | undefined | null,
  category: string | undefined | null
): 'kids' | 'women' | 'men' | null {
  const g = (gender || '').toLowerCase().trim();
  if (g === 'boys' || g === 'girls' || g === 'kids') return 'kids';
  if (g === 'women') return 'women';
  if (g === 'men') return 'men';

  const c = (category || '').toLowerCase();
  if (/\b(kids?|baby|babies|infant|toddler|boys?|girls?)\b/.test(c)) return 'kids';
  if (/\b(women|womens|women's|ladies|female)\b/.test(c)) return 'women';
  if (/\b(men|mens|men's|male|gents|gentlemen)\b/.test(c)) return 'men';
  return null;
}

// Bare gender/age words — "Kids", "Men", "Female" — belong in the Gender
// field, never in Category (Category = what the product IS, Gender = who
// it's for). EXACT match only, not a substring/word-boundary test: a real
// category like "Kids Wear" or "Kids Shoes" must stay unaffected, only a
// category whose ENTIRE value is just a gender word gets caught.
const GENDER_ONLY_LABELS = new Set([
  'men', 'mens', "men's", 'male', 'gents', 'gentlemen',
  'women', 'womens', "women's", 'ladies', 'female',
  'kids', 'kid', 'boys', 'boy', 'girls', 'girl',
  'baby', 'babies', 'infant', 'toddler', 'unisex',
]);

/** True when `value`, trimmed, is nothing but a gender/age word — see GENDER_ONLY_LABELS. */
export function isGenderOnlyLabel(value: string | undefined | null): boolean {
  return GENDER_ONLY_LABELS.has(String(value ?? '').trim().toLowerCase());
}

/**
 * Resolve the right size chart for an apparel/footwear product given its
 * free-text category and Gender field — jeans get numeric waist sizes, sarees
 * are Free Size, Boys/Girls/Kids get age-based sizes, footwear uses
 * gender-appropriate UK/US/EU ranges (`sizeSystem`, default 'uk' — India and
 * UK share the same numbering). Falls back to `fallback` (the shop's static
 * businessConfig chart) whenever nothing matches yet (category/gender not
 * typed) so existing behaviour is unaffected until there's enough to go on.
 */
export function resolveClothingSizeChart(
  category: string | undefined | null,
  gender: string | undefined | null,
  isFootwear: boolean,
  fallback: string[],
  sizeSystem: FootwearSizeSystem = 'uk'
): string[] {
  const signal = detectGenderSignal(gender, category);
  const isKids = signal === 'kids';
  const isWomen = signal === 'women';
  const isMen = signal === 'men';

  if (isFootwear) {
    if (isKids) return [...FOOTWEAR_SIZE_TABLES.kids[sizeSystem]];
    if (isWomen) return [...FOOTWEAR_SIZE_TABLES.women[sizeSystem]];
    if (isMen) return [...FOOTWEAR_SIZE_TABLES.men[sizeSystem]];
    return fallback;
  }

  if (isKids) return [...CLOTHING_SIZE_CHARTS.kidsClothing];

  const c = (category || '').toLowerCase().trim();
  if (c) {
    for (const rule of CLOTHING_CATEGORY_RULES) {
      if (rule.match.some(m => c.includes(m))) {
        if (rule.group === 'bottomwear') return [...(isWomen ? CLOTHING_SIZE_CHARTS.bottomwearWomen : CLOTHING_SIZE_CHARTS.bottomwearMen)];
        if (rule.group === 'freeSize') return [...CLOTHING_SIZE_CHARTS.freeSize];
        return [...(isWomen ? CLOTHING_SIZE_CHARTS.topwearAlphaWomen : CLOTHING_SIZE_CHARTS.topwearAlpha)];
      }
    }
  }
  // No garment keyword matched, but the category/gender text alone already
  // signals Women/Men (e.g. a bare "Kids"/"Men"/"Female" category with no
  // more specific garment word) — apply the gender-appropriate general chart
  // instead of silently falling through to the shop's static default.
  if (isWomen) return [...CLOTHING_SIZE_CHARTS.topwearAlphaWomen];
  if (isMen) return [...CLOTHING_SIZE_CHARTS.topwearAlpha];
  return fallback;
}

// Cosmetics / beauty (Nykaa-style): shade / finish / volume.
const COSMETIC_RULES: SpecRule[] = [
  {
    match: ['lipstick', 'lip gloss', 'lipgloss', 'lip balm', 'lip liner', 'lip crayon'],
    spec: { typeLabel: 'Finish', typeOptions: ['Matte', 'Creamy', 'Glossy', 'Satin'], sizeLabel: 'Shade', sizeChart: ['Red', 'Pink', 'Nude', 'Maroon', 'Coral', 'Brown', 'Plum'] },
  },
  {
    match: ['foundation', 'concealer', 'compact', 'bb cream', 'cc cream'],
    spec: { typeLabel: 'Type', typeOptions: ['Liquid', 'Stick', 'Powder', 'Cushion'], sizeLabel: 'Shade', sizeChart: ['Ivory', 'Beige', 'Natural', 'Sand', 'Honey', 'Caramel'] },
  },
  {
    match: ['nail polish', 'nail paint', 'nail enamel'],
    spec: { typeLabel: 'Finish', typeOptions: ['Glossy', 'Matte', 'Glitter', 'Gel'], sizeLabel: 'Shade', sizeChart: ['Red', 'Pink', 'Nude', 'Black', 'Blue', 'White', 'Maroon'] },
  },
  {
    match: ['kajal', 'eyeliner', 'mascara', 'eyeshadow', 'eye liner', 'eye shadow'],
    spec: { typeLabel: 'Type', typeOptions: ['Pencil', 'Liquid', 'Gel', 'Powder'], sizeLabel: 'Shade', sizeChart: ['Black', 'Brown', 'Blue', 'Green'] },
  },
  {
    match: ['perfume', 'deo', 'deodorant', 'fragrance', 'body spray', 'cologne', 'attar', 'mist'],
    spec: { typeLabel: 'Type', typeOptions: ['EDP', 'EDT', 'Body Spray', 'Roll-on', 'Attar'], sizeLabel: 'Volume', sizeChart: ['30ml', '50ml', '100ml', '150ml', '200ml'] },
  },
  {
    match: ['shampoo', 'conditioner', 'hair oil', 'serum', 'face wash', 'moisturiz', 'moisturis', 'sunscreen', 'toner', 'skincare', 'cream', 'lotion', 'scrub'],
    spec: { typeLabel: 'Type', typeOptions: ['Cream', 'Lotion', 'Serum', 'Gel', 'Oil'], sizeLabel: 'Volume', sizeChart: ['30ml', '50ml', '100ml', '200ml', '400ml'] },
  },
];

// Liquor / bar (BevQ, retail-liquor style): Volume × Bottle Type. Spirits are
// stocked by nip/pint/full-bottle volume; beer & soft drinks by can/bottle/PET.
const LIQUOR_RULES: SpecRule[] = [
  {
    match: ['beer', 'cider', 'lager', 'ale', 'stout'],
    spec: { typeLabel: 'Volume', typeOptions: ['330ml', '500ml', '650ml'], sizeLabel: 'Type', sizeChart: ['Bottle', 'Can', 'PET', 'Pint', 'Pack of 6', 'Case'] },
  },
  {
    match: ['whisky', 'whiskey', 'rum', 'vodka', 'gin', 'brandy', 'scotch', 'wine', 'liquor', 'liqueur', 'spirit', 'tequila', 'champagne', 'sherry', 'port'],
    spec: { typeLabel: 'Volume', typeOptions: ['90ml', '180ml', '375ml', '500ml', '750ml', '1000ml'], sizeLabel: 'Type', sizeChart: ['Bottle', 'Nip', 'Pint', 'Quart', 'Case'] },
  },
  {
    match: ['water', 'soft drink', 'soda', 'cola', 'juice', 'tonic', 'drink', 'mixer', 'energy'],
    spec: { typeLabel: 'Volume', typeOptions: ['200ml', '250ml', '330ml', '500ml', '750ml', '1L', '2L'], sizeLabel: 'Type', sizeChart: ['Bottle', 'Can', 'PET', 'Tetra', 'Pack'] },
  },
];

/**
 * Resolve the spec matrix for a product based on its (free-text) CATEGORY and the shop's
 * business type. The same word can mean different things per business (e.g. "Tablet" =
 * medicine for a pharmacy, a device elsewhere), so the rule set is chosen per business.
 *   medical  → strength × pack / volume / weight       (e.g. "Paracetamol Tablet" → Strength × Pack)
 *   boutique → shade / finish / colour × size          (e.g. "Lipstick" → Finish × Shade)
 *   general  → appliances + apparel + footwear + beauty (adapts to whatever is typed)
 *   else     → appliances / electronics / electrical    (electronics, electric)
 * Returns null when no rule matches (product is treated as a simple single-stock item).
 */
export function getCategoryVariantSpec(category: string | undefined | null, businessType?: BusinessType | string): CategoryVariantSpec | null {
  const c = (category || '').toLowerCase().trim();
  if (!c) return null;
  let rules: SpecRule[];
  switch (businessType) {
    case 'medical':  rules = [...MEDICAL_RULES, ...APPLIANCE_RULES]; break;
    case 'boutique': rules = COSMETIC_RULES; break; // cosmetics only — apparel/footwear have their own shop types
    case 'liquor':   rules = LIQUOR_RULES; break;   // volume × bottle-type
    case 'general':  rules = [...APPAREL_RULES, ...FOOTWEAR_RULES, ...COSMETIC_RULES, ...APPLIANCE_RULES]; break;
    default:         rules = APPLIANCE_RULES; // electronics, electric
  }
  for (const { match, spec } of rules) {
    if (match.some(m => c.includes(m))) return spec;
  }
  return null;
}

/**
 * Loose / bulk material (sold by weight or volume, decimal qty) makes sense for grocery, agro, mills, hardware…
 * but not for fashion, footwear, electronics, jewellery, furniture, liquor or service businesses.
 */
const NO_LOOSE_TYPES: string[] = [
  'boutique', 'shoes', 'clothes', 'electric', 'electronics', 'liquor',
  'textilewholesale', 'garmentwholesale', 'fabricdistributor', 'footwearwholesale',
  'electricaldistributor', 'electricalwholesale', 'electronicsdistributor', 'electronicswholesale',
  'wineliquordistributor', 'wineliquorwholesale', 'cosmeticsdistributor', 'beautywholesale',
  'jewellery', 'furniture', 'autoparts', 'salonspa', 'repairservices', 'restauranthotel',
  'laundryservice', 'coachingtraining', 'rentingleasing', 'fitnesscenter', 'realestate',
  'ngotrust', 'toursandtravel', 'accountingca', 'interiordesign',
];
export function supportsLooseMaterial(type: string | null | undefined): boolean {
  return !NO_LOOSE_TYPES.includes(String(type || ''));
}
