'use client';
import {useState, useEffect, useRef, useCallback, useMemo} from 'react';
import useSWR, { mutate } from 'swr';
import WholesaleBillingUI from './WholesaleBillingUI';
import {useTranslations, useLocale} from 'next-intl';
import {useCartStore, useUdharStore, useAuthStore} from '@/lib/store';
import {useBusinessStore} from '@/lib/businessStore';
import {useBillingEngine, type PaymentMethod, type CollectedMethod} from '@/lib/hooks/useBillingEngine';
import {translateData} from '@/lib/translateData';
import {getBusinessConfig} from '@/lib/businessConfig';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {
  Search, Scan, Trash2, Plus, Minus, CreditCard, IndianRupee,
  User, X, Printer, Calculator as CalcIcon, PlusCircle, Download,
  AlertCircle, CheckCircle, Zap, MessageCircle, Loader2, Smartphone, FileUp
} from 'lucide-react';
import api from '@/lib/api';
import {cn} from '@/lib/utils';
import {BillSlip, generateWhatsAppText} from '@/components/BillSlip';
import {uploadInvoiceToSupabase} from '@/lib/supabaseStorage';
import Calculator from '@/components/Calculator';
import {performSmartSearch} from '@/lib/smartSearch';
import {computeGst} from '@/lib/gst';
import ManualBillUpload from '@/components/ManualBillUpload';
import DiscountInput from '@/components/DiscountInput';
import {splitVariantKey, isColorSizeVariants} from '@/components/ColorSizeVariantGrid';

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
  // Variant products track stock per size/colour in size_variants.
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
const CartQuantityInputRetail = ({ item, updateQuantity, removeItem }: any) => {
  const [localVal, setLocalVal] = useState(item.quantity.toString());
  useEffect(() => {
    setLocalVal(item.quantity.toString());
  }, [item.quantity]);

  return (
    <input
      type="number"
      step="any"
      min="0"
      value={localVal}
      onChange={(e) => {
        setLocalVal(e.target.value);
        const num = Number(e.target.value);
        if (!isNaN(num)) {
          updateQuantity(item.id, num, item.variant);
        }
      }}
      onBlur={(e) => {
        const num = Number(e.target.value);
        if (num <= 0 || e.target.value === '') removeItem(item.id, item.variant);
        else setLocalVal(num.toString());
      }}
      className="w-20 bg-white dark:bg-slate-950 border border-emerald-200 dark:border-emerald-700/50 rounded px-2 py-1 text-center text-emerald-600 dark:text-emerald-400 font-bold text-sm focus:ring-1 focus:ring-emerald-500 outline-none transition-colors"
    />
  );
};

