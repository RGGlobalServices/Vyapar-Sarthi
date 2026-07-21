'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  Box, Package, Archive, AlertTriangle, Search, Loader2, ArrowRightLeft, 
  TrendingDown, Clock, CheckCircle, X, Filter, Download, Printer, 
  Plus, Edit, Eye, AlertOctagon, Info, BarChart3, TrendingUp
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import useSWR, { useSWRConfig } from 'swr';
import { useTranslations } from 'next-intl';
import TransferDrawer from './TransferDrawer';
import AdjustDrawer from './AdjustDrawer';
import ReceiveDrawer from './ReceiveDrawer';
import BarcodeQRModal from '@/components/BarcodeQRModal';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

function ProfitabilityTab({ product }: { product: any }) {
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
    const costPrice = product.wholesaleCost || 0;
    
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
        <h3 className="font-bold text-slate-900 dark:text-white">Profit Analytics</h3>
        <select 
          value={period}
          onChange={(e) => setPeriod(Number(e.target.value))}
          className="text-xs bg-slate-100 dark:bg-slate-800 border-none rounded-lg px-2 py-1 outline-none text-slate-600 dark:text-slate-300 font-bold"
        >
          <option value={7}>Last 7 Days</option>
          <option value={30}>Last 30 Days</option>
          <option value={90}>Last 90 Days</option>
        </select>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 p-3 rounded-xl shadow-sm">
          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-black uppercase tracking-wider mb-1">Gross Profit</p>
          <p className="text-xl font-black text-emerald-700 dark:text-emerald-300">₹{stats.grossProfit.toLocaleString('en-IN')}</p>
          <p className="text-[10px] text-emerald-600/80 mt-1 font-bold">{stats.margin.toFixed(1)}% Margin</p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 p-3 rounded-xl shadow-sm">
          <p className="text-[10px] text-blue-600 dark:text-blue-400 font-black uppercase tracking-wider mb-1">Revenue</p>
          <p className="text-xl font-black text-blue-700 dark:text-blue-300">₹{stats.totalRevenue.toLocaleString('en-IN')}</p>
          <p className="text-[10px] text-blue-600/80 mt-1 font-bold">{stats.totalUnitsSold} units sold</p>
        </div>
      </div>
      
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-4">Sales Trend</p>
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
             No sales data for this period
           </div>
        )}
      </div>

      <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg p-3 flex gap-3 shadow-sm">
        <TrendingUp className="text-amber-500 shrink-0 mt-0.5" size={18} />
        <div>
          <p className="text-sm text-amber-900 dark:text-amber-100 font-bold">Velocity Insight</p>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-1 leading-relaxed">
            Selling <span className="font-bold">{stats.totalUnitsSold > 0 ? (stats.totalUnitsSold / period).toFixed(1) : 0} units/day</span> on average. 
            At this rate, current stock ({product.computedStock}) will last approx <span className="font-bold">{stats.totalUnitsSold > 0 ? Math.ceil(product.computedStock / (stats.totalUnitsSold / period)) : '∞'} days</span>.
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
  
  const { mutate: globalMutate } = useSWRConfig();

  // Selected State
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('overview'); // overview, ledger, batches, profitability
  
  // Action Modals
  const [actionModal, setActionModal] = useState<string | null>(null); // 'receive', 'transfer', 'adjust'
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);

  const { activeShopId } = useBusinessStore();
  const { data: products = [], isLoading: pLoad, isValidating: pValid, mutate: mutateProducts } = useSWR(activeShopId ? ['/products', activeShopId] : null, fetcher);
  const { data: batches = [], isLoading: bLoad, isValidating: bValid, mutate: mutateBatches } = useSWR(null, safeFetcher); // Mock for now
  const { data: godowns = [], isLoading: gLoad, isValidating: gValid, mutate: mutateGodowns } = useSWR(activeShopId ? ['/godowns', activeShopId] : null, godownsFetcher);
  const { data: movements = [], isLoading: mLoad, isValidating: mValid, mutate: mutateMovements } = useSWR(activeShopId ? ['/stock/movements', activeShopId] : null, safeFetcher);
  
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
          computedValue: ((prev.computedStock || 0) + qtyChange) * (prev.wholesaleCost || prev.sellingPrice || 0)
        }));
      }

      // Delay the background revalidation slightly so React has time to render the optimistic data
      setTimeout(() => {
        mutateProducts();
        mutateGodowns();
        mutateMovements();
        globalMutate(key => typeof key === 'string' && key.startsWith('/reports/dashboard'));
      }, 500);
    } else {
      mutateProducts();
      mutateGodowns();
      mutateMovements();
      globalMutate(key => typeof key === 'string' && key.startsWith('/reports/dashboard'));
    }
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

    const items = (products || []).map((p: any) => {
      // 1. Dynamically compute true global stock from warehouses first
      let warehouseQty = 0;
      let hasWarehouseData = false;
      if (godowns && godowns.length > 0) {
        godowns.forEach((g: any) => {
          // If a specific warehouse is selected, ONLY count its inventory
          if (warehouseFilter !== 'all' && g.id !== warehouseFilter) {
            return;
          }
          if (g.inventory) {
            const item = g.inventory.find((i: any) => i.productId === p.id);
            if (item && typeof item.quantity === 'number') {
              warehouseQty += item.quantity;
              hasWarehouseData = true;
            }
          }
        });
      }

      // 2. Fallbacks
      const productBatches = (batches || []).filter((b: any) => b.productId === p.id);
      const rawQty = hasWarehouseData 
        ? warehouseQty 
        : (productBatches.length > 0 ? productBatches.reduce((sum: number, b: any) => sum + (b.quantity || b.currentStock || 0), 0) : (p.currentStock || 0));

      const qty = Math.max(0, rawQty); // Cap at 0 for display
      const isOutOfStock = rawQty <= 0;

      const price = p.wholesaleCost || p.sellingPrice || 0;
      const val = qty * price;
      totalValue += val;
      totalUnits += qty;
      
      if (qty > 0 && qty <= (p.minStock || 0)) lowStockCount++;
      if (p.category) categories.add(p.category);
      
      // Heuristic Dead Stock (0 movements in 30 days)
      const productMovements = (movements || []).filter((m:any) => m.product_id === p.id);
      if (qty > 0 && productMovements.length === 0) deadStockCount++;

      return { ...p, computedStock: qty, computedValue: val, batches: productBatches, movements: productMovements };
    });

    return { 
      items, totalValue, totalUnits, lowStockCount, 
      expiredCount, deadStockCount, 
      categories: Array.from(categories),
      warehouses: godowns || []
    };
  }, [products, batches, godowns, movements, warehouseFilter]);

  // Sync selectedProduct with updated data when mutations happen
  useEffect(() => {
    if (selectedProduct && data?.items) {
      const updated = data.items.find((i: any) => i.id === selectedProduct.id);
      if (updated && JSON.stringify(updated) !== JSON.stringify(selectedProduct)) {
        setSelectedProduct(updated);
      }
    }
  }, [data?.items]);

  if (!mounted) {
    return null; // Prevent hydration mismatch
  }



  const filteredItems = (data?.items || []).filter((i: any) => {
    const matchesSearch = !search || i.name.toLowerCase().includes(search.toLowerCase()) || (i.sku && i.sku.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = categoryFilter === 'all' || i.category === categoryFilter;
    // If a specific warehouse is filtered, only show products that have stock > 0 in that warehouse
    const matchesWarehouse = warehouseFilter === 'all' || i.computedStock > 0;
    
    let matchesStatus = true;
    if (statusFilter === 'low') matchesStatus = i.computedStock > 0 && i.computedStock <= (i.minStock || 0);
    if (statusFilter === 'out') matchesStatus = i.computedStock <= 0;
    if (statusFilter === 'ok') matchesStatus = i.computedStock > (i.minStock || 0);
    
    return matchesSearch && matchesCategory && matchesWarehouse && matchesStatus;
  });

  const exportExcel = () => {
    if (!filteredItems || filteredItems.length === 0) {
      alert("No items to export");
      return;
    }

    const headers = ['Product Name', 'Category', 'Barcode', 'Current Stock', 'Unit', 'Purchase Price (INR)', 'Stock Value (INR)', 'Status'];
    
    const rows = filteredItems.map((item: any) => {
      let status = 'In Stock';
      if (item.computedStock <= 0) status = 'Out of Stock';
      else if (item.computedStock <= (item.minStock || 0)) status = 'Low Stock';

      return [
        `"${(item.name || '').replace(/"/g, '""')}"`,
        `"${(item.category || '').replace(/"/g, '""')}"`,
        `"${(item.barcode || item.sku || '').replace(/"/g, '""')}"`,
        item.computedStock,
        `"${(item.baseUnit || '').replace(/"/g, '""')}"`,
        item.wholesaleCost || 0,
        item.computedValue || 0,
        `"${status}"`
      ].join(',');
    });

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
      
      {/* Main Content Area */}
      <div className={cn("flex-1 overflow-y-auto lg:pr-2 custom-scrollbar transition-all duration-300 pb-10", selectedProduct ? 'hidden lg:block' : 'w-full')}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-emerald-500 flex items-center gap-3">
              <Box className="text-emerald-500" /> {t('inventoryDashboard')}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('inventoryDesc')}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => {
              if (!selectedProduct) { alert('Please select a product from the table first.'); return; }
              setActionModal('receive');
            }} className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 transition-colors shadow-sm text-sm">
              <Plus size={16} /> {t('receiveStock')}
            </button>
            <button onClick={() => {
              if (!selectedProduct) { alert('Please select a product from the table first.'); return; }
              setActionModal('transfer');
            }} className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white font-bold rounded-xl hover:bg-blue-600 transition-colors shadow-sm text-sm">
              <ArrowRightLeft size={16} /> {t('transferStock')}
            </button>
            <button onClick={() => {
              if (!selectedProduct) { alert('Please select a product from the table first.'); return; }
              setActionModal('adjust');
            }} className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-700 transition-colors shadow-sm text-sm">
              <Edit size={16} /> {t('adjustStock')}
            </button>
          </div>
        </div>

        {/* Analytics Widgets */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
          {loading && (!data || data.items.length === 0) ? (
            Array(5).fill(0).map((_, i) => (
              <Card key={i} className={`bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm ${i === 4 ? 'col-span-2 md:col-span-1' : ''}`}>
                <CardContent className="p-4">
                  <div className="h-3 w-16 bg-slate-200 dark:bg-slate-800 rounded mb-3 animate-pulse" />
                  <div className="h-6 w-24 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
                </CardContent>
              </Card>
            ))
          ) : (
            <>
              <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
                <CardContent className="p-4">
                  <p className="text-slate-500 dark:text-slate-400 text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2"><CheckCircle size={14}/> {t('available')}</p>
                  <p className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400">{data?.totalUnits?.toLocaleString('en-IN')}</p>
                </CardContent>
              </Card>
              <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
                <CardContent className="p-4">
                  <p className="text-slate-500 dark:text-slate-400 text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2"><AlertTriangle size={14}/> {t('lowStock')}</p>
                  <p className="text-xl sm:text-2xl font-bold text-amber-500 dark:text-amber-400">{data?.lowStockCount}</p>
                </CardContent>
              </Card>
              <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
                <CardContent className="p-4">
                  <p className="text-slate-500 dark:text-slate-400 text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2"><AlertOctagon size={14}/> {t('outOfStock')}</p>
                  <p className="text-xl sm:text-2xl font-bold text-rose-600 dark:text-rose-400">{filteredItems.filter((i:any) => i.computedStock <= 0).length}</p>
                </CardContent>
              </Card>
              <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
                <CardContent className="p-4">
                  <p className="text-slate-500 dark:text-slate-400 text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2"><Archive size={14}/> {t('deadStock')}</p>
                  <p className="text-xl sm:text-2xl font-bold text-slate-600 dark:text-slate-400">{data?.deadStockCount}</p>
                </CardContent>
              </Card>
              <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm col-span-2 md:col-span-1">
                <CardContent className="p-4">
                  <p className="text-slate-500 dark:text-slate-400 text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2"><TrendingUp size={14}/> {t('stockValue')}</p>
                  <p 
                    className="text-lg xl:text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono tracking-tighter truncate"
                    title={`₹${(data?.totalValue || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                  >
                    ₹{(data?.totalValue || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Filters and Table */}
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
            <div className="flex flex-col lg:flex-row gap-3">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:ring-2 focus:ring-emerald-500 transition-colors shadow-sm"
                  placeholder={t('searchPlaceholder')} 
                  value={search} 
                  onChange={e => setSearch(e.target.value)} 
                />
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0 hide-scrollbar">
                <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-300 min-w-[130px]">
                  <option value="all">{t('allCategories')}</option>
                  {data?.categories.map((c:string) => <option key={c} value={c}>{c}</option>)}
                </select>
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
                  <Download size={14} /> Export
                </button>
              </div>
            </div>
          </div>
          
          <div className="overflow-x-auto w-full custom-scrollbar relative">

            <table className="w-full min-w-[800px] text-left text-sm text-slate-600 dark:text-slate-300 relative">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 text-xs uppercase font-medium sticky top-0 backdrop-blur-md z-10 shadow-sm border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                <tr>
                  <th className="px-4 py-3">{t('colProduct')}</th>
                  <th className="px-4 py-3">{t('barcode')}</th>
                  <th className="px-4 py-3 text-right">{t('colCurrentStock')}</th>
                  <th className="px-4 py-3 text-right">{t('purchasePrice')}</th>
                  <th className="px-4 py-3 text-right">{t('stockValue')}</th>
                  <th className="px-4 py-3 text-center">{t('colStatus')}</th>
                  <th className="px-4 py-3 text-right">{t('colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading && (!data || data.items.length === 0) ? (
                  Array(5).fill(0).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-4 py-4"><div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 rounded" /></td>
                      <td className="px-4 py-4"><div className="h-4 w-20 bg-slate-200 dark:bg-slate-800 rounded" /></td>
                      <td className="px-4 py-4"><div className="h-4 w-16 bg-slate-200 dark:bg-slate-800 rounded ml-auto" /></td>
                      <td className="px-4 py-4"><div className="h-4 w-20 bg-slate-200 dark:bg-slate-800 rounded ml-auto" /></td>
                      <td className="px-4 py-4"><div className="h-4 w-24 bg-slate-200 dark:bg-slate-800 rounded ml-auto" /></td>
                      <td className="px-4 py-4"><div className="h-4 w-12 bg-slate-200 dark:bg-slate-800 rounded mx-auto" /></td>
                      <td className="px-4 py-4"><div className="h-4 w-8 bg-slate-200 dark:bg-slate-800 rounded ml-auto" /></td>
                    </tr>
                  ))
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                      {t('noItems')}
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item: any) => (
                    <tr 
                      key={item.id} 
                      onClick={() => setSelectedProduct(item)}
                      className={cn(
                        "hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer",
                        selectedProduct?.id === item.id && "bg-emerald-50 dark:bg-emerald-500/10 border-l-2 border-emerald-500"
                      )}
                    >
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                        {item.name}
                        <div className="text-xs text-slate-500 font-normal">{item.category || '-'}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">{item.barcode || item.sku || '-'}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {item.computedStock} <span className="text-xs text-slate-500 font-normal ml-1">{item.baseUnit}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono whitespace-nowrap">₹{(item.wholesaleCost || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        ₹{(item.computedValue || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {item.computedStock <= 0 ? (
                          <span className="inline-flex px-1.5 py-0.5 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-[10px] font-bold rounded uppercase border border-red-200 dark:border-red-500/30">Out</span>
                        ) : item.computedStock <= (item.minStock || 0) ? (
                          <span className="inline-flex px-1.5 py-0.5 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-bold rounded uppercase border border-amber-200 dark:border-amber-500/30">Low</span>
                        ) : (
                          <span className="inline-flex px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold rounded uppercase border border-emerald-200 dark:border-emerald-500/30">OK</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button className="p-1.5 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/20 rounded-lg transition-colors">
                          <Eye size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Slide-out Detailed Panel */}
      {selectedProduct && (
        <div className="w-full lg:w-1/3 bg-white dark:bg-slate-900 lg:border border-slate-200 dark:border-slate-800 lg:rounded-xl shadow-xl flex flex-col transition-all animate-in slide-in-from-right-4 duration-300 h-full max-h-full z-20">
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-start bg-slate-50/50 dark:bg-slate-900">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{selectedProduct.name}</h2>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded">{selectedProduct.category || 'Uncategorized'}</span>
                <span>{selectedProduct.barcode || selectedProduct.sku}</span>
              </div>
            </div>
            <button onClick={() => setSelectedProduct(null)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="flex border-b border-slate-200 dark:border-slate-800 px-2 pt-2 bg-slate-50/50 dark:bg-slate-900">
            {[
              { id: 'overview', label: 'Overview', icon: Info },
              { id: 'ledger', label: 'Ledger', icon: ArrowRightLeft },
              { id: 'batches', label: 'Batches', icon: Package },
              { id: 'profit', label: 'Profitability', icon: BarChart3 }
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
                    <span className="text-[10px] font-bold uppercase tracking-wider">Receive</span>
                  </button>
                  <button onClick={() => setActionModal('transfer')} className="flex flex-col items-center justify-center gap-1.5 p-3 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors border border-blue-200 dark:border-blue-500/30">
                    <ArrowRightLeft size={18} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Transfer</span>
                  </button>
                  <button onClick={() => setActionModal('adjust')} className="flex flex-col items-center justify-center gap-1.5 p-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700">
                    <Edit size={18} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Adjust</span>
                  </button>
                </div>

                <div className="space-y-3">
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white uppercase tracking-wider">Unified Stock Ledger</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 text-center shadow-sm">
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold mb-1">Current</p>
                      <p className="text-xl font-bold text-slate-900 dark:text-white">{selectedProduct.computedStock}</p>
                    </div>
                    <div className="bg-emerald-50 dark:bg-emerald-500/10 p-3 rounded-lg border border-emerald-200 dark:border-emerald-500/30 text-center shadow-sm">
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase tracking-wider font-bold mb-1">Available</p>
                      <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">{selectedProduct.computedStock}</p>
                    </div>
                    <div className="bg-amber-50 dark:bg-amber-500/10 p-3 rounded-lg border border-amber-200 dark:border-amber-500/30 text-center shadow-sm">
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 uppercase tracking-wider font-bold mb-1">Reserved</p>
                      <p className="text-xl font-bold text-amber-700 dark:text-amber-300">0</p>
                    </div>
                    <div className="bg-rose-50 dark:bg-rose-500/10 p-3 rounded-lg border border-rose-200 dark:border-rose-500/30 text-center shadow-sm">
                      <p className="text-[10px] text-rose-600 dark:text-rose-400 uppercase tracking-wider font-bold mb-1">Damaged/Exp</p>
                      <p className="text-xl font-bold text-rose-700 dark:text-rose-300">0</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white uppercase tracking-wider">Pricing Info</h4>
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-slate-500 mb-1">Purchase Price</p>
                      <p className="font-bold font-mono">₹{selectedProduct.wholesaleCost || 0}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 mb-1">Selling Price</p>
                      <p className="font-bold font-mono text-emerald-600">₹{selectedProduct.sellingPrice || 0}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 mb-1">MRP</p>
                      <p className="font-bold font-mono line-through text-slate-400">₹{selectedProduct.mrp || 0}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 mb-1">Margin</p>
                      <p className="font-bold font-mono text-blue-500">
                        {selectedProduct.sellingPrice > 0 ? (((selectedProduct.sellingPrice - (selectedProduct.wholesaleCost||0)) / selectedProduct.sellingPrice) * 100).toFixed(1) : 0}%
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white uppercase tracking-wider">Stock by Warehouse</h4>
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2">
                    {data.warehouses && data.warehouses.some((w: any) => (w.inventory || []).some((i: any) => i.productId === selectedProduct.id && i.quantity > 0)) ? (
                      data.warehouses.map((w: any) => {
                        const item = (w.inventory || []).find((i: any) => i.productId === selectedProduct.id);
                        if (!item || item.quantity <= 0) return null;
                        const val = item.quantity * (selectedProduct.wholesaleCost || selectedProduct.sellingPrice || 0);
                        return (
                          <div key={w.id} className="flex justify-between items-center text-sm border-b border-slate-100 dark:border-slate-800 pb-2 last:pb-0 last:border-0">
                            <div>
                              <p className="font-bold text-slate-800 dark:text-slate-200">{w.name}</p>
                              {w.location && <p className="text-xs text-slate-500">{w.location}</p>}
                            </div>
                            <div className="text-right">
                              <p className="font-mono font-bold text-emerald-600">{item.quantity} {selectedProduct.baseUnit || 'Unit'}</p>
                              <p className="text-xs text-slate-500 font-mono">₹{val.toLocaleString('en-IN')}</p>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      selectedProduct.computedStock > 0 ? (
                        <div className="flex justify-between items-center text-sm">
                          <p className="font-bold text-slate-800 dark:text-slate-200">Main Store</p>
                          <div className="text-right">
                            <p className="font-mono font-bold text-emerald-600">{selectedProduct.computedStock} {selectedProduct.baseUnit || 'Unit'}</p>
                            <p className="text-xs text-slate-500 font-mono">₹{selectedProduct.computedValue?.toLocaleString('en-IN')}</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500 text-center py-2">No stock available</p>
                      )
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white uppercase tracking-wider">AI Insight</h4>
                  <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg p-4 flex gap-3">
                    <Info className="text-blue-500 shrink-0 mt-0.5" size={18} />
                    <div>
                      <p className="text-sm text-blue-900 dark:text-blue-100 font-medium">Purchase Suggestion</p>
                      <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                        {selectedProduct.computedStock <= (selectedProduct.minStock||0) 
                          ? `Stock is critically low. Consider ordering ${Math.max(50, (selectedProduct.minStock||10)*3)} ${selectedProduct.baseUnit} from Supplier to avoid stockout.`
                          : 'Stock levels are healthy. No immediate purchase required.'}
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
                    <p className="text-center text-sm text-slate-500 py-10">No recent transactions found.</p>
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
                          <p className="font-bold text-sm text-slate-900 dark:text-white">Batch #{b.batchNumber || 'N/A'}</p>
                          <p className="text-xs text-slate-500">Exp: {b.expiryDate ? new Date(b.expiryDate).toLocaleDateString() : 'N/A'}</p>
                        </div>
                        <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-1 rounded">Qty: {b.quantity}</span>
                      </div>
                    </div>
                  )) : (
                    <p className="text-center text-sm text-slate-500 py-10">No active batches for this product.</p>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'profit' && (
               <ProfitabilityTab product={selectedProduct} />
            )}
          </div>
          
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
             <button onClick={() => setShowBarcodeModal(true)} className="w-full py-2.5 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 transition-colors text-sm shadow-sm flex items-center justify-center gap-2">
               <Printer size={16} /> {t('printBarcode')}
             </button>
          </div>
        </div>
      )}

      {/* Slide-over Action Modals overlay */}
      {actionModal === 'receive' && selectedProduct && (
        <ReceiveDrawer 
          product={selectedProduct} 
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
          product={selectedProduct} 
          onClose={() => setShowBarcodeModal(false)} 
        />
      )}
    </div>
  );
}
