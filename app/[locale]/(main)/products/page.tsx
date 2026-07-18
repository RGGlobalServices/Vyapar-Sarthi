'use client';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import {
  Plus, Search, Filter, AlertCircle, Pencil, Trash2, X,
  Loader2, Camera, ShieldCheck, Package,
  Warehouse, Store, MapPin, IndianRupee,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { useLocale } from 'next-intl';
import { translateData } from '@/lib/translateData';
import SmartTranslator from '@/components/SmartTranslator';
import ExpiryDateField, { ExpiryBadge } from '@/components/ExpiryDateField';
import SizeVariantGrid, { parseSizeVariants, serializeSizeVariants, totalFromSizes, parseSizePrices, mergeSizePricesIntoMetadata } from '@/components/SizeVariantGrid';
import type { SizePriceEntry } from '@/components/SizeVariantGrid';
import ColorSizeVariantGrid, { ColorPicker, colorsFromVariants, sizesFromVariants, splitVariantKey } from '@/components/ColorSizeVariantGrid';
import { useBusinessStore } from '@/lib/businessStore';
import { getBusinessConfig, getCategoryVariantSpec } from '@/lib/businessConfig';

import { QrCode } from 'lucide-react';
import dynamic from 'next/dynamic';
import WholesaleProductsUI from './WholesaleProductsUI';
import useSWR from 'swr';

import { fetchProductsMapped } from '@/lib/fetchers';

const BarcodeQRModal = dynamic(() => import('@/components/BarcodeQRModal'), { ssr: false });
const CameraScanner = dynamic(() => import('@/components/CameraScanner'), { ssr: false });

type Product = {
  id: string | number;
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
};

function buildEmptyForm(btype: string) {
  const config = getBusinessConfig(btype);
  return {
    name: '', category: '', unit: config.defaultUnits[0] || 'Unit', stock: '', minStock: '',
    mrp: '', sellingPrice: '', cost: '',
    is_loose: false,
    expiry_date: '', batch_number: '', drug_schedule: 'OTC',
    model_number: '', warranty_months: '', gender: 'Unisex',
    shade: '', size_variants: {} as Record<string, number>,
    gstPercent: 0, hsnCode: ''
  };
}

export default function ProductsPage() {
  const { profile } = useBusinessStore();
  const isWholesale = profile.subscriptionPlan === 'wholesale';
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  if (isWholesale) {
    return <WholesaleProductsUI />;
  }

  return <LegacyProductsUI />;
}

function LegacyProductsUI() {
  const t = useTranslations('Products');
  const tv = useTranslations('Variants');
  const locale = useLocale();
  const { profile, allShops, activeShopId, switchShop } = useBusinessStore();
  const bizConfig = getBusinessConfig(profile.businessType);
  const isWholesale = profile.subscriptionPlan === 'wholesale';
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

  const swrKey = debouncedSearch.length > 1 ? `/products?q=${encodeURIComponent(debouncedSearch)}` : '/products';
  const { data: products = [], mutate: mutateProducts, isLoading: loading } = useSWR<Product[]>(swrKey, fetchProductsMapped);
  
  const [saving, setSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(buildEmptyForm(profile.businessType));
  const [showEditModal, setShowEditModal] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState(buildEmptyForm(profile.businessType));
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | number | null>(null);
  const [showFilter, setShowFilter] = useState(false);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [scanning, setScanning] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [qrProduct, setQrProduct] = useState<Product | null>(null);
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

  // Build the variant dimensions for a product. Apparel = Colour × Size (always on).
  // Electricals/electronics = a Type × Spec matrix resolved from the product's CATEGORY
  // (bulb → Type × Watt, battery → Type × Capacity, …); null when the category has no spec.
  function buildVariantDim(category: string) {
    if (bizConfig.hasColors) {
      return { options: bizConfig.colorChart || [], label: 'colour', swatch: true, sectionLabel: tv('colourSizeInventory'), sizeChart: bizConfig.sizeChart || [] };
    }
    if (bizConfig.hasSpecs) {
      const spec = getCategoryVariantSpec(category, bizConfig.type);
      if (spec) {
        const lbl = spec.typeLabel.toLowerCase();
        // Colour/shade dimensions get a swatch even on the spec path (apparel, footwear, lipstick…).
        const swatch = /colour|color|shade/.test(lbl);
        return { options: spec.typeOptions, label: lbl, swatch, sectionLabel: tv('specInventory', { type: spec.typeLabel, spec: spec.sizeLabel }), sizeChart: spec.sizeChart };
      }
    }
    return null;
  }
  const addVariantDim = buildVariantDim(form.category);
  const editVariantDim = buildVariantDim(editForm.category);
  // Stock comes from the grid when: apparel/kirana (always) or an electrical/electronics product
  // whose category has a spec AND the user has picked at least one type.
  const addVariantActive = bizConfig.hasColors ? true : bizConfig.hasSpecs ? (!!addVariantDim && colors.length > 0) : bizConfig.hasSizes;
  const editVariantActive = bizConfig.hasColors ? true : bizConfig.hasSpecs ? (!!editVariantDim && editColors.length > 0) : bizConfig.hasSizes;

  // ── Add-product godown/shop assignment ──────────────────────────────────
  const [addToGodownId, setAddToGodownId] = useState('');

  // ── Godown / shop view ───────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<'all' | 'godown' | 'shop'>('all');
  const [godowns, setGodowns] = useState<any[]>([]);
  const [selectedGodownId, setSelectedGodownId] = useState('');
  const [godownData, setGodownData] = useState<any | null>(null);
  const [loadingGodown, setLoadingGodown] = useState(false);

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
      alert('Camera access denied.');
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
      alert('AI could not read the product. Please try another photo.');
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

  const categories = useMemo(() => Array.from(new Set(products.map(p => p.category))).sort(), [products]);
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
    setForm(f => ({ ...f, size_variants: pruneByColors(f.size_variants, next) }));
    setSizePrices(p => pruneByColors(p, next));
    // Variant products use per-spec pricing by default (apparel always; electricals once a type is picked).
    setPerSizePricing(bizConfig.hasColors || next.length > 0);
  }
  function handleEditColorsChange(next: string[]) {
    setEditColors(next);
    setEditForm(f => ({ ...f, size_variants: pruneByColors(f.size_variants, next) }));
    setEditSizePrices(p => pruneByColors(p, next));
  }

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    const sizeVariantsJson = addVariantActive ? serializeSizeVariants(form.size_variants) : undefined;
    const stockQty = addVariantActive ? totalFromSizes(form.size_variants) : Number(form.stock);
    const metadataPayload = addVariantActive ? mergeSizePricesIntoMetadata({}, sizePrices, Object.keys(sizePrices).length > 0) : undefined;
    // Per-size pricing → default price is forced to 0; billing/table use the per-size prices.
    try {
      const res = await api.post('/products', {
        name: form.name, category: form.category,
        current_stock: stockQty, min_stock: Number(form.minStock),
        mrp: Number(form.mrp) || 0,
        selling_price: Number(form.sellingPrice) || 0,
        wholesale_cost: Number(form.cost) || 0, base_unit: form.unit || 'Unit',
        barcode: `BAR-${Date.now()}`,
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

      mutateProducts();
      setForm(buildEmptyForm(profile.businessType));
      setAddToGodownId('');
      setPerSizePricing(false);
      setSizePrices({});
      setColors([]);
      setShowAddModal(false);
    } catch { /* */ }
  }

  function startEdit(product: Product) {
    setEditProduct(product);
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
    });
    // Load per-size pricing from metadata. Default it ON for variant products (colour/size or a
    // category with a spec matrix) so per-spec price fields are visible without hunting for a toggle.
    const existingPrices = parseSizePrices(product.metadata);
    const hasPrices = Object.keys(existingPrices).length > 0;
    const isVariantProduct = !!(bizConfig.hasColors || (bizConfig.hasSpecs && getCategoryVariantSpec(product.category, bizConfig.type)));
    setEditPerSizePricing(hasPrices || isVariantProduct);
    setEditSizePrices(existingPrices);
    // Colour × size: derive the selected colours from the existing composite variant keys.
    setEditColors(colorsFromVariants(parseSizeVariants(product.size_variants)));
    setShowEditModal(true);
  }
  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editProduct) return;
    setSaving(true);
    try {
      const sizeVariantsJson = editVariantActive ? serializeSizeVariants(editForm.size_variants) : undefined;
      const stockQty = editVariantActive ? totalFromSizes(editForm.size_variants) : Number(editForm.stock);
      const editMetadata = editVariantActive
        ? mergeSizePricesIntoMetadata(editProduct.metadata, editSizePrices, Object.keys(editSizePrices).length > 0)
        : undefined;
      // Per-size pricing → default price is forced to 0; billing/table use the per-size prices.
      await api.put(`/products/${editProduct.id}`, {
        name: editForm.name,
        category: editForm.category,
        current_stock: stockQty,
        min_stock: Number(editForm.minStock),
        mrp: Number(editForm.mrp) || 0,
        selling_price: Number(editForm.sellingPrice) || 0,
        wholesale_cost: Number(editForm.cost) || 0,
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
      });
      await mutateProducts();
      setShowEditModal(false);
      setEditProduct(null);
    } catch { /* */ } finally { setSaving(false); }
  }
  async function doDelete(id: string | number) {
    try { await api.delete(`/products/${id}`); mutateProducts(); setDeleteConfirmId(null); } catch { /* */ }
  }

  const statusOptions = [
    { val: '', label: String(t('allCategories') || 'All') },
    { val: 'ok', label: t('inStock'), dot: 'bg-emerald-500' },
    { val: 'low', label: t('lowStock'), dot: 'bg-orange-400' },
    { val: 'out', label: t('outOfStock'), dot: 'bg-red-400' },
  ];

  // ─── Render ────────────────────────────────────────────────────────────────
  if (!mounted) return null;

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
          <button onClick={() => { setColors([]); setPerSizePricing(!!bizConfig.hasColors); setSizePrices({}); setShowAddModal(true); }}
            className="bg-emerald-500 text-slate-900 px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-400 transition-colors">
            <Plus size={20} />{t('addProduct')}
          </button>
        </div>
      </div>

      {/* View mode tabs */}
      <div className="flex gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1 shadow-sm">
        {[
          { key: 'all', label: 'All Products', icon: Package },
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
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase">
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
      {/* Search + Filter */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input type="text" placeholder="Search by name, category, or scan barcode..."
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-3 pl-10 pr-12 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm transition-colors"
            value={search} onChange={e => setSearch(e.target.value)} />
          <button 
            title="Scan Barcode to Find"
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

      {/* Product Table */}
      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto relative">
            {loading && (
              <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm z-10 flex items-center justify-center">
                <Loader2 className="animate-spin text-emerald-500" size={32} />
              </div>
            )}
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase">
                <tr>
                  <th className="px-6 py-4">{t('colName')}</th>
                  <th className="px-6 py-4">{t('colCategory')}</th>
                  <th className="px-6 py-4">{t('colStock')}</th>
                  <th className="px-6 py-4">{t('colMinStock')}</th>
                  {bizConfig.hasExpiry && <th className="px-6 py-4">Expiry</th>}
                  {bizConfig.hasBatch && <th className="px-6 py-4">Batch</th>}
                  {bizConfig.hasModel && <th className="px-6 py-4">Model</th>}
                  {bizConfig.hasWarranty && <th className="px-6 py-4">Warranty</th>}
                  {bizConfig.hasShades && <th className="px-6 py-4">Shade</th>}
                  {bizConfig.hasGender && <th className="px-6 py-4">Gender</th>}
                  <th className="px-6 py-4 text-right">{t('colMRP')}</th>
                  <th className="px-6 py-4 text-right">{t('colSelling')}</th>
                  <th className="px-6 py-4 text-right">{t('colStockValue')}</th>
                  <th className="px-6 py-4 text-right">{t('colProfit')}</th>
                  <th className="px-6 py-4 text-center">{t('colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map(product => {
                  const isLowStock = product.stock <= product.minStock && product.stock > 0;
                  const isOut = product.stock === 0;
                  const sizeVariants = parseSizeVariants(product.size_variants);
                  const sizePriceData = parseSizePrices(product.metadata);
                  const hasPerSizePricing = Object.keys(sizePriceData).length > 0;
                  
                  const hasCost = product.cost > 0 || (hasPerSizePricing && Object.values(sizePriceData).some(sp => sp.cost > 0));
                  const stockValue = hasPerSizePricing
                    ? Object.entries(sizeVariants).reduce((sum, [sz, qty]) => {
                        const cost = sizePriceData[sz]?.cost || product.cost;
                        const price = cost > 0 ? cost : (sizePriceData[sz]?.sellingPrice || product.sellingPrice || 0);
                        return sum + qty * price;
                      }, 0)
                    : (product.cost > 0 ? product.stock * product.cost : product.stock * product.sellingPrice);

                  let profit: string | null = null;
                  if (hasPerSizePricing) {
                    let totalCostValue = 0;
                    let totalSellingValue = 0;
                    let hasValidCostAndPrice = false;
                    
                    const activeSizes = Object.entries(sizeVariants);
                    if (activeSizes.length > 0) {
                      activeSizes.forEach(([sz, qty]) => {
                        const variantCost = sizePriceData[sz]?.cost || 0;
                        const variantSell = sizePriceData[sz]?.sellingPrice || product.sellingPrice || 0;
                        if (variantCost > 0 && variantSell > 0) {
                          hasValidCostAndPrice = true;
                          const weight = qty > 0 ? qty : 1;
                          totalCostValue += weight * variantCost;
                          totalSellingValue += weight * variantSell;
                        }
                      });
                    }
                    if (hasValidCostAndPrice && totalCostValue > 0) {
                      profit = ((totalSellingValue - totalCostValue) / totalCostValue * 100).toFixed(1);
                    }
                  } else if (product.cost > 0) {
                    profit = ((product.sellingPrice - product.cost) / product.cost * 100).toFixed(1);
                  }

                  return (
                    <tr key={product.id} className="group text-slate-900 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-all duration-200">
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
                          {(bizConfig.hasSizes || Object.keys(sizeVariants).length > 0) ? (
                            <div>
                              <div className="text-sm font-bold flex items-center gap-1">
                                {product.stock} <span className="text-[10px] opacity-70 font-medium"><SmartTranslator text={product.unit || 'Unit'} locale={locale} /></span>
                              </div>
                              {Object.keys(sizeVariants).length > 0 && (
                                <div className="flex flex-wrap gap-0.5 mt-1">
                                  {Object.entries(sizeVariants).filter(([,q]) => q > 0).slice(0, 5).map(([sz, q]) => {
                                    const sp = sizePriceData[sz];
                                    return (
                                      <span key={sz} className={cn(
                                        'text-[9px] px-1 rounded',
                                        sp ? 'bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                                      )}>
                                        {sz}{sp ? ` ₹${sp.sellingPrice}` : `:${q}`}
                                        {sp ? <span className="opacity-60"> ({q})</span> : null}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          ) : (
                            <>{product.stock} <span className="text-[10px] opacity-70 font-medium"><SmartTranslator text={product.unit} locale={locale} /></span></>
                          )}
                          {isLowStock && <AlertCircle size={14} />}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{product.minStock}</td>
                      {bizConfig.hasExpiry && <td className="px-6 py-4"><ExpiryBadge date={product.expiry_date} /></td>}
                      {bizConfig.hasBatch && <td className="px-6 py-4 text-xs text-slate-600 dark:text-slate-400">{product.batch_number || '—'}</td>}
                      {bizConfig.hasModel && <td className="px-6 py-4 text-xs text-slate-600 dark:text-slate-300 font-mono">{product.model_number || '—'}</td>}
                      {bizConfig.hasWarranty && (
                        <td className="px-6 py-4 text-xs">
                          {product.warranty_months ? (
                            <span className="flex items-center gap-1 text-sky-500 dark:text-sky-400">
                              <ShieldCheck size={12} />{product.warranty_months}m
                            </span>
                          ) : '—'}
                        </td>
                      )}
                      {bizConfig.hasShades && <td className="px-6 py-4 text-xs text-pink-500 dark:text-pink-400">{product.shade || '—'}</td>}
                      {bizConfig.hasGender && <td className="px-6 py-4 text-xs text-slate-600 dark:text-slate-400">{product.gender || '—'}</td>}
                      <td className="px-6 py-4 text-right text-slate-500 dark:text-slate-400">
                        {hasPerSizePricing
                          ? <span className="text-[10px] font-semibold text-violet-500 dark:text-violet-400 italic">Per-size</span>
                          : `₹${product.mrp?.toLocaleString('en-IN') ?? '—'}`}
                      </td>
                      <td className="px-6 py-4 text-right font-bold">
                        {hasPerSizePricing
                          ? <span className="text-[10px] font-semibold text-violet-500 dark:text-violet-400 italic">Per-size ↕</span>
                          : `₹${product.sellingPrice?.toLocaleString('en-IN') ?? '—'}`}
                      </td>
                      <td className="px-6 py-4 text-right font-semibold">
                        <span className={hasCost ? 'text-amber-500 dark:text-amber-400' : 'text-slate-500'}>
                          {hasCost ? '' : '~'}₹{stockValue.toLocaleString('en-IN')}
                        </span>
                        {!hasCost && <span className="block text-[9px] text-slate-400 dark:text-slate-600 font-normal">add cost price</span>}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {profit !== null
                          ? <span className={cn('font-bold', Number(profit) >= 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>{profit}%</span>
                          : <button onClick={() => startEdit(product)} className="text-[10px] text-slate-500 dark:text-slate-400 hover:text-amber-500 dark:hover:text-amber-400 underline transition-colors">set cost</button>
                        }
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1.5 opacity-100 transition-opacity">
                          <button onClick={() => setQrProduct(product)} title="Barcode / QR"
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
                {filtered.length === 0 && !loading && (
                  <tr><td colSpan={20} className="px-6 py-12 text-center text-slate-500">{t('noProducts')}</td></tr>
                )}
              </tbody>
              {filtered.length > 0 && (
                <tfoot className="bg-slate-50 dark:bg-slate-800/70 border-t border-slate-200 dark:border-slate-700">
                  <tr>
                    <td className="px-6 py-3 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase" colSpan={3}>{t('totalCost')}</td>
                    <td className="px-6 py-3 text-right text-amber-500 dark:text-amber-400 font-bold text-base" colSpan={2}>
                      ₹{filtered.reduce((sum: number, p: any) => {
                        const sizeVariants = parseSizeVariants(p.size_variants);
                        const sizePriceData = parseSizePrices(p.metadata);
                        const hasPerSizePricing = Object.keys(sizePriceData).length > 0;
                        
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

      {/* Barcode & QR Generator Modal */}
      {qrProduct && (
        <BarcodeQRModal product={qrProduct} onClose={() => setQrProduct(null)} />
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
              <button onClick={() => { setShowEditModal(false); setEditProduct(null); }} className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"><X size={20} /></button>
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
                  <input required autoFocus className={modalInp} value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Category</label>
                    <input required className={modalInp} value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))} list="edit-cat-suggestions" />
                    <datalist id="edit-cat-suggestions">
                      {bizConfig.defaultCategories.map(c => <option key={c} value={c}>{translateData(c, locale) || c}</option>)}
                    </datalist>
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
                {(bizConfig.hasFabric || bizConfig.hasShades) && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{bizConfig.hasFabric ? 'Fabric / Material' : 'Shade / Color'}</label>
                    <input className={modalInp} value={editForm.shade} onChange={e => setEditForm(f => ({ ...f, shade: e.target.value }))} />
                  </div>
                )}
                {bizConfig.hasModel && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Model Number</label>
                      <input className={modalInp} placeholder="e.g. SM-G990B" value={editForm.model_number} onChange={e => setEditForm(f => ({ ...f, model_number: e.target.value }))} />
                    </div>
                    {bizConfig.hasWarranty && (
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Warranty (months)</label>
                        <input type="number" min="0" className={modalInp} placeholder="12" value={editForm.warranty_months} onChange={e => setEditForm(f => ({ ...f, warranty_months: e.target.value }))} />
                      </div>
                    )}
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
                      <input className={modalInp} value={editForm.batch_number} onChange={e => setEditForm(f => ({ ...f, batch_number: e.target.value }))} />
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
                  {bizConfig.hasSpecs && editVariantDim && (
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">{tv('optionalProductHint')}</p>
                  )}
                  {editVariantDim ? (
                    <div className="space-y-3">
                      <ColorPicker colorChart={editVariantDim.options} value={editColors} onChange={handleEditColorsChange} showSwatch={editVariantDim.swatch} />
                      <ColorSizeVariantGrid
                        colors={editColors}
                        sizeChart={Array.from(new Set([...editVariantDim.sizeChart, ...sizesFromVariants(editForm.size_variants)]))}
                        value={editForm.size_variants}
                        onChange={variants => setEditForm(f => ({ ...f, size_variants: variants }))}
                        unitLabel={editForm.unit?.toLowerCase() || 'units'}
                        perSizePricing={editPerSizePricing}
                        sizePrices={editSizePrices}
                        onSizePricesChange={setEditSizePrices}
                        showSwatch={editVariantDim.swatch}
                        dimensionLabel={editVariantDim.label}
                      />
                    </div>
                  ) : (
                  <SizeVariantGrid
                    sizeChart={bizConfig.sizeChart!}
                    value={editForm.size_variants}
                    onChange={variants => setEditForm(f => ({ ...f, size_variants: variants }))}
                    unitLabel={editForm.unit?.toLowerCase() || 'units'}
                    perSizePricing={editPerSizePricing}
                    sizePrices={editSizePrices}
                    onSizePricesChange={setEditSizePrices}
                  />
                  )}
                </section>
              )}

              {/* Stock & Min */}
              {!editVariantActive && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Current Stock</label>
                    <input required type="number" min="0" className={modalInp} value={editForm.stock} onChange={e => setEditForm(f => ({ ...f, stock: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Min Stock Level</label>
                    <input required type="number" min="0" className={modalInp} value={editForm.minStock} onChange={e => setEditForm(f => ({ ...f, minStock: e.target.value }))} />
                  </div>
                </div>
              )}

              {editVariantActive && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Min Stock Level (Total)</label>
                  <input required type="number" min="0" className={modalInp} value={editForm.minStock} onChange={e => setEditForm(f => ({ ...f, minStock: e.target.value }))} />
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
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">MRP</label>
                    <input required={!editPerSizePricing} type="number" min="0" className={modalInp} placeholder="0" value={editForm.mrp} onChange={e => setEditForm(f => ({ ...f, mrp: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Selling Price</label>
                    <input required={!editPerSizePricing} type="number" min="0" className={`${modalInp} text-emerald-400 font-bold`} placeholder="0" value={editForm.sellingPrice} onChange={e => setEditForm(f => ({ ...f, sellingPrice: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Cost Price</label>
                    <input type="number" min="0" className={`${modalInp} text-amber-400`} placeholder="0" value={editForm.cost} onChange={e => setEditForm(f => ({ ...f, cost: e.target.value }))} />
                  </div>
                </div>
                {editForm.sellingPrice && editForm.cost && Number(editForm.cost) > 0 && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-500/70">Profit Margin</span>
                    <span className="text-lg font-black text-emerald-400">
                      {(((Number(editForm.sellingPrice) - Number(editForm.cost)) / Number(editForm.cost)) * 100).toFixed(1)}%
                    </span>
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">HSN Code</label>
                    <input className={modalInp} placeholder="HSN/SAC Code" value={editForm.hsnCode || ''} onChange={e => setEditForm(f => ({ ...f, hsnCode: e.target.value }))} />
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
                <div className="flex items-center gap-1 bg-emerald-500/10 rounded-lg p-0.5 border border-emerald-500/20 ml-2">
                  <button type="button" onClick={startCamera}
                    className="flex items-center gap-1.5 px-3 py-1 text-emerald-500 dark:text-emerald-400 rounded-md text-[10px] font-bold hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors">
                    <Camera size={12} /> Photo
                  </button>
                  <div className="w-px h-3 bg-emerald-500/20" />
                  <button type="button" onClick={() => scanInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1 text-emerald-500 dark:text-emerald-400 rounded-md text-[10px] font-bold hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors">
                    <Plus size={12} /> Upload
                  </button>
                </div>
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
                  <input required className={modalInp} 
                    placeholder={bizConfig.productPlaceholder || t('fieldNamePlaceholder')}
                    value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('fieldCategory')}</label>
                    <input required className={modalInp} placeholder={bizConfig.defaultCategories[0]}
                      value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} list="cat-suggestions" />
                    <datalist id="cat-suggestions">
                      {bizConfig.defaultCategories.map(c => <option key={c} value={c}>{translateData(c, locale) || c}</option>)}
                    </datalist>
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

                {/* Fabric— clothes only */}
                {bizConfig.hasFabric && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Fabric / Material</label>
                    <input className={modalInp} placeholder="e.g. Cotton, Polyester, Silk..." value={form.shade}
                      onChange={e => setForm(f => ({ ...f, shade: e.target.value }))} />
                  </div>
                )}

                {/* Shade — cosmetics */}
                {bizConfig.hasShades && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Shade / Color Variant</label>
                    <input className={modalInp} placeholder="e.g. Rose Red, Nude 01, #F5C6D0..."
                      value={form.shade} onChange={e => setForm(f => ({ ...f, shade: e.target.value }))} />
                  </div>
                )}

                {/* Model / Warranty — electronics */}
                {bizConfig.hasModel && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Model Number</label>
                      <input className={modalInp} placeholder="e.g. SM-G990B"
                        value={form.model_number} onChange={e => setForm(f => ({ ...f, model_number: e.target.value }))} />
                    </div>
                    {bizConfig.hasWarranty && (
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Warranty (months)</label>
                        <input type="number" min="0" className={modalInp} placeholder="12"
                          value={form.warranty_months} onChange={e => setForm(f => ({ ...f, warranty_months: e.target.value }))} />
                      </div>
                    )}
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
                      <input className={modalInp} placeholder="e.g. BCH-2024-001"
                        value={form.batch_number} onChange={e => setForm(f => ({ ...f, batch_number: e.target.value }))} />
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
                  {bizConfig.hasSpecs && addVariantDim && (
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">{tv('optionalProductHint')}</p>
                  )}
                  {addVariantDim ? (
                    <div className="space-y-3">
                      <ColorPicker colorChart={addVariantDim.options} value={colors} onChange={handleAddColorsChange} showSwatch={addVariantDim.swatch} />
                      <ColorSizeVariantGrid
                        colors={colors}
                        sizeChart={addVariantDim.sizeChart}
                        value={form.size_variants}
                        onChange={variants => setForm(f => ({ ...f, size_variants: variants }))}
                        unitLabel={form.unit?.toLowerCase() || 'units'}
                        perSizePricing={perSizePricing}
                        sizePrices={sizePrices}
                        onSizePricesChange={setSizePrices}
                        showSwatch={addVariantDim.swatch}
                        dimensionLabel={addVariantDim.label}
                      />
                    </div>
                  ) : (
                  <SizeVariantGrid
                    sizeChart={bizConfig.sizeChart!}
                    value={form.size_variants}
                    onChange={variants => setForm(f => ({ ...f, size_variants: variants }))}
                    unitLabel={form.unit?.toLowerCase() || 'units'}
                    perSizePricing={perSizePricing}
                    sizePrices={sizePrices}
                    onSizePricesChange={setSizePrices}
                  />
                  )}
                </section>
              )}
              {/* Electricals/electronics: prompt to choose a category when none maps to a spec yet */}
              {bizConfig.hasSpecs && !addVariantDim && form.category.trim() !== '' && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 -mt-2">{tv('simpleCategoryHint')}</p>
              )}

              {/* ── Stock & Min ── (hidden when stock is driven by the variant grid) */}
              {!addVariantActive && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('fieldStock')}</label>
                    <input required type="number" min="0" className={modalInp} placeholder="0"
                      value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('fieldMinStock')}</label>
                    <input required type="number" min="0" className={modalInp} placeholder="0"
                      value={form.minStock} onChange={e => setForm(f => ({ ...f, minStock: e.target.value }))} />
                  </div>
                </div>
              )}

              {addVariantActive && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('fieldMinStock')} (Total)</label>
                  <input required type="number" min="0" className={modalInp} placeholder="5"
                    value={form.minStock} onChange={e => setForm(f => ({ ...f, minStock: e.target.value }))} />
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
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('fieldMRP')}</label>
                    <input required={!perSizePricing} type="number" min="0" className={modalInp} placeholder="0"
                      value={form.mrp} onChange={e => setForm(f => ({ ...f, mrp: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('fieldSelling')}</label>
                    <input required={!perSizePricing} type="number" min="0" className={`${modalInp} text-emerald-400 font-bold`} placeholder="0"
                      value={form.sellingPrice} onChange={e => setForm(f => ({ ...f, sellingPrice: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('fieldCost')}</label>
                    <input type="number" min="0" className={`${modalInp} text-amber-400`} placeholder="0"
                      value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} />
                  </div>
                </div>
                {form.sellingPrice && form.cost && Number(form.cost) > 0 && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-500/70">{t('profit')}</span>
                    <span className="text-lg font-black text-emerald-400">
                      {(((Number(form.sellingPrice) - Number(form.cost)) / Number(form.cost)) * 100).toFixed(1)}%
                    </span>
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">HSN Code</label>
                    <input className={modalInp} placeholder="HSN/SAC Code" value={form.hsnCode || ''} onChange={e => setForm(f => ({ ...f, hsnCode: e.target.value }))} />
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
                <button type="submit"
                  className={`flex-1 bg-gradient-to-r ${
                    bizConfig.gradient || 'from-emerald-600 to-emerald-500'
                  } text-white py-3 rounded-xl font-black shadow-xl transition-all active:scale-95`}>
                  {t('addProduct')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-red-200 dark:border-red-500/30 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center">
                <Trash2 size={18} className="text-red-500 dark:text-red-400" />
              </div>
              <div>
                <p className="font-bold text-slate-900 dark:text-slate-100">{t('deleteConfirm')}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">{t('deleteWarning')}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirmId(null)} className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 py-2.5 rounded-xl font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">{t('cancel')}</button>
              <button onClick={() => doDelete(deleteConfirmId)} className="flex-1 bg-red-500 text-white py-2.5 rounded-xl font-bold hover:bg-red-400">{t('delete')}</button>
            </div>
          </div>
        </div>
      )}
      </> /* end viewMode === 'all' */
      )}
    </div>
  );
}
