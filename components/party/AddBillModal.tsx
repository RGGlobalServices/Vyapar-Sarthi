'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Camera, Upload, Loader2, ReceiptText, ImageIcon, Trash2, ScanLine, Sparkles,
  Plus, Search, Package, AlertTriangle, Check, ChevronLeft, Wallet, Coins, PackagePlus,
} from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { parseSizeRange } from '@/lib/sizeRange';

interface PartyDoc {
  id: string;
  url: string;
  uploadedAt: string;
  transactionId?: string;
}

interface VariantOption {
  key: string;
  colour: string | null;
  size: string | null;
  stock: number | null;
  price?: number | null;
}

interface ProductPickerRow {
  id: string;
  name: string;
  price: number;
  unit: string | null;
  currentStock: number | null;
  gstPercent: number;
  variants: VariantOption[];
}

interface ExtractedLine {
  name: string;
  colour: string | null;
  size: string | null;
  scannedVariantKey: string | null;
  quantity: number | null;
  pricePerUnit: number | null;
  amount: number | null;
  unit: string | null;
  matchedProductId: string | null;
  matchedProductName: string | null;
  matchedProductPrice: number | null;
  matchedProductUnit: string | null;
  matchedProductStock: number | null;
  matchedProductGstPercent: number | null;
  matchedVariantKey: string | null;
  matchedVariantStock: number | null;
  matchScore: number;
}

/**
 * A line item as it will be submitted to POST /billing.
 *
 * `qtyText` / `rateText` / `gstText` are kept as **strings** so the user can
 * blank the field or type "0" while editing without the value snapping back
 * to a default on every keystroke. See feedback memory
 * `number-inputs-allow-blank-editing` — this pattern applies to any editable
 * number input in this app. Numeric maths uses `Number(qtyText) || 0`.
 *
 * `productId=null` means the shopkeeper couldn't (or didn't) link it to a
 * real product — the sale still records the line (with the typed name and
 * rate) but stock is NOT touched for it, mirroring how the existing manual
 * billing path handles unlinked items.
 */
interface BillLine {
  key: string;
  productId: string | null;
  name: string;
  /** "<colour> / <size>" — the exact key that /billing's stock-decrement
   *  code matches against Product.variants[]. Free-text when the product
   *  has no variants (still saved on the SaleItem as metadata for the
   *  paper-trail), or one of the product's own variant keys when it does. */
  variant: string;
  /** Full list of variant options available for the linked product — powers
   *  the chip picker when the product has variants. Empty when it doesn't. */
  variantOptions: VariantOption[];
  /** Stock for the specific variant, when a variant is selected AND the
   *  product tracks per-variant stock. Falls back to product-level stock. */
  variantStock: number | null;
  qtyText: string;
  rateText: string;
  gstText: string;
  unit: string | null;
  currentStock: number | null;
}

type Step = 'entry' | 'review' | 'finalize';
type PaymentMode = 'Cash' | 'UPI' | 'Card' | 'Udhar' | 'Split';

const num = (s: string): number => {
  const n = Number((s ?? '').toString().trim());
  return Number.isFinite(n) ? n : 0;
};

/**
 * "Add Bill" — the shopkeeper's flow for bills they wrote on paper for a
 * party but still want the system to know about, so stock + ledger stay
 * honest. Three steps: entry → review → finalize. Save posts to the
 * existing POST /api/v1/billing with `is_manual: true`, reusing that
 * endpoint's Sale creation, stock decrement (base + size_variants + Udyog
 * variants + wholesale batches), Udhar posting, and CashBook logic — same
 * code path as normal billing, so behavior can't drift.
 */
