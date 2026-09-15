'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Box, Package, Archive, AlertTriangle, Search, Loader2, ArrowRightLeft,
  TrendingDown, Clock, CheckCircle, X, Filter, Download, Printer,
  Plus, Edit, Eye, AlertOctagon, Info, BarChart3, TrendingUp, CalendarDays, Store, Trash2,
  Barcode as BarcodeIcon, ListChecks, Wine,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import useSWR, { useSWRConfig } from 'swr';
import { useTranslations } from 'next-intl';
import TransferDrawer from './TransferDrawer';
import AdjustDrawer from './AdjustDrawer';
import ReceiveDrawer from './ReceiveDrawer';
import DailyStockRegister from './DailyStockRegister';
import StockTakePanel from './StockTakePanel';
import LiquorMLMatrix from './LiquorMLMatrix';
import { getBusinessConfig } from '@/lib/businessConfig';
import BarcodeQRModal from '@/components/BarcodeQRModal';
import { ConfirmPasswordModal } from '@/components/trash/ConfirmPasswordModal';
import { SelectionActionBar } from '@/components/trash/SelectionActionBar';
import { cssColor } from '@/components/ColorSizeVariantGrid';
import ExpandViewButton from '@/components/ExpandViewButton';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useBarcodeScanner, playScanBeep } from '@/lib/useBarcodeScanner';
import { getStockTableConfig, type StockColumn } from '@/lib/stockTableConfig';
import dynamic from 'next/dynamic';

const CameraScanner = dynamic(() => import('@/components/CameraScanner'), { ssr: false });

