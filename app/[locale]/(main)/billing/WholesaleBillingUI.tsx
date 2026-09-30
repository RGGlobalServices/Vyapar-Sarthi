'use client';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/lib/store';
import { useBillingEngine } from '@/lib/hooks/useBillingEngine';
import { useBusinessStore } from '@/lib/businessStore';
import { getBusinessConfig } from '@/lib/businessConfig';
import { useCategoryConfig } from '@/lib/hooks/useCategoryConfig';
import { performSmartSearch } from '@/lib/smartSearch';
import api from '@/lib/api';
import { withOfflineCache, isNetworkError, queueOfflineSale } from '@/lib/offlineCache';
import { invalidateProductCaches } from '@/lib/swrInvalidate';
import { cn, fmtDate } from '@/lib/utils';
import { useBarcodeScanner, playScanBeep, matchProductByCode, matchVariantByCode } from '@/lib/useBarcodeScanner';
import nextDynamic from 'next/dynamic';
// Keeps html5-qrcode out of the server bundle and off the initial payload.
const CameraScanner = nextDynamic(() => import('@/components/CameraScanner'), { ssr: false });
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Search, Scan, Trash2, Plus, Minus, CreditCard, IndianRupee,
  User, X, Printer, Calculator as CalcIcon, FileText, Smartphone,
  CheckCircle, Loader2, ArrowRight, MessageCircle, Download, AlertCircle, FileUp,
  Building2, Calendar, Landmark, Truck, Wallet
} from 'lucide-react';
import { BillSlip, generateWhatsAppText } from '@/components/BillSlip';
import { generateWhatsAppLink } from '@/lib/shareUtils';
import { uploadInvoiceToSupabase } from '@/lib/supabaseStorage';
import { computeGst } from '@/lib/gst';
import { waitForImages, waitForQrCode } from '@/lib/waitForImages';
import { printBill } from '@/lib/printBill';
import { generateUpiQrSvg } from '@/lib/upi';
import ManualBillUpload from '@/components/ManualBillUpload';
import DiscountInput from '@/components/DiscountInput';
import { splitVariantKey, makeVariantKey } from '@/components/ColorSizeVariantGrid';
import { toInclusivePrice, toExclusivePrice } from '@/lib/profitCalc';
import LiquorCartMatrix from '@/components/billing/LiquorCartMatrix';
import { extractMlToken } from '@/lib/liquorMatrix';
import { useMillMode, millCartKey } from '@/lib/hooks/useMillMode';
import { calculateMillInvoice, normalizeMillCharges, type MillChargeKey, type MillResult } from '@/lib/millBilling';
import { takeMillDuplicate } from '@/lib/millDuplicateHandoff';
import MillRateInput from '@/components/billing/MillRateInput';
import MillCommercialCharges, { EMPTY_MILL_CHARGES, type MillChargeInputs } from '@/components/billing/MillCommercialCharges';
import BrokerField, { EMPTY_BROKER } from '@/components/mill/BrokerField';
import MillTotalsSummary from '@/components/billing/MillTotalsSummary';
import MillBillSavedModal from '@/components/billing/MillBillSavedModal';

// Same key a variant row is stored/matched under everywhere else (Products'
// Variant Builder, the Purchases item picker, the server-side stock helper)
// — a row with no colour dimension just uses its bare size.
function variantRowKey(v: any): string {
  return v.color ? makeVariantKey(v.color, v.size || '') : (v.size || '');
}

// Resolve a product's sellable stock from whatever shape it arrives in.
// Returns { known } = whether stock could be determined at all, and { qty } =
// the amount. A sale is only blocked as "out of stock" when known && qty <= 0.
// Order matters: size_variants (Vyapar/Dukan per-size) → variants[] (Udyog
// per-colour/size) → currentStock. A real product ALWAYS has one of these
// tracked, and Rahul-style live data shows currentStock can arrive as `null`
// (never set — same shape the search dropdown displays as "Stock: 0") — so we
// treat null/undefined/'' at the aggregate level as a *known* 0, not unknown.
// Otherwise a null-stock product bypasses the client's OOS check and lands in
// the cart, and only the server-side stock guard catches it at checkout —
// which is exactly the "billing failed" popup a shopkeeper complained about.
function resolveStock(p: any): { known: boolean; qty: number } {
  if (!p) return { known: false, qty: 0 };
  let sv: any = p.size_variants ?? p.sizeVariants;
  if (typeof sv === 'string') { try { sv = JSON.parse(sv); } catch { sv = null; } }
  if (sv && typeof sv === 'object' && Object.keys(sv).length > 0) {
    const sum = Object.values(sv).reduce((t: number, v: any) => t + (Number(v) || 0), 0);
    return { known: true, qty: sum };
  }
  if (Array.isArray(p.variants) && p.variants.length > 0) {
    const sum = p.variants.reduce((t: number, v: any) => t + (Number(v?.stock) || 0), 0);
    return { known: true, qty: sum };
  }
  const raw = p.currentStock ?? p.current_stock ?? p.stock;
  if (raw === undefined || raw === null || raw === '') return { known: true, qty: 0 };
  const n = Number(raw);
  return { known: true, qty: isFinite(n) ? n : 0 };
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
      return { known: true, qty: isFinite(n) ? n : 0 };
    }
    // Udyog variant products (productType === 'variant') carry their own
    // per-row stock in Product.variants[] instead of size_variants.
    if (Array.isArray(product.variants) && product.variants.length > 0) {
      const row = product.variants.find((v: any) => variantRowKey(v) === item.variant);
      if (row) return { known: true, qty: Math.max(0, Number(row.stock) || 0) };
    }
  }
  return resolveStock(product);
}

const CartQuantityInput = ({ item, updateQuantity, removeItem, maxQty }: any) => {
  const [localVal, setLocalVal] = useState(item.quantity.toString());
  useEffect(() => {
    setLocalVal(item.quantity.toString());
  }, [item.quantity]);

  return (
    <input
      type="number"
      className="w-16 text-center py-1 bg-transparent border border-slate-200 dark:border-slate-700 rounded font-mono text-sm focus:ring-1 focus:ring-emerald-500 outline-none"
      value={localVal}
      onChange={(e) => {
        setLocalVal(e.target.value);
        let num = Number(e.target.value);
        if (!isNaN(num) && num > 0) {
          if (typeof maxQty === 'number' && num > maxQty) num = maxQty;
          updateQuantity(item.id, num, item.variant);
        }
      }}
      onBlur={(e) => {
        let num = Number(e.target.value);
        if (num <= 0 || e.target.value === '') removeItem(item.id, item.variant);
        else {
          if (typeof maxQty === 'number' && num > maxQty) num = maxQty;
          setLocalVal(num.toString());
        }
      }}
      step="any"
      min="0"
      max={typeof maxQty === 'number' ? maxQty : undefined}
    />
  );
};

const GST_SLABS = [0, 5, 12, 18, 28];

