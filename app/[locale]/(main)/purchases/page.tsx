'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { ShoppingCart, Plus, Loader2, Search, Warehouse, Package, ArrowRight, ShieldCheck, X, FileText, Pencil, Trash2, Filter, AlertTriangle, Calculator, Check, Sparkles, RotateCcw, Printer, Wheat } from 'lucide-react';
import { useBusinessStore } from '@/lib/businessStore';
import api from '@/lib/api';
import { cn, fmtDate } from '@/lib/utils';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { ExportButton } from '@/lib/hooks/useExport';
import { makeVariantKey } from '@/components/ColorSizeVariantGrid';
import { canUseGodowns } from '@/lib/planGates';
import { isMillBillingPackage } from '@/lib/config/packageConfig';
import PurchaseReturnModal from '@/components/purchases/PurchaseReturnModal';
import BrokerField, { EMPTY_BROKER } from '@/components/mill/BrokerField';
import { printLabelSheet } from '@/lib/printLabels';
import { resolveActiveProfile } from '@/lib/printProfiles';

const fetcher = ([url]: [string, string]) => api.get(url).then(res => res.data);
const godownsFetcher = ([url]: [string, string]) => api.get(url).then(res => res.data?.data || res.data);

const emptyItem = () => ({
  productId: '', quantity: 1, cost: 0, batchNumber: '', expiryDate: '', sellingPrice: '', unitId: '', conversionFactor: 1, unitLabel: '', toRaw: undefined as boolean | undefined,
  // One qty per colour/size, keyed the same way as everywhere else — only
  // used when the selected product has variant rows; `quantity` above is
  // still what's used for a plain (non-variant) product.
  variantQty: {} as Record<string, string>,
  // 'manual' types Unit Cost directly (default, today's behavior). 'mrp_based'
  // derives it from mrp * (1 - discountPercent/100) instead — locked into
  // this line's own mrp/discountPercent permanently at save time, so a later
  // change to the product's own MRP/discount never alters what this specific
  // purchase actually paid.
  costMode: 'manual' as 'manual' | 'mrp_based', mrp: '', discountPercent: '',
});

// Shared by every item row — 'manual' just returns the typed cost; 'mrp_based'
// derives it from that row's own mrp/discountPercent.
function effectiveItemCost(item: { cost: any; mrp: any; costMode?: string; discountPercent: any }): number {
  if (item.costMode === 'mrp_based') {
    const mrp = Number(item.mrp) || 0;
    const pct = Number(item.discountPercent) || 0;
    return Math.max(0, mrp * (1 - pct / 100));
  }
  return Number(item.cost) || 0;
}

// Plain (non-hook) helpers so they can be called straight from JSX without
// touching this component's hook order — matches the same rowKey convention
// the return API and PurchaseReturnModal use.
function purchaseReturnedQtyByKey(invoice: any): Map<string, number> {
  const map = new Map<string, number>();
  for (const ret of invoice?.purchaseReturns || []) {
    for (const it of ret.items || []) {
      const k = `${it.productId}::${it.variantKey || ''}`;
      map.set(k, (map.get(k) || 0) + it.quantity);
    }
  }
  return map;
}
function purchaseTotalReturnedAmount(invoice: any): number {
  return (invoice?.purchaseReturns || []).reduce((sum: number, r: any) => sum + (r.totalAmount || 0), 0);
}

// Same key a variant row is stored/matched under everywhere else (Products'
// Variant Builder, Billing's picker, the server-side stock helper) — a
// product with no colour dimension just uses its bare size.
const variantRowKey = (v: any) => (v.color ? makeVariantKey(v.color, v.size || '') : (v.size || ''));

/**
 * Normalise a free-typed money/qty field to a clean numeric string — strips
 * ₹, thousands commas and stray spaces so "₹1,200" / "12 " no longer read as
 * 0 in the cost maths. Truly-empty stays empty (an empty variant qty means
 * "not this size", an empty discount means 0). Powers the Auto-Calculate
 * button; it does NOT change any formula, only cleans what's typed.
 */
