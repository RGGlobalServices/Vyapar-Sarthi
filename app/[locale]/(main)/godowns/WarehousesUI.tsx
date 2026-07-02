'use client';

import { useTranslations } from 'next-intl';
import { useState, useEffect } from 'react';
import { Warehouse, Plus, ArrowRightLeft, Search, Loader2, Package, Hash, MapPin, TrendingDown, Clock, AlertTriangle, ArrowRight, X, Download, SlidersHorizontal, CheckCircle2, History } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import AdjustDrawer from '../stock/AdjustDrawer';
import { useBusinessStore } from '@/lib/businessStore';
import { getBusinessConfig } from '@/lib/businessConfig';

const fetcher = (url: string) => api.get(url).then(res => res.data?.data || res.data);

const inp = 'w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors shadow-sm';

export default function WarehousesUI() {
  const t = useTranslations('Godowns');
  const router = useRouter();
  const { profile } = useBusinessStore();
  const config = getBusinessConfig(profile.businessType);
  const { data: warehouses = [], mutate: mutateWarehouses, isLoading: loading } = useSWR('/godowns', fetcher);
  const [selected, setSelected] = useState<any | null>(null);
  
  // Modals
  const [modal, setModal] = useState<'new' | 'transfer' | 'adjust' | null>(null);
  const [form, setForm] = useState({ name: '', location: '' });
  const [saving, setSaving] = useState(false);
  const [adjustProduct, setAdjustProduct] = useState<any>(null);
  
  // Transfer form
  const [transfer, setTransfer] = useState({ fromId: '', toId: '', productId: '', qty: '' });
  const [transferring, setTransferring] = useState(false);
  
  // Filters
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterStatus, setFilterStatus] = useState(''); // 'low', 'out', 'expired'
  
  // Movements
  const { data: movements = [], mutate: mutateMovements, isLoading: loadingMovements } = useSWR(
    selected ? `/godowns/${selected.id}/movements` : null,
    fetcher
  );

  // Toast
  const [toastMessage, setToastMessage] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await api.post('/godowns', form);
      setModal(null);
      setForm({ name: '', location: '' });
      mutateWarehouses();
    } catch (err) {
      alert('Failed to save warehouse');
    } finally {
      setSaving(false);
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transfer.fromId || !transfer.toId || !transfer.productId || !transfer.qty) return;
    if (transfer.fromId === transfer.toId) return alert('Cannot transfer to same warehouse');
    
    setTransferring(true);
    try {
      await api.post(`/godowns/transfer`, {
        fromGodownId: transfer.fromId,
        toGodownId: transfer.toId,
        productId: transfer.productId,
        quantity: transfer.qty
      });
      setModal(null);
      setTransfer({ fromId: '', toId: '', productId: '', qty: '' });
      mutateWarehouses();
      mutateMovements();
      showToast('Stock transferred successfully!');
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Transfer failed.');
    } finally {
      setTransferring(false);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const isExpiringSoon = (expiryDate?: string) => {
    if (!expiryDate) return false;
    const expiry = new Date(expiryDate);
    const today = new Date();
    const diffTime = Math.abs(expiry.getTime() - today.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    return diffDays <= 30 && expiry > today;
  };

  const isExpired = (expiryDate?: string) => {
    if (!expiryDate) return false;
    const expiry = new Date(expiryDate);
    const today = new Date();
    return expiry < today;
  };

  const calculateStats = (warehouse: any) => {
    const inventory = warehouse.inventory || [];
    const totalProducts = inventory.length;
    const totalUnits = inventory.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0);
    const stockValue = inventory.reduce((sum: number, item: any) => {
      const price = item.product?.wholesaleCost || item.product?.sellingPrice || 0;
      return sum + ((item.quantity || 0) * price);
    }, 0);
    const lowStock = inventory.filter((item: any) => item.quantity > 0 && item.quantity <= (item.product?.minStock || 0)).length;
    const outOfStock = inventory.filter((item: any) => item.quantity <= 0).length;
    const expiring = inventory.filter((item: any) => isExpiringSoon(item.product?.expiryDate) || isExpired(item.product?.expiryDate)).length;
    
    let lastUpdated = warehouse.createdAt;
    if (inventory.length > 0) {
       const latest = inventory.reduce((latest: any, item: any) => {
         return new Date(item.updatedAt) > new Date(latest) ? item.updatedAt : latest;
       }, inventory[0].updatedAt);
       lastUpdated = latest;
    }

    return { totalProducts, totalUnits, stockValue, lowStock, outOfStock, expiring, lastUpdated };
  };

  if (loading && warehouses.length === 0) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>;
  }

  if (selected) {
    const stats = calculateStats(selected);
    
    // Extract unique categories and brands for filters
    const inventoryCategories = (selected.inventory || []).map((i: any) => i.product?.category).filter(Boolean);
    const categories = Array.from(new Set([...(config.defaultCategories || []), ...inventoryCategories]));
    const brands = Array.from(new Set(warehouses.flatMap((w: any) => (w.inventory || []).map((i: any) => i.product?.brand)).filter(Boolean)));

    const filteredInventory = (selected.inventory || []).filter((i: any) => {
      if (search && !i.product?.name?.toLowerCase().includes(search.toLowerCase()) && !i.product?.barcode?.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterCategory && i.product?.category !== filterCategory) return false;
      if (filterBrand && i.product?.brand !== filterBrand) return false;
      
      if (filterStatus === 'low') return i.quantity > 0 && i.quantity <= (i.product?.minStock || 0);
      if (filterStatus === 'out') return i.quantity <= 0;
      if (filterStatus === 'expired') return isExpired(i.product?.expiryDate);
      
      return true;
    });

    const handleExport = () => {
      if (filteredInventory.length === 0) {
        showToast(t('noProductsFound') || 'No products to export');
        return;
      }

      const headers = ['Product', 'SKU / Batch', 'Category', 'Brand', 'Cost', 'Selling', 'Quantity', 'Unit', 'Status'];
      
      const rows = filteredInventory.map((i: any) => {
        const p = i.product || {};
        const isOut = i.quantity <= 0;
        const isLow = i.quantity > 0 && i.quantity <= (p.minStock || 0);
        const expired = isExpired(p.expiryDate);
        const status = isOut ? 'Out of Stock' : isLow ? 'Low Stock' : expired ? 'Expired' : 'In Stock';
        
        return [
          `"${p.name?.replace(/"/g, '""') || ''}"`,
          `"${p.barcode || p.sku || ''}"`,
          `"${p.category || ''}"`,
          `"${p.brand || ''}"`,
          p.wholesaleCost || p.sellingPrice || 0,
          p.sellingPrice || 0,
          i.quantity || 0,
          `"${p.baseUnit || ''}"`,
          status
        ].join(',');
      });

      const csvContent = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `${selected.name}_Inventory_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    return (
      <div className="space-y-6 max-w-6xl mx-auto pb-10">
        <div className="flex items-center gap-4">
          <button onClick={() => setSelected(null)} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300">
            <ArrowRight size={20} className="rotate-180" />
          </button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
              {selected.name}
              <span className="text-xs font-mono bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2 py-1 rounded-lg border border-emerald-200 dark:border-emerald-500/20">
                {selected.godownCode}
              </span>
            </h1>
            {selected.location && <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 flex items-center gap-1"><MapPin size={14}/> {selected.location}</p>}
          </div>
           <div className="flex gap-2">
             <button onClick={() => {
                const loc = window.location.pathname.split('/')[1] || 'en';
                router.push(`/${loc}/purchases?action=add&warehouseId=${selected.id}`);
             }} className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-sm border border-slate-200 dark:border-slate-700">
              <Download size={16} /> {t('receivePurchase')}
            </button>
            <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-sm border border-slate-200 dark:border-slate-700">
              {t('export')}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card onClick={() => setFilterStatus('')} className={cn("bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm cursor-pointer transition-colors", filterStatus === '' ? "ring-2 ring-emerald-500" : "hover:bg-slate-50 dark:hover:bg-slate-800/80")}>
            <CardContent className="p-4">
              <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mb-1 flex items-center gap-2">{t('totalProducts')}</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{stats.totalProducts}</p>
            </CardContent>
          </Card>
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
            <CardContent className="p-4">
              <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mb-1 flex items-center gap-2">{t('totalUnits')}</p>
              <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{stats.totalUnits.toLocaleString('en-IN')}</p>
            </CardContent>
          </Card>
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
            <CardContent className="p-4">
              <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mb-1 flex items-center gap-2">{t('stockValue')}</p>
              <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">₹{stats.stockValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
            </CardContent>
          </Card>
          <Card onClick={() => setFilterStatus(filterStatus === 'low' ? '' : 'low')} className={cn("bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm cursor-pointer transition-colors", filterStatus === 'low' ? "ring-2 ring-amber-500" : "hover:bg-slate-50 dark:hover:bg-slate-800/80")}>
            <CardContent className="p-4">
              <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mb-1 flex items-center gap-2">{t('lowStock')}</p>
              <p className="text-xl font-bold text-amber-500 dark:text-amber-400">{stats.lowStock}</p>
            </CardContent>
          </Card>
          <Card onClick={() => setFilterStatus(filterStatus === 'out' ? '' : 'out')} className={cn("bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm cursor-pointer transition-colors", filterStatus === 'out' ? "ring-2 ring-rose-500" : "hover:bg-slate-50 dark:hover:bg-slate-800/80")}>
            <CardContent className="p-4">
              <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mb-1 flex items-center gap-2">{t('outOfStock')}</p>
              <p className="text-xl font-bold text-rose-600 dark:text-rose-500">{stats.outOfStock}</p>
            </CardContent>
          </Card>
          <Card onClick={() => setFilterStatus(filterStatus === 'expired' ? '' : 'expired')} className={cn("bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm cursor-pointer transition-colors", filterStatus === 'expired' ? "ring-2 ring-orange-500" : "hover:bg-slate-50 dark:hover:bg-slate-800/80")}>
            <CardContent className="p-4">
              <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mb-1 flex items-center gap-2">{t('expiringSoon')}</p>
              <p className="text-xl font-bold text-orange-500 dark:text-orange-400">{stats.expiring}</p>
            </CardContent>
          </Card>
        </div>

        {selected.inventory?.length === 0 ? (
           <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 border-dashed shadow-sm">
            <div className="py-16 flex flex-col items-center justify-center text-center px-4">
              <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                <Package className="w-8 h-8 text-slate-400 dark:text-slate-500" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{t('emptyWarehouse')}</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-md">{t('emptyWarehouseDesc')}</p>
              <div className="flex gap-4">
                <button onClick={() => {
                   const loc = window.location.pathname.split('/')[1] || 'en';
                   router.push(`/${loc}/purchases?action=add&warehouseId=${selected.id}`);
                }} className="px-6 py-2.5 bg-emerald-500 text-white dark:text-slate-900 font-bold rounded-xl hover:bg-emerald-600 dark:hover:bg-emerald-400 transition-colors">
                  {t('receivePurchase')}
                </button>
                <button onClick={() => { setTransfer({ fromId: '', toId: selected.id, productId: '', qty: '' }); setModal('transfer'); }} className="px-6 py-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700">
                  {t('transferIn')}
                </button>
              </div>
            </div>
           </Card>
        ) : (
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap gap-4 items-center justify-between">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <input className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-8 pr-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:outline-none w-64 shadow-sm"
                  placeholder={t('searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="flex gap-2 items-center flex-wrap">
                <select className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-300 outline-none shadow-sm" 
                  value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
                  <option value="">{t('allCategories')}</option>
                  {categories.map(c => <option key={c as string} value={c as string}>{c as string}</option>)}
                </select>
                <select className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-300 outline-none shadow-sm" 
                  value={filterBrand} onChange={(e) => setFilterBrand(e.target.value)}>
                  <option value="">{t('allBrands')}</option>
                  {brands.map(b => <option key={b as string} value={b as string}>{b as string}</option>)}
                </select>
                <select className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-300 outline-none shadow-sm" 
                  value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                  <option value="">{t('allStatus')}</option>
                  <option value="low">{t('lowStock')}</option>
                  <option value="out">{t('outOfStock')}</option>
                  <option value="expired">{t('expired')}</option>
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="text-xs uppercase bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-5 py-3 font-medium">{t('thProduct')}</th>
                    <th className="px-5 py-3 font-medium">{t('thSku')}</th>
                    <th className="px-5 py-3 font-medium">{t('thCategory')}</th>
                    <th className="px-5 py-3 font-medium text-right">{t('thCost')}</th>
                    <th className="px-5 py-3 font-medium text-right">{t('thSelling')}</th>
                    <th className="px-5 py-3 font-medium text-right">{t('thQuantity')}</th>
                    <th className="px-5 py-3 font-medium text-center">{t('thStatus')}</th>
                    <th className="px-5 py-3 font-medium text-center">{t('thActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredInventory.map((item: any) => {
                    const price = item.product?.wholesaleCost || item.product?.sellingPrice || 0;
                    const selling = item.product?.sellingPrice || 0;
                    const isLow = item.quantity > 0 && item.quantity <= (item.product?.minStock || 0);
                    const isOut = item.quantity <= 0;
                    const expired = isExpired(item.product?.expiryDate);
                    
                    return (
                      <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-5 py-3">
                          <p className="font-bold text-slate-900 dark:text-white">{item.product?.name}</p>
                          {item.product?.brand && <p className="text-xs text-slate-500">{item.product?.brand}</p>}
                        </td>
                        <td className="px-5 py-3 font-mono text-xs">
                          {item.product?.barcode && <p className="text-slate-600 dark:text-slate-300">SKU: {item.product?.barcode}</p>}
                          {item.product?.batchNumber && <p className="text-slate-500">B: {item.product?.batchNumber}</p>}
                          {!item.product?.barcode && !item.product?.batchNumber && '-'}
                        </td>
                        <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{item.product?.category || '-'}</td>
                        <td className="px-5 py-3 text-right">
                          <div className="font-medium text-slate-900 dark:text-slate-200">₹{price.toLocaleString('en-IN')}</div>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="font-medium text-slate-900 dark:text-slate-200">₹{selling.toLocaleString('en-IN')}</div>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span className={cn("font-mono px-2 py-1 rounded text-xs font-bold", 
                            isOut ? "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-500 border border-rose-200 dark:border-transparent" : isLow ? "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-500 border border-amber-200 dark:border-transparent" : "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-transparent")}>
                            {item.quantity} {item.product?.baseUnit}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-center">
                          {isOut ? <span className="text-xs bg-rose-50 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 px-2 py-1 rounded-full border border-rose-200 dark:border-transparent">{t('outOfStock')}</span> :
                           isLow ? <span className="text-xs bg-amber-50 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 px-2 py-1 rounded-full border border-amber-200 dark:border-transparent">{t('lowStock')}</span> :
                           expired ? <span className="text-xs bg-rose-50 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 px-2 py-1 rounded-full border border-rose-200 dark:border-transparent">{t('expired')}</span> :
                           <span className="text-xs bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-2 py-1 rounded-full border border-emerald-200 dark:border-transparent">{t('inStock')}</span>}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <div className="flex items-center justify-center gap-3">
                            <button onClick={() => { setTransfer({ fromId: selected.id, toId: '', productId: item.product?.id, qty: '' }); setModal('transfer'); }} className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300 text-xs font-bold underline">
                              {t('transfer')}
                            </button>
                            <button onClick={() => { setAdjustProduct(item.product); setModal('adjust'); }} className="text-amber-600 dark:text-amber-400 hover:text-amber-500 dark:hover:text-amber-300 text-xs font-bold underline">
                              {t('adjust')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredInventory.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-5 py-12 text-center text-slate-500">{t('noProductsFound')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <div className="mt-8">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-4"><History size={18} className="text-slate-400" /> {t('recentActivity')}</h3>
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
            {loadingMovements ? (
              <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>
            ) : movements.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {movements.map((m: any) => (
                  <div key={m.id} className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <div className="flex items-center gap-3">
                      <div className={cn("p-2 rounded-full", m.type === 'transfer' ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400" : "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400")}>
                        <ArrowRightLeft size={16} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-slate-200">{m.type.charAt(0).toUpperCase() + m.type.slice(1)}: {m.product_name}</p>
                        <p className="text-xs text-slate-500">{new Date(m.created_at).toLocaleString('en-IN')}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold font-mono text-slate-700 dark:text-slate-300">{m.quantity} {m.base_unit}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500 text-sm">{t('noRecentActivity')}</div>
            )}
          </Card>
        </div>
        
        {toastMessage && (
          <div className="fixed bottom-4 right-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl rounded-lg px-4 py-3 flex items-center gap-3 animate-in slide-in-from-bottom-5">
            <CheckCircle2 className="text-emerald-500 dark:text-emerald-400 w-5 h-5" />
            <span className="text-slate-900 dark:text-slate-200 text-sm font-medium">{toastMessage}</span>
          </div>
        )}

        {modal === 'transfer' && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <Card className="w-full max-w-md bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-2xl">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                <h3 className="font-bold text-slate-900 dark:text-white">{t('transferStock')}</h3>
                <button onClick={() => setModal(null)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white"><X size={20}/></button>
              </div>
              <form onSubmit={handleTransfer} className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('fromWarehouse')}</label>
                  <select required className={inp} value={transfer.fromId} onChange={e => setTransfer({...transfer, fromId: e.target.value, productId: ''})}>
                    <option value="">{t('selectSource')}</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('toWarehouse')}</label>
                  <select required className={inp} value={transfer.toId} onChange={e => setTransfer({...transfer, toId: e.target.value})}>
                    <option value="">{t('selectDestination')}</option>
                    {warehouses.filter(w => w.id !== transfer.fromId).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                {transfer.fromId && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('selectProduct')}</label>
                    <select required className={inp} value={transfer.productId} onChange={e => setTransfer({...transfer, productId: e.target.value})}>
                      <option value="">{t('selectProductTransfer')}</option>
                      {(warehouses.find(w => w.id === transfer.fromId)?.inventory || []).map((i: any) => (
                        <option key={i.product?.id} value={i.product?.id}>{i.product?.name} ({t('available')}: {i.quantity})</option>
                      ))}
                    </select>
                  </div>
                )}
                {transfer.productId && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('thQuantity')}</label>
                    <input type="number" required min="0.01" step="0.01" className={inp} value={transfer.qty} onChange={e => setTransfer({...transfer, qty: e.target.value})} placeholder="0" />
                  </div>
                )}
                <div className="pt-2 flex justify-end gap-3">
                  <button type="button" onClick={() => setModal(null)} className="px-4 py-2 font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">{t('cancel')}</button>
                  <button type="submit" disabled={transferring} className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg transition-colors flex items-center gap-2">
                    {transferring && <Loader2 size={16} className="animate-spin" />} {t('transfer')}
                  </button>
                </div>
              </form>
            </Card>
          </div>
        )}

        {modal === 'adjust' && adjustProduct && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end">
            <AdjustDrawer 
              product={adjustProduct} 
              godowns={warehouses} 
              onClose={() => { setModal(null); setAdjustProduct(null); }} 
              onSuccess={() => { mutateWarehouses(); mutateMovements(); }} 
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-emerald-500 flex items-center gap-3">
            <Warehouse className="text-emerald-500" /> {t('title')}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2">{t('desc')}</p>
        </div>
        <button onClick={() => setModal('new')}
          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 text-white dark:text-slate-900 font-bold rounded-xl hover:bg-emerald-600 dark:hover:bg-emerald-400 transition-colors shadow-sm">
          <Plus size={18} /> {t('newGodown')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {warehouses.map(w => {
          const stats = calculateStats(w);
          return (
            <Card key={w.id} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 transition-all cursor-pointer group shadow-sm" onClick={() => setSelected(w)}>
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-lg text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{w.name}</h3>
                    <p className="text-xs font-mono text-slate-500 mt-0.5">{w.godownCode}</p>
                    {w.location && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1"><MapPin size={10}/> {w.location}</p>}
                  </div>
                  <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg text-slate-400 dark:text-slate-500"><Warehouse size={18}/></div>
                </div>
                
                <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-sm mt-6">
                  <div>
                    <p className="text-slate-500 text-xs mb-1">{t('totalProducts')}</p>
                    <p className="font-bold text-slate-900 dark:text-slate-200">{stats.totalProducts}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs mb-1">{t('totalUnits')}</p>
                    <p className="font-bold text-slate-900 dark:text-slate-200">{stats.totalUnits.toLocaleString('en-IN')}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs mb-1">{t('stockValue')}</p>
                    <p className="font-bold text-emerald-600 dark:text-emerald-400">₹{stats.stockValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs mb-1 flex items-center gap-1"><AlertTriangle size={12}/> {t('lowStock')}</p>
                    <p className="font-bold text-amber-500 dark:text-amber-400">{stats.lowStock}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs mb-1 flex items-center gap-1"><AlertTriangle size={12} className="text-rose-500"/> {t('outOfStock')}</p>
                    <p className="font-bold text-rose-600 dark:text-rose-500">{stats.outOfStock}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs mb-1 flex items-center gap-1"><Clock size={12}/> {t('expiringSoon')}</p>
                    <p className="font-bold text-orange-500 dark:text-orange-400">{stats.expiring}</p>
                  </div>
                </div>
                
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <p className="text-xs text-slate-500">{t('lastUpdated')} {new Date(stats.lastUpdated).toLocaleDateString('en-IN')}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {warehouses.length === 0 && (
          <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-transparent">
            <Warehouse className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500 dark:text-slate-400 font-medium">{t('noWarehouses')}</p>
          </div>
        )}
      </div>

      {modal === 'new' && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 dark:text-white">{t('newGodown')}</h3>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white"><X size={20}/></button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('nameLabel')}</label>
                <input required autoFocus className={inp} value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder={t('egMainHub')} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('locationLabel')}</label>
                <input className={inp} value={form.location} onChange={e => setForm({...form, location: e.target.value})} placeholder={t('egSector12')} />
              </div>
              <div className="pt-2 flex justify-end gap-3">
                <button type="button" onClick={() => setModal(null)} className="px-4 py-2 font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">{t('cancel')}</button>
                <button type="submit" disabled={saving} className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg transition-colors flex items-center gap-2">
                  {saving && <Loader2 size={16} className="animate-spin" />} {t('create')}
                </button>
              </div>
            </form>
          </Card>
        </div>
      )}

    </div>
  );
}
