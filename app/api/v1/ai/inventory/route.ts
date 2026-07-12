import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, query } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * AI Inventory Analysis — read-only, returns structured JSON
 * Used by the AI Dashboard and the Inventory Intelligence panel.
 * Never writes data. Respects shop isolation and package permissions.
 */
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const q = query(req);
  const shopId = shop.id;
  const isWholesale = shop.subscriptionPlan === 'wholesale';

  const since30 = new Date();
  since30.setDate(since30.getDate() - 30);

  // --- Parallel fetch of all inventory data needed ---
  const [products, saleItems, nearExpiryBatches] = await Promise.all([
    prisma.product.findMany({
      where: { shopId },
      select: {
        id: true, name: true, category: true, brand: true,
        currentStock: true, minStock: true,
        sellingPrice: true, wholesaleCost: true, mrp: true,
        baseUnit: true,
      },
      take: 500,
    }),
    prisma.saleItem.findMany({
      where: { sale: { shopId, createdAt: { gte: since30 } } },
      select: { productId: true, quantity: true, pricePerUnit: true, marginPerUnit: true },
    }),
    // Near-expiry only for wholesale
    isWholesale
      ? prisma.batch.findMany({
          where: {
            shopId,
            quantity: { gt: 0 },
            expiryDate: { lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
          },
          include: { product: { select: { name: true, category: true } } },
          orderBy: { expiryDate: 'asc' },
          take: 20,
        })
      : Promise.resolve([]),
  ]);

  // --- Aggregate sales per product ---
  const soldMap: Record<string, { qty: number; revenue: number; profit: number }> = {};
  for (const si of saleItems) {
    const k = si.productId || 'unknown';
    if (!soldMap[k]) soldMap[k] = { qty: 0, revenue: 0, profit: 0 };
    soldMap[k].qty += si.quantity || 0;
    soldMap[k].revenue += (si.pricePerUnit || 0) * (si.quantity || 0);
    soldMap[k].profit += (si.marginPerUnit || 0) * (si.quantity || 0);
  }

  // --- Enrich products ---
  const enriched = products.map((p) => {
    const s = soldMap[p.id] || { qty: 0, revenue: 0, profit: 0 };
    const margin = (p.sellingPrice || 0) - (p.wholesaleCost || 0);
    const marginPct = p.wholesaleCost ? Math.round((margin / p.wholesaleCost) * 100) : 0;
    const stock = p.currentStock ?? 0;
    const minStock = p.minStock ?? 0;
    // Days of stock remaining (based on avg daily velocity)
    const dailyVelocity = s.qty / 30;
    const daysRemaining = dailyVelocity > 0 ? Math.floor(stock / dailyVelocity) : null;

    return {
      id: p.id,
      name: p.name,
      category: p.category || 'Uncategorized',
      brand: p.brand || null,
      stock,
      minStock,
      sellingPrice: p.sellingPrice || 0,
      wholesaleCost: p.wholesaleCost || 0,
      unit: p.baseUnit || 'units',
      soldQty30d: s.qty,
      revenue30d: Math.round(s.revenue),
      profit30d: Math.round(s.profit),
      margin,
      marginPct,
      daysRemaining,
    };
  });

  // --- Analysis segments ---

  // Low stock: at or below minStock, sorted by revenue velocity (highest value first)
  const lowStock = enriched
    .filter((p) => p.minStock > 0 && p.stock <= p.minStock)
    .sort((a, b) => b.revenue30d - a.revenue30d)
    .slice(0, 15)
    .map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      currentStock: p.stock,
      minStock: p.minStock,
      unit: p.unit,
      soldQty30d: p.soldQty30d,
      daysRemaining: p.daysRemaining,
      urgency: p.stock === 0 ? 'critical' : p.daysRemaining !== null && p.daysRemaining <= 3 ? 'high' : 'medium',
    }));

  // Fast moving: top 15 by quantity sold in last 30 days
  const fastMoving = enriched
    .filter((p) => p.soldQty30d > 0)
    .sort((a, b) => b.soldQty30d - a.soldQty30d)
    .slice(0, 15)
    .map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      soldQty30d: p.soldQty30d,
      revenue30d: p.revenue30d,
      currentStock: p.stock,
      daysRemaining: p.daysRemaining,
    }));

  // Slow/Dead stock: has stock but zero sales in 30d, sorted by tied capital value
  const deadStock = enriched
    .filter((p) => p.stock > 0 && p.soldQty30d === 0)
    .map((p) => ({ ...p, tiedValue: Math.round(p.stock * p.wholesaleCost) }))
    .sort((a, b) => b.tiedValue - a.tiedValue)
    .slice(0, 15)
    .map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      currentStock: p.stock,
      unit: p.unit,
      tiedValue: p.tiedValue,
      sellingPrice: p.sellingPrice,
    }));

  // Reorder suggestions: fast-movers that are low/out of stock
  const reorderSuggestions = enriched
    .filter((p) => p.soldQty30d > 0 && (p.stock <= p.minStock || (p.daysRemaining !== null && p.daysRemaining <= 7)))
    .sort((a, b) => b.revenue30d - a.revenue30d)
    .slice(0, 10)
    .map((p) => {
      // Suggest ~2 weeks of stock based on velocity
      const dailyVelocity = p.soldQty30d / 30;
      const suggestedQty = Math.ceil(dailyVelocity * 14);
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        currentStock: p.stock,
        daysRemaining: p.daysRemaining,
        suggestedQty: Math.max(suggestedQty, p.minStock - p.stock + 1),
        unit: p.unit,
        estimatedCost: Math.round(suggestedQty * p.wholesaleCost),
      };
    });

  // Low margin: items below 10% margin with sales activity
  const lowMargin = enriched
    .filter((p) => p.wholesaleCost > 0 && p.marginPct < 10 && p.soldQty30d > 0)
    .sort((a, b) => a.marginPct - b.marginPct)
    .slice(0, 10)
    .map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      sellingPrice: p.sellingPrice,
      wholesaleCost: p.wholesaleCost,
      marginPct: p.marginPct,
      soldQty30d: p.soldQty30d,
    }));

  // Business health score (0–100)
  const totalProducts = enriched.length;
  const lowStockRatio = totalProducts > 0 ? lowStock.length / totalProducts : 0;
  const deadStockRatio = totalProducts > 0 ? deadStock.length / totalProducts : 0;
  const activeSellersCount = enriched.filter((p) => p.soldQty30d > 0).length;
  const activeRatio = totalProducts > 0 ? activeSellersCount / totalProducts : 0;
  const inventoryHealthScore = Math.max(
    0,
    Math.min(100, Math.round(100 - lowStockRatio * 30 - deadStockRatio * 40 + activeRatio * 20))
  );

  return json({
    summary: {
      totalProducts,
      lowStockCount: lowStock.length,
      deadStockCount: deadStock.length,
      fastMovingCount: fastMoving.length,
      inventoryHealthScore,
      totalReorderCost: reorderSuggestions.reduce((a, r) => a + r.estimatedCost, 0),
    },
    lowStock,
    fastMoving,
    deadStock,
    reorderSuggestions,
    lowMargin,
    nearExpiry: isWholesale
      ? (nearExpiryBatches as any[]).map((b) => ({
          id: b.id,
          product: b.product.name,
          category: b.product.category,
          quantity: b.quantity,
          expiryDate: b.expiryDate,
          daysUntilExpiry: Math.ceil((new Date(b.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
        }))
      : [],
  });
});
