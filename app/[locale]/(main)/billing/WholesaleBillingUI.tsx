'use client';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/lib/store';
import { useBillingEngine } from '@/lib/hooks/useBillingEngine';
import { useBusinessStore } from '@/lib/businessStore';
import { performSmartSearch } from '@/lib/smartSearch';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { useBarcodeScanner, playScanBeep, matchProductByCode } from '@/lib/useBarcodeScanner';
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
import { uploadInvoiceToSupabase } from '@/lib/supabaseStorage';
import { computeGst } from '@/lib/gst';
import { waitForImages, waitForQrCode } from '@/lib/waitForImages';
import { generateUpiQrSvg } from '@/lib/upi';
import ManualBillUpload from '@/components/ManualBillUpload';
import DiscountInput from '@/components/DiscountInput';
import { splitVariantKey } from '@/components/ColorSizeVariantGrid';

// Resolve a product's sellable stock from whatever shape it arrives in.
// Returns { known } = whether stock could be determined at all, and { qty } =
// the amount. A sale is only blocked as "out of stock" when known && qty <= 0 —
// a product with no stock field present is treated as unknown (allowed), so we
// never falsely flag items that simply came from an incomplete source.
function resolveStock(p: any): { known: boolean; qty: number } {
  if (!p) return { known: false, qty: 0 };
  let sv: any = p.size_variants ?? p.sizeVariants;
  if (typeof sv === 'string') { try { sv = JSON.parse(sv); } catch { sv = null; } }
  if (sv && typeof sv === 'object' && Object.keys(sv).length > 0) {
    const sum = Object.values(sv).reduce((t: number, v: any) => t + (Number(v) || 0), 0);
    return { known: true, qty: sum };
  }
  const raw = p.currentStock ?? p.current_stock ?? p.stock;
  if (raw === undefined || raw === null || raw === '') return { known: false, qty: 0 };
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
        if (!isNaN(num)) {
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

const CartPriceInput = ({ item, updatePrice }: any) => {
  const [localVal, setLocalVal] = useState(item.price.toString());
  useEffect(() => {
    setLocalVal(item.price.toString());
  }, [item.price]);

  return (
    <input
      type="number"
      className="w-20 text-right py-1 px-2 bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-emerald-500 rounded font-mono text-sm outline-none transition-colors"
      value={localVal}
      onChange={(e) => {
        setLocalVal(e.target.value);
        const num = Number(e.target.value);
        if (!isNaN(num)) {
          updatePrice(item.id, num, item.variant);
        }
      }}
      onBlur={(e) => {
        const num = Number(e.target.value);
        if (e.target.value === '') updatePrice(item.id, 0, item.variant);
        setLocalVal(num.toString());
      }}
      step="any"
      min="0"
    />
  );
};

export default function WholesaleBillingUI() {
  const t = useTranslations('Billing');
  const tBill = useTranslations('BillSlip');
  const { user } = useAuthStore();
  const { profile } = useBusinessStore();

  const { 
    items, addItem, removeItem, updateQuantity, updatePrice, clearCart,
    subtotal, discount, setDiscount, total,
    splitPayments, setSplitPayments, collectedAmount, remainingAmount 
  } = useBillingEngine(profile?.id);

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
  const [manualProduct, setManualProduct] = useState({ name: '', costPrice: '', mrp: '', price: '', unit: 'Unit', variant: '' });

  const handleManualAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualProduct.name || !manualProduct.price) return;
    const sellingPrice = Number(manualProduct.price) || 0;
    const costPrice = Number(manualProduct.costPrice) || 0;
    const mrp = Number(manualProduct.mrp) || sellingPrice;

    addToCart({
      name: manualProduct.name,
      sellingPrice,
      wholesaleCost: costPrice,
      mrp,
      baseUnit: manualProduct.unit,
      isManualItem: true,
    }, manualProduct.variant || undefined);

    setManualProduct({ name: '', costPrice: '', mrp: '', price: '', unit: 'Unit', variant: '' });
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
  // Retail pricing mode (isWholesale === false): a wholesaler selling counter
  // sales to a walk-in residential customer shouldn't need a formal Party/CRM
  // record — just a plain name, same as Dukan/Vyapar retail billing.
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');

  const fetchParties = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const res = await api.get(`/crm/customers?type=party&_shop=${profile.id}`);
      setParties(Array.isArray(res.data) ? res.data : []);
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
  };

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
  const grandTotal = total + chargesTotal;
  const grandRemaining = Math.max(0, grandTotal - collectedAmount);

  const [isGenerating, setIsGenerating] = useState(false);

  // Bill Success Modal
  const [showBillModal, setShowBillModal] = useState(false);
  const [lastBill, setLastBill] = useState<any>(null);
  
  // Auto-send states
  const [sendStatus, setSendStatus] = useState<{ email: boolean | null } | null>(null);
  const [waUrl, setWaUrl] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);

  // Recommendations / Out of Stock
  const [outOfStockItem, setOutOfStockItem] = useState<any>(null);
  const [recommendedProducts, setRecommendedProducts] = useState<any[]>([]);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const componentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchProducts();
    fetchParties();
    // Auto-focus search on load
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }, [profile?.id, fetchParties]);

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
    setSplitPayments({ cash: 0, upi: 0, card: 0, bank: 0, [key]: total });
  }, [paymentMethod, total, setSplitPayments]);

  const fetchProducts = async () => {
    try {
      const res = await api.get('/products');
      setProducts(res.data);
    } catch (err) {
      console.error('Failed to load products', err);
    }
  };

  const getPrice = useCallback((product: any, variant?: string, wholesale: boolean = isWholesale) => {
    let cost = product.wholesaleCost || 0;
    let selling = product.sellingPrice || product.price || 0;
    
    if (variant) {
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

  const addToCart = useCallback((product: any, variant?: string, forceAdd = false) => {
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

    const existingItem = items.find(i => i.id === product.id && i.variant === variant);
    if (existingItem) {
      const lineStock = resolveStockForItem(existingItem, products);
      if (lineStock.known && existingItem.quantity + 1 > lineStock.qty) {
        setOutOfStockItem(product);
        return;
      }
      updateQuantity(existingItem.id, existingItem.quantity + 1, variant);
    } else {
      const defaultQty = product.is_loose ? 0.5 : 1;
      const price = getPrice(product, variant);
      const cost = product.wholesaleCost || 0;
      const { color, size } = variant ? splitVariantKey(variant) : { color: '', size: '' };

      addItem({
        id: product.id || Math.random().toString(),
        name: product.name,
        unit: product.baseUnit || product.unit,
        variant,
        color: color || undefined,
        size: size || undefined,
        quantity: defaultQty,
        price,
        cost: cost || 0,
        profit: (price / (1 + (Number(product.gstPercent ?? product.gst_percent ?? 0) || 0) / 100)) - cost,
        total: Math.round(price * defaultQty),
        is_loose: !!product.is_loose,
        // Carried for GST invoices (per-item rate + HSN). Harmless on non-GST bills.
        gstPercent: Number(product.gstPercent ?? product.gst_percent ?? 0) || 0,
        hsnCode: product.hsnCode ?? product.hsn_code ?? '',
      });
    }
    setSearch('');
    setSearchResults([]);
    searchInputRef.current?.focus();
  }, [items, addItem, updateQuantity, getPrice]);

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

    // A non-empty list below the 2000-row cap is the whole catalogue, so a local
    // miss is genuinely "not found" — answer instantly. An empty list is still
    // loading, so fall through to the (bounded) server lookup instead.
    if (products.length > 0 && products.length < 2000) {
      playScanBeep(false);
      setScanFeedback({ status: 'error', text: `Not found: ${raw}` });
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
        addToCart(found);
        playScanBeep(true);
        setScanFeedback({ status: 'ok', text: found.name });
        return;
      }
      throw new Error('not found');
    } catch {
      if (seq !== scanSeqRef.current) return;
      // Previously a miss was silent, so the cashier had no way to tell an
      // unrecognised code from one that simply hadn't registered.
      playScanBeep(false);
      setScanFeedback({ status: 'error', text: `Not found: ${raw}` });
    }
  }, [addToCart, products]);

  // Hardware scanner — shared detection logic (see lib/useBarcodeScanner).
  useBarcodeScanner({ onScan: handleScan });

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

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearch(val);
    if (val.length > 1) {
      setSearchResults(performSmartSearch(products, val));
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
    const fileName = `bill-${lastBill?.billNumber || Date.now()}.pdf`;
    try {
      const { blob } = await generatePDFBlob();
      let phone = (lastBill?.customerMobile || '').replace(/\D/g, '');
      if (phone.length === 10) phone = `91${phone}`;
      else if (phone.length > 10 && phone.startsWith('0')) phone = `91${phone.substring(1)}`;

      if (phone.length >= 10) {
        const publicUrl = await uploadInvoiceToSupabase(blob, fileName);
        const text = generateWhatsAppText({
          ...lastBill,
          storeName: profile.shopName || user?.storeName,
          pdfUrl: publicUrl || undefined,
          gst: profile.gst || undefined,
          pan: profile.pan || undefined,
          t: tBill,
        });
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
      } else {
        const file = new File([blob], fileName, { type: 'application/pdf' });
        if (navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: fileName, text: `Bill from ${user?.storeName ?? 'Store'}` });
            return;
          } catch (shareError: any) {
            if (shareError?.name === 'AbortError') return;
          }
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = fileName; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
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

  const autoSendAfterBill = async (billData: any, phone: string, email: string) => {
    setSendStatus(email ? { email: null } : null);
    setWaUrl(null);
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
      if (phone) {
        const text = generateWhatsAppText({
          ...billData,
          storeName: profile.shopName || user?.storeName,
          pdfUrl: pdfUrl || undefined,
          gst: profile.gst || undefined,
          pan: profile.pan || undefined,
          t: tBill,
        });
        let normalized = phone.replace(/\D/g, '');
        if (normalized.length === 10) normalized = `91${normalized}`;
        const url = `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`;
        setWaUrl(url);
        window.open(url, '_blank');
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

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
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
          product_id: typeof item.id === 'string' && !item.id.includes('.') ? item.id : null,
          name: item.name,
          unit: item.unit,
          variant: item.variant || null,
          quantity: item.quantity,
          price_per_unit: item.price,
          purchase_price: item.cost || 0,
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

      const res = await api.post('/billing/', payload);
      const dbSale = res.data;
      const billNumber = `INV-${dbSale.id.substring(0, 8).toUpperCase()}`;

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
        date: new Date().toLocaleDateString(),
        dueDate: dueDateIso,
        // GST invoice data (undefined for non-GST → invoice renders normally)
        billType,
        gstBreakdown: isGstBill ? gst : undefined,
        // Shop-level print settings — this screen is Udyog-only, so a shop
        // that hasn't explicitly chosen a format yet still gets the proper
        // A4 tax-invoice layout instead of silently falling back to the
        // thermal80 default (which is what happened before this field was
        // forwarded at all — only the separate Manual Bill Upload path set it).
        invoiceFormat: billInvoiceFormat,
        businessType: profile.businessType || 'kirana',
        showQrCode: profile.showQrCode || false,
        invoiceFooter: profile.invoiceFooter || undefined,
        qrSvg,
        // Only carry a upiId onto the bill when the QR is actually shown
        // (A4 format) — the invoice components gate the whole scan-to-pay
        // block on this, so a thermal wholesale slip won't render it.
        upiId: showBillQr ? profile.upiId : undefined,
      };
      setLastBill(billData);

      clearCart();
      // Local Udyog-only state the shared engine's clearCart() doesn't know about.
      setSelectedParty(null);
      setCustomerName('');
      setPaymentMethod('cash');
      setUpiApp(''); setUpiTxnId('');
      setBankName(''); setBankRefNo('');
      setChequeNo(''); setChequeDate(''); setChequeBank('');
      setCreditDays(30);
      setCharges({ transport: '', loading: '', packing: '', other: '' });
      fetchParties(); // refresh Outstanding shown in the picker for next bill
      setShowCheckout(false);
      setShowBillModal(true);

      const phone = customerMobile.trim();
      const email = customerEmail.trim();
      if (phone || email) {
        autoSendAfterBill(billData, phone, email);
      }

    } catch (err) {
      console.error('Failed to generate bill', err);
      alert(t('failedToGenerateBillShort'));
    } finally {
      setIsGenerating(false);
    }
  };


  return (
    <div className="min-h-[calc(100vh-80px)] lg:h-[calc(100vh-80px)] flex flex-col lg:flex-row gap-4 overflow-y-auto lg:overflow-hidden">
      {/* LEFT PANEL: Search & Cart Table */}
      <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 lg:overflow-hidden">
        
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
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 shadow-sm z-10">
              <tr>
                <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider">#</th>
                <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider">{t('product') || 'Product'}</th>
                <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider text-center">{t('qty') || 'Qty'}</th>
                <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider text-right">{t('price') || 'Price'}</th>
                <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider text-right">{t('totalUpper') || 'Total'}</th>
                <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider text-center">{t('act') || 'Act'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    <Scan size={48} className="mx-auto mb-4 opacity-20" />
                    <p className="text-lg font-medium">{t('cartEmpty')}</p>
                    <p className="text-sm mt-1">{t('cartEmptyDesc')}</p>
                  </td>
                </tr>
              ) : items.map((item, idx) => {
                const lineStock = resolveStockForItem(item, products);
                const maxQty = lineStock.known ? lineStock.qty : undefined;
                const atMax = typeof maxQty === 'number' && item.quantity >= maxQty;
                return (
                <tr key={`${item.id}-${item.variant}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group">
                  <td className="px-4 py-3 text-slate-400">{idx + 1}</td>
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-900 dark:text-white">{item.name}</p>
                    {item.variant && <p className="text-xs text-slate-500">{item.variant}</p>}
                    {atMax && (
                      <p className="text-[10px] text-amber-500 font-semibold">{t('onlyXInStock', {count: maxQty}) || `Only ${maxQty} in stock`}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
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
                  </td>
                  <td className="px-4 py-3 text-right">
                    <CartPriceInput item={item} updatePrice={updatePrice} />
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-emerald-400 font-mono">
                    ₹{item.total.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-center">
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
      </div>

      {/* RIGHT PANEL: Summary & Action */}
      {/* lg:min-h-0 lets this column actually shrink to the row's height
          instead of pushing past it — a flex item's default min-height is
          "auto" (its content size), which silently defeats overflow/scroll
          on the card below it. Without this, the desktop layout's outer
          lg:overflow-hidden just clips whatever doesn't fit — usually the
          Checkout button — with no way to reach it. Mobile never hit this
          because it uses page-level scroll (overflow-y-auto) instead. */}
      <div className="w-full md:w-80 flex flex-col gap-4 lg:min-h-0">
        {/* Customer Type Toggle */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-4">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 block">{t('pricingMode') || 'Pricing Mode'}</label>
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setIsWholesale(true)}
              className={cn("flex-1 py-2 text-sm font-bold rounded-lg transition-all", isWholesale ? "bg-white dark:bg-slate-700 shadow text-emerald-600 dark:text-emerald-400" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300")}
            >
              {t('wholesale') || 'Wholesale'}
            </button>
            <button
              onClick={() => setIsWholesale(false)}
              className={cn("flex-1 py-2 text-sm font-bold rounded-lg transition-all", !isWholesale ? "bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-blue-400" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300")}
            >
              {t('retail') || 'Retail'}
            </button>
          </div>
        </div>

        {/* Summary Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-5 flex flex-col flex-1 lg:min-h-0 lg:overflow-hidden">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4 shrink-0">{t('orderSummary')}</h2>

          {/* Billing type: Non-GST (default) or GST tax invoice */}
          <div className="mb-4 shrink-0">
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-950 rounded-xl">
              <button
                type="button"
                onClick={() => setBillType('non_gst')}
                aria-pressed={!isGstBill}
                className={cn('py-2 rounded-lg text-xs font-bold transition-all', !isGstBill ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500')}
              >
                {t('nonGstInvoice') || 'Non-GST Invoice'}
              </button>
              <button
                type="button"
                onClick={() => setBillType('gst')}
                aria-pressed={isGstBill}
                className={cn('py-2 rounded-lg text-xs font-bold transition-all', isGstBill ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500')}
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

          <div className="space-y-3 flex-1 lg:overflow-y-auto lg:min-h-0">
            <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
              <span>{t('itemsCount', { count: items.length })}</span>
              <span>₹{subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400 items-center">
              <span>{t('discount')}</span>
              <DiscountInput subtotal={subtotal} discount={discount} setDiscount={setDiscount} />
            </div>
            
            {/* GST tax summary — prices are GST-inclusive, so this breaks the same
                total into taxable + tax. Shown even at 0% so a GST bill always
                looks like one, regardless of business type or whether GST
                rates have been set on the products yet. */}
            {isGstBill && items.length > 0 && (
              <div className="rounded-xl border border-indigo-200 dark:border-indigo-500/20 bg-indigo-50/50 dark:bg-indigo-500/5 p-3 space-y-1.5 text-xs mt-3">
                <div className="flex justify-between text-slate-500 dark:text-slate-400">
                  <span>{t('taxableValue') || 'Taxable Value'}</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">₹{gst.taxable.toLocaleString('en-IN')}</span>
                </div>
                {gstInterState ? (
                  <div className="flex justify-between text-slate-500 dark:text-slate-400"><span>IGST</span><span className="font-semibold text-slate-700 dark:text-slate-300">₹{gst.igst.toLocaleString('en-IN')}</span></div>
                ) : (
                  <>
                    <div className="flex justify-between text-slate-500 dark:text-slate-400"><span>CGST</span><span className="font-semibold text-slate-700 dark:text-slate-300">₹{gst.cgst.toLocaleString('en-IN')}</span></div>
                    <div className="flex justify-between text-slate-500 dark:text-slate-400"><span>SGST</span><span className="font-semibold text-slate-700 dark:text-slate-300">₹{gst.sgst.toLocaleString('en-IN')}</span></div>
                  </>
                )}
                <div className="flex justify-between pt-1 border-t border-indigo-200/60 dark:border-indigo-500/20 font-bold text-indigo-600 dark:text-indigo-400">
                  <span>{t('totalGst') || 'Total GST'}</span>
                  <span>₹{gst.totalGst.toLocaleString('en-IN')}</span>
                </div>
              </div>
            )}


            <div className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-800">
              <div className="flex justify-between items-end">
                <span className="text-sm font-bold text-slate-900 dark:text-slate-200">{t('totalPayable')}</span>
                <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400 font-mono tracking-tight">
                  ₹{total.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{t('collectedAmount') || 'Collected'}</span>
                <span className="text-lg font-bold text-slate-900 dark:text-white font-mono">
                  ₹{collectedAmount.toLocaleString()}
                </span>
              </div>
              {remainingAmount > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-orange-400">{t('remainingUdhar') || 'Remaining (Udhar)'}</span>
                  <span className="text-lg font-black text-orange-500 font-mono">
                    ₹{remainingAmount.toLocaleString()}
                  </span>
                </div>
              )}
              {collectedAmount > total && (
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-blue-400">{t('changeReturn') || 'Change Return'}</span>
                  <span className="text-lg font-black text-blue-500 font-mono">
                    ₹{(collectedAmount - total).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-800 shrink-0">
            <button
              disabled={items.length === 0}
              onClick={() => setShowCheckout(true)}
              className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:hover:bg-emerald-500 text-white rounded-xl font-bold text-lg shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
            >
              {t('checkout') || 'Checkout'} <span className="text-xs bg-emerald-600/50 px-1.5 py-0.5 rounded ml-1">F2</span>
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
              businessType: profile.businessType || 'kirana',
              showQrCode: profile.showQrCode || false,
              invoiceFooter: profile.invoiceFooter || undefined,
            };
            setLastBill(fullBillData);
            setShowManualBillUpload(false);
            setShowBillModal(true);
            // Matches the regular sale flow: a mobile number and/or email
            // entered on the manual bill triggers the same auto-share.
            if (billData.customerMobile || billData.customerEmail) {
              autoSendAfterBill(fullBillData, billData.customerMobile || '', billData.customerEmail || '');
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
                <label className="text-xs font-bold text-slate-500 mb-1 block">Selling Price (₹)</label>
                <input required type="number" step="any" className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-1 focus:ring-emerald-500 outline-none font-bold text-emerald-600 dark:text-emerald-400"
                  value={manualProduct.price} onChange={e => setManualProduct({...manualProduct, price: e.target.value})} />
              </div>
              <button type="submit" className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold transition-colors text-sm shadow-sm">
                Add to Cart
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Checkout Modal */}
      {showCheckout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCheckout(false)} />
          <div className="relative w-full max-w-md max-h-[90vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-emerald-50 dark:bg-emerald-900/20 shrink-0">
              <h3 className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                <CreditCard size={20} /> {t('checkout') || 'Checkout'}
              </h3>
              <button onClick={() => setShowCheckout(false)} className="text-emerald-600/50 hover:text-emerald-700 dark:hover:text-emerald-300"><X size={20} /></button>
            </div>

            {/* Payment Method + Party grew this form well past a typical
                viewport height — needs its own scroll region so the Charges
                section and Confirm Order button at the bottom stay reachable. */}
            <form onSubmit={handleCheckout} className="p-6 space-y-5 overflow-y-auto flex-1">
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
                    onClick={() => setBillType('gst')}
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
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">
                    {t('customerNameLabel') || 'Customer Name'}
                    {grandRemaining > 0 && <span className="text-orange-500 ml-1 normal-case font-normal">*{t('requiredForUdhar') || 'Required for Udhar'}</span>}
                  </label>
                  <input
                    type="text"
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white transition-all"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    placeholder={t('customerNamePlaceholder') || 'e.g. Walk-in Customer'}
                  />
                </div>
              ) : (
              <div className="relative">
                <label className="text-xs font-bold text-slate-500 mb-1 block">
                  {t('party') || 'Party'}
                  <span className="text-red-500 ml-1">*</span>
                </label>
                {selectedParty ? (
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <Building2 size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span className="truncate">{selectedParty.name}</span>
                        </div>
                        {selectedParty.gst && <div className="text-[11px] text-slate-500 mt-0.5">GSTIN: {selectedParty.gst}</div>}
                      </div>
                      <button type="button" onClick={() => setSelectedParty(null)} className="text-slate-400 hover:text-red-500 shrink-0"><X size={16} /></button>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs">
                      <span className="text-orange-600 dark:text-orange-400 font-semibold">{t('outstanding') || 'Outstanding'}: ₹{(selectedParty.totalDue || 0).toLocaleString()}</span>
                      {!!selectedParty.creditLimit && <span className="text-slate-500">{t('creditLimit') || 'Credit Limit'}: ₹{selectedParty.creditLimit.toLocaleString()}</span>}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white transition-all"
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
                  <input type="tel" className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white transition-all"
                    value={customerMobile} onChange={e => setCustomerMobile(e.target.value)} placeholder={t('waPlaceholder') || "WhatsApp number for bill"} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">{t('emailLabel') || 'Email'}</label>
                  <input type="email" className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white transition-all"
                    value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder={t('emailPlaceholder') || "For auto email bill receipt"} />
                </div>
              </div>

              {/* Payment Method */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 block text-center">
                  {t('paymentMethod') || 'Payment Method'} (Total: ₹{grandTotal.toLocaleString()})
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
                        'flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl border text-[11px] font-bold transition-all',
                        paymentMethod === key
                          ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-emerald-300'
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
                      <input type="number" min={0} max={grandTotal} className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-mono font-bold text-slate-900 dark:text-white"
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
                          <select className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white"
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
                          <input className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white"
                            value={upiTxnId} onChange={e => setUpiTxnId(e.target.value)} placeholder="UTR / Ref no." />
                        </div>
                      </div>
                    )}
                    {paymentMethod === 'bank' && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">{t('bank') || 'Bank'}</label>
                          <input className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white"
                            value={bankName} onChange={e => setBankName(e.target.value)} placeholder="e.g. HDFC" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">{t('referenceNo') || 'Reference No.'}</label>
                          <input className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white"
                            value={bankRefNo} onChange={e => setBankRefNo(e.target.value)} placeholder="UTR" />
                        </div>
                      </div>
                    )}
                    {paymentMethod === 'cheque' && (
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">{t('chequeNo') || 'Cheque No.'}</label>
                          <input className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white"
                            value={chequeNo} onChange={e => setChequeNo(e.target.value)} />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">{t('chequeDate') || 'Cheque Date'}</label>
                          <input type="date" className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white"
                            value={chequeDate} onChange={e => setChequeDate(e.target.value)} />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">{t('bank') || 'Bank'}</label>
                          <input className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white"
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
                    <input type="number" min={0} className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-mono font-bold text-slate-900 dark:text-white"
                      value={splitPayments.cash === 0 ? '' : splitPayments.cash} placeholder="0"
                      onChange={e => setSplitPayments(p => ({ ...p, cash: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)) }))} />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                      {t('upi') || 'UPI'}
                    </label>
                    <input type="number" min={0} className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-mono font-bold text-slate-900 dark:text-white"
                      value={splitPayments.upi === 0 ? '' : splitPayments.upi} placeholder="0"
                      onChange={e => setSplitPayments(p => ({ ...p, upi: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)) }))} />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                      {t('bank') || 'Bank'}
                    </label>
                    <input type="number" min={0} className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-mono font-bold text-slate-900 dark:text-white"
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
                      <input type="number" min={0} className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-mono font-bold text-slate-900 dark:text-white"
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
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-1.5">
                  <Truck size={15} /> {t('charges') || 'Charges'}
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
                      <input type="number" min={0} className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-mono text-slate-900 dark:text-white"
                        value={charges[key]} placeholder="0"
                        onChange={e => setCharges(c => ({ ...c, [key]: e.target.value }))} />
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={isGenerating}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 flex justify-center items-center gap-2"
              >
                {isGenerating ? <><Loader2 size={18} className="animate-spin" /> {t('generating') || 'Generating...'}</> : <><CheckCircle size={18} /> {t('confirmOrder') || 'Confirm Order'}</>}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Bill Success Modal (Simplified representation) */}
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
              <button onClick={() => { setShowBillModal(false); setWaUrl(null); setSendStatus(null); }} className="text-slate-500 hover:text-slate-900 transition-colors">
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
                  ref={componentRef}
                />
              </div>
            </div>

            {/* Sticky footer */}
            <div className="flex-shrink-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 space-y-3">
              {/* WhatsApp CTA */}
              {waUrl && (
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 bg-[#25D366] text-white py-3 rounded-xl font-bold text-sm hover:bg-[#1ebe5d] active:scale-95 transition-all animate-pulse shadow-md"
                  onClick={() => setWaUrl(null)}
                >
                  <MessageCircle size={18} />
                  Send Bill on WhatsApp
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
                  onClick={async () => { if (componentRef.current) await waitForQrCode(componentRef.current, !!profile.upiId); setShowBillModal(false); window.print(); }}
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
