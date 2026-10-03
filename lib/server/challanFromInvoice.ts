import prisma from '@/lib/server/prisma';
import { ApiError } from '@/lib/server/http';

/**
 * A bill (Bada Udyog invoice) already took its stock when it was made. A delivery challan raised FOR that bill must not take it again — so
 * it is a "challan from invoice": linked to the bill, quantities limited to what the bill still has undelivered, product stock untouched.
 * Delivered quantity = the lines of every challan linked to the bill (made from it, or the bill was made from them) that is not cancelled / returned.
 */
export const FROM_BILL_MARK = '[FROM-BILL]';

export type RemainingLine = { productId: string; name: string; unit: string; price: number; billedQty: number; alreadyQty: number; remainingQty: number };

export async function remainingForSale(shopId: string, saleId: string): Promise<{ sale: any; lines: RemainingLine[] }> {
  const sale = await (prisma as any).sale.findFirst({
    where: { id: saleId, shopId },
    select: {
      id: true, invoice_number: true, pricingModel: true, customerId: true,
      customer: { select: { id: true, name: true, mobile: true, address: true } },
      items: { select: { productId: true, itemName: true, quantity: true, unit: true, pricePerUnit: true, product: { select: { name: true, baseUnit: true } } } },
    },
  });
  if (!sale) throw new ApiError(404, 'Invoice not found', 'SALE_NOT_FOUND');
  if (sale.pricingModel !== 'mill_v2') throw new ApiError(400, 'A challan can be made from Bada Udyog invoices only.', 'NOT_MILL_BILL');

  const delivered: Array<{ product_id: string; qty: number }> = await prisma.$queryRawUnsafe(
    `SELECT i.product_id::text AS product_id, COALESCE(SUM(i.quantity), 0)::float8 AS qty
       FROM delivery_challan_items i JOIN delivery_challans c ON c.id = i.challan_id
      WHERE c.shop_id = $1::uuid AND c.sale_id = $2::uuid AND c.status NOT IN ('cancelled', 'returned')
      GROUP BY i.product_id`, shopId, saleId);
  const done = new Map(delivered.map((d) => [d.product_id, Number(d.qty) || 0]));

  const byProduct = new Map<string, RemainingLine>();
  for (const it of sale.items as any[]) {
    if (!it.productId) continue; // freeform / charge lines have no stock
    const cur = byProduct.get(it.productId) || {
      productId: it.productId, name: it.product?.name || it.itemName || 'Item', unit: it.unit || it.product?.baseUnit || 'Kg',
      price: Number(it.pricePerUnit) || 0, billedQty: 0, alreadyQty: done.get(it.productId) || 0, remainingQty: 0,
    };
    cur.billedQty += Number(it.quantity) || 0;
    byProduct.set(it.productId, cur);
  }
  const lines = [...byProduct.values()].map((l) => ({ ...l, billedQty: round3(l.billedQty), alreadyQty: round3(l.alreadyQty), remainingQty: round3(Math.max(0, l.billedQty - l.alreadyQty)) }));
  return { sale, lines };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
