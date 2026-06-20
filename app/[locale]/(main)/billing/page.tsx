'use client';
import {useState, useEffect, useRef, useCallback} from 'react';
import {useTranslations} from 'next-intl';
import {useCartStore, useUdharStore, useAuthStore} from '@/lib/store';
import {useBusinessStore} from '@/lib/businessStore';
import {getBusinessConfig} from '@/lib/businessConfig';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {
  Search, Scan, Trash2, Plus, Minus, CreditCard, IndianRupee,
  User, X, Printer, Calculator as CalcIcon, PlusCircle, Download,
  AlertCircle, CheckCircle, Zap, MessageCircle, ShieldCheck, Loader2
} from 'lucide-react';
import api from '@/lib/api';
import {cn} from '@/lib/utils';
import {BillSlip, generateWhatsAppText} from '@/components/BillSlip';
import {uploadInvoiceToSupabase} from '@/lib/supabaseStorage';
import Calculator from '@/components/Calculator';
import {performSmartSearch} from '@/lib/smartSearch';
import dynamic from 'next/dynamic';

const CameraScanner = dynamic(() => import('@/components/CameraScanner'), { ssr: false });

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

export default function BillingPage() {
  const t = useTranslations('Billing');
  const tP = useTranslations('Products');
  const {items, addItem, removeItem, updateQuantity, updatePrice, clearCart} = useCartStore();
  const {customers: udharCustomers, fetchCustomers, addUdharFromBill} = useUdharStore();
  const {user} = useAuthStore();
  const {profile} = useBusinessStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const effectiveBusinessType = mounted ? profile.businessType : 'kirana';
  const bizConfig = getBusinessConfig(effectiveBusinessType);
  const isElectronics = effectiveBusinessType === 'electronics';

  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [showBillModal, setShowBillModal] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [lastBill, setLastBill] = useState<any>(null);
  const [discount, setDiscount] = useState(0);
  const [amountPaid, setAmountPaid] = useState(0);
  const [showCalculator, setShowCalculator] = useState(false);
  const [manualProduct, setManualProduct] = useState({ name: '', price: '', unit: 'Unit' });
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [sendStatus, setSendStatus] = useState<{ email: boolean | null } | null>(null);
  const [waUrl, setWaUrl] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);

  // EMI state (electronics)
  const [emiMonths, setEmiMonths] = useState(6);
  const [emiDownPayment, setEmiDownPayment] = useState(0);
  const [emiInterestRate, setEmiInterestRate] = useState(0);

  const componentRef = useRef<HTMLDivElement>(null);

  const subtotal = items.reduce((acc, item) => acc + item.total, 0);
  const total = Math.max(0, subtotal - discount);

  const isEmi = paymentMethod === 'EMI';
  const emiPrincipal = Math.max(0, total - emiDownPayment);
  const emiMonthlyRate = emiInterestRate / 100 / 12;
  const emiMonthlyAmount = emiInterestRate > 0 && emiMonthlyRate > 0
    ? Math.round(emiPrincipal * emiMonthlyRate * Math.pow(1 + emiMonthlyRate, emiMonths) / (Math.pow(1 + emiMonthlyRate, emiMonths) - 1))
    : Math.round(emiPrincipal / emiMonths);
  const emiTotalAmount = emiMonthlyAmount * emiMonths + emiDownPayment;

  const effectiveAmountPaid = isEmi ? emiDownPayment : amountPaid;
  const remainingAmount = isEmi ? 0 : Math.max(0, total - amountPaid);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/products');
        setProducts(res.data);
      } catch (err: any) {
        console.error('Failed to load products for billing:', {
          message: err.message || 'Unknown error',
          status: err.response?.status,
          data: err.response?.data,
          error: err
        });
      }
    };
    load();
    fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    if (!isEmi) setAmountPaid(total);
  }, [total, isEmi]);

  useEffect(() => {
    if (isEmi) setEmiDownPayment(Math.round(total * 0.2));
  }, [isEmi, total]);

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
    clone.style.width = '320px'; // Force specific width for POS slip
    clone.style.height = 'auto';
    clone.style.backgroundColor = '#ffffff';
    clone.style.visibility = 'visible';
    document.body.appendChild(clone);

    try {
      // Small delay to ensure styles are applied to the clone
      await new Promise(r => setTimeout(r, 100));
      
      const canvas = await html2canvas(clone, { 
        scale: 3, // Higher scale for better quality
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdfWidth = 80;
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      const pdf = new jsPDF({ 
        orientation: 'portrait', 
        unit: 'mm', 
        format: [pdfWidth, pdfHeight] 
      });
      
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

      // Normalize customer phone (strip non-digits, add country code)
      let phone = (lastBill?.customerMobile || '').replace(/\D/g, '');
      if (phone.length === 10) phone = `91${phone}`;
      else if (phone.length > 10 && phone.startsWith('0')) phone = `91${phone.substring(1)}`;

      if (phone.length >= 10) {
        // Phone known → upload PDF, open directly in that customer's WhatsApp chat (no contact picker)
        const publicUrl = await uploadInvoiceToSupabase(blob, fileName);
        const text = generateWhatsAppText({
          ...lastBill,
          storeName: user?.storeName,
          pdfUrl: publicUrl || undefined,
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

  const addToCart = useCallback((product: any) => {
    const defaultQty = product.is_loose ? 0.5 : 1;
    const price = product.sellingPrice || Number(product.price);
    addItem({
      id: product.id || Math.random(),
      name: product.name,
      unit: product.baseUnit || product.unit,
      quantity: defaultQty,
      price: price || 0,
      profit: (price || 0) - (product.wholesaleCost || 0),
      total: (price || 0) * defaultQty,
      is_loose: !!product.is_loose,
    });
    setSearch('');
    setSearchResults([]);
  }, [addItem]);

  const handleScan = useCallback((barcode: string) => {
    const product = products.find(p => p.barcode === barcode);
    if (product) addToCart(product);
    else alert('Product not found in inventory!');
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

      // If Enter key is pressed and we have a valid-looking barcode buffered
      if (e.key === 'Enter' && barcodeBuffer.length >= 3) {
        e.preventDefault(); // Prevent form submission
        handleScan(barcodeBuffer);
        
        // If the scanner typed into an input field, blur it to prevent issues
        if (document.activeElement instanceof HTMLInputElement) {
          document.activeElement.blur();
        }
        
        barcodeBuffer = '';
        return;
      }

      // Only capture printable characters
      if (e.key.length === 1) {
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
    addToCart({ name: manualProduct.name, sellingPrice: Number(manualProduct.price), baseUnit: manualProduct.unit, wholesaleCost: 0 });
    setManualProduct({ name: '', price: '', unit: 'Unit' });
    setShowManualAdd(false);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearch(value);
    if (value.length > 1) setSearchResults(performSmartSearch(products, value));
    else setSearchResults([]);
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
    try {
      const saleItems = items.map(item => ({
        product_id: typeof item.id === 'string' ? item.id : null,
        unit: item.unit,
        quantity: item.quantity,
        price_per_unit: item.price,
        margin_per_unit: item.profit || 0,
      }));

      const salePayload = {
        customer_id: udharInfo?.type === 'existing' ? udharInfo.customer?.id ?? null : null,
        items: saleItems,
        total_amount: total,
        total_profit: items.reduce((acc, item) => acc + (item.profit * item.quantity), 0),
        payment_type: paymentMethod,
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
        amountPaid: effectiveAmountPaid,
        remainingAmount,
        paymentMethod,
        billNumber,
        date: new Date().toLocaleDateString(),
        // EMI extras
        isEmi,
        emiMonths: isEmi ? emiMonths : undefined,
        emiDownPayment: isEmi ? emiDownPayment : undefined,
        emiMonthlyAmount: isEmi ? emiMonthlyAmount : undefined,
        emiInterestRate: isEmi ? emiInterestRate : undefined,
        emiTotalAmount: isEmi ? emiTotalAmount : undefined,
      };
      setLastBill(billData);

      if (remainingAmount > 0 && customerName.trim()) {
        await addUdharFromBill(customerName.trim(), remainingAmount, billNumber);
      }

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
    }
  };

  const autoSendAfterBill = async (billData: any, phone: string, email: string) => {
    setSendStatus(null);
    setWaUrl(null);

    try {
      // Upload PDF once — reused for both WhatsApp link and email attachment
      const { blob } = await generatePDFBlob();
      const fileName = `bill-${billData.billNumber || Date.now()}.pdf`;
      const pdfUrl = await uploadInvoiceToSupabase(blob, fileName);

      // Build wa.me link with pre-filled bill message
      if (phone) {
        const text = generateWhatsAppText({
          ...billData,
          storeName: (profile as any).shopName || user?.storeName,
          pdfUrl: pdfUrl || undefined,
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
        setSendStatus({ email: null }); // "sending…"
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



  const paymentOptions = [
    { id: 'Cash', label: t('cash'), icon: <IndianRupee size={18}/> },
    { id: 'UPI', label: t('upi'), icon: <CreditCard size={18}/> },
    { id: 'Udhar', label: t('udhar'), icon: <User size={18}/> },
    ...(isElectronics ? [{ id: 'EMI', label: 'EMI', icon: <Zap size={18}/> }] : []),
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full relative">
      {/* Left: Product Search & Cart */}
      <div className="lg:col-span-2 space-y-6 flex flex-col">
        {/* Business mode badge */}
        {bizConfig && (
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <span className="text-base">{bizConfig.emoji}</span>
            <span>{bizConfig.label} Mode</span>
            {isElectronics && (
              <span className="bg-sky-500/15 text-sky-400 border border-sky-500/30 px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1">
                <Zap size={9} />EMI Available
              </span>
            )}
          </div>
        )}

        <div className="flex gap-4 relative">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder={t('searchProduct')}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={search}
              onChange={handleSearchChange}
            />
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 w-full mt-2 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto">
                {searchResults.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
                    className="w-full text-left px-4 py-3 hover:bg-slate-800 flex justify-between items-center border-b border-slate-800 last:border-0"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-slate-200">{product.name}</p>
                        {product.is_loose && <span className="text-[9px] bg-amber-500/20 text-amber-400 font-black px-1.5 py-0.5 rounded uppercase">{tP('looseBadge')}</span>}
                      </div>
                      <p className="text-xs text-slate-500">
                        {product.category} · {product.base_unit}
                        {product.is_loose && <span className="ml-1 text-amber-400">· sell by weight</span>}
                        {product.model_number && <span className="ml-1 text-sky-400">· {product.model_number}</span>}
                        {product.warranty_months && <span className="ml-1 text-emerald-400">· {product.warranty_months}m warranty</span>}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-emerald-500">₹{product.selling_price}</p>
                      <p className="text-[10px] text-slate-500">MRP: ₹{product.mrp}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => setShowManualAdd(!showManualAdd)}
            className={cn(
              'px-4 py-3 rounded-xl font-bold flex items-center gap-2 transition-colors',
              showManualAdd ? 'bg-slate-800 text-emerald-500' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
            )}
          >
            <PlusCircle size={20} />
            <span className="hidden md:inline">Manual Add</span>
          </button>
          <button
            onClick={() => setIsScanning(!isScanning)}
            className="bg-emerald-500 text-slate-900 px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-400 transition-colors"
          >
            <Scan size={20} />
            <span className="hidden md:inline">{t('scanQR')}</span>
          </button>
        </div>

        {showManualAdd && (
          <Card className="bg-slate-900 border-emerald-500/30 animate-in slide-in-from-top-2 duration-200">
            <CardContent className="p-4">
              <form onSubmit={handleManualAdd} className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="text-xs text-slate-500 mb-1 block uppercase font-bold">Product Name</label>
                  <input
                    type="text" required placeholder="Enter item name..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none"
                    value={manualProduct.name}
                    onChange={e => setManualProduct({...manualProduct, name: e.target.value})}
                  />
                </div>
                <div className="w-28">
                  <label className="text-xs text-slate-500 mb-1 block uppercase font-bold">Price (₹)</label>
                  <input
                    type="number" required placeholder="0"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none"
                    value={manualProduct.price}
                    onChange={e => setManualProduct({...manualProduct, price: e.target.value})}
                  />
                </div>
                <div className="w-24">
                  <label className="text-xs text-slate-500 mb-1 block uppercase font-bold">Unit</label>
                  <select
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none"
                    value={manualProduct.unit}
                    onChange={e => setManualProduct({...manualProduct, unit: e.target.value})}
                  >
                    {bizConfig.defaultUnits.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <button type="submit" className="bg-emerald-500 text-slate-900 px-4 py-2 rounded-lg font-bold hover:bg-emerald-400">Add Item</button>
              </form>
            </CardContent>
          </Card>
        )}

        {isScanning && (
          <CameraScanner
            onScan={(result) => { handleScan(result); setIsScanning(false); }}
            onClose={() => setIsScanning(false)}
          />
        )}

        <Card className="bg-slate-900 border-slate-800 flex-1 overflow-hidden flex flex-col">
          <CardHeader className="border-b border-slate-800">
            <CardTitle className="text-slate-200 flex justify-between items-center">
              <span>Items</span>
              <span className="text-sm font-normal text-slate-400">{items.length} items</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[600px]">
                <thead className="bg-slate-800/50 text-slate-400 text-xs uppercase sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-3">Item</th>
                  <th className="px-6 py-3">Unit</th>
                  <th className="px-6 py-3">Qty</th>
                  <th className="px-6 py-3 text-right">Price</th>
                  <th className="px-6 py-3 text-right">Total</th>
                  <th className="px-6 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {items.map((item) => (
                  <tr key={`${item.id}-${item.unit}`} className="text-slate-200 hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4 font-medium">{item.name}</td>
                    <td className="px-6 py-4 text-sm text-slate-400">{item.unit}</td>
                    <td className="px-6 py-4">
                      {item.is_loose ? (
                        <div className="flex flex-col gap-1.5 min-w-[150px]">
                          {/* Quantity input */}
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="0.05"
                              min="0.05"
                              value={item.quantity}
                              onChange={e => {
                                const v = parseFloat(e.target.value);
                                if (v > 0) updateQuantity(item.id, v);
                              }}
                              className="w-20 bg-slate-950 border border-emerald-700/50 rounded px-2 py-1 text-center text-emerald-400 font-bold text-sm focus:ring-1 focus:ring-emerald-500 outline-none"
                            />
                            <span className="text-xs text-slate-500">{item.unit}</span>
                            {looseEquivLabel(item.quantity, item.unit) && (
                              <span className="text-[10px] text-amber-400 font-bold">
                                = {looseEquivLabel(item.quantity, item.unit)}
                              </span>
                            )}
                          </div>
                          {/* Rate info: ₹X per Kg */}
                          <p className="text-[10px] text-slate-500">
                            {t('ratePerUnit')}: <span className="text-emerald-400 font-bold">₹{item.price}</span> {t('per')} {item.unit}
                            {' · '}<span className="text-amber-300 font-semibold">= ₹{item.total.toFixed(2)}</span>
                          </p>
                          {/* Preset buttons */}
                          <div className="flex flex-wrap gap-1">
                            {getLoosePresets(item.unit).map(p => (
                              <button
                                key={p.l}
                                onClick={() => updateQuantity(item.id, p.v)}
                                className={cn(
                                  'text-[10px] px-1.5 py-0.5 rounded transition-colors font-medium',
                                  item.quantity === p.v
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                )}
                              >{p.l}</button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <button onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))} className="p-1 hover:bg-slate-700 rounded"><Minus size={14}/></button>
                          <span className="w-8 text-center">{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="p-1 hover:bg-slate-700 rounded"><Plus size={14}/></button>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <input
                        type="number"
                        className="w-20 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-right text-emerald-500 font-bold focus:ring-1 focus:ring-emerald-500 outline-none"
                        value={item.price}
                        onChange={(e) => updatePrice(item.id, Number(e.target.value))}
                      />
                    </td>
                    <td className="px-6 py-4 text-right font-bold">₹{item.total}</td>
                    <td className="px-6 py-4 text-center">
                      <button onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-300 p-2"><Trash2 size={18}/></button>
                    </td>
                  </tr>
                ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-20 text-center text-slate-500">
                        No items in cart. Start scanning or searching!
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
      <div className="space-y-6">
        <div className="flex justify-end relative">
          <button
            onClick={() => setShowCalculator(!showCalculator)}
            className={cn(
              'p-3 rounded-xl border transition-all flex items-center gap-2 font-bold',
              showCalculator ? 'bg-emerald-500 text-slate-900 border-emerald-500' : 'bg-slate-900 border-slate-800 text-slate-400'
            )}
          >
            <CalcIcon size={20} />
            Calculator
          </button>
          {showCalculator && (
            <div className="absolute top-full right-0 mt-2 z-[60]">
              <Calculator onClose={() => setShowCalculator(false)} />
            </div>
          )}
        </div>

        {/* Payment Methods */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-slate-200">{t('paymentMethod')}</CardTitle>
          </CardHeader>
          <CardContent className={cn('grid gap-3', paymentOptions.length === 4 ? 'grid-cols-2' : 'grid-cols-3')}>
            {paymentOptions.map(opt => (
              <PaymentButton
                key={opt.id}
                active={paymentMethod === opt.id}
                onClick={() => setPaymentMethod(opt.id)}
                icon={opt.icon}
                label={opt.label}
              />
            ))}
          </CardContent>
        </Card>

        {/* EMI Configuration (electronics only) */}
        {isEmi && (
          <Card className="bg-sky-500/5 border-sky-500/30">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-2 text-sky-400 font-bold text-sm">
                <Zap size={16} />
                EMI Configuration
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Down Payment (₹)</label>
                <input
                  type="number" min={0} max={total}
                  className="w-full bg-slate-900 border border-sky-500/40 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                  value={emiDownPayment}
                  onChange={e => setEmiDownPayment(Math.min(total, Math.max(0, Number(e.target.value))))}
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">EMI Tenure</label>
                <div className="grid grid-cols-4 gap-2">
                  {[3, 6, 9, 12, 18, 24, 36, 48].map(m => (
                    <button
                      key={m} type="button"
                      onClick={() => setEmiMonths(m)}
                      className={cn(
                        'py-1.5 rounded-lg text-xs font-bold border transition-colors',
                        emiMonths === m
                          ? 'bg-sky-500 border-sky-500 text-slate-900'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-sky-500/40'
                      )}
                    >
                      {m}m
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Interest Rate (% per annum, 0 = No Cost)</label>
                <input
                  type="number" min={0} max={36} step={0.1}
                  className="w-full bg-slate-900 border border-sky-500/40 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                  value={emiInterestRate}
                  onChange={e => setEmiInterestRate(Math.max(0, Number(e.target.value)))}
                />
              </div>

              {/* EMI Summary */}
              <div className="bg-slate-900 rounded-xl p-3 space-y-2 border border-slate-800">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Principal Amount</span>
                  <span className="text-slate-200 font-semibold">₹{emiPrincipal.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Down Payment</span>
                  <span className="text-emerald-400 font-semibold">₹{emiDownPayment.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-400 border-t border-slate-800 pt-2">
                  <span className="font-bold text-sky-400">Monthly EMI</span>
                  <span className="font-black text-sky-400 text-base">₹{emiMonthlyAmount.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Total Payable ({emiMonths} months)</span>
                  <span>₹{emiTotalAmount.toLocaleString('en-IN')}</span>
                </div>
                {emiInterestRate === 0 && (
                  <div className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 rounded px-2 py-1">
                    <ShieldCheck size={10} />No Cost EMI — No interest charged
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Order Summary */}
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-6 space-y-4">
            <div className="flex justify-between text-slate-400">
              <span>{t('subtotal')}</span>
              <span>₹{subtotal.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between items-center text-slate-400">
              <span>{t('discount')}</span>
              <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1">
                <span className="text-emerald-500">₹</span>
                <input
                  type="number"
                  className="w-16 bg-transparent text-emerald-500 font-bold outline-none text-right"
                  value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="border-t border-slate-800 pt-4 flex justify-between items-center">
              <span className="text-xl font-bold text-slate-200">{t('total')}</span>
              <span className="text-3xl font-black text-emerald-500">₹{total.toLocaleString('en-IN')}</span>
            </div>

            {isEmi ? (
              <div className="border-t border-slate-800 pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Due Today (Down Payment)</span>
                  <span className="text-emerald-400 font-bold">₹{emiDownPayment.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-sky-400 font-semibold">Monthly EMI × {emiMonths}</span>
                  <span className="text-sky-400 font-black">₹{emiMonthlyAmount.toLocaleString('en-IN')}/mo</span>
                </div>
              </div>
            ) : (
              <div className="border-t border-slate-800 pt-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-slate-300 font-semibold">Amount Paid</span>
                  <div className="flex items-center gap-2 bg-slate-950 border border-emerald-500/40 rounded-lg px-3 py-1">
                    <span className="text-emerald-500">₹</span>
                    <input
                      type="number" min={0} max={total}
                      className="w-20 bg-transparent text-emerald-500 font-bold outline-none text-right"
                      value={amountPaid}
                      onChange={(e) => setAmountPaid(Math.min(total, Math.max(0, Number(e.target.value))))}
                    />
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className={cn('font-semibold', remainingAmount > 0 ? 'text-orange-400' : 'text-slate-500')}>
                    Remaining (Udhar)
                  </span>
                  <span className={cn('text-2xl font-black', remainingAmount > 0 ? 'text-orange-500' : 'text-slate-600')}>
                    ₹{remainingAmount}
                  </span>
                </div>
                {remainingAmount > 0 && (
                  <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2 text-xs text-orange-400">
                    <AlertCircle size={14} />
                    ₹{remainingAmount} will be added to Udhar Khata
                  </div>
                )}
              </div>
            )}
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

      {/* Customer Name Modal */}
      {showCustomerModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <Card className="bg-slate-900 border-slate-700 w-full max-w-md shadow-2xl">
            <CardHeader className="border-b border-slate-800 flex flex-row items-center justify-between">
              <CardTitle className="text-slate-200 flex items-center gap-2">
                <User size={20} className="text-emerald-500" />
                Customer Details
              </CardTitle>
              <button onClick={() => setShowCustomerModal(false)} className="text-slate-400 hover:text-slate-200">
                <X size={24} />
              </button>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
              {/* Summary */}
              <div className="bg-slate-800 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm text-slate-400">
                  <span>Total Bill</span>
                  <span className="text-slate-200 font-bold">₹{total.toLocaleString('en-IN')}</span>
                </div>
                {isEmi ? (
                  <>
                    <div className="flex justify-between text-sm text-slate-400">
                      <span>Down Payment Today</span>
                      <span className="text-emerald-400 font-bold">₹{emiDownPayment.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-sm border-t border-slate-700 pt-2">
                      <span className="text-sky-400 font-semibold">EMI ({emiMonths} months)</span>
                      <span className="text-sky-400 font-black">₹{emiMonthlyAmount.toLocaleString('en-IN')}/mo</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between text-sm text-slate-400">
                      <span>Amount Paid</span>
                      <span className="text-emerald-400 font-bold">₹{amountPaid.toLocaleString('en-IN')}</span>
                    </div>
                    {remainingAmount > 0 && (
                      <div className="flex justify-between text-sm border-t border-slate-700 pt-2">
                        <span className="text-orange-400 font-semibold">Remaining (Udhar)</span>
                        <span className="text-orange-500 font-black">₹{remainingAmount}</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Customer Name + Mobile */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-2 uppercase font-bold">
                    Customer Name{' '}
                    {remainingAmount > 0 && !isEmi && <span className="text-orange-400 normal-case font-normal">*Required for Udhar</span>}
                    {isEmi && <span className="text-sky-400 normal-case font-normal">*Required for EMI tracking</span>}
                  </label>
                  <input
                    type="text"
                    placeholder="Enter customer name..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-2 uppercase font-bold">
                    WhatsApp Number <span className="text-slate-500 normal-case font-normal">— bill auto-sent</span>
                  </label>
                  <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 focus-within:ring-2 focus-within:ring-emerald-500">
                    <span className="text-slate-400 text-sm font-bold select-none">+91</span>
                    <input
                      type="tel"
                      placeholder="10-digit mobile number"
                      maxLength={10}
                      className="flex-1 bg-transparent text-slate-100 outline-none text-sm"
                      value={customerMobile}
                      onChange={e => setCustomerMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-2 uppercase font-bold">
                    Email <span className="text-slate-500 normal-case font-normal">— bill auto-sent</span>
                  </label>
                  <input
                    type="email"
                    placeholder="customer@example.com"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                    value={customerEmail}
                    onChange={e => setCustomerEmail(e.target.value)}
                  />
                </div>
              </div>

              {/* Udhar info */}
              {!isEmi && remainingAmount > 0 && customerName.trim() && (
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

              {isEmi && customerName.trim() && (
                <div className="flex items-start gap-3 rounded-xl px-4 py-3 text-sm bg-sky-500/10 border border-sky-500/20 text-sky-400">
                  <Zap size={16} className="mt-0.5 flex-shrink-0" />
                  <span>EMI of ₹{emiMonthlyAmount.toLocaleString('en-IN')}/month for {emiMonths} months will be recorded for <strong>{customerName.trim()}</strong>.</span>
                </div>
              )}

              {!isEmi && remainingAmount > 0 && !customerName.trim() && (
                <div className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-2 text-xs text-slate-500">
                  <AlertCircle size={13} />
                  Enter customer name to save ₹{remainingAmount} to Udhar Khata.
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setShowCustomerModal(false)}
                  className="flex-1 bg-slate-800 text-slate-300 py-3 rounded-xl font-bold hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmBill}
                  disabled={!isEmi && remainingAmount > 0 && !customerName.trim()}
                  className={cn(
                    'flex-[2] py-3 rounded-xl font-black text-base transition-all active:scale-95 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed',
                    isEmi
                      ? 'bg-sky-500 text-slate-900 hover:bg-sky-400 shadow-sky-500/20'
                      : 'bg-emerald-500 text-slate-900 hover:bg-emerald-400 shadow-emerald-500/20'
                  )}
                >
                  {remainingAmount > 0 ? 'Confirm Udhar Sale' : 'Confirm & Print Slip'}
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm flex flex-col max-h-[95vh] shadow-2xl overflow-hidden">

            {/* ── Sticky header ── */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 flex-shrink-0">
              <span className="text-emerald-400 font-black text-base flex items-center gap-2">
                <CheckCircle size={18} /> Bill Generated
              </span>
              <button onClick={() => { setShowBillModal(false); setWaUrl(null); setSendStatus(null); }} className="text-slate-400 hover:text-slate-200 p-1">
                <X size={22} />
              </button>
            </div>

            {/* ── Scrollable bill preview ── */}
            <div id="print-area" className="flex-1 overflow-y-auto bg-white">
              <BillSlip
                ref={componentRef}
                {...lastBill}
                storeName={profile.shopName}
                storeAddress={profile.address}
                storeMobile={profile.mobile}
                logoUrl={profile.logoUrl}
              />
            </div>

            {/* ── Sticky footer ── */}
            <div className="flex-shrink-0 bg-slate-900 border-t border-slate-800 p-3 space-y-2">
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
                  EMI: ₹{lastBill.emiMonthlyAmount?.toLocaleString('en-IN')}/mo × {lastBill.emiMonths} months
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
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 text-xs">
                  {sendStatus.email === null ? (
                    <span className="text-slate-400 flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> Sending email…</span>
                  ) : sendStatus.email ? (
                    <span className="text-emerald-400">✓ Email sent to customer</span>
                  ) : (
                    <span className="text-slate-400">Email not sent — check SMTP settings</span>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={handlePrint}
                  className="flex flex-col items-center justify-center gap-1 bg-emerald-500 text-slate-900 py-2.5 rounded-xl font-bold hover:bg-emerald-400 transition-colors active:scale-95 text-xs"
                >
                  <Printer size={17} />Print
                </button>
                <button
                  onClick={handleDownloadPDF}
                  className="flex flex-col items-center justify-center gap-1 bg-blue-500 text-white py-2.5 rounded-xl font-bold hover:bg-blue-400 transition-colors active:scale-95 text-xs"
                >
                  <Download size={17} />PDF
                </button>
                <button
                  onClick={handleWhatsAppPDF}
                  disabled={isSharing}
                  className="flex flex-col items-center justify-center gap-1 bg-slate-700 text-slate-200 py-2.5 rounded-xl font-bold hover:bg-slate-600 transition-colors active:scale-95 text-xs disabled:opacity-70"
                >
                  {isSharing ? <Loader2 size={17} className="animate-spin" /> : <MessageCircle size={17} />}
                  {isSharing ? 'Sharing…' : 'Share'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setShowBillModal(false)}
                  className="flex items-center justify-center gap-1.5 bg-slate-800 text-slate-300 py-2.5 rounded-xl font-semibold hover:bg-slate-700 transition-colors text-sm"
                >
                  Continue
                </button>
                <button
                  onClick={() => { setShowBillModal(false); clearCart(); }}
                  className="flex items-center justify-center gap-1.5 bg-red-500/10 text-red-400 py-2.5 rounded-xl font-semibold hover:bg-red-500/20 transition-colors text-sm"
                >
                  New Bill
                </button>
              </div>
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
        active ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
      )}
    >
      {icon}
      <span className="text-xs font-bold uppercase">{label}</span>
    </button>
  );
}
