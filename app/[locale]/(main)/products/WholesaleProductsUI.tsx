'use client';
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import {
  Plus, Search, Pencil, Trash2, X,
  Loader2, Package, Tag, ShieldCheck,
  LayoutGrid, List, ArrowUp, ArrowDown, Warehouse,
  Calendar, FlaskConical, Ruler, Palette, MonitorSmartphone, User, Shirt, Footprints
} from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { getBusinessConfig } from '@/lib/businessConfig';
import SmartTranslator from '@/components/SmartTranslator';
import ProductDetailsSheet from './ProductDetailsSheet';
import useSWR from 'swr';

const fetcher = (url: string) => api.get(url).then(res => res.data);

type WholesaleProduct = {
  id: string;
  name: string;
  brand: string;
  category: string;
  hsnCode: string;
  gstPercent: number;
  productType: 'single' | 'variant' | 'loose';
  barcode: string;
  mrp: number;
  sellingPrice: number;
  wholesaleCost: number;
  baseUnit: string;
  currentStock?: number;
  minStock?: number;
  _count?: { godownProducts: number };
  // Business-type specific fields
  expiryDate?: string;
  batch_number?: string;
  drug_schedule?: string;
  model_number?: string;
  warranty_months?: number;
  gender?: string;
  shade?: string;
  size_variants?: string;
  // Stored in metadata JSON
  color?: string;
  fabric?: string;
  sole_material?: string;
  metadata?: any;
  // Master data relations
  categoryId?: string;
  brandId?: string;
  baseUnitId?: string;
  defaultSaleUnitId?: string;
  defaultPurchaseUnitId?: string;
  maxStock?: number;
  wholesaleMoq?: number;
};

function buildEmptyProduct(bizType: string): Partial<WholesaleProduct> {
  const config = getBusinessConfig(bizType);
  return {
    name: '',
    brand: '',
    category: '',
    hsnCode: '',
    gstPercent: 0,
    productType: 'single',
    barcode: '',
    mrp: 0,
    sellingPrice: 0,
    wholesaleCost: 0,
    baseUnit: config.defaultUnits[0] || 'PCS',
    expiryDate: '',
    batch_number: '',
    drug_schedule: 'OTC',
    model_number: '',
    warranty_months: undefined,
    gender: 'Unisex',
    shade: '',
    color: '',
    fabric: '',
    sole_material: '',
    metadata: {},
  };
}