const cleanPurchaseNumStr = (s: any): string => {
  const raw = (s ?? '').toString();
  if (raw.trim() === '') return '';
  const cleaned = raw.replace(/[₹,\s]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? String(n) : '';
};

/** Stable signature of the cost-relevant fields of the item rows — used to
 *  tell when an Auto-Calculate result has gone stale after a later edit. */
const purchaseItemsSig = (rows: any[]): string =>
  rows.map(i => `${i.productId}|${i.quantity}|${i.cost}|${i.mrp}|${i.discountPercent}|${i.costMode}|${JSON.stringify(i.variantQty || {})}`).join(';');

// Bada Udyog (mill) purchases are weighed goods: the unit list is kg / quintal / ton / g, converted to the product's own base unit
// through the same `conversionFactor` the server already uses (base qty = qty × factor, base cost = cost ÷ factor).
const MILL_UNITS: { key: string; label: string; kg: number }[] = [
  { key: 'kg', label: 'Kg', kg: 1 }, { key: 'quintal', label: 'Quintal (100 kg)', kg: 100 }, { key: 'ton', label: 'Ton (1000 kg)', kg: 1000 }, { key: 'g', label: 'Gram', kg: 0.001 },
];
const kgPerBase = (baseUnit: string | null | undefined): number | null => {
  const k = String(baseUnit ?? 'kg').trim().toLowerCase();
  const hit = MILL_UNITS.find(u => u.key === k) || (['kgs', 'kilogram', 'kilograms'].includes(k) ? MILL_UNITS[0] : ['qtl', 'quintals'].includes(k) ? MILL_UNITS[1] : ['tons', 'tonne', 'tonnes', 'mt'].includes(k) ? MILL_UNITS[2] : ['gm', 'gram', 'grams'].includes(k) ? MILL_UNITS[3] : undefined);
  return hit ? hit.kg : null;
};

export default function PurchasesPage() {
  const t = useTranslations('Purchases');
  const tCalc = useTranslations('BillAutoCalc');
  const { profile, activeShopId } = useBusinessStore();

  // Result of the last Auto-Calculate run in the add/edit form. `sig` pins it
  // to the item snapshot it ran on, so it auto-hides the moment any line is
  // edited afterwards (no per-input wiring needed).
  const [autoCalc, setAutoCalc] = useState<{ type: 'ok' | 'fixed' | 'needQty' | 'empty'; count?: number; sig: string } | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mounted, setMounted] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [showReturnsHistory, setShowReturnsHistory] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<any>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const [convertingRaw, setConvertingRaw] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleteReverseStock, setDeleteReverseStock] = useState(true);
  const [showReturnModal, setShowReturnModal] = useState(false);

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

  // Purchases used to be gated to the Udyog/wholesale tier — now every
  // package has the 'purchases' module (see lib/config/packageConfig.ts), so
  // these fetches no longer re-check subscriptionPlan; the sidebar module
  // list is the single access gate. Godowns/warehouses remain Udyog/Bada
  // Udyog-only (lib/planGates.ts) — a Dukan/Vyapar purchase just isn't
  // assigned to one (see warehouseId handling in handleSave below).
  const shouldFetchDetails = showAdd;
  const hasWarehouses = canUseGodowns(profile.subscriptionPlan);

  const purchasesQuery = useMemo(() => {
    const params = new URLSearchParams({ limit: '200' });
    if (debouncedSearch) params.set('q', debouncedSearch);
    if (filterSupplierId) params.set('supplierId', filterSupplierId);
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);
    return `/purchases?${params.toString()}`;
  }, [debouncedSearch, filterSupplierId, dateFrom, dateTo]);

  const { data: purchasesResp, mutate: mutateInvoices, isLoading } = useSWR(
    activeShopId ? [purchasesQuery, activeShopId] : null,
    fetcher
  );
  const invoices: any[] = purchasesResp?.data || [];
  const hasActiveFilters = !!(debouncedSearch || filterSupplierId || dateFrom || dateTo);

  // Suppliers are needed both for the filter dropdown on the list and for
  // the Add/Edit form, so fetch them whenever the page is usable — not just
  // while the form is open.
  const { data: suppliersData = [], mutate: mutateSuppliers } = useSWR(
    activeShopId ? ['/suppliers', activeShopId] : null,
    fetcher
  );

  // Godowns are still an Udyog/Bada Udyog-only concept (see planGates.ts) —
  // only fetch the warehouse list for tiers that actually have any, so a
  // Dukan/Vyapar shop never sees an always-empty "select a warehouse" list.
  const { data: warehouses = [] } = useSWR(
    shouldFetchDetails && hasWarehouses && activeShopId ? ['/godowns', activeShopId] : null,
    godownsFetcher
  );

  const { data: products = [] } = useSWR(
    shouldFetchDetails && activeShopId ? ['/products', activeShopId] : null,
    fetcher
  );

  const isMill = isMillBillingPackage(profile.packageType);
  // Completed weighbridge slips that have not been used yet — an OPTIONAL shortcut, never required.
  const { data: weighSlips = [] } = useSWR(
    shouldFetchDetails && isMill && activeShopId ? ['/mill/weighbridge?status=completed', activeShopId] : null,
    fetcher
  );
  const { mutate: mutateProductsList } = useSWR(shouldFetchDetails && activeShopId ? ['/products', activeShopId] : null, fetcher);

  const { data: masterData } = useSWR(
    shouldFetchDetails && activeShopId ? ['/master-data', activeShopId] : null,
    fetcher
  );

  // Non-Udyog tiers have no godowns to pick from at all — never block
  // submit on an empty warehouse selection for them.
  const warehouseRequired = hasWarehouses;

  const suppliers = Array.isArray(suppliersData) ? suppliersData : [];

  const [supplierId, setSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [broker, setBroker] = useState(EMPTY_BROKER);
  const [tareWeightKg, setTareWeightKg] = useState('');
  const [grossWeightKg, setGrossWeightKg] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const [items, setItems] = useState<any[]>([emptyItem()]);
  const [saving, setSaving] = useState(false);
  const [slipId, setSlipId] = useState('');
  // Inline "new product" (mill): which row is creating one, and its draft.
  const [newProd, setNewProd] = useState<{ index: number; name: string; unit: string; category: string } | null>(null);
  const [creatingProd, setCreatingProd] = useState(false);

  // Inline {t('supplierLabel')} State
  const [isAddingSupplier, setIsAddingSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);

  const resetForm = () => {
    setEditingInvoice(null);
    setSupplierId('');
    setInvoiceNumber('');
    setBroker(EMPTY_BROKER);
    setTareWeightKg('');
    setGrossWeightKg('');
    setDate(new Date().toISOString().split('T')[0]);
    setWarehouseId('');
    setItems([emptyItem()]);
    setSlipId('');
    setNewProd(null);
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
      setTareWeightKg(full.tareWeightKg != null ? String(full.tareWeightKg) : '');
      setGrossWeightKg(full.grossWeightKg != null ? String(full.grossWeightKg) : '');
      // Purchase items come back as a flat list — each colour/size a saved
      // invoice covered is its own row with the same productId. Group them
      // back into one form row per product so re-editing shows the same
      // "quantity per colour/size" grid the Add form uses, instead of one
      // row per variant with a stray single-variant picker.
      const byProduct = new Map<string, any[]>();
      (full.purchaseItems || []).forEach((it: any) => {
        const list = byProduct.get(it.productId) || [];
        list.push(it);
        byProduct.set(it.productId, list);
      });
      const grouped: any[] = [];
      byProduct.forEach((list, productId) => {
        const withVariant = list.filter(it => it.variantKey);
        const withoutVariant = list.filter(it => !it.variantKey);
        if (withVariant.length > 0) {
          const variantQty: Record<string, string> = {};
          withVariant.forEach(it => { variantQty[it.variantKey] = String(it.quantity); });
          const first = withVariant[0];
          grouped.push({
            productId, quantity: 1, cost: first.cost, batchNumber: first.batch?.batchNumber || '', unitId: '', conversionFactor: 1, variantQty,
            costMode: first.mrp != null ? 'mrp_based' : 'manual', mrp: first.mrp ?? '', discountPercent: first.discountPercent ?? '',
          });
        }
        withoutVariant.forEach(it => {
          grouped.push({
            productId, quantity: it.quantity, cost: it.cost, batchNumber: it.batch?.batchNumber || '', unitId: '', conversionFactor: 1, variantQty: {},
            costMode: it.mrp != null ? 'mrp_based' : 'manual', mrp: it.mrp ?? '', discountPercent: it.discountPercent ?? '',
          });
        });
      });
      setItems(grouped.length > 0 ? grouped : [emptyItem()]);
      setShowAdd(true);
    } catch (err: any) {
      alert('Failed to load purchase for editing: ' + (err?.response?.data?.error || err.message));
    }
  };

  // Expands each form row into one API item per unit actually being
  // received — a variant-product row becomes one item per colour/size that
  // has a qty entered (sharing that row's cost/batch/unit), a plain row
  // passes through unchanged. Reused for both the save payload and the
  // live credit-limit total below so they can never disagree.
  const expandItemsForApi = (rows: any[]) => rows.flatMap((item: any) => {
    const product = products.find((p: any) => p.id === item.productId);
    const productVariants: any[] = Array.isArray(product?.variants) ? product.variants : [];
    const cost = effectiveItemCost(item);
    const mrp = item.costMode === 'mrp_based' && item.mrp !== '' ? Number(item.mrp) : null;
    const discountPercent = item.costMode === 'mrp_based' && item.discountPercent !== '' ? Number(item.discountPercent) : null;
    // Optional — this lot's real selling price, distinct from the product's
    // shelf price, so profit/reporting can eventually reflect what THIS
    // batch actually cost vs. sold for. Blank just means "use the product's
    // normal price," same as leaving MRP/discount blank does today.
    const sellingPrice = item.sellingPrice !== '' && item.sellingPrice != null ? Number(item.sellingPrice) : null;
    if (productVariants.length > 0) {
      return Object.entries(item.variantQty || {})
        .filter(([, qty]) => Number(qty) > 0)
        .map(([variantKey, qty]) => ({
          productId: item.productId,
          variant: variantKey,
          quantity: Number(qty),
          cost, mrp, discountPercent, sellingPrice,
          batchNumber: item.batchNumber,
          expiryDate: item.expiryDate || undefined,
          unitId: item.unitId,
          conversionFactor: item.conversionFactor,
        }));
    }
    const addToRawMaterial = isMill ? (item.toRaw ?? (product?.millCategory === 'raw_material')) : undefined;
    return item.productId && item.quantity > 0 ? [{ ...item, cost, mrp, discountPercent, sellingPrice, ...(isMill ? { addToRawMaterial } : {}) }] : [];
  });

  const setItemUnit = (index: number, unitKey: string) => {
    const newItems = [...items];
    const prod = products.find((p: any) => p.id === newItems[index].productId);
    const u = MILL_UNITS.find(x => x.key === unitKey);
    const base = kgPerBase(prod?.baseUnit);
    newItems[index].unitLabel = unitKey;
    newItems[index].unitId = '';
    newItems[index].conversionFactor = u && base ? u.kg / base : 1;
    setItems(newItems);
  };

  // Fill the form from a completed weighbridge slip. Every field stays editable, and nothing is linked until the purchase is saved.
  const importSlip = (id: string) => {
    setSlipId(id);
    const slip = weighSlips.find((x: any) => x.id === id);
    if (!slip) return;
    if (slip.supplierId) setSupplierId(slip.supplierId);
    const prod = slip.productId ? products.find((p: any) => p.id === slip.productId) : null;
    const base = kgPerBase(prod?.baseUnit) || 1;
    setItems([{ ...emptyItem(), productId: slip.productId || '', quantity: Number(slip.netWeightKg) || 1, cost: Number(slip.ratePerKg) || 0, unitLabel: 'kg', conversionFactor: 1 / base }]);
  };

  // Product Master creation, only after the user confirms it in the inline form.
  const createProductInline = async () => {
    if (!newProd || !newProd.name.trim()) return;
    setCreatingProd(true);
    try {
      const millCategory = newProd.category;
      const label = millCategory === 'raw_material' ? 'Raw Material' : millCategory === 'finished_goods' ? 'Finished Goods' : 'By-Products';
      const { data: created } = await api.post('/products', { name: newProd.name.trim(), category: label, millCategory, baseUnit: newProd.unit, currentStock: 0, sellingPrice: 0 });
      await mutateProductsList();
      const newItems = [...items];
      const u = MILL_UNITS.find(x => x.key === newProd.unit);
      newItems[newProd.index].productId = created.id;
      newItems[newProd.index].unitLabel = u ? u.key : '';
      newItems[newProd.index].conversionFactor = 1;
      setItems(newItems);
      setNewProd(null);
    } catch (err: any) {
      alert('Failed to create product: ' + (err?.response?.data?.detail || err?.response?.data?.error || err.message));
    } finally {
      setCreatingProd(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const payload = {
      supplierId,
      warehouseId: warehouseId || null,
      invoiceNumber,
      date,
      items: expandItemsForApi(items),
      ...(isMill && slipId && !editingInvoice ? { weighbridgeEntryId: slipId } : {}),
      ...(isMill && tareWeightKg !== '' ? { tareWeightKg } : {}),
      ...(isMill && grossWeightKg !== '' ? { grossWeightKg } : {}),
    };

    try {
      if (editingInvoice) {
        await api.patch(`/purchases/${editingInvoice.id}`, payload);
      } else {
        const res = await api.post('/purchases', payload);
        // Broker + commission: best-effort, after the purchase is safely saved (a failure never undoes the bill).
        if (isMill && broker.name.trim()) {
          const inv = res?.data?.invoice;
          api.post('/mill/broker-commission', { name: broker.name, commission: broker.commission, billNumber: inv?.invoiceNumber || invoiceNumber || inv?.id, kind: 'supplier', purchaseInvoiceId: inv?.id })
            .catch((e: any) => console.error('Broker commission not saved:', e));
        }
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

  // Opens the confirm modal instead of deleting directly — the shopkeeper
  // needs to choose whether stock should be reversed too (see
  // confirmDelete below for why: reversing can be blocked if that stock has
  // already been sold, which used to leave a wrong/duplicate invoice stuck
  // forever with no way to remove it).
  const handleDelete = (inv: any) => {
    setDeleteReverseStock(true);
    setDeleteTarget(inv);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/purchases/${deleteTarget.id}`, { data: { reverseStock: deleteReverseStock } });
      setSelectedInvoice(null);
      setDeleteTarget(null);
      mutateInvoices();
    } catch (err: any) {
      alert(err?.response?.data?.error || err.message || 'Failed to delete purchase.');
    } finally {
      setDeleting(false);
    }
  };

  // Prints one sticker per unit of stock this purchase actually brought in —
  // each line's own batch barcode (e.g. "PROD101-B1"), not the product's
  // shared barcode, so a scan at billing time lands on the exact lot and its
  // real cost/profit (see the batch-aware FIFO logic in billing/route.ts).
  const printBatchLabels = async (inv: any) => {
    const rows = (inv.purchaseItems || [])
      .filter((item: any) => item.batch?.barcode)
      .map((item: any) => ({
        name: item.product?.name || '',
        variantKey: item.batch.batchNumber ? `Batch ${item.batch.batchNumber}` : undefined,
        barcode: item.batch.barcode,
        sellingPrice: item.batch.sellingPrice ?? item.product?.sellingPrice ?? undefined,
        mrp: item.mrp ?? item.product?.mrp ?? undefined,
        copies: Math.max(1, Math.round(item.batch.initialQuantity ?? item.quantity ?? 1)),
        sku: item.product?.sku,
      }));
    if (!rows.length) {
      alert(t('noBatchesToPrint') || 'No batch barcodes were generated for this purchase.');
      return;
    }
    const shopId = typeof window !== 'undefined' ? (localStorage.getItem('ks_active_shop_id') || '') : '';
    const activeProfile = shopId ? resolveActiveProfile(shopId) : null;
    await printLabelSheet(rows, {
      profile: activeProfile || undefined,
      title: `${inv.invoiceNumber || inv.id} — Batch Labels`,
    });
  };

  // After a purchase return saves, `selectedInvoice` (a snapshot captured
  // when the row was clicked) is stale — re-fetch the single invoice
  // (now including its purchaseReturns) so "remaining"/"Net Payable" reflect
  // it immediately, and refresh the background list for the same reason.
  const refreshSelectedInvoice = async (id: string) => {
    try {
      const { data } = await api.get(`/purchases/${id}`);
      setSelectedInvoice(data);
    } catch (err) {
      console.error('Failed to refresh purchase invoice', err);
    }
    mutateInvoices();
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
  const purchaseTotal = expandItemsForApi(items).reduce((sum, item: any) => sum + (Number(item.quantity) || 0) * (Number(item.cost) || 0), 0);
  const baselineOutstanding = (selectedSupplier?.balance || 0) - (editingInvoice?.totalCost || 0);
  const projectedOutstanding = baselineOutstanding + purchaseTotal;
  const overCreditLimitBy = selectedSupplier?.creditLimit > 0 ? projectedOutstanding - selectedSupplier.creditLimit : 0;

  /**
   * Auto-Calculate for the purchase form: re-run the SAME Qty × Cost maths
   * (via effectiveItemCost / expandItemsForApi) the total already uses, and
   * snap every mistyped MRP / discount / variant-qty field to a clean number
   * so a "₹1,200" that was silently reading as 0 is fixed and the total
   * refreshes. Reports whether all lines were already correct, how many it
   * cleaned, or how many still have no quantity. Never changes the formula.
   */
  function autoCalculatePurchase() {
    if (!items.length) { setAutoCalc({ type: 'empty', sig: '' }); return; }
    let fixed = 0;
    const next = items.map((it: any) => {
      const mrp = it.costMode === 'mrp_based' ? cleanPurchaseNumStr(it.mrp) : it.mrp;
      const discountPercent = it.costMode === 'mrp_based' ? cleanPurchaseNumStr(it.discountPercent) : it.discountPercent;
      const variantQty: Record<string, string> = {};
      for (const [k, v] of Object.entries(it.variantQty || {})) variantQty[k] = cleanPurchaseNumStr(v);
      if (mrp !== it.mrp || discountPercent !== it.discountPercent || JSON.stringify(variantQty) !== JSON.stringify(it.variantQty || {})) fixed++;
      return { ...it, mrp, discountPercent, variantQty };
    });
    setItems(next);
    // A line that has a product but expands to zero receivable units still
    // needs a quantity — surface that rather than silently saving nothing.
    const needQty = next.filter((it: any) => it.productId && expandItemsForApi([it]).length === 0).length;
    const sig = purchaseItemsSig(next);
    if (fixed > 0) setAutoCalc({ type: 'fixed', count: fixed, sig });
    else if (needQty > 0) setAutoCalc({ type: 'needQty', count: needQty, sig });
    else setAutoCalc({ type: 'ok', sig });
  }

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
                        placeholder={t('enterSupplierName') || 'Enter supplier name...'}
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
                {hasWarehouses ? (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">{t('warehouseLocation') || 'Warehouse Location'} <span className="text-red-500">*</span></label>
                    <select required value={warehouseId} onChange={e => setWarehouseId(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors">
                      <option value="">{t('selectWarehouse') || 'Select Warehouse'}</option>
                      {warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
                ) : (
                  <div className="flex items-end pb-2.5">
                    <p className="text-xs text-slate-400">{t('noWarehouseTracking') || "No warehouse tracking on your plan — stock adds directly to shop inventory."}</p>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">{t('invoiceNumber') || 'Invoice Number'}</label>
                  <input type="text" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors" placeholder="e.g. INV-2023-001" />
                </div>
                {isMill && !editingInvoice && (
                  <div className="sm:col-span-2"><BrokerField kind="supplier" value={broker} onChange={setBroker} /></div>
                )}
                {isMill && (
                  <div className="sm:col-span-2 grid grid-cols-3 gap-2" data-testid="weight-fields">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">Tare Weight (kg)</label>
                      <input type="number" min="0" step="0.001" value={tareWeightKg} onChange={e => setTareWeightKg(e.target.value)}
                        className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">Gross Weight (kg)</label>
                      <input type="number" min="0" step="0.001" value={grossWeightKg} onChange={e => setGrossWeightKg(e.target.value)}
                        className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">Net Weight (kg)</label>
                      <div className="w-full px-3 py-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-500 dark:text-slate-400">
                        {tareWeightKg !== '' && grossWeightKg !== '' ? Math.max(0, Number(grossWeightKg) - Number(tareWeightKg)).toLocaleString('en-IN') : '—'}
                      </div>
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">{t('purchaseDate') || 'Purchase Date'}</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors" />
                </div>
              </div>
            </CardContent>
          </Card>

          {isMill && !editingInvoice && (
            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm" data-testid="weighbridge-import">
              <CardContent className="p-6 space-y-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('millImportTitle')}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('millImportHint')}</p>
                <select value={slipId} onChange={e => e.target.value ? importSlip(e.target.value) : setSlipId('')}
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="">{weighSlips.length ? t('millImportNone') : t('millImportEmpty')}</option>
                  {weighSlips.map((w: any) => (
                    <option key={w.id} value={w.id}>{w.slipNumber} · {w.vehicleNumber}{w.materialDescription ? ` · ${w.materialDescription}` : ''} · {w.netWeightKg} kg</option>
                  ))}
                </select>
              </CardContent>
            </Card>
          )}

          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
            <CardContent className="p-6">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4">{t('itemsLabel') || 'Items'}</h3>
              {editingInvoice && (
                <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg px-3 py-2 mb-4">
                  {t('editPurchaseNote') || 'Quantities, costs, and batch numbers are in each product\'s base unit. Editing these will update product stock and cost price accordingly.'}
                </p>
              )}

              <div className="space-y-4">
                {items.map((item, index) => {
                  const selectedProduct = products.find((p: any) => p.id === item.productId);
                  const productVariants: any[] = Array.isArray(selectedProduct?.variants) ? selectedProduct.variants : [];
                  const hasVariants = productVariants.length > 0;
                  const singleColour: string = !hasVariants && selectedProduct
                    ? (Array.isArray(selectedProduct.metadata?.colors) ? selectedProduct.metadata.colors[0] : (selectedProduct.metadata?.color || ''))
                    : '';
                  return (
                  <div key={index} className="flex flex-col gap-3 p-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-800/30">
                    <div className="flex flex-wrap md:flex-nowrap gap-3 items-end">
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">{t('productLabel') || 'Product'}</label>
                      <select required value={item.productId} onChange={e => {
                        const newItems = [...items];
                        newItems[index].productId = e.target.value;
                        newItems[index].variantQty = {}; // stale picks from the previous product
                        setItems(newItems);
                      }} className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors">
                        <option value="">{t('selectProduct') || 'Select Product...'}</option>
                        {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      {isMill && (
                        <>
                          <button type="button" onClick={() => setNewProd({ index, name: '', unit: 'kg', category: 'raw_material' })}
                            className="mt-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1">
                            <Plus size={12} /> {t('millNewProduct')}
                          </button>
                          {newProd?.index === index && (
                            <div className="mt-2 grid grid-cols-2 gap-2 p-3 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10" data-testid="new-product-form">
                              <input autoFocus placeholder={t('millNewProductName')} value={newProd.name} onChange={e => setNewProd({ ...newProd, name: e.target.value })}
                                className="col-span-2 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white" />
                              <select value={newProd.category} onChange={e => setNewProd({ ...newProd, category: e.target.value })}
                                className="px-2 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white">
                                <option value="raw_material">{t('millCatRaw')}</option>
                                <option value="finished_goods">{t('millCatFinished')}</option>
                                <option value="by_product">{t('millCatByProduct')}</option>
                              </select>
                              <select value={newProd.unit} onChange={e => setNewProd({ ...newProd, unit: e.target.value })}
                                className="px-2 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white">
                                {MILL_UNITS.slice(0, 3).map(u => <option key={u.key} value={u.key}>{u.label}</option>)}
                              </select>
                              <p className="col-span-2 text-[10px] text-amber-700 dark:text-amber-400">{t('millNewProductHint')}</p>
                              <div className="col-span-2 flex gap-2 justify-end">
                                <button type="button" onClick={() => setNewProd(null)} className="px-3 py-1.5 text-xs font-semibold text-slate-500">{t('cancel') || 'Cancel'}</button>
                                <button type="button" onClick={createProductInline} disabled={creatingProd || !newProd.name.trim()}
                                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 flex items-center gap-1">
                                  {creatingProd ? <Loader2 size={12} className="animate-spin" /> : null} {t('millConfirmCreate')}
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {singleColour && (
                      <div className="w-32">
                        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">{t('colour') || 'Colour'}</label>
                        {/* Highlighted like a selected chip (not just a swatch
                            dot) — a plain dot is invisible for White against
                            this background, so the border/ring/fill is what
                            actually reads as "this colour is confirmed". */}
                        <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-500 bg-emerald-50 dark:bg-emerald-500/15 ring-1 ring-emerald-500 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                          <span className="w-3 h-3 rounded-full border border-slate-400 shrink-0" style={{ backgroundColor: singleColour.toLowerCase() }} />
                          {singleColour}
                        </div>
                      </div>
                    )}
                    {!hasVariants && (
                      <div className="w-24">
                        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">{t('qty') || 'Qty'}</label>
                        <input type="number" required min={isMill ? '0.001' : '1'} step={isMill ? 'any' : undefined} value={item.quantity} onChange={e => {
                          const newItems = [...items];
                          newItems[index].quantity = isMill ? (parseFloat(e.target.value) || 0) : (parseInt(e.target.value) || 1);
                          setItems(newItems);
                        }} className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors" />
                      </div>
                    )}
                    {isMill ? (
                      <div className="w-36">
                        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">{t('unit') || 'Unit'}</label>
                        <select value={item.unitLabel || (kgPerBase(selectedProduct?.baseUnit) !== null ? String(selectedProduct?.baseUnit || 'kg').toLowerCase() : '')} onChange={e => setItemUnit(index, e.target.value)}
                          disabled={!!selectedProduct && kgPerBase(selectedProduct?.baseUnit) === null}
                          className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                          {MILL_UNITS.map(u => <option key={u.key} value={u.key}>{u.label}</option>)}
                        </select>
                        {item.conversionFactor && item.conversionFactor !== 1 && Number(item.quantity) > 0 && (
                          <p className="text-[10px] text-slate-500 mt-0.5">{t('millAddsToStock', { qty: Math.round(Number(item.quantity) * item.conversionFactor * 1000) / 1000, unit: selectedProduct?.baseUnit || 'kg' })}</p>
                        )}
                      </div>
                    ) : (
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
                    )}
                    <div className="w-32">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">{t('unitCost') || 'Unit Cost'}</label>
                        <div className="flex bg-slate-200 dark:bg-slate-700 rounded p-0.5">
                          {(['manual', 'mrp_based'] as const).map(mode => (
                            <button key={mode} type="button"
                              onClick={() => {
                                const newItems = [...items];
                                newItems[index].costMode = mode;
                                // Pre-fill from the product's own MRP the first time this
                                // row switches to MRP-based, so there's usually nothing to
                                // type but the discount % — still fully editable per line.
                                if (mode === 'mrp_based' && !newItems[index].mrp && selectedProduct?.mrp) {
                                  newItems[index].mrp = String(selectedProduct.mrp);
                                }
                                setItems(newItems);
                              }}
                              className={cn('px-1 rounded text-[7px] font-bold uppercase',
                                (item.costMode || 'manual') === mode ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400' : 'text-slate-400')}>
                              {mode === 'manual' ? 'Man' : 'MRP'}
                            </button>
                          ))}
                        </div>
                      </div>
                      {item.costMode === 'mrp_based' ? (
                        <p className="w-full px-3 py-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg text-sm text-amber-600 dark:text-amber-400 font-bold">
                          ₹{effectiveItemCost(item).toFixed(2)}
                        </p>
                      ) : (
                        <input type="number" step="0.01" required value={item.cost} onChange={e => {
                          const newItems = [...items];
                          newItems[index].cost = parseFloat(e.target.value) || 0;
                          setItems(newItems);
                        }} className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors" />
                      )}
                    </div>
                    <div className="w-32">
                      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">{t('batchOptional') || 'Batch (Opt)'}</label>
                      <input type="text" value={item.batchNumber} onChange={e => {
                        const newItems = [...items];
                        newItems[index].batchNumber = e.target.value;
                        setItems(newItems);
                      }} className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors" placeholder="LOT-001" />
                    </div>
                    <div className="w-36">
                      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Expiry (Opt)</label>
                      <input type="date" value={item.expiryDate || ''} onChange={e => {
                        const newItems = [...items];
                        (newItems[index] as any).expiryDate = e.target.value;
                        setItems(newItems);
                      }} className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
                    </div>
                    <div className="w-32">
                      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">{t('sellingPriceOptional') || 'Sell Price (Opt)'}</label>
                      <input type="number" step="0.01" min="0" value={item.sellingPrice} onChange={e => {
                        const newItems = [...items];
                        newItems[index].sellingPrice = e.target.value;
                        setItems(newItems);
                      }} className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors" placeholder="0" />
                    </div>
                    <button type="button" onClick={() => setItems(items.filter((_, i) => i !== index))}
                      className="w-10 h-10 flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors">
                      <X size={16} />
                    </button>
                    </div>
                    {item.costMode === 'mrp_based' && (
                      <div className="flex gap-3 max-w-xs">
                        <div className="flex-1">
                          <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">MRP</label>
                          <input type="number" step="0.01" min="0" placeholder={selectedProduct?.mrp ? String(selectedProduct.mrp) : '0'}
                            value={item.mrp} onChange={e => {
                              const newItems = [...items];
                              newItems[index].mrp = e.target.value;
                              setItems(newItems);
                            }} className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors" />
                        </div>
                        <div className="flex-1">
                          <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Discount %</label>
                          <input type="number" step="0.01" min="0" max="100" placeholder="0"
                            value={item.discountPercent} onChange={e => {
                              const newItems = [...items];
                              newItems[index].discountPercent = e.target.value;
                              setItems(newItems);
                            }} className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors" />
                        </div>
                      </div>
                    )}
                    {isMill && item.productId && (
                      <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer" data-testid="to-raw-toggle">
                        <input type="checkbox" checked={item.toRaw ?? (selectedProduct?.millCategory === 'raw_material')}
                          onChange={e => { const n = [...items]; n[index].toRaw = e.target.checked; setItems(n); }} />
                        {t('millAddToRaw')}
                      </label>
                    )}
                    {hasVariants && (
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1.5">
                          {t('quantityPerVariant') || 'Quantity per Colour/Size'}
                        </label>
                        {/* One qty box per colour/size on this product — fill in
                            as many as this shipment covers in one go, instead of
                            adding a whole separate row per variant. */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                          {productVariants.map((v: any, vi: number) => {
                            const key = variantRowKey(v);
                            const label = [v.color, v.size].filter(Boolean).join(' / ') || key || `#${vi + 1}`;
                            return (
                              <div key={key || vi} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                                {v.color && <span className="w-2.5 h-2.5 rounded-full border border-slate-400 shrink-0" style={{ backgroundColor: v.color.toLowerCase() }} />}
                                <span className="flex-1 text-xs text-slate-700 dark:text-slate-200 truncate" title={label}>{label}</span>
                                <input
                                  type="number" min="0" step="any" placeholder="0"
                                  value={item.variantQty?.[key] || ''}
                                  onChange={e => {
                                    const newItems = [...items];
                                    newItems[index].variantQty = { ...newItems[index].variantQty, [key]: e.target.value };
                                    setItems(newItems);
                                  }}
                                  className="w-14 shrink-0 px-1.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs text-right focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white"
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  );
                })}

                <button type="button" onClick={() => setItems([...items, emptyItem()])}
                  className="w-full py-3 border-2 border-dashed border-emerald-200 dark:border-emerald-500/30 rounded-xl text-emerald-600 dark:text-emerald-400 font-medium hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors flex items-center justify-center gap-2">
                  <Plus size={18} /> {t('addAnotherProduct') || 'Add Another Product'}
                </button>

                {/* Auto-Calculate — re-runs the same Qty × Cost maths, cleans
                    any mistyped MRP/discount/variant qty, and surfaces the
                    running total the form otherwise never shows. Translation-
                    driven (BillAutoCalc namespace). */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={autoCalculatePurchase}
                    title={tCalc('tooltip')}
                    className="sm:w-auto py-2.5 px-4 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-300 font-bold text-sm hover:bg-blue-100 dark:hover:bg-blue-500/20 flex items-center justify-center gap-2 transition-colors"
                  >
                    <Calculator size={16} /> {tCalc('button')}
                  </button>
                  <div className="flex-1 flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('totalAmount') || 'Total Amount'}</span>
                    <span className="text-lg font-black text-slate-900 dark:text-white font-mono">₹{purchaseTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
                {autoCalc && autoCalc.sig === purchaseItemsSig(items) && (
                  autoCalc.type === 'ok' ? (
                    <p className="text-[12px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 px-1">
                      <Check size={14} className="shrink-0" /> {tCalc('allCorrect')}
                    </p>
                  ) : autoCalc.type === 'fixed' ? (
                    <p className="text-[12px] font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1.5 px-1">
                      <Sparkles size={14} className="shrink-0" /> {tCalc('corrected', { count: autoCalc.count ?? 0 })}
                    </p>
                  ) : autoCalc.type === 'needQty' ? (
                    <p className="text-[12px] font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5 px-1">
                      <AlertTriangle size={14} className="shrink-0" /> {tCalc('needsQty', { count: autoCalc.count ?? 0 })}
                    </p>
                  ) : (
                    <p className="text-[12px] font-semibold text-slate-500 flex items-center gap-1.5 px-1">
                      <AlertTriangle size={14} className="shrink-0" /> {tCalc('noItems')}
                    </p>
                  )
                )}
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
            <button type="submit" disabled={saving || !supplierId || (warehouseRequired && !warehouseId)}
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
          <button onClick={() => setShowReturnsHistory(true)} data-testid="purchase-returns-history-btn"
            className="bg-white dark:bg-slate-800 border border-orange-200 dark:border-orange-500/30 text-orange-600 dark:text-orange-400 px-5 py-2.5 rounded-xl font-bold shadow-sm flex items-center gap-2 transition-colors hover:bg-orange-50 dark:hover:bg-orange-500/10">
            <RotateCcw size={18} /> Returns</button>
          <button onClick={openAdd}
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-bold shadow-sm flex items-center gap-2 transition-colors">
            <Plus size={18} /> {t('newPurchase') || 'New Purchase'}</button>
        </div>
      </div>
      {showReturnsHistory && <PurchaseReturnsHistoryModal onClose={() => setShowReturnsHistory(false)} />}

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
                    <td className="px-5 py-4 font-medium text-slate-900 dark:text-white">{fmtDate(inv.date)}</td>
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
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{fmtDate(selectedInvoice.date)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('totalAmount') || 'Total Amount'}</p>
                  <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono">₹{(selectedInvoice.totalCost || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                </div>
                {isMill && (selectedInvoice.tareWeightKg != null || selectedInvoice.grossWeightKg != null) && (
                  <div className="col-span-2 md:col-span-4 grid grid-cols-3 gap-2" data-testid="weight-display">
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Tare Weight</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white font-mono">{selectedInvoice.tareWeightKg != null ? `${selectedInvoice.tareWeightKg.toLocaleString('en-IN')} kg` : '-'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Gross Weight</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white font-mono">{selectedInvoice.grossWeightKg != null ? `${selectedInvoice.grossWeightKg.toLocaleString('en-IN')} kg` : '-'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Net Weight</p>
                      <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                        {selectedInvoice.tareWeightKg != null && selectedInvoice.grossWeightKg != null ? `${Math.max(0, selectedInvoice.grossWeightKg - selectedInvoice.tareWeightKg).toLocaleString('en-IN')} kg` : '-'}
                      </p>
                    </div>
                  </div>
                )}
                {isMill && (
                  <div className="col-span-2 md:col-span-4">
                    <PurchaseBillPhotos invoice={selectedInvoice} onSaved={(docs) => setSelectedInvoice((inv: any) => inv && { ...inv, supplier: { ...inv.supplier, documents: docs } })} />
                  </div>
                )}
                {Array.isArray(selectedInvoice.charges) && selectedInvoice.charges.length > 0 && (
                  <div className="col-span-2 md:col-span-4" data-testid="purchase-charges">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Bill charges (included in the total)</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedInvoice.charges.map((c: any, i: number) => (
                        <span key={i} className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30">
                          {c.name}: ₹{Number(c.amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {purchaseTotalReturnedAmount(selectedInvoice) > 0 && (
                  <>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Returned</p>
                      <p className="text-sm font-bold text-red-600 dark:text-red-400 font-mono">−₹{purchaseTotalReturnedAmount(selectedInvoice).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Net Payable</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white font-mono">₹{Math.max(0, (selectedInvoice.totalCost || 0) - purchaseTotalReturnedAmount(selectedInvoice)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                    </div>
                  </>
                )}
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
                      <th className="px-4 py-3 font-bold text-xs uppercase tracking-wider text-right text-slate-500 dark:text-slate-400">MRP</th>
                      <th className="px-4 py-3 font-bold text-xs uppercase tracking-wider text-right text-slate-500 dark:text-slate-400">Purchase %</th>
                      <th className="px-4 py-3 font-bold text-xs uppercase tracking-wider text-right text-slate-500 dark:text-slate-400">{t('unitCost') || 'Unit Cost'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {selectedInvoice.purchaseItems?.map((item: any) => {
                      const returnedForRow = purchaseReturnedQtyByKey(selectedInvoice).get(`${item.productId}::${item.variantKey || ''}`) || 0;
                      return (
                        <tr key={item.id} className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="px-4 py-3 text-slate-900 dark:text-slate-200 font-bold">
                            {item.product?.name}
                            {returnedForRow > 0 && <span className="block text-[10px] font-semibold text-red-500 dark:text-red-400">−{returnedForRow} returned</span>}
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{item.quantity}</td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-right font-mono">{item.mrp != null ? `₹${item.mrp.toLocaleString('en-IN')}` : '—'}</td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-right font-mono">{item.discountPercent != null ? `${item.discountPercent}%` : '—'}</td>
                          <td className="px-4 py-3 text-slate-900 dark:text-white text-right font-mono font-medium">₹{(item.cost || 0).toLocaleString('en-IN')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center">
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => openEdit(selectedInvoice)}
                  className="px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <Pencil size={14} /> {t('edit') || 'Edit'}
                </button>
                <button onClick={() => setShowReturnModal(true)}
                  className="px-4 py-2.5 bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30 rounded-xl text-sm font-bold shadow-sm hover:bg-orange-100 dark:hover:bg-orange-500/20 transition-colors flex items-center gap-2 text-orange-600 dark:text-orange-400">
                  <RotateCcw size={14} /> Return
                </button>
                <button onClick={() => printBatchLabels(selectedInvoice)}
                  className="px-4 py-2.5 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 rounded-xl text-sm font-bold shadow-sm hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                  <Printer size={14} /> {t('printBatchLabels') || 'Print Batch Labels'}
                </button>
                {isMill && selectedInvoice.hasRawMaterialItems && (
                  selectedInvoice.rawMaterialAdded ? (
                    <span data-testid="raw-material-already-added"
                      className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-500 dark:text-slate-400 flex items-center gap-2">
                      <Check size={14} className="text-emerald-600" /> Already Added
                    </span>
                  ) : (
                    <button onClick={async () => {
                      setConvertingRaw(true);
                      try {
                        await api.post(`/purchases/${selectedInvoice.id}/to-raw-material`, {});
                        setSelectedInvoice((inv: any) => inv && { ...inv, rawMaterialAdded: true });
                        mutateInvoices();
                      } catch (err: any) {
                        alert(err?.response?.data?.detail || err?.response?.data?.error || 'Could not add to Raw Material.');
                      } finally { setConvertingRaw(false); }
                    }} disabled={convertingRaw} data-testid="add-to-raw-material"
                      className="px-4 py-2.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl text-sm font-bold shadow-sm hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors flex items-center gap-2 disabled:opacity-50">
                      {convertingRaw ? <Loader2 size={14} className="animate-spin" /> : <Wheat size={14} />} Add to Raw Material
                    </button>
                  )
                )}
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

      {showReturnModal && selectedInvoice && (
        <PurchaseReturnModal
          invoice={selectedInvoice}
          onClose={() => setShowReturnModal(false)}
          onSaved={() => refreshSelectedInvoice(selectedInvoice.id)}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 flex items-center gap-2">
              <Trash2 size={18} className="text-red-600 dark:text-red-400" />
              <h3 className="font-bold text-red-700 dark:text-red-400">
                {t('deletePurchase') || 'Delete Purchase Invoice'}
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-700 dark:text-slate-300">
                {t('deletePurchaseConfirm', { invoice: deleteTarget.invoiceNumber || deleteTarget.id, supplier: deleteTarget.supplier?.name || '' })
                  || `Delete purchase invoice "${deleteTarget.invoiceNumber || deleteTarget.id}" from ${deleteTarget.supplier?.name || 'this supplier'}? This cannot be undone.`}
              </p>

              <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteReverseStock}
                  onChange={(e) => setDeleteReverseStock(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-red-600"
                />
                <span className="text-sm">
                  <span className="block font-bold text-slate-900 dark:text-white">
                    {isMill
                      ? 'Also remove the raw material lot this purchase created'
                      : (t('reverseStockLabel') || 'Also reverse the stock this purchase added')}
                  </span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {isMill
                      ? (deleteReverseStock
                          ? 'The raw material lot created by this purchase will be deleted. Blocked if that lot has already been used in a production batch.'
                          : 'Raw material lot stays as-is — only the invoice and its supplier ledger entry are removed.')
                      : (deleteReverseStock
                          ? (t('reverseStockOnHint') || 'Stock added by this purchase will be subtracted back out. Blocked if that stock has already been sold — uncheck below to still delete the invoice.')
                          : (t('reverseStockOffHint') || 'Stock stays exactly as it is now — only the invoice and its supplier balance/ledger entry are removed.'))}
                  </span>
                </span>
              </label>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                {t('cancel') || 'Cancel'}
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="px-5 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold shadow-sm hover:bg-red-700 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {t('delete') || 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Bada Udyog: the physical bill / weighbridge-slip photo for one purchase. Reuses the exact storage Suppliers already use for bill
// photos (Supplier.documents, tagged by an id — transactionId there, purchaseInvoiceId here) so no schema change is needed.
function PurchaseBillPhotos({ invoice, onSaved }: { invoice: any; onSaved: (docs: any[]) => void }) {
  const [uploading, setUploading] = useState(false);
  const docs: any[] = Array.isArray(invoice.supplier?.documents) ? invoice.supplier.documents : [];
  const mine = docs.filter((d: any) => d.purchaseInvoiceId === invoice.id);

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    e.target.value = '';
    setUploading(true);
    const uploaded: any[] = [];
    try {
      for (const file of files) {
        const body = new FormData();
        body.append('file', file);
        body.append('folder', 'purchase-bills');
        const res = await api.post('/upload', body);
        if (res.data.url) uploaded.push({ id: crypto.randomUUID(), url: res.data.url, uploadedAt: new Date().toISOString(), name: file.name || undefined, purchaseInvoiceId: invoice.id });
      }
      if (uploaded.length) {
        const next = [...docs, ...uploaded];
        await api.patch(`/suppliers/${invoice.supplierId}`, { documents: next });
        onSaved(next);
      }
    } catch (err) {
      console.error(err);
      alert('Could not upload the bill photo. Please try again.');
    } finally { setUploading(false); }
  };

  return (
    <div data-testid="purchase-bill-photos">
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Bill / Weight Slip Photo</p>
      <div className="flex flex-wrap items-center gap-2">
        {mine.map((d: any) => (
          <a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer"
            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-emerald-400 flex items-center gap-1.5">
            <FileText size={12} /> {d.name || 'Bill'}
          </a>
        ))}
        <label className="text-xs font-bold px-3 py-1.5 rounded-lg border border-dashed border-emerald-400 text-emerald-700 dark:text-emerald-400 cursor-pointer flex items-center gap-1.5">
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} {mine.length ? 'Add another' : 'Upload photo'}
          <input type="file" accept="image/*,application/pdf" multiple onChange={upload} className="hidden" disabled={uploading} />
        </label>
      </div>
    </div>
  );
}

// Standalone history across every supplier/invoice — the per-invoice "Return" button raises one and shows it inside that one
// invoice's detail; this is every purchase return this shop has ever raised, newest first, so "did I already return this bill?"
// doesn't mean hunting through every invoice one at a time.
function PurchaseReturnsHistoryModal({ onClose }: { onClose: () => void }) {
  const profile = useBusinessStore(s => s.profile);
  const [data, setData] = useState<{ rows: any[]; summary: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const downloadPdf = async (r: any) => {
    setDownloadingId(r.id);
    try {
      // Same generator PurchaseReturnModal already uses right after raising a return — kept as the one source of truth for what
      // a return PDF looks like, so a return downloaded from here looks identical to one downloaded right after creating it.
      const { generatePurchaseReturnPdfBlob } = await import('@/lib/pdf/purchaseReturn');
      const { blob, filename } = await generatePurchaseReturnPdfBlob({
        shop: { name: profile.shopName || 'Store', address: profile.address || undefined, mobile: profile.mobile || undefined, gst: profile.gst || undefined, pan: profile.pan || undefined },
        supplierName: r.supplier?.name || 'Supplier',
        returnNumber: r.returnNumber || r.id,
        date: r.date,
        originalInvoiceNumber: r.purchaseInvoice?.invoiceNumber || '',
        items: (r.items || []).map((it: any) => ({ name: it.name, variant: it.variantKey, quantity: it.quantity, rate: it.rate, amount: it.amount })),
        totalAmount: r.totalAmount || 0,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to generate return PDF', err);
      alert('Could not generate the PDF. Please try again.');
    } finally { setDownloadingId(null); }
  };

  useEffect(() => {
    api.get('/purchases/returns').then(({ data }) => setData(data)).catch(() => setData({ rows: [], summary: { count: 0, totalAmount: 0 } })).finally(() => setLoading(false));
  }, []);

  const rows = data?.rows || [];

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-3xl max-h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <RotateCcw size={18} className="text-orange-500" /> Purchase Returns History
          </h2>
          <button onClick={onClose} className="p-2 -mr-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 rounded-full transition-colors"><X size={18} /></button>
        </div>
        {!loading && data && (
          <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-6 text-sm">
            <span className="text-slate-500">{data.summary.count} return{data.summary.count === 1 ? '' : 's'}</span>
            <span className="font-bold text-orange-600 dark:text-orange-400">₹{(data.summary.totalAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })} total</span>
          </div>
        )}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center">
              <RotateCcw size={40} className="mx-auto text-slate-300 dark:text-slate-700" />
              <p className="mt-3 text-sm text-slate-500">No purchase returns yet. Open a purchase's details and use "Return" to raise one.</p>
            </div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase text-xs sticky top-0">
                <tr>
                  <th className="px-4 py-3 font-bold">Date</th>
                  <th className="px-3 py-3 font-bold">Supplier</th>
                  <th className="px-3 py-3 font-bold">Invoice #</th>
                  <th className="px-3 py-3 font-bold">Return #</th>
                  <th className="px-3 py-3 font-bold text-right">Amount</th>
                  <th className="px-3 py-3 font-bold w-10" />
                  <th className="px-3 py-3 font-bold w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((r: any) => (
                  <>
                    <tr key={r.id} onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 cursor-pointer">
                      <td className="px-4 py-2.5 text-slate-500">{fmtDate(r.date)}</td>
                      <td className="px-3 py-2.5 font-semibold text-slate-900 dark:text-white">{r.supplier?.name || '—'}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{r.purchaseInvoice?.invoiceNumber || '—'}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{r.returnNumber || '—'}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-orange-600 dark:text-orange-400">₹{(r.totalAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                        <button onClick={() => downloadPdf(r)} disabled={downloadingId === r.id} title="Download PDF" data-testid="download-return-pdf"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-500/10 disabled:opacity-50">
                          {downloadingId === r.id ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-slate-400">{expanded === r.id ? '▲' : '▼'}</td>
                    </tr>
                    {expanded === r.id && (
                      <tr className="bg-slate-50/60 dark:bg-slate-800/30">
                        <td colSpan={7} className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            {(r.items || []).map((it: any) => (
                              <span key={it.id} className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                                <strong>{it.name}</strong>{it.variantKey ? ` (${it.variantKey})` : ''} · {it.quantity} × ₹{it.rate} = ₹{it.amount.toLocaleString('en-IN')}
                              </span>
                            ))}
                          </div>
                          {r.note && <p className="text-xs text-slate-500 mt-2 italic">{r.note}</p>}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