export default function AddBillModal({
  partyId,
  partyDocuments,
  onClose,
  onSaved,
  // 'party' (Udyog wholesale — original use case, default) or 'customer'
  // (Udyog retail Udhar tab + Vyapar/Dukan customer pages). Only affects
  // the optional photo-attachment step, which fetches the customer row
  // to merge the new document into its `documents` array — the underlying
  // bill/stock/udhar posting works identically for both types since the
  // Customer model is unified.
  entityType = 'party',
}: {
  partyId: string;
  partyDocuments: PartyDoc[];
  onClose: () => void;
  onSaved: () => void;
  entityType?: 'party' | 'customer';
}) {
  const today = new Date().toISOString().slice(0, 10);

  const [step, setStep] = useState<Step>('entry');

  // Step 1 — photo + scan
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Step 2 — line items + product picker
  const [products, setProducts] = useState<ProductPickerRow[]>([]);
  const [lines, setLines] = useState<BillLine[]>([]);
  const [pickerForKey, setPickerForKey] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [creatingProduct, setCreatingProduct] = useState(false);

  // GST toggle applies to the whole bill. When ON, each line row shows its
  // own GST% (defaulting to the picked product's rate) and the total shows
  // Subtotal + GST + Grand Total instead of a single Total. The backend
  // financial engine already computes GST from `bill_type: 'gst'` + per-line
  // gstPercent, so we just forward those two things.
  const [gstEnabled, setGstEnabled] = useState(false);

  // Step 3 — finalize
  const [billDate, setBillDate] = useState(today);
  const [billNumber, setBillNumber] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('Udhar');
  const [amountPaidText, setAmountPaidText] = useState('');
  const [splitCashText, setSplitCashText] = useState('');
  const [splitUpiText, setSplitUpiText] = useState('');
  const [splitCardText, setSplitCardText] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Create-new-product form (opens on top of the picker overlay)
  const [newProdName, setNewProdName] = useState('');
  const [newProdPriceText, setNewProdPriceText] = useState('');
  const [newProdUnit, setNewProdUnit] = useState('pcs');
  const [newProdStockText, setNewProdStockText] = useState('');
  const [newProdGstText, setNewProdGstText] = useState('0');

  function pickFile(f: File | undefined | null) {
    if (!f) return;
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setError('');
  }

  function clearFile() {
    setFile(null);
    setPreviewUrl(null);
  }

  /** Same variant-key convention as the server's scan-bill route and the
   *  existing billing/route.ts stock-decrement logic: "<colour> / <size>",
   *  or just size / just colour when only one is present. */
  function variantKeyOf(colour: string | null | undefined, size: string | null | undefined): string {
    const c = (colour || '').trim();
    const sz = (size || '').trim();
    if (c && sz) return `${c} / ${sz}`;
    return sz || c || '';
  }

  function computeVariantOptions(raw: any): VariantOption[] {
    const opts: VariantOption[] = [];
    const seen = new Set<string>();
    const push = (colour: string | null, size: string | null, stock: number | null, price: number | null) => {
      const key = variantKeyOf(colour, size);
      if (!key || seen.has(key)) return;
      seen.add(key);
      opts.push({ key, colour, size, stock, price });
    };
    if (Array.isArray(raw?.variants)) {
      for (const v of raw.variants) {
        const colour = v?.color ? String(v.color) : null;
        const size = v?.size ? String(v.size) : null;
        const stock = v?.stock !== undefined && v?.stock !== null ? Number(v.stock) : (v?.quantity !== undefined && v?.quantity !== null ? Number(v.quantity) : null);
        const price = v?.sellingPrice !== undefined && v?.sellingPrice !== null ? Number(v.sellingPrice) : (v?.wholesalePrice !== undefined && v?.wholesalePrice !== null ? Number(v.wholesalePrice) : null);
        push(colour, size, stock, price);
      }
    }
    if (raw?.size_variants) {
      try {
        const sv = typeof raw.size_variants === 'string' ? JSON.parse(raw.size_variants) : raw.size_variants;
        if (sv && typeof sv === 'object') {
          for (const [size, qty] of Object.entries(sv)) push(null, size, Number(qty) || 0, null);
        }
      } catch { /* ignore malformed */ }
    }
    return opts;
  }

  async function loadProducts(): Promise<ProductPickerRow[]> {
    if (products.length) return products;
    try {
      const res = await api.get('/products');
      const list = Array.isArray(res.data) ? res.data : [];
      const mapped: ProductPickerRow[] = list.map((p: any) => ({
        id: p.id,
        name: p.name,
        price: Number(p.sellingPrice ?? p.mrp ?? 0),
        unit: p.baseUnit ?? null,
        currentStock: p.currentStock === null || p.currentStock === undefined ? null : Number(p.currentStock),
        gstPercent: Number(p.gstPercent ?? 0),
        variants: computeVariantOptions(p),
      }));
      setProducts(mapped);
      return mapped;
    } catch {
      return [];
    }
  }

  function makeKey() {
    return (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
  }

  function extractedToLine(row: ExtractedLine, productsList: ProductPickerRow[]): BillLine {
    const qty = Math.max(1, Math.round(row.quantity ?? 1));
    const rate = Number(row.matchedProductPrice ?? row.pricePerUnit ?? 0) || 0;
    // Prefer the server-resolved variant match; if that's absent but the AI
    // did read a colour/size, keep those as the free-text `variant` so the
    // review UI at least shows the scanned info rather than dropping it.
    const variant = row.matchedVariantKey || variantKeyOf(row.colour, row.size);
    const opts = row.matchedProductId
      ? (productsList.find((p) => p.id === row.matchedProductId)?.variants ?? [])
      : [];
    return {
      key: makeKey(),
      productId: row.matchedProductId,
      name: row.matchedProductName || row.name,
      variant,
      variantOptions: opts,
      variantStock: row.matchedVariantStock ?? null,
      qtyText: String(qty),
      rateText: String(rate),
      gstText: String(Number(row.matchedProductGstPercent ?? 0)),
      unit: row.matchedProductUnit || row.unit,
      currentStock: row.matchedProductStock,
    };
  }

  async function scanBill() {
    if (!file) { setError('Pick a photo first, or use Enter Manually.'); return; }
    setScanning(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const [scanRes] = await Promise.all([
        api.post('/party/scan-bill', fd),
        loadProducts(),
      ]);
      const extracted: ExtractedLine[] = Array.isArray(scanRes.data?.items) ? scanRes.data.items : [];
      // The server's product list already carries the exact same `variants`
      // shape the client uses (see productVariantOptions in the route), so we
      // adopt it as-is. Falls back to whatever loadProducts fetched.
      const productsList: ProductPickerRow[] = Array.isArray(scanRes.data?.products) && scanRes.data.products.length
        ? scanRes.data.products.map((p: any) => ({
            id: p.id, name: p.name,
            price: Number(p.price ?? 0), unit: p.unit ?? null,
            currentStock: p.currentStock === null || p.currentStock === undefined ? null : Number(p.currentStock),
            gstPercent: Number(p.gstPercent ?? 0),
            variants: Array.isArray(p.variants) ? p.variants : [],
          }))
        : products;
      if (Array.isArray(scanRes.data?.products) && scanRes.data.products.length) {
        setProducts(productsList);
      }
      const newLines = extracted.map((row) => extractedToLine(row, productsList));
      if (!newLines.length) {
        setError('AI could not find any items on this photo. Try a clearer photo, or use Enter Manually.');
        setScanning(false);
        return;
      }
      setLines(newLines);
      setStep('review');
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Scan failed. Try Enter Manually.');
    } finally {
      setScanning(false);
    }
  }

  async function enterManually() {
    await loadProducts();
    setLines([]);
    setStep('review');
  }

  function addBlankLine() {
    setLines(prev => [...prev, {
      key: makeKey(),
      productId: null,
      name: '',
      variant: '',
      variantOptions: [],
      variantStock: null,
      qtyText: '1',
      rateText: '',
      gstText: '0',
      unit: null,
      currentStock: null,
    }]);
  }

  function removeLine(key: string) {
    setLines(prev => prev.filter(l => l.key !== key));
  }

  function updateLine(key: string, patch: Partial<BillLine>) {
    setLines(prev => prev.map(l => (l.key === key ? { ...l, ...patch } : l)));
  }

  function pickProductForLine(key: string, product: ProductPickerRow) {
    updateLine(key, {
      productId: product.id,
      name: product.name,
      variant: '',
      variantOptions: product.variants || [],
      variantStock: null,
      rateText: String(product.price || 0),
      unit: product.unit,
      gstText: String(product.gstPercent || 0),
      currentStock: product.currentStock,
    });
    setPickerForKey(null);
    setPickerQuery('');
  }

  /** Set the variant on a line, and pull that variant's stock + price if the
   *  product tracks per-variant values. Called from the chip picker below the
   *  product name in each line item. */
  function pickVariantForLine(key: string, opt: VariantOption | null) {
    if (!opt) {
      updateLine(key, { variant: '', variantStock: null });
      return;
    }
    updateLine(key, {
      variant: opt.key,
      variantStock: opt.stock,
      // Only override the rate when the variant carries its own price —
      // otherwise keep whatever's in the field (the shopkeeper may have
      // already typed the exact rate from the paper bill).
      ...(opt.price !== undefined && opt.price !== null && opt.price > 0 ? { rateText: String(opt.price) } : {}),
    });
  }

  async function createProductAndPick() {
    const name = newProdName.trim();
    const price = num(newProdPriceText);
    const stock = num(newProdStockText);
    const gst = num(newProdGstText);
    if (!name) { toast.error('Enter a product name'); return; }
    if (!(price > 0)) { toast.error('Enter a selling price'); return; }
    setCreatingProduct(true);
    try {
      const res = await api.post('/products', {
        name,
        selling_price: price,
        mrp: price,
        current_stock: stock,
        base_unit: newProdUnit || 'pcs',
        gst_percent: gst,
        cost_price_mode: 'manual',
      });
      const created = res.data;
      const row: ProductPickerRow = {
        id: created.id,
        name: created.name,
        price: Number(created.sellingPrice ?? created.mrp ?? price),
        unit: created.baseUnit ?? newProdUnit ?? null,
        currentStock: Number(created.currentStock ?? stock),
        gstPercent: Number(created.gstPercent ?? gst),
        variants: computeVariantOptions(created),
      };
      setProducts(prev => [row, ...prev]);
      if (pickerForKey) pickProductForLine(pickerForKey, row);
      // reset the mini-form for the next use
      setNewProdName('');
      setNewProdPriceText('');
      setNewProdStockText('');
      setNewProdGstText('0');
      setNewProdUnit('pcs');
      toast.success('Product added to your catalog');
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Could not create product');
    } finally {
      setCreatingProduct(false);
    }
  }

  const filteredProducts = useMemo(() => {
    if (!pickerQuery.trim()) return products.slice(0, 40);
    const q = pickerQuery.trim().toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(q)).slice(0, 40);
  }, [products, pickerQuery]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let gstTotal = 0;
    let unmatched = 0;
    let overSelling = 0;
    for (const l of lines) {
      const qty = num(l.qtyText);
      const rate = num(l.rateText);
      const line = qty * rate;
      subtotal += line;
      if (gstEnabled) gstTotal += (line * num(l.gstText)) / 100;
      if (!l.productId) unmatched++;
      // Variant-tracked line: check against the variant's own stock, not the
      // rolled-up product-level currentStock (which is the sum across all
      // variants for Udyog products).
      const effectiveStock = l.variantStock ?? l.currentStock;
      if (l.productId && effectiveStock !== null && qty > Number(effectiveStock)) overSelling++;
    }
    return { subtotal, gstTotal, grandTotal: subtotal + (gstEnabled ? gstTotal : 0), unmatched, overSelling };
  }, [lines, gstEnabled]);

  /** Expand any line whose `variant` is a size range ("6*8", "S-XL", …) into
   *  one line per individual size, all sharing qty/rate/product. The
   *  shopkeeper writes the range as a shorthand; the ledger and stock
   *  decrement need one row per real size. Sibling variants inherit the
   *  parent product's per-variant stock via matchVariantStock() below. */
  function expandSizeRanges(source: BillLine[]): BillLine[] {
    const out: BillLine[] = [];
    for (const l of source) {
      const sizes = parseSizeRange(l.variant);
      if (sizes.length <= 1) { out.push(l); continue; }
      for (const s of sizes) {
        // Try to reuse the linked product's own variant option for this size
        // (so per-variant stock warnings work). Falls back to a plain text
        // variant if the product doesn't carry a matching row.
        const opt = l.variantOptions.find(o => o.key === s || o.size === s);
        out.push({
          ...l,
          key: makeKey(),
          variant: opt ? opt.key : s,
          variantStock: opt ? opt.stock : null,
          rateText: opt && opt.price ? String(opt.price) : l.rateText,
        });
      }
    }
    return out;
  }

  function goToFinalize() {
    if (!lines.length) { setError('Add at least one item before continuing.'); return; }
    // Expand size ranges BEFORE validating — a row typed as "6*8 qty 3" is
    // valid; it just means 3 pairs each of sizes 6, 7, 8 (three rows). Doing
    // this on Continue rather than on every keystroke lets the shopkeeper
    // finish typing (including numbers past 10) without the range firing
    // prematurely.
    const expanded = expandSizeRanges(lines);
    if (expanded.length !== lines.length) {
      setLines(expanded);
      toast.success(`Split into ${expanded.length} lines by size`);
    }
    for (const l of expanded) {
      if (!l.name.trim()) { setError('One of the items has no name — fill it in or remove the row.'); return; }
      if (!(num(l.qtyText) > 0)) { setError(`Quantity must be greater than 0 (item "${l.name}").`); return; }
      if (num(l.rateText) < 0) { setError(`Rate cannot be negative (item "${l.name}").`); return; }
    }
    setError('');
    setAmountPaidText('0');
    setStep('finalize');
  }

  async function uploadPhoto(): Promise<string | null> {
    if (!file) return null;
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'party-bills');
      const res = await api.post('/upload', fd);
      return res.data?.url || res.data?.path || null;
    } catch {
      return null;
    }
  }

  async function submit() {
    setSaving(true);
    setError('');
    try {
      const billImageUrl = await uploadPhoto();

      const grand = totals.grandTotal;
      let payType: PaymentMode = paymentMode;
      let paid = 0;
      let paymentDetails: any = {};
      if (paymentMode === 'Udhar') {
        paid = 0;
      } else if (paymentMode === 'Split') {
        const c = num(splitCashText);
        const u = num(splitUpiText);
        const d = num(splitCardText);
        paid = c + u + d;
        paymentDetails = { cash: c, upi: u, card: d };
      } else {
        paid = amountPaidText.trim() === '' ? grand : num(amountPaidText);
      }
      if (paid > grand) paid = grand;

      const payload = {
        customer_id: partyId,
        items: lines.map(l => ({
          product_id: l.productId,
          name: l.name,
          // `variant` uses the "<colour> / <size>" convention that
          // billing/route.ts stock-decrement uses to find the specific row
          // in Product.variants[] / size_variants. An empty string leaves
          // it null (base-stock decrement only), matching how normal
          // billing handles a non-variant line.
          variant: l.variant.trim() || null,
          quantity: num(l.qtyText),
          price_per_unit: num(l.rateText),
          unit: l.unit,
          gst_percent: gstEnabled ? num(l.gstText) : 0,
        })),
        payment_type: payType,
        amount_paid: paid,
        payment_details: paymentDetails,
        bill_type: gstEnabled ? 'gst' : 'non_gst',
        bill_image_url: billImageUrl,
        is_manual: true,
        created_at: new Date(billDate).toISOString(),
      };

      const saleRes = await api.post('/billing', payload);
      const saleInvoice = saleRes.data?.invoice_number;

      if (billImageUrl) {
        try {
          // Fetch the right ledger side (parties vs customers) so the
          // customer.documents merge below finds the row we're billing.
          const currentRes = await api.get(`/crm/customers?type=${entityType}`);
          const list = Array.isArray(currentRes.data) ? currentRes.data : [];
          const party = list.find((p: any) => p.id === partyId);
          if (party) {
            const nextDocs: PartyDoc[] = [
              ...(partyDocuments || []),
              { id: makeKey(), url: billImageUrl, uploadedAt: new Date().toISOString(), transactionId: saleInvoice },
            ];
            await api.put(`/crm/customers/${partyId}`, {
              name: party.name,
              shopName: party.shopName,
              mobile: party.mobile,
              gst: party.gst,
              address: party.address,
              creditLimit: party.creditLimit,
              creditDays: party.creditDays,
              // Preserve the caller's ledger side — don't silently convert
              // a retail customer to a wholesale party via the PUT.
              customerType: entityType,
              documents: nextDocs,
            });
          }
        } catch { /* photo still lives on the sale itself as billImageUrl */ }
      }

      toast.success('Bill added — stock updated');
      onSaved();
      onClose();
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Failed to save bill.';
      setError(detail);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in">
      {/* Full-screen on mobile, centred card on tablet+. h-[100dvh] tracks
          the dynamic viewport so the mobile keyboard doesn't push the
          Continue/Save buttons off-screen when a shopkeeper is typing in a
          product name or quantity field. */}
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl h-[100dvh] sm:h-auto sm:max-h-[92vh] rounded-none sm:rounded-2xl shadow-xl flex flex-col overflow-hidden relative">

        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            {step !== 'entry' && (
              <button
                type="button"
                onClick={() => { setError(''); setStep(step === 'finalize' ? 'review' : 'entry'); }}
                disabled={saving}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700"
                title="Back"
              >
                <ChevronLeft size={18} />
              </button>
            )}
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <ReceiptText size={17} className="text-orange-500" />
                Add Bill
                <span className="text-xs font-medium text-slate-500 hidden sm:inline">
                  · {step === 'entry' ? 'Photo or manual' : step === 'review' ? 'Review items' : 'Finalize'}
                </span>
              </h2>
              <p className="text-[11px] text-slate-500 leading-none mt-0.5">Records a real sale — stock will be reduced automatically.</p>
            </div>
          </div>
          <button onClick={onClose} disabled={saving}>
            <X size={20} className="text-slate-400 hover:text-slate-700 transition-colors" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-5 space-y-4 flex-1">
          {step === 'entry' && (
            <>
              {previewUrl ? (
                <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950">
                  <img src={previewUrl} alt="Bill preview" className="max-h-64 w-full object-contain" />
                  <button
                    type="button"
                    onClick={clearFile}
                    disabled={scanning}
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                    title="Remove photo"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex flex-col items-center justify-center gap-1.5 py-7 rounded-xl border-2 border-dashed border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/10 transition-colors"
                  >
                    <Camera size={22} />
                    <span className="text-xs font-bold">Take Photo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    className="flex flex-col items-center justify-center gap-1.5 py-7 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Upload size={22} />
                    <span className="text-xs font-bold">Upload Photo</span>
                  </button>
                </div>
              )}
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0])} />
              <input ref={galleryInputRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0])} />

              {previewUrl && (
                <p className="text-[11px] text-slate-500 flex items-center gap-1">
                  <ImageIcon size={12} /> The photo is optional but stays attached to the bill for your records.
                </p>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={scanBill}
                  disabled={!file || scanning}
                  className="flex-1 h-12 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {scanning ? <><Loader2 size={18} className="animate-spin" /> Reading bill…</> : <><ScanLine size={18} /> Scan Bill with AI</>}
                </button>
                <button
                  type="button"
                  onClick={enterManually}
                  disabled={scanning}
                  className="flex-1 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold flex items-center justify-center gap-2 disabled:opacity-60 transition"
                >
                  <Plus size={18} /> Enter Manually
                </button>
              </div>

              <div className="rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200/60 dark:border-blue-500/20 px-3 py-2.5">
                <p className="text-[11px] text-blue-800 dark:text-blue-300 leading-relaxed flex items-start gap-2">
                  <Sparkles size={13} className="mt-0.5 shrink-0" />
                  <span><b>Scan Bill</b> reads the products, quantities and rates from your paper bill and matches them to your inventory — you review and edit before saving. Stock reduces only on save.</span>
                </p>
              </div>

              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            </>
          )}

          {step === 'review' && (
            <>
              {/* GST toggle — off by default. Turning it on reveals a per-line
                  GST% field (seeded from each product's own gstPercent) and
                  flips the total block to show Subtotal + GST + Grand Total. */}
              <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-3 py-2">
                <div>
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">GST Bill</p>
                  <p className="text-[11px] text-slate-500">Adds GST to each item and to the grand total.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setGstEnabled(v => !v)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${gstEnabled ? 'bg-orange-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                  role="switch"
                  aria-checked={gstEnabled}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${gstEnabled ? 'translate-x-5' : ''}`} />
                </button>
              </div>

              <div className="space-y-2">
                {lines.length === 0 && (
                  <div className="text-center py-8 text-slate-500 text-sm">
                    No items yet. Click <b>Add Item</b> below to start.
                  </div>
                )}
                {lines.map((l, idx) => {
                  const qtyNum = num(l.qtyText);
                  const rateNum = num(l.rateText);
                  const gstNum = num(l.gstText);
                  const lineTotal = qtyNum * rateNum;
                  const lineWithGst = gstEnabled ? lineTotal * (1 + gstNum / 100) : lineTotal;
                  // Prefer the variant's own stock when tracking per-variant;
                  // otherwise fall back to the product-level rollup.
                  const effectiveStock = l.variantStock ?? l.currentStock;
                  const overStock = l.productId && effectiveStock !== null && qtyNum > Number(effectiveStock);
                  const hasVariantOptions = l.variantOptions && l.variantOptions.length > 0;
                  return (
                    <div key={l.key} className={`rounded-xl border p-3 space-y-2 ${l.productId ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40' : 'border-amber-300/70 dark:border-amber-600/40 bg-amber-50/50 dark:bg-amber-500/5'}`}>
                      <div className="flex items-start gap-2">
                        <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-700 text-[11px] font-bold flex items-center justify-center shrink-0 mt-1">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          {l.productId ? (
                            <button
                              type="button"
                              onClick={() => { setPickerForKey(l.key); setPickerQuery(''); }}
                              className="text-left w-full"
                            >
                              <p className="font-bold text-sm truncate flex items-center gap-1.5">
                                <Package size={13} className="text-emerald-500 shrink-0" />
                                {l.name}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {l.unit ? `Unit: ${l.unit} · ` : ''}
                                {l.variant && l.variantStock !== null
                                  ? `In stock (${l.variant}): ${l.variantStock}`
                                  : effectiveStock !== null ? `In stock: ${effectiveStock}` : 'Stock: not tracked'}
                                {' · Tap to change'}
                              </p>
                            </button>
                          ) : (
                            <div>
                              <input
                                type="text"
                                value={l.name}
                                onChange={(e) => updateLine(l.key, { name: e.target.value })}
                                placeholder="Item name"
                                className="w-full bg-transparent text-sm font-bold outline-none border-b border-dashed border-amber-400/60 pb-1"
                              />
                              <button
                                type="button"
                                onClick={() => { setPickerForKey(l.key); setPickerQuery(l.name); }}
                                className="text-[11px] text-amber-700 dark:text-amber-400 font-semibold mt-1 flex items-center gap-1"
                              >
                                <Search size={11} /> Link to a product (needed to reduce stock)
                              </button>
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLine(l.key)}
                          className="text-slate-400 hover:text-red-500 p-1"
                          title="Remove this line from the bill"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {/* Variant row — for products with variants, show all
                          available colour × size options as pickable chips
                          (with per-variant stock). For products without,
                          expose a free-text field so the shopkeeper can at
                          least record colour/size on the bill even if it's
                          not tracked as separate stock. Only ever shows when
                          the line is linked to a product; unlinked lines
                          get the variant along with the product later. */}
                      {l.productId && hasVariantOptions && (
                        <div className="pl-8 space-y-1.5">
                          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Colour / Size</p>
                          <div className="flex flex-wrap gap-1.5">
                            {l.variantOptions.map(opt => {
                              const selected = l.variant === opt.key;
                              const oos = opt.stock !== null && opt.stock <= 0;
                              return (
                                <button
                                  key={opt.key}
                                  type="button"
                                  onClick={() => pickVariantForLine(l.key, selected ? null : opt)}
                                  className={`px-2 py-1 rounded-md text-[11px] font-semibold border transition ${
                                    selected
                                      ? 'bg-orange-500 text-white border-orange-500'
                                      : oos
                                        ? 'bg-slate-50 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700'
                                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-orange-400'
                                  }`}
                                  title={`${opt.key}${opt.stock !== null ? ` · ${opt.stock} in stock` : ''}`}
                                >
                                  {opt.key}
                                  {opt.stock !== null && (
                                    <span className={`ml-1 text-[9px] ${selected ? 'text-white/80' : 'text-slate-500'}`}>({opt.stock})</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                          {!l.variant && (
                            <p className="text-[10px] text-amber-700 dark:text-amber-400">Pick a colour/size to reduce the exact variant's stock — otherwise this deducts from base stock.</p>
                          )}
                        </div>
                      )}
                      {l.productId && !hasVariantOptions && (
                        <div className="pl-8 space-y-1">
                          <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Colour / Size (optional)</label>
                          <input
                            type="text"
                            value={l.variant}
                            onChange={(e) => updateLine(l.key, { variant: e.target.value })}
                            placeholder="e.g. Black / UK 8   —   size range: 6*8"
                            className="w-full h-8 px-2 rounded-lg text-xs border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 outline-none focus:ring-2 focus:ring-orange-500"
                          />
                          {parseSizeRange(l.variant).length > 1 && (
                            <p className="text-[10px] text-orange-600 dark:text-orange-400">
                              Will split into {parseSizeRange(l.variant).length} lines on Continue: {parseSizeRange(l.variant).join(', ')}
                            </p>
                          )}
                        </div>
                      )}

                      <div className={`grid ${gstEnabled ? 'grid-cols-4' : 'grid-cols-3'} gap-2`}>
                        <div>
                          <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Qty</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={l.qtyText}
                            onChange={(e) => updateLine(l.key, { qtyText: e.target.value })}
                            className={`w-full h-9 px-2 rounded-lg text-sm font-semibold text-center border outline-none focus:ring-2 focus:ring-orange-500 ${overStock ? 'border-red-400 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800'}`}
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Rate ₹</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={l.rateText}
                            onChange={(e) => updateLine(l.key, { rateText: e.target.value })}
                            className="w-full h-9 px-2 rounded-lg text-sm font-semibold text-center border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 outline-none focus:ring-2 focus:ring-orange-500"
                          />
                        </div>
                        {gstEnabled && (
                          <div>
                            <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">GST %</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={l.gstText}
                              onChange={(e) => updateLine(l.key, { gstText: e.target.value })}
                              className="w-full h-9 px-2 rounded-lg text-sm font-semibold text-center border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 outline-none focus:ring-2 focus:ring-orange-500"
                            />
                          </div>
                        )}
                        <div>
                          <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Amount</label>
                          <div className="w-full h-9 px-2 rounded-lg text-sm font-bold flex items-center justify-center border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200">
                            ₹{lineWithGst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </div>
                        </div>
                      </div>

                      {overStock && (
                        <p className="text-[11px] text-red-600 dark:text-red-400 flex items-center gap-1">
                          <AlertTriangle size={12} /> Quantity ({qtyNum}) is more than {l.variant ? `${l.variant}'s` : 'current'} stock ({effectiveStock}) — stock will still be reduced but may go negative.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={addBlankLine}
                className="w-full py-2.5 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center gap-2"
              >
                <Plus size={16} /> Add Item
              </button>

              {(totals.unmatched > 0 || totals.overSelling > 0) && (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-3 py-2.5 space-y-1">
                  {totals.unmatched > 0 && (
                    <p className="text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                      <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                      <span><b>{totals.unmatched}</b> item{totals.unmatched > 1 ? 's are' : ' is'} not linked to a product yet — those will be saved on the bill but <b>won't reduce stock</b>. Tap the item name to link, or create a new product.</span>
                    </p>
                  )}
                  {totals.overSelling > 0 && (
                    <p className="text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                      <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                      <span><b>{totals.overSelling}</b> item{totals.overSelling > 1 ? 's have' : ' has'} quantity above current stock — stock will still update but the value can go negative.</span>
                    </p>
                  )}
                </div>
              )}

              <div className="sticky bottom-0 -mx-5 -mb-5 px-5 py-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-3">
                <div className="flex-1">
                  {gstEnabled ? (
                    <>
                      <p className="text-[10px] font-bold text-slate-500 uppercase leading-none">Grand Total (incl. GST)</p>
                      <p className="text-lg font-black">
                        ₹{totals.grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        <span className="text-[10px] font-medium text-slate-500 ml-1">(GST ₹{totals.gstTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })})</span>
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-[10px] font-bold text-slate-500 uppercase">Total</p>
                      <p className="text-lg font-black">₹{totals.grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={goToFinalize}
                  disabled={!lines.length}
                  className="h-11 px-5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold disabled:opacity-50 flex items-center gap-1.5"
                >
                  Continue <ChevronLeft size={16} className="rotate-180" />
                </button>
              </div>

              {error && <p className="text-sm text-red-600 dark:text-red-400 -mt-2">{error}</p>}
            </>
          )}

          {step === 'finalize' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Bill Date</label>
                  <input
                    type="date"
                    value={billDate}
                    onChange={(e) => setBillDate(e.target.value)}
                    className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Bill Number</label>
                  <input
                    type="text"
                    value={billNumber}
                    onChange={(e) => setBillNumber(e.target.value)}
                    placeholder="Optional"
                    className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Payment</label>
                <div className="grid grid-cols-5 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                  {(['Cash', 'UPI', 'Card', 'Udhar', 'Split'] as PaymentMode[]).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => { setPaymentMode(mode); if (mode === 'Udhar') setAmountPaidText('0'); else if (mode !== 'Split') setAmountPaidText(String(totals.grandTotal)); }}
                      className={`py-1.5 rounded-lg text-xs font-bold transition ${paymentMode === mode ? 'bg-orange-500 text-white shadow' : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700/60'}`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {paymentMode === 'Split' ? (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'cash', label: 'Cash', val: splitCashText, set: setSplitCashText },
                    { key: 'upi', label: 'UPI', val: splitUpiText, set: setSplitUpiText },
                    { key: 'card', label: 'Card', val: splitCardText, set: setSplitCardText },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{f.label} ₹</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={f.val}
                        onChange={(e) => f.set(e.target.value)}
                        className="w-full h-10 px-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-center outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                  ))}
                </div>
              ) : paymentMode !== 'Udhar' ? (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Amount Received ₹</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amountPaidText}
                    onChange={(e) => setAmountPaidText(e.target.value)}
                    className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-base font-semibold text-center outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              ) : (
                <div className="rounded-lg bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 px-3 py-2.5">
                  <p className="text-[12px] text-orange-800 dark:text-orange-300 flex items-center gap-1.5 font-semibold">
                    <Coins size={13} /> Full amount ₹{totals.grandTotal.toLocaleString('en-IN')} will be added to this party's outstanding.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Note</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional"
                  className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-800/40 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Items</span>
                  <span className="font-semibold">{lines.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="font-semibold">₹{totals.subtotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
                {gstEnabled && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">GST</span>
                    <span className="font-semibold">₹{totals.gstTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="flex justify-between text-base pt-1 border-t border-slate-200 dark:border-slate-700">
                  <span className="font-bold">Grand Total</span>
                  <span className="font-black text-orange-600 dark:text-orange-400">₹{totals.grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
              </div>

              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

              <button
                type="button"
                onClick={submit}
                disabled={saving || lines.length === 0}
                className="w-full h-12 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60 transition-colors"
              >
                {saving ? <><Loader2 size={18} className="animate-spin" /> Saving…</> : <><Check size={18} /> Save Bill & Reduce Stock</>}
              </button>
              <p className="text-[11px] text-slate-500 text-center flex items-center justify-center gap-1">
                <Wallet size={11} /> Creates a Sale · reduces stock · posts udhar if unpaid.
              </p>
            </>
          )}
        </div>

        {/* Product picker overlay — floats inside the modal so stacking &
            outside-tap-to-close work naturally. */}
        {pickerForKey && (
          <div className="absolute inset-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm flex flex-col rounded-none sm:rounded-2xl">
            <div className="px-3 sm:px-5 py-2.5 sm:py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2 shrink-0">
              <button type="button" onClick={() => setPickerForKey(null)} className="w-8 h-8 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center">
                <ChevronLeft size={16} />
              </button>
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  autoFocus
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  placeholder="Search products…"
                  className="w-full h-10 pl-9 pr-3 bg-slate-100 dark:bg-slate-800 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">

              {/* Create-new-product block. First-class, always visible at the
                  top of the picker so a shopkeeper can add a product they
                  didn't set up yet without leaving this flow. */}
              <div className="rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50/40 dark:bg-emerald-500/5 p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 text-xs font-bold uppercase tracking-wider">
                  <PackagePlus size={14} /> Add New Product
                </div>
                <input
                  type="text"
                  value={newProdName}
                  onChange={(e) => setNewProdName(e.target.value)}
                  placeholder="Product name"
                  className="w-full h-9 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Price ₹</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={newProdPriceText}
                      onChange={(e) => setNewProdPriceText(e.target.value)}
                      placeholder="0"
                      className="w-full h-9 px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-center outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Unit</label>
                    <input
                      type="text"
                      value={newProdUnit}
                      onChange={(e) => setNewProdUnit(e.target.value)}
                      placeholder="pcs"
                      className="w-full h-9 px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-center outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Stock</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={newProdStockText}
                      onChange={(e) => setNewProdStockText(e.target.value)}
                      placeholder="0"
                      className="w-full h-9 px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-center outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">GST %</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={newProdGstText}
                      onChange={(e) => setNewProdGstText(e.target.value)}
                      placeholder="0"
                      className="w-full h-9 px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-center outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={createProductAndPick}
                  disabled={creatingProduct}
                  className="w-full h-9 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-60"
                >
                  {creatingProduct ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                  {creatingProduct ? 'Adding…' : 'Add & Use'}
                </button>
              </div>

              <div>
                {filteredProducts.length === 0 && (
                  <div className="text-center py-6 text-slate-500 text-xs">
                    No products match “{pickerQuery}”. Add it above.
                  </div>
                )}
                {filteredProducts.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pickProductForLine(pickerForKey, p)}
                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
                  >
                    <Package size={16} className="text-emerald-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{p.name}</p>
                      <p className="text-[11px] text-slate-500">
                        ₹{Number(p.price).toLocaleString('en-IN')} {p.unit ? `/ ${p.unit}` : ''}
                        {' · '}
                        {p.currentStock === null ? 'Stock not tracked' : `${p.currentStock} in stock`}
                        {p.gstPercent > 0 ? ` · GST ${p.gstPercent}%` : ''}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
