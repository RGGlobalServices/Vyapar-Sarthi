'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { ShoppingCart, Plus, Loader2, Search, Warehouse, Package, ArrowRight, ShieldCheck, X, FileText, Pencil, Trash2, Filter, AlertTriangle } from 'lucide-react';
import { useBusinessStore } from '@/lib/businessStore';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { ExportButton } from '@/lib/hooks/useExport';

const fetcher = ([url]: [string, string]) => api.get(url).then(res => res.data);
const godownsFetcher = ([url]: [string, string]) => api.get(url).then(res => res.data?.data || res.data);

const emptyItem = () => ({ productId: '', quantity: 1, cost: 0, batchNumber: '', unitId: '', conversionFactor: 1 });

export default function PurchasesPage() {
  const t = useTranslations('Purchases');
  const { profile, activeShopId } = useBusinessStore();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mounted, setMounted] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<any>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  // List search / filter
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterSupplierId, setFilterSupplierId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [warehouseId, setWarehouseId] = useState('');

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(handler);
  }, [search]);

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

  const purchasesQuery = useMemo(() => {
    const params = new URLSearchParams({ limit: '200' });
    if (debouncedSearch) params.set('q', debouncedSearch);
    if (filterSupplierId) params.set('supplierId', filterSupplierId);
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);
    return `/purchases?${params.toString()}`;
  }, [debouncedSearch, filterSupplierId, dateFrom, dateTo]);

  const { data: purchasesResp, mutate: mutateInvoices, isLoading } = useSWR(
    profile.subscriptionPlan === 'wholesale' && activeShopId ? [purchasesQuery, activeShopId] : null,
    fetcher
  );
  const invoices: any[] = purchasesResp?.data || [];
  const hasActiveFilters = !!(debouncedSearch || filterSupplierId || dateFrom || dateTo);

  // Suppliers are needed both for the filter dropdown on the list and for
  // the Add/Edit form, so fetch them whenever the page is usable — not just
  // while the form is open.
  const { data: suppliersData = [], mutate: mutateSuppliers } = useSWR(
    profile.subscriptionPlan === 'wholesale' && activeShopId ? ['/suppliers', activeShopId] : null,
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

  const [items, setItems] = useState<any[]>([emptyItem()]);
  const [saving, setSaving] = useState(false);

  // Inline {t('supplierLabel')} State
  const [isAddingSupplier, setIsAddingSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);

  const resetForm = () => {
    setEditingInvoice(null);
    setSupplierId('');
    setInvoiceNumber('');
    setDate(new Date().toISOString().split('T')[0]);
    setWarehouseId('');
    setItems([emptyItem()]);
  };

  const openAdd = () => {
    resetForm();
    setShowAdd(true);
  };

  const openEdit = async (inv: any) => {
    setSelectedInvoice(null);
    try {
      const { data: full } = await api.get(`/purchases/${inv.id}`);
      setEditingInvoice(full);
      setSupplierId(full.supplierId);
      setInvoiceNumber(full.invoiceNumber || '');
      setDate(new Date(full.date).toISOString().split('T')[0]);
      setWarehouseId(full.warehouseId || '');
      setItems(
        (full.purchaseItems || []).map((it: any) => ({
          productId: it.productId,
          quantity: it.quantity,
          cost: it.cost,
          batchNumber: '',
          unitId: '',
          conversionFactor: 1,
        }))
      );
      setShowAdd(true);
    } catch (err: any) {
      alert('Failed to load purchase for editing: ' + (err?.response?.data?.error || err.message));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const payload = {
      supplierId,
      warehouseId,
      invoiceNumber,
      date,
      items: items.filter(i => i.productId && i.quantity > 0)
    };

    try {
      if (editingInvoice) {
        await api.patch(`/purchases/${editingInvoice.id}`, payload);
      } else {
        await api.post('/purchases', payload);
      }
      setShowAdd(false);
      resetForm();
      mutateInvoices();
    } catch (err: any) {
      console.error('Failed to save purchase', err);
      alert('Failed to record purchase: ' + (err?.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (inv: any) => {
    if (!confirm(`Delete purchase invoice "${inv.invoiceNumber || inv.id}" from ${inv.supplier?.name || 'this supplier'}?\n\nThis will reverse the stock and supplier balance it added. This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await api.delete(`/purchases/${inv.id}`);
      setSelectedInvoice(null);
      mutateInvoices();
    } catch (err: any) {
      alert(err?.response?.data?.error || err.message || 'Failed to delete purchase.');
    } finally {
      setDeleting(false);
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

  // Live credit-limit warning for the form being filled in — soft, never
  // blocks submission. When editing, the selected supplier's `balance`
  // already includes THIS invoice's original total, so back it out of the
  // baseline before adding the in-progress items' new total.
  const selectedSupplier = suppliers.find((s: any) => s.id === supplierId);
  const purchaseTotal = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.cost) || 0), 0);
  const baselineOutstanding = (selectedSupplier?.balance || 0) - (editingInvoice?.totalCost || 0);
  const projectedOutstanding = baselineOutstanding + purchaseTotal;
  const overCreditLimitBy = selectedSupplier?.creditLimit > 0 ? projectedOutstanding - selectedSupplier.creditLimit : 0;

  const exportRows = useMemo(() => invoices.map((inv: any) => ({
    ...inv,
    supplierName: inv.supplier?.name || '',
    itemCount: inv.purchaseItems?.length || 0,
  })), [invoices]);

  const totalSpend = useMemo(() => invoices.reduce((sum, inv) => sum + (inv.totalCost || 0), 0), [invoices]);

  if (showAdd) {
    return (
      <div className="max-w-4xl mx-auto pb-24 animate-in fade-in">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => { setShowAdd(false); resetForm(); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500 dark:text-slate-400">
            <ArrowRight className="rotate-180" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {editingInvoice ? (t('editPurchaseInvoice') || 'Edit Purchase Invoice') : (t('recordPurchaseInvoice') || 'Record Purchase Invoice')}
            </h1>
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
              {editingInvoice && (
                <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg px-3 py-2 mb-4">
                  Quantities and costs below are in each product's base unit. Batch numbers aren't editable here — add a new one if this shipment needs one.
                </p>
              )}

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

                <button type="button" onClick={() => setItems([...items, emptyItem()])}
                  className="w-full py-3 border-2 border-dashed border-emerald-200 dark:border-emerald-500/30 rounded-xl text-emerald-600 dark:text-emerald-400 font-medium hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors flex items-center justify-center gap-2">
                  <Plus size={18} /> {t('addAnotherProduct') || 'Add Another Product'}
                </button>
              </div>
            </CardContent>
          </Card>

          {overCreditLimitBy > 0 && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-400 text-sm font-bold">
              <AlertTriangle size={16} />
              {t('creditLimitExceededBy', { amount: `₹${overCreditLimitBy.toLocaleString('en-IN')}` }) || `Credit Limit Exceeded by ₹${overCreditLimitBy.toLocaleString('en-IN')}`}
            </div>
          )}

          <div className="flex justify-end">
            <button type="submit" disabled={saving || !supplierId || !warehouseId}
              className="px-8 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg disabled:opacity-50 transition-colors">
              {saving ? <Loader2 className="animate-spin" size={20} /> : <FileText size={20} />}
              {editingInvoice ? (t('saveChanges') || 'Save Changes') : (t('recordPurchase') || 'Record Purchase')}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-emerald-500 flex items-center gap-3">
            <ShoppingCart className="text-emerald-500" />{t('purchasesTitle') || 'Purchases'}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{t('purchasesSubtitle') || 'Manage supplier invoices and inward stock.'}</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            filename="purchases"
            title="Purchases"
            dateRange={dateFrom && dateTo ? `${dateFrom} – ${dateTo}` : undefined}
            summary={[
              { label: 'Invoices', value: String(invoices.length) },
              { label: 'Total Spend', value: `₹${totalSpend.toLocaleString('en-IN')}` },
            ]}
            columns={[
              { key: 'date', label: 'Date', type: 'date' },
              { key: 'invoiceNumber', label: 'Invoice #' },
              { key: 'supplierName', label: 'Supplier' },
              { key: 'itemCount', label: 'Items', type: 'number' },
              { key: 'totalCost', label: 'Total Amount', type: 'currency' },
            ]}
            data={exportRows}
          />
          <button onClick={openAdd}
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-bold shadow-sm flex items-center gap-2 transition-colors">
            <Plus size={18} /> {t('newPurchase') || 'New Purchase'}</button>
        </div>
      </div>

      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('searchPlaceholder') || 'Search invoice #, supplier, or product...'}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
              />
            </div>
            <button
              onClick={() => setShowFilters(v => !v)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold border transition-colors",
                showFilters || filterSupplierId || dateFrom || dateTo
                  ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                  : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
              )}
            >
              <Filter size={15} /> {t('filters') || 'Filters'}
            </button>
          </div>
          {showFilters && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 animate-in fade-in slide-in-from-top-1">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">{t('supplierLabel') || 'Supplier'}</label>
                <select value={filterSupplierId} onChange={e => setFilterSupplierId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors">
                  <option value="">{t('allSuppliers') || 'All Suppliers'}</option>
                  {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">{t('fromDate') || 'From Date'}</label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">{t('toDate') || 'To Date'}</label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors" />
              </div>
              {(filterSupplierId || dateFrom || dateTo) && (
                <button
                  type="button"
                  onClick={() => { setFilterSupplierId(''); setDateFrom(''); setDateTo(''); }}
                  className="text-xs font-bold text-slate-500 hover:text-red-500 flex items-center gap-1 sm:col-span-3"
                >
                  <X size={12} /> {t('clearFilters') || 'Clear filters'}
                </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center h-32 items-center"><Loader2 className="animate-spin text-emerald-500 w-8 h-8" /></div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
          <ShoppingCart className="w-16 h-16 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
          {hasActiveFilters ? (
            <>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">{t('noResults') || 'No purchases match your search'}</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-2 mb-6 max-w-md mx-auto">{t('tryDifferentFilters') || 'Try a different search term or clear the filters.'}</p>
            </>
          ) : (
            <>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">{t('noPurchases') || 'No purchases recorded yet'}</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-2 mb-6 max-w-md mx-auto">{t('startTracking') || 'Start tracking your inventory by recording a purchase from your suppliers.'}</p>
              <button onClick={openAdd} className="px-6 py-2.5 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 transition-colors">{t('recordFirstPurchase') || 'Record First Purchase'}</button>
            </>
          )}
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
                  <th className="px-5 py-4 font-medium text-right">{t('colActions') || 'Actions'}</th>
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
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                        <button onClick={() => openEdit(inv)} title={t('edit') || 'Edit'}
                          className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-lg transition-colors">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => handleDelete(inv)} disabled={deleting} title={t('delete') || 'Delete'}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
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
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center">
              <div className="flex gap-2">
                <button onClick={() => openEdit(selectedInvoice)}
                  className="px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <Pencil size={14} /> {t('edit') || 'Edit'}
                </button>
                <button onClick={() => handleDelete(selectedInvoice)} disabled={deleting}
                  className="px-4 py-2.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl text-sm font-bold shadow-sm hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors flex items-center gap-2 text-red-600 dark:text-red-400 disabled:opacity-50">
                  {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} {t('delete') || 'Delete'}
                </button>
              </div>
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
