'use client';
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { ShoppingCart, Plus, Loader2, Search, Warehouse, Package, ArrowRight, ShieldCheck, X, FileText } from 'lucide-react';
import { useBusinessStore } from '@/lib/businessStore';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';

const fetcher = ([url]: [string, string]) => api.get(url).then(res => res.data);
const godownsFetcher = ([url]: [string, string]) => api.get(url).then(res => res.data?.data || res.data);

export default function PurchasesPage() {
  const t = useTranslations('Purchases');
  const { profile, activeShopId } = useBusinessStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [mounted, setMounted] = useState(false);
  
  const [showAdd, setShowAdd] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [warehouseId, setWarehouseId] = useState('');

  useEffect(() => {
    setMounted(true);
    if (searchParams.get('action') === 'add') {
      setShowAdd(true);
    }
    const wid = searchParams.get('warehouseId');
    if (wid) {
      setWarehouseId(wid);
    }
  }, [searchParams]);

  const shouldFetchDetails = profile.subscriptionPlan === 'wholesale' && showAdd;

  const { data: invoices = [], mutate: mutateInvoices, isLoading } = useSWR(
    profile.subscriptionPlan === 'wholesale' && activeShopId ? ['/purchases', activeShopId] : null,
    fetcher
  );

  const { data: suppliersData = [], mutate: mutateSuppliers } = useSWR(
    shouldFetchDetails && activeShopId ? ['/suppliers', activeShopId] : null,
    fetcher
  );

  const { data: warehouses = [] } = useSWR(
    shouldFetchDetails && activeShopId ? ['/godowns', activeShopId] : null,
    godownsFetcher
  );

  const { data: products = [] } = useSWR(
    shouldFetchDetails && activeShopId ? ['/products', activeShopId] : null,
    fetcher
  );

  const { data: masterData } = useSWR(
    shouldFetchDetails && activeShopId ? ['/master-data', activeShopId] : null,
    fetcher
  );

  const suppliers = Array.isArray(suppliersData) ? suppliersData : [];
  
  const [supplierId, setSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [items, setItems] = useState<any[]>([{ productId: '', quantity: 1, cost: 0, batchNumber: '', unitId: '', conversionFactor: 1 }]);
  const [saving, setSaving] = useState(false);
  
  // Inline {t('supplierLabel')} State
  const [isAddingSupplier, setIsAddingSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    // Optimistic Update
    const optimisticInvoice = {
      id: 'temp-' + Date.now(),
      invoice_number: invoiceNumber,
      date: date,
      total_amount: items.reduce((sum, item) => sum + (item.quantity * item.cost), 0),
      supplier: suppliers.find((s: any) => s.id === supplierId) || { name: 'Unknown' },
      created_at: new Date().toISOString()
    };
    mutateInvoices((current: any[] = []) => [optimisticInvoice, ...current], false);
    setShowAdd(false);

    try {
      await api.post('/purchases', {
        supplierId,
        warehouseId,
        invoiceNumber,
        date,
        items: items.filter(i => i.productId && i.quantity > 0)
      });
    } catch (err: any) {
      console.error('Failed to record purchase', err);
      alert('Failed to record purchase: ' + (err?.response?.data?.detail || err.message));
      mutateInvoices(); // Rollback
    } finally {
      mutateInvoices(); // Sync
      setSaving(false);
    }
  };

  const saveNewSupplier = async () => {
    if (!newSupplierName.trim()) return;
    setIsSavingSupplier(true);
    try {
      const { data } = await api.post('/suppliers', { name: newSupplierName.trim() });
      mutateSuppliers([data, ...suppliers], false);
      setSupplierId(data.id);
      setIsAddingSupplier(false);
      setNewSupplierName('');
    } catch (err: any) {
      alert('Failed to add supplier: ' + (err.response?.data?.error || err.message));
    } finally {
      setIsSavingSupplier(false);
    }
  };

  if (showAdd) {
    return (
      <div className="max-w-4xl mx-auto pb-24 animate-in fade-in">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => setShowAdd(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500 dark:text-slate-400">
            <ArrowRight className="rotate-180" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('recordPurchaseInvoice') || 'Record Purchase Invoice'}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('receiveStockDesc') || 'Receive stock into your warehouse.'}</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
            <CardContent className="p-6">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4">{t('invoiceDetails') || 'Invoice Details'}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">{t('supplierLabel') || 'Supplier'} <span className="text-red-500">*</span></label>
                  {isAddingSupplier ? (
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        autoFocus
                        placeholder="{t('enterSupplierName') || 'Enter supplier name...'}" 
                        value={newSupplierName}
                        onChange={e => setNewSupplierName(e.target.value)}
                        className="flex-1 px-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
                        disabled={isSavingSupplier}
                      />
                      <button type="button" onClick={saveNewSupplier} disabled={!newSupplierName || isSavingSupplier} className="px-3 bg-emerald-500 text-white rounded-lg font-bold flex items-center justify-center min-w-[60px] hover:bg-emerald-600 transition-colors">
                        {isSavingSupplier ? <Loader2 size={16} className="animate-spin" /> : 'Save'}
                      </button>
                      <button type="button" onClick={() => setIsAddingSupplier(false)} disabled={isSavingSupplier} className="px-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <select required value={supplierId} onChange={e => setSupplierId(e.target.value)}
                        className="flex-1 px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors">
                          <option value="">{t('selectSupplier') || 'Select Supplier'}</option>
                        {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <button type="button" onClick={() => setIsAddingSupplier(true)} className="px-3 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg font-bold hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors">+</button>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">{t('warehouseLocation') || 'Warehouse Location'} <span className="text-red-500">*</span></label>
                  <select required value={warehouseId} onChange={e => setWarehouseId(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors">
                    <option value="">{t('selectWarehouse') || 'Select Warehouse'}</option>
                    {warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">{t('invoiceNumber') || 'Invoice Number'}</label>
                  <input type="text" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors" placeholder="e.g. INV-2023-001" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">{t('purchaseDate') || 'Purchase Date'}</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
            <CardContent className="p-6">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4">{t('itemsLabel') || 'Items'}</h3>
              
              <div className="space-y-4">
                {items.map((item, index) => (
                  <div key={index} className="flex flex-wrap md:flex-nowrap gap-3 items-end p-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-800/30">
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">{t('productLabel') || 'Product'}</label>
                      <select required value={item.productId} onChange={e => {
                        const newItems = [...items];
                        newItems[index].productId = e.target.value;
                        setItems(newItems);
                      }} className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors">
                        <option value="">{t('selectProduct') || 'Select Product...'}</option>
                        {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div className="w-24">
                      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">{t('qty') || 'Qty'}</label>
                      <input type="number" required min="1" value={item.quantity} onChange={e => {
                        const newItems = [...items];
                        newItems[index].quantity = parseInt(e.target.value) || 1;
                        setItems(newItems);
                      }} className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors" />
                    </div>
                    <div className="w-28">
                      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Unit</label>
                      <select value={item.unitId || ''} onChange={e => {
                        const newItems = [...items];
                        const selectedUnit = masterData?.units?.find((u:any) => u.id === e.target.value);
                        newItems[index].unitId = e.target.value;
                        newItems[index].conversionFactor = selectedUnit ? selectedUnit.conversionFactor : 1;
                        setItems(newItems);
                      }} className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors">
                        <option value="">{products.find((p:any) => p.id === item.productId)?.baseUnit || 'Base Unit'}</option>
                        {masterData?.units?.map((u: any) => (
                          <option key={u.id} value={u.id}>{u.shortName} (x{u.conversionFactor})</option>
                        ))}
                      </select>
                    </div>
                    <div className="w-28">
                      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">{t('unitCost') || 'Unit Cost'}</label>
                      <input type="number" step="0.01" required value={item.cost} onChange={e => {
                        const newItems = [...items];
                        newItems[index].cost = parseFloat(e.target.value) || 0;
                        setItems(newItems);
                      }} className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors" />
                    </div>
                    <div className="w-32">
                      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">{t('batchOptional') || 'Batch (Opt)'}</label>
                      <input type="text" value={item.batchNumber} onChange={e => {
                        const newItems = [...items];
                        newItems[index].batchNumber = e.target.value;
                        setItems(newItems);
                      }} className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors" placeholder="LOT-001" />
                    </div>
                    <button type="button" onClick={() => setItems(items.filter((_, i) => i !== index))}
                      className="w-10 h-10 flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors">
                      <X size={16} />
                    </button>
                  </div>
                ))}
                
                <button type="button" onClick={() => setItems([...items, { productId: '', quantity: 1, cost: 0, batchNumber: '', unitId: '', conversionFactor: 1 }])}
                  className="w-full py-3 border-2 border-dashed border-emerald-200 dark:border-emerald-500/30 rounded-xl text-emerald-600 dark:text-emerald-400 font-medium hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors flex items-center justify-center gap-2">
                  <Plus size={18} /> {t('addAnotherProduct') || 'Add Another Product'}
                </button>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <button type="submit" disabled={saving || !supplierId || !warehouseId}
              className="px-8 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg disabled:opacity-50 transition-colors">
              {saving ? <Loader2 className="animate-spin" size={20} /> : <FileText size={20} />}
              Record Purchase
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-emerald-500 flex items-center gap-3">
            <ShoppingCart className="text-emerald-500" />{t('purchasesTitle') || 'Purchases'}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{t('purchasesSubtitle') || 'Manage supplier invoices and inward stock.'}</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-bold shadow-sm flex items-center gap-2 transition-colors">
          <Plus size={18} /> {t('newPurchase') || 'New Purchase'}</button>
      </div>

      {!mounted || isLoading ? (
        <div className="flex justify-center h-32 items-center"><Loader2 className="animate-spin text-emerald-500 w-8 h-8" /></div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
          <ShoppingCart className="w-16 h-16 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
          <h3 className="text-xl font-bold text-slate-900 dark:text-white">{t('noPurchases') || 'No purchases recorded yet'}</h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-2 mb-6 max-w-md mx-auto">{t('startTracking') || 'Start tracking your inventory by recording a purchase from your suppliers.'}</p>
          <button onClick={() => setShowAdd(true)} className="px-6 py-2.5 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 transition-colors">{t('recordFirstPurchase') || 'Record First Purchase'}</button>
        </div>
      ) : (
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead className="text-xs uppercase bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-4 font-medium">{t('dateLabel') || 'Date'}</th>
                  <th className="px-5 py-4 font-medium">{t('invoiceHash') || 'Invoice #'}</th>
                  <th className="px-5 py-4 font-medium">Supplier</th>
                  <th className="px-5 py-4 font-medium">{t('itemsLabel') || 'Items'}</th>
                  <th className="px-5 py-4 font-semibold text-right text-slate-600 dark:text-slate-300">{t('totalAmount') || 'Total Amount'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {invoices.map((inv: any) => (
                  <tr key={inv.id} onClick={() => setSelectedInvoice(inv)} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer">
                    <td className="px-5 py-4 font-medium text-slate-900 dark:text-white">{new Date(inv.date).toLocaleDateString('en-IN')}</td>
                    <td className="px-5 py-4 text-slate-500 dark:text-slate-400 font-mono text-xs">{inv.invoiceNumber || '-'}</td>
                    <td className="px-5 py-4 text-slate-900 dark:text-slate-200 font-bold">{inv.supplier?.name}</td>
                    <td className="px-5 py-4 text-slate-500 dark:text-slate-400">
                      <span className="font-bold text-slate-700 dark:text-slate-300">{inv.purchaseItems?.length}</span> {t('items') || 'items'}
                      <span className="text-xs ml-1 text-slate-400">({inv.purchaseItems?.reduce((sum: number, i: any) => sum + i.quantity, 0)} {t('units') || 'units'})</span>
                    </td>
                    <td className="px-5 py-4 text-right font-bold font-mono text-slate-900 dark:text-white">₹{(inv.totalCost || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedInvoice(null)} />
          <div className="relative w-full max-w-2xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 border border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur z-10">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="text-emerald-500" />
                {t('purchaseDetails') || 'Purchase Details'}
              </h2>
              <button onClick={() => setSelectedInvoice(null)} className="p-2 -mr-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 rounded-full transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('supplierLabel') || 'Supplier'}</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{selectedInvoice.supplier?.name}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('invoiceHash') || 'Invoice #'}</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white font-mono">{selectedInvoice.invoiceNumber || '-'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('dateLabel') || 'Date'}</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{new Date(selectedInvoice.date).toLocaleDateString('en-IN')}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('totalAmount') || 'Total Amount'}</p>
                  <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono">₹{(selectedInvoice.totalCost || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                </div>
              </div>
              
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                 <Package size={14}/> {t('itemsLabel') || 'Items'}
              </h3>
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr>
                      <th className="px-4 py-3 font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('productLabel') || 'Product'}</th>
                      <th className="px-4 py-3 font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('qty') || 'Qty'}</th>
                      <th className="px-4 py-3 font-bold text-xs uppercase tracking-wider text-right text-slate-500 dark:text-slate-400">{t('unitCost') || 'Unit Cost'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {selectedInvoice.purchaseItems?.map((item: any) => (
                      <tr key={item.id} className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-4 py-3 text-slate-900 dark:text-slate-200 font-bold">{item.product?.name}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{item.quantity}</td>
                        <td className="px-4 py-3 text-slate-900 dark:text-white text-right font-mono font-medium">₹{(item.cost || 0).toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end">
              <button onClick={() => setSelectedInvoice(null)} className="px-5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                {t('close') || 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
