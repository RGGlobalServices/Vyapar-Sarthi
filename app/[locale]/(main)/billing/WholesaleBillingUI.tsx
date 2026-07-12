'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useUdharStore, useAuthStore } from '@/lib/store';
import { useBillingEngine } from '@/lib/hooks/useBillingEngine';
import { useBusinessStore } from '@/lib/businessStore';
import { performSmartSearch } from '@/lib/smartSearch';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  Search, Scan, Trash2, Plus, Minus, CreditCard, IndianRupee,
  User, X, Printer, Calculator as CalcIcon, FileText, Smartphone,
  CheckCircle, Loader2, ArrowRight, MessageCircle, Download, AlertCircle
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { BillSlip, generateWhatsAppText } from '@/components/BillSlip';
import { uploadInvoiceToSupabase } from '@/lib/supabaseStorage';

const CameraScanner = dynamic(() => import('@/components/CameraScanner'), { ssr: false });
const CartQuantityInput = ({ item, updateQuantity, removeItem }: any) => {
  const [localVal, setLocalVal] = useState(item.quantity.toString());
  useEffect(() => {
    if (Number(localVal) !== item.quantity) setLocalVal(item.quantity.toString());
  }, [item.quantity, localVal]);

  return (
    <input
      type="number"
      className="w-16 text-center py-1 bg-transparent border border-slate-200 dark:border-slate-700 rounded font-mono text-sm focus:ring-1 focus:ring-emerald-500 outline-none"
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
      step="any"
      min="0"
    />
  );
};