export default function WholesaleProductsUI() {
  const t = useTranslations('Products');
  const { profile } = useBusinessStore();
  const bizConfig = getBusinessConfig(profile.businessType);

  const emptyProduct = buildEmptyProduct(profile.businessType);
  
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(handler);
  }, [search]);

  const swrKey = debouncedSearch.length > 1 ? `/products?q=${encodeURIComponent(debouncedSearch)}` : '/products';
  const { data: products = [], mutate: mutateProducts, isLoading: loading } = useSWR<WholesaleProduct[]>(swrKey, fetcher);
  
  const { data: masterData } = useSWR('/master-data', fetcher);

  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('productViewMode');
    if (saved === 'grid' || saved === 'table') setViewMode(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem('productViewMode', viewMode);
  }, [viewMode]);
  
  const toggleSelection = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };
  
  const toggleAll = () => {
    if (selectedIds.length === filteredProducts.length && filteredProducts.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredProducts.map((p: any) => p.id));
    }
  };

  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState<Partial<WholesaleProduct>>(emptyProduct);
  const [saving, setSaving] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);

  // Variant Builder State
  const [variants, setVariants] = useState<any[]>([]);

  const handleEdit = async (p: any) => {
    const meta = p.metadata || {};
    setForm({
      ...p,
      name: p.name || '',
      brand: p.brand || '',
      category: p.category || '',
      hsnCode: p.hsnCode || '',
      barcode: p.barcode || '',
      baseUnit: p.baseUnit || bizConfig.defaultUnits[0] || 'PCS',
      gstPercent: p.gstPercent || 0,
      mrp: p.mrp || 0,
      sellingPrice: p.sellingPrice || 0,
      wholesaleCost: p.wholesaleCost || 0,
      productType: p.productType || 'single',
      expiryDate: p.expiryDate || '',
      batch_number: p.batch_number || '',
      drug_schedule: p.drug_schedule || 'OTC',
      model_number: p.model_number || '',
      warranty_months: p.warranty_months || undefined,
      gender: p.gender || 'Unisex',
      shade: p.shade || '',
      color: meta.color || '',
      fabric: meta.fabric || '',
      sole_material: meta.sole_material || '',
      metadata: meta,
      categoryId: p.categoryId || '',
      brandId: p.brandId || '',
      baseUnitId: p.baseUnitId || '',
      defaultSaleUnitId: p.defaultSaleUnitId || '',
      defaultPurchaseUnitId: p.defaultPurchaseUnitId || '',
      maxStock: p.maxStock || undefined,
      wholesaleMoq: p.wholesaleMoq || undefined,
    });
    setVariants(p.variants || []);
    setShowAddModal(true);
  };

  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [bulkForm, setBulkForm] = useState<{ category?: string; brand?: string }>({});

  const handleBulkSave = async () => {
    if (!bulkForm.category && !bulkForm.brand) {
      alert("Please enter at least one field to update.");
      return;
    }
    setSaving(true);
    try {
      await api.put('/products/bulk', { ids: selectedIds, data: bulkForm });
      mutateProducts((prev: any[] = []) => prev.map(p => selectedIds.includes(p.id) ? { ...p, ...bulkForm } : p), { revalidate: false });
      mutateProducts();
      setShowBulkEditModal(false);
      setBulkForm({});
      setSelectedIds([]);
    } catch (err: any) {
      alert(`Error: ${err.message || 'Failed to bulk update'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSingleDelete = async (id: string) => {
    setSaving(true);
    // Optimistic Update
    mutateProducts((prev: any[] = []) => prev.filter(p => p.id !== id), false);
    setSelectedProduct(null);

    try {
      await api.delete(`/products/${id}`);
    } catch (err: any) {
      alert(`Error: ${err.message || 'Failed to delete product'}`);
      mutateProducts(); // Rollback
    } finally {
      mutateProducts(); // Sync
      setSaving(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(t('confirmBulkDelete') || `Are you sure you want to delete ${selectedIds.length} products?`)) return;
    setSaving(true);
    
    // Optimistic Update
    mutateProducts((prev: any[] = []) => prev.filter(p => !selectedIds.includes(p.id)), false);
    
    try {
      await api.delete(`/products/bulk?ids=${selectedIds.join(',')}`);
      setSelectedIds([]);
    } catch (err: any) {
      alert(`Error: ${err.message || 'Failed to bulk delete'}`);
      mutateProducts(); // Rollback
    } finally {
      mutateProducts(); // Sync
      setSaving(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Merge color/fabric/sole into metadata JSON
      const mergedMeta = {
        ...(form.metadata || {}),
        ...(bizConfig.hasColors && form.color ? { color: form.color } : {}),
        ...(bizConfig.hasFabric && form.fabric ? { fabric: form.fabric } : {}),
        ...(bizConfig.hasSoleMaterial && form.sole_material ? { sole_material: form.sole_material } : {}),
      };
      const payload = {
        ...form,
        barcode: form.barcode?.trim() || null,
        variants: form.productType === 'variant' ? variants : [],
        expiryDate: form.expiryDate || null,
        batch_number: form.batch_number || null,
        drug_schedule: bizConfig.hasDrugSchedule ? (form.drug_schedule || null) : null,
        model_number: form.model_number || null,
        warranty_months: form.warranty_months ? Number(form.warranty_months) : null,
        gender: bizConfig.hasGender ? (form.gender || null) : null,
        shade: bizConfig.hasShades ? (form.shade || null) : null,
        metadata: mergedMeta,
        // remove virtual fields from payload
        color: undefined,
        fabric: undefined,
        sole_material: undefined,
      };
      
      // Optimistic update
      const isEdit = !!form.id;
      const optimisticProduct = { ...payload, id: form.id || 'temp-' + Date.now(), variants: [] };
      
      mutateProducts((prev: any[] = []) => {
        if (isEdit) return prev.map(p => p.id === form.id ? { ...p, ...optimisticProduct } : p);
        return [optimisticProduct, ...prev];
      }, false);

      setShowAddModal(false);
      setForm(emptyProduct);
      setVariants([]);

      let updatedProd;
      if (isEdit) {
        const res = await api.put(`/products/${form.id}`, payload);
        updatedProd = res.data;
      } else {
        const res = await api.post('/products', payload);
        updatedProd = res.data;
      }
      
      // Update with real ID from server
      if (!isEdit) {
        mutateProducts((prev: any[] = []) => prev.map(p => p.id === optimisticProduct.id ? updatedProd : p), false);
      }
      mutateProducts();
    } catch (err: any) {
      console.error('Failed to save product', err);
      const msg = err?.response?.data?.detail || err.message || 'Failed to save product. Check for duplicate barcodes or missing fields.';
      alert(`Error: ${msg}`);
      mutateProducts(); // Rollback on error
    } finally {
      setSaving(false);
    }
  };

  let filteredProducts = products.filter((p: any) => 
    p.name?.toLowerCase().includes(search.toLowerCase()) || 
    p.barcode?.toLowerCase().includes(search.toLowerCase())
  );

  if (sortConfig) {
    filteredProducts.sort((a: any, b: any) => {
      let aVal = a[sortConfig.key as keyof WholesaleProduct] as any;
      let bVal = b[sortConfig.key as keyof WholesaleProduct] as any;
      
      if (sortConfig.key === 'category') {
        aVal = (a.brand || '') + (a.category || '');
        bVal = (b.brand || '') + (b.category || '');
      }
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getExpiryStatus = (dateStr?: string) => {
    if (!dateStr) return null;
    const diff = new Date(dateStr).getTime() - Date.now();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days < 0) return 'expired';
    if (days <= 30) return 'critical';
    if (days <= 90) return 'warning';
    return 'ok';
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <span className="text-2xl">{bizConfig.emoji}</span>
            {t('wholesaleTitle') || 'Product Master Data'}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 flex items-center gap-2">
            {bizConfig.label}
            {bizConfig.hasExpiry && (
              <span className="text-[10px] bg-orange-500/15 text-orange-500 border border-orange-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide flex items-center gap-1">
                <Calendar size={9} /> Expiry Tracking
              </span>
            )}
            {bizConfig.hasBatch && (
              <span className="text-[10px] bg-blue-500/15 text-blue-500 border border-blue-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide flex items-center gap-1">
                <FlaskConical size={9} /> Batch Tracking
              </span>
            )}
            {bizConfig.hasSizes && (
              <span className="text-[10px] bg-violet-500/15 text-violet-500 border border-violet-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide flex items-center gap-1">
                <Ruler size={9} /> Size Inventory
              </span>
            )}
            {bizConfig.hasWarranty && (
              <span className="text-[10px] bg-sky-500/15 text-sky-500 border border-sky-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide flex items-center gap-1">
                <ShieldCheck size={9} /> Warranty
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setForm(emptyProduct); setVariants([]); setShowAddModal(true); }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all shadow-sm flex items-center gap-2"
          >
            <Plus size={18} />
            {t('createProduct') || 'Create Product'}
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative flex-1 w-full max-w-2xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder={t('searchWholesalePlaceholder') || "Search products by name, barcode, or SKU..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all dark:text-white"
            />
          </div>
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            <button
              onClick={() => setViewMode('table')}
              className={cn("p-2 rounded-md flex items-center justify-center transition-all", viewMode === 'table' ? "bg-white dark:bg-slate-700 shadow-sm text-emerald-600" : "text-slate-500 hover:text-slate-700")}
              title="Table View"
            >
              <List size={18} />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={cn("p-2 rounded-md flex items-center justify-center transition-all", viewMode === 'grid' ? "bg-white dark:bg-slate-700 shadow-sm text-emerald-600" : "text-slate-500 hover:text-slate-700")}
              title="Grid View"
            >
              <LayoutGrid size={18} />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Product List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <Package className="w-16 h-16 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
          <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-1">{t('noProductsFound') || 'No products found'}</h3>
          <p className="text-slate-500 text-sm mb-6">{t('emptyCatalog') || 'Your product catalog is empty.'}</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="text-emerald-600 font-medium hover:text-emerald-700"
          >
            {t('createFirstProduct') || '+ Create your first product'}
          </button>
        </div>
      ) : (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredProducts.map((p: any) => {
              const expiryStatus = getExpiryStatus(p.expiryDate);
              return (
                <Card key={p.id} onClick={() => setSelectedProduct(p)} className="cursor-pointer border-slate-200 dark:border-slate-800 shadow-sm hover:border-emerald-500/50 hover:shadow-md transition-all group bg-white dark:bg-slate-900">
                  <CardContent className="p-5">
                    <div className="flex justify-between items-start mb-3">
                      <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-lg">
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[10px] font-medium px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-md uppercase tracking-wider">
                          {p.productType}
                        </span>
                        {expiryStatus === 'expired' && <span className="text-[9px] font-bold px-1.5 py-0.5 bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 rounded uppercase">Expired</span>}
                        {expiryStatus === 'critical' && <span className="text-[9px] font-bold px-1.5 py-0.5 bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 rounded uppercase">Expiring Soon</span>}
                      </div>
                    </div>
                    <h3 className="font-semibold text-slate-900 dark:text-white truncate group-hover:text-emerald-500 transition-colors" title={p.name}>{p.name}</h3>
                    <div className="text-sm text-slate-500 mt-1 mb-3 flex items-center gap-2">
                      <Tag size={12} /> {p.category || 'Uncategorized'}
                    </div>
                    {/* Business-type specific badges in grid card */}
                    <div className="flex flex-wrap gap-1 mb-3">
                      {p.gender && bizConfig.hasGender && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-300 rounded">{p.gender}</span>
                      )}
                      {p.shade && bizConfig.hasShades && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 bg-pink-100 dark:bg-pink-500/20 text-pink-600 dark:text-pink-300 rounded">{p.shade}</span>
                      )}
                      {p.model_number && bizConfig.hasModel && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 bg-sky-100 dark:bg-sky-500/20 text-sky-600 dark:text-sky-300 rounded">{p.model_number}</span>
                      )}
                      {p.warranty_months && bizConfig.hasWarranty && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 bg-sky-100 dark:bg-sky-500/20 text-sky-600 dark:text-sky-300 rounded flex items-center gap-0.5"><ShieldCheck size={8}/>{p.warranty_months}m</span>
                      )}
                    </div>
                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
                      <div>
                        <div className="text-xs text-slate-400">{t('colCost') || 'Cost'}</div>
                        <div className="font-medium text-slate-900 dark:text-white">₹{p.wholesaleCost || 0}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-400">{t('colSelling') || 'Selling Price'}</div>
                        <div className="font-medium text-emerald-600 dark:text-emerald-400">₹{p.sellingPrice || 0}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            {selectedIds.length > 0 && (
              <div className="bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-100 dark:border-emerald-800/30 p-3 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
                <span className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                  {selectedIds.length} {selectedIds.length === 1 ? 'product' : 'products'} selected
                </span>
                <div className="flex gap-2">
                  <button onClick={() => setShowBulkEditModal(true)} className="text-xs bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-800 text-emerald-700 dark:text-emerald-400 px-3 py-1.5 rounded-lg font-medium transition-colors">
                    {t('bulkEdit') || 'Bulk Edit'}
                  </button>
                  <button onClick={handleBulkDelete} disabled={saving} className="text-xs bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-800/50 hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-600 dark:text-rose-400 px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50">
                    <Trash2 size={14} /> {t('delete') || 'Delete'}
                  </button>
                </div>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="p-4 w-12 text-center">
                      <input 
                        type="checkbox" 
                        checked={selectedIds.length === filteredProducts.length && filteredProducts.length > 0}
                        onChange={toggleAll}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600 cursor-pointer"
                      />
                    </th>
                    <th className="p-4 font-semibold cursor-pointer hover:text-slate-800 dark:hover:text-slate-200" onClick={() => handleSort('name')}>
                      <div className="flex items-center gap-1">{t('colProduct') || 'Product'} {sortConfig?.key === 'name' && (sortConfig.direction === 'asc' ? <ArrowUp size={14}/> : <ArrowDown size={14}/>)}</div>
                    </th>
                    <th className="p-4 font-semibold cursor-pointer hover:text-slate-800 dark:hover:text-slate-200" onClick={() => handleSort('barcode')}>
                      <div className="flex items-center gap-1">{t('colSKU') || 'SKU'} {sortConfig?.key === 'barcode' && (sortConfig.direction === 'asc' ? <ArrowUp size={14}/> : <ArrowDown size={14}/>)}</div>
                    </th>
                    <th className="p-4 font-semibold cursor-pointer hover:text-slate-800 dark:hover:text-slate-200" onClick={() => handleSort('brand')}>
                      <div className="flex items-center gap-1">{t('colBrand') || 'Brand'} {sortConfig?.key === 'brand' && (sortConfig.direction === 'asc' ? <ArrowUp size={14}/> : <ArrowDown size={14}/>)}</div>
                    </th>
                    <th className="p-4 font-semibold cursor-pointer hover:text-slate-800 dark:hover:text-slate-200" onClick={() => handleSort('category')}>
                      <div className="flex items-center gap-1">{t('colCategory') || 'Category'} {sortConfig?.key === 'category' && (sortConfig.direction === 'asc' ? <ArrowUp size={14}/> : <ArrowDown size={14}/>)}</div>
                    </th>
                    {/* Business-type specific columns */}
                    {bizConfig.hasExpiry && (
                      <th className="p-4 font-semibold text-orange-500 dark:text-orange-400">
                        <div className="flex items-center gap-1"><Calendar size={13}/> Expiry</div>
                      </th>
                    )}
                    {bizConfig.hasBatch && (
                      <th className="p-4 font-semibold">Batch</th>
                    )}
                    {bizConfig.hasModel && (
                      <th className="p-4 font-semibold">
                        <div className="flex items-center gap-1"><MonitorSmartphone size={13}/> Model</div>
                      </th>
                    )}
                    {bizConfig.hasWarranty && (
                      <th className="p-4 font-semibold">
                        <div className="flex items-center gap-1"><ShieldCheck size={13}/> Warranty</div>
                      </th>
                    )}
                    {bizConfig.hasGender && (
                      <th className="p-4 font-semibold">
                        <div className="flex items-center gap-1"><User size={13}/> Gender</div>
                      </th>
                    )}
                    {bizConfig.hasShades && (
                      <th className="p-4 font-semibold">
                        <div className="flex items-center gap-1"><Palette size={13}/> Shade</div>
                      </th>
                    )}
                    {bizConfig.hasColors && (
                      <th className="p-4 font-semibold">
                        <div className="flex items-center gap-1"><Palette size={13}/> Colour</div>
                      </th>
                    )}
                    {bizConfig.hasFabric && (
                      <th className="p-4 font-semibold">
                        <div className="flex items-center gap-1"><Shirt size={13}/> Fabric</div>
                      </th>
                    )}
                    {bizConfig.hasSoleMaterial && (
                      <th className="p-4 font-semibold">
                        <div className="flex items-center gap-1"><Footprints size={13}/> Sole</div>
                      </th>
                    )}
                    <th className="p-4 font-semibold text-right cursor-pointer hover:text-slate-800 dark:hover:text-slate-200" onClick={() => handleSort('wholesaleCost')}>
                      <div className="flex items-center justify-end gap-1">{t('colCost') || 'Cost'} {sortConfig?.key === 'wholesaleCost' && (sortConfig.direction === 'asc' ? <ArrowUp size={14}/> : <ArrowDown size={14}/>)}</div>
                    </th>
                    <th className="p-4 font-semibold text-right cursor-pointer hover:text-slate-800 dark:hover:text-slate-200" onClick={() => handleSort('sellingPrice')}>
                      <div className="flex items-center justify-end gap-1">{t('colSelling') || 'Selling'} {sortConfig?.key === 'sellingPrice' && (sortConfig.direction === 'asc' ? <ArrowUp size={14}/> : <ArrowDown size={14}/>)}</div>
                    </th>
                    <th className="p-4 font-semibold text-right cursor-pointer hover:text-slate-800 dark:hover:text-slate-200" onClick={() => handleSort('currentStock')}>
                      <div className="flex items-center justify-end gap-1">{t('colStock') || 'Stock'} {sortConfig?.key === 'currentStock' && (sortConfig.direction === 'asc' ? <ArrowUp size={14}/> : <ArrowDown size={14}/>)}</div>
                    </th>
                    <th className="p-4 font-semibold text-center">{t('colWarehouses') || 'Warehouses'}</th>
                    <th className="p-4 font-semibold text-center">{t('colStatus') || 'Status'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {filteredProducts.map((p: any) => {
                    const stock = (p.godownProducts && p.godownProducts.length > 0)
                      ? p.godownProducts.reduce((sum: number, gp: any) => sum + gp.quantity, 0)
                      : (p.currentStock || 0);
                    const minStock = p.minStock || 5;
                    const isOutOfStock = stock <= 0;
                    const isLowStock = stock > 0 && stock <= minStock;
                    const warehouseCount = p._count?.godownProducts || 0;
                    const isSelected = selectedIds.includes(p.id);
                    const expiryStatus = getExpiryStatus(p.expiryDate);

                    return (
                      <tr key={p.id} className={cn("hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group", isSelected ? "bg-emerald-50/50 dark:bg-emerald-900/10" : "")}>
                        <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            onChange={() => toggleSelection(p.id)}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600 cursor-pointer"
                          />
                        </td>
                        <td className="p-4 cursor-pointer" onClick={() => setSelectedProduct(p)}>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-sm shrink-0">
                              {p.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-medium text-slate-900 dark:text-white flex items-center gap-2">
                                {p.name}
                                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded uppercase tracking-wider">{p.productType}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-slate-600 dark:text-slate-300 font-mono text-xs cursor-pointer" onClick={() => setSelectedProduct(p)}>{p.barcode || '-'}</td>
                        <td className="p-4 text-slate-900 dark:text-white font-medium cursor-pointer" onClick={() => setSelectedProduct(p)}>{p.brand || '-'}</td>
                        <td className="p-4 text-slate-600 dark:text-slate-300 text-sm cursor-pointer" onClick={() => setSelectedProduct(p)}>{p.category || '-'}</td>
                        {/* Business-type specific data cells */}
                        {bizConfig.hasExpiry && (
                          <td className="p-4 cursor-pointer" onClick={() => setSelectedProduct(p)}>
                            {p.expiryDate ? (
                              <span className={cn(
                                'text-xs font-semibold px-2 py-0.5 rounded-full',
                                expiryStatus === 'expired' ? 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400' :
                                expiryStatus === 'critical' ? 'bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400' :
                                expiryStatus === 'warning' ? 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-600 dark:text-yellow-400' :
                                'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                              )}>
                                {new Date(p.expiryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                              </span>
                            ) : <span className="text-slate-400">—</span>}
                          </td>
                        )}
                        {bizConfig.hasBatch && (
                          <td className="p-4 font-mono text-xs text-slate-500 dark:text-slate-400 cursor-pointer" onClick={() => setSelectedProduct(p)}>{p.batch_number || '—'}</td>
                        )}
                        {bizConfig.hasModel && (
                          <td className="p-4 font-mono text-xs text-slate-600 dark:text-slate-300 cursor-pointer" onClick={() => setSelectedProduct(p)}>{p.model_number || '—'}</td>
                        )}
                        {bizConfig.hasWarranty && (
                          <td className="p-4 cursor-pointer" onClick={() => setSelectedProduct(p)}>
                            {p.warranty_months ? (
                              <span className="flex items-center gap-1 text-sky-600 dark:text-sky-400 text-xs font-semibold">
                                <ShieldCheck size={12}/>{p.warranty_months}m
                              </span>
                            ) : <span className="text-slate-400">—</span>}
                          </td>
                        )}
                        {bizConfig.hasGender && (
                          <td className="p-4 text-xs text-violet-600 dark:text-violet-400 font-semibold cursor-pointer" onClick={() => setSelectedProduct(p)}>{p.gender || '—'}</td>
                        )}
                        {bizConfig.hasShades && (
                          <td className="p-4 text-xs text-pink-500 dark:text-pink-400 cursor-pointer" onClick={() => setSelectedProduct(p)}>{p.shade || '—'}</td>
                        )}
                        {bizConfig.hasColors && (
                          <td className="p-4 cursor-pointer" onClick={() => setSelectedProduct(p)}>
                            {(p.metadata?.color) ? (
                              <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                                <span className="w-3 h-3 rounded-full border border-slate-300 shrink-0" style={{ backgroundColor: p.metadata.color.toLowerCase() }} />
                                {p.metadata.color}
                              </span>
                            ) : <span className="text-slate-400">—</span>}
                          </td>
                        )}
                        {bizConfig.hasFabric && (
                          <td className="p-4 text-xs text-violet-600 dark:text-violet-400 font-medium cursor-pointer" onClick={() => setSelectedProduct(p)}>{p.metadata?.fabric || '—'}</td>
                        )}
                        {bizConfig.hasSoleMaterial && (
                          <td className="p-4 text-xs text-amber-600 dark:text-amber-400 font-medium cursor-pointer" onClick={() => setSelectedProduct(p)}>{p.metadata?.sole_material || '—'}</td>
                        )}
                        <td className="p-4 text-right text-slate-900 dark:text-white cursor-pointer" onClick={() => setSelectedProduct(p)}>₹{p.wholesaleCost || 0}</td>
                        <td className="p-4 text-right font-medium text-emerald-600 dark:text-emerald-400 cursor-pointer" onClick={() => setSelectedProduct(p)}>₹{p.sellingPrice || 0}</td>
                        <td className="p-4 text-right cursor-pointer" onClick={() => setSelectedProduct(p)}>
                          <span className={cn("font-medium", isOutOfStock ? "text-rose-600" : isLowStock ? "text-amber-600" : "text-slate-900 dark:text-white")}>
                            {stock} {p.baseUnit}
                          </span>
                        </td>
                        <td className="p-4 cursor-pointer" onClick={() => setSelectedProduct(p)}>
                          <div className="flex justify-center">
                            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md text-xs font-medium text-slate-600 dark:text-slate-300">
                              <Warehouse size={12} /> {warehouseCount}
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-center cursor-pointer" onClick={() => setSelectedProduct(p)}>
                          {isOutOfStock ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 uppercase tracking-wider">{t('statusOutOfStock') || 'Out of Stock'}</span>
                          ) : isLowStock ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 uppercase tracking-wider">{t('statusLowStock') || 'Low Stock'}</span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 uppercase tracking-wider">{t('statusInStock') || 'In Stock'}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {selectedProduct && (
        <ProductDetailsSheet 
          productId={selectedProduct.id} 
          onClose={() => setSelectedProduct(null)} 
          onEdit={(p) => {
            setSelectedProduct(null);
            handleEdit(p);
          }}
          onDelete={handleSingleDelete}
        />
      )}

      {/* Add / Edit Product Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => setShowAddModal(false)} />
          <div className="relative w-full max-w-4xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl flex flex-col border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center flex-shrink-0 bg-white dark:bg-slate-900">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                <span className="text-2xl">{bizConfig.emoji}</span>
                {form.id ? (t('editProduct') || 'Edit Product') : (t('createNewProduct') || 'Create New Product')}
                <span className="text-xs font-normal text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg">{bizConfig.label}</span>
              </h2>
              <button onClick={() => setShowAddModal(false)} className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50 dark:bg-slate-900/50">
              <form id="add-product-form" onSubmit={handleSave} className="space-y-8">
                
                {/* 1. Basic Info */}
                <section>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs">1</div>
                    {t('basicInfo') || 'Basic Information'}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 p-5 bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-sm">
                    <div className="col-span-1 sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">{t('productName') || 'Product Name'} <span className="text-red-500">*</span></label>
                      <input required autoFocus className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white shadow-sm transition-colors"
                        placeholder={bizConfig.productPlaceholder}
                        value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">{t('brand') || 'Brand'}</label>
                      <select className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white shadow-sm transition-colors"
                        value={form.brandId || ''} onChange={e => {
                          const brand = masterData?.brands?.find((b:any) => b.id === e.target.value);
                          setForm({...form, brandId: e.target.value, brand: brand ? brand.name : ''});
                        }}>
                        <option value="">-- Select Brand --</option>
                        {masterData?.brands?.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">{t('category') || 'Category'}</label>
                      <select className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white shadow-sm transition-colors"
                        value={form.categoryId || ''} onChange={e => {
                          const cat = masterData?.categories?.find((c:any) => c.id === e.target.value);
                          setForm({...form, categoryId: e.target.value, category: cat ? cat.name : ''});
                        }}>
                        <option value="">-- Select Category --</option>
                        {masterData?.categories?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Base Unit</label>
                      <select className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white shadow-sm transition-colors"
                        value={form.baseUnitId || ''} onChange={e => {
                          const unit = masterData?.units?.find((u:any) => u.id === e.target.value);
                          setForm({...form, baseUnitId: e.target.value, baseUnit: unit ? unit.name : form.baseUnit});
                        }}>
                        <option value="">-- Legacy Unit ({form.baseUnit}) --</option>
                        {masterData?.units?.map((u: any) => <option key={u.id} value={u.id}>{u.name} ({u.shortName})</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">{t('hsnCode') || 'HSN Code'}</label>
                      <input className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white shadow-sm transition-colors"
                        value={form.hsnCode || ''} onChange={e => setForm({...form, hsnCode: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">{t('gstPercent') || 'GST %'}</label>
                      <select className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white shadow-sm transition-colors"
                        value={form.gstPercent} onChange={e => setForm({...form, gstPercent: Number(e.target.value)})}>
                        <option value={0}>0% (Exempt)</option>
                        <option value={5}>5%</option>
                        <option value={12}>12%</option>
                        <option value={18}>18%</option>
                        <option value={28}>28%</option>
                      </select>
                    </div>
                  </div>
                </section>

                {/* 2. Business-Type Specific Fields */}
                {(bizConfig.hasExpiry || bizConfig.hasBatch || bizConfig.hasDrugSchedule || bizConfig.hasModel || bizConfig.hasWarranty || bizConfig.hasGender || bizConfig.hasShades || bizConfig.hasColors || bizConfig.hasFabric || bizConfig.hasSoleMaterial) && (
                  <section>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 flex items-center justify-center text-xs">2</div>
                      {bizConfig.label} Details
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 p-5 bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-sm">
                      
                      {/* Expiry Date — Medical, Kirana, Boutique */}
                      {bizConfig.hasExpiry && (
                        <div>
                          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <Calendar size={11} className="text-orange-500" />
                            Expiry Date {bizConfig.hasExpiryRequired && <span className="text-red-500">*</span>}
                          </label>
                          <input 
                            type="date"
                            required={bizConfig.hasExpiryRequired}
                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white shadow-sm"
                            value={form.expiryDate ? form.expiryDate.split('T')[0] : ''}
                            onChange={e => setForm({...form, expiryDate: e.target.value})}
                          />
                        </div>
                      )}

                      {/* Batch Number — Medical */}
                      {bizConfig.hasBatch && (
                        <div>
                          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <FlaskConical size={11} className="text-blue-500" />
                            Batch Number
                          </label>
                          <input 
                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white shadow-sm font-mono"
                            placeholder="e.g. BT-2024-01"
                            value={form.batch_number || ''} onChange={e => setForm({...form, batch_number: e.target.value})}
                          />
                        </div>
                      )}

                      {/* Drug Schedule — Medical */}
                      {bizConfig.hasDrugSchedule && (
                        <div>
                          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Drug Schedule</label>
                          <select className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white shadow-sm"
                            value={form.drug_schedule || 'OTC'} onChange={e => setForm({...form, drug_schedule: e.target.value})}>
                            <option value="OTC">OTC (Over the Counter)</option>
                            <option value="Rx">Rx (Prescription Only)</option>
                            <option value="H1">Schedule H1</option>
                            <option value="H">Schedule H</option>
                            <option value="X">Schedule X</option>
                          </select>
                        </div>
                      )}

                      {/* Model Number — Electronics, Electric */}
                      {bizConfig.hasModel && (
                        <div>
                          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <MonitorSmartphone size={11} className="text-sky-500" />
                            Model Number
                          </label>
                          <input 
                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white shadow-sm font-mono"
                            placeholder="e.g. SM-G998B, 65QNED90"
                            value={form.model_number || ''} onChange={e => setForm({...form, model_number: e.target.value})}
                          />
                        </div>
                      )}

                      {/* Warranty — Electronics, Electric */}
                      {bizConfig.hasWarranty && (
                        <div>
                          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <ShieldCheck size={11} className="text-sky-500" />
                            Warranty (months)
                          </label>
                          <input 
                            type="number"
                            min="0"
                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white shadow-sm"
                            placeholder="e.g. 12, 24, 36"
                            value={form.warranty_months || ''} onChange={e => setForm({...form, warranty_months: parseInt(e.target.value) || undefined})}
                          />
                        </div>
                      )}

                      {/* Gender — Clothes, Shoes */}
                      {bizConfig.hasGender && (
                        <div>
                          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <User size={11} className="text-violet-500" />
                            Gender
                          </label>
                          <select className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white shadow-sm"
                            value={form.gender || 'Unisex'} onChange={e => setForm({...form, gender: e.target.value})}>
                            <option value="Unisex">Unisex</option>
                            <option value="Men">Men</option>
                            <option value="Women">Women</option>
                            <option value="Boys">Boys</option>
                            <option value="Girls">Girls</option>
                            <option value="Kids">Kids</option>
                          </select>
                        </div>
                      )}

                      {/* Shade — Boutique / Cosmetics */}
                      {bizConfig.hasShades && (
                        <div>
                          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <Palette size={11} className="text-pink-500" />
                            Shade / Colour
                          </label>
                          <input 
                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white shadow-sm"
                            placeholder="e.g. Nude Pink, Matte Red"
                            value={form.shade || ''} onChange={e => setForm({...form, shade: e.target.value})}
                          />
                        </div>
                      )}

                      {/* Color Picker — Clothes, Shoes, Boutique */}
                      {bizConfig.hasColors && (
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <Palette size={11} className="text-emerald-500" />
                            Colour
                          </label>
                          <div className="flex flex-wrap gap-2 mb-2">
                            {(bizConfig.colorChart || []).map(col => (
                              <button
                                key={col}
                                type="button"
                                onClick={() => setForm({...form, color: form.color === col ? '' : col})}
                                className={cn(
                                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all',
                                  form.color === col
                                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500'
                                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-emerald-400'
                                )}
                              >
                                <span
                                  className="w-3 h-3 rounded-full border border-slate-300 shrink-0"
                                  style={{ backgroundColor: col.toLowerCase() }}
                                />
                                {col}
                              </button>
                            ))}
                          </div>
                          <input
                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white shadow-sm"
                            placeholder="Or type a custom colour..."
                            value={form.color || ''}
                            onChange={e => setForm({...form, color: e.target.value})}
                          />
                        </div>
                      )}

                      {/* Fabric — Clothes */}
                      {bizConfig.hasFabric && (
                        <div>
                          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <Shirt size={11} className="text-violet-500" />
                            Fabric
                          </label>
                          <select
                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white shadow-sm"
                            value={form.fabric || ''}
                            onChange={e => setForm({...form, fabric: e.target.value})}
                          >
                            <option value="">— Select Fabric —</option>
                            <option value="Cotton">Cotton</option>
                            <option value="Polyester">Polyester</option>
                            <option value="Cotton Blend">Cotton Blend</option>
                            <option value="Linen">Linen</option>
                            <option value="Silk">Silk</option>
                            <option value="Denim">Denim</option>
                            <option value="Rayon / Viscose">Rayon / Viscose</option>
                            <option value="Nylon">Nylon</option>
                            <option value="Wool">Wool</option>
                            <option value="Terry Cotton">Terry Cotton</option>
                            <option value="Georgette">Georgette</option>
                            <option value="Chiffon">Chiffon</option>
                            <option value="Net">Net</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                      )}

                      {/* Sole Material — Shoes */}
                      {bizConfig.hasSoleMaterial && (
                        <div>
                          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <Footprints size={11} className="text-amber-500" />
                            Sole Material
                          </label>
                          <select
                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white shadow-sm"
                            value={form.sole_material || ''}
                            onChange={e => setForm({...form, sole_material: e.target.value})}
                          >
                            <option value="">— Select Sole —</option>
                            <option value="Rubber">Rubber</option>
                            <option value="EVA">EVA (Foam)</option>
                            <option value="PU">PU (Polyurethane)</option>
                            <option value="TPR">TPR</option>
                            <option value="Leather">Leather</option>
                            <option value="PVC">PVC</option>
                            <option value="Cork">Cork</option>
                            <option value="Crepe">Crepe</option>
                          </select>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {/* 3. Product Type */}
                <section>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs">
                      {bizConfig.hasExpiry || bizConfig.hasBatch || bizConfig.hasDrugSchedule || bizConfig.hasModel || bizConfig.hasWarranty || bizConfig.hasGender || bizConfig.hasShades ? '3' : '2'}
                    </div>
                    {t('productType') || 'Product Type'}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[
                      { id: 'single', title: t('singleProduct') || 'Single Product', desc: t('singleProductDesc') || 'Standard item with one fixed size/price' },
                      { id: 'variant', title: t('productVariants') || 'Product with Variants', desc: t('productVariantsDesc') || 'Multiple sizes/colors (e.g., 250g, 500g)' },
                      { id: 'loose', title: t('looseBulk') || 'Loose / Bulk', desc: t('looseBulkDesc') || 'Sold by weight or custom units' }
                    ].map(type => (
                      <div 
                        key={type.id}
                        onClick={() => setForm({...form, productType: type.id as any})}
                        className={cn(
                          "p-4 rounded-xl border-2 cursor-pointer transition-all",
                          form.productType === type.id 
                            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10" 
                            : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-emerald-400"
                        )}
                      >
                        <div className="flex items-center gap-3 mb-1.5">
                          <div className={cn("w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0", 
                            form.productType === type.id ? "border-emerald-500" : "border-slate-300 dark:border-slate-600")}>
                            {form.productType === type.id && <div className="w-2 h-2 bg-emerald-500 rounded-full" />}
                          </div>
                          <h4 className="font-bold text-slate-900 dark:text-slate-200 text-sm leading-tight">{type.title}</h4>
                        </div>
                        <p className="text-xs text-slate-500 ml-7 leading-relaxed">{type.desc}</p>
                      </div>
                    ))}
                  </div>
                </section>

                {/* 4. Pricing & Variants */}
                <section>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs">
                      {(bizConfig.hasExpiry || bizConfig.hasBatch || bizConfig.hasDrugSchedule || bizConfig.hasModel || bizConfig.hasWarranty || bizConfig.hasGender || bizConfig.hasShades) ? '4' : '3'}
                    </div>
                    {form.productType === 'variant' ? (t('variantBuilder') || 'Variant Builder') : (t('pricingInformation') || 'Pricing Information')}
                  </h3>
                  
                  {form.productType !== 'variant' ? (
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 p-5 bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-sm">
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">{t('barcodeSku') || 'Barcode / SKU'}</label>
                          <input className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white shadow-sm transition-colors font-mono"
                            value={form.barcode || ''} onChange={e => setForm({...form, barcode: e.target.value})} placeholder={t('scanOrTypeBarcode') || "Scan or type barcode"} />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">{t('costPrice') || 'Cost Price'}</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">₹</span>
                            <input type="number" step="0.01" className="w-full pl-8 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white shadow-sm transition-colors"
                              value={form.wholesaleCost || ''} onChange={e => setForm({...form, wholesaleCost: parseFloat(e.target.value) || 0})} />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">{t('sellingPrice') || 'Selling Price'}</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">₹</span>
                            <input type="number" step="0.01" className="w-full pl-8 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white shadow-sm transition-colors"
                              value={form.sellingPrice || ''} onChange={e => setForm({...form, sellingPrice: parseFloat(e.target.value) || 0})} />
                          </div>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">{t('mrp') || 'MRP'}</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">₹</span>
                            <input type="number" step="0.01" className="w-full pl-8 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white shadow-sm transition-colors"
                              value={form.mrp || ''} onChange={e => setForm({...form, mrp: parseFloat(e.target.value) || 0})} />
                          </div>
                        </div>
                     </div>
                  ) : (
                    <div className="p-5 bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-sm">
                      <div className="space-y-4">
                        {variants.map((v, i) => (
                          <div key={i} className="flex flex-wrap sm:flex-nowrap gap-3 items-end p-4 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 relative group">
                            <div className="flex-1 min-w-[100px]">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">
                                {bizConfig.hasSizes ? 'Size/Name' : bizConfig.hasShades ? 'Shade' : 'Variant'}
                              </label>
                              <input className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white shadow-sm outline-none focus:ring-1 focus:ring-emerald-500"
                                value={v.size || ''} onChange={e => { const nv = [...variants]; nv[i].size = e.target.value; setVariants(nv); }}
                                placeholder={bizConfig.sizeChart ? bizConfig.sizeChart[0] : 'e.g. 500g'} />
                              {bizConfig.sizeChart && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {bizConfig.sizeChart.slice(0, 6).map(s => (
                                    <button key={s} type="button" onClick={() => { const nv = [...variants]; nv[i].size = s; setVariants(nv); }}
                                      className={cn("text-[9px] px-1.5 py-0.5 rounded border transition-colors",
                                        v.size === s ? "bg-emerald-500 border-emerald-500 text-white" : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:border-emerald-400")}>
                                      {s}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="w-24">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Cost</label>
                              <input type="number" className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white shadow-sm outline-none focus:ring-1 focus:ring-emerald-500"
                                value={v.costPrice || 0} onChange={e => { const nv = [...variants]; nv[i].costPrice = parseFloat(e.target.value); setVariants(nv); }} />
                            </div>
                            <div className="w-24">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Selling</label>
                              <input type="number" className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white shadow-sm outline-none focus:ring-1 focus:ring-emerald-500"
                                value={v.sellingPrice || 0} onChange={e => { const nv = [...variants]; nv[i].sellingPrice = parseFloat(e.target.value); setVariants(nv); }} />
                            </div>
                            <div className="w-24">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">MRP</label>
                              <input type="number" className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white shadow-sm outline-none focus:ring-1 focus:ring-emerald-500"
                                value={v.mrp || 0} onChange={e => { const nv = [...variants]; nv[i].mrp = parseFloat(e.target.value); setVariants(nv); }} />
                            </div>
                            <button type="button" onClick={() => setVariants(variants.filter((_, idx) => idx !== i))}
                              className="w-10 h-10 flex items-center justify-center text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                        
                        <button type="button" onClick={() => setVariants([...variants, { size: '', costPrice: 0, sellingPrice: 0, mrp: 0 }])}
                          className="w-full py-3 border-2 border-dashed border-emerald-200 dark:border-emerald-500/30 rounded-xl text-emerald-600 dark:text-emerald-400 font-medium hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors flex items-center justify-center gap-2">
                          <Plus size={18} /> Add Variant
                        </button>
                      </div>
                    </div>
                  )}
                </section>
                
                {/* Note */}
                <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 text-blue-700 dark:text-blue-400 p-4 rounded-xl flex items-start gap-3 text-sm shadow-sm">
                  <ShieldCheck size={20} className="shrink-0 mt-0.5" />
                  <p className="text-blue-900 dark:text-blue-200/90 leading-relaxed">In the wholesale module, inventory levels are managed through the <strong>Purchases</strong> tab. After saving this product, create a Purchase Invoice to receive stock and assign it to a Warehouse.</p>
                </div>
              </form>
            </div>
            
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex justify-end gap-3 flex-shrink-0">
              <button type="button" onClick={() => setShowAddModal(false)}
                className="px-5 py-2.5 rounded-xl font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm">
                {t('cancel') || 'Cancel'}
              </button>
              <button form="add-product-form" type="submit" disabled={saving}
                className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold transition-all shadow-sm flex items-center gap-2 text-sm">
                {saving ? <><Loader2 size={16} className="animate-spin" /> {t('saving') || 'Saving...'}</> : (t('saveMasterData') || 'Save Master Data')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900 flex-shrink-0">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Pencil size={20} className="text-emerald-500" />
                {t('bulkEditProducts') || 'Bulk Edit Products'}
              </h2>
              <button onClick={() => setShowBulkEditModal(false)} className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                Updating {selectedIds.length} {selectedIds.length === 1 ? 'product' : 'products'}. {t('leaveFieldsBlank') || "Leave fields blank if you don't want to change them."}
              </p>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">{t('category') || 'Category'}</label>
                <input className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white shadow-sm transition-colors"
                  list="bulkCategoryList"
                  value={bulkForm.category || ''} onChange={e => setBulkForm({...bulkForm, category: e.target.value})} placeholder="New Category" />
                <datalist id="bulkCategoryList">
                  {bizConfig.defaultCategories.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">{t('brand') || 'Brand'}</label>
                <input className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white shadow-sm transition-colors"
                  value={bulkForm.brand || ''} onChange={e => setBulkForm({...bulkForm, brand: e.target.value})} placeholder="New Brand" />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex justify-end gap-3 flex-shrink-0">
              <button type="button" onClick={() => setShowBulkEditModal(false)}
                className="px-5 py-2.5 rounded-xl font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm">
                {t('cancel') || 'Cancel'}
              </button>
              <button onClick={handleBulkSave} disabled={saving}
                className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold transition-all shadow-sm flex items-center gap-2 text-sm">
                {saving ? <Loader2 size={16} className="animate-spin" /> : (t('applyToAll') || 'Apply to all')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
