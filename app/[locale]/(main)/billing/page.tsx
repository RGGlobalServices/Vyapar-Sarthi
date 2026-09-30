'use client';
import {useState, useEffect, useRef, useCallback, useMemo} from 'react';
import useSWR, { mutate } from 'swr';
import WholesaleBillingUI from './WholesaleBillingUI';
import {useTranslations, useLocale} from 'next-intl';
import {useCartStore, useUdharStore, useAuthStore, lineRef} from '@/lib/store';
import { lotLabel as makeLotLabel } from '@/lib/lots';
import {useBusinessStore} from '@/lib/businessStore';
import { isWholesaleTierPackage } from '@/lib/config/packageConfig';
import {useBillingEngine, type PaymentMethod, type CollectedMethod} from '@/lib/hooks/useBillingEngine';
import {translateData} from '@/lib/translateData';
import {getBusinessConfig} from '@/lib/businessConfig';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {
  Search, Scan, Trash2, Plus, Minus, CreditCard, IndianRupee,
  User, X, Printer, Calculator as CalcIcon, PlusCircle, Download,
  AlertCircle, CheckCircle, Zap, MessageCircle, Loader2, Smartphone, FileUp, Layers
} from 'lucide-react';
import api from '@/lib/api';
import { useBarcodeScanner, playScanBeep, matchProductByCode, matchVariantByCode } from '@/lib/useBarcodeScanner';
import nextDynamic from 'next/dynamic';
// Camera scanner pulls in html5-qrcode and touches `window`, so it must stay
// out of the server bundle and off the initial billing payload.
const CameraScanner = nextDynamic(() => import('@/components/CameraScanner'), { ssr: false });
import { useIsMobile } from '@/hooks/use-mobile';
import {cn, fmtDate} from '@/lib/utils';
import { toInclusivePrice, toExclusivePrice } from '@/lib/profitCalc';
import {BillSlip, generateWhatsAppText} from '@/components/BillSlip';
import {generateWhatsAppLink} from '@/lib/shareUtils';
import {uploadInvoiceToSupabase} from '@/lib/supabaseStorage';
import Calculator from '@/components/Calculator';
import {performSmartSearch} from '@/lib/smartSearch';
import {computeGst} from '@/lib/gst';
import { waitForImages, waitForQrCode } from '@/lib/waitForImages';
import { printBill } from '@/lib/printBill';
import ManualBillUpload from '@/components/ManualBillUpload';
import LiquorCartMatrix from '@/components/billing/LiquorCartMatrix';
import { extractMlToken } from '@/lib/liquorMatrix';
import DiscountInput from '@/components/DiscountInput';
import {splitVariantKey, isColorSizeVariants, colorsFromVariants, sizesFromVariants, cssColor} from '@/components/ColorSizeVariantGrid';
import {formatSizeLabel} from '@/components/SizeVariantGrid';
import { withOfflineCache, isNetworkError, queueOfflineSale } from '@/lib/offlineCache';
import { invalidateProductCaches } from '@/lib/swrInvalidate';

// Short "when was this product added" label for the search dropdown. Recent
// additions read as "Today"/"Yesterday"/"3d ago" so a shopkeeper can spot a
// just-added item; older ones show the calendar date. Returns '' when unknown.
function formatAddedDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  // Compare calendar days in IST — a bill entered at 11:30 PM IST yesterday
  // and viewed at 6:00 AM IST today is "Yesterday", not "Today", regardless
  // of the browser's or server's timezone. Using ms-diff / 86400000 would
  // silently drift by a full day for a shop in Asia/Kolkata when the browser
  // clock is UTC or a device with a wrong TZ set.
  const istYmd = (v: Date) => v.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const dayMs = 86400000;
  const dIst = new Date(istYmd(d) + 'T00:00:00Z').getTime();
  const nowIst = new Date(istYmd(new Date()) + 'T00:00:00Z').getTime();
  const days = Math.round((nowIst - dIst) / dayMs);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
}

// Gram/ml equivalent label for a quantity in base unit
function looseEquivLabel(qty: number, unit: string): string {
  const u = (unit || '').toLowerCase();
  if (u === 'kg'  && qty < 1)  return `${Math.round(qty * 1000)}g`;
  if (u === 'ltr' && qty < 1)  return `${Math.round(qty * 1000)}ml`;
  return '';
}

// Quick-select weight/volume presets for loose items
function getLoosePresets(unit: string) {
  const u = (unit || '').toLowerCase();
  if (u === 'kg')   return [{l:'100g', v:0.1},{l:'250g', v:0.25},{l:'500g', v:0.5},{l:'1 Kg', v:1},{l:'2 Kg', v:2}];
  if (u === 'ltr')  return [{l:'100ml', v:0.1},{l:'250ml', v:0.25},{l:'500ml', v:0.5},{l:'1 L', v:1},{l:'2 L', v:2}];
  if (u === 'gram') return [{l:'50g', v:50},{l:'100g', v:100},{l:'250g', v:250},{l:'500g', v:500}];
  return [{l:'0.25', v:0.25},{l:'0.5', v:0.5},{l:'1', v:1},{l:'2', v:2}];
}

// Resolve a product's sellable stock from whatever shape it arrives in.
// Returns { known } = whether stock could be determined at all, and { qty } =
// the amount. A sale is only blocked as "out of stock" when known && qty <= 0 —
// a product with no stock field present is treated as unknown (allowed), so we
// never falsely flag items that simply came from an incomplete source.
function resolveStock(p: any): { known: boolean; qty: number } {
  if (!p) return { known: false, qty: 0 };
  // Variant products track stock per size/colour in size_variants; the aggregate
  // currentStock is what Stock/Products screens show and what /adjust bumps.
  // A stock-in from Stock only touches currentStock (it can't guess which size
  // arrived), so a variant-only read here would keep saying "out of stock" for
  // a shoe that clearly has 40 in stock elsewhere. Take the MAX of the two so
  // whichever source is up-to-date wins; per-line variant checks in
  // resolveStockForItem still enforce the granular size count.
  let sv: any = p.size_variants ?? p.sizeVariants;
  if (typeof sv === 'string') { try { sv = JSON.parse(sv); } catch { sv = null; } }
  const variantSum = (sv && typeof sv === 'object' && Object.keys(sv).length > 0)
    ? Object.values(sv).reduce((t: number, v: any) => t + (Number(v) || 0), 0)
    : null;
  const raw = p.currentStock ?? p.current_stock ?? p.stock;
  const aggregate = raw === undefined || raw === null || raw === ''
    ? null
    : (isFinite(Number(raw)) ? Number(raw) : null);
  if (variantSum === null && aggregate === null) return { known: false, qty: 0 };
  return { known: true, qty: Math.max(variantSum ?? 0, aggregate ?? 0) };
}

// Sellable stock remaining for one specific cart line — for a variant item this
// is that variant's own size_variants count, not the product's combined total,
// so a cart line can never be pushed past what's actually left of that size/colour.
function resolveStockForItem(item: any, products: any[]): { known: boolean; qty: number } {
  const product = products.find(p => p.id === item.id);
  if (!product) return { known: false, qty: 0 };
  if (item.variant) {
    let sv: any = product.size_variants ?? product.sizeVariants;
    if (typeof sv === 'string') { try { sv = JSON.parse(sv); } catch { sv = null; } }
    if (sv && typeof sv === 'object' && Object.prototype.hasOwnProperty.call(sv, item.variant)) {
      const n = Number(sv[item.variant]);
      // Same "unassigned pool" fallback as the variant-selector modal: when
      // NO variant has any stock but the aggregate does, treat the aggregate
      // as the effective cap for this line. Prevents the cashier being locked
      // out of a sale on stock that clearly exists on the product row.
      if ((!isFinite(n) || n <= 0)) {
        const variantSum = Object.values(sv).reduce((t: number, v: any) => t + (Number(v) || 0), 0);
        if (variantSum === 0) return resolveStock(product);
      }
      return { known: true, qty: isFinite(n) ? n : 0 };
    }
  }
  return resolveStock(product);
}
const CartQuantityInputRetail = ({ item, updateQuantity, removeItem, maxQty }: any) => {
  const [localVal, setLocalVal] = useState(item.quantity.toString());
  useEffect(() => {
    setLocalVal(item.quantity.toString());
  }, [item.quantity]);

  return (
    <input
      type="number"
      step="any"
      min="0"
      max={typeof maxQty === 'number' ? maxQty : undefined}
      value={localVal}
      onChange={(e) => {
        setLocalVal(e.target.value);
        let num = Number(e.target.value);
        if (!isNaN(num)) {
          if (typeof maxQty === 'number' && num > maxQty) num = maxQty;
          updateQuantity(item.id, num, lineRef(item));
        }
      }}
      onBlur={(e) => {
        let num = Number(e.target.value);
        if (num <= 0 || e.target.value === '') removeItem(item.id, lineRef(item));
        else {
          if (typeof maxQty === 'number' && num > maxQty) num = maxQty;
          setLocalVal(num.toString());
        }
      }}
      className="w-20 bg-white dark:bg-slate-950 border border-emerald-200 dark:border-emerald-700/50 rounded px-2 py-1 text-center text-emerald-600 dark:text-emerald-400 font-bold text-sm focus:ring-1 focus:ring-emerald-500 outline-none transition-colors"
    />
  );
};

const GST_SLABS = [0, 5, 12, 18, 28];

