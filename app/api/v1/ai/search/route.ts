import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SearchIntent =
  | 'low_stock'
  | 'dead_stock'
  | 'top_products'
  | 'outstanding'
  | 'recent_bills'
  | 'product_search'
  | 'expense_summary'
  | 'unknown';

function detectIntent(query: string): { intent: SearchIntent; keywords: string[] } {
  const q = query.toLowerCase().trim();

  if (/low stock|kam stock|stock khatam|reorder|out of stock|finish|khatam/.test(q))
    return { intent: 'low_stock', keywords: [] };
  if (/dead stock|slow|no sale|nahi bika|slow moving/.test(q))
    return { intent: 'dead_stock', keywords: [] };
  if (/top|best|fast|highest|most sold|top selling|sabse zyada/.test(q))
    return { intent: 'top_products', keywords: [] };
  if (/outstanding|udhar|due|baaki|overdue/.test(q))
    return { intent: 'outstanding', keywords: [] };
  if (/recent bill|latest sale|aaj ki sale|today sale|last bill/.test(q))
    return { intent: 'recent_bills', keywords: [] };
  if (/expense|kharcha|kharch/.test(q))
    return { intent: 'expense_summary', keywords: [] };

  // Treat everything else as a product name search
  return { intent: 'product_search', keywords: q.split(/\s+/).filter((w) => w.length > 2) };
}

/**
 * AI Natural Language Search
 * Accepts a plain-text query, detects intent, returns structured results.
 * Read-only. Never modifies data.
 */
export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const shopId = shop.id;
  const { query } = await readBody(req);

  if (!query?.trim()) {
    return json({ intent: 'unknown', results: [], message: 'Please enter a search query.' });
  }

  const { intent, keywords } = detectIntent(query);
  const since30 = new Date();
  since30.setDate(since30.getDate() - 30);

  if (intent === 'low_stock') {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, name, category, current_stock, min_stock
      FROM products
      WHERE shop_id = ${shopId}::uuid
        AND min_stock > 0
        AND current_stock <= min_stock
      ORDER BY (current_stock::float / NULLIF(min_stock, 0)) ASC
      LIMIT 20
    `;
    return json({
      intent,
      query,
      message: `Found ${rows.length} products at or below minimum stock.`,
      results: rows.map((r) => ({
        type: 'product',
        id: r.id,
        name: r.name,
        category: r.category,
        currentStock: Number(r.current_stock),
        minStock: Number(r.min_stock),
        status: Number(r.current_stock) === 0 ? 'Out of stock' : 'Low stock',
      })),
    });
  }

  if (intent === 'dead_stock') {
    const soldIds = await prisma.saleItem.findMany({
      where: { sale: { shopId, createdAt: { gte: since30 } } },
      select: { productId: true },
      distinct: ['productId'],
    });
    const soldSet = new Set(soldIds.map((s) => s.productId).filter(Boolean));

    const rows = await prisma.product.findMany({
      where: { shopId, currentStock: { gt: 0 } },
      select: { id: true, name: true, category: true, currentStock: true, sellingPrice: true, wholesaleCost: true },
      take: 100,
    });
    const deadRows = rows.filter((p) => !soldSet.has(p.id));

    return json({
      intent,
      query,
      message: `Found ${deadRows.length} products with no sales in 30 days.`,
      results: deadRows.map((r) => ({
        type: 'product',
        id: r.id,
        name: r.name,
        category: r.category,
        currentStock: r.currentStock,
        tiedCapital: Math.round((r.currentStock || 0) * (r.wholesaleCost || 0)),
      })),
    });
  }

  if (intent === 'top_products') {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT p.id, p.name, p.category,
        SUM(si.quantity)::float as qty_sold,
        SUM(si.price_per_unit * si.quantity)::float as revenue
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN products p ON si.product_id = p.id
      WHERE s.shop_id = ${shopId}::uuid
        AND s.created_at >= ${since30}
      GROUP BY p.id, p.name, p.category
      ORDER BY revenue DESC
      LIMIT 15
    `;
    return json({
      intent,
      query,
      message: `Top ${rows.length} selling products in last 30 days.`,
      results: rows.map((r) => ({
        type: 'product',
        id: r.id,
        name: r.name,
        category: r.category,
        qtySold: Number(r.qty_sold),
        revenue: Math.round(Number(r.revenue)),
      })),
    });
  }

  if (intent === 'outstanding') {
    const rows = await prisma.customer.findMany({
      where: { shopId, totalDue: { gt: 0 } },
      select: { id: true, name: true, mobile: true, totalDue: true },
      orderBy: { totalDue: 'desc' },
      take: 20,
    });
    const total = rows.reduce((a, r) => a + (r.totalDue || 0), 0);
    return json({
      intent,
      query,
      message: `${rows.length} customers have outstanding totaling ₹${total.toLocaleString('en-IN')}.`,
      results: rows.map((r) => ({
        type: 'customer',
        id: r.id,
        name: r.name,
        mobile: r.mobile,
        outstanding: r.totalDue,
      })),
    });
  }

  if (intent === 'recent_bills') {
    const rows = await prisma.sale.findMany({
      where: { shopId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { customer: { select: { name: true, mobile: true } } },
    });
    return json({
      intent,
      query,
      message: `Last ${rows.length} bills.`,
      results: rows.map((s) => ({
        type: 'bill',
        id: s.id,
        invoiceNumber: s.invoice_number,
        totalAmount: s.totalAmount,
        paymentType: s.paymentType,
        customerName: s.customer?.name || 'Walk-in',
        createdAt: s.createdAt,
      })),
    });
  }

  if (intent === 'expense_summary') {
    const rows = await prisma.expense.groupBy({
      by: ['category'],
      where: { shopId, createdAt: { gte: since30 } },
      _sum: { amount: true },
      _count: { id: true },
      orderBy: { _sum: { amount: 'desc' } },
    });
    const total = rows.reduce((a, r) => a + (r._sum.amount || 0), 0);
    return json({
      intent,
      query,
      message: `Total expenses in last 30 days: ₹${total.toLocaleString('en-IN')}`,
      results: rows.map((r) => ({
        type: 'expense_category',
        category: r.category,
        amount: r._sum.amount || 0,
        count: r._count.id,
      })),
    });
  }

  // product_search — fuzzy name search
  const nameConditions = keywords.map((k) => ({ name: { contains: k, mode: 'insensitive' as const } }));
  const rows = await prisma.product.findMany({
    where: { shopId, OR: nameConditions.length > 0 ? nameConditions : [{ name: { contains: query, mode: 'insensitive' } }] },
    select: { id: true, name: true, category: true, currentStock: true, sellingPrice: true, mrp: true },
    take: 20,
  });

  return json({
    intent: 'product_search',
    query,
    message: rows.length > 0 ? `Found ${rows.length} matching products.` : 'No products found matching your search.',
    results: rows.map((r) => ({
      type: 'product',
      id: r.id,
      name: r.name,
      category: r.category,
      currentStock: r.currentStock,
      sellingPrice: r.sellingPrice,
      mrp: r.mrp,
    })),
  });
});
