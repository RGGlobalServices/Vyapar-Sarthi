import { useState, useMemo, useEffect, useCallback } from 'react';
import { useCartStore, CartItem } from '@/lib/store';

const EMPTY_ARRAY: CartItem[] = [];

export function useBillingEngine(shopId: string | undefined, initialDiscount = 0) {
  // Targeted selectors to avoid unnecessary re-renders
  const items = useCartStore((state) => shopId ? (state.carts[shopId] || EMPTY_ARRAY) : EMPTY_ARRAY);
  const addItemToStore = useCartStore((state) => state.addItem);
  const removeItemFromStore = useCartStore((state) => state.removeItem);
  const updateQuantityInStore = useCartStore((state) => state.updateQuantity);
  const updatePriceInStore = useCartStore((state) => state.updatePrice);
  const clearCartInStore = useCartStore((state) => state.clearCart);

  const [discount, setDiscount] = useState(initialDiscount);
  const [isEmi, setIsEmi] = useState(false);
  const [splitPayments, setSplitPayments] = useState({ cash: 0, upi: 0, card: 0 });

  // Financial Calculations
  const subtotal = useMemo(() => items.reduce((acc, item) => acc + item.total, 0), [items]);
  const total = Math.max(0, subtotal - discount);

  const collectedAmount = splitPayments.cash + splitPayments.upi + splitPayments.card;
  const remainingAmount = isEmi ? 0 : Math.max(0, total - collectedAmount);

  // Auto-fill cash when total changes if nothing is paid yet
  useEffect(() => {
    if (!isEmi && collectedAmount === 0 && total > 0) {
      setSplitPayments(prev => ({ ...prev, cash: total }));
    } else if (collectedAmount > total) {
      // Prevent overpayment if total decreases below collected
      setSplitPayments({ cash: total, upi: 0, card: 0 });
    }
  }, [total, isEmi]);

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
    setSplitPayments({ cash: 0, upi: 0, card: 0 });
  }, [shopId, clearCartInStore]);

  return {
    // State
    items,
    discount,
    setDiscount,
    splitPayments,
    setSplitPayments,
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