// GST invoice only: per-line GST price mode.
// Excl = user types BASE price, GST added on top → total increases (e.g. 600 base + 5% = 630 total)
// Incl = user types TOTAL price (GST already inside) → total unchanged (e.g. 600 total, CGST 14.28, SGST 14.28)
// item.price is always stored as the GST-inclusive selling price.
const CartPriceInputRetail = ({ item, updatePrice, updateGstPercent, isGstBill }: any) => {
  const gstPercent = Number(item.gstPercent) || 0;
  const savedSlabRef = useRef<number>(gstPercent > 0 ? gstPercent : 12);

  useEffect(() => {
    if (gstPercent > 0) savedSlabRef.current = gstPercent;
  }, [gstPercent]);

  // exclusive: input shows base price (GST on top); inclusive: input shows final price (GST inside)
  // Default from the product's gstInclusive flag set when it was added to the catalog.
  const [mode, setMode] = useState<'inclusive' | 'exclusive'>(
    item.gstInclusive ? 'inclusive' : 'exclusive'
  );

  // What to display in the input field
  const displayPrice = useMemo(() => {
    const p = Math.round(item.price * 100) / 100;
    if (mode === 'exclusive' && gstPercent > 0) {
      return Math.round(toExclusivePrice(p, gstPercent) * 100) / 100;
    }
    return p;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, item.price, gstPercent]);

  const [localVal, setLocalVal] = useState(displayPrice.toString());

  useEffect(() => {
    setLocalVal(displayPrice.toString());
  }, [displayPrice]);

  const writePrice = (typedVal: number) => {
    if (mode === 'exclusive' && gstPercent > 0) {
      // Typed = base → store inclusive = base * (1 + gst%)
      updatePrice(item.id, Math.round(toInclusivePrice(typedVal, gstPercent) * 100) / 100, lineRef(item));
    } else {
      // Typed = inclusive (or no GST) → store directly
      updatePrice(item.id, typedVal, lineRef(item));
    }
  };

  const changeGstSlab = (newSlab: number) => {
    if (newSlab > 0) savedSlabRef.current = newSlab;
    if (mode === 'exclusive') {
      // Keep base price constant; update stored inclusive for new slab
      const base = gstPercent > 0 ? toExclusivePrice(item.price, gstPercent) : item.price;
      updateGstPercent(item.id, newSlab, lineRef(item));
      const newIncl = newSlab > 0 ? toInclusivePrice(base, newSlab) : base;
      updatePrice(item.id, Math.round(newIncl * 100) / 100, lineRef(item));
    } else {
      // Incl mode: total stays the same, only breakdown changes
      updateGstPercent(item.id, newSlab, lineRef(item));
    }
  };

  const switchMode = (newMode: 'inclusive' | 'exclusive') => {
    if (newMode === mode) return;
    const slab = gstPercent > 0 ? gstPercent : (savedSlabRef.current || 12);
    if (gstPercent === 0) updateGstPercent(item.id, slab, lineRef(item));

    if (newMode === 'exclusive') {
      // Incl → Excl: the currently visible price becomes the BASE price.
      // e.g. displayed ₹209 (incl) → now BASE ₹209 → store inclusive ₹209*1.18 = ₹246.62
      updatePrice(item.id, Math.round(toInclusivePrice(displayPrice, slab) * 100) / 100, lineRef(item));
    } else {
      // Excl → Incl: the currently visible base price becomes the TOTAL.
      // e.g. displayed ₹177.68 (base) → now TOTAL ₹177.68 → store ₹177.68 directly
      updatePrice(item.id, Math.round(displayPrice * 100) / 100, lineRef(item));
    }
    setMode(newMode);
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        type="number"
        className="w-20 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-2 py-1 text-right text-emerald-600 dark:text-emerald-500 font-bold focus:ring-1 focus:ring-emerald-500 outline-none transition-colors"
        value={localVal}
        onChange={(e) => {
          setLocalVal(e.target.value);
          const num = Number(e.target.value);
          if (!isNaN(num) && num >= 0) writePrice(num);
        }}
        onBlur={(e) => {
          if (e.target.value === '') { writePrice(0); return; }
          setLocalVal(displayPrice.toString());
        }}
        step="any"
        min="0"
      />
      {isGstBill && (
        <div className="flex items-center gap-1">
          <select
            value={gstPercent > 0 ? gstPercent : savedSlabRef.current}
            onChange={(e) => changeGstSlab(Number(e.target.value))}
            title="GST % for this item"
            className="text-[9px] font-bold bg-transparent border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 outline-none text-slate-500 dark:text-slate-400"
          >
            {GST_SLABS.filter(g => g > 0).map((g) => <option key={g} value={g}>{g}%</option>)}
          </select>
          <div className="flex bg-slate-100 dark:bg-slate-800 rounded overflow-hidden shrink-0">
            {(['exclusive', 'inclusive'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                title={m === 'inclusive' ? 'Price includes GST — total stays same' : 'GST added on top — total increases'}
                className={cn(
                  'px-1.5 py-0.5 text-[9px] font-bold transition-colors',
                  mode === m ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                )}
              >
                {m === 'inclusive' ? 'Incl' : 'Excl'}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

function StandardBillingUI() {
  const t = useTranslations('Billing');
  const tBill = useTranslations('BillSlip');
  const tP = useTranslations('Products');
  const locale = useLocale();
  const {profile, activeShopId} = useBusinessStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  
  const {
    items, addItem, removeItem, updateQuantity, updatePrice, updateGstPercent, updateBatchNumber, setLineBatch, updateColorSize, clearCart,
    subtotal, discount, setDiscount, total,
    splitPayments, setSplitPayments, collectedAmount,
    remainingAmount, isEmi, setIsEmi,
    paymentMethod, setPaymentMethod,
    udharAdvance, setUdharAdvance,
    udharAdvanceMethod, setUdharAdvanceMethod
  } = useBillingEngine(mounted ? profile.id : undefined, 0, { mode: 'method' });
  const effectiveBusinessType = mounted ? profile.businessType : 'kirana';
  const bizConfig = getBusinessConfig(effectiveBusinessType);
  const isElectronics = effectiveBusinessType === 'electronics';

  const {customers: udharCustomers, fetchCustomers, addUdharFromBill} = useUdharStore();
  const {user} = useAuthStore();
  
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showBillModal, setShowBillModal] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [lastBill, setLastBill] = useState<any>(null);
  const [showCalculator, setShowCalculator] = useState(false);
  const [manualProduct, setManualProduct] = useState({ name: '', costPrice: '', mrp: '', price: '', unit: 'Unit', variant: '', barcode: '' });
  const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null);
  // Brief on-screen confirmation of the last scan — the cashier is usually
  // looking at the customer, so the beep alone isn't enough to review.
  const [scanFeedback, setScanFeedback] = useState<
    // 'nudge' = the scan succeeded (item added) but a non-blocking hint is
    // shown alongside it — currently only "an older batch exists, sell that
    // first if possible."
    { status: 'ok' | 'error' | 'pending' | 'nudge'; text: string } | null
  >(null);
  // Guards against a slow server lookup for an earlier scan overwriting the
  // result of a later one when codes are scanned back-to-back.
  const scanSeqRef = useRef(0);
  // Camera scanning is only useful on a phone — a desktop counter already has
  // a real USB/Bluetooth barcode scanner (handled by useBarcodeScanner below).
  const isMobile = useIsMobile();
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [showManualBillUpload, setShowManualBillUpload] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [sendStatus, setSendStatus] = useState<{ email: boolean | null } | null>(null);
  // Desktop-only fallback link, shown after the "WhatsApp" button is
  // clicked, for when the shop's PC doesn't have WhatsApp Desktop installed
  // — the click already tried the app (whatsapp://) first via handleWhatsAppPDF.
  const [waWebFallbackUrl, setWaWebFallbackUrl] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string | number>>(new Set());
  const [variantSelectionProduct, setVariantSelectionProduct] = useState<any>(null);
  // Lot/batch picker — shown only when a manually-added product (search tap,
  // not a batch-barcode scan) actually has more than one live lot to choose
  // between. A single lot (or none tracked) needs no extra step — addToCart
  // just proceeds with automatic FIFO like it always has.
  const [batchSelectionProduct, setBatchSelectionProduct] = useState<any>(null);
  const [batchSelectionVariant, setBatchSelectionVariant] = useState<string | undefined>(undefined);
  const [batchSelectionOptions, setBatchSelectionOptions] = useState<any[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [outOfStockItem, setOutOfStockItem] = useState<any>(null);
  const [recommendedProducts, setRecommendedProducts] = useState<any[]>([]);

  // EMI: the sale is financed by a bank / finance provider. The provider pays the
  // shop in full; interest, tenure and monthly instalments are the provider's
  // concern, not the shop's.

  // GST / Non-GST billing. Default non-GST (normal retail invoice).
  const [billType, setBillType] = useState<'non_gst' | 'gst'>('non_gst');
  const [gstInterState, setGstInterState] = useState(false); // false = CGST+SGST, true = IGST
  const isGstBill = billType === 'gst';
  const gst = useMemo(
    () => computeGst(items as any, discount, gstInterState),
    [items, discount, gstInterState]
  );

  const [isGeneratingBill, setIsGeneratingBill] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const componentRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Debounces addToCart against a genuine rapid double-fire on the same
  // product+variant (a real double-tap, or a stale dropdown button still
  // registering a second click before React removes it) — maps
  // `${productId}::${variant}` to the timestamp of its last add. A second
  // add within the cooldown is ignored; anything after it goes through
  // normally (so scanning/clicking the same item again a moment later to
  // mean "quantity 2" still works as always).
  const pendingAddKeysRef = useRef<Map<string, number>>(new Map());
  const DUPLICATE_ADD_COOLDOWN_MS = 700;
  // Cache of product batches fetched during this billing session — avoids
  // re-fetching the same product's batches on every scan/click.
  const batchCacheRef = useRef<Map<string, any[]>>(new Map());
  // Products that currently have more than one lot with stock -> their lots. The search list shows each of these
  // lots as its own row (lot no., price, left, expiry) so the cashier sells the old lot at the old price.
  const { data: lotsByProduct = {}, mutate: refreshLots } = useSWR<Record<string, any[]>>(
    activeShopId ? ['/products/lots', activeShopId] : null,
    ([url]: [string, string]) => api.get(url).then(res => res.data || {}),
    { revalidateOnFocus: true },
  );
  // Lot chosen in the search list for a product that still needs a size/colour pick first.
  const variantSelectionLotRef = useRef<any>(null);

  // Use SWR for instant cache loading. Also persisted to localStorage so a
  // cold app start with no connection yet still has yesterday's catalogue to
  // search and bill against, instead of an empty product list.
  const fetcher = ([url, shopId]: [string, string]) =>
    withOfflineCache(`billing-products:${shopId}`, () => api.get(url).then(res => res.data));
  const { data: swrProducts = [] } = useSWR(activeShopId ? ['/products', activeShopId] : null, fetcher, { revalidateOnFocus: true });
  
  useEffect(() => {
    if (swrProducts && swrProducts.length > 0) {
      setProducts(swrProducts);
    }
  }, [swrProducts]);

  // isEmi is provided by useBillingEngine. On an EMI sale the finance provider
  // settles the shop in full, so the amount paid is simply the bill total.

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handlePrint = async () => {
    if (componentRef.current) await waitForQrCode(componentRef.current, !!profile.upiId);
    printBill();
  };

  const generatePDFBlob = async () => {
    if (!componentRef.current) throw new Error('No ref');
    
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas-pro'),
      import('jspdf'),
    ]);

    await waitForQrCode(componentRef.current, !!profile.upiId);

    // Create a clone to render off-screen for perfect capture
    const clone = componentRef.current.cloneNode(true) as HTMLElement;
    clone.style.position = 'fixed';
    clone.style.top = '0';
    clone.style.left = '-9999px';
    const isA4 = profile.invoiceFormat === 'a4' || profile.invoiceFormat === 'wholesale';
    clone.style.width = isA4 ? '800px' : '320px';
    clone.style.height = 'auto';
    clone.style.backgroundColor = '#ffffff';
    clone.style.visibility = 'visible';
    document.body.appendChild(clone);

    try {
      await waitForImages(clone);

      // scale 2.2 is still noticeably sharper than the original blurry
      // capture, without the page ballooning past ~100KB. JPEG (not PNG)
      // does the rest of the size work — this is a document of white space,
      // thin borders and text, which JPEG compresses far better than
      // lossless PNG; only the QR/barcode's fine detail resists it much.
      const canvas = await html2canvas(clone, {
        scale: 2.2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.82);
      const pdfWidth = isA4 ? 210 : 80;
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      // Page size always matches the captured content height exactly. A fixed
      // 297mm A4 page here would silently clip anything below it — GST bills
      // add an HSN column plus a tax-summary block, so they run taller than
      // non-GST bills and were the ones actually hitting that cutoff.
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [pdfWidth, pdfHeight]
      });

      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);

      return { pdf, blob: pdf.output('blob') };
    } finally {
      document.body.removeChild(clone);
    }
  };

  const handleDownloadPDF = async () => {
    if (isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    try {
      const { pdf } = await generatePDFBlob();
      pdf.save(`bill-${lastBill?.billNumber?.replace(/[^a-zA-Z0-9]/g, '') || 'invoice'}.pdf`);
    } catch (error) {
      console.error('Failed to generate PDF', error);
      alert(t('failedToDownloadPdf'));
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleWhatsAppPDF = async () => {
    if (isSharing) return;
    setIsSharing(true);
    setWaWebFallbackUrl(null);
    const fileName = `bill-${lastBill?.billNumber || Date.now()}.pdf`;

    try {
      const { blob } = await generatePDFBlob();
      const publicUrl = await uploadInvoiceToSupabase(blob, fileName);
      const text = generateWhatsAppText({
        ...lastBill,
        storeName: profile.shopName || user?.storeName,
        pdfUrl: publicUrl || undefined,
        gst: profile.gst || undefined,
        pan: profile.pan || undefined,
        t: tBill,
      });

      // Normalize customer phone (strip non-digits, add country code)
      let phone = (lastBill?.customerMobile || '').replace(/\D/g, '');
      if (phone.length === 10) phone = `91${phone}`;
      else if (phone.length > 10 && phone.startsWith('0')) phone = `91${phone.substring(1)}`;
      // No phone on file → leave it blank. wa.me/whatsapp:// both treat an
      // empty number as "let the user pick a chat" (WhatsApp's own contact
      // picker), rather than falling back to navigator.share()/a plain file
      // download — a "WhatsApp" button that sometimes just downloads a PDF
      // instead (what native share silently did on phones where PDF file
      // sharing isn't supported) is a real, reported bug, not a fallback.
      if (phone.length < 10) phone = '';

      // Mobile: wa.me hands off to the app via the OS. Desktop: wa.me only
      // ever opens WhatsApp Web, so use the WhatsApp Desktop app's own
      // whatsapp:// link instead, with a plain wa.me fallback link shown
      // right after in case that app isn't installed.
      const url = generateWhatsAppLink(phone, text, isMobile);
      if (isMobile) {
        window.open(url, '_blank');
      } else {
        window.open(url, '_self');
        setWaWebFallbackUrl(generateWhatsAppLink(phone, text, true));
      }
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        console.error('Failed to share PDF', error);
        alert(t('couldNotSharePdf'));
      }
    } finally {
      setIsSharing(false);
    }
  };

  const addToCart = useCallback((product: any, variant?: string, forceAdd = false, batchInfo?: { id: string; batchNumber: string | null; costPrice: number | null; sellingPrice: number | null } | null) => {
    // Instant feedback the moment ANY add is triggered — closes the search
    // dropdown and clears the box right away, before the (possibly slow,
    // see the batch lookup below) async work even starts. Without this the
    // dropdown sat open for the full lookup duration, which reads as "my
    // click didn't register" and invites a second click on the same result
    // — see the dedup guard below for why that used to double the quantity.
    setSearch('');
    setSearchResults([]);

    // 1. Check Out of Stock first.
    // Resolve stock robustly: variant products track stock per size in
    // size_variants; simple products in currentStock. Field names may arrive in
    // camelCase or snake_case depending on the source. Crucially we only block a
    // sale when stock is POSITIVELY KNOWN to be <= 0 — if a product object simply
    // lacks any stock field (came from an incomplete/manual source), we allow it
    // rather than falsely flagging every such item as "out of stock".
    const { known, qty: stock } = resolveStock(product);
    if (known && stock <= 0 && !forceAdd) {
      setOutOfStockItem(product);

      // Compute recommendations
      let recs = products.filter(p => { const r = resolveStock(p); return p.id !== product.id && (!r.known || r.qty > 0); });
      
      if (product.category) {
        // Try same category
        const sameCat = recs.filter(p => p.category === product.category);
        if (sameCat.length > 0) recs = sameCat;
      }

      // Try same size if applicable
      const targetSize = product.metadata?.size || (variant ? splitVariantKey(variant).size : null);
      if (targetSize) {
        const sameSize = recs.filter(p => p.metadata?.size === targetSize || p.size === targetSize);
        // Prioritize same size, but if none exist, keep category recs
        if (sameSize.length > 0) recs = sameSize;
      }

      setRecommendedProducts(recs.slice(0, 4));
      return;
    }

    // Prompt for a variant only when THIS product actually carries its own
    // per-size/colour stock — not merely because the business type generally
    // deals in sizes. `bizConfig.hasSizes` alone used to force this prompt
    // open for EVERY product in a Clothes/Footwear/etc. shop, even one added
    // through the flat "Quantity" field with no size grid ever filled in (or
    // stocked later via Stock's flat add-quantity, which only bumps
    // currentStock and never touches size_variants) — the picker then had
    // nothing real to offer, just zero-stock tiles for sizes the shopkeeper
    // never intended to track. A product only needs this prompt when it has
    // genuine, distributed per-size/colour stock to choose between.
    let productVariants: Record<string, number> = {};
    try {
      productVariants = typeof product.size_variants === 'string'
        ? JSON.parse(product.size_variants)
        : (product.size_variants || {});
    } catch { productVariants = {}; }
    const productHasVariants = Object.values(productVariants).some((v: any) => Number(v) > 0);
    if (productHasVariants && !variant) {
      variantSelectionLotRef.current = batchInfo || null;
      setVariantSelectionProduct(product);
      return;
    }

    // A genuine first click for this product+variant (not the lot-picker's
    // own forceAdd re-entry, and not a scan that already pinned a batch) —
    // decides both whether to debounce a rapid double-fire below AND
    // whether to kick off the background lot lookup further down.
    const isOriginalClick = !batchInfo && !forceAdd && !!product?.id;
    if (isOriginalClick) {
      // Debounce: a second click on the same product+variant landing within
      // the cooldown (a real double-tap, or a stale dropdown button still
      // registering a second click before React removes it) is ignored —
      // without this, the immediate addItem() below would run twice and
      // double the quantity exactly like the old network-latency race did.
      const addKey = `${product.id}::${variant || ''}`;
      const now = Date.now();
      const lastAdd = pendingAddKeysRef.current.get(addKey);
      if (lastAdd && now - lastAdd < DUPLICATE_ADD_COOLDOWN_MS) return;
      pendingAddKeysRef.current.set(addKey, now);
    }

    const defaultQty = product.is_loose ? 0.5 : 1;
    // Resolve per-size pricing: if this product has a price set for the chosen
    // variant/size, charge that instead of the flat fallback selling price.
    let price = product.sellingPrice || Number(product.price);
    // Cost is the SHOP's real purchase cost — used for profit math AND sent
    // to the backend as purchase_price. Prefer costPrice (Udyog's real
    // cost column) over wholesaleCost (repurposed on Udyog as wholesale
    // selling price). See udyog-three-tier-pricing memory.
    let cost = Number(product.costPrice) || Number(product.wholesaleCost) || 0;
    if (variant) {
      try {
        const meta = typeof product.metadata === 'string' ? JSON.parse(product.metadata) : (product.metadata || {});
        const sp = meta?.size_prices?.[variant];
        if (sp && (sp.sellingPrice > 0 || sp.mrp > 0)) {
          price = sp.sellingPrice || sp.mrp;
          cost = Number(sp.cost) || cost;
        }
      } catch { /* fall back to flat price */ }
      // Per-variant costPrice on Udyog variants[] wins over the flat cost.
      if (Array.isArray(product.variants)) {
        const row = product.variants.find((v: any) => (v.color ? `${v.color} / ${v.size || ''}` : (v.size || '')) === variant);
        const vc = Number(row?.costPrice) || 0;
        if (vc > 0) cost = vc;
      }
    }
    // A batch-barcode scan's COST wins over every other cost source above —
    // it's the real cost of the physical stock actually being sold, and the
    // backend gives it the same priority when the sale is saved (see
    // billing/route.ts), so the on-screen profit preview matches what
    // actually gets charged. The batch's own selling price is deliberately
    // NOT applied here — v1 keeps quoting the shop's normal shelf price
    // regardless of which lot a scan happened to hit, so two physically
    // identical-looking items never ring up at different prices at the
    // counter. (Batch.sellingPrice still exists for reporting.)
    if (batchInfo && Number(batchInfo.costPrice) > 0) cost = Number(batchInfo.costPrice);
    // The lot's OWN selling price (a lot bought at a different rate keeps its price even after the product's
    // shelf price changed). No lot price recorded -> the normal shelf price stays.
    if (batchInfo && Number(batchInfo.sellingPrice) > 0) price = Number(batchInfo.sellingPrice);
    // `variant` is the raw stock key — a plain size ("M") or, for colour/size
    // products, a composite "Colour / Size" key (see ColorSizeVariantGrid). Split
    // it here so the cart row and the printed invoice can show Colour and Size
    // as their own columns instead of leaving them blank.
    const { color, size } = variant ? splitVariantKey(variant) : { color: '', size: '' };
    addItem({
      id: product.id || Math.random(),
      name: product.name,
      unit: product.baseUnit || product.unit,
      variant,
      color: color || undefined,
      size: size || undefined,
      gender: product.gender || undefined,
      quantity: defaultQty,
      price: price || 0,
      cost: cost || 0,
      profit: (price || 0) - cost,
      total: Math.round((price || 0) * defaultQty),
      is_loose: !!product.is_loose,
      // Which physical lot this line is pinned to (from a batch-barcode
      // scan) — sent to the backend as batch_id so it draws stock/cost from
      // THIS batch instead of auto-FIFO-picking one. Absent for every
      // ordinary scan/search add, which keeps working exactly as before.
      batchId: batchInfo?.id,
      batchNumber: batchInfo?.batchNumber || undefined,
      // Carried for GST invoices (per-item rate + HSN). Harmless on non-GST bills.
      gstPercent: Number(product.gstPercent ?? product.gst_percent ?? 0) || 0,
      gstInclusive: !!(product.gstInclusive ?? product.gst_inclusive ?? false),
      hsnCode: product.hsnCode ?? product.hsn_code ?? '',
      // MRP travels with the line so the cart can show the wholesaler's
      // "party discount %" off list price — a reminder of what deal they
      // quoted per product.
      mrp: Number(product.mrp) || 0,
    });

    // Background lot/batch reconciliation — the line above is already in
    // the cart and sellable at the product's own flat cost; this quietly
    // pins it to the real FIFO lot once the lookup resolves, instead of
    // making the shopkeeper wait for a network round trip before the item
    // even appears. Only for a genuine first click (not the lot-picker's
    // own forceAdd re-entry, and not a scan that already pinned a batch).
    if (isOriginalClick) {
      const applyBatches = (batches: any[]) => {
        if (batches.length >= 1) {
          const first = batches[0];
          const resolvedCost = Number(first.costPrice) > 0 ? Number(first.costPrice) : undefined;
          // Use named batchNumber if set; otherwise fall back to positional label ("Lot 1")
          const displayBatchNumber = first.batchNumber || (batches.length > 1 ? `Lot 1` : null);
          // With several lots, the old lot is sold first AT ITS OWN price; a single lot keeps the current shelf price.
          const lotPrice = batches.length > 1 && Number(first.sellingPrice) > 0 ? Number(first.sellingPrice) : undefined;
          setLineBatch(product.id, variant, { batchId: first.id, batchNumber: displayBatchNumber, cost: resolvedCost, price: lotPrice });
        }
        // Cache even when empty so repeated adds don't re-fetch
        batchCacheRef.current.set(String(product.id), batches);
      };
      const cached = batchCacheRef.current.get(String(product.id));
      if (cached !== undefined) {
        applyBatches(cached);
      } else {
        api.get(`/products/${product.id}/batches`).then(res => {
          applyBatches(Array.isArray(res.data) ? res.data : []);
        }).catch(() => { /* best-effort only — line already added at flat cost */ });
      }
    }
  }, [addItem, setLineBatch, bizConfig.hasSizes]);

  // FIFO nudge for a manually-added item (search tap / variant tile) — the
  // scan path above already nudges by comparing the SCANNED batch to the
  // oldest one; a manual add has no scanned batch to compare, so this just
  // checks whether the product has more than one live batch and, if so,
  // names the oldest. Fired after the item is already in the cart (never
  // blocks the add) and fails silently — it's an informational hint, not a
  // step the sale depends on.
  const checkFifoHintOnAdd = useCallback(async (product: any) => {
    if (!product?.id) return;
    try {
      const res = await api.get(`/products/${product.id}/batch-hint`);
      const oldest = res.data?.oldestBatch;
      if (oldest) {
        setScanFeedback({ status: 'nudge', text: t('fifoNudge', { name: product.name, batch: oldest.batchNumber || '' }) || `Older stock of ${product.name} is available — sell that lot first if possible.` });
      }
    } catch { /* best-effort hint only */ }
  }, [t]);

  const handleScan = useCallback(async (barcode: string) => {
    const raw = String(barcode).trim();
    const seq = ++scanSeqRef.current;

    // The scanner types into whatever has focus; clear it so the code doesn't
    // linger in the search box and filter the product list.
    setSearch('');
    searchInputRef.current?.focus();

    // Fast path — product already in the loaded list, matched by any of its
    // identifiers (barcode / SKU / carton barcode / unique HSN). No network hop.
    const local = matchProductByCode(products, raw);
    if (local) {
      addToCart(local);
      playScanBeep(true);
      setScanFeedback({ status: 'ok', text: local.name });
      return;
    }

    // Per-variant barcode match (e.g. "BAR-1782-BLUE-M" dropped by a desktop
    // scanner) — drops the exact colour/size into the cart, not the base row.
    const variantHit = matchVariantByCode(products, raw);
    if (variantHit) {
      addToCart(variantHit.product, variantHit.variantKey);
      playScanBeep(true);
      setScanFeedback({ status: 'ok', text: `${variantHit.product.name} · ${variantHit.variantKey}` });
      return;
    }

    // A local miss below the 2000-row list cap used to be treated as final —
    // the loaded list WAS the whole catalogue. That's no longer true: a
    // batch-specific scan code (e.g. "PROD101-B1", printed per purchased
    // lot) never appears in `GET /products` regardless of catalogue size, so
    // it would always look like a local miss. Every miss now falls through
    // to this server lookup, which also checks Batch codes — capped at 4s so
    // a slow/unreachable DB still can't hang the counter.
    setScanFeedback({ status: 'pending', text: `Looking up ${raw}…` });
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 4000);
      const res = await api.get(`/products/barcode/${encodeURIComponent(raw)}`, { signal: ac.signal });
      clearTimeout(timer);
      if (seq !== scanSeqRef.current) return; // a newer scan superseded this one
      const found = res.data;
      if (found?.id) {
        // Server tells us which variant matched (matched_variant) when the
        // scan hit a per-variant code — pre-select it in the cart so the
        // shopkeeper doesn't have to pick the colour/size again. A matched
        // batch (matched_batch) pins this line to that exact purchased lot.
        addToCart(found, found.matched_variant || undefined, false, found.matched_batch || undefined);
        playScanBeep(true);
        if (found.matched_batch && found.matched_batch.isOldest === false) {
          // Non-blocking nudge only — the shopkeeper can still complete the
          // sale with the batch they scanned, this just flags that an older
          // lot exists so it isn't left to expire/go stale on the shelf.
          setScanFeedback({ status: 'nudge', text: t('fifoNudge', { name: found.name, batch: found.matched_batch.batchNumber || '' }) || `Older stock of ${found.name} is available — sell that lot first if possible.` });
        } else {
          setScanFeedback({ status: 'ok', text: found.matched_variant ? `${found.name} · ${found.matched_variant}` : found.name });
        }
        return;
      }
      throw new Error('not found');
    } catch {
      if (seq !== scanSeqRef.current) return;
      playScanBeep(false);
      setScanFeedback({ status: 'error', text: `Not found: ${raw}` });
      setUnknownBarcode(raw);
    }
  }, [addToCart, products]);

  // Hardware barcode scanner. Detection lives in the shared hook so this screen
  // and the wholesale one behave identically.
  useBarcodeScanner({ onScan: handleScan, enabled: !unknownBarcode });

  // Clear the on-screen scan confirmation shortly after it appears. A pending
  // lookup stays put until it resolves.
  useEffect(() => {
    if (!scanFeedback || scanFeedback.status === 'pending') return;
    const t = setTimeout(() => setScanFeedback(null), 1800);
    return () => clearTimeout(t);
  }, [scanFeedback]);

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualProduct.name || !manualProduct.price) return;
    const sellingPrice = Number(manualProduct.price) || 0;
    const costPrice = Number(manualProduct.costPrice) || 0;
    const mrp = Number(manualProduct.mrp) || sellingPrice;
    const barcode = manualProduct.barcode?.trim() || '';

    // When triggered from the "Product Not Found" barcode-scan modal, the
    // barcode is prefilled. Persist the product to the catalogue FIRST so
    // scanning the same barcode a second time finds the real record and just
    // increments the cart quantity, instead of showing "Not Found" again and
    // eventually hitting "already exists" on a repeat create attempt.
    // Without a barcode (i.e. a genuine one-off manual item), fall back to
    // the original cart-only behaviour.
    if (barcode) {
      try {
        const res = await api.post('/products', {
          name: manualProduct.name.trim(),
          category: 'General',
          current_stock: 0,
          min_stock: 0,
          mrp,
          selling_price: sellingPrice,
          wholesale_cost: costPrice,
          base_unit: manualProduct.unit || 'Unit',
          barcode,
        });
        const created = res.data;
        addToCart(created, manualProduct.variant || undefined);
        // Refresh billing's own products cache so subsequent local scans of
        // this barcode short-circuit through the fast path instead of the
        // network lookup / not-found modal.
        mutate((key: any) => Array.isArray(key) && key[0] === '/products', undefined, { revalidate: true });
      } catch (err: any) {
        // Barcode already registered? Fetch the existing product by barcode
        // and add IT to cart, so the scan/create round-trip stays smooth
        // even if the create was retried by a previous session.
        const msg = err?.response?.data?.detail || err?.message || '';
        if (String(msg).toLowerCase().includes('already exists')) {
          try {
            const lookup = await api.get(`/products/barcode/${encodeURIComponent(barcode)}`);
            if (lookup.data?.id) {
              addToCart(lookup.data, manualProduct.variant || undefined);
              mutate((key: any) => Array.isArray(key) && key[0] === '/products', undefined, { revalidate: true });
            } else {
              alert(msg || 'Failed to create product');
              return;
            }
          } catch {
            alert(msg || 'Failed to create product');
            return;
          }
        } else {
          alert(msg || 'Failed to create product');
          return;
        }
      }
    } else {
      addToCart({
        name: manualProduct.name,
        sellingPrice,
        wholesaleCost: costPrice,
        mrp,
        baseUnit: manualProduct.unit,
        barcode: '',
        isManualItem: true,
      }, manualProduct.variant || undefined);
    }

    setManualProduct({ name: '', costPrice: '', mrp: '', price: '', unit: 'Unit', variant: '', barcode: '' });
    setShowManualAdd(false);
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  const handleSearchChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearch(value);
    
    if (value.length > 1) {
      // 1. Try instant local cache first (< 50ms)
      const localResults = performSmartSearch(products, value);
      
      if (localResults.length > 0) {
        setSearchResults(localResults);
      } else {
        // 2. Fallback to server search for large catalogs
        try {
          const res = await api.get(`/products?q=${encodeURIComponent(value)}&lite=true`);
          if (res.data?.data) {
            setSearchResults(res.data.data.slice(0, 15));
          } else if (Array.isArray(res.data)) {
            setSearchResults(res.data.slice(0, 15));
          }
        } catch {
          setSearchResults([]);
        }
      }
    } else {
      setSearchResults([]);
    }
  };

  const handleCreateBillClick = () => {
    // Only 'mixed' can overshoot — every other method's split is derived
    // straight from the total, so it can never exceed it (see useBillingEngine).
    if (collectedAmount > total) {
      alert(t('collectedExceedsTotal') || 'Collected amount cannot be greater than Total bill.');
      return;
    }
    setCustomerName('');
    setCustomerMobile('');
    setCustomerEmail('');
    setCustomerAddress('');
    setSendStatus(null);
    setShowCustomerModal(true);
  };

  const getUdharInfo = (name: string) => {
    if (!name.trim() || remainingAmount <= 0) return null;
    const existing = udharCustomers.find(c => c.name.toLowerCase() === name.trim().toLowerCase());
    return existing ? { type: 'existing', customer: existing } : { type: 'new' };
  };

  const udharInfo = getUdharInfo(customerName);

  const handleConfirmBill = async () => {
    setIsGeneratingBill(true);
    try {
      const saleItems = items.map(item => ({
        product_id: typeof item.id === 'string' ? item.id : null,
        name: item.name,
        unit: item.unit,
        variant: item.variant || null,
        color: item.color || null,
        size: item.size || null,
        quantity: item.quantity,
        price_per_unit: item.price,
        purchase_price: item.cost || 0,
        batch_id: item.batchId || undefined,
      }));

      // Generate bill number locally — no waiting for server
      const billNumber = `INV-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;

      const salePayload = {
        customer_id: udharInfo?.type === 'existing' && typeof udharInfo.customer?.id === 'string' && !udharInfo.customer.id.startsWith('temp-')
          ? udharInfo.customer.id
          : null,
        customer_name: customerName.trim() || null,
        customer_mobile: customerMobile.trim() || null,
        customer_email: customerEmail.trim() || null,
        customer_address: customerAddress.trim() || null,
        items: saleItems,
        discount: discount,
        total_amount: total,
        payment_type: isEmi ? 'EMI' : paymentTypeForApi,
        amount_paid: isEmi ? total : collectedAmount,
        payment_details: isEmi ? {} : { ...splitPayments, udhar: remainingAmount },
        bill_type: billType,
        gst_amount: isGstBill ? gst.totalGst : null,
        gst_details: isGstBill ? gst : null,
        invoice_number: billNumber,
      };

      const billData = {
        customerName: customerName.trim() || undefined,
        customerMobile: customerMobile.trim() || undefined,
        customerEmail: customerEmail.trim() || undefined,
        ownerSignature: profile.signatureUrl || undefined,
        items: [...items],
        total,
        discount,
        amountPaid: isEmi ? total : collectedAmount,
        remainingAmount,
        paymentMethod: isEmi ? 'EMI' : paymentTypeForApi,
        splitPayments: isEmi ? undefined : { ...splitPayments, udhar: remainingAmount },
        billNumber,
        date: fmtDate(new Date()),
        isEmi,
        isOfflineBill: false,
        billType,
        gstBreakdown: isGstBill ? gst : undefined,
        invoiceFormat: profile.invoiceFormat || 'thermal80',
        invoiceTheme: profile.invoiceTheme || 'standard',
        invoiceColor: profile.invoiceColor || null,
        businessType: profile.businessType || 'kirana',
        showQrCode: profile.showQrCode || false,
        invoiceFooter: profile.invoiceFooter || undefined,
      };

      // Show bill INSTANTLY — don't wait for DB
      setLastBill(billData);
      // Lots just sold from: drop the cached lot lists so the next search shows the real remaining quantities.
      batchCacheRef.current.clear();
      refreshLots();
      clearCart();
      setShowCustomerModal(false);
      setIsGeneratingBill(false);
      setShowBillModal(true);

      // Save to DB in background
      api.post('/billing/', salePayload)
        .then(() => {
          mutate(
            (key: any) => typeof key === 'string' && key.startsWith('/reports/dashboard'),
            undefined,
            { revalidate: true }
          );
          invalidateProductCaches();
          const email = customerEmail.trim();
          if (email) autoSendAfterBill(billData, email);
        })
        .catch(async (err) => {
          if (isNetworkError(err)) {
            // Queue offline — will sync when back online
            await queueOfflineSale(salePayload, activeShopId || profile.id).catch(() => {});
          } else {
            console.error('Bill save failed:', err);
          }
        });

      return; // already handled above
    } catch (err) {
      console.error('Failed to generate bill:', err);
      alert(t('failedToGenerateBill'));
    } finally {
      setIsGeneratingBill(false);
    }
  };

  // WhatsApp is intentionally NOT part of this — it only ever fires from an
  // explicit tap on the "WhatsApp" button (handleWhatsAppPDF below), never
  // automatically after a sale.
  const autoSendAfterBill = async (billData: any, email: string) => {
    setSendStatus(email ? { email: null } : null);

    let pdfUrl: string | null = null;

    try {
      // Wait for React to render the modal so componentRef is available
      await new Promise(resolve => setTimeout(resolve, 500)); // increased slightly

      try {
        const { blob } = await generatePDFBlob();
        const fileName = `bill-${billData.billNumber || Date.now()}.pdf`;
        pdfUrl = await uploadInvoiceToSupabase(blob, fileName);
      } catch (pdfErr) {
        console.warn('PDF generation or upload failed, continuing without PDF:', pdfErr);
      }

      // Email: send silently via server (SMTP)
      if (email) {
        try {
          await api.post('/billing/send-bill', {
            email,
            pdfUrl: pdfUrl || undefined,
            billNumber: billData.billNumber,
            customerName: billData.customerName,
            storeName: (profile as any).shopName || user?.storeName,
            total: billData.total,
            items: billData.items,
          });
          setSendStatus({ email: true });
        } catch {
          setSendStatus({ email: false });
        }
      }
    } catch (err) {
      console.error('Auto-send after bill failed:', err);
    }
  };

  // Ctrl+P "quick save & print" — two different things depending on where the
  // shopkeeper is:
  //   - Still on the cart screen: skip Customer Details entirely and save
  //     straight away (no name/mobile asked), same as a plain walk-in cash
  //     sale. Only safe when nothing is going to Udhar (that still needs a
  //     name to track against), so a partial/credit sale opens the modal
  //     instead — exactly what clicking "Confirm Sale" already does.
  //   - Already on Customer Details: same as clicking "Confirm & Print Slip".
  // Either way, the actual print fires itself once the Bill Generated modal
  // has genuinely mounted (pendingAutoPrintRef + the effect below) — calling
  // window.print() any earlier has nothing in componentRef to print yet.
  const pendingAutoPrintRef = useRef(false);

  const handleQuickSaveAndPrint = () => {
    if (items.length === 0 || isGeneratingBill) return;
    if (collectedAmount > total) {
      alert(t('collectedExceedsTotal') || 'Collected amount cannot be greater than Total bill.');
      return;
    }
    if (remainingAmount > 0) {
      handleCreateBillClick(); // Udhar needs a name — same as the normal button
      return;
    }
    setCustomerName('');
    setCustomerMobile('');
    setCustomerEmail('');
    setCustomerAddress('');
    pendingAutoPrintRef.current = true;
    handleConfirmBill();
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'p') return;
      e.preventDefault(); // otherwise the browser's own Print dialog opens
      if (showCustomerModal) {
        if (isGeneratingBill || (remainingAmount > 0 && !customerName.trim())) return;
        pendingAutoPrintRef.current = true;
        handleConfirmBill();
      } else if (!showBillModal) {
        handleQuickSaveAndPrint();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [showCustomerModal, showBillModal, isGeneratingBill, remainingAmount, customerName, items.length, collectedAmount, total]);

  // Fires once the Bill Generated modal has actually rendered (componentRef
  // needs real DOM to print) — not immediately after handleConfirmBill
  // resolves, since that state update hasn't painted yet at that point.
  useEffect(() => {
    if (!showBillModal || !lastBill || !pendingAutoPrintRef.current) return;
    pendingAutoPrintRef.current = false;
    const timer = setTimeout(() => { handlePrint(); }, 300);
    return () => clearTimeout(timer);
  }, [showBillModal, lastBill]);

  // F2/F3/Ctrl+K — same shortcuts WholesaleBillingUI.tsx already has, ported
  // here for parity: F2 opens Customer Details (same as clicking "Confirm
  // Sale"), F3 jumps focus to the search box, Ctrl+K opens Manual Add.
  useEffect(() => {
    const handleShortcutKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        if (items.length > 0 && !showCustomerModal && !showBillModal) {
          handleCreateBillClick();
        }
      } else if (e.key === 'F3') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        setShowManualAdd(true);
      }
    };
    window.addEventListener('keydown', handleShortcutKeyDown);
    return () => window.removeEventListener('keydown', handleShortcutKeyDown);
  }, [items.length, showCustomerModal, showBillModal]);

  // Cart lines that belong in the Brand x ML matrix vs. the plain table below
  // it — a sized liquor line (e.g. "Kingfisher 650ml", or a variant colour
  // that's itself an ML value) goes in the matrix; anything else (snacks,
  // cigarettes, a non-liquor shop's whole cart) stays in the normal table so
  // nothing in the bill goes missing.
  const isLiquorCartLine = useCallback((item: any) => {
    if (!bizConfig.hasLiquorSpecs) return false;
    if (item.variant) {
      const color = String(item.variant).split('/')[0]?.trim() || '';
      return !!extractMlToken(color);
    }
    return !!extractMlToken(item.name);
  }, [bizConfig.hasLiquorSpecs]);
  const liquorCartLines = useMemo(() => bizConfig.hasLiquorSpecs ? items.filter(isLiquorCartLine) : [], [items, isLiquorCartLine, bizConfig.hasLiquorSpecs]);
  const nonLiquorCartItems = useMemo(() => bizConfig.hasLiquorSpecs ? items.filter(i => !isLiquorCartLine(i)) : items, [items, isLiquorCartLine, bizConfig.hasLiquorSpecs]);

  const paymentOptions: { id: PaymentMethod; label: string; icon: React.ReactNode }[] = [
    { id: 'cash', label: t('cash') || 'Cash', icon: <IndianRupee size={20}/> },
    { id: 'upi', label: t('upi') || 'UPI', icon: <Smartphone size={20}/> },
    { id: 'card', label: t('card') || 'Card', icon: <CreditCard size={20}/> },
    { id: 'udhar', label: t('udhar') || 'Udhar', icon: <User size={20}/> },
    { id: 'mixed', label: t('mixed') || 'Mixed', icon: <Layers size={20}/> },
  ];

  const paymentMethodLabel = paymentOptions.find(o => o.id === paymentMethod)?.label ?? '';
  const isUdharSale = paymentMethod === 'udhar';
  const isMixedSale = paymentMethod === 'mixed';
  const isPartialUdhar = isUdharSale && udharAdvance > 0;
  // Matches the payment_type values the invoice + reports screens already read.
  // A part-paid udhar bill is a genuine Split: the backend books only the cash
  // slice of payment_details to the drawer, so a UPI/card advance stays out of it.
  // Mixed is always reported as Split too, whether or not it's fully allocated —
  // same wire convention Wholesale/Udyog billing already uses for its own Mixed.
  const paymentTypeForApi = (isPartialUdhar || isMixedSale)
    ? 'Split'
    : { cash: 'Cash', upi: 'UPI', card: 'Card', udhar: 'Udhar', mixed: 'Split' }[paymentMethod];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-full lg:h-full relative overflow-y-auto lg:overflow-visible">
      {/* Left: Product Search & Cart */}
      <div className="lg:col-span-2 space-y-6 flex flex-col">
        {/* Business mode badge */}
        {bizConfig && (
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <span className="text-base">{bizConfig.emoji}</span>
            <span>{bizConfig.label} Mode</span>
            {isElectronics && (
              <span className="bg-sky-500/15 text-sky-400 border border-sky-500/30 px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1">
                <Zap size={9} />{t('emiMode') || 'EMI Available'}
              </span>
            )}
          </div>
        )}

        <div className="flex gap-4 relative">
          {/* Camera scanning — opens an in-app viewfinder, not the device's
              camera app, so the cashier never leaves the bill. Mobile-only:
              a desktop counter already has a real barcode scanner plugged in,
              which types straight into this screen via useBarcodeScanner. */}
          {isMobile && (
            <button
              type="button"
              onClick={() => setShowCameraScanner(true)}
              title={t('scanBarcode') || 'Scan with camera'}
              className="shrink-0 flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-sm transition-colors active:scale-95"
            >
              <Scan size={20} />
              <span className="hidden sm:inline text-sm">Scan</span>
            </button>
          )}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={t('searchProduct')}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-3 pl-10 pr-4 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
              value={search}
              onChange={handleSearchChange}
            />
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 w-full mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto">
                {searchResults.map((product) => (lotsByProduct[String(product.id)]?.length > 1) ? (
                  <div key={product.id} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                    <div className="px-4 pt-2.5 pb-1">
                      <p className="font-bold text-slate-900 dark:text-slate-200">{product.name}</p>
                      <p className="text-[11px] text-slate-500">{product.category} · {lotsByProduct[String(product.id)].length} lots in stock — pick the lot to sell</p>
                    </div>
                    {lotsByProduct[String(product.id)].map((lot: any, idx: number) => {
                      const lotPrice = Number(lot.sellingPrice) > 0 ? Number(lot.sellingPrice) : (Number(product.sellingPrice ?? product.selling_price) || 0);
                      return (
                        <button
                          key={lot.id}
                          onClick={() => addToCart(product, undefined, false, { id: lot.id, batchNumber: lot.batchNumber || makeLotLabel(lot).replace(/^Lot /, ''), costPrice: lot.costPrice, sellingPrice: lot.sellingPrice })}
                          className="w-full text-left px-4 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 flex justify-between items-center gap-3"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2 flex-wrap">
                              {makeLotLabel(lot)}
                              {idx === 0 && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-900 dark:bg-white text-white dark:text-slate-900">Old · sell first</span>}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {lot.purchaseDate ? `bought ${new Date(lot.purchaseDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                              {lot.expiryDate ? ` · exp ${new Date(lot.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}` : ''}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-bold text-emerald-500">₹{lotPrice.toLocaleString('en-IN')}</p>
                            <p className="text-[10px] font-bold text-slate-500">{lot.quantity} left</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <button
                    key={product.id}
                    onClick={() => { addToCart(product); checkFifoHintOnAdd(product); }}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 flex justify-between items-center border-b border-slate-100 dark:border-slate-800 last:border-0"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-slate-900 dark:text-slate-200">{product.name}</p>
                        {product.is_loose && <span className="text-[9px] bg-amber-500/20 text-amber-400 font-black px-1.5 py-0.5 rounded uppercase">{tP('looseBadge')}</span>}
                      </div>
                      <p className="text-xs text-slate-500">
                        {product.category} · {product.baseUnit ?? product.base_unit}
                        {product.is_loose && <span className="ml-1 text-amber-400">· sell by weight</span>}
                        {product.model_number && <span className="ml-1 text-sky-400">· {product.model_number}</span>}
                        {product.warranty_months && <span className="ml-1 text-emerald-400">· {product.warranty_months}m warranty</span>}
                        {product.gender && <span className="ml-1 text-violet-400">· {product.gender}</span>}
                        {product.batch_number && <span className="ml-1 text-slate-400">· Batch: {product.batch_number}</span>}
                        {formatAddedDate(product.createdAt) && (
                          <span className="ml-1 text-slate-400">· Added {formatAddedDate(product.createdAt)}</span>
                        )}
                      </p>
                    </div>
                    <div className="text-right">
                      {(() => {
                        // Per-size pricing: the base sellingPrice is 0 and
                        // each variant carries its own. Show the min–max
                        // range so the shopkeeper sees a real price at the
                        // search stage instead of "₹0".
                        const perSize = product.metadata?.size_prices || {};
                        const sellingList = Object.values(perSize).map((p: any) => Number(p?.sellingPrice) || 0).filter((n) => n > 0);
                        const mrpList = Object.values(perSize).map((p: any) => Number(p?.mrp) || 0).filter((n) => n > 0);
                        const baseSell = Number(product.sellingPrice ?? product.selling_price) || 0;
                        const baseMrp = Number(product.mrp) || 0;
                        const sellMin = sellingList.length ? Math.min(...sellingList) : baseSell;
                        const sellMax = sellingList.length ? Math.max(...sellingList) : baseSell;
                        const mrpMin = mrpList.length ? Math.min(...mrpList) : baseMrp;
                        const mrpMax = mrpList.length ? Math.max(...mrpList) : baseMrp;
                        const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;
                        return (
                          <>
                            <p className="font-bold text-emerald-500">
                              {sellMin === sellMax ? fmt(sellMin) : `${fmt(sellMin)} – ${fmt(sellMax)}`}
                            </p>
                            <p className="text-[10px] text-slate-500">
                              MRP: {mrpMin === mrpMax ? fmt(mrpMin) : `${fmt(mrpMin)} – ${fmt(mrpMax)}`}
                            </p>
                          </>
                        );
                      })()}
                      {(() => {
                        // Remaining stock + low-stock indicator, right under the MRP.
                        // The "+N today" chip mirrors Stock/Products so a cashier can
                        // confirm at a glance that a just-received item's fresh count
                        // is already reflected here — otherwise "Added 2d ago" (which
                        // is only the row's creation date) reads as "hasn't updated".
                        const { known, qty } = resolveStock(product);
                        if (!known) return null;
                        const minStock = Number(product.minStock ?? product.min_stock ?? 0);
                        const isOut = qty <= 0;
                        const isLow = !isOut && minStock > 0 && qty <= minStock;
                        const recent = Number(product.recentlyAdded) || 0;
                        return (
                          <div className="flex items-center gap-1 justify-end mt-0.5">
                            {recent > 0 && (
                              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-500/20 px-1.5 py-0.5 rounded-full">
                                +{recent}
                              </span>
                            )}
                            <p className={cn(
                              'text-[10px] font-bold',
                              isOut ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-emerald-600 dark:text-emerald-400'
                            )}>
                              {isOut ? 'Out of stock' : `${qty} in stock${isLow ? ' · Low' : ''}`}
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => setShowManualAdd(!showManualAdd)}
            className={cn(
              'px-4 py-3 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-sm',
              showManualAdd ? 'bg-slate-100 dark:bg-slate-800 text-emerald-500' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            )}
          >
            <PlusCircle size={20} />
            <span className="hidden md:inline">{t('manualAdd') || 'Manual Add'}</span>
            <span className="hidden md:inline text-[10px] bg-emerald-200/50 dark:bg-emerald-900 px-1.5 rounded ml-1">Ctrl+K</span>
          </button>
          {/* <button
            onClick={() => setShowManualBillUpload(true)}
            className="px-4 py-3 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          >
            <FileUp size={20} />
            <span className="hidden md:inline">{t('manualBill') || 'Manual Bill'}</span>
          </button> */}
        </div>

        {showManualAdd && (
          <Card className="bg-white dark:bg-slate-900 border-emerald-200 dark:border-emerald-500/30 animate-in slide-in-from-top-2 duration-200 shadow-sm">
            <CardContent className="p-4">
              <form onSubmit={handleManualAdd} className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[180px]">
                  <label className="text-xs text-slate-500 mb-1 block uppercase font-bold">Product Name</label>
                  <input
                    type="text" required placeholder={t('itemNamePlaceholder')}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-slate-900 dark:text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors"
                    value={manualProduct.name}
                    onChange={e => setManualProduct({...manualProduct, name: e.target.value})}
                  />
                </div>
                {bizConfig.hasSizes && (
                  <div className="w-24">
                    <label className="text-xs text-slate-500 mb-1 block uppercase font-bold">Size/Variant</label>
                    <input
                      type="text" placeholder={t('sizeVariantPlaceholder')}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-slate-900 dark:text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors"
                      value={manualProduct.variant}
                      onChange={e => setManualProduct({...manualProduct, variant: e.target.value})}
                    />
                  </div>
                )}
                <div className="w-24">
                  <label className="text-xs text-slate-500 mb-1 block uppercase font-bold">Cost Price (₹)</label>
                  <input
                    type="number" placeholder="0" step="any"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-slate-900 dark:text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors"
                    value={manualProduct.costPrice}
                    onChange={e => setManualProduct({...manualProduct, costPrice: e.target.value})}
                  />
                </div>
                <div className="w-24">
                  <label className="text-xs text-slate-500 mb-1 block uppercase font-bold">MRP (₹)</label>
                  <input
                    type="number" placeholder="0" step="any"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-slate-900 dark:text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors"
                    value={manualProduct.mrp}
                    onChange={e => setManualProduct({...manualProduct, mrp: e.target.value})}
                  />
                </div>
                <div className="w-24">
                  <label className="text-xs text-slate-500 mb-1 block uppercase font-bold">Sell Price (₹)</label>
                  <input
                    type="number" required placeholder="0" step="any"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-slate-900 dark:text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors font-bold text-emerald-600 dark:text-emerald-400"
                    value={manualProduct.price}
                    onChange={e => setManualProduct({...manualProduct, price: e.target.value})}
                  />
                </div>
                <div className="w-24">
                  <label className="text-xs text-slate-500 mb-1 block uppercase font-bold">Unit</label>
                  <select
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-slate-900 dark:text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors"
                    value={manualProduct.unit}
                    onChange={e => setManualProduct({...manualProduct, unit: e.target.value})}
                  >
                    {bizConfig.defaultUnits.map(u => <option key={u} value={u}>{translateData(u, locale) || u}</option>)}
                  </select>
                </div>
                <button type="submit" className="bg-emerald-500 text-white dark:text-slate-900 px-4 py-2 rounded-lg font-bold hover:bg-emerald-400">Add Item</button>
              </form>
            </CardContent>
          </Card>
        )}

      {/* Camera scanner overlay. `continuous` because billing is a rapid
          sequence of items — reopening the camera per product would be
          unusable at a counter. It de-dupes the same code for 2s. */}
      {isMobile && showCameraScanner && (
        <CameraScanner
          continuous
          onScan={(code) => handleScan(code)}
          onClose={() => {
            setShowCameraScanner(false);
            setTimeout(() => searchInputRef.current?.focus(), 100);
          }}
        />
      )}

      {/* Scan confirmation — pairs with the beep so a mis-scan is caught
          without the cashier having to hunt through the cart. */}
      {scanFeedback && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            'fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] px-5 py-3 rounded-2xl shadow-2xl border flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 pointer-events-none',
            scanFeedback.status === 'ok' ? 'bg-emerald-600 border-emerald-500 text-white'
              : scanFeedback.status === 'error' ? 'bg-red-600 border-red-500 text-white'
              // Advisory only — the item was already added, this is just a
              // heads-up, so it reads as a warning rather than an error.
              : scanFeedback.status === 'nudge' ? 'bg-amber-500 border-amber-400 text-white'
              : 'bg-slate-800 border-slate-700 text-white',
          )}
        >
          {scanFeedback.status === 'ok' ? <CheckCircle size={20} />
            : scanFeedback.status === 'error' ? <AlertCircle size={20} />
            : scanFeedback.status === 'nudge' ? <Layers size={20} />
            : <Loader2 size={20} className="animate-spin" />}
          <span className="font-bold text-sm max-w-[60vw] truncate">{scanFeedback.text}</span>
        </div>
      )}

      {/* Unknown Barcode Modal */}
      {unknownBarcode && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center animate-in zoom-in-95">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Scan size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{t('productNotFound') || 'Product Not Found'}</h3>
            <p className="text-slate-500 mb-6">{t('noProductFoundBarcode') || 'No product found for barcode '} <strong className="text-slate-700 dark:text-slate-300">{unknownBarcode}</strong></p>
            <div className="flex gap-3">
              <button onClick={() => {
                setUnknownBarcode(null);
                setTimeout(() => searchInputRef.current?.focus(), 100);
              }} className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-700">
                {t('cancel') || 'Cancel'}
              </button>
              <button onClick={() => {
                setManualProduct(p => ({ ...p, barcode: unknownBarcode }));
                setUnknownBarcode(null);
                setShowManualAdd(true);
              }} className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold">
                {t('createProduct') || 'Create Product'}
              </button>
            </div>
          </div>
        </div>
      )}

        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 flex-1 overflow-hidden flex flex-col shadow-sm">
          <CardHeader className="border-b border-slate-200 dark:border-slate-800 p-4">
            <CardTitle className="text-slate-900 dark:text-slate-200 flex justify-between items-center text-base">
              <div className="flex items-center gap-3">
                <span>{t('items') || 'Items'}</span>
                <span className="text-sm font-normal text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">{items.length}</span>
              </div>
              <div className="flex items-center gap-2">
                {selectedItemIds.size > 0 && (
                  <button onClick={() => {
                    selectedItemIds.forEach(id => removeItem(id as number));
                    setSelectedItemIds(new Set());
                  }} className="text-xs bg-red-500/10 text-red-500 hover:bg-red-500/20 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 transition-colors">
                    <Trash2 size={14} /> {t('deleteSelected') || 'Delete Selected'} ({selectedItemIds.size})
                  </button>
                )}
                {items.length > 0 && (
                  <button onClick={() => { clearCart(); setSelectedItemIds(new Set()); }} className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 px-3 py-1.5 rounded-lg font-bold transition-colors">
                    {t('clearAll') || 'Clear All'}
                  </button>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-0">
            {liquorCartLines.length > 0 && (
              <LiquorCartMatrix
                catalogRows={products.map((p: any) => ({ id: p.id, name: p.name, stock: p.currentStock || 0, price: p.sellingPrice, variants: p.variants }))}
                lines={liquorCartLines.map(i => ({ id: i.id, name: i.name, variant: i.variant, quantity: i.quantity, price: i.price }))}
                onAdd={(productId, variantKey) => {
                  // Same addToCart every other entry point uses — stock guard,
                  // batch lookup, price — a sibling size shown at qty 0 is a
                  // real product, so adding it goes through the real flow too.
                  const product = products.find((p: any) => p.id === productId);
                  if (product) { addToCart(product, variantKey); checkFifoHintOnAdd(product); }
                }}
                onDecrement={(productId, variantKey, newQty) => {
                  if (newQty <= 0) removeItem(productId, variantKey);
                  else updateQuantity(productId, newQty, variantKey);
                }}
                onRemoveRow={(productId, variantKey) => removeItem(productId, variantKey)}
              />
            )}
            {(nonLiquorCartItems.length > 0 || liquorCartLines.length === 0) && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full text-left border-collapse">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[11px] uppercase font-semibold tracking-wide sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2.5 w-9">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 dark:border-slate-600 text-slate-700 focus:ring-slate-400 cursor-pointer w-3.5 h-3.5"
                      checked={nonLiquorCartItems.length > 0 && selectedItemIds.size === nonLiquorCartItems.length}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedItemIds(new Set(nonLiquorCartItems.map(i => i.id)));
                        else setSelectedItemIds(new Set());
                      }}
                    />
                  </th>
                  <th className="px-3 py-2.5">{t('itemCol') || 'ITEM'}</th>
                  {bizConfig.hasLiquorSpecs && <th className="px-3 py-2.5 whitespace-nowrap">{t('ml') || 'ML'}</th>}
                  <th className="px-4 py-2.5 whitespace-nowrap text-center">{t('qtyCol') || 'QTY'}</th>
                  <th className="px-4 py-2.5 text-right whitespace-nowrap">{t('priceCol') || 'PRICE'}</th>
                  <th className="px-4 py-2.5 text-right whitespace-nowrap">{t('totalCol') || 'TOTAL'}</th>
                  <th className="px-3 py-2.5 text-center whitespace-nowrap">{t('actionCol') || 'ACT'}</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-slate-200 dark:divide-slate-800">
                {nonLiquorCartItems.map((item, rowIdx) => {
                  const stockInfo = resolveStockForItem(item, products);
                  const maxQty = stockInfo.known ? stockInfo.qty : undefined;
                  return (
                  <tr key={`${item.id}-${item.unit}-${item.variant || 'none'}-${(item as any).batchId || ''}`} className={cn('text-slate-900 dark:text-slate-200 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors border-b border-slate-100 dark:border-slate-800 last:border-0', rowIdx % 2 === 1 && 'bg-slate-50/40 dark:bg-slate-800/20')}>
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        className="rounded border-slate-300 dark:border-slate-600 text-slate-700 focus:ring-slate-400 cursor-pointer w-3.5 h-3.5"
                        checked={selectedItemIds.has(item.id)}
                        onChange={(e) => {
                          const newSet = new Set(selectedItemIds);
                          if (e.target.checked) newSet.add(item.id);
                          else newSet.delete(item.id);
                          setSelectedItemIds(newSet);
                        }}
                      />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">{item.name}</div>
                      {/* Sub-line: variant · gender · unit */}
                      {(() => {
                        const parts = [
                          bizConfig.hasSizes && item.color ? `${item.color} / ${item.size || item.variant}` : (item.size || item.variant) || null,
                          bizConfig.hasGender && item.gender ? item.gender : null,
                          item.unit || null,
                        ].filter(Boolean);
                        const mrp = Number(item.mrp) || 0;
                        const discPct = (mrp > 0 && item.price > 0 && item.price < mrp) ? ((mrp - item.price) / mrp) * 100 : 0;
                        return (
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            {parts.length > 0 && (
                              <span className="text-[11px] text-slate-400">{parts.join(' · ')}</span>
                            )}
                            {discPct > 0 && (
                              <span className="text-[10px] px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-medium" title={`MRP ₹${mrp}`}>
                                {discPct.toFixed(discPct >= 10 ? 0 : 1)}% off
                              </span>
                            )}
                          </div>
                        );
                      })()}
                      {/* Lot/Batch badge — shown for any item with an assigned batch (auto-FIFO
                          or barcode-scan). Clickable to switch lots only when the product has >1. */}
                      {(item as any).batchId && (() => {
                        const pid = String(item.id);
                        const cachedBatches = batchCacheRef.current.get(pid);
                        const idx = cachedBatches ? cachedBatches.findIndex((b: any) => b.id === (item as any).batchId) : -1;
                        const lotLabel = (item as any).batchNumber || (idx >= 0 ? `Lot ${idx + 1}` : 'Lot 1');
                        const canChange = !cachedBatches || cachedBatches.length > 1;
                        if (!canChange) {
                          return (
                            <div className="mt-1.5">
                              <span className="inline-flex items-center px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-medium text-slate-500">
                                {lotLabel}
                              </span>
                            </div>
                          );
                        }
                        return (
                          <div className="mt-1.5">
                            <button
                              type="button"
                              title="Click to change lot"
                              onClick={async () => {
                                let batches = batchCacheRef.current.get(pid);
                                if (!batches) {
                                  try {
                                    const res = await api.get(`/products/${pid}/batches`);
                                    batches = Array.isArray(res.data) ? res.data : [];
                                    batchCacheRef.current.set(pid, batches);
                                  } catch { batches = []; }
                                }
                                if (batches.length > 1) {
                                  const prod = products.find((p: any) => p.id === pid) || { id: pid, name: item.name };
                                  setBatchSelectionProduct(prod);
                                  setBatchSelectionVariant(lineRef(item));
                                  setBatchSelectionOptions(batches);
                                }
                              }}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-800/30 transition-colors"
                            >
                              <span>{lotLabel}</span>
                              <span className="text-[9px] opacity-60">↕</span>
                            </button>
                          </div>
                        );
                      })()}
                      {/* Inline Color / Size chips — clothes & footwear */}
                      {bizConfig.hasSizes && (() => {
                        const prod = products.find((p: any) => p.id === item.id);
                        let sv: any = prod?.size_variants ?? prod?.sizeVariants;
                        if (typeof sv === 'string') { try { sv = JSON.parse(sv); } catch { sv = null; } }
                        const svObj: Record<string, number> = (sv && typeof sv === 'object') ? sv : {};
                        const isComposite = isColorSizeVariants(svObj);
                        const availColors = isComposite ? colorsFromVariants(svObj) : [];
                        // Sizes: for composite keys filter by selected color; for simple keys use all keys
                        const selectedColor = item.color || '';
                        const availSizes = isComposite
                          ? sizesFromVariants(svObj).filter(sz => {
                              if (!selectedColor) return true;
                              const key = `${selectedColor} / ${sz}`;
                              return key in svObj;
                            })
                          : Object.keys(svObj);
                        const stockForSize = (sz: string) => {
                          const key = isComposite ? `${selectedColor} / ${sz}` : sz;
                          return Number(svObj[key] ?? 0);
                        };
                        return (
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {/* Color chip — text input + quick-select buttons */}
                            <div className="flex items-center gap-1 flex-wrap">
                              <label className="inline-flex items-center gap-1 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-700 rounded-md px-1.5 py-0.5 shrink-0">
                                <span className="text-[10px] text-rose-400 dark:text-rose-300 font-medium whitespace-nowrap">Color</span>
                                <input
                                  type="text"
                                  placeholder="—"
                                  value={item.color || ''}
                                  onChange={e => updateColorSize(item.id, { color: e.target.value }, lineRef(item))}
                                  className="bg-transparent outline-none text-[11px] w-14 text-slate-700 dark:text-slate-300 min-w-0 font-medium"
                                />
                              </label>
                              {availColors.map(c => (
                                <button key={c} type="button"
                                  onClick={() => updateColorSize(item.id, { color: c }, lineRef(item))}
                                  className={cn('text-[10px] px-1.5 py-0.5 rounded border font-semibold transition-colors',
                                    item.color === c
                                      ? 'bg-rose-500 border-rose-500 text-white'
                                      : 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-700 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-800/30'
                                  )}>
                                  {c}
                                </button>
                              ))}
                            </div>
                            {/* Size chip — text input + stock-aware buttons */}
                            <div className="flex items-center gap-1 flex-wrap">
                              <label className="inline-flex items-center gap-1 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-md px-1.5 py-0.5 shrink-0">
                                <span className="text-[10px] text-indigo-400 dark:text-indigo-300 font-medium whitespace-nowrap">Size</span>
                                <input
                                  type="text"
                                  placeholder="—"
                                  value={item.size || ''}
                                  onChange={e => updateColorSize(item.id, { size: e.target.value }, lineRef(item))}
                                  className="bg-transparent outline-none text-[11px] w-10 text-slate-700 dark:text-slate-300 min-w-0 font-medium"
                                />
                              </label>
                              {availSizes.map(sz => {
                                const stock = stockForSize(sz);
                                const inStock = stock > 0;
                                const isSelected = item.size === sz;
                                return (
                                  <button key={sz} type="button"
                                    onClick={() => updateColorSize(item.id, { size: sz }, lineRef(item))}
                                    title={inStock ? `${sz}: ${stock} in stock` : `${sz}: out of stock`}
                                    className={cn('text-[10px] px-1.5 py-0.5 rounded border font-bold transition-colors',
                                      isSelected
                                        ? 'bg-indigo-500 border-indigo-500 text-white'
                                        : inStock
                                        ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-800/30'
                                        : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 line-through'
                                    )}>
                                    {sz}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                      {/* Inline chips: Expiry / Warranty / Serial (Batch chip replaced by Lot badge above) */}
                      {(bizConfig.hasExpiry || bizConfig.hasWarranty || isElectronics) && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {bizConfig.hasExpiry && (
                            <label className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-1.5 py-0.5">
                              <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">Exp</span>
                              <input type="text" placeholder="MM/YY"
                                className="bg-transparent outline-none text-[11px] w-12 text-slate-700 dark:text-slate-300 min-w-0" />
                            </label>
                          )}
                          {bizConfig.hasWarranty && (
                            <label className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-1.5 py-0.5">
                              <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">Wty</span>
                              <input type="text" placeholder="mo."
                                className="bg-transparent outline-none text-[11px] w-10 text-slate-700 dark:text-slate-300 min-w-0" />
                            </label>
                          )}
                          {isElectronics && (
                            <label className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-1.5 py-0.5">
                              <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">S/N</span>
                              <input type="text" placeholder="IMEI/S/N"
                                className="bg-transparent outline-none text-[11px] w-20 text-slate-700 dark:text-slate-300 min-w-0" />
                            </label>
                          )}
                        </div>
                      )}
                    </td>
                    {bizConfig.hasLiquorSpecs && (
                      <td className="px-3 py-3 text-sm font-semibold text-rose-600 dark:text-rose-400 whitespace-nowrap align-top">
                        {item.color || (item.variant ? splitVariantKey(item.variant).color : '') || '-'}
                      </td>
                    )}
                    <td className="px-4 py-3 align-top">
                      {item.is_loose ? (
                        <div className="flex flex-col gap-1.5 min-w-[150px]">
                          {/* Quantity input */}
                          <div className="flex items-center gap-1">
                            <CartQuantityInputRetail item={item} updateQuantity={updateQuantity} removeItem={removeItem} maxQty={maxQty} />
                            <span className="text-xs text-slate-500">{item.unit}</span>
                            {looseEquivLabel(item.quantity, item.unit) && (
                              <span className="text-[10px] text-amber-400 font-bold">
                                = {looseEquivLabel(item.quantity, item.unit)}
                              </span>
                            )}
                          </div>
                          {/* Rate info: ₹X per Kg */}
                          <p className="text-[10px] text-slate-500">
                            {t('ratePerUnit')}: <span className="text-emerald-600 dark:text-emerald-400 font-bold">₹{item.price}</span> {t('per')} {item.unit}
                            {' · '}<span className="text-amber-500 dark:text-amber-300 font-semibold">= ₹{item.total.toFixed(2)}</span>
                          </p>
                          {typeof maxQty === 'number' && (
                            <p className="text-[10px] text-amber-500 font-semibold">{t('inStock') || 'In stock'}: {maxQty} {item.unit}</p>
                          )}
                          {/* Preset buttons */}
                          <div className="flex flex-wrap gap-1">
                            {getLoosePresets(item.unit).filter(p => typeof maxQty !== 'number' || p.v <= maxQty).map(p => (
                              <button
                                key={p.l}
                                onClick={() => updateQuantity(item.id, p.v, lineRef(item))}
                                className={cn(
                                  'text-[10px] px-1.5 py-0.5 rounded transition-colors font-medium',
                                  item.quantity === p.v
                                    ? 'bg-emerald-500 dark:bg-emerald-600 text-white'
                                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                                )}
                              >{p.l}</button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button onClick={() => {
                            const newQty = item.quantity - 1;
                            if (newQty <= 0) removeItem(item.id, lineRef(item));
                            else updateQuantity(item.id, newQty, lineRef(item));
                          }} className="w-6 h-6 flex items-center justify-center rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-red-100 hover:text-red-600 transition-colors">
                            <Minus size={14}/>
                          </button>
                          <CartQuantityInputRetail item={item} updateQuantity={updateQuantity} removeItem={removeItem} maxQty={maxQty} />
                          <button
                            onClick={() => {
                              const newQty = item.quantity + 1;
                              if (typeof maxQty === 'number' && newQty > maxQty) return;
                              updateQuantity(item.id, newQty, lineRef(item));
                            }}
                            disabled={typeof maxQty === 'number' && item.quantity >= maxQty}
                            title={typeof maxQty === 'number' && item.quantity >= maxQty ? (t('onlyXInStock', {count: maxQty}) || `Only ${maxQty} in stock`) : undefined}
                            className="w-6 h-6 flex items-center justify-center rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-emerald-100 hover:text-emerald-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-100 dark:disabled:hover:bg-slate-800"
                          >
                            <Plus size={14}/>
                          </button>
                        </div>
                      )}
                      {typeof maxQty === 'number' && !item.is_loose && item.quantity >= maxQty && (
                        <p className="text-[10px] text-amber-500 font-semibold mt-1">{t('onlyXInStock', {count: maxQty}) || `Only ${maxQty} in stock`}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right align-top">
                      <CartPriceInputRetail item={item} updatePrice={updatePrice} updateGstPercent={updateGstPercent} isGstBill={isGstBill} />
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-sm align-top tabular-nums">
                      ₹{item.total}
                      {isGstBill && (() => {
                        const gstPct = Number(item.gstPercent) || 0;
                        if (!gstPct) return null;
                        const gstAmt = Math.round((item.total - item.total / (1 + gstPct / 100)) * 100) / 100;
                        const half = Math.round(gstAmt / 2 * 100) / 100;
                        return (
                          <div className="text-[10px] text-violet-500 dark:text-violet-400 font-medium mt-0.5 leading-tight">
                            {gstInterState ? (
                              <span>IGST ₹{gstAmt.toLocaleString('en-IN')}</span>
                            ) : (
                              <>
                                <div>CGST ₹{half.toLocaleString('en-IN')}</div>
                                <div>SGST ₹{half.toLocaleString('en-IN')}</div>
                              </>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-3 text-center align-top">
                      <button onClick={() => removeItem(item.id, lineRef(item))} className="text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 p-1.5 rounded transition-colors">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                  );
                })}
                  {nonLiquorCartItems.length === 0 && liquorCartLines.length === 0 && (
                    <tr>
                      <td colSpan={6 + (bizConfig.hasLiquorSpecs ? 1 : 0)} className="px-6 py-16 text-center text-slate-400 text-sm">
                        {t('emptyCart') || 'No items in cart. Start scanning or searching!'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right: Summary & Payment */}
      <div className="space-y-6 lg:overflow-y-auto lg:max-h-[calc(100vh-100px)] lg:pb-8 custom-scrollbar">
        <div className="flex justify-end relative">
          <button
            onClick={() => setShowCalculator(!showCalculator)}
            className={cn(
              'p-3 rounded-xl border transition-all flex items-center gap-2 font-bold shadow-sm',
              showCalculator ? 'bg-emerald-500 text-white dark:text-slate-900 border-emerald-500' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900'
            )}
          >
            <CalcIcon size={20} />
            {t('calculator') || 'Calculator'}
          </button>
          {showCalculator && (
            <div className="absolute top-full right-0 mt-2 z-[60]">
              <Calculator onClose={() => setShowCalculator(false)} />
            </div>
          )}
        </div>




        {/* Order Summary */}
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
          <CardContent className="p-6 space-y-4">
            {/* Billing type: Non-GST (default) or GST invoice */}
            <div>
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-950 rounded-xl">
                <button
                  type="button"
                  onClick={() => setBillType('non_gst')}
                  aria-pressed={!isGstBill}
                  className={cn(
                    'py-2 rounded-lg text-xs font-bold transition-all',
                    !isGstBill ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'
                  )}
                >
                  {t('nonGstInvoice') || 'Non-GST Invoice'}
                </button>
                <button
                  type="button"
                  onClick={() => setBillType('gst')}
                  aria-pressed={isGstBill}
                  className={cn(
                    'py-2 rounded-lg text-xs font-bold transition-all',
                    isGstBill ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500'
                  )}
                >
                  {t('gstInvoice') || 'GST Invoice'}
                </button>
              </div>
              {isGstBill && (
                <label className="flex items-center gap-2 mt-2 text-xs text-slate-500 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={gstInterState}
                    onChange={e => setGstInterState(e.target.checked)}
                    className="accent-indigo-500"
                  />
                  {t('interStateIgst') || 'Inter-state sale (IGST)'}
                </label>
              )}
            </div>

            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>{t('subtotal')}</span>
              <span>₹{subtotal.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
              <span>{t('discount')}</span>
              <DiscountInput subtotal={subtotal} discount={discount} setDiscount={setDiscount} />
            </div>
            {/* GST tax summary — shown for GST invoices. Prices are GST-inclusive,
                so this breaks the same total into taxable value + embedded tax.
                Shown even when GST rates aren't set on the products yet (0%),
                so the cashier can see it's missing instead of the section just
                vanishing and looking like a Non-GST bill. */}
            {isGstBill && items.length > 0 && (
              <div className="rounded-xl border border-indigo-200 dark:border-indigo-500/20 bg-indigo-50/50 dark:bg-indigo-500/5 p-3 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-500 dark:text-slate-400">
                  <span>{t('taxableValue') || 'Taxable Value'}</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">₹{gst.taxable.toLocaleString('en-IN')}</span>
                </div>
                {gstInterState ? (
                  <div className="flex justify-between text-slate-500 dark:text-slate-400">
                    <span>IGST</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">₹{gst.igst.toLocaleString('en-IN')}</span>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between text-slate-500 dark:text-slate-400">
                      <span>CGST</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">₹{gst.cgst.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-slate-500 dark:text-slate-400">
                      <span>SGST</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">₹{gst.sgst.toLocaleString('en-IN')}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between pt-1 border-t border-indigo-200/60 dark:border-indigo-500/20 font-bold text-indigo-600 dark:text-indigo-400">
                  <span>{t('totalGst') || 'Total GST'}</span>
                  <span>₹{gst.totalGst.toLocaleString('en-IN')}</span>
                </div>
              </div>
            )}


            <div className="border-t border-slate-200 dark:border-slate-800 pt-3 flex justify-between items-center">
              <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">{t('total')}</span>
              <span className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">₹{total.toLocaleString('en-IN')}</span>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-3">
                <div>
                  <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-2">{t('paymentMethod') || 'Payment Method'}</div>
                  <div className="grid grid-cols-3 gap-2">
                    {paymentOptions.map(option => {
                      const isSelected = !isEmi && paymentMethod === option.id;
                      const isUdhar = option.id === 'udhar';
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => { setPaymentMethod(option.id); setIsEmi(false); }}
                          aria-pressed={isSelected}
                          className={cn(
                            "flex flex-col items-center justify-center gap-0.5 py-2 rounded-lg border text-[11px] font-semibold transition-all active:scale-95",
                            isSelected
                              ? isUdhar
                                ? "bg-orange-500/10 border-orange-400 text-orange-600 dark:text-orange-400"
                                : "bg-slate-900 border-slate-900 text-white dark:bg-white dark:border-white dark:text-slate-900 shadow-sm"
                              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-400"
                          )}
                        >
                          {option.icon}
                          {option.label}
                        </button>
                      );
                    })}
                    {isElectronics && (
                      <button
                        type="button"
                        onClick={() => setIsEmi(true)}
                        aria-pressed={isEmi}
                        className={cn(
                          "flex flex-col items-center justify-center gap-0.5 py-2 rounded-lg border text-[11px] font-semibold transition-all active:scale-95",
                          isEmi
                            ? "bg-sky-500/10 border-sky-500 text-sky-600 dark:text-sky-400"
                            : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-400"
                        )}
                      >
                        <Zap size={16} />EMI
                      </button>
                    )}
                  </div>
                </div>

                {isEmi && (
                  <p className="text-[10px] font-medium text-sky-500/80 leading-relaxed -mt-2">
                    {t('emiHint') || 'The finance provider pays the full bill amount to your shop. Interest and monthly instalments are handled by them.'}
                  </p>
                )}



                {isUdharSale && (
                  <div className="rounded-xl border border-orange-200 dark:border-orange-500/20 bg-orange-50/50 dark:bg-orange-500/5 p-3 space-y-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">{t('payNow') || 'Pay Now'}</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                        <input
                          type="number" min={0} max={total} placeholder="0"
                          className="w-full pl-7 pr-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-900 dark:text-white"
                          value={udharAdvance === 0 ? '' : udharAdvance}
                          onChange={e => setUdharAdvance(e.target.value === '' ? 0 : Math.max(0, Math.min(total, Number(e.target.value))))}
                        />
                      </div>
                    </div>

                    {udharAdvance > 0 && (
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">{t('receivedVia') || 'Received via'}</label>
                        <div className="grid grid-cols-3 gap-2">
                          {paymentOptions
                            .filter((o): o is typeof o & { id: CollectedMethod } => o.id !== 'udhar' && o.id !== 'mixed')
                            .map(option => (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => setUdharAdvanceMethod(option.id)}
                                aria-pressed={udharAdvanceMethod === option.id}
                                className={cn(
                                  "py-1.5 rounded-lg border font-semibold text-xs transition-all active:scale-95",
                                  udharAdvanceMethod === option.id
                                    ? "bg-slate-900 border-slate-900 text-white dark:bg-white dark:border-white dark:text-slate-900 shadow-sm"
                                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-400"
                                )}
                              >
                                {option.label}
                              </button>
                            ))}
                        </div>
                      </div>
                    )}

                    <div className="flex justify-between items-center pt-2 border-t border-orange-200/60 dark:border-orange-500/20">
                      <span className="text-sm font-semibold text-orange-500">{t('payLater') || 'Pay Later (Udhar)'}</span>
                      <span className="text-lg font-black text-orange-500">₹{remainingAmount.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                )}

                {/* Mixed — a customer paying part cash, part UPI (etc.) for one
                    bill. Each field writes straight into the engine's split
                    state; any part of the total left unallocated falls through
                    to the same "remaining → Udhar" flow as a partial Udhar
                    advance, reusing that flow rather than duplicating it. */}
                {isMixedSale && (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/20 p-3 space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">{t('cash') || 'Cash'}</label>
                        <input
                          type="number" min={0} max={total} placeholder="0"
                          className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-mono font-bold text-slate-900 dark:text-white"
                          value={splitPayments.cash === 0 ? '' : splitPayments.cash}
                          onChange={e => setSplitPayments(p => ({ ...p, cash: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)) }))}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">{t('upi') || 'UPI'}</label>
                        <input
                          type="number" min={0} max={total} placeholder="0"
                          className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-mono font-bold text-slate-900 dark:text-white"
                          value={splitPayments.upi === 0 ? '' : splitPayments.upi}
                          onChange={e => setSplitPayments(p => ({ ...p, upi: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)) }))}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">{t('card') || 'Card'}</label>
                        <input
                          type="number" min={0} max={total} placeholder="0"
                          className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-mono font-bold text-slate-900 dark:text-white"
                          value={splitPayments.card === 0 ? '' : splitPayments.card}
                          onChange={e => setSplitPayments(p => ({ ...p, card: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)) }))}
                        />
                      </div>
                    </div>
                    {remainingAmount > 0 && (
                      <div className="flex justify-between items-center pt-2 border-t border-orange-200/60 dark:border-orange-500/20">
                        <span className="text-sm font-semibold text-orange-500">{t('payLater') || 'Pay Later (Udhar)'}</span>
                        <span className="text-lg font-black text-orange-500">₹{remainingAmount.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold text-slate-500">{isEmi ? (t('financedViaEmi') || 'Financed via EMI') : (t('collectedAmount') || 'Collected')}</span>
                    <span className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">₹{(isEmi ? total : collectedAmount).toLocaleString('en-IN')}</span>
                  </div>

                  <div className="mt-2 flex justify-between items-center bg-slate-50 dark:bg-slate-950 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                    <span className="text-xs font-bold text-slate-500">Status</span>
                    {isEmi ? (
                      <span className="text-xs font-black text-sky-600 dark:text-sky-400 bg-sky-500/10 px-2 py-1 rounded">{t('paidByMethod', { method: 'EMI' }) || 'Paid by EMI'}</span>
                    ) : (!isUdharSale && !isMixedSale) ? (
                      <span className="text-xs font-black text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded">{t('paidByMethod', { method: paymentMethodLabel }) || `Paid by ${paymentMethodLabel}`}</span>
                    ) : collectedAmount === 0 ? (
                      <span className="text-xs font-black text-orange-500 bg-orange-500/10 px-2 py-1 rounded">Unpaid / Udhar</span>
                    ) : remainingAmount > 0 ? (
                      <span className="text-xs font-black text-orange-500 bg-orange-500/10 px-2 py-1 rounded">{t('partiallyPaid') || 'Partially Paid'}</span>
                    ) : (
                      <span className="text-xs font-black text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded">{t('fullyPaid') || 'Fully Paid'}</span>
                    )}
                  </div>

                  {(isUdharSale || isMixedSale) && remainingAmount > 0 && (
                    <p className="text-[10px] font-medium text-orange-500/80 leading-relaxed">
                      {t('udharHint') || "The remaining amount will be added to the customer's udhar ledger. Customer name is required on the next step."}
                    </p>
                  )}
                </div>

              </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <button
            onClick={handleCreateBillClick}
            disabled={items.length === 0}
            className={cn(
              "w-full py-3 rounded-lg font-semibold text-sm shadow-sm transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2",
              isEmi
                ? "bg-sky-600 text-white hover:bg-sky-700"
                : "bg-slate-900 text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
            )}
          >
            <CheckCircle size={16} />
            {isEmi ? "Confirm EMI Sale" : "Confirm Sale"}
            <span className="text-xs bg-black/10 dark:bg-white/10 px-1.5 py-0.5 rounded ml-1">F2</span>
          </button>
          
          <p className="text-[10px] text-center text-slate-500 font-medium">
            Clicking confirm will record the transaction and open the bill slip.
          </p>
        </div>
      </div>

      {/* Manual Bill Upload */}
      {showManualBillUpload && mounted && profile.id && (
        <ManualBillUpload
          shopId={profile.id}
          businessType={profile.businessType}
          onClose={() => setShowManualBillUpload(false)}
          onSaved={(billData) => {
            const fullBillData = {
              ...billData,
              invoiceFormat: profile.invoiceFormat || 'thermal80',
              invoiceTheme: profile.invoiceTheme || 'standard',
              invoiceColor: profile.invoiceColor || null,
              businessType: profile.businessType || 'kirana',
              showQrCode: profile.showQrCode || false,
              invoiceFooter: profile.invoiceFooter || undefined,
              ownerSignature: profile.signatureUrl || undefined,
            };
            setLastBill(fullBillData);
            setShowManualBillUpload(false);
            setShowBillModal(true);
            // Matches the regular sale flow: only email auto-sends here.
            // WhatsApp is click-only via the bill modal's "WhatsApp" button.
            if (billData.customerEmail) {
              autoSendAfterBill(fullBillData, billData.customerEmail);
            }
          }}
        />
      )}

      {/* Variant Selection Modal */}
      {variantSelectionProduct && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 w-full max-w-md shadow-2xl flex flex-col max-h-[calc(100dvh-2rem)]">
            <CardHeader className="border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between py-4 shrink-0">
              <CardTitle className="text-slate-900 dark:text-slate-200 text-lg flex items-center gap-2">
                {(() => {
                  let sizes: Record<string, number> = {};
                  try {
                    sizes = typeof variantSelectionProduct.size_variants === 'string'
                      ? JSON.parse(variantSelectionProduct.size_variants)
                      : (variantSelectionProduct.size_variants || {});
                  } catch {}
                  return isColorSizeVariants(sizes) ? 'Select Colour & Size' : 'Select Size';
                })()}
              </CardTitle>
              <button onClick={() => setVariantSelectionProduct(null)} className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200">
                <X size={20} />
              </button>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-4 overflow-y-auto">
              <div>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{variantSelectionProduct.name}</p>
                <p className="text-xs text-slate-500 mt-1">Tap every size / colour you want — each tap adds it to the bill. Use − / + to change the quantity. Press Done when finished.</p>
              </div>
              {(() => {
                // Data-integrity banner: a variant product whose per-size counts
                // are all zero but whose aggregate currentStock is positive means
                // the shopkeeper has stock but hasn't distributed it across sizes
                // (e.g. imported product, or /adjust hit only the aggregate).
                // Without this hint every tile would say "Out" and the cashier
                // would be blocked from selling stock that actually exists.
                let sizes: Record<string, number> = {};
                try {
                  sizes = typeof variantSelectionProduct.size_variants === 'string'
                    ? JSON.parse(variantSelectionProduct.size_variants)
                    : (variantSelectionProduct.size_variants || {});
                } catch {}
                const variantSum = Object.values(sizes).reduce((t: number, v: any) => t + (Number(v) || 0), 0);
                const aggregate = Number(variantSelectionProduct.currentStock ?? variantSelectionProduct.current_stock ?? 0) || 0;
                const unassigned = variantSum === 0 && aggregate > 0 ? aggregate : 0;
                if (unassigned <= 0) return null;
                return (
                  <div className="rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300 leading-snug">
                    <strong>{unassigned} in stock</strong> but not yet assigned to any specific size.
                    Sell now, then open the product and distribute across sizes so future scans stay accurate.
                  </div>
                );
              })()}
              <div className="space-y-3">
                {(() => {
                  let sizes: Record<string, number> = {};
                  try {
                    sizes = typeof variantSelectionProduct.size_variants === 'string'
                      ? JSON.parse(variantSelectionProduct.size_variants)
                      : (variantSelectionProduct.size_variants || {});
                  } catch (e) {}
                  let sizePrices: any = {};
                  try {
                    const meta = typeof variantSelectionProduct.metadata === 'string'
                      ? JSON.parse(variantSelectionProduct.metadata)
                      : (variantSelectionProduct.metadata || {});
                    sizePrices = meta?.size_prices || {};
                  } catch {}
                  // A shoes / clothes product with no size grid at all should
                  // still show pickable tiles at the counter — otherwise the
                  // shopkeeper opens the modal and sees nothing. Fall back to
                  // the business-type's default sizeChart (e.g. Shoes → UK/IND
                  // 4…12) so a size can always be picked. All fallback tiles
                  // are unassigned-pool by definition (product has no counts).
                  if (Object.keys(sizes).length === 0 && bizConfig.sizeChart && bizConfig.sizeChart.length > 0) {
                    sizes = Object.fromEntries(bizConfig.sizeChart.map(s => [s, 0]));
                  }
                  // Same "all zero variants but aggregate has stock" state — when
                  // that's true, every tile becomes sellable from the shared
                  // aggregate pool so the cashier isn't blocked.
                  const variantSum = Object.values(sizes).reduce((t: number, v: any) => t + (Number(v) || 0), 0);
                  const aggregate = Number(variantSelectionProduct.currentStock ?? variantSelectionProduct.current_stock ?? 0) || 0;
                  const hasUnassignedPool = variantSum === 0 && aggregate > 0;
                  // Use a category-appropriate word for the label instead of an
                  // abstract "pool": shoes → "pair", clothes → "pcs", liquor →
                  // "bottle", etc. Business-type wins over the product's own
                  // baseUnit because legacy shoe products were often created
                  // with baseUnit="pcs" and shopkeepers still expect "pair".
                  const bizUnit: Record<string, string> = {
                    shoes: 'pair',
                    clothes: 'pcs',
                    boutique: 'pcs',
                    liquor: 'bottle',
                    medical: 'strip',
                    ricemill: 'bag',
                  };
                  const unitLabel = bizUnit[bizConfig.type]
                    || String(variantSelectionProduct.baseUnit ?? variantSelectionProduct.base_unit ?? '').trim().toLowerCase()
                    || 'available';
                  // Colour x size products: one section per colour, sizes underneath - so "28 Black + 28 Red + 30 Black"
                  // is three taps without losing track of which colour a size belongs to.
                  const groupByColour = Object.keys(sizes).some((k) => !!splitVariantKey(k).color);
                  // The bill line (if any) already holding this variant of this product - drives the xN badge and the - / + stepper.
                  const lineFor = (key: string) => items.find((i: any) => String(i.id) === String(variantSelectionProduct.id) && (i.variant ?? '') === key);
                  const renderTile = ([key, qty]: [string, any]) => {
                    const stock = Number(qty) || 0;
                    const isOutOfStock = stock <= 0 && !hasUnassignedPool;
                    const { color, size } = splitVariantKey(key);
                    const sp = sizePrices[key];
                    const sizePrice = sp && (sp.sellingPrice > 0 || sp.mrp > 0)
                      ? (sp.sellingPrice || sp.mrp)
                      : (variantSelectionProduct.sellingPrice || Number(variantSelectionProduct.price) || 0);
                    const label = stock > 0
                      ? `${stock} ${unitLabel}`
                      : (hasUnassignedPool ? `~${aggregate} ${unitLabel}` : 'Out');
                    const line: any = lineFor(key);
                    const inCart = line ? Number(line.quantity) || 0 : 0;
                    return (
                      <div key={key} className={cn('rounded-xl border flex flex-col overflow-hidden transition-colors', inCart > 0 ? 'border-emerald-500 ring-1 ring-emerald-500 bg-emerald-50/60 dark:bg-emerald-500/10' : (isOutOfStock ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 opacity-70' : 'bg-white dark:bg-slate-900 border-emerald-200 dark:border-emerald-500/30'))}>
                        <button
                          type="button"
                          onClick={() => {
                            if (line) { updateQuantity(line.id, inCart + 1, lineRef(line)); return; }
                            addToCart(variantSelectionProduct, key, false, variantSelectionLotRef.current);
                            checkFifoHintOnAdd(variantSelectionProduct);
                          }}
                          className="py-2.5 flex flex-col items-center justify-center gap-0.5 active:scale-95 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-slate-900 dark:text-slate-100"
                        >
                          {color && !groupByColour && <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{color}</span>}
                          <span className="font-bold">{formatSizeLabel(size)}</span>
                          {sizePrice > 0 && <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400">₹{sizePrice}</span>}
                          <span className={cn('text-[10px] font-semibold', isOutOfStock ? 'text-red-400' : 'text-slate-400 dark:text-slate-500')}>{label}</span>
                        </button>
                        {inCart > 0 && (
                          <div className="flex items-center justify-between bg-emerald-500 text-white dark:text-slate-900 text-sm font-black">
                            <button type="button" aria-label="Decrease" className="px-3 py-1 hover:bg-emerald-600"
                              onClick={() => { if (inCart <= 1) removeItem(line.id, lineRef(line)); else updateQuantity(line.id, inCart - 1, lineRef(line)); }}>−</button>
                            <span>×{inCart}</span>
                            <button type="button" aria-label="Increase" className="px-3 py-1 hover:bg-emerald-600" onClick={() => updateQuantity(line.id, inCart + 1, lineRef(line))}>+</button>
                          </div>
                        )}
                      </div>
                    );
                  };
                  const entries = Object.entries(sizes);
                  if (!groupByColour) return <div className="grid grid-cols-3 gap-3">{entries.map(renderTile)}</div>;
                  const byColour = new Map<string, Array<[string, any]>>();
                  for (const e of entries) {
                    const col = splitVariantKey(e[0]).color || 'Other';
                    byColour.set(col, [...(byColour.get(col) || []), e]);
                  }
                  return (
                    <>
                      {[...byColour.entries()].map(([col, list]) => (
                        <div key={col}>
                          <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full border border-slate-300" style={{ background: cssColor(col) }} />{col}
                          </p>
                          <div className="grid grid-cols-3 gap-3">{list.map(renderTile)}</div>
                        </div>
                      ))}
                    </>
                  );
                })()}
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const val = new FormData(e.currentTarget).get('custom_size') as string;
                  if (val && val.trim()) {
                    addToCart(variantSelectionProduct, val.trim(), false, variantSelectionLotRef.current);
                    checkFifoHintOnAdd(variantSelectionProduct);
                    (e.currentTarget as HTMLFormElement).reset();
                  }
                }} className="flex gap-2">
                  <input 
                    name="custom_size" 
                    placeholder={t('customSizePlaceholder')}
                    className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-900 dark:text-slate-200" 
                    autoFocus
                  />
                  <button type="submit" className="bg-emerald-500 hover:bg-emerald-400 text-white dark:text-slate-900 px-4 py-2 rounded-lg font-bold text-sm transition-colors">
                    Add
                  </button>
                </form>
              </div>

              {(() => {
                const added = items.filter((i: any) => String(i.id) === String(variantSelectionProduct.id)).reduce((t: number, i: any) => t + (Number(i.quantity) || 0), 0);
                return (
                  <button type="button" onClick={() => setVariantSelectionProduct(null)}
                    className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white dark:text-slate-900 font-black text-sm transition-colors">
                    Done{added > 0 ? ` — ${added} added to bill` : ''}
                  </button>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Lot / Batch Picker — same size/colour lots have different real
          purchase costs; picking here decides which lot's stock/cost this
          line draws from (sent as batch_id). */}
      {batchSelectionProduct && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 w-full max-w-md shadow-xl flex flex-col max-h-[calc(100vh-2rem)]">
            <CardHeader className="border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between shrink-0 py-3 px-4">
              <div>
                <CardTitle className="text-slate-900 dark:text-slate-200 text-base">Change Lot</CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">{batchSelectionProduct.name}{batchSelectionVariant?.split('')[0] ? ` · ${batchSelectionVariant.split('')[0]}` : ''}</p>
              </div>
              <button onClick={() => { setBatchSelectionProduct(null); setBatchSelectionOptions([]); }} className="text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors">
                <X size={18} />
              </button>
            </CardHeader>
            <CardContent className="p-3 overflow-y-auto space-y-1.5">
              <p className="text-[11px] text-slate-400 mb-2">Oldest lot is recommended — sell it first so older stock doesn't sit. Choosing a lot sets the price to that lot's own selling price; profit uses that lot's purchase cost.</p>
              {batchSelectionOptions.map((b, idx) => (
                <button
                  key={b.id}
                  onClick={() => {
                    const chosen = batchSelectionProduct; const chosenVariant = batchSelectionVariant;
                    setBatchSelectionProduct(null); setBatchSelectionOptions([]);
                    setLineBatch(chosen.id, chosenVariant, { batchId: b.id, batchNumber: b.batchNumber || makeLotLabel(b).replace(/^Lot /, ''), cost: b.costPrice, price: Number(b.sellingPrice) > 0 ? Number(b.sellingPrice) : undefined });
                  }}
                  className="w-full text-left p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      {makeLotLabel(b)}
                      {idx === 0 && <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-slate-900 dark:bg-white text-white dark:text-slate-900">FIFO ↑</span>}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {b.quantity} in stock
                      {b.purchaseDate && ` · bought ${new Date(b.purchaseDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                      {b.expiryDate && ` · exp ${new Date(b.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="block text-sm font-black text-emerald-600 dark:text-emerald-400">{Number(b.sellingPrice) > 0 ? `₹${Number(b.sellingPrice).toLocaleString('en-IN')}` : 'shelf price'}</span>
                    <span className="block text-[10px] text-slate-500">cost ₹{Number(b.costPrice || 0).toLocaleString('en-IN')}</span>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Customer Name Modal */}
      {showCustomerModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 w-full max-w-md shadow-2xl flex flex-col max-h-[calc(100vh-2rem)]">
            <CardHeader className="border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between shrink-0">
              <CardTitle className="text-slate-900 dark:text-slate-200 flex items-center gap-2">
                <User size={16} className="text-slate-400" />
                Customer Details
              </CardTitle>
              <button onClick={() => setShowCustomerModal(false)} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200">
                <X size={24} />
              </button>
            </CardHeader>
            <CardContent className="p-6 space-y-5 overflow-y-auto">
              {/* Invoice type — asked explicitly here, the last step before the bill
                  is generated, so it's never skipped by scrolling past the order
                  summary above. Shares billType/gstInterState with that toggle. */}
              {!isEmi && (
                <div>
                  <label className="block text-xs text-slate-600 dark:text-slate-400 mb-2 uppercase font-bold">
                    {t('invoiceType') || 'Invoice Type'}
                  </label>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-950 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setBillType('non_gst')}
                      aria-pressed={!isGstBill}
                      className={cn(
                        'py-2.5 rounded-lg text-xs font-bold transition-all',
                        !isGstBill ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'
                      )}
                    >
                      {t('nonGstInvoice') || 'Non-GST Invoice'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setBillType('gst')}
                      aria-pressed={isGstBill}
                      className={cn(
                        'py-2.5 rounded-lg text-xs font-bold transition-all',
                        isGstBill ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500'
                      )}
                    >
                      {t('gstInvoice') || 'GST Invoice'}
                    </button>
                  </div>
                  {isGstBill && (
                    <label className="flex items-center gap-2 mt-2 text-xs text-slate-500 cursor-pointer select-none">
                      <input type="checkbox" checked={gstInterState} onChange={e => setGstInterState(e.target.checked)} className="accent-indigo-500" />
                      {t('interStateIgst') || 'Inter-state sale (IGST)'}
                    </label>
                  )}
                </div>
              )}

              {/* Summary */}
              <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                  <span>Total Bill</span>
                  <span className="text-slate-900 dark:text-slate-200 font-bold">₹{total.toLocaleString('en-IN')}</span>
                </div>

                  <div className="pt-2 mt-2 border-t border-slate-200 dark:border-slate-700">
                    <div className="flex justify-between text-sm items-center">
                      <span className="text-slate-600 dark:text-slate-400">{t('paymentMethod') || 'Payment Method'}</span>
                      <span className={cn(
                        "font-black",
                        isEmi ? "text-sky-500" : (paymentMethod === 'udhar' || (isMixedSale && remainingAmount > 0)) ? "text-orange-500" : "text-emerald-500"
                      )}>{isEmi ? 'EMI' : paymentMethodLabel}</span>
                    </div>
                    {isPartialUdhar && (
                      <div className="flex justify-between text-sm mt-2 items-center bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1.5 rounded border border-emerald-200 dark:border-emerald-500/20">
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                          {t('payNow') || 'Pay Now'} ({paymentOptions.find(o => o.id === udharAdvanceMethod)?.label})
                        </span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-black font-mono text-sm">₹{collectedAmount.toLocaleString()}</span>
                      </div>
                    )}
                    {remainingAmount > 0 && (
                      <div className="flex justify-between text-sm mt-2 items-center bg-orange-50 dark:bg-orange-500/10 px-2 py-1.5 rounded border border-orange-200 dark:border-orange-500/20">
                        <span className="text-orange-500 font-bold text-xs">{t('addedToUdhar') || 'Added to Udhar'}</span>
                        <span className="text-orange-600 dark:text-orange-400 font-black font-mono text-sm">₹{remainingAmount.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
              </div>

              {/* Customer Name + Mobile */}
              <div className="space-y-3">
                <div className="relative">
                  <label className="block text-xs text-slate-600 dark:text-slate-400 mb-2 uppercase font-bold">
                    Customer Name{' '}
                    {remainingAmount > 0 && <span className="text-orange-400 normal-case font-normal">*Required for Udhar</span>}
                  </label>
                  <input
                    type="text"
                    placeholder={t('customerNamePlaceholder')}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 transition-colors"
                    value={customerName}
                    onChange={e => {
                      setCustomerName(e.target.value);
                      setShowCustomerDropdown(true);
                    }}
                    onFocus={() => setShowCustomerDropdown(true)}
                    onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                    autoFocus
                  />
                  {showCustomerDropdown && udharCustomers.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {udharCustomers
                        .filter(c => c.name.toLowerCase().includes(customerName.toLowerCase()))
                        .map(c => (
                          <button
                            key={c.id}
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-700 last:border-0"
                            onMouseDown={() => {
                              setCustomerName(c.name);
                              if (c.mobile) setCustomerMobile(c.mobile);
                              if (c.email) setCustomerEmail(c.email);
                              setShowCustomerDropdown(false);
                            }}
                          >
                            <div className="font-bold">{c.name}</div>
                            <div className="text-xs text-slate-500">{c.mobile || 'No mobile'}</div>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-slate-600 dark:text-slate-400 mb-2 uppercase font-bold">
                    {t('whatsappNumberLabel')} <span className="text-emerald-500 dark:text-emerald-400 normal-case font-normal">— {t('billWillBeSent')}</span>
                  </label>
                  <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 focus-within:ring-2 focus-within:ring-slate-400 transition-colors">
                    <span className="text-slate-500 dark:text-slate-400 text-sm font-bold select-none">+91</span>
                    <input
                      type="tel"
                      placeholder="10-digit mobile number"
                      maxLength={10}
                      className="flex-1 bg-transparent text-slate-900 dark:text-slate-100 outline-none text-sm"
                      value={customerMobile}
                      onChange={e => setCustomerMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-600 dark:text-slate-400 mb-2 uppercase font-bold">
                    {t('cityAddressLabel') || 'City / Address'} <span className="text-slate-400 normal-case font-normal">({t('optional') || 'optional'})</span>
                  </label>
                  <input
                    type="text"
                    placeholder={t('cityAddressPlaceholder') || 'e.g. Pune, or full address'}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 text-sm transition-colors"
                    value={customerAddress}
                    onChange={e => setCustomerAddress(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 dark:text-slate-400 mb-2 uppercase font-bold">
                    {t('emailFieldLabel')} <span className="text-emerald-500 dark:text-emerald-400 normal-case font-normal">— {t('billWillBeSent')}</span>
                  </label>
                  <input
                    type="email"
                    placeholder={t('customerEmailPlaceholder')}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 text-sm transition-colors"
                    value={customerEmail}
                    onChange={e => setCustomerEmail(e.target.value)}
                  />
                </div>
              </div>

              {/* Udhar info */}
              {remainingAmount > 0 && customerName.trim() && (
                <div className={cn(
                  'flex items-start gap-3 rounded-xl px-4 py-3 text-sm',
                  udharInfo?.type === 'existing'
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                    : 'bg-orange-500/10 border border-orange-500/20 text-orange-400'
                )}>
                  {udharInfo?.type === 'existing' ? (
                    <><CheckCircle size={16} className="mt-0.5 flex-shrink-0" />
                    <span><strong>{customerName.trim()}</strong> found in Udhar Khata. ₹{remainingAmount} will be added to their existing account.</span></>
                  ) : (
                    <><AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                    <span>New customer <strong>{customerName.trim()}</strong> will be created in Udhar Khata with ₹{remainingAmount}.</span></>
                  )}
                </div>
              )}



              {remainingAmount > 0 && !customerName.trim() && (
                <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 rounded-lg px-3 py-2 text-xs text-slate-600 dark:text-slate-500">
                  <AlertCircle size={13} />
                  Enter customer name to save ₹{remainingAmount} to Udhar Khata.
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setShowCustomerModal(false)}
                  className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 py-2.5 rounded-lg font-semibold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmBill}
                  disabled={isGeneratingBill || (remainingAmount > 0 && !customerName.trim())}
                  className={cn(
                    'flex-[2] py-2.5 rounded-lg font-semibold text-sm transition-all active:scale-95 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2',
                    'bg-slate-900 text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100'
                  )}
                >
                  {isGeneratingBill ? (
                    <><Loader2 size={18} className="animate-spin" /> Generating...</>
                  ) : remainingAmount > 0 ? (
                    'Confirm Udhar Sale'
                  ) : (
                    'Confirm & Print Slip'
                  )}
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}



      {/* Bill Modal */}
      {showBillModal && lastBill && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-3">
          {/* flex-col + max-h so it never overflows the viewport */}
          <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full ${(lastBill.invoiceFormat === 'a4' || lastBill.invoiceFormat === 'wholesale') ? 'max-w-3xl' : 'max-w-sm'} flex flex-col max-h-[95vh] shadow-2xl overflow-hidden`}>

            {/* ── Sticky header ── */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
              <span className="text-emerald-500 dark:text-emerald-400 font-black text-base flex items-center gap-2">
                <CheckCircle size={18} /> Bill Generated
                {lastBill.isOfflineBill && (
                  <span className="text-[9px] bg-amber-500/15 text-amber-500 dark:text-amber-400 px-1.5 py-0.5 rounded uppercase tracking-wide">Offline</span>
                )}
              </span>
              <button onClick={() => { setShowBillModal(false); setWaWebFallbackUrl(null); setSendStatus(null); }} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 p-1 transition-colors">
                <X size={22} />
              </button>
            </div>

            {/* ── Scrollable bill preview ── */}
            {/* No upiId/qrSvg passed on purpose: the scan-to-pay QR is
                wholesale-A4-only (see WholesaleBillingUI). Retail / Dukan /
                Vyapar bills deliberately omit it. */}
            <div id="print-area" className="flex-1 overflow-y-auto bg-white dark:bg-slate-900">
              <BillSlip
                ref={componentRef}
                {...lastBill}
                storeName={profile.shopName}
                storeAddress={profile.address}
                storeMobile={profile.mobile}
                logoUrl={profile.logoUrl}
                gst={profile.gst || undefined}
                pan={profile.pan || undefined}
                bankName={profile.bankName || undefined}
                bankAccountName={profile.bankAccountName || undefined}
                bankAccountNumber={profile.bankAccountNumber || undefined}
                bankIfsc={profile.bankIfsc || undefined}
              />
            </div>

            {/* ── Sticky footer ── */}
            <div className="flex-shrink-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-3 space-y-2">
              {/* Status banners */}
              {lastBill.remainingAmount > 0 && (
                <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-xl px-3 py-2 text-xs text-orange-400">
                  <AlertCircle size={13} />
                  ₹{lastBill.remainingAmount} added to <strong className="ml-1">{lastBill.customerName}</strong>&apos;s Udhar Khata
                </div>
              )}
              {lastBill.isEmi && (
                <div className="flex items-center gap-2 bg-sky-500/10 border border-sky-500/20 rounded-xl px-3 py-2 text-xs text-sky-400">
                  <Zap size={13} />
                  Paid via EMI
                </div>
              )}
              {lastBill.isOfflineBill && (
                <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 text-xs text-amber-500 dark:text-amber-400">
                  <AlertCircle size={13} />
                  Saved on this device — will sync to your account once you're back online.
                </div>
              )}

              {/* WhatsApp is click-only now (via the "WhatsApp" action button
                  below, handleWhatsAppPDF) — this is just its desktop-only
                  fallback link, shown after that click if the WhatsApp
                  Desktop app doesn't open (e.g. not installed). */}
              {waWebFallbackUrl && (
                <a
                  href={waWebFallbackUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center text-[11px] font-semibold text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 underline underline-offset-2"
                  onClick={() => setWaWebFallbackUrl(null)}
                >
                  App not opening? Send via WhatsApp Web instead
                </a>
              )}

              {/* Email status (silent, no WhatsApp status here) */}
              {sendStatus?.email !== undefined && sendStatus.email !== undefined && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs transition-colors">
                  {sendStatus.email === null ? (
                    <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> Sending email…</span>
                  ) : sendStatus.email ? (
                    <span className="text-emerald-600 dark:text-emerald-400">✓ Email sent to customer</span>
                  ) : (
                    <span className="text-slate-600 dark:text-slate-400">Email not sent — check SMTP settings</span>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={handlePrint}
                  className="flex flex-col items-center justify-center gap-1 bg-emerald-500 text-white dark:text-slate-900 py-2.5 rounded-xl font-bold hover:bg-emerald-400 transition-colors active:scale-95 text-xs shadow-sm"
                >
                  <Printer size={17} />Print
                </button>
                <button
                  onClick={handleDownloadPDF}
                  disabled={isGeneratingPdf}
                  className="flex flex-col items-center justify-center gap-1 bg-blue-500 text-white py-2.5 rounded-xl font-bold hover:bg-blue-400 transition-colors active:scale-95 text-xs disabled:opacity-70"
                >
                  {isGeneratingPdf ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}
                  {isGeneratingPdf ? 'Generating…' : 'PDF'}
                </button>
                <button
                  onClick={handleWhatsAppPDF}
                  disabled={isSharing}
                  className="flex flex-col items-center justify-center gap-1 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 py-2.5 rounded-xl font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors active:scale-95 text-xs disabled:opacity-70 shadow-sm"
                >
                  {isSharing ? <Loader2 size={17} className="animate-spin" /> : <MessageCircle size={17} />}
                  {isSharing ? 'Sharing…' : 'WhatsApp'}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setShowBillModal(false)}
                  className="flex items-center justify-center gap-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 py-2.5 rounded-xl font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-sm shadow-sm"
                >
                  Continue
                </button>
                <button
                  onClick={() => { setShowBillModal(false); clearCart(); }}
                  className="flex items-center justify-center gap-1.5 bg-red-500/10 text-red-400 py-2.5 rounded-xl font-semibold hover:bg-red-500/20 transition-colors text-sm"
                >
                  New Bill
                </button>
                <a
                  href={`/${locale}/billing/invoices`}
                  onClick={() => setShowBillModal(false)}
                  className="flex items-center justify-center gap-1.5 bg-sky-500/10 text-sky-500 py-2.5 rounded-xl font-semibold hover:bg-sky-500/20 transition-colors text-xs text-center leading-tight"
                >
                  History
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Out of Stock & Recommendation Modal */}
      {outOfStockItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOutOfStockItem(null)} />
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-900/20">
              <span className="text-rose-600 dark:text-rose-400 font-black text-lg flex items-center gap-2">
                <AlertCircle size={22} /> Out of Stock!
              </span>
              <button onClick={() => setOutOfStockItem(null)} className="text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-5 flex-1 overflow-y-auto">
              <div className="mb-6 text-center">
                <p className="text-slate-700 dark:text-slate-300 font-medium">
                  Sorry, <span className="font-bold">{outOfStockItem.name}</span> is currently out of stock.
                </p>
                <p className="text-sm text-slate-500 mt-1">You cannot add it to the bill. However, you can add one of these recommended alternatives:</p>
              </div>

              {recommendedProducts.length > 0 ? (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Recommended Alternatives</h3>
                  {recommendedProducts.map(rec => (
                    <div key={rec.id} className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <div>
                        <div className="font-bold text-sm text-slate-900 dark:text-white">{rec.name}</div>
                        <div className="text-xs text-slate-500 flex items-center gap-2 mt-1">
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">{Math.max(0, rec.currentStock || 0)} In Stock</span>
                          <span>•</span>
                          <span>₹{rec.sellingPrice || rec.price || 0}</span>
                        </div>
                      </div>
                      <button 
                        onClick={() => {
                          setOutOfStockItem(null);
                          addToCart(rec, undefined, false);
                        }}
                        className="px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 dark:bg-emerald-500/20 dark:hover:bg-emerald-500/30 dark:text-emerald-400 rounded-lg text-xs font-bold transition-colors shadow-sm"
                      >
                        Add to Bill
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  No similar products found in stock.
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex justify-between gap-3">
               <div className="flex-1"></div>
               <button onClick={() => setOutOfStockItem(null)} className="px-6 py-2 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition-colors">
                 Close
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PaymentButton({active, onClick, icon, label}: {active: boolean; onClick: () => void; icon: React.ReactNode; label: string}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-2 p-4 rounded-xl border transition-all',
        active ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-500 shadow-sm' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800/80'
      )}
    >
      {icon}
      <span className="text-xs font-bold uppercase">{label}</span>
    </button>
  );
}

export default function BillingPage() {
  const { profile } = useBusinessStore();
  // Render the standard UI immediately (matches the trial-plan default). If the
  // profile later hydrates as wholesale we swap components — cheap flicker beats
  // a full-screen spinner on every navigation. Previously this component gated
  // ALL rendering behind a `mounted` flag, which made every sidebar click look
  // like a full page refresh even though it was already client-side navigation.
  if (isWholesaleTierPackage(profile.subscriptionPlan)) {
    return <WholesaleBillingUI />;
  }
  return <StandardBillingUI />;
}
