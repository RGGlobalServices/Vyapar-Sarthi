import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';
import { lotColumns } from '@/lib/server/lotColumns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ROWS = 1000;

/**
 * Lot-wise stock and sales: every lot (batch) of the shop with what is left, what it cost, the price it is
 * listed at, and — from the bills — how much of it was sold, at what revenue and profit.
 *   ?all=1   include sold-out lots (default: only lots with stock)
 *   ?q=text  product name / lot number contains text
 * Revenue/profit only count bill lines that recorded the lot's selling price (bills made after lots were
 * priced per lot); `pricedQty` says how many sold units that covers, so nothing is silently guessed.
 */
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req, { enforceSubscription: false });
  const url = new URL(req.url);
  const includeSoldOut = url.searchParams.get('all') === '1';
  const q = (url.searchParams.get('q') || '').trim();
  const cols = await lotColumns();

  const params: any[] = [shop.id];
  let where = `b.shop_id = $1::uuid`;
  if (!includeSoldOut) where += ` AND b.quantity > 0`;
  if (q) { params.push(`%${q}%`); where += ` AND (p.name ILIKE $${params.length} OR b.batch_number ILIKE $${params.length})`; }

  const sold = cols.priceAtSale
    ? `SELECT batch_id, SUM(quantity) AS sold, SUM(cost_at_sale * quantity) AS cost,
              SUM(CASE WHEN price_at_sale IS NOT NULL THEN price_at_sale * quantity ELSE 0 END) AS revenue,
              SUM(CASE WHEN price_at_sale IS NOT NULL THEN cost_at_sale * quantity ELSE 0 END) AS priced_cost,
              SUM(CASE WHEN price_at_sale IS NOT NULL THEN quantity ELSE 0 END) AS priced_qty
         FROM sale_item_batches GROUP BY batch_id`
    : `SELECT batch_id, SUM(quantity) AS sold, SUM(cost_at_sale * quantity) AS cost,
              0::float8 AS revenue, 0::float8 AS priced_cost, 0::float8 AS priced_qty
         FROM sale_item_batches GROUP BY batch_id`;

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT b.id::text AS id, b.product_id::text AS product_id, p.name AS product_name, p.category AS category, p.selling_price AS product_price,
            b.batch_number, b.quantity, b.initial_quantity, b.cost_price, b.selling_price,
            b.expiry_date, b.purchase_date, b.created_at,
            ${cols.variantKey ? 'b.variant_key' : 'NULL::text AS variant_key'},
            COALESCE(s.sold, 0) AS sold, COALESCE(s.revenue, 0) AS revenue,
            COALESCE(s.priced_cost, 0) AS priced_cost, COALESCE(s.priced_qty, 0) AS priced_qty
       FROM batches b
       JOIN products p ON p.id = b.product_id
  LEFT JOIN (${sold}) s ON s.batch_id = b.id
      WHERE ${where}
      ORDER BY p.name ASC, COALESCE(b.purchase_date, b.created_at) ASC
      LIMIT ${MAX_ROWS + 1}`,
    ...params,
  );

  const truncated = rows.length > MAX_ROWS;
  const lots = rows.slice(0, MAX_ROWS).map((r) => {
    const quantity = Number(r.quantity) || 0;
    const cost = Number(r.cost_price) || 0;
    const price = Number(r.selling_price) || 0;
    // a lot with no price of its own is sold at the product's shelf price — value the stock that way too
    const valuePrice = price || Number(r.product_price) || 0;
    const revenue = Number(r.revenue) || 0;
    const pricedCost = Number(r.priced_cost) || 0;
    return {
      id: r.id, productId: r.product_id, productName: r.product_name, category: r.category,
      batchNumber: r.batch_number, variantKey: r.variant_key,
      quantity, initialQuantity: Number(r.initial_quantity) || null,
      costPrice: cost || null, sellingPrice: price || null,
      expiryDate: r.expiry_date, purchaseDate: r.purchase_date || r.created_at,
      stockValueAtCost: Math.round(quantity * cost * 100) / 100,
      stockValueAtPrice: Math.round(quantity * valuePrice * 100) / 100,
      sold: Number(r.sold) || 0,
      pricedQty: Number(r.priced_qty) || 0,
      revenue: Math.round(revenue * 100) / 100,
      profit: Math.round((revenue - pricedCost) * 100) / 100,
    };
  });

  const totals = lots.reduce((t, l) => ({
    lots: t.lots + 1,
    quantity: t.quantity + l.quantity,
    stockValueAtCost: t.stockValueAtCost + l.stockValueAtCost,
    stockValueAtPrice: t.stockValueAtPrice + l.stockValueAtPrice,
    revenue: t.revenue + l.revenue,
    profit: t.profit + l.profit,
  }), { lots: 0, quantity: 0, stockValueAtCost: 0, stockValueAtPrice: 0, revenue: 0, profit: 0 });

  return json({ lots, totals, truncated });
});
