'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
  X, Package, RefreshCw, Loader2, ArrowRightLeft,
  TrendingDown, MapPin, CheckCircle, Edit, Hash,
  IndianRupee, TrendingUp, Warehouse, ArrowUp, ArrowDown,
  Tag, Trash2, Barcode as BarcodeIcon, Factory, Layers,
  GitBranch, ChevronRight, Circle, CheckCircle2, Clock,
  Boxes, ArrowDownCircle, ArrowUpCircle, Scale, Copy, PackagePlus
} from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import useSWR, { useSWRConfig } from 'swr';
import ReceiveDrawer from '../stock/ReceiveDrawer';
import { invalidateProductCaches } from '@/lib/swrInvalidate';
import { calculateProductProfit, profitColorClass } from '@/lib/profitCalc';
import { ConfirmPasswordModal } from '@/components/trash/ConfirmPasswordModal';
import BarcodeQRModal from '@/components/BarcodeQRModal';
import { cssColor, splitVariantKey } from '@/components/ColorSizeVariantGrid';
import { parseSizeVariants, parseSizePrices } from '@/components/SizeVariantGrid';

// Products can be viewed via a pooled cross-shop list (All Shop Access) where
// a row belongs to a shop other than whichever one is currently "active" —
// lib/api.ts auto-fills x-shop-id from the active shop, so a bare request
// here 404s any product/godown lookup for a non-active-shop row. Passing the
// row's own shopId (see the `shopId` prop below) overrides that for just
// this request, matching the same shopIdHeader() pattern already used for
// edit/delete in WholesaleProductsUI.tsx and products/page.tsx.
function shopIdHeader(shopId?: string | null) {
  return shopId ? { headers: { 'x-shop-id': String(shopId) } } : {};
}

const fetcher = (url: string | string[]) => {
  const [target, shopIdForHeader] = Array.isArray(url) ? url : [url, undefined];
  return api.get(target, shopIdHeader(shopIdForHeader)).then(res => res.data);
};
import { useBusinessStore } from '@/lib/businessStore';
import { isWholesaleTierPackage } from '@/lib/config/packageConfig';
import { MILL_CATEGORIES, getBusinessConfig } from '@/lib/businessConfig';
import { formatMillStock } from '@/lib/millStock';

