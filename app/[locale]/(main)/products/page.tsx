'use client';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import {
  Plus, Search, Filter, AlertCircle, Pencil, Trash2, X,
  Loader2, Camera, ShieldCheck, Package,
  Warehouse, Store, MapPin, IndianRupee, Barcode as BarcodeIcon,
  Percent,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { useLocale } from 'next-intl';
import { translateData } from '@/lib/translateData';
import SmartTranslator from '@/components/SmartTranslator';
import ExpiryDateField, { ExpiryBadge } from '@/components/ExpiryDateField';
import SizeVariantGrid, { parseSizeVariants, serializeSizeVariants, totalFromSizes, parseSizePrices, mergeSizePricesIntoMetadata, generateVariantBarcodes, SizePicker, LocalInput } from '@/components/SizeVariantGrid';
import CostMarkupControl from '@/components/CostMarkupControl';
import type { SizePriceEntry } from '@/components/SizeVariantGrid';
import ColorSizeVariantGrid, { ColorPicker, colorsFromVariants, sizesFromVariants, splitVariantKey, VARIANT_SEP } from '@/components/ColorSizeVariantGrid';
import { CategoryPicker } from '@/components/CategoryPicker';
import ThreeWayVariantGrid from '@/components/ThreeWayVariantGrid';
import { useBusinessStore } from '@/lib/businessStore';
import { isWholesaleTierPackage } from '@/lib/config/packageConfig';
import { getBusinessConfig, getCategoryVariantSpec, resolveClothingSizeChart, FootwearSizeSystem } from '@/lib/businessConfig';
import { useCategories } from '@/lib/useCategories';
import { calculateProductProfit, profitColorClass, toInclusivePrice, toExclusivePrice } from '@/lib/profitCalc';

import { QrCode } from 'lucide-react';
import dynamic from 'next/dynamic';
import WholesaleProductsUI from './WholesaleProductsUI';
import ProductDetailsSheet from './ProductDetailsSheet';
import useSWR from 'swr';

import { fetchProductsMapped, mapApiProductToRow } from '@/lib/fetchers';
import { invalidateProductCaches } from '@/lib/swrInvalidate';
import { ExportButton } from '@/lib/hooks/useExport';
import { ConfirmPasswordModal } from '@/components/trash/ConfirmPasswordModal';
import { SelectionActionBar } from '@/components/trash/SelectionActionBar';
import { useBarcodeScanner, playScanBeep } from '@/lib/useBarcodeScanner';
import toast from 'react-hot-toast';

const BarcodeQRModal = dynamic(() => import('@/components/BarcodeQRModal'), { ssr: false });
const CameraScanner = dynamic(() => import('@/components/CameraScanner'), { ssr: false });

type Product = {
  id: string | number;
  shopId?: string;
  name: string;
  category: string;
  stock: number;
  minStock: number;
  mrp: number;
  sellingPrice: number;
  cost: number;
  unit: string;
  // Extended fields
  expiry_date?: string;
  batch_number?: string;
  drug_schedule?: string;
  model_number?: string;
  warranty_months?: number;
  gender?: string;
  shade?: string;
  size_variants?: string;
  is_loose?: boolean;
  gstPercent?: number;
  hsnCode?: string;
  metadata?: any;
  brand?: string;
  conversionFactor?: number;
  conversion_factor?: number;
  recentlyAdded?: number;
  barcode?: string;
  sku?: string;
  otherCode?: string;
  cartonBarcode?: string;
  location?: string;
  costPriceMode?: string;
  purchaseDiscountPercent?: number;
  shopName?: string;
  shopBusinessType?: string;
};

function buildEmptyForm(btype: string) {
  const config = getBusinessConfig(btype);
  return {
    // minStock defaults to '5' (matching its own placeholder hint) — it's a
    // required field with no sensible reason to force every first-time Add
    // through an extra required box; still fully editable if they want a
    // different threshold.
    name: '', category: '', unit: config.defaultUnits[0] || 'Unit', stock: '', minStock: '5',
    mrp: '', sellingPrice: '', cost: '',
    // 'manual' (default) types Cost Price directly, exactly as before.
    // 'mrp_based' derives it live from mrp * (1 - purchaseDiscountPercent/100)
    // — see effectiveCostPrice() below, used at both display and submit time.
    costPriceMode: 'manual' as 'manual' | 'mrp_based', purchaseDiscountPercent: '',
    is_loose: false,
    expiry_date: '', batch_number: '', drug_schedule: 'OTC',
    model_number: '', warranty_months: '', gender: 'Unisex',
    shade: '', size_variants: {} as Record<string, number>,
    gstPercent: 0, hsnCode: '',
    // Scannable identifiers — help desktop barcode billing.
    barcode: '', sku: '', otherCode: '', cartonBarcode: '',
    // Free-text shelf/rack/bin locator — where the item physically sits.
    location: '',
    // Liquor (Beer Bar & Wine Shop) fields
    brand: '', alcohol_percentage: '', bottle_type: '', conversion_factor: ''
  };
}

// Single source of truth for what Cost Price actually is right now, shared
// by the live display AND the submit payload so they can never disagree —
// 'manual' returns the typed cost.cost field unchanged (today's behavior);
// 'mrp_based' derives it from mrp/purchaseDiscountPercent instead.
function effectiveCostPrice(f: { cost: any; mrp: any; costPriceMode?: string; purchaseDiscountPercent: any }): number {
  if (f.costPriceMode === 'mrp_based') {
    const mrp = Number(f.mrp) || 0;
    const pct = Number(f.purchaseDiscountPercent) || 0;
    return Math.max(0, mrp * (1 - pct / 100));
  }
  return Number(f.cost) || 0;
}

/** Compact variant chip grid used in the Products table's stock column.
 *  Collapsed = first 9 chips in a 3-column grid + a "Show all (N)" toggle;
 *  Expanded = every chip, still 3 per row. Beats the old `+N` badge because
 *  the shopkeeper doesn't have to hover a tooltip to see what's hidden. The
 *  `productId` prop is accepted (parent-side identity hint / debuggability)
 *  even though the render doesn't read it — expand state resets naturally
 *  when React remounts the row, which is what we want. */
function VariantChipGrid({
  productId: _productId,
  entries,
}: {
  productId: string;
  entries: { key: string; label: string; title: string; toneClass: string }[];
}) {
  const [expanded, setExpanded] = useState(false);
  const COLLAPSED = 9;
  if (entries.length === 0) return null;
  const shown = expanded ? entries : entries.slice(0, COLLAPSED);
  // flex-wrap with `whitespace-nowrap` on each chip beats a strict 3-col
  // grid here — a full label like "White / M ₹279 (100)" no longer gets
  // clipped to "White / M ₹279 (1..." because it can consume whatever
  // width it needs; the row wraps to the next line when it runs out of
  // space. Reads roughly as 3-per-row for normal labels while long ones
  // are still fully legible.
  return (
    <div className="mt-1 max-w-[440px]">
      <div className="flex flex-wrap gap-1">
        {shown.map(e => (
          <span key={e.key} title={e.title}
            className={cn('px-1.5 py-0.5 rounded whitespace-nowrap', e.toneClass)}>
            {e.label}
          </span>
        ))}
      </div>
      {entries.length > COLLAPSED && (
        <button
          type="button"
          onClick={(ev) => { ev.stopPropagation(); setExpanded(v => !v); }}
          className="mt-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
        >
          {expanded ? 'Show less' : `Show all (${entries.length})`}
        </button>
      )}
    </div>
  );
}

// With All Shop Access on, a pooled cross-shop list can show (and let you act
// on) a row belonging to a shop other than whichever one is currently
// "active" — lib/api.ts otherwise always targets the active shop, which
// 404s any edit/delete of a non-active-shop row. Passing the row's own
// shopId here overrides that for just this one request.
function shopIdHeader(shopId?: string | null) {
  return shopId ? { headers: { 'x-shop-id': String(shopId) } } : {};
}

export default function ProductsPage() {
  const { profile } = useBusinessStore();
  const isWholesale = isWholesaleTierPackage(profile.subscriptionPlan);
  // Render immediately based on the initial (trial-default) profile. If the
  // profile later hydrates as wholesale we swap the UI — cheaper than a blank
  // white flash on every sidebar click.
  if (isWholesale) {
    return <WholesaleProductsUI />;
  }
  return <LegacyProductsUI />;
}

function LegacyProductsUI() {
  const t = useTranslations('Products');
  const tv = useTranslations('Variants');
  const locale = useLocale();
  const { profile, allShops, activeShopId, switchShop, allShopAccess } = useBusinessStore();
  const bizConfig = getBusinessConfig(profile.businessType);
  const isWholesale = isWholesaleTierPackage(profile.subscriptionPlan);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(handler);
  }, [search]);

  const baseSwrKey = debouncedSearch.length > 1 ? `/products?q=${encodeURIComponent(debouncedSearch)}` : '/products';
  const swrKey = activeShopId ? `${baseSwrKey}${baseSwrKey.includes('?') ? '&' : '?'}shop=${activeShopId}` : null;
  const { data: products = [], mutate: mutateProducts, isLoading: loading } = useSWR<Product[]>(swrKey, fetchProductsMapped);
  
  const [saving, setSaving] = useState(false);
  // `saving` (state) drives the disabled/spinner UI, but a real rapid
  // double-click fires both event handlers before React commits the first
  // setSaving(true) and re-renders — confirmed live: two clicks produced two
  // POSTs even with the button visually disabling correctly moments later.
  // This ref is mutated synchronously, so the guard actually holds within
  // the same tick, unlike a state read.
  const submittingRef = useRef(false);
  const [showAddModal, setShowAddModal] = useState(false);

  // Deep-link: /products?add=1 auto-opens the Add-Product modal. Used by the
  // slimmed Stock In flow so the shopkeeper doesn't have to re-enter the full
  // product form there — they're bounced to the single canonical Add UI.
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get('add') === '1') setShowAddModal(true);
  }, [searchParams]);
  const [form, setForm] = useState(buildEmptyForm(profile.businessType));
  // Whether the number the shopkeeper is typing into Selling Price already
  // includes GST or not — purely a data-entry convenience. Whichever mode is
  // active, the value saved to the server is always normalized to the
  // GST-inclusive price (see handleAddSubmit/handleEditSubmit), matching the
  // invariant the rest of the app assumes (billing, profit calc, reports).
  const [spMode, setSpMode] = useState<'inclusive' | 'exclusive'>('inclusive');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState(buildEmptyForm(profile.businessType));
  const [editSpMode, setEditSpMode] = useState<'inclusive' | 'exclusive'>('inclusive');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | number | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string | number>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // Bulk price adjust — bump MRP / Cost / Selling on every currently-selected
  // (real, already-saved) product by a % or ₹, up or down. Mirrors Import's
  // "Adjust selected rows" panel, but writes straight to the DB via
  // PATCH /products/bulk instead of staging data before a save.
  const [bulkAdjustOpen, setBulkAdjustOpen] = useState(false);
  const [bulkAdjustField, setBulkAdjustField] = useState<'mrp' | 'sellingPrice' | 'wholesaleCost'>('mrp');
  const [bulkAdjustMode, setBulkAdjustMode] = useState<'percent' | 'amount'>('percent');
  const [bulkAdjustValue, setBulkAdjustValue] = useState('');
  const [bulkAdjusting, setBulkAdjusting] = useState(false);
  const [bulkAdjustNote, setBulkAdjustNote] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [scanning, setScanning] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [qrProduct, setQrProduct] = useState<Product | null>(null);
  // Hardware (keyboard-wedge) scanner — same detection logic Billing already
  // uses. Feeds the scanned code straight into the existing text search
  // (which already matches against barcode/sku), so scanning a shelf label
  // here works like typing it, just faster. Disabled while a modal with its
  // own text fields is open, so a stray scan can't land in the wrong field.
  useBarcodeScanner({
    enabled: !showAddModal && !showEditModal && !showScanner,
    onScan: (code) => { setSearch(code); playScanBeep(true); },
  });
  const filterRef = useRef<HTMLDivElement>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Per-size pricing state
  const [perSizePricing, setPerSizePricing] = useState(false);
  const [sizePrices, setSizePrices] = useState<Record<string, SizePriceEntry>>({});
  const [editPerSizePricing, setEditPerSizePricing] = useState(false);
  const [editSizePrices, setEditSizePrices] = useState<Record<string, SizePriceEntry>>({});

  // Variant matrix model. `colors`/`editColors` hold the selected primary-dimension values
  // (colours for apparel, types like LED/Tubelight for electricals).
  const [colors, setColors] = useState<string[]>([]);
  const [editColors, setEditColors] = useState<string[]>([]);
  // Selected size labels (XS/S/M/L, shoe sizes, ml/L, …) — a business type's
  // sizeChart/spec.sizeChart is only ever the starting palette; SizePicker
  // lets a shopkeeper trim or add to it per product, same spirit as `colors`
  // above. Seeded once when a chart becomes known (Add-modal open / a
  // category with a spec resolves) rather than re-synced on every category
  // change, matching `colors`/`editColors`'s own non-resyncing behaviour.
  const [sizeSelection, setSizeSelection] = useState<string[]>([]);
  // True until the shopkeeper manually edits the size picker — lets the
  // auto-seed effect below keep upgrading the chart as Category/Gender get
  // typed (e.g. blank → "Jeans" → numeric waist sizes) instead of only ever
  // getting one shot at modal-open, when category is still empty.
  const [sizeSelectionAuto, setSizeSelectionAuto] = useState(true);
  const [editSizeSelection, setEditSizeSelection] = useState<string[]>([]);
  // Footwear only — India/UK sizes are numerically identical, so that's the
  // practical default for an Indian shopkeeper; US/EU are the same physical
  // sizes relabeled (see FOOTWEAR_SIZE_TABLES). Changing this re-resolves
  // the size chart the same way a Category/Gender change does, through the
  // same addVariantDim/editVariantDim memo below.
  const [sizeSystem, setSizeSystem] = useState<FootwearSizeSystem>('uk');
  const [editSizeSystem, setEditSizeSystem] = useState<FootwearSizeSystem>('uk');
  // Outer real-colour picker for the 3-way (Colour × Type × Spec) grid used by
  // electronics/electric spec-categories. Kept separate from `colors` above,
  // which drives the *inner* spec-type chips (RAM, Wattage, …) in the 2-way path.
  const [outerColors, setOuterColors] = useState<string[]>([]);
  const [editOuterColors, setEditOuterColors] = useState<string[]>([]);
  // Snapshot of size_variants at the moment startEdit ran — used as the base
  // for additive-mode inputs so each cell can show "Current: N" as a badge
  // and treat the typed number as stock being received on top.
  const [editBaseVariants, setEditBaseVariants] = useState<Record<string, number>>({});

  // Build the variant dimensions for a product. Apparel = Colour × Size (always on).
  // Electricals/electronics = a Type × Spec matrix resolved from the product's CATEGORY
  // (bulb → Type × Watt, battery → Type × Capacity, …); null when the category has no spec.
  function buildVariantDim(category: string, gender?: string, footwearSizeSystem: FootwearSizeSystem = 'uk') {
    if (bizConfig.hasColors) {
      const chart = resolveClothingSizeChart(category, gender, bizConfig.type === 'shoes', bizConfig.sizeChart || [], footwearSizeSystem);
      return { options: bizConfig.colorChart || [], label: 'colour', swatch: true, sectionLabel: tv('colourSizeInventory'), sizeChart: chart };
    }
    if (bizConfig.hasSpecs) {
      const spec = getCategoryVariantSpec(category, bizConfig.type);
      if (spec) {
        const lbl = spec.typeLabel.toLowerCase();
        // Colour/shade dimensions get a swatch even on the spec path (apparel, footwear, lipstick…).
        const swatch = /colour|color|shade/.test(lbl);
        return { options: spec.typeOptions, label: lbl, swatch, sectionLabel: tv('specInventory', { type: spec.typeLabel, spec: spec.sizeLabel }), sizeChart: spec.sizeChart, sizeLabel: spec.sizeLabel, typeLabel: spec.typeLabel };
      }
    }
    return null;
  }
  // Memoized: buildVariantDim() only actually depends on category/gender/
  // bizConfig (bizConfig is a stable reference — getBusinessConfig() indexes
  // a static lookup table, never constructs a fresh object). Recomputing it
  // unconditionally on every render of this ~2700-line component — which
  // happens on every keystroke into ANY field, not just category/gender —
  // was measurable, avoidable overhead stacking on top of everything else in
  // this form; this is the general fix, not a one-off, for the same class of
  // "hard-coded to recompute every render" issue the LocalInput work below
  // exists to avoid for individual fields.
  const addVariantDim = useMemo(() => buildVariantDim(form.category, form.gender, sizeSystem), [form.category, form.gender, sizeSystem, bizConfig]);
  const editVariantDim = useMemo(() => buildVariantDim(editForm.category, editForm.gender, editSizeSystem), [editForm.category, editForm.gender, editSizeSystem, bizConfig]);

  // Every stocked variant should show a barcode value (auto-generated from the
  // product base if the shopkeeper hasn't typed one), so an empty input never
  // hides what the printed label / scanner will actually see. Same
  // generateVariantBarcodes() the "Generate barcodes for all variants" button
  // uses — but applied unconditionally in render so it appears without a
  // button click. It only fills MISSING entries (preserves any typed value),
  // and the same effective map is used at submit time so what the shopkeeper
  // sees on screen is exactly what gets persisted; a blank-and-cleared field
  // silently falls back to the auto value on the next render, matching the
  // user's ask: "if not manual add so default you can see previous Added type
  // PRD and generated code end color and size."
  const sizePricesEffective = useMemo(() => {
    const base = form.barcode || 'PRD-NEW';
    return generateVariantBarcodes(base, form.size_variants, sizePrices);
  }, [form.barcode, form.size_variants, sizePrices]);
  const editSizePricesEffective = useMemo(() => {
    const base = editForm.barcode || `PRD-${String(editProduct?.id || '').slice(0, 8).toUpperCase()}`;
    return generateVariantBarcodes(base, editForm.size_variants, editSizePrices);
  }, [editForm.barcode, editForm.size_variants, editSizePrices, editProduct?.id]);
  // The Add form's size chart isn't known until a category (and, for
  // apparel/footwear, Gender) resolves — unlike bizConfig.sizeChart, which is
  // seeded immediately when the modal opens (see the "+ Add Product" button).
  // Keep re-seeding as Category/Gender get typed (blank → "Jeans" → numeric
  // waist sizes) as long as the shopkeeper hasn't manually touched the size
  // picker yet — matches colors/editColors' own no-resync-after-manual-edit
  // behaviour, but gated on an explicit "touched" flag instead of "array is
  // still empty" so a category typed after modal-open still upgrades the chart.
  useEffect(() => {
    if (showAddModal && addVariantDim && sizeSelectionAuto) {
      setSizeSelection(addVariantDim.sizeChart);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddModal, addVariantDim?.sizeChart?.join(',')]);

  // 3-way mode: an electronics/electric shop with a spec-category (Mobile,
  // Laptop, Bulb…) AND a colour palette declared in businessConfig. Only
  // then does "Colour × RAM × Storage" make sense — for shops like clothes
  // the existing 2-way ColorSizeVariantGrid already covers it.
  const isThreeWay = bizConfig.hasShades && bizConfig.hasSpecs && !!(bizConfig.colorChart || []).length;
  const addThreeWayActive = isThreeWay && !!addVariantDim;
  const editThreeWayActive = isThreeWay && !!editVariantDim;
  // Extract the OUTER colour (the first ` / ` segment) from every 3-part
  // composite key so the Edit modal can preselect the chip picker.
  const outerColorsFromVariants = (v: Record<string, number>): string[] => {
    const out: string[] = [];
    for (const k of Object.keys(v)) {
      const parts = k.split(VARIANT_SEP);
      if (parts.length >= 3) {
        const c = parts[0];
        if (c && !out.includes(c)) out.push(c);
      }
    }
    return out;
  };
  // Stock comes from the grid only once the shopkeeper has actually picked
  // at least one colour/size/type — mirrors each JSX branch below 1:1
  // (ThreeWayVariantGrid / ColorSizeVariantGrid / plain SizeVariantGrid).
  // Previously `hasColors` forced this true unconditionally, so a brand-new
  // apparel/shoe product with no colour picked yet showed NO stock input at
  // all (the grid had nothing to render) — only Min Stock was visible, with
  // no way to record how much stock actually arrived. Gating on the real
  // selection instead means the flat Stock Qty field shows until a colour/
  // size is chosen, then the grid takes over — same fix already applied to
  // editVariantActive below for the identical reason.
  const addVariantActive = addThreeWayActive ? (outerColors.length > 0) : addVariantDim ? (colors.length > 0) : bizConfig.hasSizes ? (sizeSelection.length > 0) : false;
  // EDIT differs from ADD on purpose: a hasColors business (clothes/shoes)
  // still has real products with NO colour/size breakdown — created via
  // bulk import, or before the shop had size tracking — carrying only a
  // plain aggregate `currentStock`. Forcing editVariantActive=true for
  // every hasColors product (as ADD does, matching the old code here)
  // made editing one of those flat products read its size grid (all
  // zeros, since it never had one) as the stock, then warn/save over the
  // real currentStock as 0 on submit. Gating on `editColors.length > 0`
  // instead — seeded from the product's OWN saved size_variants when the
  // modal opens — means a flat product keeps showing (and saving) its
  // plain Current Stock field, while a real variant product (or one the
  // shopkeeper adds a colour to mid-edit) still gets the full grid. The
  // colour/size picker section itself isn't gated on this flag, so the
  // option to add colours to a flat product is never hidden either way.
  const editVariantActive = bizConfig.hasColors ? (editColors.length > 0) : editThreeWayActive ? (editOuterColors.length > 0) : bizConfig.hasSpecs ? (!!editVariantDim && editColors.length > 0) : bizConfig.hasSizes;

  // ── Add-product godown/shop assignment ──────────────────────────────────
  const [addToGodownId, setAddToGodownId] = useState('');

  // ── Godown / shop / unsynced view ───────────────────────────────────────
  const [viewMode, setViewMode] = useState<'all' | 'unsynced' | 'godown' | 'shop'>('all');
  const [godowns, setGodowns] = useState<any[]>([]);
  const [selectedGodownId, setSelectedGodownId] = useState('');
  const [godownData, setGodownData] = useState<any | null>(null);
  const [loadingGodown, setLoadingGodown] = useState(false);

  // Unsynced manual items
  const fetcher = ([url]: [string, string]) => api.get(url).then(res => res.data);
  const { data: unsyncedRes, mutate: mutateUnsynced, isLoading: loadingUnsynced } = useSWR(
    activeShopId ? ['/products/unsynced', activeShopId] : null,
    fetcher
  );
  const unsyncedItems = unsyncedRes?.data || [];

  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncingItem, setSyncingItem] = useState<any>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [selectedUnsynced, setSelectedUnsynced] = useState<string[]>([]);
  const [bulkSyncing, setBulkSyncing] = useState(false);
  const [deleteUnsyncedKey, setDeleteUnsyncedKey] = useState<string | null>(null);
  const [deletingUnsynced, setDeletingUnsynced] = useState(false);
  const [syncForm, setSyncForm] = useState({
    name: '',
    category: 'General',
    subCategory: '',
    costPrice: '',
    mrp: '',
    sellingPrice: '',
    baseUnit: 'Piece',
    initialStock: '',
    barcode: '',
    sku: ''
  });

  const handleOpenSyncModal = (item: any) => {
    setSyncingItem(item);
    setSyncForm({
      name: item.variant || '',
      category: 'General',
      subCategory: '',
      costPrice: String(item.costPrice || 0),
      mrp: String(item.sellingPrice || 0),
      sellingPrice: String(item.sellingPrice || 0),
      baseUnit: item.unit || 'Piece',
      initialStock: '10',
      barcode: '',
      sku: ''
    });
    setSyncModalOpen(true);
  };

  // Drops the given keys from the unsynced list immediately (no waiting on a
  // refetch round-trip) while still revalidating in the background to
  // reconcile with the server.
  const removeFromUnsyncedCache = (keys: string[]) => {
    mutateUnsynced((current: any) => current
      ? { ...current, data: (current.data || []).filter((i: any) => !keys.includes(i.key)) }
      : current, { revalidate: true });
  };

  const handleSyncSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!syncForm.name) return;
    setSyncLoading(true);
    try {
      await api.post('/products/unsynced', {
        name: syncForm.name,
        variantKey: syncingItem?.key,
        category: syncForm.category,
        subCategory: syncForm.subCategory,
        costPrice: Number(syncForm.costPrice) || 0,
        mrp: Number(syncForm.mrp) || 0,
        sellingPrice: Number(syncForm.sellingPrice) || 0,
        baseUnit: syncForm.baseUnit,
        initialStock: Number(syncForm.initialStock) || 0,
        barcode: syncForm.barcode,
        sku: syncForm.sku,
      });
      if (syncingItem?.key) removeFromUnsyncedCache([syncingItem.key]);
      invalidateProductCaches();
      setSelectedUnsynced(prev => prev.filter(k => k !== syncingItem?.key));
      setSyncModalOpen(false);
      setSyncingItem(null);
    } catch (err: any) {
      alert(err.response?.data?.detail || t('failedToSyncProduct'));
    } finally {
      setSyncLoading(false);
    }
  };

  const toggleSelectUnsynced = (key: string) => {
    setSelectedUnsynced(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const toggleSelectAllUnsynced = (checked: boolean) => {
    setSelectedUnsynced(checked ? unsyncedItems.map((i: any) => i.key) : []);
  };

  // Bulk sync uses each item's own detected name/price/unit as-is — the same
  // defaults the single-item modal prefills — so multiple quick items can be
  // registered to the catalog in one action instead of one modal at a time.
  const handleBulkSyncUnsynced = async () => {
    if (selectedUnsynced.length === 0) return;
    setBulkSyncing(true);
    const keys = [...selectedUnsynced];
    const failedKeys: string[] = [];
    const failedNames: string[] = [];
    try {
      for (const key of keys) {
        const item = unsyncedItems.find((i: any) => i.key === key);
        if (!item) continue;
        try {
          await api.post('/products/unsynced', {
            name: item.variant || 'Uncategorized Item',
            variantKey: item.key,
            category: 'General',
            costPrice: item.costPrice || 0,
            mrp: item.sellingPrice || 0,
            sellingPrice: item.sellingPrice || 0,
            baseUnit: item.unit || 'Piece',
            initialStock: 10,
          });
        } catch {
          failedKeys.push(key);
          failedNames.push(item.variant || key);
        }
      }
      const synced = keys.filter(k => !failedKeys.includes(k));
      removeFromUnsyncedCache(synced);
      invalidateProductCaches();
      setSelectedUnsynced(failedKeys);
      if (failedNames.length > 0) alert(`Could not sync: ${failedNames.join(', ')}`);
    } finally {
      setBulkSyncing(false);
    }
  };

  const doDeleteUnsynced = async (key: string) => {
    setDeletingUnsynced(true);
    try {
      await api.delete('/products/unsynced', { data: { variantKey: key } });
      removeFromUnsyncedCache([key]);
      setSelectedUnsynced(prev => prev.filter(k => k !== key));
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to delete item.');
    } finally {
      setDeletingUnsynced(false);
      setDeleteUnsyncedKey(null);
    }
  };

  async function loadGodowns() {
    try { const r = await api.get('/godowns'); setGodowns(r.data || []); } catch {}
  }
  async function loadGodownDetail(id: string) {
    if (!id) return;
    setLoadingGodown(true);
    try { const r = await api.get(`/godowns/${id}`); setGodownData(r.data); } catch {}
    finally { setLoadingGodown(false); }
  }
  useEffect(() => { if ((viewMode === 'godown' || showAddModal) && isWholesale && godowns.length === 0) loadGodowns(); }, [viewMode, showAddModal]);
  useEffect(() => { if (selectedGodownId) loadGodownDetail(selectedGodownId); }, [selectedGodownId]);

  // Reset form when business type changes
  useEffect(() => {
    setForm(buildEmptyForm(profile.businessType));
  }, [profile.businessType]);

  const modalInp = 'w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors';
  const modalSel = modalInp + ' cursor-pointer';

  // Camera helpers
  const startCamera = async () => {
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      alert(t('cameraAccessDenied'));
      setShowCamera(false);
    }
  };
  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    }
    setShowCamera(false);
  };
  const captureAndScan = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      stopCamera();
      await processScan(new File([blob], 'capture.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg');
  };
  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await processScan(file);
  };
  const processScan = async (file: File) => {
    setScanning(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post('/products/scan', formData);
      const d = res.data;
      setForm(prev => ({
        ...prev,
        name: d.name || '', category: d.category || '', unit: d.base_unit || 'Unit',
        mrp: d.mrp?.toString() || '', sellingPrice: d.selling_price?.toString() || '',
      }));
    } catch {
      alert(t('aiCouldNotReadProduct'));
    } finally {
      setScanning(false);
      if (scanInputRef.current) scanInputRef.current.value = '';
    }
  };

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Scoped to the active shop's own products even when All Shop Access pools
  // every owned shop's rows into `products` — otherwise a Kirana shop's
  // categories bleed into the Category dropdown for a Clothes shop just
  // because they share an owner, which is exactly what defaultCategories
  // (business-type-specific) and the /master-data categories (shop-scoped
  // server-side) below deliberately are NOT supposed to do.
  const activeShopProducts = useMemo(() => products.filter(p => p.shopId === activeShopId), [products, activeShopId]);
  const categories = useMemo(() => Array.from(new Set(activeShopProducts.map(p => p.category))).sort(), [activeShopProducts]);

  // Saved master categories + the ones already on products + business defaults.
  // `saveCategory` persists anything the user types so it is offered next time.
  const { suggestions: categorySuggestions, saveCategory } = useCategories(
    profile.businessType,
    categories.filter(Boolean) as string[],
  );
  const activeFilters = [filterCategory, filterStatus].filter(Boolean).length;

  const filtered = useMemo(() => products.filter(p => {
    const safeSearch = (search || '').toLowerCase();
    const safeName = (p.name || '').toLowerCase();
    const safeCategory = (p.category || '').toLowerCase();
    const safeBarcode = ((p as any).barcode || '').toLowerCase();

    const matchSearch = safeName.includes(safeSearch) ||
      safeCategory.includes(safeSearch) ||
      safeBarcode.includes(safeSearch) ||
      (safeName && safeSearch.includes(safeName));
    const matchCat = !filterCategory || p.category === filterCategory;
    const isLow = p.stock <= p.minStock && p.stock > 0;
    const isOut = p.stock === 0;
    const matchStatus = !filterStatus ? true :
      filterStatus === 'low' ? isLow : filterStatus === 'out' ? isOut :
      filterStatus === 'ok' ? (!isLow && !isOut) : true;
    return matchSearch && matchCat && matchStatus;
  }), [products, search, filterCategory, filterStatus]);

  // When All Shop Access is on, group into one table per shop (heading +
  // its own table) instead of one flat table with a Shop column — a single
  // group with no heading when off, so the exact same render path produces
  // today's unchanged output for every existing single-shop user.
  const productGroups = useMemo(() => {
    if (!allShopAccess) return [{ shopName: null as string | null, items: filtered }];
    const map = new Map<string, typeof filtered>();
    for (const p of filtered) {
      const key = p.shopName || 'Unknown Shop';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    const groups = Array.from(map.entries()).map(([shopName, items]) => ({ shopName, items }));
    // The shop currently switched to always leads the list — otherwise it
    // lands wherever the Map's insertion order happens to put it, which
    // isn't necessarily what the shopkeeper is looking at right now.
    groups.sort((a, b) => {
      const aActive = a.items[0]?.shopId === activeShopId;
      const bActive = b.items[0]?.shopId === activeShopId;
      return aActive === bActive ? 0 : aActive ? -1 : 1;
    });
    return groups;
  }, [filtered, allShopAccess, activeShopId]);

  // Drop composite "Colour / Size" variant + price entries whose colour is no longer selected.
  function pruneByColors<T>(map: Record<string, T>, keepColors: string[]): Record<string, T> {
    const out: Record<string, T> = {};
    for (const [k, v] of Object.entries(map)) {
      const { color } = splitVariantKey(k);
      if (!color || keepColors.includes(color)) out[k] = v;
    }
    return out;
  }
  function handleAddColorsChange(next: string[]) {
    setColors(next);
    // Also refresh `stock` (not just `size_variants`) from the pruned map.
    // Removing the LAST colour drops `editColors`/`colors` to length 0,
    // which flips `editVariantActive` to false — the submit handler then
    // reads this plain `stock` field instead of totalFromSizes(size_variants)
    // (see handleEditSubmit). Without this, `stock` stays whatever stale
    // snapshot it held from before any colours were touched, so removing a
    // shop's only colour saved the OLD total instead of the now-correct 0 —
    // "removed the colour but the stock quantity didn't go down".
    setForm(f => {
      const prunedVariants = pruneByColors(f.size_variants, next);
      return { ...f, size_variants: prunedVariants, stock: String(totalFromSizes(prunedVariants)) };
    });
    setSizePrices(p => pruneByColors(p, next));
    // Variant products use per-spec pricing by default (apparel always; electricals once a type is picked).
    setPerSizePricing(bizConfig.hasColors || next.length > 0);
  }
  function handleEditColorsChange(next: string[]) {
    setEditColors(next);
    // See handleAddColorsChange's comment — same stale-`stock`-fallback bug
    // when a colour removal empties `editColors` and flips editVariantActive
    // to false.
    setEditForm(f => {
      const prunedVariants = pruneByColors(f.size_variants, next);
      return { ...f, size_variants: prunedVariants, stock: String(totalFromSizes(prunedVariants)) };
    });
    setEditSizePrices(p => pruneByColors(p, next));
  }

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return; // synchronous guard — see submittingRef's own comment
    submittingRef.current = true;
    setSaving(true);
    const sizeVariantsJson = addVariantActive ? serializeSizeVariants(form.size_variants) : undefined;
    const stockQty = addVariantActive ? totalFromSizes(form.size_variants) : Number(form.stock);
    // Uses the *effective* map (with auto-generated barcodes filled in for
    // every stocked variant that doesn't have a typed override) so what the
    // shopkeeper saw on screen for each variant's barcode is exactly what
    // gets persisted — no gap between the visible auto-code and what a
    // future scanner will match against.
    let metadataPayload = addVariantActive ? mergeSizePricesIntoMetadata({}, sizePricesEffective, Object.keys(sizePricesEffective).length > 0) : undefined;
    // Liquor: alcohol % & bottle type ride along in the metadata JSON (no schema change).
    if (bizConfig.hasLiquorSpecs && (form.alcohol_percentage || form.bottle_type)) {
      metadataPayload = { ...(metadataPayload || {}),
        alcoholPercentage: form.alcohol_percentage || undefined,
        bottleType: form.bottle_type || undefined };
    }
    // Per-size pricing → default price is forced to 0; billing/table use the per-size prices.
    // Selling Price is always saved GST-inclusive regardless of which mode the
    // shopkeeper typed it in (see the Including/Excluding GST toggle below).
    const enteredSp = Number(form.sellingPrice) || 0;
    const normalizedSellingPrice = spMode === 'exclusive' ? toInclusivePrice(enteredSp, Number(form.gstPercent) || 0) : enteredSp;
    try {
      const res = await api.post('/products', {
        name: form.name, category: form.category,
        current_stock: stockQty, min_stock: Number(form.minStock),
        mrp: Number(form.mrp) || 0,
        selling_price: normalizedSellingPrice,
        wholesale_cost: effectiveCostPrice(form), base_unit: form.unit || 'Unit',
        cost_price_mode: form.costPriceMode,
        purchase_discount_percent: form.costPriceMode === 'mrp_based' && form.purchaseDiscountPercent !== ''
          ? Number(form.purchaseDiscountPercent) : null,
        is_loose: form.is_loose,
        expiry_date: form.expiry_date || null,
        batch_number: form.batch_number || null,
        drug_schedule: form.drug_schedule || null,
        model_number: form.model_number || null,
        warranty_months: form.warranty_months ? Number(form.warranty_months) : null,
        gender: form.gender || null,
        shade: form.shade || null,
        size_variants: sizeVariantsJson || null,
        metadata: metadataPayload,
        brand: form.brand || null,
        conversion_factor: form.conversion_factor ? Number(form.conversion_factor) : null,
        gstPercent: Number(form.gstPercent) || 0,
        hsnCode: form.hsnCode || null,
        barcode: form.barcode?.trim() || `BAR-${Date.now()}`,
        sku: form.sku?.trim() || null,
        otherCode: form.otherCode?.trim() || null,
        cartonBarcode: form.cartonBarcode?.trim() || null,
        location: form.location?.trim() || null,
      });

      // If a godown was selected, assign the initial stock to it
      if (addToGodownId && res.data?.id && stockQty > 0) {
        try {
          await api.post(`/godowns/${addToGodownId}/inventory`, {
            productId: res.data.id,
            quantity: stockQty,
          });
          // Refresh godown data if that godown is currently visible
          if (selectedGodownId === addToGodownId) loadGodownDetail(addToGodownId);
        } catch { /* godown assignment is best-effort */ }
      }

      // Remember a newly typed category so it is suggested next time.
      saveCategory(form.category);

      invalidateProductCaches();
      // Same reasoning as the Edit-Product save below: patch this page's own
      // table with the server's confirmed new row, last, so it's guaranteed
      // correct on screen even if an older /products fetch (still in flight
      // from something else) resolves after this and would otherwise race
      // invalidateProductCaches()'s own revalidate.
      if (res.data?.id) {
        mutateProducts(
          (current) => current ? [...current.filter(p => p.id !== res.data.id), mapApiProductToRow(res.data)] : current,
          { revalidate: false }
        );
      }
      toast.success('Product added');
      setForm(buildEmptyForm(profile.businessType));
      setSpMode('inclusive');
      setAddToGodownId('');
      setPerSizePricing(false);
      setSizePrices({});
      setColors([]);
      setShowAddModal(false);
    } catch (err: any) {
      // Previously a silent catch — a real failure (duplicate barcode, a
      // required field the API rejects, network timeout on the slow shared
      // pooler) left the modal open with zero indication anything went
      // wrong, reading identically to "the Add button doesn't work."
      const detail = err?.response?.data?.detail || err?.message || 'Failed to add product';
      toast.error(detail);
      console.error('[Add Product save failed]', err);
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  }

  function startEdit(product: Product) {
    setEditProduct(product);
    // product.sellingPrice is always stored GST-inclusive, so the editor
    // always starts in that mode regardless of what was chosen last time.
    setEditSpMode('inclusive');
    setEditForm({
      name: product.name || '',
      category: product.category || '',
      unit: product.unit || bizConfig.defaultUnits[0] || 'Unit',
      stock: String(product.stock ?? ''),
      minStock: String(product.minStock ?? ''),
      mrp: String(product.mrp || ''),
      sellingPrice: String(product.sellingPrice || ''),
      cost: String(product.cost || ''),
      is_loose: product.is_loose || false,
      expiry_date: product.expiry_date || '',
      batch_number: product.batch_number || '',
      drug_schedule: product.drug_schedule || 'OTC',
      model_number: product.model_number || '',
      warranty_months: String(product.warranty_months || ''),
      gender: product.gender || 'Unisex',
      shade: product.shade || '',
      size_variants: parseSizeVariants(product.size_variants),
      gstPercent: Number(product.gstPercent || 0),
      hsnCode: product.hsnCode || '',
      barcode: (product as any).barcode || '',
      sku: (product as any).sku || '',
      otherCode: (product as any).otherCode || '',
      cartonBarcode: (product as any).cartonBarcode || '',
      location: product.location || '',
      brand: product.brand || '',
      alcohol_percentage: String((product.metadata as any)?.alcoholPercentage ?? ''),
      bottle_type: String((product.metadata as any)?.bottleType ?? ''),
      conversion_factor: String(product.conversionFactor ?? product.conversion_factor ?? ''),
      // Cost is now always typed as ₹ in Vyapar/Dukan. Legacy products saved
      // in 'mrp_based' mode collapse into a plain manual cost equal to what
      // that formula computed at last save (product.wholesaleCost already
      // stores that resolved ₹), so the editor never silently drops the
      // shopkeeper's typed cost.
      costPriceMode: 'manual' as 'manual' | 'mrp_based',
      purchaseDiscountPercent: '',
    });
    // Load per-size pricing from metadata. Default it ON for variant products (colour/size or a
    // category with a spec matrix) so per-spec price fields are visible without hunting for a toggle.
    const existingPrices = parseSizePrices(product.metadata);
    const hasPrices = Object.keys(existingPrices).length > 0;
    const isVariantProduct = !!(bizConfig.hasColors || (bizConfig.hasSpecs && getCategoryVariantSpec(product.category, bizConfig.type)));
    setEditPerSizePricing(hasPrices || isVariantProduct);
    setEditSizePrices(existingPrices);
    // Colour × size: derive the selected colours from the existing composite variant keys.
    const parsedVariants = parseSizeVariants(product.size_variants);
    setEditColors(colorsFromVariants(parsedVariants));
    setEditOuterColors(outerColorsFromVariants(parsedVariants));
    // Seed the size picker from whichever chart applies to this product's
    // own category (not the still-default editForm.category, which hasn't
    // been set yet at this point) unioned with sizes already present in its
    // saved data — covers a legacy/custom size that predates the current
    // default chart, same merge already used inline for the colour+size grid.
    {
      const existingSizes = sizesFromVariants(parsedVariants);
      // Footwear only — infer which size system this product's existing
      // variants were already entered in (rather than always resetting the
      // toggle to UK), so re-opening a product built with US/EU sizes shows
      // its own sizes as selected instead of looking like they vanished.
      let footwearSizeSystem: FootwearSizeSystem = 'uk';
      if (bizConfig.type === 'shoes') {
        footwearSizeSystem = existingSizes.some(s => s.startsWith('US ')) ? 'us'
          : existingSizes.some(s => s.startsWith('EU ')) ? 'eu'
          : 'uk';
        setEditSizeSystem(footwearSizeSystem);
      }
      const productVariantDim = buildVariantDim(product.category || '', product.gender || '', footwearSizeSystem);
      setEditSizeSelection(Array.from(new Set([
        ...((productVariantDim?.sizeChart) || bizConfig.sizeChart || []),
        ...existingSizes,
      ])));
    }
    setEditBaseVariants(parsedVariants);
    setShowEditModal(true);
  }
  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editProduct) return;
    if (submittingRef.current) return; // synchronous guard — see submittingRef's own comment
    const sizeVariantsJson = editVariantActive ? serializeSizeVariants(editForm.size_variants) : undefined;
    const stockQty = editVariantActive ? totalFromSizes(editForm.size_variants) : Number(editForm.stock);
    // Data-destroying guard: additive mode can only ever ADD to a size's base
    // (deltas are clamped >= 0 — see SizeVariantGrid.handleChange), so under
    // normal use stockQty can never legitimately fall below priorStock. The one
    // way it does is stock that was never reflected in any size box to begin
    // with — a product created / imported / stock-adjusted with an aggregate
    // but no per-size distribution — in which case saving silently drops
    // whatever the size grid doesn't account for. Catches both the all-zero
    // case (stockQty === 0) and a partial distribution that still leaves some
    // of the aggregate unaccounted for (0 < stockQty < priorStock).
    const priorStock = Number((editProduct as any).stock ?? (editProduct as any).currentStock ?? 0);
    if (editVariantActive && stockQty < priorStock && priorStock > 0) {
      const ok = window.confirm(
        stockQty === 0
          ? `Warning: this will set stock to 0.\n\nCurrent stock: ${priorStock}\nAll size boxes are 0.\n\nDid you mean to distribute the ${priorStock} units across sizes first?\n\nClick Cancel to go back and fill the sizes, or OK to save as 0.`
          : `Warning: this will reduce total stock from ${priorStock} to ${stockQty}.\n\n${priorStock - stockQty} unit(s) aren't reflected in any size box and will be dropped.\n\nClick Cancel to go back and account for them, or OK to save as ${stockQty}.`
      );
      if (!ok) return;
    }
    submittingRef.current = true;
    setSaving(true);
    try {
      let editMetadata = editVariantActive
        ? mergeSizePricesIntoMetadata(editProduct.metadata, editSizePricesEffective, Object.keys(editSizePricesEffective).length > 0)
        : undefined;
      // Preserve/refresh liquor extras in the metadata JSON.
      if (bizConfig.hasLiquorSpecs) {
        editMetadata = { ...(editProduct.metadata || {}), ...(editMetadata || {}),
          alcoholPercentage: editForm.alcohol_percentage || undefined,
          bottleType: editForm.bottle_type || undefined };
      }
      // Per-size pricing → default price is forced to 0; billing/table use the per-size prices.
      // Selling Price is always saved GST-inclusive regardless of which mode the
      // shopkeeper typed it in (see the Including/Excluding GST toggle below).
      const enteredEditSp = Number(editForm.sellingPrice) || 0;
      const normalizedEditSellingPrice = editSpMode === 'exclusive' ? toInclusivePrice(enteredEditSp, Number(editForm.gstPercent) || 0) : enteredEditSp;
      const res = await api.put(`/products/${editProduct.id}`, {
        name: editForm.name,
        category: editForm.category,
        current_stock: stockQty,
        min_stock: Number(editForm.minStock),
        mrp: Number(editForm.mrp) || 0,
        selling_price: normalizedEditSellingPrice,
        wholesale_cost: effectiveCostPrice(editForm),
        cost_price_mode: editForm.costPriceMode,
        purchase_discount_percent: editForm.costPriceMode === 'mrp_based' && editForm.purchaseDiscountPercent !== ''
          ? Number(editForm.purchaseDiscountPercent) : null,
        base_unit: editForm.unit,
        is_loose: editForm.is_loose,
        expiry_date: editForm.expiry_date || null,
        batch_number: editForm.batch_number || null,
        drug_schedule: editForm.drug_schedule || null,
        model_number: editForm.model_number || null,
        warranty_months: editForm.warranty_months ? Number(editForm.warranty_months) : null,
        gender: editForm.gender || null,
        shade: editForm.shade || null,
        size_variants: sizeVariantsJson || null,
        metadata: editMetadata,
        brand: editForm.brand || null,
        conversion_factor: editForm.conversion_factor ? Number(editForm.conversion_factor) : null,
        gstPercent: Number(editForm.gstPercent) || 0,
        hsnCode: editForm.hsnCode || null,
        barcode: editForm.barcode?.trim() || undefined,
        sku: editForm.sku?.trim() || null,
        otherCode: editForm.otherCode?.trim() || null,
        cartonBarcode: editForm.cartonBarcode?.trim() || null,
        location: editForm.location?.trim() || null,
      }, shopIdHeader(editProduct.shopId));
      saveCategory(editForm.category);
      invalidateProductCaches();
      // Patch this page's own table with the server's CONFIRMED response for
      // just this row, as the last word on the matter. invalidateProductCaches()
      // above broadcasts a revalidate to every /products-keyed SWR consumer,
      // but that revalidate is just another GET racing against whatever else
      // is already in flight (e.g. this same shop's own products list re-fetch
      // that started moments earlier from adding OR editing a previous
      // product) — under the DB connection-pool contention this dev
      // environment already has, an OLDER, pre-edit fetch can easily resolve
      // AFTER this save and silently overwrite the table with stale data
      // (reproduced: add a product with colours/sizes, immediately edit its
      // colours/quantities and save — the table kept showing the pre-edit
      // values until a manual reload). SWR discards a revalidation that
      // STARTED before the most recent explicit mutate() for the same key,
      // so calling mutateProducts() with the real data, last, guarantees this
      // row is correct on screen regardless of how that race resolves.
      mutateProducts(
        (current) => current?.map(p => p.id === editProduct.id ? { ...p, ...mapApiProductToRow(res.data) } : p),
        { revalidate: false }
      );
      toast.success('Product saved');
      setShowEditModal(false);
      setEditProduct(null);
    } catch (err: any) {
      // Previously this was a silent `catch {}` — a real save failure (validation
      // error from the API, network timeout, or the additive-mode data-drop guard
      // above being rejected) just left the modal open with nothing on screen to
      // say why, reading identically to "the save button doesn't work." Surface it.
      const detail = err?.response?.data?.detail || err?.message || 'Failed to save product';
      toast.error(detail);
      console.error('[Edit Product save failed]', err);
    } finally { submittingRef.current = false; setSaving(false); }
  }
  async function doDelete(id: string | number) {
    try {
      const target = products.find(p => p.id === id);
      await api.delete(`/products/${id}`, shopIdHeader(target?.shopId));
      invalidateProductCaches();
      toast.success('Product deleted');
      setDeleteConfirmId(null);
    } catch (err: any) {
      // Silent catch previously — a blocked delete (e.g. product referenced
      // elsewhere) closed nothing and showed nothing, so the shopkeeper had
      // no way to tell a delete attempt had even failed.
      const detail = err?.response?.data?.detail || err?.message || 'Failed to delete product';
      toast.error(detail);
      console.error('[Delete Product failed]', err);
    }
  }

  function toggleProductSelect(id: string | number) {
    setSelectedProductIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleBulkDeleteProducts() {
    setBulkDeleting(true);
    try {
      // With All Shop Access on, the selection can span rows from several
      // different shops (each shop's table has its own "select all", and the
      // bulk-delete bar acts on the one shared selection) — the bulk route
      // only deletes ids that belong to the shop in the request's header, so
      // a single request would silently skip every non-active-shop id. Split
      // by each product's own shop and issue one request per group instead.
      const idsByShop = new Map<string, (string | number)[]>();
      for (const id of selectedProductIds) {
        const shopId = products.find(p => p.id === id)?.shopId;
        const key = shopId || '';
        if (!idsByShop.has(key)) idsByShop.set(key, []);
        idsByShop.get(key)!.push(id);
      }
      await Promise.all(
        Array.from(idsByShop.entries()).map(([shopId, ids]) =>
          api.delete(`/products/bulk?ids=${ids.join(',')}`, shopIdHeader(shopId))
        )
      );
      invalidateProductCaches();
      setSelectedProductIds(new Set());
    } catch {
      alert('Failed to delete some products.');
    } finally {
      setBulkDeleting(false);
      setConfirmBulkDelete(false);
    }
  }

  async function applyBulkPriceAdjust() {
    const v = Number(bulkAdjustValue);
    if (!isFinite(v) || v === 0) { setBulkAdjustNote('Enter a non-zero value first'); return; }
    if (selectedProductIds.size === 0) { setBulkAdjustNote('Select at least one product first'); return; }
    setBulkAdjusting(true);
    try {
      // Same per-shop split as bulk delete — the route only touches ids
      // that belong to the shop in the request's header.
      const idsByShop = new Map<string, (string | number)[]>();
      for (const id of selectedProductIds) {
        const shopId = products.find(p => p.id === id)?.shopId;
        const key = shopId || '';
        if (!idsByShop.has(key)) idsByShop.set(key, []);
        idsByShop.get(key)!.push(id);
      }
      let touched = 0;
      const results = await Promise.all(
        Array.from(idsByShop.entries()).map(([shopId, ids]) =>
          api.patch('/products/bulk', { ids, field: bulkAdjustField, mode: bulkAdjustMode, value: v }, shopIdHeader(shopId))
        )
      );
      touched = results.reduce((sum, r) => sum + (Number(r.data?.count) || 0), 0);
      invalidateProductCaches();
      const label = v > 0 ? `+${v}` : `${v}`;
      const unit = bulkAdjustMode === 'percent' ? '%' : '₹';
      setBulkAdjustNote(`Updated ${touched} product(s) by ${label}${unit}`);
    } catch {
      setBulkAdjustNote('Failed to update some products.');
    } finally {
      setBulkAdjusting(false);
    }
  }

  const statusOptions = [
    { val: '', label: String(t('allCategories') || 'All') },
    { val: 'ok', label: t('inStock'), dot: 'bg-emerald-500' },
    { val: 'low', label: t('lowStock'), dot: 'bg-orange-400' },
    { val: 'out', label: t('outOfStock'), dot: 'bg-red-400' },
  ];

  // ─── Render ────────────────────────────────────────────────────────────────
  // (Removed `if (!mounted) return null` — it flashed a blank frame on every
  //  navigation. `mounted` still exists for downstream localStorage reads.)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-emerald-500">{t('title')}</h1>
          <p className="text-sm text-slate-400 mt-1 flex items-center gap-2">
            <span className="text-lg">{bizConfig.emoji}</span>
            {bizConfig.label} Mode
            {bizConfig.hasExpiry && (
              <span className="text-xs bg-orange-500/15 text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded-full font-medium">
                Expiry Tracking ON
              </span>
            )}
            {bizConfig.hasSizes && (
              <span className="text-xs bg-violet-500/15 text-violet-400 border border-violet-500/30 px-2 py-0.5 rounded-full font-medium">
                Size Inventory ON
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs font-bold text-slate-400">
              {products.length.toLocaleString('en-IN')} / Unlimited products
            </p>
          </div>
          <ExportButton
            filename="products"
            title="Product List"
            summary={[{ label: 'Products', value: String(products.length) }]}
            columns={[
              { key: 'name', label: 'Product' },
              { key: 'category', label: 'Category' },
              { key: 'mrp', label: 'MRP', type: 'currency' },
              { key: 'purchaseDiscountPercent', label: 'Purchase %', type: 'number' },
              { key: 'cost', label: 'Cost Price', type: 'currency' },
              { key: 'sellingPrice', label: 'Selling Price', type: 'currency' },
              { key: 'stock', label: 'Stock', type: 'number' },
              { key: 'unit', label: 'Unit' },
              { key: 'location', label: 'Location' },
            ]}
            data={products}
          />
          <button onClick={() => { setColors([]); setOuterColors([]); setSizeSelection(bizConfig.sizeChart || []); setSizeSelectionAuto(true); setSizeSystem('uk'); setPerSizePricing(!!bizConfig.hasColors); setSizePrices({}); setShowAddModal(true); }}
            className="bg-emerald-500 text-slate-900 px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-400 transition-colors">
            <Plus size={20} />{t('addProduct')}
          </button>
        </div>
      </div>

      {/* View mode tabs */}
      <div className="flex gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1 shadow-sm">
        {[
          { key: 'all', label: 'All Products', icon: Package },
          { key: 'unsynced', label: `Unsynced Items (${unsyncedItems.length})`, icon: AlertCircle },
          ...(isWholesale ? [{ key: 'godown', label: 'By Godown', icon: Warehouse }] : []),
          ...(allShops.length > 1 ? [{ key: 'shop', label: 'By Shop', icon: Store }] : []),
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setViewMode(key as any)}
            className={cn('flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all',
              viewMode === key ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-500 dark:hover:text-slate-300')}>
            <Icon size={15} />{label}
          </button>
        ))}
      </div>

      {/* ── Unsynced Items view ── */}
      {viewMode === 'unsynced' && (
        <div className="space-y-4">
          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-between text-amber-600 dark:text-amber-400 text-sm">
            <div className="flex items-center gap-2 font-medium">
              <AlertCircle size={18} />
              <span>These items were added manually during billing. Click <strong>Sync to Product Master</strong> to register them into permanent stock catalog.</span>
            </div>
          </div>

          {loadingUnsynced ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-emerald-500" size={28} /></div>
          ) : unsyncedItems.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center shadow-sm">
              <Package className="w-12 h-12 mx-auto mb-3 text-slate-400 dark:text-slate-600" />
              <p className="text-slate-500 dark:text-slate-400 text-sm font-bold">No unsynced items found</p>
              <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">All billing items are fully synced to master products.</p>
            </div>
          ) : (
            <>
              {selectedUnsynced.length > 0 && (
                <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/30 p-3 rounded-xl flex items-center justify-between gap-4">
                  <span className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                    {selectedUnsynced.length} selected
                  </span>
                  <button
                    onClick={handleBulkSyncUnsynced}
                    disabled={bulkSyncing}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-60"
                  >
                    {bulkSyncing ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    Sync {selectedUnsynced.length} to Product Master
                  </button>
                </div>
              )}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="max-h-[calc(100vh-15rem)] overflow-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs uppercase shadow-sm">
                      <tr>
                        <th className="px-5 py-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={selectedUnsynced.length === unsyncedItems.length && unsyncedItems.length > 0}
                            onChange={e => toggleSelectAllUnsynced(e.target.checked)}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600 cursor-pointer"
                          />
                        </th>
                        <th className="px-5 py-3">Quick Item Name</th>
                        <th className="px-5 py-3">Cost Price</th>
                        <th className="px-5 py-3">Selling Price</th>
                        <th className="px-5 py-3">Unit</th>
                        <th className="px-5 py-3">Total Sold Qty</th>
                        <th className="px-5 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {unsyncedItems.map((uItem: any) => (
                        <tr key={uItem.key} className="text-slate-900 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="px-5 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={selectedUnsynced.includes(uItem.key)}
                              onChange={() => toggleSelectUnsynced(uItem.key)}
                              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600 cursor-pointer"
                            />
                          </td>
                          <td className="px-5 py-3 font-bold">{uItem.variant}</td>
                          <td className="px-5 py-3 text-slate-500 font-mono">₹{uItem.costPrice}</td>
                          <td className="px-5 py-3 text-emerald-600 dark:text-emerald-400 font-bold font-mono">₹{uItem.sellingPrice}</td>
                          <td className="px-5 py-3 text-slate-500">{uItem.unit}</td>
                          <td className="px-5 py-3 font-bold">{uItem.totalQtySold}</td>
                          <td className="px-5 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleOpenSyncModal(uItem)}
                                className="bg-emerald-500 hover:bg-emerald-400 text-white dark:text-slate-900 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-sm"
                              >
                                <Plus size={14} /> Sync to Product Master
                              </button>
                              <button
                                onClick={() => setDeleteUnsyncedKey(uItem.key)}
                                title="Delete this unsynced item"
                                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-red-500 hover:border-red-300 dark:hover:border-red-500/40 transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Delete Unsynced Item Confirm */}
      {deleteUnsyncedKey && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-red-200 dark:border-red-500/30 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center">
                <Trash2 size={18} className="text-red-500 dark:text-red-400" />
              </div>
              <div>
                <p className="font-bold text-slate-900 dark:text-slate-100">Delete this unsynced item?</p>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">It will be removed from this list permanently and won't be added to the product catalog.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteUnsyncedKey(null)} disabled={deletingUnsynced} className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 py-2.5 rounded-xl font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-60">Cancel</button>
              <button onClick={() => doDeleteUnsynced(deleteUnsyncedKey)} disabled={deletingUnsynced} className="flex-1 bg-red-500 text-white py-2.5 rounded-xl font-bold hover:bg-red-400 disabled:opacity-60 flex items-center justify-center gap-1.5">
                {deletingUnsynced && <Loader2 size={14} className="animate-spin" />} Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync to Master Product Modal */}
      {syncModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Package className="text-emerald-500" size={20} /> Register Quick Item to Master Catalog
              </h3>
              <button onClick={() => setSyncModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSyncSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Product Name</label>
                <input
                  type="text" required
                  className={modalInp}
                  value={syncForm.name}
                  onChange={e => setSyncForm({ ...syncForm, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Category</label>
                  <input
                    type="text" required
                    className={modalInp}
                    value={syncForm.category}
                    onChange={e => setSyncForm({ ...syncForm, category: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Sub Category</label>
                  <input
                    type="text" placeholder={t('optional')}
                    className={modalInp}
                    value={syncForm.subCategory}
                    onChange={e => setSyncForm({ ...syncForm, subCategory: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Cost Price (₹)</label>
                  <input
                    type="number" step="any" required
                    className={modalInp}
                    value={syncForm.costPrice}
                    onChange={e => setSyncForm({ ...syncForm, costPrice: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">MRP (₹)</label>
                  <input
                    type="number" step="any" required
                    className={modalInp}
                    value={syncForm.mrp}
                    onChange={e => setSyncForm({ ...syncForm, mrp: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Sell Price (₹)</label>
                  <input
                    type="number" step="any" required
                    className={modalInp}
                    value={syncForm.sellingPrice}
                    onChange={e => setSyncForm({ ...syncForm, sellingPrice: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Unit</label>
                  <select
                    className={modalSel}
                    value={syncForm.baseUnit}
                    onChange={e => setSyncForm({ ...syncForm, baseUnit: e.target.value })}
                  >
                    {bizConfig.defaultUnits.map(u => <option key={u} value={u}>{translateData(u, locale) || u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Initial Stock Qty</label>
                  <input
                    type="number" required
                    className={modalInp}
                    value={syncForm.initialStock}
                    onChange={e => setSyncForm({ ...syncForm, initialStock: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Barcode</label>
                  <input
                    type="text" placeholder={t('optional')}
                    className={modalInp}
                    value={syncForm.barcode}
                    onChange={e => setSyncForm({ ...syncForm, barcode: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">SKU</label>
                  <input
                    type="text" placeholder={t('optional')}
                    className={modalInp}
                    value={syncForm.sku}
                    onChange={e => setSyncForm({ ...syncForm, sku: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setSyncModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={syncLoading}
                  className="px-6 py-2.5 rounded-xl font-bold text-sm bg-emerald-500 hover:bg-emerald-400 text-white dark:text-slate-900 flex items-center gap-2 transition-all disabled:opacity-50"
                >
                  {syncLoading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  Save to Product Catalog
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Godown view ── */}
      {viewMode === 'godown' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <select
              className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 min-w-[220px]"
              value={selectedGodownId}
              onChange={e => setSelectedGodownId(e.target.value)}>
              <option value="">— Select Godown —</option>
              {godowns.map((g: any) => (
                <option key={g.id} value={g.id}>{g.name} ({g.godownCode || g.godown_code})</option>
              ))}
            </select>
            {selectedGodownId && godownData && (
              <span className="text-xs text-slate-500">
                {(godownData.inventory || []).length} products · {godownData.location && <span className="flex items-center gap-1 inline-flex"><MapPin size={10} />{godownData.location}</span>}
              </span>
            )}
          </div>

          {!selectedGodownId ? (
            <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center">
              <Warehouse className="w-12 h-12 mx-auto mb-3 text-slate-400 dark:text-slate-600" />
              <p className="text-slate-500 dark:text-slate-400 text-sm">Select a godown to view its products</p>
            </div>
          ) : loadingGodown ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-emerald-500 dark:text-emerald-400" size={28} /></div>
          ) : !godownData || (godownData.inventory || []).length === 0 ? (
            <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center">
              <Package className="w-12 h-12 mx-auto mb-3 text-slate-400 dark:text-slate-600" />
              <p className="text-slate-500 dark:text-slate-400 text-sm">No products in this godown yet</p>
              <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">Add products from the Godowns page</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                <Warehouse size={15} className="text-emerald-500 dark:text-emerald-400" />
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-200">{godownData.name}</span>
                <span className="ml-auto text-xs font-mono text-slate-500">{godownData.godownCode || godownData.godown_code}</span>
              </div>
              <div className="max-h-[calc(100vh-15rem)] overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs uppercase shadow-sm">
                    <tr>
                      <th className="px-5 py-3">Product</th>
                      <th className="px-5 py-3">Category</th>
                      <th className="px-5 py-3">Godown Qty</th>
                      <th className="px-5 py-3">Shop Stock</th>
                      <th className="px-5 py-3">Unit</th>
                      <th className="px-5 py-3">MRP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(godownData.inventory || []).map((item: any) => {
                      const p = item.product;
                      const shopProduct = products.find((sp: any) => sp.id === (item.productId || item.product_id));
                      return (
                        <tr key={item.id} className="text-slate-900 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="px-5 py-3 font-medium">{p?.name}</td>
                          <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{p?.category}</td>
                          <td className="px-5 py-3">
                            <span className="text-emerald-400 font-bold">{item.quantity}</span>
                          </td>
                          <td className="px-5 py-3">
                            {shopProduct != null ? (
                              <span className={cn('font-semibold', shopProduct.stock === 0 ? 'text-red-400' : shopProduct.stock <= shopProduct.minStock ? 'text-orange-400' : 'text-slate-300')}>
                                {shopProduct.stock}
                              </span>
                            ) : <span className="text-slate-600">—</span>}
                          </td>
                          <td className="px-5 py-3 text-slate-400">{p?.baseUnit || p?.base_unit}</td>
                          <td className="px-5 py-3 text-slate-300">₹{p?.mrp || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Shop view ── */}
      {viewMode === 'shop' && allShops.length > 1 && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {allShops.map(shop => {
              const isActive = activeShopId === shop.id || (!activeShopId && shop.id === profile.id);
              return (
                <button key={shop.id}
                  onClick={() => { switchShop(shop.id); setTimeout(mutateProducts, 300); }}
                  className={cn('flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all shadow-sm',
                    isActive ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900')}>
                  <Store size={14} />
                  <span>{shop.name}</span>
                  {shop.shopCode && <span className="text-[10px] font-mono text-slate-500">{shop.shopCode}</span>}
                  {isActive && <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full">Active</span>}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-500">Showing products for: <strong className="text-slate-300">{profile.shopName}</strong></p>
        </div>
      )}

      {/* ── All Products view (existing) ── */}
      {viewMode === 'all' && (
      <>
      {/* Search + Filter — pinned to the top of the scroll area so column
          headers below can stack against it (they use top-[76px] to match)
          and stay visible while browsing rows. The negative margins + matching
          padding stretch the sticky band edge-to-edge over the page's own
          horizontal padding so nothing shows through the sides. */}
      <div className="flex gap-4 sticky top-0 z-30 bg-slate-100 dark:bg-slate-950 py-3 -mx-3 md:-mx-8 px-3 md:px-8">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input type="text" placeholder={t('searchProductsPlaceholder')}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-3 pl-10 pr-12 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm transition-colors"
            value={search} onChange={e => setSearch(e.target.value)} />
          <button
            title={t('scanBarcodeToFind')}
            onClick={() => setShowScanner(true)}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 p-1.5 rounded-lg hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors"
          >
            <QrCode size={18} />
          </button>
        </div>
        <div className="relative" ref={filterRef}>
          <button onClick={() => setShowFilter(v => !v)}
            className={cn('p-3 rounded-xl border flex items-center gap-1.5 transition-colors shadow-sm',
              showFilter || activeFilters > 0
                ? 'bg-emerald-50 dark:bg-emerald-500/20 border-emerald-300 dark:border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900')}>
            <Filter size={18} />
            {activeFilters > 0 && (
              <span className="bg-emerald-500 text-white dark:text-slate-900 text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center">{activeFilters}</span>
            )}
          </button>
          {showFilter && (
            <div className="absolute right-0 top-full mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl z-30 w-64 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-slate-900 dark:text-slate-200">{t('filters')}</p>
                {activeFilters > 0 && (
                  <button onClick={() => { setFilterCategory(''); setFilterStatus(''); }}
                    className="text-xs text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300">{t('clearAll')}</button>
                )}
              </div>
              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1.5">{t('filterCategory')}</label>
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => setFilterCategory('')}
                    className={cn('px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                      !filterCategory ? 'bg-emerald-50 dark:bg-emerald-500/20 border-emerald-300 dark:border-emerald-500/40 text-emerald-600 dark:text-emerald-400' : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-transparent')}>
                    {t('allCategories')}
                  </button>
                  {categories.map(cat => (
                    <button key={cat} onClick={() => setFilterCategory(filterCategory === cat ? '' : cat)}
                      className={cn('px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                        filterCategory === cat ? 'bg-emerald-50 dark:bg-emerald-500/20 border-emerald-300 dark:border-emerald-500/40 text-emerald-600 dark:text-emerald-400' : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-transparent')}>
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1.5">{t('filterStatus')}</label>
                <div className="flex flex-col gap-1">
                  {statusOptions.map(opt => (
                    <button key={opt.val} onClick={() => setFilterStatus(opt.val)}
                      className={cn('w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors',
                        filterStatus === opt.val ? 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-medium' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-slate-200')}>
                      <span className={cn('inline-block w-2 h-2 rounded-full mr-2', opt.dot ?? 'bg-slate-400 dark:bg-slate-500')} />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Active filter chips */}
      {activeFilters > 0 && (
        <div className="flex flex-wrap gap-2">
          {filterCategory && (
            <span className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs px-3 py-1 rounded-full">
              {filterCategory}<button onClick={() => setFilterCategory('')}><X size={12} /></button>
            </span>
          )}
          {filterStatus && (
            <span className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs px-3 py-1 rounded-full">
              {filterStatus === 'ok' ? t('inStock') : filterStatus === 'low' ? t('lowStock') : t('outOfStock')}
              <button onClick={() => setFilterStatus('')}><X size={12} /></button>
            </span>
          )}
        </div>
      )}

      <SelectionActionBar
        count={selectedProductIds.size}
        itemLabel="product"
        onDelete={() => setConfirmBulkDelete(true)}
        onClear={() => setSelectedProductIds(new Set())}
        disabled={bulkDeleting}
        extraActions={
          <button
            onClick={() => { setBulkAdjustNote(''); setBulkAdjustOpen(true); }}
            disabled={bulkDeleting}
            className="text-xs bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <Percent size={14} /> Adjust Price
          </button>
        }
      />

      {/* Product Table — one per shop when All Shop Access is grouping the list */}
      {productGroups.map((group) => {
      // Each shop can be a different business type — use ITS OWN column set,
      // not the globally-active shop's, so a Footwear shop's group doesn't
      // show Electronics columns just because the active shop is Electronics.
      const groupBizConfig = getBusinessConfig(group.items[0]?.shopBusinessType || bizConfig.type);
      return (
      <div key={group.shopName || 'all'} className="space-y-3">
        {group.shopName && (
          <div className="flex items-center gap-2 px-1 pt-2">
            <Store size={16} className="text-indigo-500 dark:text-indigo-400" />
            <h3 className="text-sm font-black text-slate-900 dark:text-white">{group.shopName}</h3>
            <span className="text-xs text-slate-500">({group.items.length})</span>
          </div>
        )}
      {/* Self-contained scrolling grid: the inner wrapper is the ONE scroll
          container (both axes), bounded to roughly the viewport height. That
          keeps the wide table's horizontal overflow INSIDE the card (no more
          columns spilling past the border) while the thead sticks to the top
          of this same scroll box — sticky binds to its nearest scroll
          ancestor, so header and body scroll together horizontally and the
          header stays pinned vertically. Card keeps overflow-hidden for clean
          rounded corners; it's an ancestor, not the thead's scroll container,
          so it doesn't trap the sticky. */}
      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <CardContent className="p-0">
          <div className="relative max-h-[calc(100vh-15rem)] overflow-auto">
            {loading && (
              <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm z-10 flex items-center justify-center">
                <Loader2 className="animate-spin text-emerald-500" size={32} />
              </div>
            )}
            <table className="w-full text-left">
              <thead className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs uppercase shadow-sm">
                <tr>
                  <th className="px-6 py-4 w-10">
                    <input
                      type="checkbox"
                      checked={group.items.length > 0 && group.items.every(p => selectedProductIds.has(p.id))}
                      onChange={() => {
                        setSelectedProductIds(prev => {
                          const allSelected = group.items.every(p => prev.has(p.id));
                          const next = new Set(prev);
                          group.items.forEach(p => allSelected ? next.delete(p.id) : next.add(p.id));
                          return next;
                        });
                      }}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600 cursor-pointer"
                    />
                  </th>
                  <th className="px-6 py-4">{t('colName')}</th>
                  <th className="px-6 py-4">{t('colCategory')}</th>
                  <th className="px-6 py-4">{t('colStock')}</th>
                  <th className="px-6 py-4">{t('colMinStock')}</th>
                  {groupBizConfig.hasExpiry && <th className="px-6 py-4">Expiry</th>}
                  {groupBizConfig.hasBatch && <th className="px-6 py-4">Batch</th>}
                  {groupBizConfig.hasModel && <th className="px-6 py-4">Model</th>}
                  {groupBizConfig.hasWarranty && <th className="px-6 py-4">Warranty</th>}
                  {groupBizConfig.hasShades && <th className="px-6 py-4">{['electric', 'electronics'].includes(groupBizConfig.type) ? 'Color' : 'Shade'}</th>}
                  {groupBizConfig.hasGender && <th className="px-6 py-4">Gender</th>}
                  {groupBizConfig.hasLiquorSpecs && <th className="px-6 py-4">Brand / ABV</th>}
                  <th className="px-6 py-4 text-right">{t('colMRP')}</th>
                  <th className="px-6 py-4 text-right">{t('colSelling')}</th>
                  <th className="px-6 py-4 text-right">{t('colStockValue')}</th>
                  <th className="px-6 py-4 text-right">{t('colProfit')}</th>
                  <th className="px-6 py-4 text-right" title="Discount from MRP: (MRP − Selling Price) ÷ MRP">Disc %</th>
                  <th className="px-6 py-4">Location</th>
                  <th className="px-6 py-4 text-center">{t('colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {group.items.map(product => {
                  const isLowStock = product.stock <= product.minStock && product.stock > 0;
                  const isOut = product.stock === 0;
                  const sizeVariants = parseSizeVariants(product.size_variants);
                  const sizePriceData = parseSizePrices(product.metadata);
                  // A barcode-only entry (mrp/sellingPrice/cost all 0, auto-filled by
                  // the variant-barcode generator) must NOT count as "per-size pricing" —
                  // otherwise every barcoded variant product hides its real flat price
                  // behind a "Per-size" label with nothing to show a range of. Require
                  // at least one variant to carry a genuine (non-zero) price.
                  const hasPerSizePricing = Object.values(sizePriceData).some(sp =>
                    (Number(sp?.mrp) || 0) > 0 || (Number(sp?.sellingPrice) || 0) > 0 || (Number(sp?.cost) || 0) > 0);

                  // Variants can carry different MRP/selling prices — show the
                  // actual spread (e.g. "₹699–₹1,599") instead of a flat number,
                  // same reasoning as the profit-range calc below. Falls back to
                  // the "Per-size" label only when no variant has a price set yet.
                  let mrpRange: string | null = null;
                  let sellingRange: string | null = null;
                  if (hasPerSizePricing) {
                    const fmtRange = (vals: number[]) => {
                      if (vals.length === 0) return null;
                      const min = Math.min(...vals), max = Math.max(...vals);
                      return min === max
                        ? `₹${min.toLocaleString('en-IN')}`
                        : `₹${min.toLocaleString('en-IN')}–₹${max.toLocaleString('en-IN')}`;
                    };
                    mrpRange = fmtRange(Object.values(sizePriceData).map(sp => Number(sp?.mrp) || 0).filter(v => v > 0));
                    sellingRange = fmtRange(Object.values(sizePriceData).map(sp => Number(sp?.sellingPrice) || 0).filter(v => v > 0));
                  }

                  const hasCost = product.cost > 0 || (hasPerSizePricing && Object.values(sizePriceData).some(sp => sp.cost > 0));
                  const stockValue = hasPerSizePricing
                    ? Object.entries(sizeVariants).reduce((sum, [sz, qty]) => {
                        const cost = sizePriceData[sz]?.cost || product.cost;
                        const price = cost > 0 ? cost : (sizePriceData[sz]?.sellingPrice || product.sellingPrice || 0);
                        return sum + qty * price;
                      }, 0)
                    : (product.cost > 0 ? product.stock * product.cost : product.stock * product.sellingPrice);

                  let profit: string | null = null;
                  let profitStatus: 'profit' | 'loss' | 'zero' = 'zero';
                  const gstRate = product.gstPercent || 0;
                  const gstInclusive = !!profile.gstInclusiveProfit;

                  if (hasPerSizePricing) {
                    // Variants can carry wildly different margins (e.g. a phone
                    // where 128GB sells at 10% markup but 512GB at 40%). A single
                    // stock-weighted average hides that spread and can go negative
                    // just because a low-margin size happens to have the most
                    // stock — misleading. Instead scan every variant that has
                    // BOTH cost and sell set and show the range.
                    const margins: number[] = [];
                    // Consider every priced variant (not just currently-in-stock)
                    // so the shopkeeper sees the true configured margin spread.
                    for (const [sz, sp] of Object.entries(sizePriceData)) {
                      const c = Number(sp?.cost) || 0;
                      const s = Number(sp?.sellingPrice) || 0;
                      if (c > 0 && s > 0) {
                        margins.push(calculateProductProfit(s, c, gstRate, gstInclusive).percent);
                      }
                    }
                    if (margins.length > 0) {
                      const min = Math.min(...margins);
                      const max = Math.max(...margins);
                      profit = min === max ? min.toFixed(1) : `${min.toFixed(1)}–${max.toFixed(1)}`;
                      // Every variant profitable → green. Every variant a loss → red.
                      // Spans both (or sits exactly at zero) → orange, since a single
                      // color can't honestly represent a mixed range.
                      profitStatus = min > 0 ? 'profit' : max < 0 ? 'loss' : 'zero';
                    }
                  } else if (product.cost > 0 && product.sellingPrice > 0) {
                    const result = calculateProductProfit(product.sellingPrice, product.cost, gstRate, gstInclusive);
                    profit = result.percent.toFixed(1);
                    profitStatus = result.status;
                  }

                  return (
                    <tr key={product.id} onClick={() => setSelectedProduct(product)}
                      className="group text-slate-900 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-all duration-200 cursor-pointer">
                      <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedProductIds.has(product.id)}
                          onChange={() => toggleProductSelect(product.id)}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600 cursor-pointer"
                        />
                      </td>
                      <td className="px-6 py-4 font-medium">
                        <div className="flex items-center gap-2 flex-wrap">
                          <SmartTranslator text={product.name} locale={locale} />
                          {product.is_loose && <span className="text-[9px] bg-amber-500/20 text-amber-400 font-black px-1.5 py-0.5 rounded uppercase tracking-wide">{t('looseBadge')}</span>}
                          {product.shade && <span className="text-xs text-pink-500 dark:text-pink-400 bg-pink-100 dark:bg-pink-500/15 px-1.5 py-0.5 rounded-full">{product.shade}</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400"><SmartTranslator text={product.category} locale={locale} /></td>
                      <td className="px-6 py-4">
                        <div className={cn('flex items-center gap-1 font-bold', isOut ? 'text-red-400' : isLowStock ? 'text-orange-400' : 'text-emerald-400')}>
                          {(groupBizConfig.hasSizes || Object.keys(sizeVariants).length > 0) ? (
                            <div>
                              <div className="text-sm font-bold flex items-center gap-1">
                                {product.stock} <span className="text-[10px] opacity-70 font-medium"><SmartTranslator text={product.unit || 'Unit'} locale={locale} /></span>
                              </div>
                              {Object.keys(sizeVariants).length > 0 && (() => {
                                // If any keys are 3-part composites ("Colour / RAM / Storage"),
                                // roll up per outer colour: "Blue: 91 · Black: 43" — much easier
                                // to scan than the raw variant chips. Full breakdown stays a
                                // hover away.
                                const has3D = Object.keys(sizeVariants).some(k => k.split(' / ').length >= 3);
                                // A tight 3-column grid keeps the row compact
                                // when there are many variants — 9 chips render
                                // as a neat 3×3, not a tall vertical stack. If
                                // there are more, a "Show all" toggle expands
                                // the grid in place (no truncation) so the
                                // shopkeeper never has to hover a tooltip to
                                // read what's hidden.
                                if (has3D) {
                                  const byColor: Record<string, { qty: number; parts: string[] }> = {};
                                  for (const [k, q] of Object.entries(sizeVariants)) {
                                    if (!q) continue;
                                    const [color, ...rest] = k.split(' / ');
                                    const bucket = byColor[color] ||= { qty: 0, parts: [] };
                                    bucket.qty += q as number;
                                    bucket.parts.push(`${rest.join(' / ')}: ${q}`);
                                  }
                                  return (
                                    <VariantChipGrid
                                      productId={String(product.id)}
                                      entries={Object.entries(byColor).map(([color, { qty, parts }]) => ({
                                        key: color,
                                        label: `${color}: ${qty}`,
                                        title: parts.join('\n'),
                                        toneClass: 'bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 text-[10px] font-bold',
                                      }))}
                                    />
                                  );
                                }
                                const entries = Object.entries(sizeVariants).filter(([,q]) => q > 0);
                                return (
                                  <VariantChipGrid
                                    productId={String(product.id)}
                                    entries={entries.map(([sz, q]) => {
                                      const sp = sizePriceData[sz];
                                      const label = sp ? `${sz} ₹${sp.sellingPrice} (${q})` : `${sz}:${q}`;
                                      return {
                                        key: sz,
                                        label,
                                        title: sp ? `${sz} ₹${sp.sellingPrice} (${q})` : `${sz}: ${q}`,
                                        toneClass: sp
                                          ? 'bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 text-[9px]'
                                          : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[9px]',
                                      };
                                    })}
                                  />
                                );
                              })()}
                            </div>
                          ) : (
                            <>{product.stock} <span className="text-[10px] opacity-70 font-medium"><SmartTranslator text={product.unit} locale={locale} /></span></>
                          )}
                          {(product.recentlyAdded ?? 0) > 0 && (
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/15 px-1.5 py-0.5 rounded-full" title={t('recentlyAddedStock')}>
                              +{product.recentlyAdded}
                            </span>
                          )}
                          {isLowStock && <AlertCircle size={14} />}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{product.minStock}</td>
                      {groupBizConfig.hasExpiry && <td className="px-6 py-4"><ExpiryBadge date={product.expiry_date} /></td>}
                      {groupBizConfig.hasBatch && <td className="px-6 py-4 text-xs text-slate-600 dark:text-slate-400">{product.batch_number || '—'}</td>}
                      {groupBizConfig.hasModel && <td className="px-6 py-4 text-xs text-slate-600 dark:text-slate-300 font-mono">{product.model_number || '—'}</td>}
                      {groupBizConfig.hasWarranty && (
                        <td className="px-6 py-4 text-xs">
                          {product.warranty_months ? (
                            <span className="flex items-center gap-1 text-sky-500 dark:text-sky-400">
                              <ShieldCheck size={12} />{product.warranty_months}m
                            </span>
                          ) : '—'}
                        </td>
                      )}
                      {groupBizConfig.hasShades && <td className="px-6 py-4 text-xs text-pink-500 dark:text-pink-400">{product.shade || '—'}</td>}
                      {groupBizConfig.hasGender && <td className="px-6 py-4 text-xs text-slate-600 dark:text-slate-400">{product.gender || '—'}</td>}
                      {groupBizConfig.hasLiquorSpecs && (
                        <td className="px-6 py-4 text-xs text-slate-600 dark:text-slate-400">
                          {product.brand || '—'}
                          {(product.metadata as any)?.alcoholPercentage && <span className="ml-1 text-rose-500 dark:text-rose-400 font-semibold">· {(product.metadata as any).alcoholPercentage}%</span>}
                        </td>
                      )}
                      <td className="px-6 py-4 text-right text-slate-500 dark:text-slate-400">
                        {hasPerSizePricing
                          ? (mrpRange
                              ? <span className="text-[11px] font-semibold text-violet-600 dark:text-violet-400" title="MRP range across variants">{mrpRange}</span>
                              : <span className="text-[10px] font-semibold text-violet-500 dark:text-violet-400 italic">Per-size</span>)
                          : `₹${product.mrp?.toLocaleString('en-IN') ?? '—'}`}
                      </td>
                      <td className="px-6 py-4 text-right font-bold">
                        {hasPerSizePricing
                          ? (sellingRange
                              ? <span className="text-[11px] text-violet-600 dark:text-violet-400" title="Selling price range across variants">{sellingRange}</span>
                              : <span className="text-[10px] font-semibold text-violet-500 dark:text-violet-400 italic">Per-size ↕</span>)
                          : `₹${product.sellingPrice?.toLocaleString('en-IN') ?? '—'}`}
                      </td>
                      <td className="px-6 py-4 text-right font-semibold">
                        <span className={hasCost ? 'text-amber-500 dark:text-amber-400' : 'text-slate-500'}>
                          {hasCost ? '' : '~'}₹{stockValue.toLocaleString('en-IN')}
                        </span>
                        {!hasCost && <span className="block text-[9px] text-slate-400 dark:text-slate-600 font-normal">add cost price</span>}
                      </td>
                      <td className="px-6 py-4 text-right" onClick={e => e.stopPropagation()}>
                        {profit !== null
                          ? <span className={cn('font-bold', profitColorClass(profitStatus))}>{profit}%</span>
                          : <button onClick={() => startEdit(product)} className="text-[10px] text-slate-500 dark:text-slate-400 hover:text-amber-500 dark:hover:text-amber-400 underline transition-colors">set cost</button>
                        }
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-slate-500 dark:text-slate-400">
                        {(() => {
                          const mrp = Number(product.mrp) || 0;
                          const sp = Number(product.sellingPrice) || 0;
                          if (mrp <= 0 || sp <= 0 || sp > mrp) return '—';
                          const pct = ((mrp - sp) / mrp) * 100;
                          if (pct <= 0) return <span className="text-slate-400">0%</span>;
                          return <span className="text-blue-600 dark:text-blue-400 font-semibold" title={`MRP ₹${mrp} − SP ₹${sp}`}>{pct.toFixed(1)}%</span>;
                        })()}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">{product.location || '—'}</td>
                      <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5 opacity-100 transition-opacity">
                          <button onClick={() => setQrProduct(product)} title={t('barcodeQrTitle')}
                            className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 hover:text-blue-600 dark:hover:text-blue-400 transition-all active:scale-90 border border-slate-200 dark:border-slate-700/50">
                            <QrCode size={14} />
                          </button>
                          <button onClick={() => startEdit(product)} title={t('edit')}
                            className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all active:scale-90 border border-slate-200 dark:border-slate-700/50">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => setDeleteConfirmId(product.id)} title={t('delete')}
                            className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-red-100 dark:hover:bg-red-500/20 hover:text-red-600 dark:hover:text-red-400 transition-all active:scale-90 border border-slate-200 dark:border-slate-700/50">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {group.items.length === 0 && !loading && (
                  <tr><td colSpan={20} className="px-6 py-12 text-center text-slate-500">{t('noProducts')}</td></tr>
                )}
              </tbody>
              {group.items.length > 0 && (
                <tfoot className="bg-slate-50 dark:bg-slate-800/70 border-t border-slate-200 dark:border-slate-700">
                  <tr>
                    <td className="px-6 py-3 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase" colSpan={3}>{t('totalCost')}</td>
                    <td className="px-6 py-3 text-right text-amber-500 dark:text-amber-400 font-bold text-base" colSpan={2}>
                      ₹{group.items.reduce((sum: number, p: any) => {
                        const sizeVariants = parseSizeVariants(p.size_variants);
                        const sizePriceData = parseSizePrices(p.metadata);
                        const hasPerSizePricing = Object.values(sizePriceData).some((sp: any) =>
                          (Number(sp?.mrp) || 0) > 0 || (Number(sp?.sellingPrice) || 0) > 0 || (Number(sp?.cost) || 0) > 0);

                        const val = hasPerSizePricing
                          ? Object.entries(sizeVariants).reduce((s, [sz, qty]) => {
                              const cost = sizePriceData[sz]?.cost || p.cost;
                              const price = cost > 0 ? cost : (sizePriceData[sz]?.sellingPrice || p.sellingPrice || 0);
                              return s + qty * price;
                            }, 0)
                          : (p.cost > 0 ? p.stock * p.cost : p.stock * p.sellingPrice);
                          
                        return sum + val;
                      }, 0).toLocaleString('en-IN')}
                    </td>
                    <td colSpan={20} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
      </div>
      );
      })}

      {/* Barcode & QR Generator Modal */}
      {qrProduct && (
        <BarcodeQRModal
          product={{
            ...qrProduct,
            // Feed the modal the variant map + metadata so the Variants tab
            // can list every colour/size + its per-variant barcode.
            size_variants: qrProduct.size_variants,
            metadata: qrProduct.metadata,
            stock: qrProduct.stock,
            cartonBarcode: qrProduct.cartonBarcode,
            wholesaleCost: qrProduct.cost,
          }}
          onClose={() => setQrProduct(null)}
        />
      )}

      {/* Camera Barcode Scanner */}
      {showScanner && (
        <CameraScanner 
          onScan={(res) => { 
            setSearch(res); 
            setShowScanner(false); 
          }} 
          onClose={() => setShowScanner(false)} 
        />
      )}

      {/* ── Edit Product Modal ── */}
      {showEditModal && editProduct && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/20 sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{bizConfig.emoji}</span>
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Edit Product</h2>
                  <p className="text-xs text-slate-500 truncate max-w-[200px]">{editProduct.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setQrProduct(editProduct)} title="Barcode / QR"
                  className="p-2 rounded-lg text-indigo-500 hover:bg-indigo-500/10 transition-colors">
                  <BarcodeIcon size={18} />
                </button>
                <button onClick={() => { setShowEditModal(false); setEditProduct(null); }} className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"><X size={20} /></button>
              </div>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-5">
              {/* Basic Info */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-1 h-4 rounded bg-emerald-500" />
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Basic Info</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Product Name</label>
                  <LocalInput required autoFocus className={modalInp} value={editForm.name} onCommit={v => setEditForm(f => ({ ...f, name: v }))} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Category</label>
                    <CategoryPicker required className={modalInp} placeholder={t('typeToAddNewCategory')}
                      value={editForm.category} onChange={v => setEditForm(f => ({ ...f, category: v }))}
                      suggestions={categorySuggestions} renderLabel={c => translateData(c, locale)} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Unit</label>
                    <select className={modalSel} value={editForm.unit} onChange={e => setEditForm(f => ({ ...f, unit: e.target.value }))}>
                      {bizConfig.defaultUnits.map(u => <option key={u} value={u}>{translateData(u, locale) || u}</option>)}
                    </select>
                  </div>
                </div>
                {bizConfig.hasGender && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Gender</label>
                    <select className={modalSel} value={editForm.gender} onChange={e => setEditForm(f => ({ ...f, gender: e.target.value }))}>
                      {['Unisex', 'Men', 'Women', 'Boys', 'Girls', 'Kids'].map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                )}
                {/* Footwear only — India/UK sizes are numerically identical, so
                    that's the practical default; US/EU relabel the same
                    physical sizes (see FOOTWEAR_SIZE_TABLES). Resets the size
                    picker to the new system's chart on change, unioned with
                    any size that already has real stock so it stays visible
                    regardless of which system it was originally entered in. */}
                {bizConfig.type === 'shoes' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Size System</label>
                    <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 w-fit">
                      {(['uk', 'us', 'eu'] as const).map(sys => (
                        <button key={sys} type="button"
                          onClick={() => {
                            if (sys === editSizeSystem) return;
                            setEditSizeSystem(sys);
                            const chart = buildVariantDim(editForm.category, editForm.gender, sys)?.sizeChart || [];
                            setEditSizeSelection(Array.from(new Set([...chart, ...sizesFromVariants(editForm.size_variants)])));
                          }}
                          className={cn('px-3 py-1 rounded-md text-[10px] font-bold transition-all',
                            editSizeSystem === sys ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500 dark:text-slate-400')}
                        >
                          {sys === 'uk' ? 'India / UK' : sys.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/* Fabric stays; Shade collapses into the 3-way grid for electronics/electric. */}
                {(bizConfig.hasFabric || (bizConfig.hasShades && !isThreeWay)) && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{bizConfig.hasFabric ? 'Fabric / Material' : 'Shade / Color'}</label>
                    <LocalInput className={modalInp} value={editForm.shade} onCommit={v => setEditForm(f => ({ ...f, shade: v }))} />
                  </div>
                )}
                {bizConfig.hasModel && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Model Number</label>
                      <LocalInput className={modalInp} placeholder="e.g. SM-G990B" value={editForm.model_number} onCommit={v => setEditForm(f => ({ ...f, model_number: v }))} />
                    </div>
                    {bizConfig.hasWarranty && (
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Warranty (months)</label>
                        <LocalInput type="number" min="0" className={modalInp} placeholder="12" value={editForm.warranty_months} onCommit={v => setEditForm(f => ({ ...f, warranty_months: v }))} />
                      </div>
                    )}
                  </div>
                )}

                {/* Liquor — Beer Bar & Wine Shop */}
                {bizConfig.hasLiquorSpecs && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Brand</label>
                      <LocalInput className={modalInp} placeholder="e.g. Kingfisher, Blenders Pride" value={editForm.brand} onCommit={v => setEditForm(f => ({ ...f, brand: v }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Alcohol %</label>
                      <LocalInput type="number" min="0" step="0.1" className={modalInp} placeholder="e.g. 5 / 42.8" value={editForm.alcohol_percentage} onCommit={v => setEditForm(f => ({ ...f, alcohol_percentage: v }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Bottle Type</label>
                      <select className={modalSel} value={editForm.bottle_type} onChange={e => setEditForm(f => ({ ...f, bottle_type: e.target.value }))}>
                        <option value="">Select...</option>
                        {['Bottle', 'Can', 'PET', 'Tetra', 'Pack'].map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Units per Case (1 Case = ? {editForm.unit})</label>
                      <LocalInput type="number" min="0" className={modalInp} placeholder="e.g. 12" value={editForm.conversion_factor} onCommit={v => setEditForm(f => ({ ...f, conversion_factor: v }))} />
                    </div>
                  </div>
                )}
              </section>

              {/* Medical Fields */}
              {(bizConfig.hasBatch || bizConfig.hasDrugSchedule) && (
                <section className="space-y-3 bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-1 h-4 rounded bg-blue-500" />
                    <p className="text-[11px] font-bold text-blue-400 uppercase tracking-widest">Medical Details</p>
                  </div>
                  {bizConfig.hasBatch && (
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Batch Number</label>
                      <LocalInput className={modalInp} value={editForm.batch_number} onCommit={v => setEditForm(f => ({ ...f, batch_number: v }))} />
                    </div>
                  )}
                  {bizConfig.hasDrugSchedule && (
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Drug Schedule</label>
                      <select className={modalSel} value={editForm.drug_schedule} onChange={e => setEditForm(f => ({ ...f, drug_schedule: e.target.value }))}>
                        {['OTC', 'Rx', 'H1', 'H2', 'X'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  )}
                </section>
              )}

              {/* Size / Variant Inventory */}
              {((bizConfig.hasSizes && bizConfig.sizeChart) || (bizConfig.hasSpecs && editVariantDim)) && (
                <section className="space-y-3 bg-violet-500/5 border border-violet-500/20 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-4 rounded bg-violet-500" />
                      <p className="text-[11px] font-bold text-violet-500 dark:text-violet-400 uppercase tracking-widest">{editVariantDim?.sectionLabel || tv('sizeWeightInventory')}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {editPerSizePricing && (
                        <button
                          type="button"
                          title={tv('generateVariantBarcodes')}
                          onClick={() => {
                            const base = (editForm.barcode || `PRD-${String(editProduct?.id || '').slice(0, 8)}`);
                            setEditSizePrices(prev => generateVariantBarcodes(base, editForm.size_variants, prev));
                          }}
                          className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-500/30 hover:bg-sky-200 dark:hover:bg-sky-500/30"
                        >
                          <Package size={10} />
                          {tv('generateVariantBarcodes')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const next = !editPerSizePricing;
                          setEditPerSizePricing(next);
                          // Per-size pricing replaces the default price → reset it to 0.
                          if (next) setEditForm(f => ({ ...f, mrp: '0', sellingPrice: '0', cost: '0' }));
                        }}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all',
                          editPerSizePricing
                            ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700 hover:text-slate-600 dark:hover:text-slate-300'
                        )}
                      >
                        <IndianRupee size={10} />
                        {editPerSizePricing ? tv('perSizePricingOn') : tv('perSizePricing')}
                      </button>
                    </div>
                  </div>
                  {bizConfig.hasSpecs && editVariantDim && (
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">{tv('optionalProductHint')}</p>
                  )}
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">{tv('editVariantAdditiveHint')}</p>
                  {(() => {
                    // A product created / imported / stock-adjusted with only an
                    // aggregate count (no per-size split) opens here with every
                    // size box showing its true value: 0. That's correct per-size,
                    // but with nothing nearby saying where the real stock went, it
                    // reads as "this product has no stock" — surface the aggregate
                    // so it isn't mistaken for zero. Mirrors the same banner already
                    // shown for this exact state on the Billing quick-sell picker.
                    const assignedTotal = Object.values(editBaseVariants).reduce((s, v) => s + (Number(v) || 0), 0);
                    const aggregateStock = Number((editProduct as any)?.stock ?? (editProduct as any)?.currentStock ?? 0);
                    const unassigned = assignedTotal === 0 && aggregateStock > 0 ? aggregateStock : 0;
                    if (unassigned <= 0) return null;
                    const unitWord = editForm.unit?.toLowerCase() || 'units';
                    // The 2-way grid distributes BOTH colour and size, so naming only
                    // the outer dimension ("colour") undersells what's left to fill in.
                    const dimensionWord = bizConfig.hasColors
                      ? 'colour and size'
                      : (editVariantDim?.sizeLabel || editVariantDim?.label || 'size').toLowerCase();
                    return (
                      <div className="rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300 leading-snug">
                        <strong>{unassigned} {unitWord} in stock</strong> but not yet assigned to any specific {dimensionWord}.
                        Fill in the boxes below to distribute it — it stays tracked only as a shop-wide total until you do, and saving without distributing it will drop whatever isn't reflected in a box.
                      </div>
                    );
                  })()}
                  {editThreeWayActive ? (
                    <ThreeWayVariantGrid
                      colorPalette={bizConfig.colorChart || []}
                      colors={editOuterColors}
                      onColorsChange={setEditOuterColors}
                      innerRowOptions={editVariantDim!.options}
                      innerColOptions={editVariantDim!.sizeChart}
                      value={editForm.size_variants}
                      onChange={variants => setEditForm(f => ({ ...f, size_variants: variants }))}
                      unitLabel={editForm.unit?.toLowerCase() || 'units'}
                      perSizePricing={editPerSizePricing}
                      sizePrices={editSizePricesEffective}
                      onSizePricesChange={setEditSizePrices}
                      innerRowLabel={editVariantDim!.typeLabel || editVariantDim!.label}
                      innerColLabel={editVariantDim!.sizeLabel || 'Size'}
                      additiveMode
                      baseValue={editBaseVariants}
                    />
                  ) : editVariantDim ? (
                    <div className="space-y-3">
                      <ColorPicker colorChart={editVariantDim!.options} value={editColors} onChange={handleEditColorsChange} showSwatch={editVariantDim!.swatch} />
                      <SizePicker sizeChart={editVariantDim!.sizeChart} value={editSizeSelection} onChange={setEditSizeSelection} />
                      <ColorSizeVariantGrid
                        colors={editColors}
                        sizeChart={Array.from(new Set([...editSizeSelection, ...sizesFromVariants(editForm.size_variants)]))}
                        value={editForm.size_variants}
                        onChange={variants => setEditForm(f => ({ ...f, size_variants: variants }))}
                        unitLabel={editForm.unit?.toLowerCase() || 'units'}
                        perSizePricing={editPerSizePricing}
                        sizePrices={editSizePricesEffective}
                        onSizePricesChange={setEditSizePrices}
                        showSwatch={editVariantDim!.swatch}
                        dimensionLabel={editVariantDim!.label}
                        additiveMode
                        baseValue={editBaseVariants}
                      />
                    </div>
                  ) : (
                  <div className="space-y-3">
                    <SizePicker sizeChart={bizConfig.sizeChart || []} value={editSizeSelection} onChange={setEditSizeSelection} />
                    <SizeVariantGrid
                      sizeChart={Array.from(new Set([...editSizeSelection, ...sizesFromVariants(editForm.size_variants)]))}
                      value={editForm.size_variants}
                      onChange={variants => setEditForm(f => ({ ...f, size_variants: variants }))}
                      unitLabel={editForm.unit?.toLowerCase() || 'units'}
                      perSizePricing={editPerSizePricing}
                      sizePrices={editSizePricesEffective}
                      onSizePricesChange={setEditSizePrices}
                      additiveMode
                      baseValue={editBaseVariants}
                    />
                  </div>
                  )}
                </section>
              )}

              {/* Stock & Min */}
              {!editVariantActive && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Current Stock</label>
                    <LocalInput required type="number" min="0" className={modalInp} value={editForm.stock} onCommit={v => setEditForm(f => ({ ...f, stock: v }))} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Min Stock Level</label>
                    <LocalInput required type="number" min="0" className={modalInp} value={editForm.minStock} onCommit={v => setEditForm(f => ({ ...f, minStock: v }))} />
                  </div>
                </div>
              )}

              {/* Global Min Stock Level — the fallback threshold used by low-stock
                  reports/alerts for any variant that doesn't have its own
                  per-size override (see sizePrices[size].minStock in the grid
                  above). Shown regardless of the per-size-pricing toggle: it's
                  not a duplicate of that panel's per-variant field, it's what
                  every variant falls back to when it has no override — and
                  per-size-pricing defaults ON for any colour product, so
                  gating this on it left variant products with no way to set
                  a Min Stock at all. */}
              {editVariantActive && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Min Stock Level (Total)</label>
                  <LocalInput required type="number" min="0" className={modalInp} value={editForm.minStock} onCommit={v => setEditForm(f => ({ ...f, minStock: v }))} />
                  {editPerSizePricing && (
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">{tv('minStockFallbackHint')}</p>
                  )}
                </div>
              )}

              {/* Expiry */}
              {bizConfig.hasExpiry && (
                <ExpiryDateField value={editForm.expiry_date} onChange={val => setEditForm(f => ({ ...f, expiry_date: val }))} required={false} />
              )}

              {/* Pricing - when per-spec pricing is on these act as an optional fallback price */}
              <section className="space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-1 h-4 rounded bg-amber-500" />
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{editPerSizePricing ? tv('fallbackPriceLabel') : tv('pricingLabel')}</p>
                </div>
                {editPerSizePricing && (
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 -mt-1">{tv('fallbackPriceHint')}</p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">MRP</label>
                    <LocalInput required={!editPerSizePricing} type="number" min="0" className={modalInp} placeholder="0" value={editForm.mrp} onCommit={v => setEditForm(f => ({ ...f, mrp: v }))} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Selling Price</label>
                    <LocalInput required={!editPerSizePricing} type="number" min="0" className={`${modalInp} text-emerald-400 font-bold`} placeholder="0" value={editForm.sellingPrice} onCommit={v => setEditForm(f => ({ ...f, sellingPrice: v }))} />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cost Price</label>
                      {/* Manual vs MRP-based — same toggle the Add form has. Switching modes
                          carries the current value across so nothing typed gets dropped. */}
                      <div className="flex bg-slate-100 dark:bg-slate-800 rounded-md p-0.5">
                        {(['manual', 'mrp_based'] as const).map(mode => (
                          <button key={mode} type="button"
                            onClick={() => setEditForm(f => {
                              const currentMode = f.costPriceMode || 'manual';
                              if (mode === currentMode) return f;
                              if (mode === 'manual') {
                                const resolved = effectiveCostPrice(f);
                                return { ...f, costPriceMode: mode, cost: resolved > 0 ? String(Math.round(resolved * 100) / 100) : f.cost };
                              }
                              const mrp = Number(f.mrp) || 0;
                              const cost = Number(f.cost) || 0;
                              const pct = mrp > 0 && cost > 0 ? ((mrp - cost) / mrp) * 100 : NaN;
                              return { ...f, costPriceMode: mode, purchaseDiscountPercent: Number.isFinite(pct) ? String(Math.round(Math.max(0, pct) * 100) / 100) : f.purchaseDiscountPercent };
                            })}
                            className={cn('px-1.5 py-0.5 rounded text-[8px] font-bold uppercase transition-all',
                              (editForm.costPriceMode || 'manual') === mode ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-400')}>
                            {mode === 'manual' ? 'Manual' : 'MRP'}
                          </button>
                        ))}
                      </div>
                    </div>
                    {editForm.costPriceMode === 'mrp_based' ? (
                      <>
                        <LocalInput type="number" min="0" max="100" className={`${modalInp} text-amber-400`} placeholder="Discount %"
                          value={editForm.purchaseDiscountPercent} onCommit={v => setEditForm(f => ({ ...f, purchaseDiscountPercent: v }))} />
                        <p className="text-[10px] text-amber-500 dark:text-amber-400 font-bold mt-1">= ₹{effectiveCostPrice(editForm).toFixed(2)}</p>
                      </>
                    ) : (
                      <LocalInput type="number" min="0" className={`${modalInp} text-amber-400`} placeholder="0" value={editForm.cost} onCommit={v => setEditForm(f => ({ ...f, cost: v }))} />
                    )}
                  </div>
                </div>

                {/* Including GST / Excluding GST — clarifies how the Selling
                    Price above should be read. Whichever mode is picked, the
                    saved price is always normalized to GST-inclusive. */}
                <div className="flex items-center gap-2 -mt-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Selling Price is</span>
                  <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
                    {(['inclusive', 'exclusive'] as const).map(mode => (
                      <button key={mode} type="button"
                        onClick={() => {
                          if (mode === editSpMode) return;
                          const gst = Number(editForm.gstPercent) || 0;
                          const current = Number(editForm.sellingPrice) || 0;
                          if (current > 0) {
                            const converted = mode === 'exclusive' ? toExclusivePrice(current, gst) : toInclusivePrice(current, gst);
                            setEditForm(f => ({ ...f, sellingPrice: String(Math.round(converted * 100) / 100) }));
                          }
                          setEditSpMode(mode);
                        }}
                        className={cn('px-2.5 py-1 rounded-md text-[10px] font-bold transition-all',
                          editSpMode === mode ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500 dark:text-slate-400')}
                      >
                        {mode === 'inclusive' ? 'Including GST' : 'Excluding GST'}
                      </button>
                    ))}
                  </div>
                </div>
                {editForm.sellingPrice && Number(editForm.sellingPrice) > 0 && (
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 -mt-2">
                    {editSpMode === 'inclusive'
                      ? `This price includes GST. Excl. GST: ₹${toExclusivePrice(Number(editForm.sellingPrice), Number(editForm.gstPercent) || 0).toFixed(2)}`
                      : `This price excludes GST. Incl. GST: ₹${toInclusivePrice(Number(editForm.sellingPrice), Number(editForm.gstPercent) || 0).toFixed(2)}`}
                  </p>
                )}

                {editForm.sellingPrice && effectiveCostPrice(editForm) > 0 && Number(editForm.sellingPrice) > 0 && (() => {
                  // Profit is over what the shopkeeper actually earns. When SP
                  // is typed EXCLUSIVE that number IS the earnings basis, so
                  // don't first inflate it to inclusive and then treat the GST
                  // portion as profit (that read ₹120+18%GST as ~41% profit
                  // instead of the real 20%). When typed INCLUSIVE, respect
                  // the shop's "GST Inclusive Profit Calculation" toggle.
                  const spTyped = Number(editForm.sellingPrice) || 0;
                  const gst = Number(editForm.gstPercent) || 0;
                  const spForProfit = editSpMode === 'exclusive'
                    ? spTyped
                    : (profile.gstInclusiveProfit ? spTyped / (1 + gst / 100) : spTyped);
                  const result = calculateProductProfit(spForProfit, effectiveCostPrice(editForm), 0, false);
                  const boxCls = result.status === 'profit' ? 'bg-emerald-500/10 border-emerald-500/20' : result.status === 'loss' ? 'bg-red-500/10 border-red-500/20' : 'bg-orange-500/10 border-orange-500/20';
                  const textCls = profitColorClass(result.status);
                  return (
                    <div className={cn('border rounded-xl px-4 py-3 flex items-center justify-between gap-4', boxCls)}>
                      <span className={cn('text-xs font-semibold opacity-70', textCls)}>Profit</span>
                      <span className={cn('text-lg font-black text-right', textCls)}>
                        ₹{result.amount.toFixed(2)} <span className="text-sm">({result.percent.toFixed(1)}%)</span>
                      </span>
                    </div>
                  );
                })()}
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">HSN Code</label>
                    <LocalInput className={modalInp} placeholder="HSN/SAC Code" value={editForm.hsnCode || ''} onCommit={v => setEditForm(f => ({ ...f, hsnCode: v }))} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">GST %</label>
                    <select className={modalSel} value={editForm.gstPercent || 0} onChange={e => setEditForm(f => ({ ...f, gstPercent: Number(e.target.value) }))}>
                      <option value={0}>0% (Exempt)</option>
                      <option value={5}>5%</option>
                      <option value={12}>12%</option>
                      <option value={18}>18%</option>
                      <option value={28}>28%</option>
                    </select>
                  </div>
                </div>

                <BarcodeIdentifierFields
                  barcode={editForm.barcode} sku={editForm.sku} otherCode={editForm.otherCode} cartonBarcode={editForm.cartonBarcode}
                  onChange={(k, v) => setEditForm(f => ({ ...f, [k]: v }))}
                  modalInp={modalInp}
                />

                <div className="mt-3">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Product Location <span className="font-medium normal-case text-slate-400">(optional)</span>
                  </label>
                  <LocalInput className={modalInp} placeholder="e.g. Shelf A3, Rack 2, Bin 14"
                    value={editForm.location} onCommit={v => setEditForm(f => ({ ...f, location: v }))} />
                </div>

              </section>

              <div className="flex gap-4 pt-2">
                <button type="button" onClick={() => { setShowEditModal(false); setEditProduct(null); }}
                  className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 py-3 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-200 transition-all active:scale-95">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-emerald-500 text-white dark:text-slate-900 py-3 rounded-xl font-black transition-all active:scale-95 hover:bg-emerald-400 disabled:opacity-60 flex items-center justify-center gap-2">
                  {saving ? <><Loader2 size={16} className="animate-spin" />Saving…</> : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/20 sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{bizConfig.emoji}</span>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('addModal')}</h2>
                  <p className="text-xs text-slate-500">{bizConfig.label}</p>
                </div>
                {/* Photo / Upload chips hidden per shopkeeper request — the
                    header stays clean; scan-input ref (scanInputRef) is still
                    mounted below so scan-driven autofill continues to work. */}
              </div>
              <button onClick={() => { setShowAddModal(false); setForm(buildEmptyForm(profile.businessType)); setAddToGodownId(''); }} className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"><X size={20} /></button>
            </div>

            <form onSubmit={handleAddSubmit} className="p-6 space-y-5 relative">
              {scanning && (
                <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center space-y-3 rounded-b-2xl">
                  <Loader2 className="animate-spin text-emerald-500" size={48} />
                  <p className="text-emerald-500 font-bold animate-pulse text-sm">AI Identifying Product...</p>
                </div>
              )}
              {showCamera && (
                <div className="absolute inset-0 bg-black z-50 flex flex-col items-center justify-center rounded-b-2xl overflow-hidden">
                  <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                  <canvas ref={canvasRef} className="hidden" />
                  <div className="absolute bottom-6 flex items-center gap-6">
                    <button type="button" onClick={stopCamera} className="p-4 bg-slate-800/80 text-white rounded-full"><X size={24} /></button>
                    <button type="button" onClick={captureAndScan} className="p-6 bg-emerald-500 text-slate-900 rounded-full hover:bg-emerald-400 shadow-xl">
                      <Camera size={32} />
                    </button>
                    <div className="w-12" />
                  </div>
                </div>
              )}
              <input type="file" ref={scanInputRef} className="hidden" accept="image/*" onChange={handleFileScan} />

              {/* ── Basic Info ── */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-1 h-4 rounded bg-emerald-500" />
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Basic Info</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('fieldName')}</label>
                  <LocalInput required autoFocus className={modalInp}
                    placeholder={bizConfig.productPlaceholder || t('fieldNamePlaceholder')}
                    value={form.name} onCommit={v => setForm(f => ({ ...f, name: v }))} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('fieldCategory')}</label>
                    <CategoryPicker required className={modalInp} placeholder={`${bizConfig.defaultCategories[0]} — or type a new one`}
                      value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))}
                      suggestions={categorySuggestions} renderLabel={c => translateData(c, locale)} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('fieldUnit') || 'Unit'}</label>
                    <select className={modalSel} value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                      {bizConfig.defaultUnits.map(u => <option key={u} value={u}>{translateData(u, locale) || u}</option>)}
                    </select>
                  </div>
                </div>

                {/* Loose Material toggle */}
                <label className="flex items-center gap-3 p-3 bg-slate-100 dark:bg-slate-700/40 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer hover:border-amber-300 dark:hover:border-amber-500/40 transition-colors">
                  <div className="relative">
                    <input type="checkbox" className="sr-only" checked={form.is_loose}
                      onChange={e => setForm(f => ({ ...f, is_loose: e.target.checked }))} />
                    <div className={`w-10 h-5 rounded-full transition-colors ${form.is_loose ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${form.is_loose ? 'left-5' : 'left-0.5'}`} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-200">{t('looseMaterialLabel')}</p>
                    <p className="text-[11px] text-slate-500">{t('looseMaterialDesc')}</p>
                  </div>
                  {form.is_loose && <span className="ml-auto text-[10px] bg-amber-500/20 text-amber-400 font-black px-2 py-0.5 rounded uppercase">{t('looseBadge')}</span>}
                </label>

                {/* Gender — shoes/clothes */}
                {bizConfig.hasGender && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Gender</label>
                    <select className={modalSel} value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
                      {['Unisex', 'Men', 'Women', 'Boys', 'Girls', 'Kids'].map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                )}
                {/* Footwear only — see the matching Size System toggle in the
                    Edit modal for the full reasoning. */}
                {bizConfig.type === 'shoes' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Size System</label>
                    <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 w-fit">
                      {(['uk', 'us', 'eu'] as const).map(sys => (
                        <button key={sys} type="button"
                          onClick={() => {
                            if (sys === sizeSystem) return;
                            setSizeSystem(sys);
                            const chart = buildVariantDim(form.category, form.gender, sys)?.sizeChart || [];
                            setSizeSelection(Array.from(new Set([...chart, ...sizesFromVariants(form.size_variants)])));
                            setSizeSelectionAuto(true);
                          }}
                          className={cn('px-3 py-1 rounded-md text-[10px] font-bold transition-all',
                            sizeSystem === sys ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500 dark:text-slate-400')}
                        >
                          {sys === 'uk' ? 'India / UK' : sys.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Fabric— clothes only */}
                {bizConfig.hasFabric && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Fabric / Material</label>
                    <LocalInput className={modalInp} placeholder="e.g. Cotton, Polyester, Silk..." value={form.shade}
                      onCommit={v => setForm(f => ({ ...f, shade: v }))} />
                  </div>
                )}

                {/* Shade — cosmetics only. Electronics/electric use the 3-way grid, so no free-text field here. */}
                {bizConfig.hasShades && !isThreeWay && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Shade / Color Variant</label>
                    <LocalInput className={modalInp} placeholder="e.g. Rose Red, Nude 01, #F5C6D0..."
                      value={form.shade} onCommit={v => setForm(f => ({ ...f, shade: v }))} />
                  </div>
                )}

                {/* Model / Warranty — electronics */}
                {bizConfig.hasModel && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Model Number</label>
                      <LocalInput className={modalInp} placeholder="e.g. SM-G990B"
                        value={form.model_number} onCommit={v => setForm(f => ({ ...f, model_number: v }))} />
                    </div>
                    {bizConfig.hasWarranty && (
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Warranty (months)</label>
                        <LocalInput type="number" min="0" className={modalInp} placeholder="12"
                          value={form.warranty_months} onCommit={v => setForm(f => ({ ...f, warranty_months: v }))} />
                      </div>
                    )}
                  </div>
                )}

                {/* Liquor — Beer Bar & Wine Shop */}
                {bizConfig.hasLiquorSpecs && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Brand</label>
                      <LocalInput className={modalInp} placeholder="e.g. Kingfisher, Blenders Pride"
                        value={form.brand} onCommit={v => setForm(f => ({ ...f, brand: v }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Alcohol %</label>
                      <LocalInput type="number" min="0" step="0.1" className={modalInp} placeholder="e.g. 5 / 42.8"
                        value={form.alcohol_percentage} onCommit={v => setForm(f => ({ ...f, alcohol_percentage: v }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Bottle Type</label>
                      <select className={modalInp} value={form.bottle_type} onChange={e => setForm(f => ({ ...f, bottle_type: e.target.value }))}>
                        <option value="">Select...</option>
                        {['Bottle', 'Can', 'PET', 'Tetra', 'Pack'].map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Units per Case (1 Case = ? {form.unit})</label>
                      <LocalInput type="number" min="0" className={modalInp} placeholder="e.g. 12"
                        value={form.conversion_factor} onCommit={v => setForm(f => ({ ...f, conversion_factor: v }))} />
                    </div>
                  </div>
                )}
              </section>

              {/* ── Medical Fields ── */}
              {(bizConfig.hasBatch || bizConfig.hasDrugSchedule) && (
                <section className="space-y-3 bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-1 h-4 rounded bg-blue-500" />
                    <p className="text-[11px] font-bold text-blue-400 uppercase tracking-widest">Medical Details</p>
                  </div>
                  {bizConfig.hasBatch && (
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Batch Number</label>
                      <LocalInput className={modalInp} placeholder="e.g. BCH-2024-001"
                        value={form.batch_number} onCommit={v => setForm(f => ({ ...f, batch_number: v }))} />
                    </div>
                  )}
                  {bizConfig.hasDrugSchedule && (
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Drug Schedule</label>
                      <select className={modalSel} value={form.drug_schedule} onChange={e => setForm(f => ({ ...f, drug_schedule: e.target.value }))}>
                        {['OTC', 'Rx', 'H1', 'H2', 'X'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  )}
                </section>
              )}

              {/* ── Size / Variant Inventory ── */}
              {((bizConfig.hasSizes && bizConfig.sizeChart) || (bizConfig.hasSpecs && addVariantDim)) && (
                <section className="space-y-3 bg-violet-500/5 border border-violet-500/20 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-4 rounded bg-violet-500" />
                      <p className="text-[11px] font-bold text-violet-500 dark:text-violet-400 uppercase tracking-widest">{addVariantDim?.sectionLabel || tv('sizeWeightInventory')}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                    {perSizePricing && (
                      <button
                        type="button"
                        title={tv('generateVariantBarcodes')}
                        onClick={() => {
                          const base = (form.barcode || 'PRD-NEW');
                          setSizePrices(prev => generateVariantBarcodes(base, form.size_variants, prev));
                        }}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-500/30 hover:bg-sky-200 dark:hover:bg-sky-500/30"
                      >
                        <Package size={10} />
                        {tv('generateVariantBarcodes')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const next = !perSizePricing;
                        setPerSizePricing(next);
                        // Per-size pricing replaces the default price → reset it to 0.
                        if (next) setForm(f => ({ ...f, mrp: '0', sellingPrice: '0', cost: '0' }));
                      }}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all',
                        perSizePricing
                          ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700 hover:text-slate-600 dark:hover:text-slate-300'
                      )}
                    >
                      <IndianRupee size={10} />
                      {perSizePricing ? tv('perSizePricingOn') : tv('perSizePricing')}
                    </button>
                    </div>
                  </div>
                  {bizConfig.hasSpecs && addVariantDim && (
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">{tv('optionalProductHint')}</p>
                  )}
                  {addThreeWayActive ? (
                    <ThreeWayVariantGrid
                      colorPalette={bizConfig.colorChart || []}
                      colors={outerColors}
                      onColorsChange={setOuterColors}
                      innerRowOptions={addVariantDim!.options}
                      innerColOptions={addVariantDim!.sizeChart}
                      value={form.size_variants}
                      onChange={variants => setForm(f => ({ ...f, size_variants: variants }))}
                      unitLabel={form.unit?.toLowerCase() || 'units'}
                      perSizePricing={perSizePricing}
                      sizePrices={sizePricesEffective}
                      onSizePricesChange={setSizePrices}
                      innerRowLabel={addVariantDim!.typeLabel || addVariantDim!.label}
                      innerColLabel={addVariantDim!.sizeLabel || 'Size'}
                    />
                  ) : addVariantDim ? (
                    <div className="space-y-3">
                      <ColorPicker colorChart={addVariantDim!.options} value={colors} onChange={handleAddColorsChange} showSwatch={addVariantDim!.swatch} />
                      <SizePicker sizeChart={addVariantDim!.sizeChart} value={sizeSelection} onChange={sizes => { setSizeSelection(sizes); setSizeSelectionAuto(false); }} />
                      <ColorSizeVariantGrid
                        colors={colors}
                        sizeChart={sizeSelection}
                        value={form.size_variants}
                        onChange={variants => setForm(f => ({ ...f, size_variants: variants }))}
                        unitLabel={form.unit?.toLowerCase() || 'units'}
                        perSizePricing={perSizePricing}
                        sizePrices={sizePricesEffective}
                        onSizePricesChange={setSizePrices}
                        showSwatch={addVariantDim!.swatch}
                        dimensionLabel={addVariantDim!.label}
                      />
                    </div>
                  ) : (
                  <div className="space-y-3">
                    <SizePicker sizeChart={bizConfig.sizeChart || []} value={sizeSelection} onChange={setSizeSelection} />
                    <SizeVariantGrid
                      sizeChart={sizeSelection}
                      value={form.size_variants}
                      onChange={variants => setForm(f => ({ ...f, size_variants: variants }))}
                      unitLabel={form.unit?.toLowerCase() || 'units'}
                      perSizePricing={perSizePricing}
                      sizePrices={sizePricesEffective}
                      onSizePricesChange={setSizePrices}
                    />
                  </div>
                  )}
                </section>
              )}
              {/* Electricals/electronics: prompt to choose a category when none maps to a spec yet */}
              {bizConfig.hasSpecs && !addVariantDim && form.category.trim() !== '' && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 -mt-2">{tv('simpleCategoryHint')}</p>
              )}

              {/* ── Stock & Min ── (hidden when stock is driven by the variant grid) */}
              {!addVariantActive && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('fieldStock')}</label>
                    <LocalInput required type="number" min="0" className={modalInp} placeholder="0"
                      value={form.stock} onCommit={v => setForm(f => ({ ...f, stock: v }))} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('fieldMinStock')}</label>
                    <LocalInput required type="number" min="0" className={modalInp} placeholder="0"
                      value={form.minStock} onCommit={v => setForm(f => ({ ...f, minStock: v }))} />
                  </div>
                </div>
              )}

              {/* Global Min Stock (Total) — the fallback threshold for any
                  variant without its own per-size override. Shown regardless
                  of per-size-pricing (see matching comment in the Edit modal). */}
              {addVariantActive && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('fieldMinStock')} (Total)</label>
                  <LocalInput required type="number" min="0" className={modalInp} placeholder="5"
                    value={form.minStock} onCommit={v => setForm(f => ({ ...f, minStock: v }))} />
                  {perSizePricing && (
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">{tv('minStockFallbackHint')}</p>
                  )}
                </div>
              )}

              {/* ── Expiry Date ── */}
              {bizConfig.hasExpiry && (
                <ExpiryDateField
                  value={form.expiry_date}
                  onChange={val => setForm(f => ({ ...f, expiry_date: val }))}
                  required={bizConfig.hasExpiryRequired}
                />
              )}

              {/* ── Pricing ── when per-spec pricing is on these act as an optional fallback price ── */}
              <section className="space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-1 h-4 rounded bg-amber-500" />
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{perSizePricing ? tv('fallbackPriceLabel') : tv('pricingLabel')}</p>
                </div>
                {perSizePricing && (
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 -mt-1">{tv('fallbackPriceHint')}</p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('fieldMRP')}</label>
                    <LocalInput required={!perSizePricing} type="number" min="0" className={modalInp} placeholder="0"
                      value={form.mrp} onCommit={v => setForm(f => ({ ...f, mrp: v }))} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('fieldSelling')}</label>
                    <LocalInput required={!perSizePricing} type="number" min="0" className={`${modalInp} text-emerald-400 font-bold`} placeholder="0"
                      value={form.sellingPrice} onCommit={v => setForm(f => ({ ...f, sellingPrice: v }))} />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('fieldCost')}</label>
                      {/* Manual = type ₹ (default). MRP = type purchase-discount %,
                          derive ₹ from MRP × (1 − %). Switching modes carries
                          the current value over — Manual seeds `cost` from the
                          derived ₹; MRP seeds `%` from cost vs MRP — so the
                          shopkeeper never loses what they just typed. */}
                      <div className="flex bg-slate-100 dark:bg-slate-800 rounded-md p-0.5">
                        {(['manual', 'mrp_based'] as const).map(mode => (
                          <button key={mode} type="button"
                            onClick={() => setForm(f => {
                              const currentMode = f.costPriceMode || 'manual';
                              if (mode === currentMode) return f;
                              if (mode === 'manual') {
                                const resolved = effectiveCostPrice(f);
                                return { ...f, costPriceMode: mode, cost: resolved > 0 ? String(Math.round(resolved * 100) / 100) : f.cost };
                              }
                              const mrp = Number(f.mrp) || 0;
                              const cost = Number(f.cost) || 0;
                              const pct = mrp > 0 && cost > 0 ? ((mrp - cost) / mrp) * 100 : NaN;
                              return { ...f, costPriceMode: mode, purchaseDiscountPercent: Number.isFinite(pct) ? String(Math.round(Math.max(0, pct) * 100) / 100) : f.purchaseDiscountPercent };
                            })}
                            className={cn('px-1.5 py-0.5 rounded text-[8px] font-bold uppercase transition-all',
                              (form.costPriceMode || 'manual') === mode ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-400')}>
                            {mode === 'manual' ? 'Manual' : 'MRP'}
                          </button>
                        ))}
                      </div>
                    </div>
                    {form.costPriceMode === 'mrp_based' ? (
                      <>
                        <LocalInput type="number" min="0" max="100" className={`${modalInp} text-amber-400`} placeholder="Discount %"
                          value={form.purchaseDiscountPercent} onCommit={v => setForm(f => ({ ...f, purchaseDiscountPercent: v }))} />
                        <p className="text-[10px] text-amber-500 dark:text-amber-400 font-bold mt-1">= ₹{effectiveCostPrice(form).toFixed(2)}</p>
                      </>
                    ) : (
                      <LocalInput type="number" min="0" className={`${modalInp} text-amber-400`} placeholder="0"
                        value={form.cost} onCommit={v => setForm(f => ({ ...f, cost: v }))} />
                    )}
                    {/* Landed-cost markup: add per-unit expenses onto the cost
                        and raise selling by the same, keeping margin. Manual
                        mode only (MRP mode already derives cost). */}
                    {(form.costPriceMode || 'manual') !== 'mrp_based' && (
                      <CostMarkupControl
                        className="mt-2"
                        onApply={(tf) => setForm(f => ({
                          ...f,
                          cost: String(tf(Number(f.cost) || 0)),
                          sellingPrice: Number(f.sellingPrice) > 0 ? String(tf(Number(f.sellingPrice))) : f.sellingPrice,
                        }))}
                      />
                    )}
                  </div>
                </div>

                {/* Including GST / Excluding GST — clarifies how the Selling
                    Price above should be read. Whichever mode is picked, the
                    saved price is always normalized to GST-inclusive. */}
                <div className="flex items-center gap-2 -mt-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Selling Price is</span>
                  <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
                    {(['inclusive', 'exclusive'] as const).map(mode => (
                      <button key={mode} type="button"
                        onClick={() => {
                          if (mode === spMode) return;
                          const gst = Number(form.gstPercent) || 0;
                          const current = Number(form.sellingPrice) || 0;
                          if (current > 0) {
                            const converted = mode === 'exclusive' ? toExclusivePrice(current, gst) : toInclusivePrice(current, gst);
                            setForm(f => ({ ...f, sellingPrice: String(Math.round(converted * 100) / 100) }));
                          }
                          setSpMode(mode);
                        }}
                        className={cn('px-2.5 py-1 rounded-md text-[10px] font-bold transition-all',
                          spMode === mode ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500 dark:text-slate-400')}
                      >
                        {mode === 'inclusive' ? 'Including GST' : 'Excluding GST'}
                      </button>
                    ))}
                  </div>
                </div>
                {form.sellingPrice && Number(form.sellingPrice) > 0 && (
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 -mt-2">
                    {spMode === 'inclusive'
                      ? `This price includes GST. Excl. GST: ₹${toExclusivePrice(Number(form.sellingPrice), Number(form.gstPercent) || 0).toFixed(2)}`
                      : `This price excludes GST. Incl. GST: ₹${toInclusivePrice(Number(form.sellingPrice), Number(form.gstPercent) || 0).toFixed(2)}`}
                  </p>
                )}

                {form.sellingPrice && effectiveCostPrice(form) > 0 && Number(form.sellingPrice) > 0 && (() => {
                  // Profit is over what the shopkeeper actually earns. When SP
                  // is typed EXCLUSIVE that number IS the earnings basis, so
                  // don't first inflate it to inclusive and then treat the GST
                  // portion as profit (that read ₹120+18%GST as ~41% profit
                  // instead of the real 20%). When typed INCLUSIVE, respect
                  // the shop's "GST Inclusive Profit Calculation" toggle.
                  const spTyped = Number(form.sellingPrice) || 0;
                  const gst = Number(form.gstPercent) || 0;
                  const spForProfit = spMode === 'exclusive'
                    ? spTyped
                    : (profile.gstInclusiveProfit ? spTyped / (1 + gst / 100) : spTyped);
                  const result = calculateProductProfit(spForProfit, effectiveCostPrice(form), 0, false);
                  const boxCls = result.status === 'profit' ? 'bg-emerald-500/10 border-emerald-500/20' : result.status === 'loss' ? 'bg-red-500/10 border-red-500/20' : 'bg-orange-500/10 border-orange-500/20';
                  const textCls = profitColorClass(result.status);
                  return (
                    <div className={cn('border rounded-xl px-4 py-3 flex items-center justify-between gap-4', boxCls)}>
                      <span className={cn('text-xs font-semibold opacity-70', textCls)}>{t('profit')}</span>
                      <span className={cn('text-lg font-black text-right', textCls)}>
                        ₹{result.amount.toFixed(2)} <span className="text-sm">({result.percent.toFixed(1)}%)</span>
                      </span>
                    </div>
                  );
                })()}
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">HSN Code</label>
                    <LocalInput className={modalInp} placeholder="HSN/SAC Code" value={form.hsnCode || ''} onCommit={v => setForm(f => ({ ...f, hsnCode: v }))} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">GST %</label>
                    <select className={modalSel} value={form.gstPercent || 0} onChange={e => setForm(f => ({ ...f, gstPercent: Number(e.target.value) }))}>
                      <option value={0}>0% (Exempt)</option>
                      <option value={5}>5%</option>
                      <option value={12}>12%</option>
                      <option value={18}>18%</option>
                      <option value={28}>28%</option>
                    </select>
                  </div>
                </div>

                <BarcodeIdentifierFields
                  barcode={form.barcode} sku={form.sku} otherCode={form.otherCode} cartonBarcode={form.cartonBarcode}
                  onChange={(k, v) => setForm(f => ({ ...f, [k]: v }))}
                  modalInp={modalInp}
                />

                <div className="mt-3">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Product Location <span className="font-medium normal-case text-slate-400">(optional)</span>
                  </label>
                  <LocalInput className={modalInp} placeholder="e.g. Shelf A3, Rack 2, Bin 14"
                    value={form.location} onCommit={v => setForm(f => ({ ...f, location: v }))} />
                </div>

              </section>

              {/* ── Inventory Assignment ── */}
              <section className="space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-1 h-4 rounded bg-blue-500" />
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Inventory Assignment</p>
                </div>

                {/* Shop selector */}
                {allShops.length > 1 && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      Shop <span className="text-slate-600 normal-case font-normal">— which shop gets this product</span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {allShops.map(shop => {
                        const isActive = activeShopId === shop.id || (!activeShopId && shop.id === profile.id);
                        return (
                          <button key={shop.id} type="button"
                            onClick={() => switchShop(shop.id)}
                            className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition-all',
                              isActive
                                ? 'bg-blue-500/15 border-blue-500/40 text-blue-600 dark:text-blue-400'
                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white shadow-sm')}>
                            <Store size={12} />
                            {shop.name}
                            {shop.shopCode && <span className="font-mono text-[10px] text-slate-500">{shop.shopCode}</span>}
                            {isActive && <span className="text-[9px] bg-blue-500/20 px-1 py-0.5 rounded">Active</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Godown selector — wholesale only */}
                {isWholesale && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      Godown <span className="text-slate-600 normal-case font-normal">— assign initial stock to a godown (optional)</span>
                    </label>
                    {godowns.length === 0 ? (
                      <p className="text-xs text-slate-600 italic">No godowns yet — create one on the Godowns page first.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button type="button"
                          onClick={() => setAddToGodownId('')}
                          className={cn('flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-all',
                            !addToGodownId
                              ? 'bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white shadow-sm'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-300 shadow-sm')}>
                          None
                        </button>
                        {godowns.map((g: any) => (
                          <button key={g.id} type="button"
                            onClick={() => setAddToGodownId(g.id)}
                            className={cn('flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-all',
                              addToGodownId === g.id
                                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white shadow-sm')}>
                            <Warehouse size={11} />
                            {g.name}
                            <span className="font-mono text-[10px] text-slate-500">{g.godownCode || g.godown_code}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {addToGodownId && (
                      <p className="text-[11px] text-emerald-400 mt-1.5">
                        ✓ Initial stock of <strong>{form.stock || 0} {form.unit}</strong> will be assigned to this godown
                      </p>
                    )}
                  </div>
                )}
              </section>

              <div className="flex gap-4 pt-2">
                <button type="button" onClick={() => { setShowAddModal(false); setForm(buildEmptyForm(profile.businessType)); setAddToGodownId(''); }}
                  className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 py-3 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-200 transition-all active:scale-95">
                  {t('cancel')}
                </button>
                <button type="submit" disabled={saving}
                  className={`flex-1 bg-gradient-to-r ${
                    bizConfig.gradient || 'from-emerald-600 to-emerald-500'
                  } text-white py-3 rounded-xl font-black shadow-xl transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2`}>
                  {saving ? <><Loader2 size={16} className="animate-spin" />Adding…</> : t('addProduct')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedProduct && (
        <ProductDetailsSheet
          productId={String(selectedProduct.id)}
          shopId={selectedProduct.shopId}
          onClose={() => setSelectedProduct(null)}
          onEdit={() => {
            // Deliberately ignore the Sheet's own callback argument — it's the
            // raw erp-details response (Prisma field names: currentStock,
            // wholesaleCost, baseUnit), not the fetchProductsMapped shape
            // startEdit() expects (stock, cost, unit) — using it directly
            // would open Edit with Stock/Cost blank and Unit reset to
            // default. selectedProduct is already the correctly-shaped row
            // from this table's own data.
            const p = selectedProduct;
            setSelectedProduct(null);
            startEdit(p);
          }}
          onDelete={(id) => doDelete(id)}
        />
      )}

      <ConfirmPasswordModal
        open={!!deleteConfirmId}
        itemLabel="product"
        onConfirm={() => doDelete(deleteConfirmId!)}
        onCancel={() => setDeleteConfirmId(null)}
      />
      <ConfirmPasswordModal
        open={confirmBulkDelete}
        itemLabel="product"
        itemCount={selectedProductIds.size}
        onConfirm={handleBulkDeleteProducts}
        onCancel={() => setConfirmBulkDelete(false)}
      />

      {/* Bulk price adjust — bump MRP / Cost / Selling on every currently
          selected product by a %/₹, up or down. Writes straight to the
          real, already-saved products (not a preview/staging step). */}
      {bulkAdjustOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-500/30 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center shrink-0">
                  <Percent size={16} className="text-indigo-500 dark:text-indigo-400" />
                </div>
                <div>
                  <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">Adjust Price</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{selectedProductIds.size} product{selectedProductIds.size === 1 ? '' : 's'} selected</p>
                </div>
              </div>
              <button onClick={() => setBulkAdjustOpen(false)} className="text-slate-400 hover:text-slate-200 p-1"><X size={18} /></button>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Field</label>
              <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
                {([['mrp', 'MRP'], ['wholesaleCost', 'Cost'], ['sellingPrice', 'Selling']] as const).map(([f, lbl]) => (
                  <button key={f} type="button" onClick={() => setBulkAdjustField(f)}
                    className={cn('flex-1 py-1.5 rounded-md text-xs font-bold', bulkAdjustField === f ? 'bg-indigo-500 text-white' : 'text-slate-500')}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Amount</label>
                <input
                  type="number" inputMode="decimal" value={bulkAdjustValue}
                  onChange={e => { setBulkAdjustValue(e.target.value); setBulkAdjustNote(''); }}
                  placeholder={bulkAdjustMode === 'percent' ? '10' : '5'}
                  className="w-full h-10 px-3 rounded-lg text-sm font-semibold text-center border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white"
                />
              </div>
              <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 h-10">
                {([['percent', '%'], ['amount', '₹']] as const).map(([m, lbl]) => (
                  <button key={m} type="button" onClick={() => setBulkAdjustMode(m)}
                    className={cn('px-3.5 rounded-md text-sm font-bold', bulkAdjustMode === m ? 'bg-indigo-500 text-white' : 'text-slate-500')}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 -mt-2">
              Positive increases, negative (e.g. -10) decreases. e.g. Cost ₹500 with +10% becomes ₹550.
            </p>

            {bulkAdjustNote && <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">{bulkAdjustNote}</p>}

            <div className="flex gap-3">
              <button onClick={() => setBulkAdjustOpen(false)} disabled={bulkAdjusting} className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 py-2.5 rounded-xl font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-60">Close</button>
              <button onClick={applyBulkPriceAdjust} disabled={bulkAdjusting} className="flex-1 bg-indigo-500 text-white py-2.5 rounded-xl font-bold hover:bg-indigo-400 disabled:opacity-60 flex items-center justify-center gap-1.5">
                {bulkAdjusting && <Loader2 size={14} className="animate-spin" />} Apply
              </button>
            </div>
          </div>
        </div>
      )}
      </> /* end viewMode === 'all' */
      )}
    </div>
  );
}

/**
 * The three scannable identifiers shared by the Add and Edit product forms.
 * Kept as one component so both stay in sync and the desktop barcode scanner
 * can resolve a product by whichever code the shop actually labels its stock
 * with — the EAN on the item, an internal SKU, or the barcode on the carton.
 */
function BarcodeIdentifierFields({
  barcode, sku, otherCode, cartonBarcode, onChange, modalInp,
}: {
  barcode?: string; sku?: string; otherCode?: string; cartonBarcode?: string;
  onChange: (key: 'barcode' | 'sku' | 'otherCode' | 'cartonBarcode', value: string) => void;
  modalInp: string;
}) {
  return (
    <div className="mt-3">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
        Scan Codes <span className="font-medium normal-case text-slate-400">— for barcode billing</span>
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Company Barcode</label>
          <LocalInput className={modalInp} placeholder="EAN / UPC on the item"
            value={barcode || ''} onCommit={v => onChange('barcode', v)} />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">SKU</label>
          <LocalInput className={modalInp} placeholder="Your stock code"
            value={sku || ''} onCommit={v => onChange('sku', v)} />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
            Other Code <span className="font-medium normal-case text-slate-400">(optional)</span>
          </label>
          <LocalInput className={modalInp} placeholder="Your own reference code"
            value={otherCode || ''} onCommit={v => onChange('otherCode', v)} />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
            Carton Barcode <span className="font-medium normal-case text-slate-400">(optional)</span>
          </label>
          <LocalInput className={modalInp} placeholder="Outer carton code"
            value={cartonBarcode || ''} onCommit={v => onChange('cartonBarcode', v)} />
        </div>
      </div>
      <p className="text-[10px] text-slate-500 mt-2">Other Code is just a printable reference — write it once here and turn on "Other Code" in Barcode Print Settings to show it on the label, no retyping needed each time.</p>
    </div>
  );
}