const CartPriceInput = ({ item, updatePrice }: any) => {
  const [localVal, setLocalVal] = useState(item.price.toString());
  useEffect(() => {
    if (Number(localVal) !== item.price) setLocalVal(item.price.toString());
  }, [item.price, localVal]);

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
  const { customers: udharCustomers, fetchCustomers, addUdharFromBill } = useUdharStore();
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
  const [showCamera, setShowCamera] = useState(false);
  const [isWholesale, setIsWholesale] = useState(true);

  // Manual Add
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualProduct, setManualProduct] = useState({ name: '', price: '', unit: 'Unit', variant: '' });

  // Checkout Modal
  const [showCheckout, setShowCheckout] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);

  // Bill Success Modal
  const [showBillModal, setShowBillModal] = useState(false);
  const [lastBill, setLastBill] = useState<any>(null);
  
  // Auto-send states
  const [sendStatus, setSendStatus] = useState<{ email: boolean | null } | null>(null);
  const [waUrl, setWaUrl] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const componentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchProducts();
    fetchCustomers();
    // Auto-focus search on load
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }, []);

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
  useEffect(() => {
    let hasChanges = false;
    items.forEach(item => {
      const product = products.find(p => p.id === item.id);
      if (product) {
        const newPrice = getPrice(product, item.variant || undefined, isWholesale);
        if (item.price !== newPrice) {
          updatePrice(item.id as any, newPrice, item.variant);
          hasChanges = true;
        }
      }
    });
  }, [isWholesale, products, getPrice, items, updatePrice]);

  const addToCart = useCallback((product: any, variant?: string) => {
    const existingItem = items.find(i => i.id === product.id && i.variant === variant);
    if (existingItem) {
      updateQuantity(existingItem.id, existingItem.quantity + 1);
    } else {
      const defaultQty = product.is_loose ? 0.5 : 1;
      const price = getPrice(product, variant);
      const cost = product.wholesaleCost || 0;
      
      addItem({
        id: product.id || Math.random().toString(),
        name: product.name,
        unit: product.baseUnit || product.unit,
        variant,
        quantity: defaultQty,
        price,
        profit: price - cost,
        total: Math.round(price * defaultQty),
        is_loose: !!product.is_loose,
      });
    }
    setSearch('');
    setSearchResults([]);
    searchInputRef.current?.focus();
  }, [items, addItem, updateQuantity, getPrice]);

  const handleScan = useCallback((barcode: string) => {
    const product = products.find(p => p.barcode === barcode || p.sku === barcode);
    if (product) {
      addToCart(product);
    }
  }, [addToCart, products]);

  // Keyboard Shortcuts & Hardware Scanner
  useEffect(() => {
    let barcodeBuffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();

      // Keyboard Shortcuts
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

      // Hardware Scanner Logic
      if (now - lastKeyTime > 50) {
        barcodeBuffer = '';
      }

      if (e.key === 'Enter' && barcodeBuffer.length >= 3) {
        e.preventDefault();
        handleScan(barcodeBuffer);
        barcodeBuffer = '';
        if (document.activeElement instanceof HTMLInputElement) {
          document.activeElement.blur();
        }
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        barcodeBuffer += e.key;
      }
      lastKeyTime = now;
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleScan, items.length, showCheckout, showBillModal]);

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
    const clone = componentRef.current.cloneNode(true) as HTMLElement;
    clone.style.position = 'fixed';
    clone.style.top = '0';
    clone.style.left = '-9999px';
    clone.style.width = '320px'; 
    clone.style.height = 'auto';
    clone.style.backgroundColor = '#ffffff';
    clone.style.visibility = 'visible';
    document.body.appendChild(clone);
    try {
      await new Promise(r => setTimeout(r, 100));
      const canvas = await html2canvas(clone, { scale: 3, useCORS: true, backgroundColor: '#ffffff', logging: false });
      const imgData = canvas.toDataURL('image/png');
      const pdfWidth = 80;
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pdfWidth, pdfHeight] });
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
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
      alert('Failed to download PDF. Please try again.');
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
        alert('Could not share PDF. Try downloading it instead.');
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

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;
    
    if (remainingAmount > 0 && !customerName.trim()) {
      alert("Customer Name is required for Udhar / Remaining balances.");
      return;
    }
    if (collectedAmount > total) {
      alert("Collected amount cannot be greater than Total bill.");
      return;
    }
    
    setIsGenerating(true);

    try {
      const saleItems = items.map(item => ({
        product_id: typeof item.id === 'string' && !item.id.includes('.') ? item.id : null,
        unit: item.unit,
        variant: item.variant || null,
        quantity: item.quantity,
        price_per_unit: item.price,
        margin_per_unit: item.profit || 0,
      }));

      const payload = {
        customer_name: customerName.trim() || null,
        customer_mobile: customerMobile.trim() || null,
        customer_email: customerEmail.trim() || null,
        items: saleItems,
        total_amount: total,
        total_profit: items.reduce((acc, item) => acc + ((item.profit || 0) * item.quantity), 0),
        payment_type: 'Split',
        amount_paid: collectedAmount,
        payment_details: { ...splitPayments, udhar: remainingAmount },
      };

      const res = await api.post('/billing/', payload);
      const dbSale = res.data;
      const billNumber = `INV-${dbSale.id.substring(0, 8).toUpperCase()}`;

      const billData = {
        customerName: customerName.trim() || undefined,
        customerMobile: customerMobile.trim() || undefined,
        items: [...items],
        total,
        discount,
        amountPaid: collectedAmount,
        remainingAmount,
        paymentMethod: 'Split',
        splitPayments: { ...splitPayments, udhar: remainingAmount },
        billNumber,
        date: new Date().toLocaleDateString(),
      };
      setLastBill(billData);

      clearCart();
      setShowCheckout(false);
      setShowBillModal(true);

      const phone = customerMobile.trim();
      const email = customerEmail.trim();
      if (phone || email) {
        autoSendAfterBill(billData, phone, email);
      }

    } catch (err) {
      console.error('Failed to generate bill', err);
      alert('Failed to generate bill.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleManualAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualProduct.name || !manualProduct.price) return;
    addItem({
      id: Math.random().toString(),
      name: manualProduct.name,
      unit: manualProduct.unit,
      variant: manualProduct.variant || undefined,
      quantity: 1,
      price: Number(manualProduct.price),
      profit: 0,
      total: Number(manualProduct.price),
      is_loose: false,
    });
    setManualProduct({ name: '', price: '', unit: 'Unit', variant: '' });
    setShowManualAdd(false);
    searchInputRef.current?.focus();
  };

  return (
    <div className="min-h-[calc(100vh-80px)] lg:h-[calc(100vh-80px)] flex flex-col lg:flex-row gap-4 overflow-y-auto lg:overflow-hidden">
      {/* LEFT PANEL: Search & Cart Table */}
      <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 lg:overflow-hidden">
        
        {/* Top Bar: Search & Scanner */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex flex-wrap gap-3 items-center">
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
                        Stock: {p.totalStock} {p.baseUnit} • Retail: ₹{p.sellingPrice} • Wholesale: ₹{p.wholesaleCost}
                      </div>
                    </div>
                    <Plus size={16} className="text-emerald-500" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => setShowCamera(true)}
            className="px-4 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-2 shadow-sm"
          >
            <Scan size={20} /> {t('mobileScanner') || 'Mobile Scanner'}
          </button>
          <button
            onClick={() => setShowManualAdd(true)}
            className="px-4 py-3 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 rounded-xl font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors flex items-center gap-2 shadow-sm"
          >
            <Plus size={20} /> {t('quickAdd') || 'Quick Add'} <span className="text-[10px] bg-emerald-200/50 dark:bg-emerald-900 px-1.5 rounded ml-1">Ctrl+K</span>
          </button>
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
              ) : items.map((item, idx) => (
                <tr key={`${item.id}-${item.variant}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group">
                  <td className="px-4 py-3 text-slate-400">{idx + 1}</td>
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-900 dark:text-white">{item.name}</p>
                    {item.variant && <p className="text-xs text-slate-500">{item.variant}</p>}
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
                      <CartQuantityInput item={item} updateQuantity={updateQuantity} removeItem={removeItem} />
                      <button onClick={() => updateQuantity(item.id as any, item.quantity + (item.is_loose ? 0.5 : 1), item.variant)} className="w-6 h-6 flex items-center justify-center rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-emerald-100 hover:text-emerald-600 transition-colors">
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
                    <button onClick={() => removeItem(item.id as any, item.variant)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-colors opacity-0 group-hover:opacity-100">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* RIGHT PANEL: Summary & Action */}
      <div className="w-full md:w-80 flex flex-col gap-4">
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
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-5 flex flex-col flex-1">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">{t('orderSummary')}</h2>
          
          <div className="space-y-3 flex-1">
            <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
              <span>{t('itemsCount', { count: items.length })}</span>
              <span>₹{subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400 items-center">
              <span>{t('discount')}</span>
              <input
                type="number"
                className="w-20 text-right py-1 px-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded outline-none focus:ring-1 focus:ring-emerald-500 text-slate-900 dark:text-white"
                value={discount || ''}
                onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
            
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

          <div className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-800">
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

      {/* Camera Scanner Modal (Continuous) */}
      {showCamera && (
        <CameraScanner
          continuous={true}
          onScan={(barcode) => {
            const product = products.find(p => p.barcode === barcode || p.sku === barcode);
            if (product) addToCart(product);
          }}
          onClose={() => setShowCamera(false)}
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
                <label className="text-xs font-bold text-slate-500 mb-1 block">Selling Price</label>
                <input required type="number" className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-1 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white"
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
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-emerald-50 dark:bg-emerald-900/20">
              <h3 className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                <CreditCard size={20} /> {t('checkout') || 'Checkout'}
              </h3>
              <button onClick={() => setShowCheckout(false)} className="text-emerald-600/50 hover:text-emerald-700 dark:hover:text-emerald-300"><X size={20} /></button>
            </div>
            
            <form onSubmit={handleCheckout} className="p-6 space-y-5">
              <div className="relative">
                <label className="text-xs font-bold text-slate-500 mb-1 block">
                  {t('nameLabel')}
                  {remainingAmount > 0 && <span className="text-orange-400 normal-case font-normal ml-1">*Required for Udhar</span>}
                </label>
                <input className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white transition-all"
                  value={customerName} 
                  onChange={e => {
                    setCustomerName(e.target.value);
                    setShowCustomerDropdown(true);
                  }} 
                  onFocus={() => setShowCustomerDropdown(true)}
                  onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                  placeholder={t('enterNamePlaceholder') || "Enter name or leave blank"} />
                  
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
                <label className="text-xs font-bold text-slate-500 mb-1 block">{t('mobileLabel') || 'Mobile'}</label>
                <input type="tel" className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white transition-all"
                  value={customerMobile} onChange={e => setCustomerMobile(e.target.value)} placeholder={t('waPlaceholder') || "WhatsApp number for bill"} />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">{t('emailLabel') || 'Email'}</label>
                <input type="email" className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white transition-all"
                  value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder={t('emailPlaceholder') || "For auto email bill receipt"} />
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 block text-center">
                  {t('paymentSplit') || 'Payment Split'} (Total: ₹{total.toLocaleString()})
                </label>
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
                      {t('card') || 'Card'}
                    </label>
                    <input type="number" min={0} className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-mono font-bold text-slate-900 dark:text-white"
                      value={splitPayments.card === 0 ? '' : splitPayments.card} placeholder="0"
                      onChange={e => setSplitPayments(p => ({ ...p, card: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)) }))} />
                  </div>
                </div>
                
                {remainingAmount > 0 && (
                  <div className="flex justify-between items-center bg-orange-50 dark:bg-orange-500/10 px-3 py-2.5 rounded-lg border border-orange-200 dark:border-orange-500/20 mb-2">
                    <span className="text-xs font-bold text-orange-600 dark:text-orange-400">{t('remainingUdhar') || 'Remaining (Udhar)'}</span>
                    <span className="text-sm font-black text-orange-600 dark:text-orange-400 font-mono">₹{remainingAmount.toLocaleString()}</span>
                  </div>
                )}
                {collectedAmount > total && (
                  <div className="flex justify-between items-center bg-blue-50 dark:bg-blue-500/10 px-3 py-2.5 rounded-lg border border-blue-200 dark:border-blue-500/20 mb-2">
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{t('changeReturn') || 'Change Return'}</span>
                    <span className="text-sm font-black text-blue-600 dark:text-blue-400 font-mono">₹{(collectedAmount - total).toLocaleString()}</span>
                  </div>
                )}
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
      {showBillModal && lastBill && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowBillModal(false)} />
          <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
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
              <div className="bg-white border border-slate-200 shadow-sm mx-auto max-w-sm rounded">
                <BillSlip
                  {...lastBill}
                  storeName={profile.shopName || user?.storeName || 'Wholesale Store'}
                  storeAddress={profile.address}
                  storeMobile={profile.mobile}
                  logoUrl={profile.logoUrl}
                  gst={profile.gst || undefined}
                  pan={profile.pan || undefined}
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
                  onClick={() => { setShowBillModal(false); window.print(); }}
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
      )}
    </div>
  );
}