export default function ProductDetailsSheet({
  productId,
  shopId,
  onClose,
  onEdit,
  onClone,
  onNewLot,
  onDelete
}: {
  productId: string;
  /** The product's own shop — pass this whenever the caller might be
   *  showing a pooled cross-shop list, so this sheet's fetches target the
   *  right shop instead of silently falling back to whichever one is
   *  globally active. Falls back to the active shop when omitted. */
  shopId?: string;
  onClose: () => void;
  onEdit: (product: any) => void;
  /** Same product, new colour/size: opens the Add form pre-filled from this product. */
  onClone?: (product: any) => void;
  /** Same product came again (maybe at a new price): opens the New lot form. */
  onNewLot?: (product: any) => void;
  onDelete?: (productId: string) => void;
}) {
  const t = useTranslations('ProductDetails');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  const { mutate } = useSWRConfig();

  const { activeShopId, profile } = useBusinessStore();
  const effectiveShopId = shopId || activeShopId || undefined;
  const isMillShop = profile.businessType === 'millprocessing';
  const [showReceive, setShowReceive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'inventory' | 'production' | 'packing' | 'traceability'>('overview');
  const { data: godowns = [] } = useSWR(effectiveShopId ? ['/godowns', effectiveShopId] : null, fetcher);

  useEffect(() => {
    if (productId) fetchDetails();
  }, [productId]);

  const fetchDetails = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/products/${productId}/erp-details`, shopIdHeader(shopId));
      setData(res.data);
    } catch (err: any) {
      // A transient DB-pool blip (connection limit momentarily hit) surfaces
      // as a 500 here even for a perfectly real, already-saved product — one
      // quick retry clears it in practice without making a genuine 404 (bad
      // productId) wait around pointlessly.
      const status = err?.response?.status;
      if (status && status >= 500) {
        await new Promise(r => setTimeout(r, 1200));
        try {
          const res = await api.get(`/products/${productId}/erp-details`, shopIdHeader(shopId));
          setData(res.data);
        } catch (err2) {
          console.error(err2);
        }
      } else {
        console.error(err);
      }
    } finally {
      setLoading(false);
    }
  };

  const isInflow = (type: string) =>
    type === 'purchase' || type === 'transfer_in' || type === 'return';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 md:p-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Panel — full-screen on phones, centred card on tablet+. h-[100dvh]
          uses the dynamic viewport so mobile browser chrome (URL bar) and
          any keyboard don't push content off-screen. Fixes the overlap the
          client showed: the earlier p-4 gap on all sides let the busy
          product-list background bleed through around the modal edges. */}
      <div className="relative w-full max-w-3xl h-[100dvh] sm:h-auto sm:max-h-[90vh] bg-white dark:bg-slate-900 rounded-none sm:rounded-2xl shadow-2xl flex flex-col border-0 sm:border sm:border-slate-200 sm:dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">

        {/* ── Header ── */}
        <div className="flex-shrink-0 flex items-center justify-between gap-2 sm:gap-4 px-3 sm:px-5 py-3 sm:py-4 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 flex items-center justify-center flex-shrink-0">
              <Package size={20} className="text-emerald-500 dark:text-emerald-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight truncate">
                {data?.product?.name || (loading ? t('loading') : '—')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                <Tag size={10} />
                {data?.product?.barcode || data?.product?.sku || t('noSku')}
                {data?.product?.category && (
                  <span className="ml-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">
                    {data.product.category}
                  </span>
                )}
                {/* Unit the shopkeeper picked when adding this product (Kg/Gm/Piece/Bag/…
                    per the business category's own unit list) — only shown when one was
                    actually set, never a placeholder for products saved before units existed. */}
                {data?.product?.baseUnit && (
                  <span className="ml-1.5 bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 text-[10px] px-2 py-0.5 rounded-full border border-violet-200 dark:border-violet-500/20">
                    {t('unit') || 'Unit'}: {data.product.baseUnit}
                  </span>
                )}
              </p>
              {data?.product?.location && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                  <MapPin size={10} />
                  {data.product.location}
                </p>
              )}
            </div>
          </div>

          {/* Action buttons — on mobile the text labels are hidden (icons
              only) so all four fit inside the header without wrapping.
              Tablet+ shows both icon + label. Close button always visible
              and standalone. Was previously overflowing past the modal
              edge on 360px screens which contributed to the "overlap"
              client report. */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              disabled={loading}
              onClick={() => setShowReceive(true)}
              className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors disabled:opacity-40"
              title="Receive Stock"
            >
              <Package size={13} /> <span className="hidden sm:inline">Receive Stock</span>
            </button>
            <button
              disabled={loading || !data?.product}
              onClick={() => setShowBarcodeModal(true)}
              className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors disabled:opacity-40"
              title="Barcode / QR"
            >
              <BarcodeIcon size={13} /> <span className="hidden sm:inline">Barcode / QR</span>
            </button>
            {onDelete && (
              <button
                disabled={loading}
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-colors disabled:opacity-40"
                title={t('delete') || 'Delete'}
              >
                <Trash2 size={13} /> <span className="hidden sm:inline">{t('delete') || 'Delete'}</span>
              </button>
            )}
            {onNewLot && (
              <button
                disabled={loading}
                onClick={() => onNewLot(data?.product)}
                className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-xs font-semibold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/30 rounded-lg hover:bg-sky-100 dark:hover:bg-sky-500/20 transition-colors disabled:opacity-50"
                title="New lot / stock in"
              >
                <PackagePlus size={13} /> <span className="hidden sm:inline">New lot</span>
              </button>
            )}
            {onClone && (
              <button
                disabled={loading}
                onClick={() => onClone(data?.product)}
                className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-xs font-semibold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/30 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-500/20 transition-colors disabled:opacity-50"
                title="Clone — same product, new colour/size"
              >
                <Copy size={13} /> <span className="hidden sm:inline">Clone</span>
              </button>
            )}
            <button
              disabled={loading}
              onClick={() => onEdit(data?.product)}
              className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors disabled:opacity-40"
              title={t('edit')}
            >
              <Edit size={13} /> <span className="hidden sm:inline">{t('edit')}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors ml-0.5 sm:ml-1"
              title="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Tabs (mill only) ── */}
        {isMillShop && (
          <div className="flex-shrink-0 flex gap-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
            {([
              { key: 'overview',    label: 'Overview',    icon: <Hash size={12} /> },
              { key: 'inventory',   label: 'Inventory',   icon: <Warehouse size={12} /> },
              { key: 'production',  label: 'Batches',     icon: <Factory size={12} /> },
              { key: 'packing',     label: 'Packing',     icon: <Boxes size={12} /> },
              { key: 'traceability',label: 'Traceability',icon: <GitBranch size={12} /> },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors',
                  activeTab === tab.key
                    ? 'border-amber-500 text-amber-700 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-500/5'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                )}
              >
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-transparent">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500 dark:text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
              <span className="text-sm">{t('loadingDetails')}</span>
            </div>
          ) : !data ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-400 dark:text-slate-500">
              <Package size={40} className="text-slate-300 dark:text-slate-700" />
              <span className="text-sm">{t('failedToLoad')}</span>
            </div>
          ) : (
            <div className="p-5 space-y-5">

            {/* ── MILL TABS: show/hide sections by activeTab ── */}
            {(!isMillShop || activeTab === 'overview') && (<>

              {/* ── Stat Cards ──
                  Vyapar/Dukan and Udyog store cost differently:
                    • Udyog: real cost sits in `costPrice`; `wholesaleCost` is the
                      *wholesale selling* rate charged to other shopkeepers.
                    • Vyapar/Dukan: `costPrice` is usually NULL; the shopkeeper's
                      cost is written into `wholesaleCost` (see lib/fetchers.ts
                      where `cost: p.wholesaleCost` maps for the list).
                  So use `costPrice ?? wholesaleCost` as the true cost for
                  profit math, and only surface the Wholesale Rate card to
                  Udyog shops — Vyapar/Dukan users don't have that concept and
                  seeing "Wholesale Rate: ₹559" alongside "Cost Price: ₹0" was
                  confusing them. */}
              {(() => {
                const isUdyog = isWholesaleTierPackage(profile.subscriptionPlan);
                const isMill = profile.businessType === 'millprocessing';
                const cost = Number(data.product.costPrice) || Number(data.product.wholesaleCost) || 0;
                const sp = Number(data.product.sellingPrice) || 0;
                const mrp = Number(data.product.mrp) || 0;
                // Mills often leave price unset until a Purchase/Sale rate is
                // agreed — showing "Not Set" instead of ₹0 avoids reading as a
                // real (and misleading) free/zero price. Scoped to mills only
                // so every other business type's card keeps today's ₹0 look.
                const priceOrNotSet = (v: number) => (isMill && v <= 0 ? 'Not Set' : `₹${v.toLocaleString('en-IN')}`);
                const profitRes = cost > 0 && sp > 0
                  ? calculateProductProfit(sp, cost, data.product.gstPercent || 0, !!profile.gstInclusiveProfit)
                  : null;
                const mrpOffPct = mrp > 0 && sp > 0 && sp < mrp
                  ? Math.round(((mrp - sp) / mrp) * 100 * 10) / 10
                  : null;
                return (
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard
                      icon={<Hash size={14} className="text-blue-500 dark:text-blue-400" />}
                      label={t("totalStock")}
                      value={`${data.totalStock}${data.product.baseUnit ? ' ' + data.product.baseUnit : ''}`}
                      valueClass="text-blue-600 dark:text-blue-400"
                    />
                    <StatCard
                      icon={<IndianRupee size={14} className="text-emerald-500 dark:text-emerald-400" />}
                      label={t("stockValue")}
                      value={`₹${data.stockValue.toLocaleString('en-IN')}`}
                      valueClass="text-emerald-600 dark:text-emerald-400"
                    />
                    <StatCard
                      icon={<IndianRupee size={14} className="text-slate-500 dark:text-slate-400" />}
                      label={t("costPrice")}
                      value={priceOrNotSet(cost)}
                      valueClass="text-slate-900 dark:text-white"
                    />
                    <StatCard
                      icon={<TrendingUp size={14} className="text-emerald-500 dark:text-emerald-400" />}
                      label={t("sellingPrice")}
                      value={priceOrNotSet(sp)}
                      valueClass="text-emerald-600 dark:text-emerald-400"
                    />
                    {isUdyog && (
                      <StatCard
                        icon={<TrendingDown size={14} className="text-slate-500 dark:text-slate-400" />}
                        label={t("wholesaleRate") || "Wholesale Rate"}
                        value={priceOrNotSet(Number(data.product.wholesaleCost) || 0)}
                        valueClass="text-slate-900 dark:text-white"
                      />
                    )}
                    {!isUdyog && mrpOffPct !== null && (
                      <StatCard
                        icon={<TrendingDown size={14} className="text-sky-500 dark:text-sky-400" />}
                        label="% Off MRP"
                        value={`${mrpOffPct.toFixed(1)}%`}
                        valueClass="text-sky-600 dark:text-sky-400"
                      />
                    )}
                    <StatCard
                      icon={<TrendingUp size={14} className={profitRes ? profitColorClass(profitRes.status) : 'text-slate-400'} />}
                      label={t("profitMargin") || "Profit %"}
                      value={profitRes ? `${profitRes.percent.toFixed(1)}%` : '—'}
                      valueClass={profitRes ? profitColorClass(profitRes.status) : 'text-slate-400 dark:text-slate-500'}
                    />
                  </div>
                );
              })()}

              {/* ── Mill Product Master details ──
                  Generic across every mill type — reads only whatever the
                  shopkeeper configured on this product (Product Type,
                  Grade, Variety, Subcategory, Pack Size/Unit, Batch/Expiry
                  overrides); never branches on mill name. */}
              {profile.businessType === 'millprocessing' && (() => {
                const mc = MILL_CATEGORIES.find(m => m.key === data.product.millCategory);
                const millStock = formatMillStock(data.product);
                const bizConfig = getBusinessConfig(profile.businessType);
                const batchOn = data.product.trackBatch ?? bizConfig.hasBatch;
                const expiryOn = data.product.trackExpiry ?? bizConfig.hasExpiry;
                return (
                  <Section
                    icon={<Package size={14} className="text-amber-500 dark:text-amber-400" />}
                    title="Mill Product Details"
                  >
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 text-sm">
                      <DetailField label="Product Type" value={mc ? `${mc.emoji} ${mc.label}` : '-'} />
                      <DetailField label="Subcategory" value={data.product.subcategory || '-'} />
                      <DetailField label="Grade" value={data.product.grade || '-'} />
                      <DetailField label="Variety" value={data.product.variety || '-'} />
                      <DetailField label="Pack Size" value={data.product.packSize && data.product.packUnit ? `${data.product.packSize} ${data.product.packUnit} / Bag` : '-'} />
                      <DetailField label="Stock" value={[millStock.primary, millStock.secondary, millStock.tertiary].filter(Boolean).join(' · ')} />
                      <DetailField label="Batch Tracking" value={batchOn ? 'On' : 'Off'} />
                      <DetailField label="Expiry Tracking" value={expiryOn ? 'On' : 'Off'} />
                    </div>
                  </Section>
                );
              })()}

              {/* ── Variant-wise Stock ──
                  The stat cards above show the product's TOTAL stock but not
                  which colour/size it's made of. Product.variants[] already
                  carries per-variant stock (written by Purchases, Add/Edit
                  Product, and bulk import); this surfaces it here instead of
                  only inside the Add/Edit form. Same section as Stock →
                  product Overview (WholesaleStockUI.tsx) — kept in sync so
                  Products and Stock never show different variant detail. */}
              {(() => {
                // Product.variants[] is the Udyog (Bada Udyog/Wholesale) schema.
                // Vyapar/Dukan's Add/Edit Product form writes the older composite
                // "Colour / Size" string-keyed `size_variants` map instead (+
                // per-variant selling price in metadata.size_prices) — a colour/
                // size product added from that page always had variants.length
                // === 0 here, so this whole section silently never rendered for
                // it even though the stock really is split by colour/size.
                // Fall back to parsing size_variants into the same
                // {color, size, stock, sellingPrice} shape so both schemas
                // render through the one table below.
                const nativeVariants = Array.isArray(data.product.variants) ? data.product.variants : [];
                const legacyMap = nativeVariants.length === 0 ? parseSizeVariants(data.product.size_variants) : {};
                const legacyPrices = nativeVariants.length === 0 ? parseSizePrices(data.product.metadata) : {};
                const legacyVariants = Object.entries(legacyMap).map(([key, qty]) => {
                  const { color, size } = splitVariantKey(key);
                  return { color, size, stock: Number(qty) || 0, sellingPrice: legacyPrices[key]?.sellingPrice };
                });
                const variants = nativeVariants.length > 0 ? nativeVariants : legacyVariants;
                if (variants.length === 0) return null;
                // Liquor's variant grid is Bottle Type × Volume(ML), not an actual
                // colour swatch — same underlying {color, size} shape (see
                // ThreeWayVariantGrid/LIQUOR_RULES), just relabelled here so the
                // table reads "Type / ML" instead of a nonsensical colour dot.
                const isLiquor = !!getBusinessConfig(profile.businessType).hasLiquorSpecs;
                const colourCount = new Set(variants.map((v: any) => v.color).filter(Boolean)).size;
                const sizeCount = new Set(variants.map((v: any) => v.size).filter(Boolean)).size;
                const variantTotal = variants.reduce((s: number, v: any) => s + (Number(v.stock) || 0), 0);
                return (
                  <Section
                    icon={<Hash size={14} className="text-indigo-500 dark:text-indigo-400" />}
                    title={
                      <>
                        {isLiquor ? (t("mlWiseStock") || "ML-wise Stock") : (t("variantWiseStock") || "Variant-wise Stock")}
                        <span className="ml-2 text-[11px] font-semibold normal-case text-slate-500 dark:text-slate-400">
                          {colourCount > 0 && `${colourCount} ${isLiquor ? 'ML' : (colourCount > 1 ? (t('coloursLabel') || 'colours') : (t('colourLabel') || 'colour'))}`}
                          {colourCount > 0 && sizeCount > 0 && ' · '}
                          {sizeCount > 0 && `${sizeCount} ${isLiquor ? (t('typeLabel') || 'type') + (sizeCount > 1 ? 's' : '') : (sizeCount > 1 ? (t('sizesLabel') || 'sizes') : (t('sizeLabel') || 'size'))}`}
                        </span>
                      </>
                    }
                  >
                    <div className="overflow-x-auto max-h-64 overflow-y-auto">
                      <table className="w-full text-sm text-left min-w-[420px]">
                        <thead>
                          <tr className="text-xs uppercase text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 sticky top-0">
                            <th className="px-4 py-2.5 font-semibold">{isLiquor ? 'ML' : (t("colourLabel") || 'Colour')}</th>
                            <th className="px-4 py-2.5 font-semibold">{isLiquor ? (t('typeLabel') || 'Type') : (t("sizeLabel") || 'Size')}</th>
                            <th className="px-4 py-2.5 font-semibold text-right">{t("qty")}</th>
                            <th className="px-4 py-2.5 font-semibold text-right">{t("sellingPrice")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {variants.map((v: any, i: number) => {
                            const stock = Number(v.stock) || 0;
                            return (
                              <tr key={i} className={cn("hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors", stock <= 0 && 'opacity-50')}>
                                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                                  {v.color ? (
                                    isLiquor ? v.color : (
                                      <span className="flex items-center gap-1.5">
                                        <span className="w-3 h-3 rounded-full border border-slate-300 dark:border-slate-600 shrink-0" style={{ background: cssColor(v.color) }} />
                                        {v.color}
                                      </span>
                                    )
                                  ) : <span className="text-slate-400">—</span>}
                                </td>
                                <td className="px-4 py-3 text-slate-700 dark:text-slate-300 font-semibold">{v.size || '—'}</td>
                                <td className={cn("px-4 py-3 text-right font-mono font-bold", stock <= 0 ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400')}>{stock}</td>
                                <td className="px-4 py-3 text-right font-mono text-slate-600 dark:text-slate-400">{v.sellingPrice ? `₹${Number(v.sellingPrice).toLocaleString('en-IN')}` : '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex justify-between items-center px-4 py-2 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-xs">
                      <span className="text-slate-500">{t("sumOfVariants") || "Sum of variants"}</span>
                      <span className={cn("font-mono font-bold", variantTotal !== data.totalStock ? 'text-amber-600' : 'text-slate-700 dark:text-slate-300')}>
                        {variantTotal}{variantTotal !== data.totalStock ? ` (${t('totalShownAbove') || 'total shown above'}: ${data.totalStock})` : ''}
                      </span>
                    </div>
                  </Section>
                );
              })()}

              {/* ── Active Batches ──
                  Every tier can carry live Batch rows now (Purchases stamps
                  cost/selling price/barcode on every purchase line, not just
                  Udyog's — see purchases/route.ts), so this is no longer
                  gated to profile.subscriptionPlan === 'wholesale'. It just
                  renders nothing extra for a product that has never been
                  purchased through a batch-generating flow. */}
              {data.batches.length > 0 && (
              <Section
                icon={<CheckCircle size={14} className="text-emerald-500 dark:text-emerald-400" />}
                title={t("activeBatches")}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left min-w-[620px]">
                    <thead>
                      <tr className="text-xs uppercase text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50">
                        <th className="px-4 py-2.5 font-semibold">{t("batchNo")}</th>
                        <th className="px-4 py-2.5 font-semibold text-right">{t("costPrice")}</th>
                        <th className="px-4 py-2.5 font-semibold text-right">{t("sellingPrice")}</th>
                        <th className="px-4 py-2.5 font-semibold text-right">{t("initialQty") || 'Initial'}</th>
                        <th className="px-4 py-2.5 font-semibold text-right">{t("qty")}</th>
                        <th className="px-4 py-2.5 font-semibold">{t("expiry")}</th>
                        <th className="px-4 py-2.5 font-semibold">{t("purchaseDateCol") || 'Purchased'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {data.batches.map((b: any) => (
                        <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">
                            {b.batchNumber || b.barcode || '—'}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-slate-600 dark:text-slate-400">
                            {b.costPrice != null ? `₹${Number(b.costPrice).toLocaleString('en-IN')}` : '—'}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-emerald-700 dark:text-emerald-400">
                            {b.sellingPrice != null ? `₹${Number(b.sellingPrice).toLocaleString('en-IN')}` : '—'}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-slate-500 dark:text-slate-500">
                            {b.initialQuantity ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 px-2 py-0.5 rounded">
                              {b.quantity}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                            {b.expiryDate ? new Date(b.expiryDate).toLocaleDateString('en-IN') : '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-500">
                            {new Date(b.purchaseDate || b.createdAt).toLocaleDateString('en-IN')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
              )}

              {/* Warehouse / Movements — Udyog + Mill (mill uses Inventory tab, non-mill shows here) */}
              {isWholesaleTierPackage(profile.subscriptionPlan) && !isMillShop && <>
              {/* ── Stock by Warehouse ── */}
              <Section
                icon={<Warehouse size={14} className="text-blue-500 dark:text-blue-400" />}
                title={t("stockByWarehouse")}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left min-w-[280px]">
                    <thead>
                      <tr className="text-xs uppercase text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50">
                        <th className="px-4 py-2.5 font-semibold">
                          <span className="flex items-center gap-1"><MapPin size={11} /> {t("warehouse")}</span>
                        </th>
                        <th className="px-4 py-2.5 font-semibold text-right">{t("quantity")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {data.warehouses.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="px-4 py-6 text-center text-slate-500 dark:text-slate-500 text-sm">
                            {t("notAssigned")}
                          </td>
                        </tr>
                      ) : data.warehouses.map((w: any) => (
                        <tr key={w.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">{w.name}</td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 px-2 py-0.5 rounded">
                              {w.quantity}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>

              {/* ── Recent Movements ── */}
              <Section
                icon={<RefreshCw size={14} className="text-purple-500 dark:text-purple-400" />}
                title={t("recentMovements")}
              >
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.movements.length === 0 ? (
                    <p className="px-4 py-6 text-center text-slate-500 dark:text-slate-500 text-sm">
                      {t("noRecentMovements")}
                    </p>
                  ) : data.movements.map((m: any) => (
                    <div key={m.id} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={cn(
                          'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 border',
                          isInflow(m.type)
                            ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20'
                            : 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-500/20'
                        )}>
                          {isInflow(m.type)
                            ? <ArrowDown size={13} />
                            : <ArrowUp size={13} />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-200 capitalize leading-tight">
                            {m.type.replace(/_/g, ' ')}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
                            {new Date(m.created_at).toLocaleString('en-IN', {
                              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                            })}
                          </p>
                        </div>
                      </div>
                      <span className={cn(
                        'font-mono font-bold text-sm flex-shrink-0',
                        isInflow(m.type) ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'
                      )}>
                        {isInflow(m.type) ? '+' : '-'}{m.quantity}
                      </span>
                    </div>
                  ))}
                </div>
              </Section>
              </>}

            {/* Close Overview tab fragment */}
            </>)}

            {/* ══════════════════════════════════════════
                MILL: INVENTORY TAB
                ══════════════════════════════════════════ */}
            {isMillShop && activeTab === 'inventory' && (<>
              {/* Stock Summary */}
              <Section icon={<Hash size={14} className="text-blue-500" />} title="Stock Summary">
                <div className="grid grid-cols-2 gap-0 divide-x divide-y divide-slate-100 dark:divide-slate-700">
                  {[
                    { label: 'Total Stock', value: `${data.totalStock} ${data.product.baseUnit || 'Kg'}`, color: 'text-blue-600 dark:text-blue-400' },
                    { label: 'Stock Value', value: `₹${data.stockValue.toLocaleString('en-IN')}`, color: 'text-emerald-600 dark:text-emerald-400' },
                    { label: 'Available', value: data.mill?.fgLots
                        ? `${data.mill.fgLots.filter((l: any) => l.status === 'AVAILABLE').reduce((s: number, l: any) => s + l.availableQuantity, 0).toFixed(1)} ${data.product.baseUnit || 'Kg'}`
                        : `${data.totalStock} ${data.product.baseUnit || 'Kg'}`, color: 'text-emerald-600 dark:text-emerald-400' },
                    { label: 'Reserved / Dispatched', value: data.mill?.fgLots
                        ? `${data.mill.fgLots.filter((l: any) => l.status !== 'AVAILABLE').reduce((s: number, l: any) => s + (l.quantity - l.availableQuantity), 0).toFixed(1)} ${data.product.baseUnit || 'Kg'}`
                        : '—', color: 'text-amber-600 dark:text-amber-400' },
                  ].map(item => (
                    <div key={item.label} className="p-4">
                      <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-500 font-semibold">{item.label}</p>
                      <p className={cn('text-lg font-bold mt-1', item.color)}>{item.value}</p>
                    </div>
                  ))}
                </div>
              </Section>

              {/* Godown-wise Stock */}
              <Section icon={<Warehouse size={14} className="text-blue-500 dark:text-blue-400" />} title="Godown-wise Stock">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left min-w-[280px]">
                    <thead>
                      <tr className="text-xs uppercase text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50">
                        <th className="px-4 py-2.5 font-semibold"><span className="flex items-center gap-1"><MapPin size={11} /> Godown</span></th>
                        <th className="px-4 py-2.5 font-semibold text-right">Quantity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {data.warehouses.length === 0 ? (
                        <tr><td colSpan={2} className="px-4 py-6 text-center text-slate-500 text-sm">Not assigned to any godown</td></tr>
                      ) : data.warehouses.map((w: any) => (
                        <tr key={w.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">{w.name}</td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 px-2 py-0.5 rounded">
                              {w.quantity} {data.product.baseUnit || 'Kg'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>

              {/* FG Lots in Godowns */}
              {data.mill?.fgLots && data.mill.fgLots.length > 0 && (
                <Section icon={<Layers size={14} className="text-indigo-500" />} title="Lot-wise Inventory">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left min-w-[500px]">
                      <thead>
                        <tr className="text-xs uppercase text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50">
                          <th className="px-4 py-2.5 font-semibold">Lot #</th>
                          <th className="px-4 py-2.5 font-semibold">Godown</th>
                          <th className="px-4 py-2.5 font-semibold text-right">Total Qty</th>
                          <th className="px-4 py-2.5 font-semibold text-right">Available</th>
                          <th className="px-4 py-2.5 font-semibold">Status</th>
                          <th className="px-4 py-2.5 font-semibold">Created</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {data.mill.fgLots.map((lot: any) => (
                          <tr key={lot.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="px-4 py-3 font-mono text-xs font-bold text-indigo-700 dark:text-indigo-400">{lot.lotNumber}</td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">{lot.godown?.name || '—'}</td>
                            <td className="px-4 py-3 text-right font-mono text-xs">{lot.quantity} {lot.unit}</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-xs text-emerald-700 dark:text-emerald-400">{lot.availableQuantity} {lot.unit}</td>
                            <td className="px-4 py-3">
                              <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full',
                                lot.status === 'AVAILABLE' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                lot.status === 'DISPATCHED' ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' :
                                'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                              )}>{lot.status}</span>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500">{new Date(lot.createdAt).toLocaleDateString('en-IN')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Section>
              )}
            </>)}

            {/* ══════════════════════════════════════════
                MILL: BATCHES & PRODUCTION TAB
                ══════════════════════════════════════════ */}
            {isMillShop && activeTab === 'production' && (<>
              {data.mill?.productionBatches?.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
                  <Factory size={40} className="text-slate-200 dark:text-slate-700" />
                  <p className="text-sm">No production batches yet</p>
                  <p className="text-xs text-slate-400">Batches will appear here when this product is used as output in a production batch</p>
                </div>
              )}
              {data.mill?.productionBatches?.map((batch: any) => {
                const inputs = batch.inputLots?.length > 0
                  ? batch.inputLots.map((il: any) => ({ rawLot: il.rawMaterialLot, quantityUsed: il.quantity }))
                  : batch.rawLot ? [{ rawLot: batch.rawLot, quantityUsed: batch.inputKg }] : [];
                const fgLots = batch.finishedGoodsLots || [];
                return (
                  <Section
                    key={batch.id}
                    icon={
                      <span className={cn('w-2 h-2 rounded-full flex-shrink-0',
                        batch.status === 'closed' ? 'bg-emerald-500' :
                        batch.status === 'in_progress' ? 'bg-amber-500' : 'bg-slate-400'
                      )} />
                    }
                    title={
                      <span className="flex items-center gap-2">
                        <span className="font-bold">{batch.batchNumber}</span>
                        <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-bold',
                          batch.status === 'closed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                          batch.status === 'in_progress' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                          'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        )}>{batch.status}</span>
                      </span>
                    }
                  >
                    <div className="p-4 space-y-4">
                      {/* Dates */}
                      <div className="flex gap-6 text-xs text-slate-500">
                        <span><span className="font-semibold text-slate-700 dark:text-slate-300">Started:</span> {new Date(batch.startedAt).toLocaleDateString('en-IN')}</span>
                        {batch.closedAt && <span><span className="font-semibold text-slate-700 dark:text-slate-300">Completed:</span> {new Date(batch.closedAt).toLocaleDateString('en-IN')}</span>}
                      </div>

                      {/* Input / Output grid */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/30 rounded-lg p-3">
                          <p className="text-[10px] uppercase font-bold text-amber-700 dark:text-amber-400 tracking-wider mb-2 flex items-center gap-1"><ArrowDownCircle size={11} /> Input</p>
                          {inputs.length > 0 ? inputs.map((inp: any, i: number) => (
                            <div key={i} className="text-xs text-slate-700 dark:text-slate-300">
                              <p className="font-semibold font-mono">{inp.rawLot?.lotNumber || '—'}</p>
                              <p className="text-slate-500">{inp.quantityUsed || batch.inputKg || '—'} {data.product.baseUnit || 'Kg'}</p>
                              {inp.rawLot?.supplier?.name && <p className="text-slate-400 mt-0.5">Supplier: {inp.rawLot.supplier.name}</p>}
                            </div>
                          )) : <p className="text-xs text-slate-400">{batch.inputKg ? `${batch.inputKg} ${data.product.baseUnit || 'Kg'}` : '—'}</p>}
                        </div>
                        <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/30 rounded-lg p-3">
                          <p className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 tracking-wider mb-2 flex items-center gap-1"><ArrowUpCircle size={11} /> Output</p>
                          <div className="space-y-1 text-xs">
                            {batch.outputKg != null && <p className="text-emerald-700 dark:text-emerald-400 font-semibold">Finished: {batch.outputKg} Kg</p>}
                            {batch.branKg != null && batch.branKg > 0 && <p className="text-slate-500">Bran: {batch.branKg} Kg</p>}
                            {batch.huskKg != null && batch.huskKg > 0 && <p className="text-slate-500">Husk: {batch.huskKg} Kg</p>}
                            {batch.brokenKg != null && batch.brokenKg > 0 && <p className="text-amber-600 dark:text-amber-400">Broken: {batch.brokenKg} Kg</p>}
                            {batch.wastageKg != null && batch.wastageKg > 0 && <p className="text-rose-500">Wastage: {batch.wastageKg} Kg</p>}
                            {batch.byProducts?.map((bp: any) => (
                              <p key={bp.id} className="text-blue-500">{bp.name}: {bp.quantityKg ?? '—'} Kg</p>
                            ))}
                            {batch.recoveryPct != null && <p className="text-slate-400 mt-1">Recovery: {batch.recoveryPct.toFixed(1)}%</p>}
                          </div>
                        </div>
                      </div>

                      {/* FG Lots produced */}
                      {fgLots.length > 0 && (
                        <div>
                          <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1.5">FG Lots Produced</p>
                          <div className="flex flex-wrap gap-2">
                            {fgLots.map((lot: any) => (
                              <span key={lot.id} className="text-xs font-mono bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/30 px-2 py-0.5 rounded-full">
                                {lot.lotNumber} · {lot.quantity} {lot.unit} {lot.godown ? `· ${lot.godown.name}` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </Section>
                );
              })}
            </>)}

            {/* ══════════════════════════════════════════
                MILL: PACKING TAB
                ══════════════════════════════════════════ */}
            {isMillShop && activeTab === 'packing' && (<>
              {/* Packing summary */}
              {data.mill?.fgLots && (() => {
                const lots = data.mill.fgLots as any[];
                const totalProduced = lots.reduce((s, l) => s + l.quantity, 0);
                const totalAvail = lots.reduce((s, l) => s + l.availableQuantity, 0);
                const dispatched = totalProduced - totalAvail;
                const packSize = data.product.packSize;
                const packUnit = data.product.packUnit;
                const totalBags = packSize ? Math.floor(totalProduced / packSize) : null;
                return (
                  <Section icon={<Boxes size={14} className="text-purple-500" />} title="Packing Summary">
                    <div className="grid grid-cols-2 gap-0 divide-x divide-y divide-slate-100 dark:divide-slate-700">
                      {[
                        { label: 'Total Produced', value: `${totalProduced.toFixed(1)} ${data.product.baseUnit || 'Kg'}`, color: 'text-blue-600 dark:text-blue-400' },
                        { label: 'Dispatched', value: `${dispatched.toFixed(1)} ${data.product.baseUnit || 'Kg'}`, color: 'text-slate-700 dark:text-slate-300' },
                        { label: 'Available to Pack / Dispatch', value: `${totalAvail.toFixed(1)} ${data.product.baseUnit || 'Kg'}`, color: 'text-emerald-600 dark:text-emerald-400' },
                        { label: packSize ? `Total Bags (${packSize} ${packUnit}/bag)` : 'Pack Size', value: totalBags != null ? `${totalBags} bags` : packSize ? `${packSize} ${packUnit}` : 'Not set', color: 'text-amber-600 dark:text-amber-400' },
                      ].map(item => (
                        <div key={item.label} className="p-4">
                          <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-500 font-semibold">{item.label}</p>
                          <p className={cn('text-lg font-bold mt-1', item.color)}>{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </Section>
                );
              })()}

              {/* Per-lot packing detail */}
              {data.mill?.fgLots?.length > 0 ? (
                <Section icon={<Layers size={14} className="text-indigo-500" />} title="Lot-wise Packing Detail">
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(data.mill.fgLots as any[]).map((lot: any) => {
                      const packSize = data.product.packSize;
                      const bags = packSize ? Math.floor(lot.quantity / packSize) : null;
                      const dispatchedQty = lot.quantity - lot.availableQuantity;
                      return (
                        <div key={lot.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-indigo-700 dark:text-indigo-400 text-sm">{lot.lotNumber}</span>
                              <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full',
                                lot.status === 'AVAILABLE' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                lot.status === 'DISPATCHED' ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' :
                                'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                              )}>{lot.status}</span>
                            </div>
                            <span className="text-xs text-slate-500">{new Date(lot.createdAt).toLocaleDateString('en-IN')}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-3 text-xs">
                            <div>
                              <p className="text-slate-500">Total</p>
                              <p className="font-bold text-slate-800 dark:text-slate-200">{lot.quantity} {lot.unit}</p>
                            </div>
                            <div>
                              <p className="text-slate-500">Available</p>
                              <p className="font-bold text-emerald-700 dark:text-emerald-400">{lot.availableQuantity} {lot.unit}</p>
                            </div>
                            <div>
                              <p className="text-slate-500">Dispatched</p>
                              <p className="font-bold text-slate-600 dark:text-slate-400">{dispatchedQty.toFixed(1)} {lot.unit}</p>
                            </div>
                          </div>
                          {bags != null && (
                            <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1">
                              <Boxes size={11} /> {bags} bags × {data.product.packSize} {data.product.packUnit || 'Kg'}/bag
                            </p>
                          )}
                          {lot.godown && (
                            <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                              <MapPin size={11} /> {lot.godown.name}
                            </p>
                          )}
                          {/* Challan dispatches */}
                          {lot.challanItems?.length > 0 && (
                            <div className="mt-3 border-t border-slate-100 dark:border-slate-700 pt-2">
                              <p className="text-[10px] uppercase font-bold text-slate-400 mb-1.5">Dispatched Via</p>
                              <div className="space-y-1">
                                {lot.challanItems.map((ci: any) => (
                                  <div key={ci.id} className="flex items-center justify-between text-xs">
                                    <span className="font-mono text-blue-600 dark:text-blue-400">{ci.challan?.challanNumber}</span>
                                    <span className="text-slate-500">{ci.challan?.customerName || '—'}</span>
                                    <span className="text-slate-400">{ci.challan?.createdAt ? new Date(ci.challan.createdAt).toLocaleDateString('en-IN') : '—'}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Section>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
                  <Boxes size={40} className="text-slate-200 dark:text-slate-700" />
                  <p className="text-sm">No finished goods lots yet</p>
                  <p className="text-xs">Lots are created when a production batch is finalized</p>
                </div>
              )}
            </>)}

            {/* ══════════════════════════════════════════
                MILL: TRACEABILITY TAB
                ══════════════════════════════════════════ */}
            {isMillShop && activeTab === 'traceability' && (
              <MillTraceabilityTab data={data} product={data.product} />
            )}

            </div>
          )}
        </div>
      </div>

      {showReceive && data?.product && (
        <ReceiveDrawer
          product={data.product}
          godowns={godowns}
          onClose={() => setShowReceive(false)}
          onSuccess={() => {
            setShowReceive(false);
            fetchDetails(); // refresh stock
            invalidateProductCaches(); // refresh every products consumer (list, stock, billing)
          }}
        />
      )}
      <ConfirmPasswordModal
        open={confirmDelete}
        itemLabel="product"
        onConfirm={() => { setConfirmDelete(false); onDelete?.(productId); }}
        onCancel={() => setConfirmDelete(false)}
      />
      {showBarcodeModal && data?.product && (
        <BarcodeQRModal
          product={{
            ...data.product,
            stock: data.product.currentStock ?? data.product.stock,
          }}
          isWholesale
          onClose={() => setShowBarcodeModal(false)}
        />
      )}
    </div>
  );
}

/* ── Sub-components ── */

function StatCard({
  icon, label, value, valueClass
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 rounded-xl p-4 flex flex-col gap-2 shadow-sm">
      <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-500 text-xs font-medium uppercase tracking-wider">
        {icon}
        {label}
      </div>
      <p className={cn('text-xl font-bold leading-tight truncate', valueClass)}>
        {value}
      </p>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-500 font-semibold">{label}</p>
      <p className="text-slate-800 dark:text-slate-200 font-medium mt-0.5">{value}</p>
    </div>
  );
}

function Section({
  icon, title, children
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-xl overflow-hidden shadow-sm">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/80">
        {icon}
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-200">{title}</h3>
      </div>
      {children}
    </div>
  );
}

/* ── Mill Traceability Tab ── */
function MillTraceabilityTab({ data, product }: { data: any; product: any }) {
  const fgLots: any[] = data.mill?.fgLots || [];
  const prodBatches: any[] = data.mill?.productionBatches || [];

  if (fgLots.length === 0 && prodBatches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
        <GitBranch size={40} className="text-slate-200 dark:text-slate-700" />
        <p className="text-sm">No traceability data yet</p>
        <p className="text-xs text-center">Traceability appears after production batches are created and finalized for this product</p>
      </div>
    );
  }

  // Build traceability chains from FG lots
  const chains = fgLots.map((lot: any) => {
    const batch = lot.batch;
    const supplier = batch?.rawLot?.supplier || null;
    const challanItems = lot.challanItems || [];
    return { lot, batch, supplier, challanItems };
  });

  // If no FG lots but production batches exist (e.g. raw material product)
  if (chains.length === 0) {
    return (
      <div className="p-4 space-y-4">
        <p className="text-xs text-slate-500 text-center py-4">Traceability visible for Finished Goods products. This product has {prodBatches.length} production batch(es) as output.</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {chains.map(({ lot, batch, supplier, challanItems }, i) => (
        <div key={lot.id} className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-xl overflow-hidden shadow-sm">
          {/* Chain header */}
          <div className="flex items-center justify-between px-4 py-3 bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-100 dark:border-indigo-800/30">
            <div className="flex items-center gap-2">
              <GitBranch size={14} className="text-indigo-500" />
              <span className="font-bold text-indigo-700 dark:text-indigo-400 font-mono text-sm">{lot.lotNumber}</span>
            </div>
            <span className="text-xs text-indigo-500">{lot.quantity} {lot.unit}</span>
          </div>

          {/* Chain steps */}
          <div className="p-4">
            <div className="relative pl-5">
              {/* Vertical line */}
              <div className="absolute left-2 top-3 bottom-3 w-px bg-slate-200 dark:bg-slate-700" />

              {[
                supplier && {
                  icon: '👨‍🌾',
                  label: 'Farmer / Supplier',
                  value: supplier.name || '—',
                  sub: supplier.phone ? `📱 ${supplier.phone}` : null,
                  color: 'text-amber-700 dark:text-amber-400',
                },
                batch?.rawLot && {
                  icon: '⚖️',
                  label: 'Raw Material Lot',
                  value: batch.rawLot.lotNumber || '—',
                  sub: batch.rawLot.quantity ? `${batch.rawLot.quantity} ${batch.rawLot.unit || 'Kg'} · ${batch.rawLot.purchaseDate ? new Date(batch.rawLot.purchaseDate).toLocaleDateString('en-IN') : ''}` : null,
                  color: 'text-slate-700 dark:text-slate-300',
                },
                batch && {
                  icon: '🏭',
                  label: 'Production Batch',
                  value: batch.batchNumber || '—',
                  sub: `Input: ${batch.inputKg ?? '—'} Kg → Output: ${batch.outputKg ?? '—'} Kg${batch.recoveryPct != null ? ` (${batch.recoveryPct.toFixed(1)}% recovery)` : ''}`,
                  color: 'text-blue-700 dark:text-blue-400',
                },
                {
                  icon: '✅',
                  label: 'Finished Goods Lot',
                  value: lot.lotNumber,
                  sub: `${lot.quantity} ${lot.unit} produced · ${lot.availableQuantity} ${lot.unit} available`,
                  color: 'text-emerald-700 dark:text-emerald-400',
                },
                lot.godown && {
                  icon: '🏬',
                  label: 'Godown',
                  value: lot.godown.name,
                  sub: null,
                  color: 'text-slate-700 dark:text-slate-300',
                },
                ...challanItems.map((ci: any) => ({
                  icon: '📋',
                  label: 'Delivery Challan',
                  value: ci.challan?.challanNumber || '—',
                  sub: ci.challan?.customerName ? `Customer: ${ci.challan.customerName}` : null,
                  color: 'text-purple-700 dark:text-purple-400',
                })),
              ].filter(Boolean).map((step: any, si) => (
                <div key={si} className="relative mb-4 last:mb-0">
                  {/* Dot */}
                  <div className="absolute -left-5 top-1 w-4 h-4 rounded-full bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-600 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-500 tracking-wider">{step.label}</p>
                    <p className={cn('text-sm font-semibold mt-0.5', step.color)}>{step.icon} {step.value}</p>
                    {step.sub && <p className="text-xs text-slate-400 mt-0.5">{step.sub}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
