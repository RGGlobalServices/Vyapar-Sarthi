export type OrderItemInput = { productId: string, variant?: string, quantity: number, price?: number };

/**
 * Line items are optional — a shopkeeper can still log a quick order as a
 * single lump amount. When items ARE given, they're the source of truth:
 * totalAmount is computed from them here rather than trusting whatever
 * number the client sent, so the two can never drift.
 */
export function computeItemsAndTotal(rawItems: OrderItemInput[] | undefined, fallbackTotal: number) {
  const items = (Array.isArray(rawItems) ? rawItems : [])
    .filter(i => i && i.productId && Number(i.quantity) > 0)
    .map(i => ({
      productId: i.productId,
      variantKey: i.variant || null,
      quantity: Number(i.quantity),
      price: Number(i.price) || 0,
    }));
  const totalAmount = items.length > 0
    ? items.reduce((sum, i) => sum + i.quantity * i.price, 0)
    : fallbackTotal;
  return { items, totalAmount };
}