const CartPriceInputRetail = ({ item, updatePrice }: any) => {
  const [localVal, setLocalVal] = useState(item.price.toString());
  useEffect(() => {
    setLocalVal(item.price.toString());
  }, [item.price]);

  return (
    <input
      type="number"
      className="w-20 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-2 py-1 text-right text-emerald-600 dark:text-emerald-500 font-bold focus:ring-1 focus:ring-emerald-500 outline-none transition-colors"
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

function StandardBillingUI() {
  const t = useTranslations('Billing');
  const tBill = useTranslations('BillSlip');
  const tP = useTranslations('Products');
  const locale = useLocale();
  const {profile, activeShopId} = useBusinessStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  
  const {
    items, addItem, removeItem, updateQuantity, updatePrice, clearCart,
    subtotal, discount, setDiscount, total,
    splitPayments, collectedAmount,
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
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [showManualBillUpload, setShowManualBillUpload] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [sendStatus, setSendStatus] = useState<{ email: boolean | null } | null>(null);
  const [waUrl, setWaUrl] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string | number>>(new Set());
  const [variantSelectionProduct, setVariantSelectionProduct] = useState<any>(null);
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

  // Use SWR for instant cache loading
  const fetcher = ([url]: [string, string]) => api.get(url).then(res => res.data);
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

  const handlePrint = () => window.print();

  const generatePDFBlob = async () => {
    if (!componentRef.current) throw new Error('No ref');
    
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas-pro'),
      import('jspdf'),
    ]);

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
      // Small delay to ensure styles are applied to the clone
      await new Promise(r => setTimeout(r, 100));
      
      const canvas = await html2canvas(clone, { 
        scale: isA4 ? 2 : 3, // Lower scale for A4 to prevent memory issues
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdfWidth = isA4 ? 210 : 80;
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      const pdf = new jsPDF({ 
        orientation: 'portrait', 
        unit: 'mm', 
        format: isA4 ? 'a4' : [pdfWidth, pdfHeight] 
      });
      
      if (isA4) {
        // A4 pages might need multiple pages, but for now we scale to fit one page width
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      } else {
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      }
      
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
      alert('Failed to download PDF. Please try again.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleWhatsAppPDF = async () => {
    if (isSharing) return;
    setIsSharing(true);
    const fileName = `bill-${lastBill?.billNumber || Date.now()}.pdf`;

    try {
      const { blob } = await generatePDFBlob();

      // Normalize customer phone (strip non-digits, add country code)
      let phone = (lastBill?.customerMobile || '').replace(/\D/g, '');
      if (phone.length === 10) phone = `91${phone}`;
      else if (phone.length > 10 && phone.startsWith('0')) phone = `91${phone.substring(1)}`;

      if (phone.length >= 10) {
        // Phone known → upload PDF, open directly in that customer's WhatsApp chat (no contact picker)
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
        // No phone → native share so user can pick the contact themselves
        const file = new File([blob], fileName, { type: 'application/pdf' });
        if (navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: fileName, text: `Bill from ${user?.storeName ?? 'Store'}` });
            return;
          } catch (shareError: any) {
            if (shareError?.name === 'AbortError') return;
          }
        }
        // Last resort: download the PDF
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = fileName; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        console.error('Failed to share PDF', error);
        alert('Could not share PDF. Try downloading it instead.');
      }
    } finally {
      setIsSharing(false);
    }
  };

  const addToCart = useCallback((product: any, variant?: string, forceAdd = false) => {
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

    // Prompt for a variant when the business uses sizes OR this product carries its own
    // variant breakdown (colour/size, type/watt, net-weight) — works for any category.
    let productVariants: Record<string, number> = {};
    try {
      productVariants = typeof product.size_variants === 'string'
        ? JSON.parse(product.size_variants)
        : (product.size_variants || {});
    } catch { productVariants = {}; }
    const productHasVariants = Object.values(productVariants).some((v: any) => Number(v) > 0);
    if ((bizConfig.hasSizes || productHasVariants) && !variant) {
      setVariantSelectionProduct(product);
      return;
    }

    const defaultQty = product.is_loose ? 0.5 : 1;
    // Resolve per-size pricing: if this product has a price set for the chosen
    // variant/size, charge that instead of the flat fallback selling price.
    let price = product.sellingPrice || Number(product.price);
    let cost = product.wholesaleCost || 0;
    if (variant) {
      try {
        const meta = typeof product.metadata === 'string' ? JSON.parse(product.metadata) : (product.metadata || {});
        const sp = meta?.size_prices?.[variant];
        if (sp && (sp.sellingPrice > 0 || sp.mrp > 0)) {
          price = sp.sellingPrice || sp.mrp;
          cost = sp.cost || cost;
        }
      } catch { /* fall back to flat price */ }
    }
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
      quantity: defaultQty,
      price: price || 0,
      profit: (price || 0) - cost,
      total: Math.round((price || 0) * defaultQty),
      is_loose: !!product.is_loose,
      // Carried for GST invoices (per-item rate + HSN). Harmless on non-GST bills.
      gstPercent: Number(product.gstPercent ?? product.gst_percent ?? 0) || 0,
      hsnCode: product.hsnCode ?? product.hsn_code ?? '',
    });
    setSearch('');
    setSearchResults([]);
    setVariantSelectionProduct(null);
  }, [addItem, bizConfig.hasSizes]);

  const handleScan = useCallback((barcode: string) => {
    const scanned = String(barcode).trim().toLowerCase();
    const product = products.find(p =>
      (p.barcode || '').toLowerCase() === scanned || (p.sku || '').toLowerCase() === scanned);
    if (product) {
      addToCart(product);
    } else {
      setUnknownBarcode(barcode);
    }
  }, [addToCart, products]);

  // Hardware Barcode Scanner integration
  useEffect(() => {
    let barcodeBuffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      const currentTime = Date.now();
      
      // If time between keystrokes is > 50ms, it's a human typing. Reset buffer.
      // Physical hardware scanners typically type at 10-30ms per character.
      if (currentTime - lastKeyTime > 50) {
        barcodeBuffer = '';
      }

      if (e.key === 'Enter' && barcodeBuffer.length >= 3) {
        e.preventDefault(); // Prevent form submission
        handleScan(barcodeBuffer);
        barcodeBuffer = '';
        searchInputRef.current?.focus();
        return;
      }

      // Only capture printable characters
      if (e.key && e.key.length === 1) {
        barcodeBuffer += e.key;
      }

      lastKeyTime = currentTime;
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleScan]);

  const handleManualAdd = (e: React.FormEvent) => {
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
      barcode: manualProduct.barcode,
      isManualItem: true,
    }, manualProduct.variant || undefined);

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
    setCustomerName('');
    setCustomerMobile('');
    setCustomerEmail('');
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
        unit: item.unit,
        variant: item.variant || null,
        quantity: item.quantity,
        price_per_unit: item.price,
        purchase_price: item.cost || 0,
      }));

      const salePayload = {
        customer_id: udharInfo?.type === 'existing' && typeof udharInfo.customer?.id === 'string' && !udharInfo.customer.id.startsWith('temp-') 
          ? udharInfo.customer.id 
          : null,
        customer_name: customerName.trim() || null,
        customer_mobile: customerMobile.trim() || null,
        customer_email: customerEmail.trim() || null,
        items: saleItems,
        discount: discount,
        total_amount: total,
        payment_type: isEmi ? 'EMI' : paymentTypeForApi,
        // Finance provider settles the shop in full on an EMI sale.
        amount_paid: isEmi ? total : collectedAmount,
        payment_details: isEmi ? {} : { ...splitPayments, udhar: remainingAmount },
        bill_type: billType,
        gst_amount: isGstBill ? gst.totalGst : null,
        gst_details: isGstBill ? gst : null,
      };

      const res = await api.post('/billing/', salePayload);
      const dbSale = res.data;
      const billNumber = `INV-${dbSale.id.substring(0, 8).toUpperCase()}`;

      const billData = {
        customerName: customerName.trim() || undefined,
        customerMobile: customerMobile.trim() || undefined,
        customerEmail: customerEmail.trim() || undefined,
        ownerSignature: user?.name || undefined,
        items: [...items],
        total,
        discount,
        amountPaid: isEmi ? total : collectedAmount,
        remainingAmount,
        paymentMethod: isEmi ? 'EMI' : paymentTypeForApi,
        splitPayments: isEmi ? undefined : { ...splitPayments, udhar: remainingAmount },
        billNumber,
        date: new Date().toLocaleDateString(),
        isEmi,
        // GST invoice data (undefined for non-GST — invoice components then render normally)
        billType,
        gstBreakdown: isGstBill ? gst : undefined,
        // New features
        invoiceFormat: profile.invoiceFormat || 'thermal80',
        businessType: profile.businessType || 'kirana',
        showQrCode: profile.showQrCode || false,
        invoiceFooter: profile.invoiceFooter || undefined,
      };
      setLastBill(billData);

      // Udhar tracking is now natively processed in the /billing/ route backend
      
      // Invalidate dashboard caches to ensure new sale/udhar is immediately visible
      mutate(
        (key: any) => typeof key === 'string' && key.startsWith('/reports/dashboard'),
        undefined,
        { revalidate: true }
      );

      clearCart();
      setShowCustomerModal(false);
      setShowBillModal(true);

      // Auto-send bill via WhatsApp link + email if contact info provided
      const phone = customerMobile.trim();
      const email = customerEmail.trim();
      if (phone || email) {
        autoSendAfterBill(billData, phone, email);
      }
    } catch (err) {
      console.error('Failed to record sale:', err);
      alert('Failed to generate bill. Please check your inventory and try again.');
    } finally {
      setIsGeneratingBill(false);
    }
  };

  const autoSendAfterBill = async (billData: any, phone: string, email: string) => {
    setSendStatus(email ? { email: null } : null);
    setWaUrl(null);

    let pdfUrl: string | null = null;

    try {
      // Wait for React to render the modal so componentRef is available
      await new Promise(resolve => setTimeout(resolve, 500)); // increased slightly

      // Upload PDF once — reused for both WhatsApp link and email attachment
      try {
        const { blob } = await generatePDFBlob();
        const fileName = `bill-${billData.billNumber || Date.now()}.pdf`;
        pdfUrl = await uploadInvoiceToSupabase(blob, fileName);
      } catch (pdfErr) {
        console.warn('PDF generation or upload failed, continuing without PDF:', pdfErr);
      }

      // Build wa.me link with pre-filled bill message
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
        // Try auto-open — works on mobile; desktop browsers may block popup after async
        window.open(url, '_blank');
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



  const paymentOptions: { id: PaymentMethod; label: string; icon: React.ReactNode }[] = [
    { id: 'cash', label: t('cash') || 'Cash', icon: <IndianRupee size={20}/> },
    { id: 'upi', label: t('upi') || 'UPI', icon: <Smartphone size={20}/> },
    { id: 'card', label: t('card') || 'Card', icon: <CreditCard size={20}/> },
    { id: 'udhar', label: t('udhar') || 'Udhar', icon: <User size={20}/> },
  ];

  const paymentMethodLabel = paymentOptions.find(o => o.id === paymentMethod)?.label ?? '';
  const isUdharSale = paymentMethod === 'udhar';
  const isPartialUdhar = isUdharSale && udharAdvance > 0;
  // Matches the payment_type values the invoice + reports screens already read.
  // A part-paid udhar bill is a genuine Split: the backend books only the cash
  // slice of payment_details to the drawer, so a UPI/card advance stays out of it.
  const paymentTypeForApi = isPartialUdhar
    ? 'Split'
    : { cash: 'Cash', upi: 'UPI', card: 'Card', udhar: 'Udhar' }[paymentMethod];

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
                {searchResults.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
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
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-emerald-500">₹{product.sellingPrice ?? product.selling_price}</p>
                      <p className="text-[10px] text-slate-500">MRP: ₹{product.mrp}</p>
                      {(() => {
                        // Remaining stock + low-stock indicator, right under the MRP.
                        const { known, qty } = resolveStock(product);
                        if (!known) return null;
                        const minStock = Number(product.minStock ?? product.min_stock ?? 0);
                        const isOut = qty <= 0;
                        const isLow = !isOut && minStock > 0 && qty <= minStock;
                        return (
                          <p className={cn(
                            'text-[10px] font-bold mt-0.5',
                            isOut ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-emerald-600 dark:text-emerald-400'
                          )}>
                            {isOut ? 'Out of stock' : `${qty} in stock${isLow ? ' · Low' : ''}`}
                          </p>
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
                    type="text" required placeholder="Enter item name..."
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-slate-900 dark:text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors"
                    value={manualProduct.name}
                    onChange={e => setManualProduct({...manualProduct, name: e.target.value})}
                  />
                </div>
                {bizConfig.hasSizes && (
                  <div className="w-24">
                    <label className="text-xs text-slate-500 mb-1 block uppercase font-bold">Size/Variant</label>
                    <input
                      type="text" placeholder="e.g. M, L"
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
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[600px]">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input 
                      type="checkbox" 
                      className="rounded border-slate-300 dark:border-slate-600 text-emerald-500 focus:ring-emerald-500 cursor-pointer w-4 h-4"
                      checked={items.length > 0 && selectedItemIds.size === items.length}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedItemIds(new Set(items.map(i => i.id)));
                        else setSelectedItemIds(new Set());
                      }}
                    />
                  </th>
                  <th className="px-2 py-3">{t('itemCol') || 'ITEM'}</th>
                  {bizConfig.hasSizes && <th className="px-4 py-3 whitespace-nowrap">{t('sizeColor') || 'SIZE / COLOR'}</th>}
                  {bizConfig.hasBatch && <th className="px-4 py-3 whitespace-nowrap">{t('batch') || 'BATCH'}</th>}
                  {bizConfig.hasExpiry && <th className="px-4 py-3 whitespace-nowrap">{t('expiry') || 'EXPIRY'}</th>}
                  {bizConfig.hasWarranty && <th className="px-4 py-3 whitespace-nowrap">{t('warranty') || 'WARRANTY'}</th>}
                  {isElectronics && <th className="px-4 py-3 whitespace-nowrap">{t('serialNo') || 'SERIAL #'}</th>}
                  <th className="px-4 py-3 whitespace-nowrap">{t('unitCol') || 'UNIT'}</th>
                  <th className="px-6 py-3 whitespace-nowrap">{t('qtyCol') || 'QTY'}</th>
                  <th className="px-6 py-3 text-right whitespace-nowrap">{t('priceCol') || 'PRICE'}</th>
                  <th className="px-6 py-3 text-right whitespace-nowrap">{t('totalCol') || 'TOTAL'}</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">{t('actionCol') || 'ACTION'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((item) => (
                  <tr key={`${item.id}-${item.unit}-${item.variant || 'none'}`} className="text-slate-900 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-4">
                      <input 
                        type="checkbox" 
                        className="rounded border-slate-300 dark:border-slate-600 text-emerald-500 focus:ring-emerald-500 cursor-pointer w-4 h-4"
                        checked={selectedItemIds.has(item.id)}
                        onChange={(e) => {
                          const newSet = new Set(selectedItemIds);
                          if (e.target.checked) newSet.add(item.id);
                          else newSet.delete(item.id);
                          setSelectedItemIds(newSet);
                        }}
                      />
                    </td>
                    <td className="px-2 py-4 font-medium min-w-[200px]">
                      {item.name}
                      {item.variant && !bizConfig.hasSizes && (
                        <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold uppercase">
                          {item.variant}
                        </span>
                      )}
                    </td>
                    {bizConfig.hasSizes && (
                      <td className="px-4 py-4 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        {item.color ? (
                          <span className="flex flex-col leading-tight">
                            <span className="text-[10px] uppercase text-slate-500 dark:text-slate-400 font-bold">{item.color}</span>
                            <span>{item.size || item.variant}</span>
                          </span>
                        ) : (item.size || item.variant || '-')}
                      </td>
                    )}
                    {bizConfig.hasBatch && (
                      <td className="px-4 py-4">
                        <input type="text" placeholder="Batch..." className="w-24 bg-transparent border-b border-slate-300 dark:border-slate-700 focus:border-emerald-500 outline-none text-xs px-1 py-0.5" />
                      </td>
                    )}
                    {bizConfig.hasExpiry && (
                      <td className="px-4 py-4">
                        <input type="text" placeholder="MM/YY" className="w-20 bg-transparent border-b border-slate-300 dark:border-slate-700 focus:border-emerald-500 outline-none text-xs px-1 py-0.5" />
                      </td>
                    )}
                    {bizConfig.hasWarranty && (
                      <td className="px-4 py-4">
                        <input type="text" placeholder="Months" className="w-16 bg-transparent border-b border-slate-300 dark:border-slate-700 focus:border-emerald-500 outline-none text-xs px-1 py-0.5 text-center" />
                      </td>
                    )}
                    {isElectronics && (
                      <td className="px-4 py-4">
                        <input type="text" placeholder="IMEI / SN..." className="w-28 bg-transparent border-b border-slate-300 dark:border-slate-700 focus:border-emerald-500 outline-none text-xs px-1 py-0.5" />
                      </td>
                    )}
                    <td className="px-6 py-4 text-sm text-slate-400">{item.unit}</td>
                    <td className="px-6 py-4">
                      {item.is_loose ? (
                        <div className="flex flex-col gap-1.5 min-w-[150px]">
                          {/* Quantity input */}
                          <div className="flex items-center gap-1">
                            <CartQuantityInputRetail item={item} updateQuantity={updateQuantity} removeItem={removeItem} />
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
                          {/* Preset buttons */}
                          <div className="flex flex-wrap gap-1">
                            {getLoosePresets(item.unit).map(p => (
                              <button
                                key={p.l}
                                onClick={() => updateQuantity(item.id, p.v, item.variant)}
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
                            if (newQty <= 0) removeItem(item.id, item.variant);
                            else updateQuantity(item.id, newQty, item.variant);
                          }} className="w-6 h-6 flex items-center justify-center rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-red-100 hover:text-red-600 transition-colors">
                            <Minus size={14}/>
                          </button>
                          <CartQuantityInputRetail item={item} updateQuantity={updateQuantity} removeItem={removeItem} />
                          <button onClick={() => updateQuantity(item.id, item.quantity + 1, item.variant)} className="w-6 h-6 flex items-center justify-center rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-emerald-100 hover:text-emerald-600 transition-colors">
                            <Plus size={14}/>
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <CartPriceInputRetail item={item} updatePrice={updatePrice} />
                    </td>
                    <td className="px-6 py-4 text-right font-bold">₹{item.total}</td>
                    <td className="px-6 py-4 text-center">
                      <button onClick={() => removeItem(item.id, item.variant)} className="text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 p-2 rounded-lg transition-colors">
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-20 text-center text-slate-500">
                        {t('emptyCart') || 'No items in cart. Start scanning or searching!'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
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
                so this breaks the same total into taxable value + embedded tax. */}
            {isGstBill && items.length > 0 && gst.totalGst > 0 && (
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


            <div className="border-t border-slate-200 dark:border-slate-800 pt-4 flex justify-between items-center">
              <span className="text-xl font-bold text-slate-900 dark:text-slate-200">{t('total')}</span>
              <span className="text-3xl font-black text-emerald-500">₹{total.toLocaleString('en-IN')}</span>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('payableAmount') || 'Payable Amount'}</span>
                  <span className="text-2xl font-black text-slate-900 dark:text-white">₹{total.toLocaleString('en-IN')}</span>
                </div>

                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t('paymentMethod') || 'Payment Method'}</div>
                  <div className="grid grid-cols-2 gap-3">
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
                            "flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-bold text-sm transition-all active:scale-95",
                            isSelected
                              ? isUdhar
                                ? "bg-orange-500/10 border-orange-500 text-orange-600 dark:text-orange-400"
                                : "bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400"
                              : "bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 hover:border-slate-300 dark:hover:border-slate-700"
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
                          "flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-bold text-sm transition-all active:scale-95",
                          isEmi
                            ? "bg-sky-500/10 border-sky-500 text-sky-600 dark:text-sky-400"
                            : "bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 hover:border-slate-300 dark:hover:border-slate-700"
                        )}
                      >
                        <Zap size={20} />EMI
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
                            .filter((o): o is typeof o & { id: CollectedMethod } => o.id !== 'udhar')
                            .map(option => (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => setUdharAdvanceMethod(option.id)}
                                aria-pressed={udharAdvanceMethod === option.id}
                                className={cn(
                                  "py-1.5 rounded-lg border font-bold text-xs transition-all active:scale-95",
                                  udharAdvanceMethod === option.id
                                    ? "bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400"
                                    : "bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500"
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

                <div className="flex flex-col gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold text-slate-500">{isEmi ? (t('financedViaEmi') || 'Financed via EMI') : (t('collectedAmount') || 'Collected')}</span>
                    <span className="text-lg font-black text-emerald-500">₹{(isEmi ? total : collectedAmount).toLocaleString('en-IN')}</span>
                  </div>

                  <div className="mt-2 flex justify-between items-center bg-slate-50 dark:bg-slate-950 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                    <span className="text-xs font-bold text-slate-500">Status</span>
                    {isEmi ? (
                      <span className="text-xs font-black text-sky-600 dark:text-sky-400 bg-sky-500/10 px-2 py-1 rounded">{t('paidByMethod', { method: 'EMI' }) || 'Paid by EMI'}</span>
                    ) : !isUdharSale ? (
                      <span className="text-xs font-black text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded">{t('paidByMethod', { method: paymentMethodLabel }) || `Paid by ${paymentMethodLabel}`}</span>
                    ) : collectedAmount === 0 ? (
                      <span className="text-xs font-black text-orange-500 bg-orange-500/10 px-2 py-1 rounded">Unpaid / Udhar</span>
                    ) : remainingAmount > 0 ? (
                      <span className="text-xs font-black text-orange-500 bg-orange-500/10 px-2 py-1 rounded">{t('partiallyPaid') || 'Partially Paid'}</span>
                    ) : (
                      <span className="text-xs font-black text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded">{t('fullyPaid') || 'Fully Paid'}</span>
                    )}
                  </div>

                  {isUdharSale && remainingAmount > 0 && (
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
              "w-full py-5 rounded-2xl font-black text-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3",
              isEmi 
                ? "bg-sky-500 text-slate-900 shadow-sky-500/20 hover:bg-sky-400" 
                : "bg-emerald-500 text-slate-900 shadow-emerald-500/20 hover:bg-emerald-400"
            )}
          >
            <CheckCircle size={24} />
            {isEmi ? "Confirm EMI Sale" : "Confirm Sale"}
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

      {/* Variant Selection Modal */}
      {variantSelectionProduct && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 w-full max-w-sm shadow-2xl">
            <CardHeader className="border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between py-4">
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
            <CardContent className="p-6 space-y-4">
              <div>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{variantSelectionProduct.name}</p>
                <p className="text-xs text-slate-500 mt-1">Available Inventory:</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
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
                  return Object.entries(sizes).map(([key, qty]) => {
                    const stock = Number(qty) || 0;
                    const isOutOfStock = stock <= 0;
                    const { color, size } = splitVariantKey(key);
                    const sp = sizePrices[key];
                    const sizePrice = sp && (sp.sellingPrice > 0 || sp.mrp > 0)
                      ? (sp.sellingPrice || sp.mrp)
                      : (variantSelectionProduct.sellingPrice || Number(variantSelectionProduct.price) || 0);
                    return (
                      <button
                        key={key}
                        onClick={() => {
                          addToCart(variantSelectionProduct, key);
                          setVariantSelectionProduct(null);
                        }}
                        className={cn(
                          'py-3 rounded-xl border flex flex-col items-center justify-center gap-0.5 transition-colors active:scale-95',
                          isOutOfStock
                            ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 opacity-60 hover:opacity-100'
                            : 'bg-white dark:bg-slate-900 border-emerald-200 dark:border-emerald-500/30 hover:border-emerald-500 dark:hover:border-emerald-500 text-slate-900 dark:text-slate-100 shadow-sm'
                        )}
                      >
                        {color && <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{color}</span>}
                        <span className="font-bold">{size}</span>
                        {sizePrice > 0 && <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400">₹{sizePrice}</span>}
                        <span className={cn('text-[10px] font-semibold', isOutOfStock ? 'text-red-400' : 'text-slate-400 dark:text-slate-500')}>
                          {isOutOfStock ? 'Out' : `${stock} left`}
                        </span>
                      </button>
                    );
                  });
                })()}
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const val = new FormData(e.currentTarget).get('custom_size') as string;
                  if (val && val.trim()) {
                    addToCart(variantSelectionProduct, val.trim());
                    setVariantSelectionProduct(null);
                  }
                }} className="flex gap-2">
                  <input 
                    name="custom_size" 
                    placeholder="Type custom size... e.g. XL" 
                    className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-900 dark:text-slate-200" 
                    autoFocus
                  />
                  <button type="submit" className="bg-emerald-500 hover:bg-emerald-400 text-white dark:text-slate-900 px-4 py-2 rounded-lg font-bold text-sm transition-colors">
                    Add
                  </button>
                </form>
              </div>
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
                <User size={20} className="text-emerald-500" />
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
                        isEmi ? "text-sky-500" : paymentMethod === 'udhar' ? "text-orange-500" : "text-emerald-500"
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
                    placeholder="Enter customer name..."
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
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
                  <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 focus-within:ring-2 focus-within:ring-emerald-500 transition-colors">
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
                    {t('emailFieldLabel')} <span className="text-emerald-500 dark:text-emerald-400 normal-case font-normal">— {t('billWillBeSent')}</span>
                  </label>
                  <input
                    type="email"
                    placeholder="customer@example.com"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm transition-colors"
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
                  className="flex-1 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 py-3 rounded-xl font-bold hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmBill}
                  disabled={isGeneratingBill || (remainingAmount > 0 && !customerName.trim())}
                  className={cn(
                    'flex-[2] py-3 rounded-xl font-black text-base transition-all active:scale-95 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2',
                    'bg-emerald-500 text-slate-900 hover:bg-emerald-400 shadow-emerald-500/20'
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
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm flex flex-col max-h-[95vh] shadow-2xl overflow-hidden">

            {/* ── Sticky header ── */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
              <span className="text-emerald-500 dark:text-emerald-400 font-black text-base flex items-center gap-2">
                <CheckCircle size={18} /> Bill Generated
              </span>
              <button onClick={() => { setShowBillModal(false); setWaUrl(null); setSendStatus(null); }} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 p-1 transition-colors">
                <X size={22} />
              </button>
            </div>

            {/* ── Scrollable bill preview ── */}
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

              {/* WhatsApp CTA — shown when customer mobile was provided */}
              {waUrl && (
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 bg-[#25D366] text-white py-3 rounded-xl font-bold text-sm hover:bg-[#1ebe5d] active:scale-95 transition-all animate-pulse"
                  onClick={() => setWaUrl(null)}
                >
                  <MessageCircle size={18} />
                  Send Bill on WhatsApp
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
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="h-full flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>;

  if (profile.subscriptionPlan === 'wholesale') {
    return <WholesaleBillingUI />;
  }

  return <StandardBillingUI />;
}
