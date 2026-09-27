import { useState, useMemo, useEffect, useCallback, SetStateAction } from 'react';
import { useCartStore, CartItem } from '@/lib/store';
import { calculateInvoice, InputLineItem, BillType, DiscountInput } from '@/lib/financialEngine';

const EMPTY_ARRAY: CartItem[] = [];

export type PaymentMethod = 'cash' | 'upi' | 'card' | 'udhar' | 'mixed';
export type CollectedMethod = Exclude<PaymentMethod, 'udhar' | 'mixed'>;

// 'bank' is used only by Wholesale/Udyog billing's split mode (Bank Transfer
// / Cheque). Retail's 'method' mode never sets it (its PaymentMethod type
// only ever produces cash/upi/card/udhar), so it stays 0 there — purely
// additive, no behavior change for Dukan/Vyapar billing.
const ZERO_SPLIT = { cash: 0, upi: 0, card: 0, bank: 0 };

/**
 * 'split' lets the caller allocate an amount to each method independently.
 * 'method' picks one method that covers the whole bill; 'udhar' collects only
 * the udhar advance (0 by default) and leaves the rest outstanding.
 */
type BillingMode = 'split' | 'method';

export function useBillingEngine(
  shopId: string | undefined,
  initialDiscount = 0,
  { mode = 'split' }: { mode?: BillingMode } = {}
) {
  // Targeted selectors to avoid unnecessary re-renders
  const items = useCartStore((state) => shopId ? (state.carts[shopId] || EMPTY_ARRAY) : EMPTY_ARRAY);
  const addItemToStore = useCartStore((state) => state.addItem);
  const removeItemFromStore = useCartStore((state) => state.removeItem);
  const updateQuantityInStore = useCartStore((state) => state.updateQuantity);
  const updatePriceInStore = useCartStore((state) => state.updatePrice);
  const updateGstPercentInStore = useCartStore((state) => state.updateGstPercent);
  const updateBatchNumberInStore = useCartStore((state) => state.updateBatchNumber);
  const updateExpiryDateInStore = useCartStore((state) => state.updateExpiryDate);
  const updateSerialNumberInStore = useCartStore((state) => state.updateSerialNumber);
  const updateWarrantyDaysInStore = useCartStore((state) => state.updateWarrantyDays);
  const setLineBatchInStore = useCartStore((state) => state.setLineBatch);
  const clearCartInStore = useCartStore((state) => state.clearCart);

  const [discount, setDiscount] = useState<number | DiscountInput>(initialDiscount);
  const [billType, setBillType] = useState<BillType>('non_gst');
  const [isEmi, setIsEmi] = useState(false);
  const [manualSplit, setManualSplitRaw] = useState(ZERO_SPLIT);
  // Tracks whether the cashier has actually typed into a Cash/UPI/Card field
  // this bill, vs. the split still being the auto-filled "fully paid" default.
  // Without this, adding/increasing quantity after the auto-fill already ran
  // once (e.g. qty 2 → 200) left the stale smaller "Collected" amount in
  // place — total grew to ₹22,800 but Collected stayed at the old ₹228,
  // silently dumping the rest onto Udhar with no indication anything was
  // wrong. Only a genuine manual edit should stop the auto-fill from
  // tracking the total; the bare auto-filled state must keep tracking it.
  const [userEditedSplit, setUserEditedSplit] = useState(false);
  const setManualSplit = useCallback((updater: SetStateAction<typeof ZERO_SPLIT>) => {
    setUserEditedSplit(true);
    setManualSplitRaw(updater);
  }, []);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  // Amount collected up front on an udhar bill; the rest goes on the ledger.
  const [udharAdvance, setUdharAdvance] = useState(0);
  const [udharAdvanceMethod, setUdharAdvanceMethod] = useState<CollectedMethod>('cash');

  // Financial Calculations via Centralized Financial Engine
  const invoiceCalc = useMemo(() => {
    const inputItems: InputLineItem[] = items.map(item => ({
      productId: typeof item.id === 'string' ? item.id : null,
      unit: item.unit,
      variant: item.variant,
      quantity: item.quantity,
      sellingPrice: item.price,
      purchasePrice: item.cost || (item as any).purchasePrice || 0,
      gstPercent: (item as any).gstPercent,
      hsnCode: (item as any).hsnCode,
    }));
    return calculateInvoice(inputItems, discount, billType);
  }, [items, discount, billType]);

  const subtotal = invoiceCalc.grossSubtotal;
  const total = invoiceCalc.discountedSubtotal;
  const totalDiscount = invoiceCalc.totalDiscount;
  const totalProfit = invoiceCalc.totalProfit;
  const totalGst = invoiceCalc.totalGst;

  // Never let an advance typed against a bigger cart outlive the cart shrinking.
  const effectiveUdharAdvance = Math.min(Math.max(0, udharAdvance), total);

  // In method mode the split is a pure function of the chosen method and the
  // total, so it can never drift out of sync with the bill.
  const splitPayments = useMemo(() => {
    if (mode !== 'method') return manualSplit;
    if (isEmi) return ZERO_SPLIT;
    // 'mixed' is the one 'method'-mode choice that isn't a pure function of
    // (method, total) — the cashier freely allocates cash/upi/card themselves
    // via setSplitPayments, same manual state 'split' mode always used.
    if (paymentMethod === 'mixed') return manualSplit;
    if (paymentMethod === 'udhar') {
      return { ...ZERO_SPLIT, [udharAdvanceMethod]: effectiveUdharAdvance };
    }
    return { ...ZERO_SPLIT, [paymentMethod]: total };
  }, [mode, manualSplit, isEmi, paymentMethod, total, udharAdvanceMethod, effectiveUdharAdvance]);

  const collectedAmount = splitPayments.cash + splitPayments.upi + splitPayments.card + (splitPayments.bank || 0);
  const remainingAmount = isEmi ? 0 : Math.max(0, total - collectedAmount);

  // Auto-fill cash to the running total as long as the cashier hasn't typed
  // into a split field themselves. Runs on every total change (not just the
  // first time), so adding/increasing an item after the auto-fill already
  // ran keeps "Collected" tracking the bill instead of leaving a stale
  // smaller amount behind that silently falls through to Udhar. The moment
  // setSplitPayments is called from the UI, userEditedSplit flips true and
  // this stops touching their entry — including a genuine partial payment.
  useEffect(() => {
    if (mode === 'method' || userEditedSplit) return;
    if (!isEmi && total > 0) {
      setManualSplitRaw({ cash: total, upi: 0, card: 0, bank: 0 });
    }
  }, [total, isEmi, mode, userEditedSplit]);

  // Cart Operations (Scoped to shopId)
  const addItem = useCallback((item: CartItem) => {
    if (!shopId) return;
    addItemToStore(shopId, item);
  }, [shopId, addItemToStore]);
  
  const removeItem = useCallback((id: string | number, variant?: string) => {
    if (!shopId) return;
    removeItemFromStore(shopId, id, variant);
  }, [shopId, removeItemFromStore]);
  
  const updateQuantity = useCallback((id: string | number, qty: number, variant?: string) => {
    if (!shopId) return;
    updateQuantityInStore(shopId, id, qty, variant);
  }, [shopId, updateQuantityInStore]);
  
  const updatePrice = useCallback((id: string | number, price: number, variant?: string) => {
    if (!shopId) return;
    updatePriceInStore(shopId, id, price, variant);
  }, [shopId, updatePriceInStore]);

  const updateGstPercent = useCallback((id: string | number, gstPercent: number, variant?: string) => {
    if (!shopId) return;
    updateGstPercentInStore(shopId, id, gstPercent, variant);
  }, [shopId, updateGstPercentInStore]);

  const updateBatchNumber = useCallback((id: string | number, batchNumber: string, variant?: string) => {
    if (!shopId) return;
    updateBatchNumberInStore(shopId, id, batchNumber, variant);
  }, [shopId, updateBatchNumberInStore]);

  const updateExpiryDate = useCallback((id: string | number, expiryDate: string, variant?: string) => {
    if (!shopId) return;
    updateExpiryDateInStore(shopId, id, expiryDate, variant);
  }, [shopId, updateExpiryDateInStore]);

  const updateSerialNumber = useCallback((id: string | number, serialNumber: string, variant?: string) => {
    if (!shopId) return;
    updateSerialNumberInStore(shopId, id, serialNumber, variant);
  }, [shopId, updateSerialNumberInStore]);

  const updateWarrantyDays = useCallback((id: string | number, warrantyDays: number, variant?: string) => {
    if (!shopId) return;
    updateWarrantyDaysInStore(shopId, id, warrantyDays, variant);
  }, [shopId, updateWarrantyDaysInStore]);

  const setLineBatch = useCallback((id: string | number, variant: string | undefined, batch: { batchId?: string; batchNumber?: string | null; cost?: number | null; profit?: number }) => {
    if (!shopId) return;
    setLineBatchInStore(shopId, id, variant, batch);
  }, [shopId, setLineBatchInStore]);

  const clearCart = useCallback(() => {
    if (!shopId) return;
    clearCartInStore(shopId);
    setDiscount(0);
    setManualSplitRaw(ZERO_SPLIT);
    setUserEditedSplit(false); // back to auto-fill mode for the next bill
    setPaymentMethod('cash');
    setUdharAdvance(0);
    setUdharAdvanceMethod('cash');
  }, [shopId, clearCartInStore]);

  return {
    // State
    items,
    discount,
    setDiscount,
    billType,
    setBillType,
    splitPayments,
    setSplitPayments: setManualSplit,
    paymentMethod,
    setPaymentMethod,
    udharAdvance: effectiveUdharAdvance,
    setUdharAdvance,
    udharAdvanceMethod,
    setUdharAdvanceMethod,
    setIsEmi,
    
    // Derived Calculations
    subtotal,
    total,
    totalDiscount,
    totalProfit,
    totalGst,
    invoiceCalc,
    collectedAmount,
    remainingAmount,
    isEmi,
    
    // Actions
    addItem,
    removeItem,
    updateQuantity,
    updatePrice,
    updateGstPercent,
    updateBatchNumber,
    updateExpiryDate,
    updateSerialNumber,
    updateWarrantyDays,
    setLineBatch,
    clearCart,
  };
}