// Price + per-line GST editor for a cart row.
//
// SEMANTIC: item.price is always the GST-inclusive amount the customer pays
// (what computeGst() and the financial engine expect).
//
// Toggle meaning (matches how Indian B2B sellers think about GST):
//   Excl = "No GST charged" — selling price is what customer pays, gstPercent = 0.
//   Incl = "GST added on top of selling price" — customer pays base + GST.
//
// The input always shows the BASE (selling) price. Switching modes never
// changes the displayed number — only the total (and item.price) changes.
const CartPriceInput = ({ item, updatePrice, updateGstPercent, isGstBill }: any) => {
  const gstPercent = Number(item.gstPercent) || 0;

  // savedSlabRef holds the GST rate the user last chose (even when mode=Excl clears gstPercent to 0).
  const savedSlabRef = useRef<number>(gstPercent || 12);
  const initDone = useRef(false);

  // mode: 'exclusive' = no GST (item.price = base, gstPercent = 0)
  //        'inclusive' = GST on top (item.price = base*(1+slab%), gstPercent = slab)
  const [mode, setMode] = useState<'inclusive' | 'exclusive'>('exclusive');

  // On first mount: capture the product's natural GST slab then start in Excl mode
  // (selling price shown as-is, no GST applied until the user opts in).
  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;
    const naturalSlab = Number(item.gstPercent) || 0;
    if (naturalSlab > 0) {
      savedSlabRef.current = naturalSlab;
      updateGstPercent(item.id, 0, item.variant);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep savedSlab up-to-date when user explicitly picks a different rate.
  useEffect(() => {
    if (gstPercent > 0) savedSlabRef.current = gstPercent;
  }, [gstPercent]);

  // Base (exclusive) price to display in the input.
  // Excl mode: gstPercent=0  → item.price = base → show as-is
  // Incl mode: gstPercent>0  → item.price = base*(1+slab%) → extract base
  const getBase = () => gstPercent > 0 ? toExclusivePrice(item.price, gstPercent) : item.price;

  const [localVal, setLocalVal] = useState(() => (Math.round(item.price * 100) / 100).toString());
  useEffect(() => {
    setLocalVal((Math.round(getBase() * 100) / 100).toString());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.price, gstPercent]);

  // User always types the BASE price; we convert to inclusive before storing.
  // Round to whole rupees so totals are always clean integers.
  const writePrice = (typedBase: number) => {
    const inclusive = gstPercent > 0 ? toInclusivePrice(typedBase, gstPercent) : typedBase;
    updatePrice(item.id, Math.round(inclusive), item.variant);
  };

  // Change GST slab while staying in Incl mode — keep the base price, update inclusive.
  const changeGstSlab = (newSlab: number) => {
    const base = getBase();
    updateGstPercent(item.id, newSlab, item.variant);
    if (newSlab > 0) {
      updatePrice(item.id, Math.round(toInclusivePrice(base, newSlab)), item.variant);
    } else {
      updatePrice(item.id, Math.round(base), item.variant);
    }
  };

  const switchMode = (newMode: 'inclusive' | 'exclusive') => {
    if (newMode === mode) return;
    const base = getBase();
    if (newMode === 'exclusive') {
      // Remove GST: price = base, gstPercent = 0
      updateGstPercent(item.id, 0, item.variant);
      updatePrice(item.id, Math.round(base), item.variant);
    } else {
      // Add GST: price = base*(1+slab%), gstPercent = saved slab
      const slab = savedSlabRef.current || 12;
      updateGstPercent(item.id, slab, item.variant);
      updatePrice(item.id, Math.round(toInclusivePrice(base, slab)), item.variant);
    }
    setMode(newMode);
  };

  const basePrice = Math.round(getBase() * 100) / 100;
  const gstAmt = gstPercent > 0 ? Math.round(basePrice * gstPercent) / 100 : 0;
  const totalPrice = Math.round(item.price * 100) / 100;

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        type="number"
        className="w-20 text-right py-1 px-2 bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-emerald-500 rounded font-mono text-sm outline-none transition-colors"
        value={localVal}
        onChange={(e) => {
          setLocalVal(e.target.value);
          const num = Number(e.target.value);
          if (!isNaN(num)) writePrice(num);
        }}
        onBlur={(e) => {
          if (e.target.value === '') { writePrice(0); return; }
          const num = Number(e.target.value);
          setLocalVal((Math.round(num * 100) / 100).toString());
        }}
        step="any"
        min="0"
      />
      {isGstBill && (
        <div className="flex flex-col items-end gap-0.5">
          <div className="flex items-center gap-1">
            {mode === 'inclusive' && (
              <select
                value={gstPercent || savedSlabRef.current}
                onChange={(e) => changeGstSlab(Number(e.target.value))}
                title="GST % for this item"
                className="text-[9px] font-bold bg-transparent border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 outline-none text-slate-500 dark:text-slate-400"
              >
                {GST_SLABS.map((g) => <option key={g} value={g}>{g}%</option>)}
              </select>
            )}
            <div className="flex bg-slate-100 dark:bg-slate-800 rounded overflow-hidden shrink-0">
              {(['exclusive', 'inclusive'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  title={m === 'inclusive' ? 'Add GST on top of this price' : 'No GST on this item'}
                  className={cn(
                    'px-1 py-0.5 text-[9px] font-bold transition-colors',
                    mode === m ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                  )}
                >
                  {m === 'inclusive' ? 'Incl' : 'Excl'}
                </button>
              ))}
            </div>
          </div>
          {mode === 'inclusive' && gstPercent > 0 && (
            <div className="text-[9px] text-slate-400 dark:text-slate-500 font-mono text-right leading-tight">
              ₹{basePrice} + ₹{gstAmt.toFixed(2)} GST = <span className="text-emerald-600 dark:text-emerald-400 font-bold">₹{totalPrice.toFixed(2)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default function WholesaleBillingUI() {
  const t = useTranslations('Billing');
  const tBill = useTranslations('BillSlip');
  const { user } = useAuthStore();
  const { profile } = useBusinessStore();

  // Mill Billing (Bada Udyog `mill_v2`) — availability is decided by the SERVER. For every other shop this is
  // 'not_applicable' and nothing below changes: the legacy billing screen runs exactly as before.
  const mill = useMillMode();
  const isMill = mill.isMill;
  // The Mill cart is a SEPARATE cart (own key): a legacy GST-inclusive cart can never be reinterpreted as exclusive.
  const cartKey = profile?.id ? (isMill ? millCartKey(profile.id) : profile.id) : undefined;
  const tMill = useTranslations('MillBilling');

  const {
    items, addItem, removeItem, updateQuantity, updatePrice, updateGstPercent,
    updateBatchNumber, updateExpiryDate, updateSerialNumber, updateWarrantyDays,
    setLineBatch, clearCart,
    subtotal, discount, setDiscount, total,
    splitPayments, setSplitPayments, collectedAmount, remainingAmount
  } = useBillingEngine(cartKey);
  const bizConfig = getBusinessConfig(profile?.businessType);
  const { config: categoryConfig } = useCategoryConfig();

  // Merged display flags: hard-wired businessType flags OR CategoryConfig flags
  const catSchema = categoryConfig.attributeSchema;
  const showBatch   = bizConfig.hasBatch   || catSchema.showBatch;
  const showExpiry  = catSchema.showExpiry;
  const showSerial  = catSchema.showSerial;
  const showWarranty = catSchema.showWarranty;

  // Dual unit billing (e.g. Grocery: Bag × 25 Kg, FMCG: Carton × 12 pcs)
  const isDualUnit = catSchema.dualUnit && !!catSchema.dualUnitConfig;
  const dualUnitCfg = catSchema.dualUnitConfig;

  // Cart lines that belong in the Brand x ML matrix vs. the plain table below
  // it — same split as the retail billing page ([page.tsx]'s LiquorCartMatrix
  // wiring): a sized liquor line (variant colour that's itself an ML value,
  // or a flat per-size product name) goes in the matrix; anything else stays
  // in the normal table so nothing in the bill goes missing.
  const isLiquorCartLine = useCallback((item: any) => {
    if (!bizConfig.hasLiquorSpecs) return false;
    if (item.variant) {
      const color = String(item.variant).split('/')[0]?.trim() || '';
      return !!extractMlToken(color);
    }
    return !!extractMlToken(item.name);
  }, [bizConfig.hasLiquorSpecs]);
  const liquorCartLines = useMemo(() => bizConfig.hasLiquorSpecs ? items.filter(isLiquorCartLine) : [], [items, isLiquorCartLine, bizConfig.hasLiquorSpecs]);
  const nonLiquorCartItems = useMemo(() => bizConfig.hasLiquorSpecs ? items.filter((i: any) => !isLiquorCartLine(i)) : items, [items, isLiquorCartLine, bizConfig.hasLiquorSpecs]);

  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  // Defaults to Retail (sellingPrice, a real margin) rather than Wholesale
  // (wholesaleCost — the shop's own purchase/cost price, not a discounted
  // selling price — there is no separate "wholesale selling price" field in
  // the product schema). Defaulting to Wholesale meant every bill started
  // priced at exact cost with zero profit unless the cashier manually
  // noticed and flipped this toggle.
  const [isWholesale, setIsWholesale] = useState(false);

  // GST / Non-GST billing. Default non-GST. Wholesale is usually B2B GST-registered,
  // so this matters here even more than on retail.
  const [billType, setBillType] = useState<'non_gst' | 'gst'>('non_gst');
  const [gstInterState, setGstInterState] = useState(false); // false = CGST+SGST, true = IGST
  const isGstBill = billType === 'gst';
  const gst = useMemo(
    () => computeGst(items as any, discount, gstInterState),
    [items, discount, gstInterState]
  );

  // Manual Add
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<
    { status: 'ok' | 'error' | 'pending'; text: string } | null
  >(null);
  // Stops a slow lookup for an earlier scan clobbering a later one.
  const scanSeqRef = useRef(0);
  // Camera scanning is only useful on a phone — a desktop counter already has
  // a real USB/Bluetooth barcode scanner (handled by useBarcodeScanner below).
  const isMobile = useIsMobile();
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [showManualBillUpload, setShowManualBillUpload] = useState(false);
  const [manualProduct, setManualProduct] = useState({ name: '', costPrice: '', mrp: '', price: '', unit: 'Unit', variant: '', barcode: '' });
  // A scan that matched nothing locally or on the server — offers "Create
  // Product" (pre-fills manualProduct.barcode so the submit below registers
  // it in the catalogue instead of just adding a one-off cart line), same
  // flow Legacy/Vyapar billing already has.
  const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null);

  const handleManualAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualProduct.name || !manualProduct.price) return;
    const sellingPrice = Number(manualProduct.price) || 0;
    const costPrice = Number(manualProduct.costPrice) || 0;
    const mrp = Number(manualProduct.mrp) || sellingPrice;
    const barcode = manualProduct.barcode?.trim() || '';

    // Triggered from a scan-miss: persist a real catalogue product with this
    // barcode first, so scanning the same code again finds it instead of
    // repeating "Not found". Without a barcode (a genuine one-off line, not
    // from a scan), keep the original cart-only behaviour.
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
        addToCart(res.data, manualProduct.variant || undefined);
        // Append the newly-created product to local state without a full re-fetch —
        // a GET /products round-trip here would stall the cashier mid-billing.
        setProducts(prev => [...prev, res.data]);
      } catch (err: any) {
        const msg = err?.response?.data?.detail || err?.message || '';
        if (String(msg).toLowerCase().includes('already exists')) {
          try {
            const lookup = await api.get(`/products/barcode/${encodeURIComponent(barcode)}`);
            if (lookup.data?.id) {
              addToCart(lookup.data, manualProduct.variant || undefined);
              // Product already in catalogue; no need to re-fetch everything.
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
        isManualItem: true,
      }, manualProduct.variant || undefined);
    }

    setManualProduct({ name: '', costPrice: '', mrp: '', price: '', unit: 'Unit', variant: '', barcode: '' });
    setShowManualAdd(false);
  };

  // Checkout Modal
  const [showCheckout, setShowCheckout] = useState(false);

  // ─── Party selection (Udyog only) ───────────────────────────────────────
  // Replaces the old free-text customer-name field. A Party is a Customer
  // row with customerType='party' — same model the Parties module already
  // manages (GET /crm/customers?type=party). Selecting one and sending its
  // id as customer_id on checkout is what lets the existing billing API
  // (app/api/v1/billing/route.ts) update Outstanding + write a ledger entry
  // against the correct party, instead of a loose text label.
  type Party = {
    id: string; name: string; shopName?: string; mobile?: string; email?: string;
    gst?: string; totalDue?: number; creditDays?: number; creditLimit?: number; address?: string;
  };
  const [parties, setParties] = useState<Party[]>([]);
  const [partySearch, setPartySearch] = useState('');
  const [showPartyDropdown, setShowPartyDropdown] = useState(false);
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  // Credit-limit/period status for the selected party — fetched fresh on
  // every selection (never trusted from the cached `parties` list, since
  // that snapshot can be stale mid-session) so the shopkeeper sees Available
  // Credit / Overdue before they finish billing, not after the server
  // rejects the sale (billing/route.ts already hard-blocks over-limit sales).
  const [partyCreditHealth, setPartyCreditHealth] = useState<{
    creditLimit: number; creditDays: number; outstanding: number;
    availableCredit: number | null; overLimitBy: number;
    dueInvoicesCount: number; overdueInvoicesCount: number; overdueAmount: number; oldestOverdueDays: number;
  } | null>(null);
  const [loadingPartyCredit, setLoadingPartyCredit] = useState(false);
  // Retail pricing mode (isWholesale === false): a wholesaler selling counter
  // sales to a walk-in residential customer shouldn't need a formal Party/CRM
  // record — just a plain name, same as Dukan/Vyapar retail billing.
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');

  const fetchParties = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const data = await withOfflineCache(
        `parties_${profile.id}`,
        async () => {
          const res = await api.get(`/crm/customers?type=party&_shop=${profile.id}`);
          return Array.isArray(res.data) ? res.data : [];
        },
        profile.id
      );
      setParties(data || []);
    } catch (err) {
      console.error('Failed to load parties', err);
    }
  }, [profile?.id]);

  // Pre-fills contact fields (used for WhatsApp/email delivery, still
  // editable) and defaults Credit Days from the party's own payment terms.
  const selectParty = (p: Party) => {
    setSelectedParty(p);
    setCustomerMobile(p.mobile || '');
    setCustomerEmail(p.email || '');
    if (p.creditDays && p.creditDays > 0) setCreditDays(p.creditDays);
    setPartySearch('');
    setShowPartyDropdown(false);
    setPartyCreditHealth(null);
    setLoadingPartyCredit(true);
    api.get(`/party/${p.id}/credit-health`)
      .then(res => setPartyCreditHealth(res.data))
      .catch(() => setPartyCreditHealth(null))
      .finally(() => setLoadingPartyCredit(false));
  };

  // ─── Retail-mode Udhar customer lookup (Udyog only) ─────────────────────
  // customerName stays free text — a genuinely new walk-in shouldn't need a
  // pre-existing record — but this surfaces matching EXISTING udhar
  // customers (same Customer table, customerType='customer') while typing,
  // showing what they already owe so the cashier isn't flying blind. Mirrors
  // the Party picker above; separate list since it's a different customerType.
  type UdharCustomerRow = {
    id: string; name: string; mobile?: string; email?: string; address?: string;
    totalDue?: number; creditDays?: number;
    customer_transactions?: { created_at: string }[];
  };
  const [udharCustomers, setUdharCustomers] = useState<UdharCustomerRow[]>([]);
  const [showUdharDropdown, setShowUdharDropdown] = useState(false);

  const fetchUdharCustomers = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const data = await withOfflineCache(
        `udhar_customers_${profile.id}`,
        async () => {
          const res = await api.get(`/crm/customers?type=customer&_shop=${profile.id}`);
          return Array.isArray(res.data) ? res.data : [];
        },
        profile.id
      );
      setUdharCustomers(data || []);
    } catch (err) {
      console.error('Failed to load udhar customers', err);
    }
  }, [profile?.id]);

  const selectUdharCustomer = (c: UdharCustomerRow) => {
    setCustomerName(c.name);
    if (c.mobile) setCustomerMobile(c.mobile);
    if (c.email) setCustomerEmail(c.email);
    if (c.address) setCustomerAddress(c.address);
    if (c.creditDays && c.creditDays > 0) setCreditDays(c.creditDays);
    setShowUdharDropdown(false);
  };

  // Exact-name match against the typed customerName — same "existing vs new"
  // signal StandardBillingUI (Dukan/Vyapar) already shows.
  const matchedUdharCustomer = udharCustomers.find(
    (c) => c.name.trim().toLowerCase() === customerName.trim().toLowerCase()
  );
  const filteredUdharCustomers = customerName.trim()
    ? udharCustomers.filter((c) => c.name.toLowerCase().includes(customerName.trim().toLowerCase()))
    : udharCustomers;

  // Same "days until due" math as the Supplier due-bill picker: last activity
  // + creditDays. No last activity yet (opening balance only) falls back to
  // undated — still shows the amount, just no red/amber urgency colour.
  function udharDueInfo(c: UdharCustomerRow) {
    const lastDate = c.customer_transactions?.[0]?.created_at || null;
    if (!lastDate || !c.creditDays) return { lastDate, daysLeft: null, overdue: false, soon: false };
    const due = new Date(lastDate).getTime() + c.creditDays * 86400000;
    const daysLeft = Math.ceil((due - Date.now()) / 86400000);
    return { lastDate, daysLeft, overdue: daysLeft < 0, soon: daysLeft >= 0 && daysLeft <= 7 };
  }

  // ─── Payment Method (Udyog only) ────────────────────────────────────────
  // Cash/UPI/Bank/Cheque are "single method" — one Received Amount that maps
  // straight onto useBillingEngine's split state (see the sync effect below).
  // Credit collects nothing up front. Mixed reveals the Cash/UPI/Bank grid so
  // a distributor can split one invoice across methods, same as before.
  type WholesalePaymentMethod = 'cash' | 'upi' | 'bank' | 'cheque' | 'credit' | 'mixed';
  const [paymentMethod, setPaymentMethod] = useState<WholesalePaymentMethod>('cash');
  const [upiApp, setUpiApp] = useState('');
  const [upiTxnId, setUpiTxnId] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankRefNo, setBankRefNo] = useState('');
  const [chequeNo, setChequeNo] = useState('');
  const [chequeDate, setChequeDate] = useState('');
  const [chequeBank, setChequeBank] = useState('');
  const [creditDays, setCreditDays] = useState(30);

  // ─── Charges (Udyog only) ────────────────────────────────────────────────
  // Folded into the bill as manual line items at checkout — no schema change
  // needed, and they print/PDF/WhatsApp correctly since those already render
  // whatever's in `items` generically.
  const [charges, setCharges] = useState({ transport: '', loading: '', packing: '', other: '' });
  // `total`/`collectedAmount`/`remainingAmount` from useBillingEngine only
  // know about cart items — charges are added as line items purely at save
  // time, so anything shown to the cashier (or printed on the bill) has to
  // add chargesTotal back in itself, or it silently disagrees with what
  // actually gets saved (Subtotal ₹134 but Total ₹114 on the printed bill).
  const chargesTotal = useMemo(
    () => Object.values(charges).reduce((sum, v) => sum + (Number(v) || 0), 0),
    [charges]
  );
  // ─── Mill Billing (mill_v2) state ─────────────────────────────────────────────────────────────
  // Charges are kept as raw strings (blank / half-typed stays editable) and validated with the engine's OWN rules.
  const ZERO_MILL_CHARGES = { freight: 0, hamali: 0, loading: 0, unloading: 0, other: 0 };
  const [millCharges, setMillCharges] = useState<MillChargeInputs>(EMPTY_MILL_CHARGES);
  const [saleBroker, setSaleBroker] = useState(EMPTY_BROKER);
  const millChargesParsed = useMemo(() => {
    try { return { value: normalizeMillCharges(millCharges), error: null as string | null }; }
    catch (e: any) { return { value: ZERO_MILL_CHARGES, error: String(e?.message || 'Invalid charges') }; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [millCharges]);
  const [millSaved, setMillSaved] = useState<any>(null);
  // "Duplicate invoice" hand-off: a copy of a legacy NON-GST invoice stays non-GST until its copied rates are re-entered.
  const [dupFrom, setDupFrom] = useState<string | null>(null);
  const [dupForceNonGst, setDupForceNonGst] = useState(false);
  const [dupOriginalRates, setDupOriginalRates] = useState<Record<string, number>>({});
  const dupKey = (it: any) => `${it.id}|${it.variant || ''}`;
  const dupRestrictionActive = dupForceNonGst && items.some((it: any) => dupOriginalRates[dupKey(it)] !== undefined && Math.round((Number(it.price) || 0) * 100) === Math.round(dupOriginalRates[dupKey(it)] * 100));
  const millDiscountNumber = Math.round((Number(typeof discount === 'number' ? discount : (discount as any)?.value) || 0) * 100) / 100;
  // The SAME engine the server runs (lib/millBilling.ts) → this preview equals what the server will store.
  const { millCalc, millCalcError } = useMemo<{ millCalc: MillResult | null; millCalcError: string | null }>(() => {
    if (!isMill || items.length === 0) return { millCalc: null, millCalcError: null };
    try {
      const result = calculateMillInvoice({
        lines: items.map((it: any) => ({
          quantity: Number(it.quantity) || 0,
          rate: Number(it.price) || 0,
          gstRate: Number(it.gstPercent) || 0,
          costTotal: (Number(it.cost) || 0) * (Number(it.quantity) || 0),
          hsnCode: it.hsnCode || null,
        })),
        discount: millDiscountNumber > 0 ? { type: 'fixed', value: millDiscountNumber } : null,
        billType,
        interState: gstInterState,
        charges: millChargesParsed.value,
      });
      return { millCalc: result, millCalcError: null };
    } catch (e: any) {
      console.error('millCalc error:', e?.message);
      return { millCalc: null, millCalcError: e?.message || 'Billing calculation failed' };
    }
  }, [isMill, items, millDiscountNumber, billType, gstInterState, millChargesParsed]);

  const grandTotal = isMill ? (millCalc?.grandTotal ?? 0) : total + chargesTotal;
  const grandRemaining = isMill
    ? Math.max(0, Math.round(grandTotal * 100) - Math.round(collectedAmount * 100)) / 100
    : Math.max(0, grandTotal - collectedAmount);

  useEffect(() => {
    if (!isMill || !profile?.id || products.length === 0) return; // wait for the catalogue (GST rates) before consuming
    const dup = takeMillDuplicate();
    if (!dup) return;
    clearCart();
    const originals: Record<string, number> = {};
    dup.items.forEach((it, idx) => {
      const id = it.product_id || `manual.${idx}`;
      const gstPercent = Number(products.find((p: any) => p.id === it.product_id)?.gstPercent ?? 0) || 0;
      originals[`${id}|${it.variant || ''}`] = it.rate;
      addItem({ id, name: it.name, unit: it.unit || 'Unit', variant: it.variant || undefined, quantity: it.quantity, price: it.rate, cost: 0, profit: 0, total: Math.round(it.quantity * it.rate * 100) / 100, gstPercent } as any);
    });
    const c: any = dup.charges || {};
    setMillCharges({ freight: c.freight ? String(c.freight) : '', hamali: c.hamali ? String(c.hamali) : '', loading: c.loading ? String(c.loading) : '', unloading: c.unloading ? String(c.unloading) : '', other: c.other ? String(c.other) : '' });
    setDiscount(dup.discount?.value ?? 0);
    setDupFrom(dup.duplicatedFrom);
    if (dup.forceBillType === 'non_gst') { setBillType('non_gst'); setDupForceNonGst(true); setDupOriginalRates(originals); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMill, profile?.id, products.length]);

  const [isGenerating, setIsGenerating] = useState(false);
  // Inline overdue-warning confirmation (replaces window.confirm which Chrome blocks in some contexts).
  const [overdueConfirmPending, setOverdueConfirmPending] = useState(false);
  const overdueConfirmResolveRef = useRef<((v: boolean) => void) | null>(null);
  const confirmOverdue = () => new Promise<boolean>(resolve => {
    setOverdueConfirmPending(true);
    overdueConfirmResolveRef.current = resolve;
  });

  // Bill Success Modal
  const [showBillModal, setShowBillModal] = useState(false);
  const [lastBill, setLastBill] = useState<any>(null);
  
  // Auto-send states
  const [sendStatus, setSendStatus] = useState<{ email: boolean | null } | null>(null);
  // Desktop-only fallback link, shown after the "Share" button is clicked,
  // for when the shop's PC doesn't have WhatsApp Desktop installed — the
  // click already tried the app (whatsapp://) first via handleWhatsAppPDF.
  const [waWebFallbackUrl, setWaWebFallbackUrl] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);

  // Recommendations / Out of Stock
  const [outOfStockItem, setOutOfStockItem] = useState<any>(null);
  const [recommendedProducts, setRecommendedProducts] = useState<any[]>([]);
  // Udyog variant products (colour/size) have no single price/stock — this
  // holds the product while the cashier picks which row they're selling.
  const [variantSelectionProduct, setVariantSelectionProduct] = useState<any>(null);
  // Per-axis selections inside the dynamic variant picker (Phase 3).
  // Reset whenever variantSelectionProduct changes.
  const [variantPickerSelections, setVariantPickerSelections] = useState<Record<string, string>>({});
  // Lot/batch picker — see addToCart's comment for when this fires.
  const [batchSelectionProduct, setBatchSelectionProduct] = useState<any>(null);
  const [batchSelectionVariant, setBatchSelectionVariant] = useState<string | undefined>(undefined);
  const [batchSelectionOptions, setBatchSelectionOptions] = useState<any[]>([]);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const componentRef = useRef<HTMLDivElement>(null);
  // Debounces addToCart against a genuine rapid double-fire on the same
  // product+variant (a real double-tap, or a stale dropdown button still
  // registering a second click before React removes it) — maps
  // `${productId}::${variant}` to the timestamp of its last add. A second
  // add within the cooldown is ignored; anything after it goes through
  // normally (so scanning/clicking the same item again a moment later to
  // mean "quantity 2" still works as always).
  const pendingAddKeysRef = useRef<Map<string, number>>(new Map());
  const DUPLICATE_ADD_COOLDOWN_MS = 700;
  // Batch lookup cache — avoids re-fetching /products/{id}/batches on every
  // add of the same product (e.g. scanning the same item multiple times).
  const batchCacheRef = useRef<Map<string, any[]>>(new Map());

  // Set when arriving here via a Delivery Challan's "Convert to Invoice"
  // button (app/[locale]/(main)/challans/page.tsx) — after the sale is
  // actually created below, the challan gets PATCHed to 'invoiced' so it
  // stops showing as still-open. Cleared on submit or unmount so a stray
  // browser-back doesn't silently reattach a later, unrelated sale to it.
  const [pendingChallanId, setPendingChallanId] = useState<string | null>(null);

  useEffect(() => {
    fetchProducts();
    fetchParties();
    fetchUdharCustomers();
    // Auto-focus search on load
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }, [profile?.id, fetchParties, fetchUdharCustomers]);

  useEffect(() => {
    const raw = sessionStorage.getItem('pendingChallanInvoice');
    if (!raw) return;
    sessionStorage.removeItem('pendingChallanInvoice');
    try {
      const challan = JSON.parse(raw);
      setIsWholesale(true);
      setPendingChallanId(challan.id);
      if (challan.customerId) {
        setSelectedParty({
          id: challan.customerId, name: challan.customerName || '', mobile: challan.customerMobile || '',
        });
        setCustomerMobile(challan.customerMobile || '');
      }
      for (const it of challan.items || []) {
        addItem({
          id: it.productId, name: it.name, unit: it.unit, quantity: it.quantity,
          price: it.price, profit: it.price, total: it.quantity * it.price,
          variant: it.variantKey || undefined, fromChallan: true,
        } as any);
      }
    } catch (e) { console.error('Failed to load challan for invoicing:', e); }
    // Runs once on mount only — addItem/setSelectedParty are stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drives useBillingEngine's split state from the chosen single payment
  // method, keeping it live-synced to the running total (so it behaves like
  // retail's 'method' mode) — Cash/UPI/Bank/Cheque always mean "the whole
  // bill via this one method" unless the cashier switches to Mixed, where
  // they take over the Cash/UPI/Bank fields directly instead.
  useEffect(() => {
    if (paymentMethod === 'mixed') return;
    if (paymentMethod === 'credit') {
      setSplitPayments({ cash: 0, upi: 0, card: 0, bank: 0 });
      return;
    }
    const key = paymentMethod === 'cheque' ? 'bank' : paymentMethod;
    // grandTotal (not total) — otherwise adding a Transport/Loading/Packing/
    // Other charge after this first ran leaves Received Amount stuck at the
    // pre-charges cart total, making the bill look partially unpaid even
    // when the cashier is collecting the full (now higher) amount.
    setSplitPayments({ cash: 0, upi: 0, card: 0, bank: 0, [key]: grandTotal });
  }, [paymentMethod, grandTotal, setSplitPayments]);

  const fetchProducts = async () => {
    try {
      const data = await withOfflineCache(
        `products_${profile?.id || 'default'}`,
        async () => {
          const res = await api.get('/products');
          return res.data;
        },
        profile?.id
      );
      setProducts(data || []);
    } catch (err) {
      console.error('Failed to load products', err);
    }
  };

  const getPrice = useCallback((product: any, variant?: string, wholesale: boolean = isWholesale) => {
    // NB: `cost` here is misleadingly named — for Udyog it holds the
    // WHOLESALE SELLING PRICE (what a wholesale customer pays), not the
    // shop's actual purchase cost. That confusion caused profit to be
    // computed against the wrong basis; the shop's real cost is resolved
    // separately by getShopCost() below and sent as purchase_price. Keeping
    // the name here to avoid touching the wholesale/retail price toggle.
    let cost = product.wholesaleCost || 0;
    let selling = product.sellingPrice || product.price || 0;

    if (variant) {
      const row = Array.isArray(product.variants)
        ? product.variants.find((v: any) => variantRowKey(v) === variant)
        : null;
      if (row) {
        cost = row.wholesalePrice || cost;
        selling = row.sellingPrice || row.mrp || selling;
        return wholesale ? cost : selling;
      }
      try {
        const meta = typeof product.metadata === 'string' ? JSON.parse(product.metadata) : (product.metadata || {});
        const sp = meta?.size_prices?.[variant];
        if (sp) {
          cost = sp.cost || cost;
          selling = sp.sellingPrice || sp.mrp || selling;
        }
      } catch {}
    }
    return wholesale ? cost : selling;
  }, [isWholesale]);

  /**
   * Resolves the SHOP'S real purchase cost for a product (± variant) — the
   * number that goes into profit math, not the number the customer pays.
   *
   * Priority:
   *   1. Per-variant `costPrice` (Udyog variants[] carry it per colour/size)
   *   2. Per-variant `metadata.size_prices[variant].cost`
   *   3. Product-level `costPrice` — Udyog's real cost column
   *   4. Product-level `wholesaleCost` — Vyapar/Dukan legacy cost column
   *
   * The old code just returned `wholesaleCost`, but on Udyog packages that
   * column is repurposed as the WHOLESALE SELLING PRICE (see memory:
   * udyog-three-tier-pricing). Using it as cost made profit look tiny or
   * negative for every Udyog bill — client-reported: "Today's Profit ₹-133
   * even though wholesale profit is set to ₹250".
   */
  const getShopCost = useCallback((product: any, variant?: string): number => {
    if (variant) {
      const row = Array.isArray(product?.variants)
        ? product.variants.find((v: any) => variantRowKey(v) === variant)
        : null;
      if (row) {
        const c = Number(row.costPrice) || 0;
        if (c > 0) return c;
      }
      try {
        const meta = typeof product?.metadata === 'string' ? JSON.parse(product.metadata) : (product?.metadata || {});
        const sp = meta?.size_prices?.[variant];
        const c = Number(sp?.cost) || 0;
        if (c > 0) return c;
      } catch {}
    }
    return Number(product?.costPrice) || Number(product?.wholesaleCost) || 0;
  }, []);

  // When Wholesale/Retail toggle changes, update all prices in cart
  const prevIsWholesale = useRef(isWholesale);
  useEffect(() => {
    if (prevIsWholesale.current !== isWholesale) {
      prevIsWholesale.current = isWholesale;
      items.forEach(item => {
        const product = products.find(p => p.id === item.id);
        if (product) {
          const newPrice = getPrice(product, item.variant || undefined, isWholesale);
          if (item.price !== newPrice) {
            updatePrice(item.id as any, newPrice, item.variant);
          }
        }
      });
    }
  }, [isWholesale, products, getPrice, items, updatePrice]);

  const addToCart = useCallback((product: any, variant?: string, forceAdd = false, batchInfo?: { id: string; batchNumber: string | null; costPrice: number | null; sellingPrice: number | null } | null) => {
    // Instant feedback the moment ANY add is triggered — closes the search
    // dropdown and clears the box right away, before the (possibly slow,
    // see the batch lookup below) async work even starts. Without this the
    // dropdown sat open for the full lookup duration, which reads as "my
    // click didn't register" and invites a second click on the same result
    // — see the dedup guard below for why that used to double the quantity.
    setSearch('');
    setSearchResults([]);

    // 1. Check Out of Stock first
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

    // Udyog variant product (colour/size) with no variant chosen yet — ask
    // which row before adding anything to the cart. Re-entering addToCart
    // with a variant (from the picker below) skips this and falls through.
    if (product.productType === 'variant' && Array.isArray(product.variants) && product.variants.length > 0 && !variant) {
      setVariantPickerSelections({});
      setVariantSelectionProduct(product);
      return;
    }

    // Per-variant stock guard — the aggregate resolveStock() check above sums
    // every colour/size, so a product with plenty overall but ZERO of the
    // picked variant would still pass it. Verify the specific variant here
    // before it lands in the cart, and reuse the same OOS + recommendations
    // modal the search path shows so the UX is identical.
    if (variant && !forceAdd) {
      const line = resolveStockForItem({ id: product.id, variant } as any, products);
      if (line.known && line.qty <= 0) {
        setOutOfStockItem(product);
        let recs = products.filter(p => { const r = resolveStock(p); return p.id !== product.id && (!r.known || r.qty > 0); });
        if (product.category) {
          const sameCat = recs.filter(p => p.category === product.category);
          if (sameCat.length > 0) recs = sameCat;
        }
        const targetSize = splitVariantKey(variant).size;
        if (targetSize) {
          const sameSize = recs.filter(p => p.metadata?.size === targetSize || p.size === targetSize);
          if (sameSize.length > 0) recs = sameSize;
        }
        setRecommendedProducts(recs.slice(0, 4));
        return;
      }
    }

    const existingItem = items.find(i => i.id === product.id && i.variant === variant);
    if (existingItem) {
      const lineStock = resolveStockForItem(existingItem, products);
      if (lineStock.known && existingItem.quantity + 1 > lineStock.qty) {
        setOutOfStockItem(product);
        return;
      }
      updateQuantity(existingItem.id, existingItem.quantity + 1, variant);
    } else {
      // A genuine first click for this product+variant (not the lot-picker's
      // own forceAdd re-entry, and not a scan that already pinned a batch) —
      // decides both whether to debounce a rapid double-fire below AND
      // whether to kick off the background lot lookup further down.
      const isOriginalClick = !batchInfo && !forceAdd && !!product?.id;
      if (isOriginalClick) {
        // Debounce: a second click on the same product+variant landing
        // within the cooldown (a real double-tap, or a stale dropdown
        // button still registering a second click before React removes it)
        // is ignored — without this, the immediate addItem() below would
        // run twice and double the quantity exactly like the old
        // network-latency race did.
        const addKey = `${product.id}::${variant || ''}`;
        const now = Date.now();
        const lastAdd = pendingAddKeysRef.current.get(addKey);
        if (lastAdd && now - lastAdd < DUPLICATE_ADD_COOLDOWN_MS) return;
        pendingAddKeysRef.current.set(addKey, now);
      }

      const defaultQty = product.is_loose ? 0.5 : 1;
      const price = getPrice(product, variant);
      // `cost` here is the shop's actual purchase cost — used both for the
      // cart's live profit display AND sent to the backend as
      // `purchase_price`. Must NOT be the wholesale-selling-price (that's
      // the customer-facing rate and lives in `price` above via getPrice).
      let cost = getShopCost(product, variant);
      // A picked lot's real cost wins over every other cost source, same
      // priority the retail billing UI + backend give it — see
      // billing/route.ts's batch-aware FIFO costing pass.
      if (batchInfo && Number(batchInfo.costPrice) > 0) cost = Number(batchInfo.costPrice);
      const { color, size } = variant ? splitVariantKey(variant) : { color: '', size: '' };

      addItem({
        id: product.id || Math.random().toString(),
        name: product.name,
        unit: product.baseUnit || product.unit,
        variant,
        color: color || undefined,
        size: size || undefined,
        gender: product.gender || undefined,
        quantity: defaultQty,
        price,
        cost: cost || 0,
        profit: (price / (1 + (Number(product.gstPercent ?? product.gst_percent ?? 0) || 0) / 100)) - cost,
        total: Math.round(price * defaultQty),
        is_loose: !!product.is_loose,
        // Which physical lot this line is pinned to — sent to the backend as
        // batch_id so it draws stock/cost from THIS lot instead of
        // auto-FIFO-picking one. Absent when the product had only one (or
        // zero) live lots, which keeps working exactly as before.
        batchId: batchInfo?.id,
        batchNumber: batchInfo?.batchNumber || undefined,
        // Carried for GST invoices (per-item rate + HSN). Harmless on non-GST bills.
        gstPercent: Number(product.gstPercent ?? product.gst_percent ?? 0) || 0,
        hsnCode: product.hsnCode ?? product.hsn_code ?? '',
        // MRP travels with the line so the cart can flag the wholesaler's
        // "party discount %" off list price per row (mnemonic for the deal).
        mrp: Number(product.mrp) || 0,
        // Category-level product attributes (fabric, grade, pattern…) — shown
        // as sub-text under the product name in the cart when CategoryConfig
        // lists them in billingDisplayFields.
        categoryAttributes: (typeof product.metadata === 'object' && product.metadata !== null)
          ? (product.metadata as any).categoryAttributes ?? {}
          : {},
      });

      // Background lot/batch reconciliation — the line above is already in
      // the cart and sellable at the product's own flat cost; this quietly
      // pins it to the real FIFO lot once the lookup resolves, instead of
      // making the shopkeeper wait for a network round trip before the item
      // even appears. Only for a genuine first click (not the lot-picker's
      // own forceAdd re-entry, and not a scan that already pinned a batch).
      if (isOriginalClick) {
        const gstPercent = Number(product.gstPercent ?? product.gst_percent ?? 0) || 0;
        const applyBatches = (batches: any[]) => {
          if (batches.length >= 1) {
            const first = batches[0];
            const reconciledCost = Number(first.costPrice) > 0 ? Number(first.costPrice) : cost;
            const displayBatchNumber = first.batchNumber || (batches.length > 1 ? `Lot 1` : null);
            setLineBatch(product.id, variant, {
              batchId: first.id,
              batchNumber: displayBatchNumber,
              cost: reconciledCost,
              profit: (price / (1 + gstPercent / 100)) - reconciledCost,
            });
          }
        };
        const cached = batchCacheRef.current.get(product.id);
        if (cached !== undefined) {
          applyBatches(cached);
        } else {
          api.get(`/products/${product.id}/batches`).then(res => {
            const batches = Array.isArray(res.data) ? res.data : [];
            batchCacheRef.current.set(product.id, batches);
            applyBatches(batches);
          }).catch(() => { /* best-effort only — line already added at flat cost */ });
        }
      }
    }
    setSearch('');
    setSearchResults([]);
    searchInputRef.current?.focus();
  }, [items, addItem, updateQuantity, getPrice, setLineBatch]);

  const handleScan = useCallback(async (barcode: string) => {
    const raw = String(barcode).trim();
    const seq = ++scanSeqRef.current;

    const local = matchProductByCode(products, raw);
    if (local) {
      addToCart(local);
      playScanBeep(true);
      setScanFeedback({ status: 'ok', text: local.name });
      return;
    }

    // Per-variant barcode match (e.g. a desktop-scanner code for one exact
    // colour/size) — drops that variant into the cart, not the base row.
    const variantHit = matchVariantByCode(products, raw);
    if (variantHit) {
      addToCart(variantHit.product, variantHit.variantKey);
      playScanBeep(true);
      setScanFeedback({ status: 'ok', text: `${variantHit.product.name} · ${variantHit.variantKey}` });
      return;
    }

    // A non-empty list below the 2000-row cap is the whole catalogue, so a local
    // miss is genuinely "not found" — answer instantly. An empty list is still
    // loading, so fall through to the (bounded) server lookup instead.
    if (products.length > 0 && products.length < 2000) {
      playScanBeep(false);
      setScanFeedback({ status: 'error', text: `Not found: ${raw}` });
      setUnknownBarcode(raw);
      return;
    }

    // Large catalogue: look up, but bound the wait so the counter never hangs.
    setScanFeedback({ status: 'pending', text: `Looking up ${raw}…` });
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 4000);
      const res = await api.get(`/products/barcode/${encodeURIComponent(raw)}`, { signal: ac.signal });
      clearTimeout(timer);
      if (seq !== scanSeqRef.current) return; // superseded by a newer scan
      const found = res.data;
      if (found?.id) {
        addToCart(found, found.matched_variant || undefined);
        playScanBeep(true);
        setScanFeedback({ status: 'ok', text: found.matched_variant ? `${found.name} · ${found.matched_variant}` : found.name });
        return;
      }
      throw new Error('not found');
    } catch {
      if (seq !== scanSeqRef.current) return;
      // Previously a miss was silent, so the cashier had no way to tell an
      // unrecognised code from one that simply hadn't registered.
      playScanBeep(false);
      setScanFeedback({ status: 'error', text: `Not found: ${raw}` });
      setUnknownBarcode(raw);
    }
  }, [addToCart, products]);

  // Hardware scanner — shared detection logic (see lib/useBarcodeScanner).
  useBarcodeScanner({ onScan: handleScan, enabled: !unknownBarcode });

  useEffect(() => {
    if (!scanFeedback || scanFeedback.status === 'pending') return;
    const t = setTimeout(() => setScanFeedback(null), 1800);
    return () => clearTimeout(t);
  }, [scanFeedback]);

  // Keyboard shortcuts (kept separate from scanning).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        if (items.length > 0 && !showCheckout && !showBillModal) {
          setShowCheckout(true);
        }
      } else if (e.key === 'F3') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        setShowManualAdd(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items.length, showCheckout, showBillModal]);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearch(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (val.length > 1) {
      searchDebounceRef.current = setTimeout(() => {
        setSearchResults(performSmartSearch(products, val));
      }, 120);
    } else {
      setSearchResults([]);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchResults.length > 0) {
      e.preventDefault();
      addToCart(searchResults[0]);
    }
  };



  const generatePDFBlob = async () => {
    if (!componentRef.current) throw new Error('No ref');
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas-pro'),
      import('jspdf'),
    ]);
    await waitForQrCode(componentRef.current, !!profile.upiId);
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
      const canvas = await html2canvas(clone, { scale: 2.2, useCORS: true, backgroundColor: '#ffffff', logging: false });
      const imgData = canvas.toDataURL('image/jpeg', 0.82);
      const pdfWidth = isA4 ? 210 : 80;
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pdfWidth, pdfHeight] });
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      return { pdf, blob: pdf.output('blob') };
    } finally {
      document.body.removeChild(clone);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      const { pdf } = await generatePDFBlob();
      pdf.save(`bill-${lastBill?.billNumber?.replace(/[^a-zA-Z0-9]/g, '') || 'invoice'}.pdf`);
    } catch (error) {
      console.error('Failed to generate PDF', error);
      alert(t('failedToDownloadPdf'));
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

      let phone = (lastBill?.customerMobile || '').replace(/\D/g, '');
      if (phone.length === 10) phone = `91${phone}`;
      else if (phone.length > 10 && phone.startsWith('0')) phone = `91${phone.substring(1)}`;
      // No phone on file → leave it blank. wa.me/whatsapp:// both treat an
      // empty number as "let the user pick a chat" (WhatsApp's own contact
      // picker), rather than falling back to navigator.share()/a plain file
      // download — a "Share" button that sometimes just downloads a PDF
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

  // WhatsApp is intentionally NOT part of this — it only ever fires from an
  // explicit tap on the "Share" button (handleWhatsAppPDF above), never
  // automatically after a sale.
  const autoSendAfterBill = async (billData: any, email: string) => {
    setSendStatus(email ? { email: null } : null);
    let pdfUrl: string | null = null;
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      try {
        const { blob } = await generatePDFBlob();
        const fileName = `bill-${billData.billNumber || Date.now()}.pdf`;
        pdfUrl = await uploadInvoiceToSupabase(blob, fileName);
      } catch (pdfErr) {
        console.warn('PDF generation or upload failed:', pdfErr);
      }
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

  const CHARGE_LABELS: Record<keyof typeof charges, string> = {
    transport: 'Transport Charges',
    loading: 'Loading Charges',
    packing: 'Packing Charges',
    other: 'Other Charges',
  };

  const paymentTypeWire: Record<WholesalePaymentMethod, string> = {
    cash: 'Cash', upi: 'UPI', bank: 'Bank', cheque: 'Cheque', credit: 'Credit', mixed: 'Split',
  };

  // ─── Mill Billing (mill_v2) checkout ─────────────────────────────────────────────────────────────
  // Sends the RAW inputs (rates, quantities, discount, charges, flags). The SERVER recomputes every figure with
  // lib/millBilling.ts and is the only authority — the total sent below is informational and never used.
  const millView = (c: MillResult) => ({
    goods_subtotal: c.goodsSubtotal, discount: c.discount, taxable: c.taxable,
    gst: { billed: c.gstBilled, inter_state: c.interState, cgst: c.cgst, sgst: c.sgst, igst: c.igst, total: c.totalGst },
    charges: c.charges, round_off: c.roundOff, grand_total: c.grandTotal,
  });
  const handleMillCheckout = async () => {
    if (items.length === 0) return;
    if (millCalcError) { alert(`Billing error: ${millCalcError}`); return; }
    if (!millCalc) return;
    if (millChargesParsed.error) { alert(`${tMill('chargesInvalid')}: ${millChargesParsed.error}`); return; }
    if (isWholesale && !selectedParty) { alert(t('partyRequiredToSave') || 'Please select a party before saving the invoice.'); return; }
    if (!isWholesale && grandRemaining > 0 && !customerName.trim()) {
      alert(t('nameRequiredForUdhar') || 'Please enter a customer name — this sale has an outstanding balance to track.');
      return;
    }
    if (Math.round(collectedAmount * 100) > Math.round(grandTotal * 100)) { alert(t('collectedExceedsTotal')); return; }

    setIsGenerating(true);
    try {
      const paymentDetailsExtra: Record<string, any> = { method: paymentMethod };
      if (paymentMethod === 'upi') { paymentDetailsExtra.upiApp = upiApp || undefined; paymentDetailsExtra.upiTxnId = upiTxnId || undefined; }
      if (paymentMethod === 'bank') { paymentDetailsExtra.bankName = bankName || undefined; paymentDetailsExtra.bankRefNo = bankRefNo || undefined; }
      if (paymentMethod === 'cheque') { paymentDetailsExtra.chequeNo = chequeNo || undefined; paymentDetailsExtra.chequeDate = chequeDate || undefined; paymentDetailsExtra.chequeBank = chequeBank || undefined; }
      if (grandRemaining > 0) {
        paymentDetailsExtra.creditDays = creditDays;
        paymentDetailsExtra.dueDate = new Date(Date.now() + creditDays * 24 * 60 * 60 * 1000).toISOString();
      }

      const saleItems = items.map((item: any) => ({
        product_id: (item as any).fromChallan ? null : (typeof item.id === 'string' && !item.id.includes('.') ? item.id : null),
        name: item.name,
        unit: item.unit,
        variant: item.variant || null,
        quantity: item.quantity,
        price_per_unit: item.price, // GST-EXCLUSIVE rate, as typed
        purchase_price: item.cost || 0,
        ...(billType === 'gst' ? { gst_percent: item.gstPercent } : {}),
        hsn_code: item.hsnCode,
        batch_id: (item as any).batchId || undefined,
      }));
      const payload: any = {
        billing_model: 'mill_v2',
        customer_id: isWholesale ? selectedParty!.id : null,
        customer_name: isWholesale ? selectedParty!.name : (customerName.trim() || null),
        customer_mobile: customerMobile.trim() || null,
        customer_email: customerEmail.trim() || null,
        customer_address: customerAddress.trim() || null,
        items: saleItems,
        discount: millDiscountNumber,
        charges: millChargesParsed.value,
        bill_type: billType,
        gst_inter_state: gstInterState,
        total_amount: grandTotal, // informational only — the server ignores it and flags any mismatch
        payment_type: paymentTypeWire[paymentMethod],
        amount_paid: collectedAmount,
        payment_details: { ...splitPayments, udhar: grandRemaining, ...paymentDetailsExtra },
        ...(dupRestrictionActive && dupFrom ? { duplicated_from: dupFrom } : {}),
      };

      let saved: any = null;
      try {
        const res = await api.post('/billing/', payload);
        saved = res.data;
      } catch (err: any) {
        if (!isNetworkError(err)) throw err;
        // Offline: queue the SAME payload; on replay the server recomputes and its total wins.
        const queued = await queueOfflineSale(payload, profile?.id);
        saved = { id: queued.localId, invoice_number: queued.localId, totalAmount: millCalc.grandTotal, amountPaid: collectedAmount, pricing_model: 'mill_v2', offline: true, mill: millView(millCalc) };
      }
      if (!saved?.offline && Math.round((Number(saved?.totalAmount) || 0) * 100) !== Math.round(millCalc.grandTotal * 100)) {
        console.warn('Mill bill: server total differs from the on-screen total', { server: saved?.totalAmount, ui: millCalc.grandTotal });
      }
      // Customer broker + commission: best-effort, after the bill is saved (online only; never affects the bill or the customer's balance).
      if (saleBroker.name.trim() && !saved?.offline && saved?.invoice_number) {
        api.post('/mill/broker-commission', { name: saleBroker.name, commission: saleBroker.commission, billNumber: saved.invoice_number, kind: 'customer', party: isWholesale ? selectedParty?.name : (customerName.trim() || undefined) })
          .catch((e: any) => console.error('Broker commission not saved:', e));
      }
      saved._customerName = isWholesale ? selectedParty?.name : (customerName.trim() || undefined);

      if (pendingChallanId && saved?.id && !saved.offline) {
        api.patch(`/challans/${pendingChallanId}`, { action: 'invoice', saleId: saved.id }).catch((e) => console.error('Failed to mark challan invoiced:', e));
        setPendingChallanId(null);
      }

      clearCart();
      setSelectedParty(null);
      setCustomerName('');
      setCustomerAddress('');
      setPaymentMethod('cash');
      setUpiApp(''); setUpiTxnId('');
      setBankName(''); setBankRefNo('');
      setChequeNo(''); setChequeDate(''); setChequeBank('');
      setCreditDays(30);
      setMillCharges(EMPTY_MILL_CHARGES);
      setSaleBroker(EMPTY_BROKER);
      setDupFrom(null); setDupForceNonGst(false); setDupOriginalRates({});
      fetchParties();
      fetchUdharCustomers();
      setShowCheckout(false);
      setMillSaved(saved);
    } catch (err: any) {
      console.error('Failed to save mill bill', err);
      // The server is authoritative: a rejected Mill request (internal platform flag off, wrong package) is shown as such —
      // it is never retried as a legacy bill.
      alert(err?.response?.data?.code === 'MILL_NOT_ENABLED' ? tMill('blockedPlatform') : (err?.response?.data?.detail || err?.message || tMill('saveFailed')));
    } finally {
      setIsGenerating(false);
    }
  };


  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isMill) { await handleMillCheckout(); return; }
    if (items.length === 0) return;

    // Party is mandatory in Wholesale pricing mode — it's what lets the
    // outstanding/ledger update below attach to a real party instead of a
    // loose text label. Retail-mode counter sales use a plain customer name
    // instead (same as Dukan/Vyapar billing); the backend already requires a
    // name there if the sale goes to Udhar (see collectedAmount check below).
    if (isWholesale && !selectedParty) {
      alert(t('partyRequiredToSave') || 'Please select a party before saving the invoice.');
      return;
    }
    // Overdue-bill soft warning — creditDays has no server-side enforcement
    // (unlike creditLimit, which billing/route.ts already hard-rejects), so
    // this is the only gate for it. Confirmable rather than blocking, same
    // as every other credit-health signal in this app (see Supplier credit
    // health) — a shopkeeper may have a good reason to keep billing a
    // regular party who's slow to pay this month.
    if (isWholesale && selectedParty && partyCreditHealth && partyCreditHealth.overdueAmount > 0) {
      const proceed = await confirmOverdue();
      if (!proceed) return;
    }
    if (!isWholesale && grandRemaining > 0 && !customerName.trim()) {
      alert(t('nameRequiredForUdhar') || 'Please enter a customer name — this sale has an outstanding balance to track.');
      return;
    }
    if (collectedAmount > grandTotal) {
      alert(t('collectedExceedsTotal'));
      return;
    }

    setIsGenerating(true);

    try {
      const chargeItems = (Object.keys(charges) as (keyof typeof charges)[])
        .filter(key => Number(charges[key]) > 0)
        .map(key => ({
          product_id: null,
          name: CHARGE_LABELS[key],
          unit: 'Unit',
          variant: null,
          quantity: 1,
          price_per_unit: Number(charges[key]),
          purchase_price: 0,
        }));

      const saleItems = [
        ...items.map(item => ({
          // A line pulled in from "Convert to Invoice" already had its stock
          // decremented once, at challan-dispatch time (see challans/route.ts)
          // — forcing product_id null here makes this Sale line behave like a
          // freeform charge (Transport/Loading/etc, same convention just
          // above): it still bills/GST/ledgers normally, but billing/route.ts's
          // stock-decrement loop groups purely by product_id and silently
          // skips any item without one, so it can never be double-deducted.
          product_id: (item as any).fromChallan ? null : (typeof item.id === 'string' && !item.id.includes('.') ? item.id : null),
          name: item.name,
          unit: item.unit,
          variant: item.variant || null,
          quantity: item.quantity,
          price_per_unit: item.price,
          purchase_price: item.cost || 0,
          // Without these the backend falls back to the product catalog's
          // current GST%, silently ignoring any per-line override made in the
          // cart above — the printed invoice would then disagree with the
          // shop's own recorded Sale.gstAmount.
          gst_percent: item.gstPercent,
          hsn_code: item.hsnCode,
          batch_id: (item as any).batchId || undefined,
          batch_number: item.batchNumber || undefined,
          expiry_date: item.expiryDate ? String(item.expiryDate).slice(0, 10) : undefined,
          serial_number: item.serialNumber || undefined,
          warranty_days: item.warrantyDays || undefined,
        })),
        ...chargeItems,
      ];

      // Method-specific reference data + credit terms, folded into the
      // flexible payment_details JSON the backend already stores — no
      // schema change needed for any of this.
      const paymentDetailsExtra: Record<string, any> = { method: paymentMethod };
      if (paymentMethod === 'upi') { paymentDetailsExtra.upiApp = upiApp || undefined; paymentDetailsExtra.upiTxnId = upiTxnId || undefined; }
      if (paymentMethod === 'bank') { paymentDetailsExtra.bankName = bankName || undefined; paymentDetailsExtra.bankRefNo = bankRefNo || undefined; }
      if (paymentMethod === 'cheque') { paymentDetailsExtra.chequeNo = chequeNo || undefined; paymentDetailsExtra.chequeDate = chequeDate || undefined; paymentDetailsExtra.chequeBank = chequeBank || undefined; }
      let dueDateIso: string | undefined;
      if (grandRemaining > 0) {
        const due = new Date(Date.now() + creditDays * 24 * 60 * 60 * 1000);
        dueDateIso = due.toISOString();
        paymentDetailsExtra.creditDays = creditDays;
        paymentDetailsExtra.dueDate = dueDateIso;
      }

      // Wholesale mode attaches the sale to a real Party (GSTIN/credit/ledger);
      // Retail mode is a plain walk-in name — the backend already auto-creates
      // or matches a Customer by name when there's an outstanding amount.
      const payload = {
        customer_id: isWholesale ? selectedParty!.id : null,
        customer_name: isWholesale ? selectedParty!.name : (customerName.trim() || null),
        customer_mobile: customerMobile.trim() || null,
        customer_email: customerEmail.trim() || null,
        customer_address: customerAddress.trim() || null,
        items: saleItems,
        discount: discount,
        total_amount: grandTotal,
        payment_type: paymentTypeWire[paymentMethod],
        amount_paid: collectedAmount,
        payment_details: { ...splitPayments, udhar: grandRemaining, ...paymentDetailsExtra },
        bill_type: billType,
        gst_amount: isGstBill ? gst.totalGst : null,
        gst_details: isGstBill ? gst : null,
      };

      let dbSale: any = null;
      let billNumber: string;
      let isOfflineBill = false;
      try {
        const res = await api.post('/billing/', payload);
        dbSale = res.data;
        billNumber = `INV-${dbSale.id.substring(0, 8).toUpperCase()}`;
      } catch (err: any) {
        if (!isNetworkError(err)) throw err;
        const queued = await queueOfflineSale(payload, profile?.id);
        billNumber = queued.localId;
        isOfflineBill = true;
      }

      // Sale is real and committed at this point — safe to mark the source
      // challan invoiced. Best-effort: a failure here just leaves the
      // challan showing "open" a little longer, never blocks the bill that
      // already succeeded.
      if (pendingChallanId && dbSale?.id) {
        api.patch(`/challans/${pendingChallanId}`, { action: 'invoice', saleId: dbSale.id }).catch((e) => console.error('Failed to mark challan invoiced:', e));
        setPendingChallanId(null);
      }

      // The scan-to-pay QR is shown ONLY on the A4 (professional tax-invoice)
      // format — not on thermal slips, and never on the retail billing screen.
      // Generated (and awaited) up front as an inline SVG — a raster QR <img>
      // repeatedly captured blank in the PDF (html2canvas image-load race).
      // See generateUpiQrSvg().
      const billCustomerName = isWholesale ? selectedParty!.name : (customerName.trim() || undefined);
      const billInvoiceFormat = profile.invoiceFormat || 'wholesale';
      const showBillQr = (billInvoiceFormat === 'a4' || billInvoiceFormat === 'wholesale') && !!profile.upiId;
      const qrSvg = showBillQr
        ? await generateUpiQrSvg({
            upiId: profile.upiId!,
            payeeName: profile.shopName,
            amount: grandRemaining > 0 ? grandRemaining : grandTotal,
            note: `Invoice ${billNumber}`,
          })
        : undefined;

      const billData = {
        customerName: billCustomerName,
        customerMobile: customerMobile.trim() || undefined,
        items: [...items, ...chargeItems.map(ci => ({
          id: ci.name, name: ci.name, unit: ci.unit, quantity: ci.quantity,
          price: ci.price_per_unit, total: ci.price_per_unit, is_loose: false,
        }))] as any,
        total: grandTotal,
        discount,
        amountPaid: collectedAmount,
        remainingAmount: grandRemaining,
        paymentMethod: paymentTypeWire[paymentMethod],
        splitPayments: { ...splitPayments, udhar: grandRemaining },
        billNumber,
        date: fmtDate(new Date()),
        dueDate: dueDateIso,
        isOfflineBill,
        // GST invoice data (undefined for non-GST → invoice renders normally)
        billType,
        gstBreakdown: isGstBill ? gst : undefined,
        // Shop-level print settings — this screen is Udyog-only, so a shop
        // that hasn't explicitly chosen a format yet still gets the proper
        // A4 tax-invoice layout instead of silently falling back to the
        // thermal80 default (which is what happened before this field was
        // forwarded at all — only the separate Manual Bill Upload path set it).
        invoiceFormat: billInvoiceFormat,
        invoiceTheme: profile.invoiceTheme || 'standard',
        invoiceColor: profile.invoiceColor || null,
        businessType: profile.businessType || 'kirana',
        showQrCode: profile.showQrCode || false,
        invoiceFooter: profile.invoiceFooter || undefined,
        ownerSignature: profile.signatureUrl || undefined,
        qrSvg,
        // Only carry a upiId onto the bill when the QR is actually shown
        // (A4 format) — the invoice components gate the whole scan-to-pay
        // block on this, so a thermal wholesale slip won't render it.
        upiId: showBillQr ? profile.upiId : undefined,
      };
      setLastBill(billData);

      if (!isOfflineBill) {
        // Revalidate products so the Products & Stock pages reflect the sale's
        // stock deduction without requiring a manual page refresh.
        invalidateProductCaches();
      }

      clearCart();
      // Local Udyog-only state the shared engine's clearCart() doesn't know about.
      setSelectedParty(null);
      setCustomerName('');
      setCustomerAddress('');
      setPaymentMethod('cash');
      setUpiApp(''); setUpiTxnId('');
      setBankName(''); setBankRefNo('');
      setChequeNo(''); setChequeDate(''); setChequeBank('');
      setCreditDays(30);
      setCharges({ transport: '', loading: '', packing: '', other: '' });
      fetchParties(); // refresh Outstanding shown in the picker for next bill
      fetchUdharCustomers();
      setShowCheckout(false);
      setShowBillModal(true);

      // Email auto-sends; WhatsApp is click-only via the bill modal's
      // "Share" button (handleWhatsAppPDF) — never fired automatically.
      const email = customerEmail.trim();
      if (email) {
        autoSendAfterBill(billData, email);
      }

    } catch (err: any) {
      console.error('Failed to generate bill', err);
      // Server-side stock guard fired (someone raced us, or a variant slipped
      // past the client's own resolveStock). Turn the raw 400 into the same
      // "Out of Stock + recommendations" modal the search path already uses,
      // so the shopkeeper sees why the bill was rejected instead of a bare
      // "Failed to generate bill" alert.
      const detail: string = err?.response?.data?.detail || err?.message || '';
      const isStockError = /insufficient stock/i.test(detail);
      if (isStockError) {
        // The message lists every shortage: "Insufficient stock: NAME: only …; NAME2: only …"
        // Pull the first name and match it to a cart item to seed the modal.
        const namePart = detail.replace(/^insufficient stock:\s*/i, '').split(':')[0].trim();
        const bareName = namePart.replace(/\s*\([^)]*\)\s*$/, '').trim(); // strip trailing "(colour / size)"
        const cartHit = items.find(it => it.name?.trim() === bareName) || items[0];
        const productHit = cartHit ? products.find(p => p.id === cartHit.id) : null;
        setShowCheckout(false);
        // Drop the offending line from the cart — leaving it there just lets
        // the shopkeeper click Confirm again and hit the same 400.
        if (cartHit) removeItem(cartHit.id, cartHit.variant);
        // Refresh product catalogue so the newly-known 0/low stock is reflected
        // if this was a race with another billing tab.
        fetchProducts();
        setOutOfStockItem(productHit || { id: cartHit?.id, name: bareName || (cartHit?.name || 'Item') });
        // Recompute recommendations for the OOS modal (same criteria as the
        // search-path branch of addToCart).
        let recs = products.filter(p => {
          const r = resolveStock(p);
          return p.id !== productHit?.id && (!r.known || r.qty > 0);
        });
        if (productHit?.category) {
          const sameCat = recs.filter(p => p.category === productHit.category);
          if (sameCat.length > 0) recs = sameCat;
        }
        setRecommendedProducts(recs.slice(0, 4));
      } else if (/credit limit/i.test(detail)) {
        // billing/route.ts hard-rejects a sale that would push a party's
        // outstanding past creditLimit — surface that real reason instead of
        // the generic failure alert, since the shopkeeper needs to know it's
        // a credit block (fixable via a payment or raising the limit), not a
        // random error.
        alert(detail);
      } else {
        alert(t('failedToGenerateBillShort'));
      }
    } finally {
      setIsGenerating(false);
    }
  };




  return (
    <div className="min-h-[calc(100vh-80px)] md:h-[calc(100vh-80px)] flex flex-col md:flex-row gap-3 overflow-y-auto md:overflow-hidden">
      {/* LEFT PANEL: Search & Cart Table */}
      <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 md:overflow-hidden">
        
        {/* Top Bar: Search & Scanner */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex flex-wrap gap-3 items-center">
          {/* In-app camera viewfinder — never leaves the bill. Mobile-only:
              a desktop counter already has a real barcode scanner plugged in,
              which types straight into this screen via useBarcodeScanner. */}
          {isMobile && (
            <button
              type="button"
              onClick={() => setShowCameraScanner(true)}
              title={t('scanBarcode')}
              className="shrink-0 flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-sm transition-colors active:scale-95"
            >
              <Scan size={20} />
              <span className="hidden sm:inline text-sm">Scan</span>
            </button>
          )}
          <div className="relative flex-1 min-w-[250px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              ref={searchInputRef}
              type="text"
              className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all shadow-sm"
              placeholder={t("searchProductOrScan")}
              value={search}
              onChange={handleSearchChange}
              onKeyDown={handleSearchKeyDown}
            />
            {/* Live Suggestions Dropdown */}
            {search.length > 1 && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 max-h-[300px] overflow-y-auto">
                {searchResults.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    className={cn(
                      "w-full text-left px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors flex justify-between items-center",
                      i === 0 && "bg-slate-50 dark:bg-slate-800/80" // Highlight first item
                    )}
                  >
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        {p.name}
                        {p.barcode && <span className="text-[10px] bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-slate-500">B: {p.barcode}</span>}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        Stock: {Math.max(0, p.currentStock || 0)} {p.baseUnit} • Retail: ₹{p.sellingPrice} • Wholesale: ₹{p.wholesaleCost}
                        {bizConfig.hasGender && p.gender && ` • ${p.gender}`}
                        {bizConfig.hasBatch && p.batch_number && ` • Batch: ${p.batch_number}`}
                      </div>
                    </div>
                    <Plus size={16} className="text-emerald-500" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => setShowManualAdd(true)}
            className="px-4 py-3 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 rounded-xl font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors flex items-center gap-2 shadow-sm"
          >
            <Plus size={20} /> {t('quickAdd') || 'Quick Add'} <span className="text-[10px] bg-emerald-200/50 dark:bg-emerald-900 px-1.5 rounded ml-1">Ctrl+K</span>
          </button>
          {/* <button
            onClick={() => setShowManualBillUpload(true)}
            className="px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-2 shadow-sm"
          >
            <FileUp size={20} /> {t('manualBill') || 'Manual Bill'}
          </button> */}
        </div>

        {/* Cart Table */}
        <div className="flex-1 overflow-auto">
          {liquorCartLines.length > 0 && (
            <LiquorCartMatrix
              catalogRows={products.map((p: any) => ({ id: p.id, name: p.name, stock: p.currentStock || 0, price: p.sellingPrice, variants: p.variants }))}
              lines={liquorCartLines.map((i: any) => ({ id: i.id, name: i.name, variant: i.variant, quantity: i.quantity, price: i.price }))}
              onAdd={(productId, variantKey) => {
                // Same addToCart every other entry point uses — stock guard,
                // batch lookup, price — a sibling size shown at qty 0 is a
                // real product, so adding it goes through the real flow too.
                const product = products.find((p: any) => p.id === productId);
                if (product) addToCart(product, variantKey);
              }}
              onDecrement={(productId, variantKey, newQty) => {
                if (newQty <= 0) removeItem(productId as any, variantKey);
                else updateQuantity(productId as any, newQty, variantKey);
              }}
              onRemoveRow={(productId, variantKey) => removeItem(productId as any, variantKey)}
            />
          )}
          {(nonLiquorCartItems.length > 0 || liquorCartLines.length === 0) && (
          <>
            {/* Desktop / Tablet View: Compact table — extra fields inline under product name */}
            <div className="hidden md:block rounded-xl border-2 border-slate-300 dark:border-slate-700">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="sticky top-0 bg-slate-800 dark:bg-slate-900 text-white shadow-sm z-10">
                  <tr className="divide-x divide-slate-600">
                    <th className="px-4 py-3 font-black uppercase text-xs tracking-wider w-10">#</th>
                    <th className="px-4 py-3 font-black uppercase text-xs tracking-wider">{t('product') || 'Product'}</th>
                    {bizConfig.hasLiquorSpecs && <th className="px-4 py-3 font-black uppercase text-xs tracking-wider w-16">{t('ml') || 'ML'}</th>}
                    <th className="px-4 py-3 font-black uppercase text-xs tracking-wider text-center w-28">{t('qty') || 'Qty'}</th>
                    <th className="px-4 py-3 font-black uppercase text-xs tracking-wider text-right w-32">{isMill ? tMill('rateExclGst') : (t('price') || 'Price')}</th>
                    <th className="px-4 py-3 font-black uppercase text-xs tracking-wider text-right w-24">{t('totalUpper') || 'Total'}</th>
                    <th className="px-4 py-3 font-black uppercase text-xs tracking-wider text-center w-12">{t('act') || 'Act'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-slate-200 dark:divide-slate-800">
                  {nonLiquorCartItems.length === 0 ? (
                    <tr>
                      <td colSpan={6 + (bizConfig.hasLiquorSpecs ? 1 : 0)} className="px-4 py-12 text-center text-slate-400">
                        <Scan size={48} className="mx-auto mb-4 opacity-20" />
                        <p className="text-lg font-medium">{t('cartEmpty')}</p>
                        <p className="text-sm mt-1">{t('cartEmptyDesc')}</p>
                      </td>
                    </tr>
                  ) : nonLiquorCartItems.map((item: any, idx: number) => {
                    const lineStock = resolveStockForItem(item, products);
                    const maxQty = lineStock.known ? lineStock.qty : undefined;
                    const atMax = typeof maxQty === 'number' && item.quantity >= maxQty;
                    const subLineParts = [
                      item.variant && !bizConfig.hasLiquorSpecs ? item.variant : (item.size || null),
                      bizConfig.hasGender && item.gender ? item.gender : null,
                      isDualUnit && dualUnitCfg ? dualUnitCfg.primaryUnit : (item.unit || null),
                    ].filter(Boolean);
                    return (
                    <tr key={`${item.id}-${item.variant}`} className={cn('divide-x divide-slate-200 dark:divide-slate-800 hover:bg-emerald-50/50 dark:hover:bg-slate-800/40 transition-colors group', idx % 2 === 1 && 'bg-slate-50 dark:bg-slate-800/40')}>
                      <td className="px-4 py-3 text-slate-400 align-top">{idx + 1}</td>
                      <td className="px-4 py-3 align-top">
                        <p className="font-bold text-slate-900 dark:text-white leading-snug">
                          {item.name}
                          {(() => {
                            const mrp = Number(item.mrp) || 0;
                            if (mrp <= 0 || !(item.price > 0) || item.price >= mrp) return null;
                            const disc = ((mrp - item.price) / mrp) * 100;
                            return (
                              <span
                                className="ml-2 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold align-middle"
                                title={`MRP ₹${mrp.toFixed(2)} • Selling ₹${item.price.toFixed(2)}`}
                              >
                                {disc.toFixed(disc >= 10 ? 0 : 1)}% off
                              </span>
                            );
                          })()}
                        </p>
                        {subLineParts.length > 0 && (
                          <p className="text-[11px] text-slate-400 mt-0.5">{subLineParts.join(' · ')}</p>
                        )}
                        {(() => {
                          const fields = categoryConfig.attributeSchema.billingDisplayFields;
                          const attrs = item.categoryAttributes as Record<string, string> | undefined;
                          if (!fields?.length || !attrs) return null;
                          const parts = fields.map((k: string) => attrs[k]).filter(Boolean);
                          if (!parts.length) return null;
                          return <p className="text-[11px] text-violet-500 dark:text-violet-400 font-medium mt-0.5">{parts.join(' · ')}</p>;
                        })()}
                        {atMax && (
                          <p className="text-[10px] text-amber-500 font-semibold mt-0.5">{t('onlyXInStock', {count: maxQty}) || `Only ${maxQty} in stock`}</p>
                        )}
                        {/* Lot/Batch badge — shown for any item with an assigned lot */}
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
                                    setBatchSelectionVariant(item.variant);
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
                        {(showExpiry || showSerial || showWarranty) && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {showExpiry && (
                              <label className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-1.5 py-0.5">
                                <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">Exp</span>
                                <input
                                  type="date"
                                  value={item.expiryDate ? String(item.expiryDate).slice(0, 10) : ''}
                                  onChange={e => updateExpiryDate(item.id, e.target.value, item.variant)}
                                  className="bg-transparent outline-none text-[11px] text-slate-700 dark:text-slate-300 min-w-0 w-28"
                                />
                              </label>
                            )}
                            {showSerial && (
                              <label className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-1.5 py-0.5">
                                <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">S/N</span>
                                <input
                                  type="text"
                                  value={item.serialNumber || ''}
                                  onChange={e => updateSerialNumber(item.id, e.target.value, item.variant)}
                                  placeholder="—"
                                  className="bg-transparent outline-none text-[11px] w-20 text-slate-700 dark:text-slate-300 min-w-0"
                                />
                              </label>
                            )}
                            {showWarranty && (
                              <label className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-1.5 py-0.5">
                                <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">Warranty</span>
                                <input
                                  type="number"
                                  min={0}
                                  value={item.warrantyDays ?? ''}
                                  onChange={e => updateWarrantyDays(item.id, Number(e.target.value) || 0, item.variant)}
                                  placeholder="—"
                                  className="bg-transparent outline-none text-[11px] w-10 text-slate-700 dark:text-slate-300 min-w-0"
                                />
                                <span className="text-[10px] text-slate-400">d</span>
                              </label>
                            )}
                          </div>
                        )}
                      </td>
                      {bizConfig.hasLiquorSpecs && (
                        <td className="px-4 py-3 text-sm font-bold text-rose-600 dark:text-rose-400 align-top">
                          {item.color || (item.variant ? splitVariantKey(item.variant).color : '') || '-'}
                        </td>
                      )}
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-col items-center gap-0.5">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => {
                              const newQty = item.quantity - (item.is_loose ? 0.5 : 1);
                              if (newQty <= 0) removeItem(item.id as any, item.variant);
                              else updateQuantity(item.id as any, newQty, item.variant);
                            }} className="w-6 h-6 flex items-center justify-center rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-red-100 hover:text-red-600 transition-colors">
                              <Minus size={14} />
                            </button>
                            <CartQuantityInput item={item} updateQuantity={updateQuantity} removeItem={removeItem} maxQty={maxQty} />
                            <button
                              onClick={() => {
                                const newQty = item.quantity + (item.is_loose ? 0.5 : 1);
                                if (typeof maxQty === 'number' && newQty > maxQty) return;
                                updateQuantity(item.id as any, newQty, item.variant);
                              }}
                              disabled={atMax}
                              title={atMax ? (t('onlyXInStock', {count: maxQty}) || `Only ${maxQty} in stock`) : undefined}
                              className="w-6 h-6 flex items-center justify-center rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-emerald-100 hover:text-emerald-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-100 dark:disabled:hover:bg-slate-800"
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                          {isDualUnit && dualUnitCfg && (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold whitespace-nowrap">
                              = {(item.quantity * dualUnitCfg.conversionFactor).toLocaleString('en-IN')} {dualUnitCfg.secondaryUnit}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right align-top">
                        {isMill
                          ? <MillRateInput item={item} updatePrice={updatePrice} updateGstPercent={updateGstPercent} isGstBill={isGstBill} />
                          : <CartPriceInput item={item} updatePrice={updatePrice} updateGstPercent={updateGstPercent} isGstBill={isGstBill} />}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-emerald-400 font-mono align-top">
                        ₹{item.total.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-center align-top">
                        <button onClick={() => removeItem(item.id as any, item.variant)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-colors opacity-100">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile View: Dedicated Touch-Friendly Cart Cards */}
            <div className="md:hidden">
              {nonLiquorCartItems.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <Scan size={44} className="mx-auto mb-3 opacity-25" />
                  <p className="text-base font-bold text-slate-700 dark:text-slate-300">{t('cartEmpty')}</p>
                  <p className="text-xs text-slate-500 mt-1">{t('cartEmptyDesc')}</p>
                </div>
              ) : (
                <div className="space-y-2 p-2">
                  {nonLiquorCartItems.map((item: any, idx: number) => {
                    const lineStock = resolveStockForItem(item, products);
                    const maxQty = lineStock.known ? lineStock.qty : undefined;
                    const atMax = typeof maxQty === 'number' && item.quantity >= maxQty;
                    const mrp = Number(item.mrp) || 0;
                    const disc = (mrp > 0 && item.price > 0 && item.price < mrp) ? ((mrp - item.price) / mrp) * 100 : 0;

                    return (
                      <div
                        key={`m-${item.id}-${item.variant}`}
                        className="px-3 py-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2.5"
                      >
                        {/* Top: Name & Delete */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 min-w-0 flex-1">
                            <span className="text-[10px] font-semibold text-slate-400 mt-0.5 shrink-0 w-4">{idx + 1}.</span>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-sm text-slate-900 dark:text-white leading-snug">
                                {item.name}
                                {disc > 0 && (
                                  <span className="ml-1.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                    {disc.toFixed(disc >= 10 ? 0 : 1)}% off
                                  </span>
                                )}
                              </p>
                              {(() => {
                                const mParts = [
                                  item.variant || null,
                                  isDualUnit && dualUnitCfg ? dualUnitCfg.primaryUnit : (item.unit || null),
                                ].filter(Boolean);
                                return mParts.length > 0
                                  ? <p className="text-[11px] text-slate-400 mt-0.5">{mParts.join(' · ')}</p>
                                  : null;
                              })()}
                              {atMax && <p className="text-[10px] text-amber-500 font-medium mt-0.5">{t('onlyXInStock', {count: maxQty}) || `Only ${maxQty} in stock`}</p>}
                            </div>
                          </div>
                          <button
                            onClick={() => removeItem(item.id as any, item.variant)}
                            className="p-1 text-slate-300 hover:text-red-500 transition-colors shrink-0"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        {/* Lot badge — shown for any item with an assigned lot (mobile card view) */}
                        {(item as any).batchId && (() => {
                          const pid = String(item.id);
                          const cachedBatches = batchCacheRef.current.get(pid);
                          const idx = cachedBatches ? cachedBatches.findIndex((b: any) => b.id === (item as any).batchId) : -1;
                          const lotLabel = (item as any).batchNumber || (idx >= 0 ? `Lot ${idx + 1}` : 'Lot 1');
                          const canChange = !cachedBatches || cachedBatches.length > 1;
                          if (!canChange) {
                            return (
                              <div className="mt-1.5 mb-1">
                                <span className="inline-flex items-center px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-medium text-slate-500">
                                  {lotLabel}
                                </span>
                              </div>
                            );
                          }
                          return (
                            <div className="mt-1.5 mb-1">
                              <button
                                type="button"
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
                                    setBatchSelectionVariant(item.variant);
                                    setBatchSelectionOptions(batches);
                                  }
                                }}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 transition-colors"
                              >
                                <span>{lotLabel}</span>
                                <span className="text-[9px] opacity-60">↕</span>
                              </button>
                            </div>
                          );
                        })()}
                        {/* Inline editable fields: Expiry / Serial / Warranty */}
                        {(showExpiry || showSerial || showWarranty) && (
                          <div className="flex flex-wrap gap-1.5">
                            {showExpiry && (
                              <label className="inline-flex items-center gap-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5">
                                <span className="text-[10px] text-slate-400 whitespace-nowrap">Exp</span>
                                <input type="date" value={item.expiryDate ? String(item.expiryDate).slice(0, 10) : ''} onChange={e => updateExpiryDate(item.id, e.target.value, item.variant)}
                                  className="bg-transparent outline-none text-[11px] w-24 text-slate-700 dark:text-slate-300" />
                              </label>
                            )}
                            {showSerial && (
                              <label className="inline-flex items-center gap-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5">
                                <span className="text-[10px] text-slate-400 whitespace-nowrap">S/N</span>
                                <input type="text" value={item.serialNumber || ''} onChange={e => updateSerialNumber(item.id, e.target.value, item.variant)} placeholder="—"
                                  className="bg-transparent outline-none text-[11px] w-16 text-slate-700 dark:text-slate-300" />
                              </label>
                            )}
                            {showWarranty && (
                              <label className="inline-flex items-center gap-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5">
                                <span className="text-[10px] text-slate-400 whitespace-nowrap">Warranty</span>
                                <input type="number" min={0} value={item.warrantyDays ?? ''} onChange={e => updateWarrantyDays(item.id, Number(e.target.value) || 0, item.variant)} placeholder="—"
                                  className="bg-transparent outline-none text-[11px] w-8 text-slate-700 dark:text-slate-300" />
                                <span className="text-[10px] text-slate-400">d</span>
                              </label>
                            )}
                          </div>
                        )}

                        {/* Rate & Qty row */}
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                          <div className="flex flex-col min-w-0">
                            <span className="text-[10px] text-slate-400 mb-0.5">{isMill ? tMill('rateExclGst') : (t('price') || 'Rate')}</span>
                            {isMill
                              ? <MillRateInput item={item} updatePrice={updatePrice} updateGstPercent={updateGstPercent} isGstBill={isGstBill} />
                              : <CartPriceInput item={item} updatePrice={updatePrice} updateGstPercent={updateGstPercent} isGstBill={isGstBill} />}
                          </div>

                          <div className="flex flex-col items-end shrink-0">
                            <span className="text-[10px] text-slate-400 mb-0.5">{t('qty') || 'Qty'}</span>
                            <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-1 py-0.5">
                              <button
                                onClick={() => {
                                  const newQty = item.quantity - (item.is_loose ? 0.5 : 1);
                                  if (newQty <= 0) removeItem(item.id as any, item.variant);
                                  else updateQuantity(item.id as any, newQty, item.variant);
                                }}
                                className="w-6 h-6 flex items-center justify-center text-slate-500 hover:text-red-600 transition-colors"
                              >
                                <Minus size={12} />
                              </button>
                              <CartQuantityInput item={item} updateQuantity={updateQuantity} removeItem={removeItem} maxQty={maxQty} />
                              <button
                                onClick={() => {
                                  const newQty = item.quantity + (item.is_loose ? 0.5 : 1);
                                  if (typeof maxQty === 'number' && newQty > maxQty) return;
                                  updateQuantity(item.id as any, newQty, item.variant);
                                }}
                                disabled={atMax}
                                className="w-6 h-6 flex items-center justify-center text-slate-500 hover:text-emerald-600 transition-colors disabled:opacity-40"
                              >
                                <Plus size={12} />
                              </button>
                            </div>
                            {isDualUnit && dualUnitCfg && (
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5 whitespace-nowrap">
                                = {(item.quantity * dualUnitCfg.conversionFactor).toLocaleString('en-IN')} {dualUnitCfg.secondaryUnit}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Total row */}
                        <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
                          {atMax ? (
                            <span className="text-[10px] text-amber-500 font-medium">{t('onlyXInStock', {count: maxQty}) || `Max ${maxQty} in stock`}</span>
                          ) : (
                            <span className="text-[10px] text-slate-400">Total</span>
                          )}
                          <span className="text-sm font-semibold text-slate-900 dark:text-white tabular-nums">
                            ₹{item.total.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
          )}
        </div>
      </div>

      {/* RIGHT PANEL: Unified Summary Card */}
      <div className="w-full md:w-72 lg:w-80 flex flex-col md:min-h-0 shrink-0">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col flex-1 md:min-h-0 md:overflow-hidden">

          {/* Pricing Mode */}
          <div className="px-4 pt-3 pb-2 border-b border-slate-100 dark:border-slate-800 shrink-0">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">{t('pricingMode') || 'Pricing Mode'}</p>
            <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg">
              <button
                onClick={() => setIsWholesale(true)}
                className={cn("flex-1 py-1.5 text-xs font-semibold rounded-md transition-all", isWholesale ? "bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300")}
              >
                {t('wholesale') || 'Wholesale'}
              </button>
              <button
                onClick={() => setIsWholesale(false)}
                className={cn("flex-1 py-1.5 text-xs font-semibold rounded-md transition-all", !isWholesale ? "bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300")}
              >
                {t('retail') || 'Retail'}
              </button>
            </div>
          </div>

          {/* Bill Type */}
          <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 shrink-0">
            <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg">
              <button
                type="button"
                onClick={() => setBillType('non_gst')}
                aria-pressed={!isGstBill}
                className={cn('flex-1 py-1.5 rounded-md text-xs font-semibold transition-all', !isGstBill ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-400')}
              >
                {t('nonGstInvoice') || 'Non-GST'}
              </button>
              <button
                type="button"
                onClick={() => { if (isMill && dupRestrictionActive) return; setBillType('gst'); }}
                disabled={isMill && dupRestrictionActive}
                title={isMill && dupRestrictionActive ? tMill('duplicateLocked') : undefined}
                aria-pressed={isGstBill}
                className={cn('flex-1 py-1.5 rounded-md text-xs font-semibold transition-all', isGstBill ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-400')}
              >
                {t('gstInvoice') || 'GST Invoice'}
              </button>
            </div>
            {isGstBill && (
              <label className="flex items-center gap-2 mt-1.5 text-[11px] text-slate-500 cursor-pointer select-none">
                <input type="checkbox" checked={gstInterState} onChange={e => setGstInterState(e.target.checked)} className="accent-slate-600" />
                {t('interStateIgst') || 'Inter-state sale (IGST)'}
              </label>
            )}
          </div>

          {/* Scrollable totals area */}
          {isMill ? (
            <div className="flex-1 md:overflow-y-auto md:min-h-0 px-4 py-3 space-y-3">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{tMill('gstAddedOnTop')}</p>
              {dupRestrictionActive && (
                <p data-testid="mill-dup-note" className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg px-2 py-1.5">{tMill('duplicateLocked')}</p>
              )}
              {/* Commercial charges & broker — right panel keeps left panel clear for cart */}
              <MillCommercialCharges
                values={millCharges}
                onChange={(k: MillChargeKey, v: string) => setMillCharges((c) => ({ ...c, [k]: v }))}
                error={millChargesParsed.error}
                disabled={isGenerating}
              />
              <BrokerField kind="customer" value={saleBroker} onChange={setSaleBroker} />
              <MillTotalsSummary
                calc={millCalc}
                itemsCount={items.length}
                collected={collectedAmount}
                balance={grandRemaining}
                discountSlot={<DiscountInput subtotal={subtotal} discount={discount} setDiscount={setDiscount} />}
              />
            </div>
          ) : (
          <div className="flex-1 md:overflow-y-auto md:min-h-0 px-4 py-3 space-y-0">

            {/* Line items */}
            <div className="flex justify-between items-center py-1.5 text-sm text-slate-600 dark:text-slate-400">
              <span>{t('itemsCount', { count: items.length })}</span>
              <span className="font-medium text-slate-800 dark:text-slate-200 tabular-nums">₹{subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center py-1.5 text-sm text-slate-600 dark:text-slate-400">
              <span>{t('discount')}</span>
              <DiscountInput subtotal={subtotal} discount={discount} setDiscount={setDiscount} />
            </div>

            {/* GST breakdown */}
            {isGstBill && items.length > 0 && (
              <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
                <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 py-0.5">
                  <span>{t('taxableValue') || 'Taxable Value'}</span>
                  <span className="tabular-nums">₹{gst.taxable.toLocaleString('en-IN')}</span>
                </div>
                {gstInterState ? (
                  <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 py-0.5"><span>IGST</span><span className="tabular-nums">₹{gst.igst.toLocaleString('en-IN')}</span></div>
                ) : (
                  <>
                    <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 py-0.5"><span>CGST</span><span className="tabular-nums">₹{gst.cgst.toLocaleString('en-IN')}</span></div>
                    <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 py-0.5"><span>SGST</span><span className="tabular-nums">₹{gst.sgst.toLocaleString('en-IN')}</span></div>
                  </>
                )}
                <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 pt-1 border-t border-slate-100 dark:border-slate-800">
                  <span>{t('totalGst') || 'Total GST'}</span>
                  <span className="tabular-nums">₹{gst.totalGst.toLocaleString('en-IN')}</span>
                </div>
              </div>
            )}

            {/* Totals block */}
            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 space-y-1.5">
              <div className="flex justify-between items-baseline">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{t('totalPayable')}</span>
                <span className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">₹{total.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-baseline text-sm text-slate-600 dark:text-slate-400">
                <span>{t('collectedAmount') || 'Collected'}</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">₹{collectedAmount.toLocaleString()}</span>
              </div>
              {remainingAmount > 0 && (
                <div className="flex justify-between items-baseline text-sm">
                  <span className="text-slate-500">{t('remainingUdhar') || 'Remaining (Udhar)'}</span>
                  <span className="font-semibold text-orange-600 dark:text-orange-400 tabular-nums">₹{remainingAmount.toLocaleString()}</span>
                </div>
              )}
              {collectedAmount > total && (
                <div className="flex justify-between items-baseline text-sm">
                  <span className="text-slate-500">{t('changeReturn') || 'Change Return'}</span>
                  <span className="font-semibold text-blue-600 dark:text-blue-400 tabular-nums">₹{(collectedAmount - total).toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>
          )}

          {/* Checkout button */}
          <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 shrink-0">
            <button
              disabled={items.length === 0}
              onClick={() => setShowCheckout(true)}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-700 dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 disabled:opacity-40 text-white rounded-lg font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              {t('checkout') || 'Checkout'}
              <span className="text-[10px] bg-white/20 dark:bg-slate-900/20 px-1.5 py-0.5 rounded font-mono">F2</span>
            </button>
          </div>
        </div>
      </div>

      {/* Manual Bill Upload */}
      {showManualBillUpload && profile?.id && (
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
            // WhatsApp is click-only via the bill modal's "Share" button.
            if (billData.customerEmail) {
              autoSendAfterBill(fullBillData, billData.customerEmail);
            }
          }}
        />
      )}

      {/* Manual Add Modal */}
      {showManualAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowManualAdd(false)} />
          <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Plus size={18} className="text-emerald-500" /> Manual Quick Add
              </h3>
              <button onClick={() => setShowManualAdd(false)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white"><X size={18} /></button>
            </div>
            <form onSubmit={handleManualAddSubmit} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Item Name</label>
                <input required autoFocus className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-1 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white"
                  value={manualProduct.name} onChange={e => setManualProduct({...manualProduct, name: e.target.value})} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">
                  Barcode {manualProduct.barcode ? <span className="text-emerald-500 normal-case font-medium">— registers this as a real product</span> : <span className="normal-case font-medium">(optional — leave blank for a one-off cart item)</span>}
                </label>
                <input className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-1 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white font-mono"
                  value={manualProduct.barcode} onChange={e => setManualProduct({...manualProduct, barcode: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Cost Price (₹)</label>
                  <input type="number" step="any" className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-1 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white"
                    value={manualProduct.costPrice} onChange={e => setManualProduct({...manualProduct, costPrice: e.target.value})} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">MRP (₹)</label>
                  <input type="number" step="any" className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-1 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white"
                    value={manualProduct.mrp} onChange={e => setManualProduct({...manualProduct, mrp: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">{isMill ? `${tMill('rateExclGst')} (₹)` : 'Selling Price (₹)'}</label>
                <input required type="number" step="any" className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-1 focus:ring-emerald-500 outline-none font-bold text-emerald-600 dark:text-emerald-400"
                  value={manualProduct.price} onChange={e => setManualProduct({...manualProduct, price: e.target.value})} />
              </div>
              <button type="submit" className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold transition-colors text-sm shadow-sm">
                {manualProduct.barcode ? 'Create Product & Add' : 'Add to Cart'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Unknown Barcode Modal — a scan that matched nothing. */}
      {unknownBarcode && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center animate-in zoom-in-95">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Scan size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Product Not Found</h3>
            <p className="text-slate-500 mb-6">No product found for barcode <strong className="text-slate-700 dark:text-slate-300">{unknownBarcode}</strong></p>
            <div className="flex gap-3">
              <button onClick={() => setUnknownBarcode(null)}
                className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-700">
                Cancel
              </button>
              <button onClick={() => {
                setManualProduct(p => ({ ...p, barcode: unknownBarcode }));
                setUnknownBarcode(null);
                setShowManualAdd(true);
              }} className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold">
                Create Product
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overdue-party inline confirmation — replaces window.confirm so it works in all browser contexts. */}
      {overdueConfirmPending && selectedParty && partyCreditHealth && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-in zoom-in-95">
            <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={24} className="text-orange-500" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white text-center mb-1">Overdue Balance</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 text-center mb-4">
              <strong>{selectedParty.name}</strong> has{' '}
              {partyCreditHealth.overdueInvoicesCount} overdue bill{partyCreditHealth.overdueInvoicesCount > 1 ? 's' : ''}{' '}
              — ₹{partyCreditHealth.overdueAmount.toLocaleString('en-IN')} pending
              {partyCreditHealth.oldestOverdueDays ? `, oldest ${partyCreditHealth.oldestOverdueDays}d past due` : ''}.
            </p>
            <div className="flex gap-3">
              <button onClick={() => { setOverdueConfirmPending(false); overdueConfirmResolveRef.current?.(false); }}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                Cancel
              </button>
              <button onClick={() => { setOverdueConfirmPending(false); overdueConfirmResolveRef.current?.(true); }}
                className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold">
                Bill Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Checkout Modal */}
      {showCheckout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCheckout(false)} />
          <div className="relative w-full max-w-md max-h-[90vh] bg-white dark:bg-slate-900 rounded-xl shadow-xl overflow-hidden flex flex-col border border-slate-200 dark:border-slate-700">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center shrink-0">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <CreditCard size={16} className="text-slate-400" /> {t('checkout') || 'Checkout'}
              </h3>
              <button onClick={() => setShowCheckout(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"><X size={18} /></button>
            </div>

            {/* Payment Method + Party grew this form well past a typical
                viewport height — needs its own scroll region so the Charges
                section and Confirm Order button at the bottom stay reachable. */}
            <form onSubmit={handleCheckout} className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
              {/* Invoice type — asked explicitly here, the last step before the bill
                  is generated, so it's never skipped by scrolling past the summary. */}
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">{t('invoiceType') || 'Invoice Type'}</label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-950 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setBillType('non_gst')}
                    aria-pressed={!isGstBill}
                    className={cn('py-2.5 rounded-lg text-xs font-bold transition-all', !isGstBill ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500')}
                  >
                    {t('nonGstInvoice') || 'Non-GST Invoice'}
                  </button>
                  <button
                    type="button"
                onClick={() => { if (isMill && dupRestrictionActive) return; setBillType('gst'); }}
                disabled={isMill && dupRestrictionActive}
                title={isMill && dupRestrictionActive ? tMill('duplicateLocked') : undefined}
                    aria-pressed={isGstBill}
                    className={cn('py-2.5 rounded-lg text-xs font-bold transition-all', isGstBill ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500')}
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

              {/* Party (mandatory in Wholesale pricing mode) vs. a plain
                  customer name (Retail pricing mode) — some Udyog shops also
                  run counter sales to walk-in residential customers who
                  don't need a formal Party/CRM record. */}
              {!isWholesale ? (
                <div className="relative">
                  <label className="text-xs font-bold text-slate-500 mb-1 block">
                    {t('customerNameLabel') || 'Customer Name'}
                    {grandRemaining > 0 && <span className="text-orange-500 ml-1 normal-case font-normal">*{t('requiredForUdhar') || 'Required for Udhar'}</span>}
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 outline-none text-slate-900 dark:text-white transition-all"
                    value={customerName}
                    onChange={e => { setCustomerName(e.target.value); setShowUdharDropdown(true); }}
                    onFocus={() => setShowUdharDropdown(true)}
                    onBlur={() => setTimeout(() => setShowUdharDropdown(false), 200)}
                    placeholder={t('customerNamePlaceholder') || 'e.g. Walk-in Customer'}
                  />
                  {showUdharDropdown && filteredUdharCustomers.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                      {filteredUdharCustomers.map(c => {
                        const { lastDate, daysLeft, overdue, soon } = udharDueInfo(c);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 border-b border-slate-100 dark:border-slate-700 last:border-0"
                            onMouseDown={() => selectUdharCustomer(c)}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">{c.name}</span>
                              {!!(c.totalDue || 0) && <span className="text-[10px] text-orange-500 font-semibold shrink-0">₹{(c.totalDue || 0).toLocaleString()} {t('due') || 'due'}</span>}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                              <span>{c.mobile || t('noMobile') || 'No mobile'}</span>
                              {lastDate && (
                                <span>· {new Date(lastDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                              )}
                              {daysLeft !== null && (c.totalDue || 0) > 0 && (
                                <span className={cn(
                                  'font-bold px-1.5 py-0.5 rounded-full',
                                  overdue ? 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300'
                                    : soon ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300'
                                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                                )}>
                                  {overdue ? `${Math.abs(daysLeft)}d ${t('overdue') || 'overdue'}` : `${daysLeft}d ${t('left') || 'left'}`}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {customerName.trim() && grandRemaining > 0 && (
                    <p className={cn('text-[11px] mt-1.5 flex items-center gap-1', matchedUdharCustomer ? 'text-emerald-600 dark:text-emerald-400' : 'text-orange-500')}>
                      {matchedUdharCustomer
                        ? (t('foundInUdharKhata', { amount: grandRemaining.toLocaleString() }) || `Existing customer — ₹${grandRemaining.toLocaleString()} will be added to their account.`)
                        : (t('newUdharCustomer', { amount: grandRemaining.toLocaleString() }) || `New customer will be created with ₹${grandRemaining.toLocaleString()} due.`)}
                    </p>
                  )}
                  <div className="mt-3">
                    <label className="text-xs font-bold text-slate-500 mb-1 block">
                      {t('cityAddressLabel') || 'City / Address'} <span className="text-slate-400 normal-case font-normal">({t('optional') || 'optional'})</span>
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 outline-none text-slate-900 dark:text-white transition-all"
                      value={customerAddress}
                      onChange={e => setCustomerAddress(e.target.value)}
                      placeholder={t('cityAddressPlaceholder') || 'e.g. Pune, or full address'}
                    />
                  </div>
                </div>
              ) : (
              <div className="relative">
                <label className="text-xs font-bold text-slate-500 mb-1 block">
                  {t('party') || 'Party'}
                  <span className="text-red-500 ml-1">*</span>
                </label>
                {selectedParty ? (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 text-sm">
                          <Building2 size={13} className="text-slate-400 shrink-0" />
                          <span className="truncate">{selectedParty.name}</span>
                        </div>
                        {selectedParty.gst && <div className="text-[11px] text-slate-500 mt-0.5">GSTIN: {selectedParty.gst}</div>}
                      </div>
                      <button type="button" onClick={() => { setSelectedParty(null); setPartyCreditHealth(null); }} className="text-slate-400 hover:text-red-500 shrink-0"><X size={16} /></button>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs flex-wrap">
                      <span className="text-orange-600 dark:text-orange-400 font-semibold">{t('outstanding') || 'Outstanding'}: ₹{(selectedParty.totalDue || 0).toLocaleString()}</span>
                      {!!selectedParty.creditLimit && <span className="text-slate-500">{t('creditLimit') || 'Credit Limit'}: ₹{selectedParty.creditLimit.toLocaleString()}</span>}
                    </div>
                    {/* Credit-health badge — soft warning, never blocks the UI
                        by itself (matches the existing Supplier credit-health
                        pattern); the server still hard-rejects a sale that
                        would push outstanding past creditLimit
                        (billing/route.ts), so this is purely "know before you
                        bill" visibility, plus the new creditDays/overdue
                        signal that had no equivalent anywhere before. */}
                    {loadingPartyCredit && (
                      <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Checking credit status…</div>
                    )}
                    {!loadingPartyCredit && partyCreditHealth && (partyCreditHealth.overLimitBy > 0 || partyCreditHealth.overdueAmount > 0) && (
                      <div className="mt-2 space-y-1">
                        {partyCreditHealth.overLimitBy > 0 && (
                          <div className="flex items-center gap-1.5 text-[11px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-2 py-1.5">
                            <AlertCircle size={12} className="shrink-0" />
                            Credit limit exceeded by ₹{partyCreditHealth.overLimitBy.toLocaleString()} — new bill will be blocked unless within limit
                          </div>
                        )}
                        {partyCreditHealth.overdueAmount > 0 && (
                          <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg px-2 py-1.5">
                            <AlertCircle size={12} className="shrink-0" />
                            {partyCreditHealth.overdueInvoicesCount} bill{partyCreditHealth.overdueInvoicesCount > 1 ? 's' : ''} overdue (₹{partyCreditHealth.overdueAmount.toLocaleString()}, oldest {partyCreditHealth.oldestOverdueDays}d past due)
                          </div>
                        )}
                      </div>
                    )}
                    {!loadingPartyCredit && partyCreditHealth && partyCreditHealth.availableCredit !== null && partyCreditHealth.overLimitBy === 0 && (
                      <div className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                        Available credit: ₹{partyCreditHealth.availableCredit.toLocaleString()}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 outline-none text-slate-900 dark:text-white transition-all"
                        value={partySearch}
                        onChange={e => { setPartySearch(e.target.value); setShowPartyDropdown(true); }}
                        onFocus={() => setShowPartyDropdown(true)}
                        onBlur={() => setTimeout(() => setShowPartyDropdown(false), 200)}
                        placeholder={t('searchParty') || 'Search party by name or mobile'} />
                    </div>
                    {showPartyDropdown && parties.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                        {parties
                          .filter(p => p.name.toLowerCase().includes(partySearch.toLowerCase()) || (p.mobile || '').includes(partySearch))
                          .map(p => (
                            <button
                              key={p.id}
                              type="button"
                              className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 border-b border-slate-100 dark:border-slate-700 last:border-0"
                              onMouseDown={() => selectParty(p)}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-sm text-slate-900 dark:text-slate-100">{p.name}</span>
                                {!!(p.totalDue || 0) && <span className="text-[10px] text-orange-500 font-semibold">₹{(p.totalDue || 0).toLocaleString()} due</span>}
                              </div>
                              <div className="text-xs text-slate-500">{p.mobile || 'No mobile'}{p.gst ? ` • ${p.gst}` : ''}</div>
                            </button>
                          ))}
                        {parties.filter(p => p.name.toLowerCase().includes(partySearch.toLowerCase())).length === 0 && (
                          <div className="px-3 py-3 text-xs text-slate-500 text-center">
                            {t('noPartiesFound') || 'No matching party. Add one from the Parties page.'}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">{t('mobileLabel') || 'Mobile'}</label>
                  <input type="tel" className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 outline-none text-slate-900 dark:text-white transition-all"
                    value={customerMobile} onChange={e => setCustomerMobile(e.target.value)} placeholder={t('waPlaceholder') || "WhatsApp number for bill"} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">{t('emailLabel') || 'Email'}</label>
                  <input type="email" className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 outline-none text-slate-900 dark:text-white transition-all"
                    value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder={t('emailPlaceholder') || "For auto email bill receipt"} />
                </div>
              </div>

              {/* Payment Method */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                <label className="text-[11px] font-medium text-slate-400 mb-2.5 block text-center uppercase tracking-wider">
                  {t('paymentMethod') || 'Payment Method'} · ₹{grandTotal.toLocaleString()}
                </label>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {([
                    ['cash', t('cash') || 'Cash', Wallet],
                    ['upi', t('upi') || 'UPI', Smartphone],
                    ['bank', t('bankTransfer') || 'Bank Transfer', Landmark],
                    ['cheque', t('cheque') || 'Cheque', FileText],
                    ['credit', t('credit') || 'Credit', Calendar],
                    ['mixed', t('mixed') || 'Mixed', CalcIcon],
                  ] as [WholesalePaymentMethod, string, any][]).map(([key, label, Icon]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPaymentMethod(key)}
                      className={cn(
                        'flex flex-col items-center justify-center gap-1 py-2.5 rounded-lg border text-[11px] font-semibold transition-all',
                        paymentMethod === key
                          ? 'bg-slate-900 border-slate-900 text-white dark:bg-white dark:border-white dark:text-slate-900 shadow-sm'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500'
                      )}
                    >
                      <Icon size={16} />
                      {label}
                    </button>
                  ))}
                </div>

                {/* Single-method Received Amount — one field maps straight onto
                    the engine's split state via the sync effect above. */}
                {(paymentMethod === 'cash' || paymentMethod === 'upi' || paymentMethod === 'bank' || paymentMethod === 'cheque') && (
                  <div className="space-y-3 mb-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">{t('receivedAmount') || 'Received Amount'}</label>
                      <input type="number" min={0} max={grandTotal} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 outline-none font-mono font-semibold text-slate-900 dark:text-white"
                        value={collectedAmount === 0 ? '' : collectedAmount} placeholder="0"
                        onChange={e => {
                          const val = e.target.value === '' ? 0 : Math.max(0, Math.min(grandTotal, Number(e.target.value)));
                          const key = paymentMethod === 'cheque' ? 'bank' : paymentMethod;
                          setSplitPayments({ cash: 0, upi: 0, card: 0, bank: 0, [key]: val });
                        }} />
                    </div>
                    {paymentMethod === 'upi' && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">{t('upiApp') || 'UPI App'}</label>
                          <select className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 outline-none text-slate-900 dark:text-white"
                            value={upiApp} onChange={e => setUpiApp(e.target.value)}>
                            <option value="">{t('select') || 'Select'}</option>
                            <option value="Google Pay">Google Pay</option>
                            <option value="PhonePe">PhonePe</option>
                            <option value="BHIM">BHIM</option>
                            <option value="Paytm">Paytm</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">{t('transactionId') || 'Transaction ID'}</label>
                          <input className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 outline-none text-slate-900 dark:text-white"
                            value={upiTxnId} onChange={e => setUpiTxnId(e.target.value)} placeholder="UTR / Ref no." />
                        </div>
                      </div>
                    )}
                    {paymentMethod === 'bank' && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">{t('bank') || 'Bank'}</label>
                          <input className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 outline-none text-slate-900 dark:text-white"
                            value={bankName} onChange={e => setBankName(e.target.value)} placeholder="e.g. HDFC" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">{t('referenceNo') || 'Reference No.'}</label>
                          <input className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 outline-none text-slate-900 dark:text-white"
                            value={bankRefNo} onChange={e => setBankRefNo(e.target.value)} placeholder="UTR" />
                        </div>
                      </div>
                    )}
                    {paymentMethod === 'cheque' && (
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">{t('chequeNo') || 'Cheque No.'}</label>
                          <input className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 outline-none text-slate-900 dark:text-white"
                            value={chequeNo} onChange={e => setChequeNo(e.target.value)} />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">{t('chequeDate') || 'Cheque Date'}</label>
                          <input type="date" className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 outline-none text-slate-900 dark:text-white"
                            value={chequeDate} onChange={e => setChequeDate(e.target.value)} />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">{t('bank') || 'Bank'}</label>
                          <input className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 outline-none text-slate-900 dark:text-white"
                            value={chequeBank} onChange={e => setChequeBank(e.target.value)} />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {paymentMethod === 'mixed' && (
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                      {t('cash') || 'Cash'}
                    </label>
                    <input type="number" min={0} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 outline-none font-mono font-semibold text-slate-900 dark:text-white"
                      value={splitPayments.cash === 0 ? '' : splitPayments.cash} placeholder="0"
                      onChange={e => setSplitPayments(p => ({ ...p, cash: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)) }))} />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                      {t('upi') || 'UPI'}
                    </label>
                    <input type="number" min={0} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 outline-none font-mono font-semibold text-slate-900 dark:text-white"
                      value={splitPayments.upi === 0 ? '' : splitPayments.upi} placeholder="0"
                      onChange={e => setSplitPayments(p => ({ ...p, upi: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)) }))} />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                      {t('bank') || 'Bank'}
                    </label>
                    <input type="number" min={0} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 outline-none font-mono font-semibold text-slate-900 dark:text-white"
                      value={splitPayments.bank === 0 ? '' : splitPayments.bank} placeholder="0"
                      onChange={e => setSplitPayments(p => ({ ...p, bank: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)) }))} />
                  </div>
                </div>
                )}

                {grandRemaining > 0 && (
                  <div className="flex justify-between items-center bg-orange-50 dark:bg-orange-500/10 px-3 py-2.5 rounded-lg border border-orange-200 dark:border-orange-500/20 mb-2">
                    <span className="text-xs font-bold text-orange-600 dark:text-orange-400">{t('remainingUdhar') || 'Remaining (Udhar)'}</span>
                    <span className="text-sm font-black text-orange-600 dark:text-orange-400 font-mono">₹{grandRemaining.toLocaleString()}</span>
                  </div>
                )}
                {collectedAmount > grandTotal && (
                  <div className="flex justify-between items-center bg-blue-50 dark:bg-blue-500/10 px-3 py-2.5 rounded-lg border border-blue-200 dark:border-blue-500/20 mb-2">
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{t('changeReturn') || 'Change Return'}</span>
                    <span className="text-sm font-black text-blue-600 dark:text-blue-400 font-mono">₹{(collectedAmount - grandTotal).toLocaleString()}</span>
                  </div>
                )}

                {/* Credit Days + Due Date — shown whenever any part of the bill
                    (including charges) is going unpaid, regardless of which
                    method covers the rest. */}
                {grandRemaining > 0 && (
                  <div className="grid grid-cols-2 gap-3 mt-1">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">{t('creditDays') || 'Credit Days'}</label>
                      <input type="number" min={0} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 outline-none font-mono font-semibold text-slate-900 dark:text-white"
                        value={creditDays} onChange={e => setCreditDays(Math.max(0, Number(e.target.value) || 0))} />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block flex items-center gap-1"><Calendar size={11} /> {t('dueDate') || 'Due Date'}</label>
                      <div className="w-full px-3 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono font-bold text-slate-700 dark:text-slate-300">
                        {new Date(Date.now() + creditDays * 86400000).toLocaleDateString('en-IN')}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Charges — folded into the invoice as extra line items on save */}
              {!isMill && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                <label className="text-[11px] font-medium text-slate-400 mb-2.5 flex items-center gap-1.5 uppercase tracking-wider">
                  <Truck size={12} /> {t('charges') || 'Charges'}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    ['transport', t('transport') || 'Transport'],
                    ['loading', t('loading') || 'Loading'],
                    ['packing', t('packing') || 'Packing'],
                    ['other', t('otherCharges') || 'Other Charges'],
                  ] as [keyof typeof charges, string][]).map(([key, label]) => (
                    <div key={key}>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">{label}</label>
                      <input type="number" min={0} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 outline-none font-mono text-slate-900 dark:text-white"
                        value={charges[key]} placeholder="0"
                        onChange={e => setCharges(c => ({ ...c, [key]: e.target.value }))} />
                    </div>
                  ))}
                </div>
              </div>
              )}

              <button
                type="submit"
                disabled={isGenerating}
                className="w-full bg-slate-900 hover:bg-slate-700 dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 text-white font-semibold py-3 rounded-lg transition-all active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100 flex justify-center items-center gap-2 text-sm"
              >
                {isGenerating ? <><Loader2 size={18} className="animate-spin" /> {t('generating') || 'Generating...'}</> : <><CheckCircle size={18} /> {t('confirmOrder') || 'Confirm Order'}</>}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Bill Success Modal (Simplified representation) */}
      {/* Mill Billing: server-generated breakdown after save. Print/PDF/WhatsApp are disabled here on purpose (next phase). */}
      {millSaved && (
        <MillBillSavedModal bill={millSaved} customerName={millSaved._customerName} onClose={() => setMillSaved(null)} />
      )}

      {showBillModal && lastBill && (() => {
        const isA4Bill = lastBill.invoiceFormat === 'a4' || lastBill.invoiceFormat === 'wholesale';
        return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowBillModal(false)} />
          <div className={`relative w-full ${isA4Bill ? 'max-w-3xl' : 'max-w-sm'} bg-white dark:bg-slate-900 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200`}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <span className="text-emerald-500 font-black text-lg flex items-center gap-2">
                <CheckCircle size={22} /> Bill Generated!
              </span>
              <button onClick={() => { setShowBillModal(false); setWaWebFallbackUrl(null); setSendStatus(null); }} className="text-slate-500 hover:text-slate-900 transition-colors">
                <X size={24} />
              </button>
            </div>

            {/* Scrollable Bill Preview */}
            <div id="print-area" className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-900 p-4">
              <div className={`bg-white border border-slate-200 shadow-sm mx-auto rounded ${isA4Bill ? 'max-w-full' : 'max-w-sm'}`}>
                <BillSlip
                  {...lastBill}
                  storeName={profile.shopName || user?.storeName || 'Wholesale Store'}
                  storeAddress={profile.address}
                  storeMobile={profile.mobile}
                  logoUrl={profile.logoUrl}
                  gst={profile.gst || undefined}
                  pan={profile.pan || undefined}
                  bankName={profile.bankName || undefined}
                  bankAccountName={profile.bankAccountName || undefined}
                  bankAccountNumber={profile.bankAccountNumber || undefined}
                  bankIfsc={profile.bankIfsc || undefined}
                  billingDisplayFields={categoryConfig.attributeSchema.billingDisplayFields}
                  dualUnitConfig={catSchema.dualUnitConfig}
                  ref={componentRef}
                />
              </div>
            </div>

            {/* Sticky footer */}
            <div className="flex-shrink-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 space-y-3">
              {/* WhatsApp is click-only now (via the "Share" action button
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

              {/* Email status */}
              {sendStatus?.email !== undefined && sendStatus.email !== undefined && (
                <div className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm transition-colors">
                  {sendStatus.email === null ? (
                    <span className="text-slate-600 dark:text-slate-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Sending email...</span>
                  ) : sendStatus.email ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">✓ Email sent successfully</span>
                  ) : (
                    <span className="text-red-500 dark:text-red-400">Failed to send email</span>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={async () => {
                    if (componentRef.current) await waitForQrCode(componentRef.current, !!profile.upiId);
                    // Keep modal in DOM while the browser renders the print layout,
                    // then close it once the dialog is dismissed.
                    window.onafterprint = () => { setShowBillModal(false); window.onafterprint = null; };
                    printBill();
                  }}
                  className="flex flex-col items-center justify-center gap-1 bg-emerald-500 text-white dark:text-slate-900 py-3 rounded-xl font-bold hover:bg-emerald-600 transition-colors shadow-sm"
                >
                  <Printer size={20} /> Print
                </button>
                <button
                  onClick={handleDownloadPDF}
                  className="flex flex-col items-center justify-center gap-1 bg-blue-500 text-white py-3 rounded-xl font-bold hover:bg-blue-600 transition-colors shadow-sm"
                >
                  <Download size={20} /> PDF
                </button>
                <button
                  onClick={handleWhatsAppPDF}
                  disabled={isSharing}
                  className="flex flex-col items-center justify-center gap-1 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 py-3 rounded-xl font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors disabled:opacity-70 shadow-sm"
                >
                  {isSharing ? <Loader2 size={20} className="animate-spin" /> : <MessageCircle size={20} />}
                  {isSharing ? 'Sharing...' : 'Share'}
                </button>
              </div>

              <button
                onClick={() => { setShowBillModal(false); clearCart(); }}
                className="w-full mt-2 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-colors"
              >
                New Bill
              </button>
            </div>
          </div>
        </div>
        );
      })()}

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
                          <span>₹{isWholesale ? rec.wholesaleCost : rec.sellingPrice}</span>
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
               {/* Optional Force Add if needed by owner, uncomment if user wants it */}
               {/* <button onClick={() => { addToCart(outOfStockItem, undefined, true); setOutOfStockItem(null); }} className="px-4 py-2 text-rose-600 font-bold hover:bg-rose-50 rounded-xl transition-colors">Force Add</button> */}
               <div className="flex-1"></div>
               <button onClick={() => setOutOfStockItem(null)} className="px-6 py-2 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition-colors">
                 Close
               </button>
            </div>
          </div>
        </div>
      )}

      {variantSelectionProduct && (() => {
        const product = variantSelectionProduct;
        const variants: any[] = product.variants || [];
        const schema = categoryConfig.attributeSchema;
        const axes = schema.variantAxes.length > 0 ? schema.variantAxes : null;

        // Helper: get the value of a given axis key from a variant row
        const getAxisVal = (v: any, key: string) =>
          key === 'color' ? (v.color ?? '') : key === 'size' ? (v.size ?? '') : (v.extraAttrs?.[key] ?? '');

        // For each axis, collect the distinct non-empty options present in variants
        const axisOptions: Record<string, string[]> = {};
        if (axes) {
          axes.forEach((key: string) => {
            const vals = [...new Set(variants.map(v => getAxisVal(v, key)).filter(Boolean))];
            axisOptions[key] = vals as string[];
          });
        }

        // Only show axes that actually have values in THIS product's variants.
        // Footwear schema may have ['color','size'] but a product sold only in
        // sizes → Color axis has zero options → user can never reach allSelected.
        const effectiveAxes = axes
          ? axes.filter((key: string) => (axisOptions[key] || []).length > 0)
          : null;

        // Find the variant row that exactly matches current selections
        const matchedVariant = effectiveAxes
          ? variants.find(v => effectiveAxes.every((key: string) => {
              const sel = variantPickerSelections[key];
              return !sel || getAxisVal(v, key) === sel;
            }) && effectiveAxes.every((key: string) => variantPickerSelections[key]))
          : null;
        const allSelected = effectiveAxes ? effectiveAxes.every((key: string) => !!variantPickerSelections[key]) : false;
        const matchedKey = matchedVariant ? variantRowKey(matchedVariant) : null;
        const matchedStock = matchedVariant ? Math.max(0, Number(matchedVariant.stock) || 0) : 0;
        const matchedOut = allSelected && matchedStock <= 0;
        const matchedPrice = matchedVariant
          ? (Number(matchedVariant.wholesalePrice) || Number(matchedVariant.sellingPrice) || Number(matchedVariant.mrp) || 0)
          : 0;

        // Axis label lookup from schema.attributes
        const getAxisLabel = (key: string) =>
          schema.attributes.find((a: any) => a.key === key)?.label ?? key;

        // Which options are available given the OTHER axes already selected
        const availableFor = (axisKey: string): Set<string> => {
          if (!axes) return new Set();
          const compatible = variants.filter(v =>
            axes.every((k: string) => {
              if (k === axisKey) return true;
              const sel = variantPickerSelections[k];
              return !sel || getAxisVal(v, k) === sel;
            })
          );
          return new Set(compatible.map(v => getAxisVal(v, axisKey)).filter(Boolean));
        };

        const closePicker = () => {
          setVariantSelectionProduct(null);
          setVariantPickerSelections({});
        };

        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closePicker} />
            <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <span className="font-bold text-slate-900 dark:text-white block">{product.name}</span>
                  {product.category && <span className="text-xs text-slate-400">{product.category}</span>}
                </div>
                <button onClick={closePicker} className="text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
                  <X size={22} />
                </button>
              </div>

              <div className="p-5 overflow-y-auto space-y-5">
                {effectiveAxes ? (
                  /* ── Dynamic axis picker ─────────────────────────── */
                  <>
                    {effectiveAxes.map((axisKey: string) => {
                      const opts = axisOptions[axisKey] || [];
                      const available = availableFor(axisKey);
                      const selected = variantPickerSelections[axisKey];
                      const label = getAxisLabel(axisKey);
                      return (
                        <div key={axisKey}>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                            {label}
                            {selected && <span className="ml-2 text-emerald-500 normal-case font-semibold tracking-normal">{selected}</span>}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {opts.map(opt => {
                              const isAvail = available.has(opt);
                              const isSel = selected === opt;
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  disabled={!isAvail}
                                  onClick={() => setVariantPickerSelections(prev => ({ ...prev, [axisKey]: isSel ? '' : opt }))}
                                  className={cn(
                                    'px-3 py-1.5 rounded-lg border text-sm font-semibold transition-colors',
                                    isSel
                                      ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm'
                                      : isAvail
                                        ? 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                                        : 'opacity-30 cursor-not-allowed border-slate-100 dark:border-slate-800 text-slate-400'
                                  )}
                                >
                                  {axisKey === 'color' && (
                                    <span
                                      className="inline-block w-2.5 h-2.5 rounded-full border border-slate-300/60 mr-1.5 align-middle"
                                      style={{ backgroundColor: opt.toLowerCase() }}
                                    />
                                  )}
                                  {opt}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}

                    {/* Matched variant summary */}
                    {allSelected && (
                      <div className={cn(
                        'rounded-xl border p-3 flex items-center justify-between',
                        matchedOut
                          ? 'border-rose-200 bg-rose-50 dark:bg-rose-900/20 dark:border-rose-800'
                          : 'border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800'
                      )}>
                        <div>
                          <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                            {effectiveAxes.map((k: string) => variantPickerSelections[k]).filter(Boolean).join(' / ')}
                          </p>
                          <p className={cn('text-xs mt-0.5', matchedOut ? 'text-rose-500 font-semibold' : 'text-slate-500')}>
                            {matchedVariant
                              ? (matchedOut ? 'Out of stock' : `${matchedStock} in stock`)
                              : 'No matching variant'}
                          </p>
                        </div>
                        {matchedPrice > 0 && !matchedOut && (
                          <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">₹{matchedPrice.toFixed(2)}</p>
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={!allSelected || !matchedVariant || matchedOut}
                      onClick={() => {
                        if (!matchedKey) return;
                        closePicker();
                        addToCart(product, matchedKey);
                      }}
                      className={cn(
                        'w-full py-3 rounded-xl font-bold text-sm transition-colors',
                        allSelected && matchedVariant && !matchedOut
                          ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-md'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                      )}
                    >
                      {!allSelected ? `Select ${effectiveAxes!.map(getAxisLabel).join(' & ')}` : matchedOut ? 'Out of Stock' : 'Add to Cart'}
                    </button>
                  </>
                ) : (
                  /* ── Fallback: flat grid (no axes configured) ────── */
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {variants.map((v: any, i: number) => {
                      const key = variantRowKey(v);
                      const stock = Math.max(0, Number(v.stock) || 0);
                      const out = stock <= 0;
                      return (
                        <button
                          key={i}
                          type="button"
                          disabled={out}
                          onClick={() => { closePicker(); addToCart(product, key); }}
                          className={cn(
                            'p-3 rounded-xl border text-left transition-colors',
                            out
                              ? 'opacity-40 cursor-not-allowed border-slate-200 dark:border-slate-800'
                              : 'border-slate-200 dark:border-slate-700 hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                          )}
                        >
                          <div className="flex items-center gap-1.5 font-bold text-sm text-slate-900 dark:text-white">
                            {v.color && <span className="w-3 h-3 rounded-full border border-slate-300 shrink-0" style={{ backgroundColor: v.color.toLowerCase() }} />}
                            {[v.color, v.size].filter(Boolean).join(' / ') || `#${i + 1}`}
                          </div>
                          <div className={cn('text-xs mt-1', out ? 'text-rose-500 font-bold' : 'text-slate-500')}>
                            {out ? 'Out of stock' : `${stock} in stock`}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Lot / Batch Picker — same product/variant can have lots bought at
          different real costs; picking here decides which lot's stock/cost
          this line draws from (sent as batch_id). */}
      {batchSelectionProduct && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setBatchSelectionProduct(null); setBatchSelectionOptions([]); }} />
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-xl flex flex-col max-h-[85vh] overflow-hidden border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <span className="font-semibold text-slate-900 dark:text-white text-sm block">Change Lot</span>
                <span className="text-[11px] text-slate-500">
                  {batchSelectionProduct.name}
                  {batchSelectionVariant && ` · ${batchSelectionVariant}`}
                </span>
              </div>
              <button onClick={() => { setBatchSelectionProduct(null); setBatchSelectionOptions([]); }} className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-3 overflow-y-auto space-y-1.5">
              <p className="text-[11px] text-slate-400 mb-2">Oldest lot is recommended — sell it first so older stock doesn't sit. Profit is calculated from each lot's purchase cost.</p>
              {batchSelectionOptions.map((b, idx) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    const chosen = batchSelectionProduct; const chosenVariant = batchSelectionVariant;
                    setBatchSelectionProduct(null); setBatchSelectionOptions([]);
                    const gstPercent = Number(chosen.gstPercent ?? chosen.gst_percent ?? 0) || 0;
                    const linePrice = getPrice(chosen, chosenVariant);
                    const reconciledCost = Number(b.costPrice) > 0 ? Number(b.costPrice) : getShopCost(chosen, chosenVariant);
                    setLineBatch(chosen.id, chosenVariant, {
                      batchId: b.id,
                      batchNumber: b.batchNumber,
                      cost: reconciledCost,
                      profit: (linePrice / (1 + gstPercent / 100)) - reconciledCost,
                    });
                  }}
                  className="w-full text-left p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                      {b.batchNumber || `Lot ${idx + 1}`}
                      {idx === 0 && <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-slate-900 dark:bg-white text-white dark:text-slate-900">FIFO ↑</span>}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {b.quantity} in stock
                      {b.purchaseDate && ` · bought ${new Date(b.purchaseDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white shrink-0 tabular-nums">₹{Number(b.costPrice || 0).toLocaleString('en-IN')}/unit</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Camera scanner overlay — continuous, since billing is a rapid run of
          items and reopening per product would be unusable at a counter. */}
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

      {/* Scan confirmation — pairs with the beep. */}
      {scanFeedback && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            'fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] px-5 py-3 rounded-2xl shadow-2xl border flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 pointer-events-none',
            scanFeedback.status === 'ok' ? 'bg-emerald-600 border-emerald-500 text-white'
              : scanFeedback.status === 'error' ? 'bg-red-600 border-red-500 text-white'
              : 'bg-slate-800 border-slate-700 text-white',
          )}
        >
          <span className="font-bold text-sm max-w-[60vw] truncate">
            {scanFeedback.status === 'ok' ? '✓ ' : scanFeedback.status === 'error' ? '✕ ' : '⋯ '}
            {scanFeedback.text}
          </span>
        </div>
      )}
    </div>
  );
}
