/**
 * Business Type Configuration
 * Central source of truth for all business-type-specific settings
 */

import { PackageType } from './config/packageConfig';

export type BusinessType =
  | 'kirana'
  | 'medical'
  | 'boutique'
  | 'shoes'
  | 'clothes'
  | 'electric'
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
  defaultCategories: string[];
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
  },
  boutique: {
    type: 'boutique',
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
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: true,
    defaultCategories: ['Sports Shoes', 'Formal Shoes', 'Sandals', 'Slippers', 'Boots', 'Casual Shoes', 'Kids Shoes'],
    defaultUnits: ['Pair'],
    productPlaceholder: 'e.g. Nike Air Max (UK9)',
    productPlaceholderHi: 'जैसे नाइकी एयर मैक्स (UK9)',
    productPlaceholderMr: 'उदा. नायकी एअर मॅक्स (UK9)',
    sizeChart: ['UK4', 'UK5', 'UK6', 'UK7', 'UK8', 'UK9', 'UK10', 'UK11', 'UK12'],
    hasColors: true,
    colorChart: ['Black', 'White', 'Brown', 'Tan', 'Blue', 'Red', 'Grey', 'Navy'],
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
    hasWireSpecs: false,
    hasVoltWatt: false,
    hasSoleMaterial: false,
    defaultCategories: ['T-Shirt', 'Shirt', 'Pant', 'Jeans', 'Saree', 'Kurta', 'Dress', 'Jacket', 'Pant Piece', 'Shirt Piece', 'Dress Material'],
    defaultUnits: ['Piece', 'Meter', 'Set'],
    productPlaceholder: 'e.g. Cotton T-Shirt (M)',
    productPlaceholderHi: 'जैसे कॉटन टी-शर्ट (M)',
    productPlaceholderMr: 'उदा. कॉटन टी-शर्ट (M)',
    sizeChart: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
    hasColors: true,
    colorChart: ['Black', 'White', 'Red', 'Blue', 'Green', 'Yellow', 'Pink', 'Grey', 'Maroon', 'Navy'],
  },
  electric: {
    type: 'electric',
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
    hasShades: false,
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
  },
};

export function getBusinessConfig(type: BusinessType | string): BusinessConfig {
  return BUSINESS_CONFIGS[type as BusinessType] ?? BUSINESS_CONFIGS.general;
}

export const ALL_BUSINESS_TYPES = Object.values(BUSINESS_CONFIGS);

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
    spec: { typeLabel: 'Colour', typeOptions: ['Black', 'White', 'Brown', 'Tan', 'Blue', 'Red', 'Grey', 'Navy'], sizeLabel: 'Size', sizeChart: ['UK4', 'UK5', 'UK6', 'UK7', 'UK8', 'UK9', 'UK10', 'UK11', 'UK12'] },
  },
];

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
    case 'general':  rules = [...APPAREL_RULES, ...FOOTWEAR_RULES, ...COSMETIC_RULES, ...APPLIANCE_RULES]; break;
    default:         rules = APPLIANCE_RULES; // electronics, electric
  }
  for (const { match, spec } of rules) {
    if (match.some(m => c.includes(m))) return spec;
  }
  return null;
}