function ProfitabilityTab({ product, t }: { product: any; t: (key: string, values?: Record<string, any>) => string }) {
  const [period, setPeriod] = useState(30);

  const stats = useMemo(() => {
    const movements = product.movements || [];
    const sales = movements.filter((m: any) => m.type === 'sale');
    
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - period);
    
    const recentSales = sales.filter((m: any) => new Date(m.created_at) >= cutoff);
    const totalUnitsSold = recentSales.reduce((sum: number, m: any) => sum + Math.abs(m.quantity), 0);
    const sellingPrice = product.sellingPrice || 0;
    const gstRate = product.gstPercent || 0;
    const baseSellingPrice = sellingPrice / (1 + gstRate / 100);
    // Prefer the true vendor cost; fall back to wholesaleCost for products
    // saved before costPrice existed, so historical margins don't drop to 0.
    const costPrice = product.costPrice || product.wholesaleCost || 0;
    
    const totalRevenue = totalUnitsSold * baseSellingPrice;
    const totalCogs = totalUnitsSold * costPrice;
    const grossProfit = totalRevenue - totalCogs;
    const margin = baseSellingPrice > 0 ? ((baseSellingPrice - costPrice) / baseSellingPrice) * 100 : 0;
    
    const chartData: any[] = [];
    const grouped = recentSales.reduce((acc: any, m: any) => {
      const date = new Date(m.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      if (!acc[date]) acc[date] = 0;
      acc[date] += Math.abs(m.quantity);
      return acc;
    }, {});
    
    for (const [date, qty] of Object.entries(grouped)) {
      const q = qty as number;
      chartData.push({
        date,
        revenue: q * baseSellingPrice,
        profit: q * (baseSellingPrice - costPrice),
        qty: q
      });
    }
    
    return {
      totalUnitsSold, totalRevenue, totalCogs, grossProfit, margin,
      chartData: chartData.reverse()
    };
  }, [product, period]);

  return (
    <div className="animate-in fade-in duration-200 space-y-6 pt-2">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-slate-900 dark:text-white">{t('profitAnalytics')}</h3>
        <select
          value={period}
          onChange={(e) => setPeriod(Number(e.target.value))}
          className="text-xs bg-slate-100 dark:bg-slate-800 border-none rounded-lg px-2 py-1 outline-none text-slate-600 dark:text-slate-300 font-bold"
        >
          <option value={7}>{t('last7Days')}</option>
          <option value={30}>{t('last30Days')}</option>
          <option value={90}>{t('last90Days')}</option>
        </select>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 p-3 rounded-xl shadow-sm">
          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-black uppercase tracking-wider mb-1">{t('grossProfit')}</p>
          <p className="text-xl font-black text-emerald-700 dark:text-emerald-300">₹{stats.grossProfit.toLocaleString('en-IN')}</p>
          <p className="text-[10px] text-emerald-600/80 mt-1 font-bold">{t('margin', { pct: stats.margin.toFixed(1) })}</p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 p-3 rounded-xl shadow-sm">
          <p className="text-[10px] text-blue-600 dark:text-blue-400 font-black uppercase tracking-wider mb-1">{t('revenue')}</p>
          <p className="text-xl font-black text-blue-700 dark:text-blue-300">₹{stats.totalRevenue.toLocaleString('en-IN')}</p>
          <p className="text-[10px] text-blue-600/80 mt-1 font-bold">{t('unitsSold', { count: stats.totalUnitsSold })}</p>
        </div>
      </div>
      
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-4">{t('salesTrend')}</p>
        {stats.chartData.length > 0 ? (
          <div className="h-48 w-full -ml-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(val) => `₹${val}`} />
                <Tooltip 
                  cursor={{ fill: '#f1f5f9', opacity: 0.5 }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                />
                <Bar dataKey="revenue" name="Revenue (₹)" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar dataKey="profit" name="Profit (₹)" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
           <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
             {t('noSalesData')}
           </div>
        )}
      </div>

      <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg p-3 flex gap-3 shadow-sm">
        <TrendingUp className="text-amber-500 shrink-0 mt-0.5" size={18} />
        <div>
          <p className="text-sm text-amber-900 dark:text-amber-100 font-bold">{t('velocityInsight')}</p>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-1 leading-relaxed">
            {t('velocityDesc', {
              rate: stats.totalUnitsSold > 0 ? (stats.totalUnitsSold / period).toFixed(1) : '0',
              stock: product.computedStock,
              days: stats.totalUnitsSold > 0 ? Math.ceil(product.computedStock / (stats.totalUnitsSold / period)) : '∞'
            })}
          </p>
        </div>
      </div>
    </div>
  );
}

const fetcher = (url: string | string[]) => {
  const target = Array.isArray(url) ? url[0] : url;
  return api.get(target).then(res => res.data);
};
const godownsFetcher = (url: string | string[]) => {
  const target = Array.isArray(url) ? url[0] : url;
  return api.get(target).then(res => res.data?.data || res.data);
};
const safeFetcher = (url: string | string[]) => {
  if (!url) return Promise.resolve([]);
  const target = Array.isArray(url) ? url[0] : url;
  return api.get(target).then(res => res.data).catch(() => []);
};
import { useBusinessStore } from '@/lib/businessStore';

export default function WholesaleStockUI() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { mutate } = useSWRConfig();
  const t = useTranslations('Stock');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [warehouseFilter, setWarehouseFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [millCategoryFilter, setMillCategoryFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  
  const { mutate: globalMutate } = useSWRConfig();

  // Selected State
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('overview'); // overview, ledger, batches, profitability
  
  // Action Modals
  const [actionModal, setActionModal] = useState<string | null>(null); // 'receive', 'transfer', 'adjust'
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);
  // Daily Register and Stock Take are both full-page inline sections toggled
  // from this same header, mutually exclusive with the normal stock table
  // (and with each other) — Stock Take used to be its own separate sidebar
  // item/route; it now lives here instead, same access pattern as Daily
  // Register already had.
  const [stockSection, setStockSection] = useState<'none' | 'register' | 'stockTake' | 'mlMatrix'>('none');
  const [showScanner, setShowScanner] = useState(false);

  // Hardware (keyboard-wedge) scanner — same detection logic Billing already
  // uses. Feeds the scanned code into the existing text search (which already
  // matches barcode/name/category), disabled while an action modal with its
  // own text fields is open.
  useBarcodeScanner({
    enabled: !actionModal && !showScanner,
    onScan: (code) => { setSearch(code); playScanBeep(true); },
  });

  // Delete selection state — single delete goes through `deleteTarget` +
  // ConfirmPasswordModal; bulk delete through `selectedStockIds` + the
  // SelectionActionBar. Mirrors LegacyStockUI.tsx's pattern; this table's
  // rows are Product records, so both call the /products endpoints directly.
  const [selectedStockIds, setSelectedStockIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  const { activeShopId, allShopAccess, profile } = useBusinessStore();
  const stockConfig = useMemo(() => getStockTableConfig(profile?.businessType || 'general'), [profile?.businessType]);
  const isLiquor = !!getBusinessConfig(profile?.businessType as any)?.hasLiquorSpecs;
  const { data: products = [], isLoading: pLoad, isValidating: pValid, mutate: mutateProducts } = useSWR(activeShopId ? ['/products', activeShopId] : null, fetcher);
  const { data: batches = [], isLoading: bLoad, isValidating: bValid, mutate: mutateBatches } = useSWR(activeShopId ? ['/stock/batches', activeShopId] : null, safeFetcher);
  const { data: godowns = [], isLoading: gLoad, isValidating: gValid, mutate: mutateGodowns } = useSWR(activeShopId ? ['/godowns', activeShopId] : null, godownsFetcher);
  const { data: movements = [], isLoading: mLoad, isValidating: mValid, mutate: mutateMovements } = useSWR(activeShopId ? ['/stock/movements', activeShopId] : null, safeFetcher);
  // Reason-tagged adjustment history (Damaged/Expired/Theft/etc) — only
  // recorded in ActivityLog today, see app/api/v1/stock/adjustments/route.ts.
  const { data: adjustments = [], mutate: mutateAdjustments } = useSWR(activeShopId ? ['/stock/adjustments', activeShopId] : null, safeFetcher);
  
  // Prefetch suppliers so Receive Drawer opens instantly with data
  useSWR(activeShopId ? ['/suppliers', activeShopId] : null, fetcher);

  const handleDataRefresh = (opt?: any) => {
    if (opt) {
      const newProducts = products.map((p: any) => {
        if (p.id === opt.productId) {
          let qtyChange = 0;
          if (opt.type === 'receive' || opt.type === 'adjust') qtyChange = opt.quantity;
          return { ...p, currentStock: (p.currentStock || 0) + qtyChange };
        }
        return p;
      });

      const newGodowns = godowns.map((g: any) => {
        const isTargetGodown = g.id === opt.warehouseId || g.id === opt.toWarehouseId;
        const isSourceGodown = g.id === opt.fromWarehouseId;
        if (!isTargetGodown && !isSourceGodown) return g;
        
        const newInventory = [...(g.inventory || [])];
        const existingItemIndex = newInventory.findIndex((i: any) => i.productId === opt.productId);
        
        let change = 0;
        if (isTargetGodown) change = opt.quantity;
        if (isSourceGodown) change = -opt.quantity;
        
        if (existingItemIndex >= 0) {
          newInventory[existingItemIndex] = {
            ...newInventory[existingItemIndex],
            quantity: newInventory[existingItemIndex].quantity + change
          };
        } else {
          newInventory.push({ productId: opt.productId, quantity: change });
        }
        return { ...g, inventory: newInventory };
      });

      mutateProducts(newProducts, false);
      mutateGodowns(newGodowns, false);
      
      // Also instantly update the selectedProduct state so the side-pane updates immediately (0 ms delay)
      if (selectedProduct && selectedProduct.id === opt.productId) {
        let qtyChange = 0;
        if (opt.type === 'receive' || opt.type === 'adjust') qtyChange = opt.quantity;
        
        setSelectedProduct((prev: any) => ({
          ...prev,
          computedStock: (prev.computedStock || 0) + qtyChange,
          computedValue: ((prev.computedStock || 0) + qtyChange) * (prev.costPrice || prev.wholesaleCost || prev.sellingPrice || 0)
        }));
      }

      // Delay the background revalidation slightly so React has time to render the optimistic data
      setTimeout(() => {
        mutateProducts();
        mutateGodowns();
        mutateMovements();
        mutateAdjustments();
        mutateBatches();
        globalMutate(key => typeof key === 'string' && key.startsWith('/reports/dashboard'));
      }, 500);
    } else {
      mutateProducts();
      mutateGodowns();
      mutateMovements();
      mutateAdjustments();
      mutateBatches();
      globalMutate(key => typeof key === 'string' && key.startsWith('/reports/dashboard'));
    }
  };

  // ML Matrix — inline +/- on a single variant cell, instant like the rest
  // of this page's optimistic updates (mirrors handleDataRefresh's pattern:
  // patch local state first, hit the API, revalidate after).
  const handleMlCellAdjust = async (cell: import('@/lib/liquorMatrix').LiquorMatrixCell, delta: number) => {
    const warehouseId = godowns?.[0]?.id;
    if (!warehouseId) { alert('No warehouse found for this shop — add one under Warehouses first.'); return; }
    const newProducts = products.map((p: any) => {
      if (p.id !== cell.productId) return p;
      if (cell.variantIndex != null && Array.isArray(p.variants)) {
        const variants = p.variants.map((v: any, idx: number) => idx === cell.variantIndex ? { ...v, stock: (Number(v.stock) || 0) + delta } : v);
        return { ...p, variants, currentStock: (p.currentStock || 0) + delta };
      }
      return { ...p, currentStock: (p.currentStock || 0) + delta };
    });
    mutateProducts(newProducts, false);
    try {
      const body: any = { productId: cell.productId, warehouseId };
      if (cell.variantKey) body.variantDeltas = [{ variantKey: cell.variantKey, delta }];
      else body.difference = delta;
      await api.post('/stock/adjust', body);
    } catch (e: any) {
      mutateProducts();
      alert(e?.response?.data?.error || 'Failed to adjust stock');
      return;
    }
    mutateProducts();
  };

  // ML Matrix — "Dynamic Entry": one new brand Product with every filled
  // size as a variants[] row (color = ML, size defaulted to Bottle — same
  // convention this session's liquor AI-import fix already relies on).
  const handleMlAddBrand = async (name: string, entries: Array<{ column: string; qty: number; price: number }>) => {
    const variants = entries.map(e => ({
      color: e.column.replace(' ML', 'ml'),
      size: 'Bottle',
      stock: e.qty,
      costPrice: 0,
      wholesalePrice: e.price,
      sellingPrice: e.price,
      mrp: e.price,
    }));
    const totalStock = entries.reduce((s, e) => s + e.qty, 0);
    const firstPrice = entries.find(e => e.price > 0)?.price || 0;
    await api.post('/products', {
      name,
      baseUnit: 'Bottle',
      currentStock: totalStock,
      sellingPrice: firstPrice,
      mrp: firstPrice,
      variants,
    });
    mutateProducts();
  };

  const loading = pLoad || bLoad || gLoad || mLoad;
  const isUpdating = pValid || gValid || mValid;

  const data = useMemo(() => {
    let totalValue = 0;
    let totalUnits = 0;
    let lowStockCount = 0;
    let expiredCount = 0;
    let deadStockCount = 0;
    let categories = new Set<string>();
    let brands = new Set<string>();
    let grades = new Set<string>();
    let millCategories = new Set<string>();

    const items = (products || []).map((p: any) => {
      // Stock shown here MUST agree with what Products (WholesaleProductsUI)
      // and the product's own detail sheet (erp-details) show — all three
      // used to compute "stock" differently (this file preferred a
      // warehouse-inventory sum, then a Batch-quantity sum, then finally
      // product.currentStock), and each of those sums is only ever a
      // PARTIAL slice: not every purchase gets a warehouse assigned (see
      // purchases/route.ts — warehouseId is optional), and a manual stock
      // adjustment (stock/adjust/route.ts) updates currentStock + the one
      // godown it targets but never touches Batch. So a product with any
      // purchase that skipped a warehouse, or any Batch predating a manual
      // adjustment, silently showed a smaller number here than its real
      // stock — while Products/erp-details, which read currentStock
      // directly, showed the correct total. currentStock is the one field
      // every stock-affecting path (purchases, batch-aware billing/sales,
      // returns, transfers, adjustments, imports) keeps in sync, so it's
      // the only number safe to treat as "the" stock total.
      //
      // The per-warehouse sum stays meaningful ONLY when the shopkeeper has
      // deliberately filtered to one specific warehouse — that's a genuine
      // "what's physically in warehouse X" question, not a stand-in for the
      // product's total stock.
      let warehouseQty = 0;
      let hasWarehouseData = false;
      if (warehouseFilter !== 'all' && godowns && godowns.length > 0) {
        const g = godowns.find((g: any) => g.id === warehouseFilter);
        const item = g?.inventory?.find((i: any) => i.productId === p.id);
        if (item && typeof item.quantity === 'number') {
          warehouseQty = item.quantity;
          hasWarehouseData = true;
        }
      }

      const productBatches = (batches || []).filter((b: any) => b.productId === p.id);
      const rawQty = warehouseFilter !== 'all'
        ? (hasWarehouseData ? warehouseQty : 0)
        : (p.currentStock || 0);

      const qty = Math.max(0, rawQty); // Cap at 0 for display
      const isOutOfStock = rawQty <= 0;

      // Stock value = qty × what was paid for it. Prefer the true vendor
      // cost; fall back through wholesaleCost/sellingPrice for products
      // saved before costPrice existed, so historical valuation doesn't drop to 0.
      const price = p.costPrice || p.wholesaleCost || p.sellingPrice || 0;
      const val = qty * price;
      totalValue += val;
      totalUnits += qty;
      
      if (qty > 0 && qty <= (p.minStock || 0)) lowStockCount++;
      if (p.category) categories.add(p.category);
      if (p.brand) brands.add(p.brand);
      if (p.grade) grades.add(p.grade);
      if (p.millCategory) millCategories.add(p.millCategory);
      
      // Heuristic Dead Stock (0 movements in 30 days)
      const productMovements = (movements || []).filter((m:any) => m.product_id === p.id);
      if (qty > 0 && productMovements.length === 0) deadStockCount++;

      // Net units written off as Damaged/Expired (only those two reasons —
      // Theft/Lost/Physical Count/Opening Balance aren't "damaged stock").
      // Adjustments store a signed difference; a write-off is negative, so
      // negate the net sum to show it as a positive "amount lost" figure.
      const productAdjustments = (adjustments || []).filter((a: any) => a.productId === p.id);
      const damagedNet = productAdjustments
        .filter((a: any) => a.reason === 'Damaged' || a.reason === 'Expired')
        .reduce((sum: number, a: any) => sum - a.difference, 0);
      const damagedQty = Math.max(0, damagedNet);

      return { ...p, computedStock: qty, computedValue: val, batches: productBatches, movements: productMovements, damagedQty };
    });

    return { 
      items, totalValue, totalUnits, lowStockCount, 
      expiredCount, deadStockCount, 
      categories: Array.from(categories),
      brands: Array.from(brands),
      grades: Array.from(grades),
      millCategories: Array.from(millCategories),
      warehouses: godowns || []
    };
  }, [products, batches, godowns, movements, adjustments, warehouseFilter]);

  // Sync selectedProduct with updated data when mutations happen
  useEffect(() => {
    if (selectedProduct && data?.items) {
      const updated = data.items.find((i: any) => i.id === selectedProduct.id);
      if (updated && JSON.stringify(updated) !== JSON.stringify(selectedProduct)) {
        setSelectedProduct(updated);
      }
    }
  }, [data?.items]);

  // Dropped the `if (!mounted) return null` blank-frame gate — SWR data below
  // already handles the loading state without wiping the shell on every nav.



  const filteredItems = (data?.items || []).filter((i: any) => {
    const matchesSearch = !search || i.name.toLowerCase().includes(search.toLowerCase()) || (i.sku && i.sku.toLowerCase().includes(search.toLowerCase())) || (i.barcode && i.barcode.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = categoryFilter === 'all' || i.category === categoryFilter;
    const matchesWarehouse = warehouseFilter === 'all' || i.computedStock > 0;
    const matchesBrand = brandFilter === 'all' || i.brand === brandFilter;
    const matchesMillCategory = millCategoryFilter === 'all' || i.millCategory === millCategoryFilter;
    const matchesGrade = gradeFilter === 'all' || i.grade === gradeFilter;

    let matchesStatus = true;
    if (statusFilter === 'low') matchesStatus = i.computedStock > 0 && i.computedStock <= (i.minStock || 0);
    if (statusFilter === 'out') matchesStatus = i.computedStock <= 0;
    if (statusFilter === 'ok') matchesStatus = i.computedStock > (i.minStock || 0);

    return matchesSearch && matchesCategory && matchesWarehouse && matchesStatus && matchesBrand && matchesMillCategory && matchesGrade;
  });

  // When All Shop Access is on, group the table into one section per shop
  // (heading + its own table) instead of one flat table with a Shop column —
  // a single unlabeled group when off, so this degenerates to today's exact
  // output for every existing single-shop user.
  let filteredItemGroups: { shopName: string | null; items: any[] }[];
  if (allShopAccess) {
    const shopMap = new Map<string, any[]>();
    for (const i of filteredItems) {
      const key = i.shopName || 'Unknown Shop';
      if (!shopMap.has(key)) shopMap.set(key, []);
      shopMap.get(key)!.push(i);
    }
    filteredItemGroups = [];
    shopMap.forEach((items, shopName) => filteredItemGroups.push({ shopName, items }));
    // The shop currently switched to always leads the list, rather than
    // wherever Map insertion order happens to put it.
    filteredItemGroups.sort((a, b) => {
      const aActive = a.items[0]?.shopId === activeShopId;
      const bActive = b.items[0]?.shopId === activeShopId;
      return aActive === bActive ? 0 : aActive ? -1 : 1;
    });
  } else {
    filteredItemGroups = [{ shopName: null, items: filteredItems }];
  }

  function toggleStockSelect(id: string) {
    setSelectedStockIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function permanentDelete(item: any) { setDeleteTarget(item); }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    try {
      await api.delete(`/products/${id}`);
      if (selectedProduct?.id === id) setSelectedProduct(null);
    } catch {
      alert('Failed to delete item.');
    } finally {
      setDeleteTarget(null);
      mutateProducts();
    }
  }

  async function handleBulkDeleteStock() {
    setBulkDeleting(true);
    try {
      await api.delete(`/products/bulk?ids=${Array.from(selectedStockIds).join(',')}`);
      setSelectedStockIds(new Set());
    } catch {
      alert('Failed to delete some items.');
    } finally {
      setBulkDeleting(false);
      setConfirmBulkDelete(false);
      mutateProducts();
    }
  }

  const exportExcel = () => {
    if (!filteredItems || filteredItems.length === 0) {
      alert(t('noItemsToExport'));
      return;
    }

    const exportCols = [...stockConfig.columns, { key: '_status', labelKey: 'colStatus', getValue: (i: any) => {
      if (i.computedStock <= 0) return 'Out of Stock';
      if (i.computedStock <= (i.minStock || 0)) return 'Low Stock';
      return 'In Stock';
    }, type: 'text' as const }];
    const headers = exportCols.map(c => t(c.labelKey));

    const rows = filteredItems.map((item: any) =>
      exportCols.map(col => {
        const raw = col.getValue(item);
        const val = col.exportFormat ? col.exportFormat(raw, item) : (col.format ? col.format(raw, item) : raw);
        if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`;
        return val ?? '';
      }).join(',')
    );

    const csvString = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Inventory_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex gap-4 lg:gap-6 mx-auto pb-16 lg:pb-0 h-[calc(100dvh-130px)] lg:h-[calc(100vh-160px)] overflow-hidden relative">
      
      {/* Main Content Area — the product detail view is a centered modal now
          (see below), not a docked side panel, so this stays full width
          regardless of selection. */}
      <div className="flex-1 overflow-y-auto lg:pr-2 custom-scrollbar transition-all duration-300 pb-10 w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-emerald-500 flex items-center gap-3">
              <Box className="text-emerald-500" /> {t('inventoryDashboard')}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('inventoryDesc')}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ExpandViewButton />
            <button onClick={() => setStockSection(s => s === 'register' ? 'none' : 'register')}
              className={cn('flex items-center gap-2 px-4 py-2 font-bold rounded-xl transition-colors shadow-sm text-sm border',
                stockSection === 'register' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800')}>
              <CalendarDays size={16} /> {t('dailyRegister')}
            </button>
            <button onClick={() => setStockSection(s => s === 'stockTake' ? 'none' : 'stockTake')}
              className={cn('flex items-center gap-2 px-4 py-2 font-bold rounded-xl transition-colors shadow-sm text-sm border',
                stockSection === 'stockTake' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800')}>
              <ListChecks size={16} /> Stock Take
            </button>
            {isLiquor && (
              <button onClick={() => setStockSection(s => s === 'mlMatrix' ? 'none' : 'mlMatrix')}
                className={cn('flex items-center gap-2 px-4 py-2 font-bold rounded-xl transition-colors shadow-sm text-sm border',
                  stockSection === 'mlMatrix' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800')}>
                <Wine size={16} /> ML Matrix
              </button>
            )}
            {/* Unlike Transfer/Adjust (which move or correct stock a product
                already has, so picking that product from the table first
                makes sense), Receiving is how NEW stock gets added — forcing
                a table selection first was a dead end: clicking this cold
                did nothing but show a barely-noticeable alert. The drawer
                now has its own product search, so this opens directly. */}
            <button onClick={() => setActionModal('receive')} className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 transition-colors shadow-sm text-sm">
              <Plus size={16} /> {t('receiveStock')}
            </button>
            <button onClick={() => {
              if (!selectedProduct) { alert(t('selectProductFirst')); return; }
              setActionModal('transfer');
            }} className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white font-bold rounded-xl hover:bg-blue-600 transition-colors shadow-sm text-sm">
              <ArrowRightLeft size={16} /> {t('transferStock')}
            </button>
            <button onClick={() => {
              if (!selectedProduct) { alert(t('selectProductFirst')); return; }
              setActionModal('adjust');
            }} className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-700 transition-colors shadow-sm text-sm">
              <Edit size={16} /> {t('adjustStock')}
            </button>
          </div>
        </div>

        {stockSection === 'register' ? (
          <DailyStockRegister />
        ) : stockSection === 'stockTake' ? (
          <StockTakePanel />
        ) : stockSection === 'mlMatrix' ? (
          <LiquorMLMatrix
            rows={products.map((p: any) => ({ id: p.id, name: p.name, stock: p.currentStock || 0, price: p.sellingPrice, variants: p.variants }))}
            loading={pLoad}
            shopName={profile?.shopName}
            onAdjustCell={handleMlCellAdjust}
            onAddBrand={handleMlAddBrand}
          />
        ) : (<>
        {/* Analytics Widgets */}
        <div className={cn("grid grid-cols-2 gap-4 mb-6", stockConfig.kpis.length <= 5 ? "md:grid-cols-3 lg:grid-cols-5" : "md:grid-cols-3 lg:grid-cols-6")}>
          {loading && (!data || data.items.length === 0) ? (
            Array(stockConfig.kpis.length).fill(0).map((_, i) => (
              <Card key={i} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
                <CardContent className="p-4">
                  <div className="h-3 w-16 bg-slate-200 dark:bg-slate-800 rounded mb-3 animate-pulse" />
                  <div className="h-6 w-24 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
                </CardContent>
              </Card>
            ))
          ) : (
            stockConfig.kpis.map((kpi) => {
              const kpiColorMap: Record<string, string> = {
                emerald: 'text-emerald-600 dark:text-emerald-400',
                amber: 'text-amber-500 dark:text-amber-400',
                rose: 'text-rose-600 dark:text-rose-400',
                blue: 'text-blue-600 dark:text-blue-400',
                purple: 'text-purple-600 dark:text-purple-400',
                indigo: 'text-indigo-600 dark:text-indigo-400',
                orange: 'text-orange-600 dark:text-orange-400',
                slate: 'text-slate-600 dark:text-slate-400',
              };
              const val = kpi.getValue(data?.items || [], data);
              return (
                <Card key={kpi.key} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
                  <CardContent className="p-4">
                    <p className="text-slate-500 dark:text-slate-400 text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-2">{t(kpi.labelKey)}</p>
                    <p className={cn("text-xl sm:text-2xl font-bold font-mono tracking-tighter truncate", kpiColorMap[kpi.color] || kpiColorMap.slate)}>
                      {typeof val === 'number' ? val.toLocaleString('en-IN') : val}
                    </p>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        <SelectionActionBar
          count={selectedStockIds.size}
          itemLabel="product"
          onDelete={() => setConfirmBulkDelete(true)}
          onClear={() => setSelectedStockIds(new Set())}
          disabled={bulkDeleting}
        />

        {/* Filters and Table */}
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
            <div className="flex flex-col lg:flex-row gap-3">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-9 py-2 text-sm text-slate-900 dark:text-slate-200 focus:ring-2 focus:ring-emerald-500 transition-colors shadow-sm"
                  placeholder={t('searchPlaceholder')}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                <button
                  type="button"
                  title={t('scanBarcode')}
                  onClick={() => setShowScanner(true)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-emerald-500 transition-colors"
                >
                  <BarcodeIcon size={16} />
                </button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0 hide-scrollbar">
                {stockConfig.filterKeys.includes('millCategory') && (data?.millCategories?.length ?? 0) > 0 && (
                  <select value={millCategoryFilter} onChange={e => setMillCategoryFilter(e.target.value)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-300 min-w-[130px]">
                    <option value="all">{t('allMillCategories')}</option>
                    {data.millCategories.map((c:string) => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
                <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-300 min-w-[130px]">
                  <option value="all">{t('allCategories')}</option>
                  {data?.categories.map((c:string) => <option key={c} value={c}>{c}</option>)}
                </select>
                {stockConfig.filterKeys.includes('brand') && (data?.brands?.length ?? 0) > 0 && (
                  <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-300 min-w-[130px]">
                    <option value="all">{t('allBrands')}</option>
                    {data.brands.map((b:string) => <option key={b} value={b}>{b}</option>)}
                  </select>
                )}
                {stockConfig.filterKeys.includes('grade') && (data?.grades?.length ?? 0) > 0 && (
                  <select value={gradeFilter} onChange={e => setGradeFilter(e.target.value)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-300 min-w-[130px]">
                    <option value="all">{t('allGrades')}</option>
                    {data.grades.map((g:string) => <option key={g} value={g}>{g}</option>)}
                  </select>
                )}
                <select value={warehouseFilter} onChange={e => setWarehouseFilter(e.target.value)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-300 min-w-[130px]">
                  <option value="all">{t('allWarehouses')}</option>
                  {data?.warehouses.map((w:any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-300 min-w-[120px]">
                  <option value="all">{t('allStatuses')}</option>
                  <option value="ok">{t('inStock')}</option>
                  <option value="low">{t('lowStock')}</option>
                  <option value="out">{t('outOfStock')}</option>
                </select>
                <button onClick={exportExcel} className="flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap text-sm border border-slate-200 dark:border-slate-700">
                  <Download size={14} /> {t('export')}
                </button>
              </div>
            </div>
          </div>
          
          {filteredItemGroups.map((group) => (
          <div key={group.shopName || 'all'}>
          {group.shopName && (
            <div className="flex items-center gap-2 px-4 pt-4 pb-1">
              <Store size={16} className="text-indigo-500 dark:text-indigo-400" />
              <h3 className="text-sm font-black text-slate-900 dark:text-white">{group.shopName}</h3>
              <span className="text-xs text-slate-500">({group.items.length})</span>
            </div>
          )}
          <div className="overflow-x-auto w-full custom-scrollbar relative">

            <table className="w-full min-w-[800px] text-left text-sm text-slate-600 dark:text-slate-300 relative">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 text-xs uppercase font-medium sticky top-0 backdrop-blur-md z-10 shadow-sm border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={group.items.length > 0 && group.items.every((i: any) => selectedStockIds.has(i.id))}
                      onChange={() => {
                        setSelectedStockIds(prev => {
                          const allSelected = group.items.every((i: any) => prev.has(i.id));
                          const next = new Set(prev);
                          group.items.forEach((i: any) => allSelected ? next.delete(i.id) : next.add(i.id));
                          return next;
                        });
                      }}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600 cursor-pointer"
                    />
                  </th>
                  {stockConfig.columns.map(col => (
                    <th key={col.key} className={cn("px-4 py-3", col.align === 'right' && 'text-right', col.align === 'center' && 'text-center')}>
                      {t(col.labelKey)}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-center">{t('colStatus')}</th>
                  <th className="px-4 py-3 text-right">{t('colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading && (!data || data.items.length === 0) ? (
                  Array(5).fill(0).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-4 py-4"><div className="h-4 w-4 bg-slate-200 dark:bg-slate-800 rounded" /></td>
                      {stockConfig.columns.map(col => (
                        <td key={col.key} className="px-4 py-4"><div className="h-4 w-20 bg-slate-200 dark:bg-slate-800 rounded" /></td>
                      ))}
                      <td className="px-4 py-4"><div className="h-4 w-12 bg-slate-200 dark:bg-slate-800 rounded mx-auto" /></td>
                      <td className="px-4 py-4"><div className="h-4 w-8 bg-slate-200 dark:bg-slate-800 rounded ml-auto" /></td>
                    </tr>
                  ))
                ) : group.items.length === 0 ? (
                  <tr>
                    <td colSpan={stockConfig.columns.length + 3} className="px-5 py-12 text-center text-slate-500">
                      {t('noItems')}
                    </td>
                  </tr>
                ) : (
                  group.items.map((item: any) => (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedProduct(item)}
                      className={cn(
                        "hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer",
                        selectedProduct?.id === item.id && "bg-emerald-50 dark:bg-emerald-500/10 border-l-2 border-emerald-500"
                      )}
                    >
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedStockIds.has(item.id)}
                          onChange={() => toggleStockSelect(item.id)}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600 cursor-pointer"
                        />
                      </td>
                      {stockConfig.columns.map(col => {
                        const raw = col.getValue(item);
                        const display = col.format ? col.format(raw, item) : (raw ?? '—');
                        if (col.key === 'name') {
                          return (
                            <td key={col.key} className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                              {item.name}
                              <div className="text-xs text-slate-500 font-normal">{item.category || '-'}</div>
                            </td>
                          );
                        }
                        if (col.key === 'colourSize') {
                          const itemVariants: any[] = Array.isArray(item.variants) ? item.variants : [];
                          const variantColors = Array.from(new Set(itemVariants.map((v: any) => v.color).filter(Boolean))) as string[];
                          const variantSizes = Array.from(new Set(itemVariants.map((v: any) => v.size).filter(Boolean))) as string[];
                          return (
                            <td key={col.key} className="px-4 py-3">
                              {itemVariants.length > 0 ? (
                                <div className="max-w-[170px]">
                                  <div className="flex flex-wrap items-center gap-1">
                                    {variantColors.slice(0, 3).map((c: string) => (
                                      <span key={c} className="flex items-center gap-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                        <span className="w-2 h-2 rounded-full border border-slate-300 dark:border-slate-600 shrink-0" style={{ background: cssColor(c) }} />
                                        {c}
                                      </span>
                                    ))}
                                    {variantColors.length > 3 && (
                                      <span className="text-[10px] text-slate-400 font-semibold">+{variantColors.length - 3}</span>
                                    )}
                                  </div>
                                  {variantSizes.length > 0 && (
                                    <div className="text-[10px] text-slate-400 mt-1">{variantSizes.length} {variantSizes.length === 1 ? (t('size') || 'size') : (t('sizes') || 'sizes')}</div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400 text-xs">—</span>
                              )}
                            </td>
                          );
                        }
                        if (col.type === 'currency') {
                          return (
                            <td key={col.key} className="px-4 py-3 text-right font-mono whitespace-nowrap">
                              {typeof display === 'string' ? display : `₹${(raw || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`}
                            </td>
                          );
                        }
                        return (
                          <td key={col.key} className={cn("px-4 py-3 whitespace-nowrap", col.align === 'right' ? 'text-right font-bold text-slate-700 dark:text-slate-300' : 'text-slate-500 text-xs')}>
                            {display || '—'}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-center">
                        {item.computedStock <= 0 ? (
                          <span className="inline-flex px-1.5 py-0.5 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-[10px] font-bold rounded uppercase border border-red-200 dark:border-red-500/30">{t('statusOut')}</span>
                        ) : item.computedStock <= (item.minStock || 0) ? (
                          <span className="inline-flex px-1.5 py-0.5 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-bold rounded uppercase border border-amber-200 dark:border-amber-500/30">{t('statusLow')}</span>
                        ) : (
                          <span className="inline-flex px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold rounded uppercase border border-emerald-200 dark:border-emerald-500/30">{t('statusOk')}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button className="p-1.5 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/20 rounded-lg transition-colors">
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); permanentDelete(item); }}
                            title={t('deletePermanently')}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/20 rounded-lg transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          </div>
          ))}
        </Card>
        </>)}
      </div>

      {/* Product Detail Modal — a centered overlay in front of the page,
          matching the Checkout/Bill modals elsewhere, instead of a docked
          side panel narrow enough that Pricing Info needed its own
          horizontal scrollbar to be read. */}
      {selectedProduct && (
      <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedProduct(null)} />
        <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-start bg-slate-50/50 dark:bg-slate-900">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{selectedProduct.name}</h2>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded">{selectedProduct.category || t('uncategorized')}</span>
                <span>{selectedProduct.barcode || selectedProduct.sku}</span>
              </div>
            </div>
            <button onClick={() => setSelectedProduct(null)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="flex border-b border-slate-200 dark:border-slate-800 px-2 pt-2 bg-slate-50/50 dark:bg-slate-900">
            {[
              { id: 'overview', label: t('tabOverview'), icon: Info },
              { id: 'ledger', label: t('tabLedger'), icon: ArrowRightLeft },
              { id: 'batches', label: t('tabBatches'), icon: Package },
              { id: 'profit', label: t('tabProfitability'), icon: BarChart3 }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-3 px-2 text-xs font-bold border-b-2 transition-colors",
                  activeTab === tab.id 
                    ? "border-emerald-500 text-emerald-600 dark:text-emerald-400" 
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                )}
              >
                <tab.icon size={14} />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
            {activeTab === 'overview' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                {/* Action Buttons */}
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => setActionModal('receive')} className="flex flex-col items-center justify-center gap-1.5 p-3 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors border border-emerald-200 dark:border-emerald-500/30">
                    <Plus size={18} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">{t('receive')}</span>
                  </button>
                  <button onClick={() => setActionModal('transfer')} className="flex flex-col items-center justify-center gap-1.5 p-3 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors border border-blue-200 dark:border-blue-500/30">
                    <ArrowRightLeft size={18} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">{t('transferStock')}</span>
                  </button>
                  <button onClick={() => setActionModal('adjust')} className="flex flex-col items-center justify-center gap-1.5 p-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700">
                    <Edit size={18} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">{t('adjustStock')}</span>
                  </button>
                </div>

                <div className="space-y-3">
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white uppercase tracking-wider">{t('unifiedStockLedger')}</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 text-center shadow-sm">
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold mb-1">{t('current')}</p>
                      <p className="text-xl font-bold text-slate-900 dark:text-white">{selectedProduct.computedStock}</p>
                    </div>
                    <div className="bg-emerald-50 dark:bg-emerald-500/10 p-3 rounded-lg border border-emerald-200 dark:border-emerald-500/30 text-center shadow-sm">
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase tracking-wider font-bold mb-1">{t('available')}</p>
                      <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">{selectedProduct.computedStock}</p>
                    </div>
                    <div className="bg-amber-50 dark:bg-amber-500/10 p-3 rounded-lg border border-amber-200 dark:border-amber-500/30 text-center shadow-sm">
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 uppercase tracking-wider font-bold mb-1">{t('reserved')}</p>
                      <p className="text-xl font-bold text-amber-700 dark:text-amber-300">0</p>
                    </div>
                    <div className="bg-rose-50 dark:bg-rose-500/10 p-3 rounded-lg border border-rose-200 dark:border-rose-500/30 text-center shadow-sm">
                      <p className="text-[10px] text-rose-600 dark:text-rose-400 uppercase tracking-wider font-bold mb-1">{t('damagedExp')}</p>
                      <p className="text-xl font-bold text-rose-700 dark:text-rose-300">{selectedProduct.damagedQty || 0}</p>
                    </div>
                  </div>
                </div>

                {/* Per-variant (colour × size) stock — the aggregate "Current"
                    card above tells you the total but not which specific
                    colour/size it's made of. Product.variants[] already
                    carries this (written by Purchases, Add/Edit Product, and
                    bulk import — see mergeVariantIntoArray in
                    wholesale-import/execute/route.ts); this just surfaces it
                    here instead of only inside the Add/Edit form. */}
                {Array.isArray(selectedProduct.variants) && selectedProduct.variants.length > 0 && (() => {
                  const variants = selectedProduct.variants as any[];
                  const colourCount = new Set(variants.map(v => v.color).filter(Boolean)).size;
                  const sizeCount = new Set(variants.map(v => v.size).filter(Boolean)).size;
                  const variantTotal = variants.reduce((s, v) => s + (Number(v.stock) || 0), 0);
                  return (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-sm text-slate-900 dark:text-white uppercase tracking-wider">{t('variantWiseStock')}</h4>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
                          {colourCount > 0 && `${colourCount} ${t('colourLabel')}${colourCount > 1 ? 's' : ''}`}
                          {colourCount > 0 && sizeCount > 0 && ' · '}
                          {sizeCount > 0 && `${sizeCount} ${t('sizeLabel')}${sizeCount > 1 ? 's' : ''}`}
                        </span>
                      </div>
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                        <div className="max-h-64 overflow-y-auto">
                          <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 dark:bg-slate-800/50 sticky top-0">
                              <tr>
                                <th className="px-3 py-2 font-semibold text-xs text-slate-500 dark:text-slate-400">{t('colourLabel')}</th>
                                <th className="px-3 py-2 font-semibold text-xs text-slate-500 dark:text-slate-400">{t('sizeLabel')}</th>
                                <th className="px-3 py-2 font-semibold text-xs text-slate-500 dark:text-slate-400 text-right">{t('stockLabel')}</th>
                                <th className="px-3 py-2 font-semibold text-xs text-slate-500 dark:text-slate-400 text-right">{t('sellPriceLabel')}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {variants.map((v, i) => {
                                const stock = Number(v.stock) || 0;
                                return (
                                  <tr key={i} className={cn(stock <= 0 && 'opacity-50')}>
                                    <td className="px-3 py-2">
                                      {v.color ? (
                                        <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                                          <span className="w-3 h-3 rounded-full border border-slate-300 dark:border-slate-600 shrink-0" style={{ background: cssColor(v.color) }} />
                                          {v.color}
                                        </span>
                                      ) : <span className="text-slate-400">—</span>}
                                    </td>
                                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{v.size || '—'}</td>
                                    <td className={cn("px-3 py-2 text-right font-mono font-bold", stock <= 0 ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400')}>{stock}</td>
                                    <td className="px-3 py-2 text-right font-mono text-slate-600 dark:text-slate-400">{v.sellingPrice ? `₹${Number(v.sellingPrice).toLocaleString('en-IN')}` : '—'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex justify-between items-center px-3 py-2 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-xs">
                          <span className="text-slate-500">{t('sumOfVariants')}</span>
                          <span className={cn("font-mono font-bold", variantTotal !== selectedProduct.computedStock ? 'text-amber-600' : 'text-slate-700 dark:text-slate-300')}>
                            {variantTotal}{variantTotal !== selectedProduct.computedStock ? ` (${t('totalShownAbove', { count: selectedProduct.computedStock })})` : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div className="space-y-3">
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white uppercase tracking-wider">{t('pricingInfo')}</h4>
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-slate-500 mb-1">{t('costPriceLabel')}</p>
                      <p className="font-bold font-mono text-slate-500">₹{selectedProduct.costPrice || 0}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 mb-1">{t('wholesalePrice')}</p>
                      <p className="font-bold font-mono">₹{selectedProduct.wholesaleCost || 0}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 mb-1">{t('retailPrice')}</p>
                      <p className="font-bold font-mono text-emerald-600">₹{selectedProduct.sellingPrice || 0}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 mb-1">MRP</p>
                      <p className="font-bold font-mono line-through text-slate-400">₹{selectedProduct.mrp || 0}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 mb-1">{t('purchasePercent')}</p>
                      <p className="font-bold font-mono text-amber-500">
                        {selectedProduct.costPriceMode === 'mrp_based' && selectedProduct.purchaseDiscountPercent != null
                          ? `${selectedProduct.purchaseDiscountPercent}%` : '—'}
                      </p>
                    </div>
                    <div className="col-span-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <p className="text-slate-500 mb-1">{t('marginRetailVsCost')}</p>
                      <p className="font-bold font-mono text-blue-500">
                        {(() => {
                          const cost = selectedProduct.costPrice || selectedProduct.wholesaleCost || 0;
                          const sell = selectedProduct.sellingPrice || 0;
                          return sell > 0 ? (((sell - cost) / sell) * 100).toFixed(1) : '0';
                        })()}%
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white uppercase tracking-wider">{t('stockByWarehouse')}</h4>
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2">
                    {(() => {
                      const warehouseRows = (data.warehouses || [])
                        .map((w: any) => ({ w, item: (w.inventory || []).find((i: any) => i.productId === selectedProduct.id) }))
                        .filter(({ item }: any) => item && item.quantity > 0);
                      const warehouseSum = warehouseRows.reduce((s: number, { item }: any) => s + item.quantity, 0);
                      // Purchases don't require a warehouse (see purchases/route.ts),
                      // so a product's tracked warehouse rows can legitimately fall
                      // short of its real total (computedStock, now = currentStock —
                      // see the comment above where computedStock is derived). Show
                      // the gap explicitly instead of letting this list silently
                      // under-represent the stock the header stat cards show.
                      const unassigned = Math.max(0, (selectedProduct.computedStock || 0) - warehouseSum);
                      const costRef = selectedProduct.costPrice || selectedProduct.wholesaleCost || selectedProduct.sellingPrice || 0;
                      if (warehouseRows.length === 0 && unassigned <= 0) {
                        return <p className="text-sm text-slate-500 text-center py-2">{t('noStockAvailable')}</p>;
                      }
                      return <>
                        {warehouseRows.map(({ w, item }: any) => (
                          <div key={w.id} className="flex justify-between items-center text-sm border-b border-slate-100 dark:border-slate-800 pb-2 last:pb-0 last:border-0">
                            <div>
                              <p className="font-bold text-slate-800 dark:text-slate-200">{w.name}</p>
                              {w.location && <p className="text-xs text-slate-500">{w.location}</p>}
                            </div>
                            <div className="text-right">
                              <p className="font-mono font-bold text-emerald-600">{item.quantity} {selectedProduct.baseUnit || 'Unit'}</p>
                              <p className="text-xs text-slate-500 font-mono">₹{(item.quantity * costRef).toLocaleString('en-IN')}</p>
                            </div>
                          </div>
                        ))}
                        {unassigned > 0 && (
                          <div className="flex justify-between items-center text-sm border-b border-slate-100 dark:border-slate-800 pb-2 last:pb-0 last:border-0">
                            <div>
                              <p className="font-bold text-slate-800 dark:text-slate-200">{t('notAssignedWarehouse')}</p>
                              <p className="text-xs text-slate-500">{t('stockWithoutWarehouse')}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-mono font-bold text-amber-600">{unassigned} {selectedProduct.baseUnit || 'Unit'}</p>
                              <p className="text-xs text-slate-500 font-mono">₹{(unassigned * costRef).toLocaleString('en-IN')}</p>
                            </div>
                          </div>
                        )}
                      </>;
                    })()}
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white uppercase tracking-wider">{t('aiInsight')}</h4>
                  <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg p-4 flex gap-3">
                    <Info className="text-blue-500 shrink-0 mt-0.5" size={18} />
                    <div>
                      <p className="text-sm text-blue-900 dark:text-blue-100 font-medium">{t('purchaseSuggestion')}</p>
                      <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                        {selectedProduct.computedStock <= (selectedProduct.minStock||0)
                          ? t('stockCriticallyLow', { qty: Math.max(50, (selectedProduct.minStock||10)*3), unit: selectedProduct.baseUnit })
                          : t('stockHealthy')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'ledger' && (
              <div className="animate-in fade-in duration-200">
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {selectedProduct.movements && selectedProduct.movements.length > 0 ? selectedProduct.movements.map((m:any) => (
                    <div key={m.id} className="py-3 flex items-start gap-3">
                      <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", 
                        m.type === 'purchase' || m.type === 'transfer_in' ? 'bg-emerald-100 text-emerald-600' : 
                        m.type === 'sale' || m.type === 'transfer_out' ? 'bg-blue-100 text-blue-600' : 'bg-slate-200 text-slate-600'
                      )}>
                        {m.type === 'purchase' || m.type === 'transfer_in' ? <ArrowRightLeft size={14} className="rotate-90" /> : <TrendingDown size={14} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold capitalize text-slate-900 dark:text-white">{m.type.replace('_', ' ')}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{new Date(m.created_at).toLocaleString()}</p>
                        {m.note && <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 truncate">{m.note}</p>}
                      </div>
                      <div className="text-right">
                        <p className={cn("text-sm font-bold font-mono", m.type === 'purchase' || m.type === 'transfer_in' ? 'text-emerald-600' : 'text-slate-700 dark:text-slate-300')}>
                          {m.type === 'purchase' || m.type === 'transfer_in' ? '+' : '-'}{m.quantity}
                        </p>
                      </div>
                    </div>
                  )) : (
                    <p className="text-center text-sm text-slate-500 py-10">{t('noRecentTransactions')}</p>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'batches' && (
              <div className="animate-in fade-in duration-200">
                <div className="space-y-3">
                  {selectedProduct.batches && selectedProduct.batches.length > 0 ? selectedProduct.batches.map((b:any) => (
                    <div key={b.id} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-bold text-sm text-slate-900 dark:text-white">{t('batchLabel', { number: b.batchNumber || b.barcode || 'N/A' })}</p>
                          <p className="text-xs text-slate-500">{t('expLabel', { date: b.expiryDate ? new Date(b.expiryDate).toLocaleDateString() : 'N/A' })}</p>
                        </div>
                        <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-1 rounded">{t('qtyLabel', { qty: `${b.quantity}${b.initialQuantity != null ? ` / ${b.initialQuantity}` : ''}` })}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs pt-2 mt-2 border-t border-slate-200 dark:border-slate-700">
                        <div>
                          <p className="text-slate-500">{t('costLabel')}</p>
                          <p className="font-mono font-bold text-slate-700 dark:text-slate-300">{b.costPrice != null ? `₹${Number(b.costPrice).toLocaleString('en-IN')}` : '—'}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">{t('sellLabel')}</p>
                          <p className="font-mono font-bold text-emerald-700 dark:text-emerald-400">{b.sellingPrice != null ? `₹${Number(b.sellingPrice).toLocaleString('en-IN')}` : '—'}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">{t('purchasedLabel')}</p>
                          <p className="font-mono text-slate-600 dark:text-slate-400">{(b.purchaseDate || b.createdAt) ? new Date(b.purchaseDate || b.createdAt).toLocaleDateString('en-IN') : '—'}</p>
                        </div>
                      </div>
                    </div>
                  )) : (
                    <p className="text-center text-sm text-slate-500 py-10">{t('noActiveBatches')}</p>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'profit' && (
               <ProfitabilityTab product={selectedProduct} t={t} />
            )}
          </div>
          
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
             <button onClick={() => setShowBarcodeModal(true)} className="w-full py-2.5 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 transition-colors text-sm shadow-sm flex items-center justify-center gap-2">
               <Printer size={16} /> {t('printBarcode')}
             </button>
          </div>
        </div>
        </div>
      )}

      {/* Slide-over Action Modals overlay */}
      {actionModal === 'receive' && (
        <ReceiveDrawer
          product={selectedProduct}
          products={products}
          godowns={data.warehouses}
          onClose={() => setActionModal(null)}
          onSuccess={() => { handleDataRefresh(); setActionModal(null); }}
        />
      )}
      {actionModal === 'transfer' && selectedProduct && (
        <TransferDrawer 
          product={selectedProduct} 
          godowns={data.warehouses} 
          onClose={() => setActionModal(null)} 
          onSuccess={() => { handleDataRefresh(); setActionModal(null); }} 
        />
      )}
      
      {actionModal === 'adjust' && selectedProduct && (
        <AdjustDrawer 
          product={selectedProduct} 
          godowns={data.warehouses} 
          onClose={() => setActionModal(null)} 
          onSuccess={() => { handleDataRefresh(); setActionModal(null); }} 
        />
      )}

      {/* Barcode/QR Modal */}
      {showBarcodeModal && selectedProduct && (
        <BarcodeQRModal
          product={{
            ...selectedProduct,
            stock: selectedProduct.currentStock ?? selectedProduct.stock,
          }}
          isWholesale
          onClose={() => setShowBarcodeModal(false)}
        />
      )}

      {showScanner && (
        <CameraScanner
          onScan={(res: string) => { setSearch(res); setShowScanner(false); }}
          onClose={() => setShowScanner(false)}
        />
      )}

      <ConfirmPasswordModal
        open={!!deleteTarget}
        itemLabel="product"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <ConfirmPasswordModal
        open={confirmBulkDelete}
        itemLabel="product"
        itemCount={selectedStockIds.size}
        onConfirm={handleBulkDeleteStock}
        onCancel={() => setConfirmBulkDelete(false)}
      />
    </div>
  );
}
