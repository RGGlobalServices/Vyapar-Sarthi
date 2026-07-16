import { useState, useMemo, useEffect, useCallback } from 'react';
import { useCartStore, CartItem } from '@/lib/store';

const EMPTY_ARRAY: CartItem[] = [];

export type PaymentMethod = 'cash' | 'upi' | 'card' | 'udhar';
export type CollectedMethod = Exclude<PaymentMethod, 'udhar'>;

const ZERO_SPLIT = { cash: 0, upi: 0, card: 0 };

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
  const clearCartInStore = useCartStore((state) => state.clearCart);

  const [discount, setDiscount] = useState(initialDiscount);
  const [isEmi, setIsEmi] = useState(false);
  const [manualSplit, setManualSplit] = useState(ZERO_SPLIT);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  // Amount collected up front on an udhar bill; the rest goes on the ledger.
  const [udharAdvance, setUdharAdvance] = useState(0);
  const [udharAdvanceMethod, setUdharAdvanceMethod] = useState<CollectedMethod>('cash');

  // Financial Calculations
  const subtotal = useMemo(() => items.reduce((acc, item) => acc + item.total, 0), [items]);
  const total = Math.max(0, subtotal - discount);

  // Never let an advance typed against a bigger cart outlive the cart shrinking.
  const effectiveUdharAdvance = Math.min(Math.max(0, udharAdvance), total);

  // In method mode the split is a pure function of the chosen method and the
  // total, so it can never drift out of sync with the bill.
  const splitPayments = useMemo(() => {
    if (mode !== 'method') return manualSplit;
    if (isEmi) return ZERO_SPLIT;
    if (paymentMethod === 'udhar') {
      return { ...ZERO_SPLIT, [udharAdvanceMethod]: effectiveUdharAdvance };
    }
    return { ...ZERO_SPLIT, [paymentMethod]: total };
  }, [mode, manualSplit, isEmi, paymentMethod, total, udharAdvanceMethod, effectiveUdharAdvance]);

  const collectedAmount = splitPayments.cash + splitPayments.upi + splitPayments.card;
  const remainingAmount = isEmi ? 0 : Math.max(0, total - collectedAmount);

  // Auto-fill cash when total changes if nothing is paid yet
  useEffect(() => {
    if (mode === 'method') return;
    if (!isEmi && collectedAmount === 0 && total > 0) {
      setManualSplit(prev => ({ ...prev, cash: total }));
    } else if (collectedAmount > total) {
      // Prevent overpayment if total decreases below collected
      setManualSplit({ cash: total, upi: 0, card: 0 });
    }
  }, [total, isEmi, mode]);

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
  
  const clearCart = useCallback(() => {
    if (!shopId) return;
    clearCartInStore(shopId);
    setDiscount(0);
    setManualSplit(ZERO_SPLIT);
    setPaymentMethod('cash');
    setUdharAdvance(0);
    setUdharAdvanceMethod('cash');
  }, [shopId, clearCartInStore]);

  return {
    // State
    items,
    discount,
    setDiscount,
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
    collectedAmount,
    remainingAmount,
    isEmi,
    
    // Actions
    addItem,
    removeItem,
    updateQuantity,
    updatePrice,
    clearCart,
  };
}
