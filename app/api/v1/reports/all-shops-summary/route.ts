import prisma from '@/lib/server/prisma';
import { requireShopScope } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /reports/all-shops-summary — one row per shop, for the Settings page's
// "Shop-wise summary" and the "download all shops report" pull. Scoped to
// the owner's explicit shop selection when they've saved one (Settings →
// All Shop Access → Selected Shops); falls back to EVERY owned shop when no
// selection has been saved yet, same as before that picker existed.
// Deliberately does NOT further narrow by requireShopScope()'s
// subscription-eligible shopIds — this is an explicit management report, not
// an ambient pooled view, so a selected-but-lapsed shop should still show up
// (contributing ₹0), not silently vanish.
export const GET = handle(async (req) => {
  const { ownedShops, selectedShopIds } = await requireShopScope(req);
  const scopedShops = selectedShopIds
    ? ownedShops.filter((s) => selectedShopIds.includes(s.id))
    : ownedShops;
  const shopIds = scopedShops.map((s) => s.id);

  if (shopIds.length === 0) {
    return json({ shops: [], grandTotal: emptyTotal() });
  }

  const [salesAgg, stockRows, udharAgg] = await Promise.all([
    prisma.sale.groupBy({
      by: ['shopId'],
      where: { shopId: { in: shopIds } },
      _sum: { totalAmount: true, totalProfit: true },
    }),
    // costPrice isn't always populated (many shopkeepers only track the
    // wholesale/purchase cost) — fall back to wholesaleCost, same as
    // Dashboard's own wholesale-tier Inventory Value stat, so a shop that
    // only fills in one of the two fields still shows a real number here.
    prisma.$queryRaw<{ shop_id: string; product_count: number; stock_value: number; low_stock_count: number }[]>`
      SELECT shop_id,
        COUNT(*)::int as product_count,
        COALESCE(SUM(current_stock * COALESCE(cost_price, wholesale_cost, 0)), 0)::float as stock_value,
        COUNT(*) FILTER (WHERE min_stock > 0 AND current_stock <= min_stock)::int as low_stock_count
      FROM products
      WHERE shop_id = ANY(${shopIds}::uuid[])
        AND (archived = false OR archived IS NULL)
      GROUP BY shop_id
    `,
    prisma.customer.groupBy({
      by: ['shopId'],
      where: { shopId: { in: shopIds } },
      _sum: { totalDue: true },
    }),
  ]);

  const salesByShop = new Map(salesAgg.map((r) => [r.shopId, r._sum]));
  const stockByShop = new Map(stockRows.map((r) => [r.shop_id, r]));
  const udharByShop = new Map(udharAgg.map((r) => [r.shopId, r._sum]));

  const shops = scopedShops.map((shop) => {
    const sales = salesByShop.get(shop.id);
    const stock = stockByShop.get(shop.id);
    const udhar = udharByShop.get(shop.id);
    return {
      shopId: shop.id,
      shopName: shop.name || 'Unnamed Shop',
      shopCode: shop.shopCode || null,
      salesTotal: Number(sales?.totalAmount) || 0,
      profitTotal: Number(sales?.totalProfit) || 0,
      stockValue: Number(stock?.stock_value) || 0,
      lowStockCount: Number(stock?.low_stock_count) || 0,
      productCount: Number(stock?.product_count) || 0,
      udharOutstanding: Number(udhar?.totalDue) || 0,
    };
  });

  const grandTotal = shops.reduce(
    (acc, s) => ({
      salesTotal: acc.salesTotal + s.salesTotal,
      profitTotal: acc.profitTotal + s.profitTotal,
      stockValue: acc.stockValue + s.stockValue,
      lowStockCount: acc.lowStockCount + s.lowStockCount,
      productCount: acc.productCount + s.productCount,
      udharOutstanding: acc.udharOutstanding + s.udharOutstanding,
    }),
    emptyTotal()
  );

  return json({ shops, grandTotal });
});

function emptyTotal() {
  return { salesTotal: 0, profitTotal: 0, stockValue: 0, lowStockCount: 0, productCount: 0, udharOutstanding: 0 };
}
