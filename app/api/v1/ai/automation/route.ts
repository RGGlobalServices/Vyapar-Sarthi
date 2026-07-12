import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * AI Automation Suggestions — read-only. Returns structured actionable suggestions.
 * This endpoint NEVER writes data. All suggestions require user confirmation before action.
 */
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const shopId = shop.id;

  const since30 = new Date();
  since30.setDate(since30.getDate() - 30);

  const [products, saleItems, customers, expenses] = await Promise.all([
    prisma.product.findMany({
      where: { shopId },
      select: {
        id: true, name: true, category: true,
        currentStock: true, minStock: true,
        sellingPrice: true, wholesaleCost: true,
      },
      take: 400,
    }),
    prisma.saleItem.findMany({
      where: { sale: { shopId, createdAt: { gte: since30 } } },
      select: { productId: true, quantity: true, pricePerUnit: true },
    }),
    prisma.customer.findMany({
      where: { shopId, totalDue: { gt: 0 } },
      select: { id: true, name: true, mobile: true, totalDue: true },
      orderBy: { totalDue: 'desc' },
      take: 10,
    }),
    prisma.expense.groupBy({
      by: ['category'],
      where: { shopId, createdAt: { gte: since30 } },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: 5,
    }),
  ]);

  const soldMap: Record<string, { qty: number; revenue: number }> = {};
  for (const si of saleItems) {
    const k = si.productId || 'x';
    if (!soldMap[k]) soldMap[k] = { qty: 0, revenue: 0 };
    soldMap[k].qty += si.quantity || 0;
    soldMap[k].revenue += (si.pricePerUnit || 0) * (si.quantity || 0);
  }

  const suggestions: {
    id: string;
    type: 'reorder' | 'collect_outstanding' | 'clear_dead_stock' | 'review_margin' | 'reduce_expense';
    priority: 'high' | 'medium' | 'low';
    title: string;
    description: string;
    impact: string;
    actionLabel: string;
    actionPath?: string;
    data?: any;
  }[] = [];

  // 1. Reorder suggestions for fast-movers that are low
  const reorderCandidates = products
    .filter((p) => {
      const s = soldMap[p.id];
      return s && s.qty > 0 && (p.currentStock ?? 0) <= (p.minStock ?? 0);
    })
    .sort((a, b) => (soldMap[b.id]?.revenue || 0) - (soldMap[a.id]?.revenue || 0))
    .slice(0, 5);

  for (const p of reorderCandidates) {
    const dailyVelocity = (soldMap[p.id]?.qty || 0) / 30;
    const suggestedQty = Math.max(Math.ceil(dailyVelocity * 14), 1);
    suggestions.push({
      id: `reorder_${p.id}`,
      type: 'reorder',
      priority: (p.currentStock ?? 0) === 0 ? 'high' : 'medium',
      title: `Reorder ${p.name}`,
      description: `Only ${p.currentStock ?? 0} units left. Selling ~${Math.ceil(dailyVelocity)}/day. Will stock out in ${(p.currentStock ?? 0) > 0 ? `${Math.floor((p.currentStock ?? 0) / dailyVelocity)} days` : 'already out'}.`,
      impact: `Suggest ordering ${suggestedQty} units (~₹${Math.round(suggestedQty * (p.wholesaleCost || 0)).toLocaleString('en-IN')} cost)`,
      actionLabel: 'Go to Purchases',
      actionPath: '/purchases',
      data: { productId: p.id, suggestedQty, estimatedCost: Math.round(suggestedQty * (p.wholesaleCost || 0)) },
    });
  }

  // 2. Outstanding collection suggestions
  for (const c of customers.slice(0, 3)) {
    suggestions.push({
      id: `collect_${c.id}`,
      type: 'collect_outstanding',
      priority: (c.totalDue || 0) > 5000 ? 'high' : 'medium',
      title: `Collect ₹${(c.totalDue || 0).toLocaleString('en-IN')} from ${c.name}`,
      description: `${c.name} (${c.mobile || 'no mobile'}) has outstanding of ₹${(c.totalDue || 0).toLocaleString('en-IN')}.`,
      impact: `Recovering this will improve your cash position by ₹${(c.totalDue || 0).toLocaleString('en-IN')}`,
      actionLabel: 'View Ledger',
      actionPath: '/udhar',
      data: { customerId: c.id, amount: c.totalDue, mobile: c.mobile },
    });
  }

  // 3. Dead stock clearance suggestions
  const deadStockCandidates = products
    .filter((p) => (p.currentStock ?? 0) > 0 && !soldMap[p.id])
    .map((p) => ({ ...p, tiedValue: (p.currentStock ?? 0) * (p.wholesaleCost || 0) }))
    .sort((a, b) => b.tiedValue - a.tiedValue)
    .slice(0, 3);

  for (const p of deadStockCandidates) {
    suggestions.push({
      id: `dead_${p.id}`,
      type: 'clear_dead_stock',
      priority: p.tiedValue > 5000 ? 'medium' : 'low',
      title: `Clear dead stock: ${p.name}`,
      description: `${p.name} has ${p.currentStock} units with no sales in 30 days. ₹${Math.round(p.tiedValue).toLocaleString('en-IN')} tied up.`,
      impact: 'Consider discounting or bundling to free up cash',
      actionLabel: 'View Product',
      actionPath: `/products`,
      data: { productId: p.id, currentStock: p.currentStock, tiedValue: Math.round(p.tiedValue) },
    });
  }

  // 4. Low margin review
  const lowMarginItems = products
    .filter((p) => {
      const sold = soldMap[p.id];
      if (!sold || !p.wholesaleCost || !p.sellingPrice) return false;
      const marginPct = ((p.sellingPrice - p.wholesaleCost) / p.wholesaleCost) * 100;
      return marginPct < 5 && sold.qty > 0;
    })
    .slice(0, 2);

  for (const p of lowMarginItems) {
    const marginPct = Math.round(((p.sellingPrice! - p.wholesaleCost!) / p.wholesaleCost!) * 100);
    suggestions.push({
      id: `margin_${p.id}`,
      type: 'review_margin',
      priority: 'low',
      title: `Review price of ${p.name}`,
      description: `Only ${marginPct}% margin on ${p.name}. Selling price ₹${p.sellingPrice}, cost ₹${p.wholesaleCost}.`,
      impact: 'Increasing price by ₹' + Math.ceil((p.wholesaleCost! * 0.1)) + ' will add 10% margin',
      actionLabel: 'Edit Product',
      actionPath: `/products`,
      data: { productId: p.id, currentMarginPct: marginPct },
    });
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  const totalPotentialRecovery = customers.slice(0, 3).reduce((a, c) => a + (c.totalDue || 0), 0);
  const totalReorderCost = reorderCandidates.reduce((a, p) => {
    const dailyVelocity = (soldMap[p.id]?.qty || 0) / 30;
    const suggestedQty = Math.ceil(dailyVelocity * 14);
    return a + suggestedQty * (p.wholesaleCost || 0);
  }, 0);

  return json({
    suggestions,
    summary: {
      total: suggestions.length,
      highPriority: suggestions.filter((s) => s.priority === 'high').length,
      mediumPriority: suggestions.filter((s) => s.priority === 'medium').length,
      totalPotentialRecovery: Math.round(totalPotentialRecovery),
      totalReorderCost: Math.round(totalReorderCost),
    },
  });
});
