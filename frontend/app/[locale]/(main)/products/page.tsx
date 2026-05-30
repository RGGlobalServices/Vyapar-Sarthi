'use client';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import {
  Plus, Search, Filter, AlertCircle, Pencil, Trash2, Check, X,
  Loader2, Sparkles, Camera, ShieldCheck, Clock, Package
} from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { useLocale } from 'next-intl';
import SmartTranslator from '@/components/SmartTranslator';
import ExpiryDateField, { ExpiryBadge } from '@/components/ExpiryDateField';
import SizeVariantGrid, { parseSizeVariants, serializeSizeVariants, totalFromSizes } from '@/components/SizeVariantGrid';
import { useBusinessStore } from '@/lib/businessStore';
import { getBusinessConfig } from '@/lib/businessConfig';
import { canAddProduct, getPlanLimits, planLabel, productLimitDisplay, UPGRADE_URL } from '@/lib/planGates';
import { QrCode } from 'lucide-react';
import dynamic from 'next/dynamic';

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
  };
}

export default function ProductsPage() {
  const t = useTranslations('Products');
  const locale = useLocale();
  const { profile } = useBusinessStore();
  const bizConfig = getBusinessConfig(profile.businessType);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(buildEmptyForm(profile.businessType));
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [editRow, setEditRow] = useState<Partial<Product>>({});
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

  // Reset form when business type changes
  useEffect(() => {
    setForm(buildEmptyForm(profile.businessType));
  }, [profile.businessType]);

  const inp = 'bg-slate-700 border border-slate-600 rounded px-2 py-1 text-slate-100 text-sm w-full focus:outline-none focus:ring-1 focus:ring-emerald-500';
  const modalInp = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';
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
      const res = await api.post('/products/scan', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
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

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await api.get('/products');
      setProducts(res.data.map((p: any) => ({
        id: p.id, name: p.name, category: p.category,
        stock: p.currentStock, minStock: p.minStock,
        mrp: p.mrp, sellingPrice: p.sellingPrice, cost: p.wholesaleCost,
        unit: p.baseUnit || 'Unit',
        expiry_date: p.expiryDate, batch_number: p.batch_number,
        drug_schedule: p.drug_schedule, model_number: p.model_number,
        warranty_months: p.warranty_months, gender: p.gender,
        shade: p.shade, size_variants: p.size_variants,
      })));
    } catch { /* */ } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchProducts();
    function handleClick(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const categories = useMemo(() => Array.from(new Set(products.map(p => p.category))).sort(), [products]);
  const activeFilters = [filterCategory, filterStatus].filter(Boolean).length;

  const filtered = useMemo(() => products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase()) ||
      (p as any).barcode?.toLowerCase().includes(search.toLowerCase()) ||
      search.toLowerCase().includes(p.name.toLowerCase());
    const matchCat = !filterCategory || p.category === filterCategory;
    const isLow = p.stock <= p.minStock && p.stock > 0;
    const isOut = p.stock === 0;
    const matchStatus = !filterStatus ? true :
      filterStatus === 'low' ? isLow : filterStatus === 'out' ? isOut :
      filterStatus === 'ok' ? (!isLow && !isOut) : true;
    return matchSearch && matchCat && matchStatus;
  }), [products, search, filterCategory, filterStatus]);

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canAddProduct(profile.subscriptionPlan, products.length)) {
      const limits = getPlanLimits(profile.subscriptionPlan);
      alert(`Product limit reached (${limits.maxProducts} on ${planLabel(profile.subscriptionPlan)} plan).\nUpgrade to add more products.`);
      window.open(UPGRADE_URL, '_blank');
      return;
    }
    const sizeVariantsJson = bizConfig.hasSizes ? serializeSizeVariants(form.size_variants) : undefined;
    const stockQty = bizConfig.hasSizes ? totalFromSizes(form.size_variants) : Number(form.stock);
    try {
      await api.post('/products', {
        name: form.name, category: form.category,
        current_stock: stockQty, min_stock: Number(form.minStock),
        mrp: Number(form.mrp), selling_price: Number(form.sellingPrice),
        wholesale_cost: Number(form.cost), base_unit: form.unit || 'Unit',
        barcode: `BAR-${Date.now()}`,
        is_loose: form.is_loose,
        // Extended fields
        expiry_date: form.expiry_date || null,
        batch_number: form.batch_number || null,
        drug_schedule: form.drug_schedule || null,
        model_number: form.model_number || null,
        warranty_months: form.warranty_months ? Number(form.warranty_months) : null,
        gender: form.gender || null,
        shade: form.shade || null,
        size_variants: sizeVariantsJson || null,
      });
      fetchProducts();
      setForm(buildEmptyForm(profile.businessType));
      setShowAddModal(false);
    } catch { /* */ }
  }

  function startEdit(product: Product) {
    setEditingId(product.id);
    setEditRow({ ...product });
  }
  async function saveEdit(id: string | number) {
    try {
      const row = editRow as any;
      await api.put(`/products/${id}`, {
        name: row.name, category: row.category,
        current_stock: row.stock, min_stock: row.minStock,
        mrp: row.mrp, selling_price: row.sellingPrice, wholesale_cost: row.cost,
      });
      fetchProducts();
      setEditingId(null); setEditRow({});
    } catch { /* */ }
  }
  async function doDelete(id: string | number) {
    try { await api.delete(`/products/${id}`); fetchProducts(); setDeleteConfirmId(null); } catch { /* */ }
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
          {(() => {
            const limits = getPlanLimits(profile.subscriptionPlan);
            const pct = limits.maxProducts === Infinity ? null : products.length / limits.maxProducts;
            return (
              <div className="text-right">
                <p className="text-xs font-bold text-slate-400">
                  {products.length.toLocaleString('en-IN')} / {productLimitDisplay(profile.subscriptionPlan)} products
                </p>
                {pct !== null && (
                  <div className="w-32 h-1.5 bg-slate-800 rounded-full mt-1 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${pct >= 0.9 ? 'bg-red-500' : pct >= 0.7 ? 'bg-orange-400' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(pct * 100, 100)}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })()}
          <button onClick={() => setShowAddModal(true)}
            className="bg-emerald-500 text-slate-900 px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-400 transition-colors">
            <Plus size={20} />{t('addProduct')}
          </button>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input type="text" placeholder="Search by name, category, or scan barcode..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl py-3 pl-10 pr-12 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            value={search} onChange={e => setSearch(e.target.value)} />
          <button 
            title="Scan Barcode to Find"
            onClick={() => setShowScanner(true)}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-slate-800 text-slate-400 p-1.5 rounded-lg hover:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
          >
            <QrCode size={18} />
          </button>
        </div>
        <div className="relative" ref={filterRef}>
          <button onClick={() => setShowFilter(v => !v)}
            className={cn('p-3 rounded-xl border flex items-center gap-1.5 transition-colors',
              showFilter || activeFilters > 0
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200')}>
            <Filter size={18} />
            {activeFilters > 0 && (
              <span className="bg-emerald-500 text-slate-900 text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center">{activeFilters}</span>
            )}
          </button>
          {showFilter && (
            <div className="absolute right-0 top-full mt-2 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl z-30 w-64 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-slate-200">{t('filters')}</p>
                {activeFilters > 0 && (
                  <button onClick={() => { setFilterCategory(''); setFilterStatus(''); }}
                    className="text-xs text-red-400 hover:text-red-300">{t('clearAll')}</button>
                )}
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">{t('filterCategory')}</label>
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => setFilterCategory('')}
                    className={cn('px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                      !filterCategory ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'border-slate-600 text-slate-400 hover:text-slate-200')}>
                    {t('allCategories')}
                  </button>
                  {categories.map(cat => (
                    <button key={cat} onClick={() => setFilterCategory(filterCategory === cat ? '' : cat)}
                      className={cn('px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                        filterCategory === cat ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'border-slate-600 text-slate-400 hover:text-slate-200')}>
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">{t('filterStatus')}</label>
                <div className="flex flex-col gap-1">
                  {statusOptions.map(opt => (
                    <button key={opt.val} onClick={() => setFilterStatus(opt.val)}
                      className={cn('w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors',
                        filterStatus === opt.val ? 'bg-slate-700 text-slate-100 font-medium' : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200')}>
                      <span className={cn('inline-block w-2 h-2 rounded-full mr-2', opt.dot ?? 'bg-slate-500')} />
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
      <Card className="bg-slate-900 border-slate-800 overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto relative">
            {loading && (
              <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm z-10 flex items-center justify-center">
                <Loader2 className="animate-spin text-emerald-500" size={32} />
              </div>
            )}
            <table className="w-full text-left">
              <thead className="bg-slate-800/50 text-slate-400 text-xs uppercase">
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
              <tbody className="divide-y divide-slate-800">
                {filtered.map(product => {
                  const isEditing = editingId === product.id;
                  const isLowStock = product.stock <= product.minStock && product.stock > 0;
                  const isOut = product.stock === 0;
                  const profit = product.cost > 0 ? ((product.sellingPrice - product.cost) / product.cost * 100).toFixed(1) : '0.0';
                  const sizeVariants = parseSizeVariants(product.size_variants);

                  if (isEditing) {
                    return (
                      <tr key={product.id} className="bg-slate-800/60 text-slate-200">
                        <td className="px-4 py-3"><input className={inp} value={editRow.name ?? ''} onChange={e => setEditRow(r => ({ ...r, name: e.target.value }))} /></td>
                        <td className="px-4 py-3"><input className={inp} value={editRow.category ?? ''} onChange={e => setEditRow(r => ({ ...r, category: e.target.value }))} /></td>
                        <td className="px-4 py-3"><input type="number" className={inp} value={editRow.stock ?? ''} onChange={e => setEditRow(r => ({ ...r, stock: Number(e.target.value) }))} /></td>
                        <td className="px-4 py-3"><input type="number" className={inp} value={editRow.minStock ?? ''} onChange={e => setEditRow(r => ({ ...r, minStock: Number(e.target.value) }))} /></td>
                        {bizConfig.hasExpiry && <td className="px-4 py-3"><input className={inp} type="date" value={editRow.expiry_date ?? ''} onChange={e => setEditRow(r => ({ ...r, expiry_date: e.target.value }))} /></td>}
                        {bizConfig.hasBatch && <td className="px-4 py-3"><input className={inp} value={editRow.batch_number ?? ''} onChange={e => setEditRow(r => ({ ...r, batch_number: e.target.value }))} /></td>}
                        {bizConfig.hasModel && <td className="px-4 py-3"><input className={inp} value={editRow.model_number ?? ''} onChange={e => setEditRow(r => ({ ...r, model_number: e.target.value }))} /></td>}
                        {bizConfig.hasWarranty && <td className="px-4 py-3"><input type="number" className={inp} value={editRow.warranty_months ?? ''} onChange={e => setEditRow(r => ({ ...r, warranty_months: Number(e.target.value) }))} /></td>}
                        {bizConfig.hasShades && <td className="px-4 py-3"><input className={inp} value={editRow.shade ?? ''} onChange={e => setEditRow(r => ({ ...r, shade: e.target.value }))} /></td>}
                        {bizConfig.hasGender && <td className="px-4 py-3"><input className={inp} value={editRow.gender ?? ''} onChange={e => setEditRow(r => ({ ...r, gender: e.target.value }))} /></td>}
                        <td className="px-4 py-3"><input type="number" className={inp} value={editRow.mrp ?? ''} onChange={e => setEditRow(r => ({ ...r, mrp: Number(e.target.value) }))} /></td>
                        <td className="px-4 py-3"><input type="number" className={inp} value={editRow.sellingPrice ?? ''} onChange={e => setEditRow(r => ({ ...r, sellingPrice: Number(e.target.value) }))} /></td>
                        <td className="px-4 py-3 text-sm text-slate-400">—</td>
                        <td className="px-4 py-3 text-sm text-slate-400">—</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => saveEdit(product.id)} className="text-emerald-400 hover:text-emerald-300 p-1"><Check size={18} /></button>
                            <button onClick={() => { setEditingId(null); setEditRow({}); }} className="text-slate-400 hover:text-red-400 p-1"><X size={18} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={product.id} className="group text-slate-200 hover:bg-slate-800/40 transition-all duration-200">
                      <td className="px-6 py-4 font-medium">
                        <div className="flex items-center gap-2 flex-wrap">
                          <SmartTranslator text={product.name} locale={locale} />
                          {product.is_loose && <span className="text-[9px] bg-amber-500/20 text-amber-400 font-black px-1.5 py-0.5 rounded uppercase tracking-wide">{t('looseBadge')}</span>}
                          {product.shade && <span className="text-xs text-pink-400 bg-pink-500/15 px-1.5 py-0.5 rounded-full">{product.shade}</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-400"><SmartTranslator text={product.category} locale={locale} /></td>
                      <td className="px-6 py-4">
                        <div className={cn('flex items-center gap-1 font-bold', isOut ? 'text-red-400' : isLowStock ? 'text-orange-400' : 'text-emerald-400')}>
                          {bizConfig.hasSizes ? (
                            <div>
                              <div className="text-sm font-bold">{product.stock} pairs</div>
                              {Object.keys(sizeVariants).length > 0 && (
                                <div className="flex flex-wrap gap-0.5 mt-1">
                                  {Object.entries(sizeVariants).filter(([,q]) => q > 0).slice(0, 5).map(([sz, q]) => (
                                    <span key={sz} className="text-[9px] bg-slate-700 text-slate-300 px-1 rounded">{sz}:{q}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <>{product.stock} <span className="text-[10px] opacity-70 font-medium"><SmartTranslator text={product.unit} locale={locale} /></span></>
                          )}
                          {isLowStock && <AlertCircle size={14} />}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-400">{product.minStock}</td>
                      {bizConfig.hasExpiry && <td className="px-6 py-4"><ExpiryBadge date={product.expiry_date} /></td>}
                      {bizConfig.hasBatch && <td className="px-6 py-4 text-xs text-slate-400">{product.batch_number || '—'}</td>}
                      {bizConfig.hasModel && <td className="px-6 py-4 text-xs text-slate-300 font-mono">{product.model_number || '—'}</td>}
                      {bizConfig.hasWarranty && (
                        <td className="px-6 py-4 text-xs">
                          {product.warranty_months ? (
                            <span className="flex items-center gap-1 text-sky-400">
                              <ShieldCheck size={12} />{product.warranty_months}m
                            </span>
                          ) : '—'}
                        </td>
                      )}
                      {bizConfig.hasShades && <td className="px-6 py-4 text-xs text-pink-400">{product.shade || '—'}</td>}
                      {bizConfig.hasGender && <td className="px-6 py-4 text-xs text-slate-400">{product.gender || '—'}</td>}
                      <td className="px-6 py-4 text-right text-slate-400">₹{product.mrp}</td>
                      <td className="px-6 py-4 text-right font-bold">₹{product.sellingPrice}</td>
                      <td className="px-6 py-4 text-right text-amber-400 font-semibold">₹{(product.stock * product.cost).toLocaleString('en-IN')}</td>
                      <td className="px-6 py-4 text-right text-emerald-500 font-medium">{profit}%</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setQrProduct(product)} title="Barcode / QR"
                            className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-blue-500/20 hover:text-blue-400 transition-all active:scale-90 border border-slate-700/50">
                            <QrCode size={14} />
                          </button>
                          <button onClick={() => startEdit(product)} title={t('edit')}
                            className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-emerald-500/20 hover:text-emerald-400 transition-all active:scale-90 border border-slate-700/50">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => setDeleteConfirmId(product.id)} title={t('delete')}
                            className="p-2 rounded-lg bg-slate-800 text-slate-500 hover:bg-red-500/20 hover:text-red-400 transition-all active:scale-90 border border-slate-700/50">
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
                <tfoot className="bg-slate-800/70 border-t border-slate-700">
                  <tr>
                    <td className="px-6 py-3 text-xs font-bold text-slate-400 uppercase" colSpan={3}>{t('totalCost')}</td>
                    <td className="px-6 py-3 text-right text-amber-400 font-bold text-base" colSpan={2}>
                      ₹{filtered.reduce((sum, p) => sum + p.stock * p.cost, 0).toLocaleString('en-IN')}
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

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/20 sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{bizConfig.emoji}</span>
                <div>
                  <h2 className="text-lg font-bold text-slate-100">{t('addModal')}</h2>
                  <p className="text-xs text-slate-500">{bizConfig.label}</p>
                </div>
                <div className="flex items-center gap-1 bg-emerald-500/10 rounded-lg p-0.5 border border-emerald-500/20 ml-2">
                  <button type="button" onClick={startCamera}
                    className="flex items-center gap-1.5 px-3 py-1 text-emerald-400 rounded-md text-[10px] font-bold hover:bg-emerald-500/20">
                    <Camera size={12} /> Photo
                  </button>
                  <div className="w-px h-3 bg-emerald-500/20" />
                  <button type="button" onClick={() => scanInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1 text-emerald-400 rounded-md text-[10px] font-bold hover:bg-emerald-500/20">
                    <Plus size={12} /> Upload
                  </button>
                </div>
              </div>
              <button onClick={() => { setShowAddModal(false); setForm(buildEmptyForm(profile.businessType)); }} className="text-slate-400 hover:text-slate-200"><X size={20} /></button>
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
                      {bizConfig.defaultCategories.map(c => <option key={c} value={c} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('fieldUnit') || 'Unit'}</label>
                    <select className={modalSel} value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                      {bizConfig.defaultUnits.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>

                {/* Loose Material toggle */}
                <label className="flex items-center gap-3 p-3 bg-slate-700/40 rounded-xl border border-slate-700 cursor-pointer hover:border-amber-500/40 transition-colors">
                  <div className="relative">
                    <input type="checkbox" className="sr-only" checked={form.is_loose}
                      onChange={e => setForm(f => ({ ...f, is_loose: e.target.checked }))} />
                    <div className={`w-10 h-5 rounded-full transition-colors ${form.is_loose ? 'bg-amber-500' : 'bg-slate-600'}`} />
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${form.is_loose ? 'left-5' : 'left-0.5'}`} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-200">{t('looseMaterialLabel')}</p>
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

              {/* ── Size Inventory ── */}
              {bizConfig.hasSizes && bizConfig.sizeChart && (
                <section className="space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-1 h-4 rounded bg-violet-500" />
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Size Inventory</p>
                    <span className="text-[10px] text-slate-600">Enter qty per size</span>
                  </div>
                  <SizeVariantGrid
                    sizeChart={bizConfig.sizeChart}
                    value={form.size_variants}
                    onChange={variants => setForm(f => ({ ...f, size_variants: variants }))}
                  />
                </section>
              )}

              {/* ── Stock & Min ── (hidden for size-based if fully managed by size grid) */}
              {!bizConfig.hasSizes && (
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

              {bizConfig.hasSizes && (
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

              {/* ── Pricing ── */}
              <section className="space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-1 h-4 rounded bg-amber-500" />
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Pricing</p>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('fieldMRP')}</label>
                    <input required type="number" min="0" className={modalInp} placeholder="0"
                      value={form.mrp} onChange={e => setForm(f => ({ ...f, mrp: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('fieldSelling')}</label>
                    <input required type="number" min="0" className={`${modalInp} text-emerald-400 font-bold`} placeholder="0"
                      value={form.sellingPrice} onChange={e => setForm(f => ({ ...f, sellingPrice: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('fieldCost')}</label>
                    <input required type="number" min="0" className={`${modalInp} text-amber-400`} placeholder="0"
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
              </section>

              <div className="flex gap-4 pt-2">
                <button type="button" onClick={() => { setShowAddModal(false); setForm(buildEmptyForm(profile.businessType)); }}
                  className="flex-1 bg-slate-800 text-slate-400 py-3 rounded-xl font-bold hover:bg-slate-700 hover:text-slate-200 transition-all active:scale-95">
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
          <div className="bg-slate-900 border border-red-500/30 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <Trash2 size={18} className="text-red-400" />
              </div>
              <div>
                <p className="font-bold text-slate-100">{t('deleteConfirm')}</p>
                <p className="text-sm text-slate-400 mt-0.5">{t('deleteWarning')}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirmId(null)} className="flex-1 bg-slate-800 text-slate-300 py-2.5 rounded-xl font-medium">{t('cancel')}</button>
              <button onClick={() => doDelete(deleteConfirmId)} className="flex-1 bg-red-500 text-white py-2.5 rounded-xl font-bold hover:bg-red-400">{t('delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
