import prisma from '@/lib/server/prisma';
import { requireShop, requireShopScope } from '@/lib/server/auth';
import { handle, json, query } from '@/lib/server/http';
import { getDateRange, formatDate, startOfDay, endOfDay } from '@/lib/server/dates';
import { normalizeAttendanceStatus, summarizeAttendance } from '@/lib/attendance';
import { classifySaleLine, classifyPurchaseLine } from '@/lib/gstClassification';
import { isSupplierCredit, isCustomerCredit } from '@/lib/server/ledgerClassification';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const q = query(req);
  const { startDate, endDate } = getDateRange(q);
  const module = q.module || 'sales'; // sales | purchases | stock | crm | financials | expenses | staff

  // Only these three modules currently pool across shops when All Shop Access
  // is on (the ones the feature was actually asked for — sales, stock, CRM
  // outstanding); the rest stay single-shop via the plain requireShop() they
  // already used, unchanged. requireShopScope()'s shopIds degenerates to
  // [shop.id] when the preference is off, so this is a no-op query-wise for
  // every existing user regardless of which module they hit.
  if (module === 'sales' || module === 'stock' || module === 'crm') {
    const scope = await requireShopScope(req);
    switch (module) {
      case 'sales':
        return handleSales(scope.shop, startDate, endDate, q, scope);
      case 'stock':
        return handleStock(scope.shop, startDate, endDate, q, scope);
      case 'crm':
        return handleCRM(scope.shop, startDate, endDate, q, scope);
    }
  }

  const { shop } = await requireShop(req);
  switch (module) {
    case 'purchases':
      return handlePurchases(shop, startDate, endDate, q);
    case 'financials':
      return handleFinancials(shop, startDate, endDate, q);
    case 'expenses':
      return handleExpenses(shop, startDate, endDate, q);
    case 'staff':
      return handleStaff(shop, startDate, endDate, q);
    case 'ca':
      return handleCA(shop, startDate, endDate, q);
    default:
      return json({ error: 'Unknown module' }, 400);
  }
});

type Scope = { shopIds: string[]; allShopAccess: boolean; ownedShops: any[] };

// ─── SALES ──────────────────────────────────────────────────────────────────
async function handleSales(shop: any, startDate: Date, endDate: Date, q: Record<string, string>, scope: Scope) {
  const reportType = q.report_type || 'trend'; // trend | by_product | by_category | by_customer | by_payment | gst
  const { shopIds, allShopAccess, ownedShops } = scope;
  const shopNameById = new Map(ownedShops.map((s: any) => [s.id, s.name]));

  if (reportType === 'trend') {
    const groupBy = q.group_by || 'day'; // day | week | month

    const sales = await prisma.sale.findMany({
      where: { shopId: { in: shopIds }, createdAt: { gte: startDate, lte: endDate } },
      select: { totalAmount: true, totalProfit: true, paymentType: true, amountPaid: true, createdAt: true, invoice_number: true },
      orderBy: { createdAt: 'asc' }
    });

    const buckets: Record<string, { date: string; revenue: number; profit: number; count: number; outstanding: number }> = {};
    for (const s of sales) {
      let key: string;
      const d = new Date(s.createdAt!);
      if (groupBy === 'month') key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      else if (groupBy === 'week') {
        const start = new Date(d); start.setDate(d.getDate() - d.getDay());
        key = formatDate(start);
      } else key = formatDate(d);

      if (!buckets[key]) buckets[key] = { date: key, revenue: 0, profit: 0, count: 0, outstanding: 0 };
      buckets[key].revenue += s.totalAmount || 0;
      buckets[key].profit += s.totalProfit || 0;
      buckets[key].count += 1;
      buckets[key].outstanding += Math.max(0, (s.totalAmount || 0) - (s.amountPaid || 0));
    }

    const totalRevenue = sales.reduce((a, s) => a + (s.totalAmount || 0), 0);
    const totalProfit = sales.reduce((a, s) => a + (s.totalProfit || 0), 0);

    return json({
      trend: Object.values(buckets),
      summary: {
        revenue: totalRevenue,
        profit: totalProfit,
        margin: totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100 * 100) / 100 : 0,
        count: sales.length,
        outstanding: sales.reduce((a, s) => a + Math.max(0, (s.totalAmount || 0) - (s.amountPaid || 0)), 0)
      }
    });
  }

  if (reportType === 'by_product') {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT p.id, p.shop_id, p.name, p.category, p.brand,
        SUM(si.price_per_unit * si.quantity)::float as revenue,
        SUM(si.margin_per_unit * si.quantity)::float as profit,
        SUM(si.quantity)::float as qty,
        COUNT(DISTINCT s.id)::int as bill_count
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN products p ON si.product_id = p.id
      WHERE s.shop_id = ANY(${shopIds}::uuid[])
        AND s.created_at >= ${startDate}
        AND s.created_at <= ${endDate}
      GROUP BY p.id, p.shop_id, p.name, p.category, p.brand
      ORDER BY revenue DESC
      LIMIT 100
    `;
    return json({
      rows: rows.map(r => ({
        ...r,
        revenue: Number(r.revenue),
        profit: Number(r.profit),
        qty: Number(r.qty),
        ...(allShopAccess ? { shopName: shopNameById.get(r.shop_id) } : {}),
      })),
    });
  }

  if (reportType === 'by_category') {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT COALESCE(p.category, 'Uncategorized') as category,
        SUM(si.price_per_unit * si.quantity)::float as revenue,
        SUM(si.margin_per_unit * si.quantity)::float as profit,
        SUM(si.quantity)::float as qty,
        COUNT(DISTINCT s.id)::int as bill_count
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN products p ON si.product_id = p.id
      WHERE s.shop_id = ${shop.id}::uuid
        AND s.created_at >= ${startDate}
        AND s.created_at <= ${endDate}
      GROUP BY category
      ORDER BY revenue DESC
    `;
    return json({ rows: rows.map(r => ({ ...r, revenue: Number(r.revenue), profit: Number(r.profit), qty: Number(r.qty) })) });
  }

  // Brand-wise sales — groups by the free-text Product.brand column, which
  // captures both mapped (via brand_id → brands.name) and unmapped products
  // in one dimension. Agro / medical / cosmetics shops care about which
  // product line moves fastest ("Ridomil vs Roundup vs Bio Gold"); Brand-wise
  // is the natural roll-up for that.
  if (reportType === 'by_brand') {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT COALESCE(NULLIF(TRIM(p.brand), ''), 'Unbranded') as brand,
        SUM(si.price_per_unit * si.quantity)::float as revenue,
        SUM(si.margin_per_unit * si.quantity)::float as profit,
        SUM(si.quantity)::float as qty,
        COUNT(DISTINCT s.id)::int as bill_count,
        COUNT(DISTINCT p.id)::int as sku_count
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN products p ON si.product_id = p.id
      WHERE s.shop_id = ${shop.id}::uuid
        AND s.created_at >= ${startDate}
        AND s.created_at <= ${endDate}
      GROUP BY brand
      ORDER BY revenue DESC
    `;
    return json({ rows: rows.map(r => ({ ...r, revenue: Number(r.revenue), profit: Number(r.profit), qty: Number(r.qty) })) });
  }

  // Company-wise sales — groups by the linked master Brand row where
  // `manufacturer = true`. In agri / pharma retail the same shop often carries
  // multiple brands from one manufacturer (Syngenta, Bayer, Coromandel), and
  // supplier / distributor rebates are settled at the company level. Products
  // that aren't linked to a manufacturer land in "Unassigned" so nothing is
  // silently dropped from the total.
  if (reportType === 'by_company') {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT COALESCE(b.name, 'Unassigned') as company,
        SUM(si.price_per_unit * si.quantity)::float as revenue,
        SUM(si.margin_per_unit * si.quantity)::float as profit,
        SUM(si.quantity)::float as qty,
        COUNT(DISTINCT s.id)::int as bill_count,
        COUNT(DISTINCT p.id)::int as sku_count
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN products p ON si.product_id = p.id
      LEFT JOIN brands b ON p.brand_id = b.id AND b.manufacturer = true
      WHERE s.shop_id = ${shop.id}::uuid
        AND s.created_at >= ${startDate}
        AND s.created_at <= ${endDate}
      GROUP BY company
      ORDER BY revenue DESC
    `;
    return json({ rows: rows.map(r => ({ ...r, revenue: Number(r.revenue), profit: Number(r.profit), qty: Number(r.qty) })) });
  }

  if (reportType === 'by_customer') {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT c.id, c.name, c.mobile,
        SUM(s.total_amount)::float as total_spent,
        SUM(s.total_profit)::float as contributed_profit,
        COUNT(s.id)::int as bill_count,
        SUM(s.total_amount - s.amount_paid)::float as outstanding
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.shop_id = ${shop.id}::uuid
        AND s.created_at >= ${startDate}
        AND s.created_at <= ${endDate}
      GROUP BY c.id, c.name, c.mobile
      ORDER BY total_spent DESC
      LIMIT 100
    `;
    return json({ rows: rows.map(r => ({ ...r, total_spent: Number(r.total_spent || 0), contributed_profit: Number(r.contributed_profit || 0), outstanding: Number(r.outstanding || 0) })) });
  }

  if (reportType === 'by_payment') {
    const rows = await prisma.sale.groupBy({
      by: ['paymentType'],
      where: { shopId: shop.id, createdAt: { gte: startDate, lte: endDate } },
      _sum: { totalAmount: true, amountPaid: true },
      _count: { id: true }
    });
    return json({
      rows: rows.map(r => ({
        method: r.paymentType,
        revenue: r._sum.totalAmount || 0,
        collected: r._sum.amountPaid || 0,
        count: r._count.id
      }))
    });
  }

  if (reportType === 'gst') {
    // Prices are GST-inclusive, so extract the embedded tax:
    //   taxable = gross / (1 + rate/100),  gst = gross - taxable.
    // Only actual GST invoices (bill_type = 'gst') count toward the GST summary.
    const rows = await prisma.$queryRaw<any[]>`
      SELECT COALESCE(p.gst_percent, 0)::float as gst_rate,
        SUM(si.price_per_unit * si.quantity / (1 + COALESCE(p.gst_percent, 0) / 100))::float as taxable_value,
        SUM(si.price_per_unit * si.quantity
            - si.price_per_unit * si.quantity / (1 + COALESCE(p.gst_percent, 0) / 100))::float as gst_amount,
        SUM(si.quantity)::float as qty
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN products p ON si.product_id = p.id
      WHERE s.shop_id = ${shop.id}::uuid
        AND s.created_at >= ${startDate}
        AND s.created_at <= ${endDate}
        AND s.bill_type = 'gst'
        AND COALESCE(p.gst_percent, 0) > 0
      GROUP BY gst_rate
      ORDER BY gst_rate
    `;
    const mapped = rows.map(r => ({
      gst_rate: Number(r.gst_rate),
      taxable_value: Math.round(Number(r.taxable_value) * 100) / 100,
      gst_amount: Math.round(Number(r.gst_amount) * 100) / 100,
      cgst: Math.round((Number(r.gst_amount) / 2) * 100) / 100,
      sgst: Math.round((Number(r.gst_amount) / 2) * 100) / 100,
      qty: Number(r.qty),
    }));
    const totalTaxable = Math.round(mapped.reduce((a, r) => a + r.taxable_value, 0) * 100) / 100;
    const totalGst = Math.round(mapped.reduce((a, r) => a + r.gst_amount, 0) * 100) / 100;
    // Count of GST invoices in the period.
    const gstInvoiceCount = await prisma.sale.count({
      where: { shopId: shop.id, createdAt: { gte: startDate, lte: endDate }, billType: 'gst' },
    });
    return json({ rows: mapped, totalTaxable, totalGst, gstInvoiceCount });
  }

  if (reportType === 'gst_register') {
    // Invoice-wise GST register — the level of detail actually needed to file a
    // GST return (GSTR-1 etc.), as opposed to the rate-wise summary above.
    // Reads gst_details / gst_amount as stored at billing time, so the export
    // always matches the numbers the customer's invoice showed.
    const sales = await prisma.sale.findMany({
      where: { shopId: shop.id, createdAt: { gte: startDate, lte: endDate }, billType: 'gst' },
      orderBy: { createdAt: 'asc' },
      include: { customer: { select: { name: true, gst: true } } },
    });
    const rows = sales.map(s => {
      const g: any = s.gstDetails || {};
      return {
        date: s.createdAt,
        invoice_number: s.invoice_number,
        customer_name: s.customer?.name || 'Walk-in',
        customer_gstin: s.customer?.gst || '',
        taxable_value: Number(g.taxable ?? 0),
        cgst: Number(g.cgst ?? 0),
        sgst: Number(g.sgst ?? 0),
        igst: Number(g.igst ?? 0),
        total_gst: Number(g.totalGst ?? s.gstAmount ?? 0),
        total_amount: Number(s.totalAmount ?? 0),
      };
    });
    return json({ rows });
  }

  return json({ error: 'Unknown report_type' }, 400);
}

// ─── PURCHASES ──────────────────────────────────────────────────────────────
async function handlePurchases(shop: any, startDate: Date, endDate: Date, q: Record<string, string>) {
  if (shop.subscriptionPlan !== 'wholesale') {
    return json({ error: 'Purchase reports require Wholesale plan' }, 403);
  }

  const reportType = q.report_type || 'trend';

  if (reportType === 'trend') {
    const invoices = await prisma.purchaseInvoice.findMany({
      where: { shopId: shop.id, date: { gte: startDate, lte: endDate } },
      select: { totalCost: true, gst: true, date: true },
      orderBy: { date: 'asc' }
    });
    const buckets: Record<string, { date: string; cost: number; gst: number; count: number }> = {};
    for (const inv of invoices) {
      const key = formatDate(inv.date || new Date());
      if (!buckets[key]) buckets[key] = { date: key, cost: 0, gst: 0, count: 0 };
      buckets[key].cost += inv.totalCost || 0;
      buckets[key].gst += inv.gst || 0;
      buckets[key].count += 1;
    }
    const totalCost = invoices.reduce((a, i) => a + (i.totalCost || 0), 0);
    const totalGst = invoices.reduce((a, i) => a + (i.gst || 0), 0);
    return json({ trend: Object.values(buckets), summary: { cost: totalCost, gst: totalGst, count: invoices.length } });
  }

  if (reportType === 'by_supplier') {
    const rows = await prisma.purchaseInvoice.groupBy({
      by: ['supplierId'],
      where: { shopId: shop.id, date: { gte: startDate, lte: endDate } },
      _sum: { totalCost: true, gst: true },
      _count: { id: true }
    });
    const suppliers = await prisma.supplier.findMany({ where: { id: { in: rows.map(r => r.supplierId!) } }, select: { id: true, name: true, mobile: true } });
    const map = Object.fromEntries(suppliers.map(s => [s.id, s]));
    return json({ rows: rows.map(r => ({ supplier: map[r.supplierId!], cost: r._sum.totalCost || 0, gst: r._sum.gst || 0, count: r._count.id })) });
  }

  if (reportType === 'by_product') {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT p.id, p.name, p.category,
        SUM(pi.quantity)::float as qty,
        SUM(pi.quantity * pi.cost)::float as cost,
        COUNT(DISTINCT pi.purchase_invoice_id)::int as invoice_count
      FROM purchase_items pi
      JOIN purchase_invoices inv ON pi.purchase_invoice_id = inv.id
      JOIN products p ON pi.product_id = p.id
      WHERE inv.shop_id = ${shop.id}::uuid
        AND inv.date >= ${startDate}
        AND inv.date <= ${endDate}
      GROUP BY p.id, p.name, p.category
      ORDER BY cost DESC
      LIMIT 100
    `;
    return json({ rows: rows.map(r => ({ ...r, qty: Number(r.qty), cost: Number(r.cost) })) });
  }

  return json({ error: 'Unknown report_type' }, 400);
}

// ─── STOCK ───────────────────────────────────────────────────────────────────
async function handleStock(shop: any, startDate: Date, endDate: Date, q: Record<string, string>, scope: Scope) {
  const reportType = q.report_type || 'current';

  if (reportType === 'current') {
    const { shopIds, allShopAccess, ownedShops } = scope;
    const shopNameById = new Map(ownedShops.map((s: any) => [s.id, s.name]));
    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, shop_id, name, category, brand, current_stock, min_stock, selling_price,
        (current_stock * selling_price)::float as stock_value,
        CASE WHEN min_stock > 0 AND current_stock <= min_stock THEN 'low'
             WHEN current_stock = 0 THEN 'out'
             ELSE 'ok' END as status
      FROM products
      WHERE shop_id = ANY(${shopIds}::uuid[])
      ORDER BY current_stock ASC
    `;
    const totalValue = rows.reduce((a, r) => a + Number(r.stock_value || 0), 0);
    const lowCount = rows.filter(r => r.status === 'low').length;
    const outCount = rows.filter(r => r.status === 'out').length;
    return json({
      rows: rows.map(r => ({
        ...r,
        current_stock: Number(r.current_stock),
        stock_value: Number(r.stock_value || 0),
        ...(allShopAccess ? { shopName: shopNameById.get(r.shop_id) } : {}),
      })),
      summary: { totalProducts: rows.length, totalValue, lowCount, outCount }
    });
  }

  if (reportType === 'valuation') {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT category, 
        COUNT(*)::int as product_count,
        SUM(current_stock)::float as total_qty,
        SUM(current_stock * selling_price)::float as stock_value
      FROM products
      WHERE shop_id = ${shop.id}::uuid AND current_stock > 0
      GROUP BY category
      ORDER BY stock_value DESC
    `;
    return json({ rows: rows.map(r => ({ ...r, total_qty: Number(r.total_qty), stock_value: Number(r.stock_value) })) });
  }

  if (reportType === 'movement') {
    const rows = await prisma.stockMovement.findMany({
      where: { shopId: shop.id, createdAt: { gte: startDate, lte: endDate } },
      orderBy: { createdAt: 'desc' },
      take: 200
    });
    
    const productIds = Array.from(new Set(rows.map((r: any) => r.productId)));
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, category: true }
    });
    const productMap = Object.fromEntries(products.map((p: any) => [p.id, p]));
    
    return json({ rows: rows.map((r: any) => ({ id: r.id, type: r.type, quantity: r.quantity, product: productMap[r.productId] || { name: 'Unknown' }, createdAt: r.createdAt })) });
  }

  if (reportType === 'near_expiry') {
    if (shop.subscriptionPlan !== 'wholesale') return json({ error: 'Requires Wholesale plan' }, 403);
    const days = parseInt(q.days || '30');
    const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const rows = await prisma.batch.findMany({
      where: { shopId: shop.id, quantity: { gt: 0 }, expiryDate: { lte: cutoff } },
      include: { product: { select: { name: true, category: true } } },
      orderBy: { expiryDate: 'asc' }
    });
    return json({ rows });
  }

  if (reportType === 'dead_stock') {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT p.id, p.name, p.category, p.current_stock, p.selling_price,
        (p.current_stock * p.selling_price)::float as tied_value
      FROM products p
      WHERE p.shop_id = ${shop.id}::uuid AND p.current_stock > 0
        AND p.id NOT IN (
          SELECT DISTINCT si.product_id
          FROM sale_items si
          JOIN sales s ON si.sale_id = s.id
          WHERE s.shop_id = ${shop.id}::uuid
            AND s.created_at >= ${startDate}
        )
      ORDER BY tied_value DESC
      LIMIT 100
    `;
    return json({ rows: rows.map(r => ({ ...r, current_stock: Number(r.current_stock), tied_value: Number(r.tied_value) })) });
  }

  return json({ error: 'Unknown report_type' }, 400);
}

// ─── FINANCIALS ──────────────────────────────────────────────────────────────
async function handleFinancials(shop: any, startDate: Date, endDate: Date, q: Record<string, string>) {
  const reportType = q.report_type || 'pnl';

  if (reportType === 'pnl') {
    const [salesAgg, expensesAgg, salariesAgg] = await Promise.all([
      prisma.sale.aggregate({
        where: { shopId: shop.id, createdAt: { gte: startDate, lte: endDate } },
        _sum: { totalAmount: true, totalProfit: true, amountPaid: true }
      }),
      prisma.expense.aggregate({
        where: { shopId: shop.id, createdAt: { gte: startDate, lte: endDate } },
        _sum: { amount: true }
      }),
      prisma.salaryPayment.aggregate({
        where: { staff: { shopId: shop.id }, paidAt: { gte: startDate, lte: endDate } },
        _sum: { netAmount: true }
      })
    ]);

    const grossRevenue = salesAgg._sum.totalAmount || 0;
    const grossProfit = salesAgg._sum.totalProfit || 0;
    const totalExpenses = expensesAgg._sum.amount || 0;
    const totalSalaries = salariesAgg._sum.netAmount || 0;
    const netProfit = grossProfit - totalExpenses - totalSalaries;
    const margin = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;

    return json({
      revenue: grossRevenue,
      gross_profit: grossProfit,
      gross_margin: grossRevenue > 0 ? (grossProfit / grossRevenue) * 100 : 0,
      expenses: totalExpenses,
      salaries: totalSalaries,
      total_overhead: totalExpenses + totalSalaries,
      net_profit: netProfit,
      net_margin: margin,
      outstanding_collected: salesAgg._sum.amountPaid || 0
    });
  }

  if (reportType === 'daybook') {
    const entries = await prisma.cashBook.findMany({
      where: { shopId: shop.id, createdAt: { gte: startDate, lte: endDate } },
      orderBy: { createdAt: 'asc' }
    });

    // 'collection' (customer udhar/due payment collected in cash — see
    // lib/server/customerPayment.ts) and 'refund' (customer refund paid out
    // in cash — billing/returns/route.ts) were previously missing from both
    // lists, so cash collections and refunds silently vanished from the Day
    // Book instead of counting toward inflow/outflow respectively.
    const inflow = entries.filter(e => ['sale', 'collection', 'payment_in', 'opening_balance', 'deposit'].includes(e.type));
    const outflow = entries.filter(e => ['purchase', 'expense', 'salary', 'advance', 'withdrawal', 'payment_out', 'refund'].includes(e.type));

    const totalIn = inflow.reduce((a, e) => a + e.amount, 0);
    const totalOut = outflow.reduce((a, e) => a + e.amount, 0);

    return json({ entries, inflow_total: totalIn, outflow_total: totalOut, net_balance: totalIn - totalOut });
  }

  if (reportType === 'cashbook_summary') {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT DATE(created_at)::text as date, type,
        SUM(amount)::float as total
      FROM cash_books
      WHERE shop_id = ${shop.id}::uuid
        AND created_at >= ${startDate}
        AND created_at <= ${endDate}
      GROUP BY DATE(created_at), type
      ORDER BY date ASC
    `;
    return json({ rows: rows.map(r => ({ ...r, total: Number(r.total) })) });
  }

  return json({ error: 'Unknown report_type' }, 400);
}

// ─── EXPENSES ─────────────────────────────────────────────────────────────────
async function handleExpenses(shop: any, startDate: Date, endDate: Date, q: Record<string, string>) {
  const reportType = q.report_type || 'trend';

  if (reportType === 'trend') {
    const rows = await prisma.expense.findMany({
      where: { shopId: shop.id, createdAt: { gte: startDate, lte: endDate } },
      select: { amount: true, category: true, description: true, paymentMode: true, createdAt: true },
      orderBy: { createdAt: 'asc' }
    });
    const buckets: Record<string, { date: string; amount: number; count: number }> = {};
    for (const e of rows) {
      const key = formatDate(e.createdAt);
      if (!buckets[key]) buckets[key] = { date: key, amount: 0, count: 0 };
      buckets[key].amount += e.amount;
      buckets[key].count += 1;
    }
    const total = rows.reduce((a, e) => a + e.amount, 0);
    return json({ trend: Object.values(buckets), summary: { total, count: rows.length }, expenses: rows });
  }

  if (reportType === 'by_category') {
    const rows = await prisma.expense.groupBy({
      by: ['category'],
      where: { shopId: shop.id, createdAt: { gte: startDate, lte: endDate } },
      _sum: { amount: true },
      _count: { id: true },
      orderBy: { _sum: { amount: 'desc' } }
    });
    return json({ rows: rows.map(r => ({ category: r.category, amount: r._sum.amount || 0, count: r._count.id })) });
  }

  return json({ error: 'Unknown report_type' }, 400);
}

// ─── STAFF ────────────────────────────────────────────────────────────────────
async function handleStaff(shop: any, startDate: Date, endDate: Date, q: Record<string, string>) {
  const reportType = q.report_type || 'payroll';

  if (reportType === 'payroll') {
    const rows = await prisma.salaryPayment.findMany({
      where: { staff: { shopId: shop.id }, paidAt: { gte: startDate, lte: endDate } },
      include: { staff: { select: { name: true, role: true } } },
      orderBy: { paidAt: 'desc' }
    });
    const total = rows.reduce((a, r) => a + r.netAmount, 0);
    return json({ rows, summary: { total, count: rows.length } });
  }

  if (reportType === 'attendance') {
    const rows = await prisma.attendance.findMany({
      where: { staff: { shopId: shop.id }, date: { gte: startDate, lte: endDate } },
      include: { staff: { select: { name: true, role: true } } },
      orderBy: { date: 'desc' }
    });
    // Normalize before both summarizing and returning — old rows written by
    // either attendance UI's previous casing must still count and display
    // correctly (see lib/attendance.ts).
    const normalizedRows = rows.map(r => ({ ...r, status: normalizeAttendanceStatus(r.status) }));
    const { present, halfDay, absent, leave } = summarizeAttendance(normalizedRows);
    return json({ rows: normalizedRows, summary: { present, absent, halfDay, leave } });
  }

  return json({ error: 'Unknown report_type' }, 400);
}

// ─── CRM ──────────────────────────────────────────────────────────────────────
async function handleCRM(shop: any, startDate: Date, endDate: Date, q: Record<string, string>, scope: Scope) {
  const reportType = q.report_type || 'outstanding';
  const entityType = q.entity_type || 'customer'; // customer | supplier

  if (reportType === 'outstanding') {
    const { shopIds, allShopAccess, ownedShops } = scope;
    const shopNameById = new Map(ownedShops.map((s: any) => [s.id, s.name]));
    if (entityType === 'customer') {
      const rows = await prisma.customer.findMany({
        where: { shopId: { in: shopIds }, totalDue: { gt: 0 } },
        select: { id: true, name: true, mobile: true, totalDue: true, creditLimit: true, shopId: true },
        orderBy: { totalDue: 'desc' }
      });
      const total = rows.reduce((a, r) => a + (r.totalDue || 0), 0);
      const labeled = allShopAccess ? rows.map(r => ({ ...r, shopName: r.shopId ? shopNameById.get(r.shopId) : undefined })) : rows;
      return json({ rows: labeled, summary: { total, count: rows.length } });
    } else {
      const rows = await prisma.supplier.findMany({
        where: { shopId: { in: shopIds }, balance: { gt: 0 } },
        select: { id: true, name: true, mobile: true, balance: true, shopId: true },
        orderBy: { balance: 'desc' }
      });
      const total = rows.reduce((a, r) => a + (r.balance || 0), 0);
      const labeled = allShopAccess ? rows.map(r => ({ ...r, shopName: r.shopId ? shopNameById.get(r.shopId) : undefined })) : rows;
      return json({ rows: labeled, summary: { total, count: rows.length } });
    }
  }

  if (reportType === 'ledger') {
    const id = q.entity_id;
    if (!id) return json({ error: 'entity_id required' }, 400);

    if (entityType === 'customer') {
      const [entity, transactions] = await Promise.all([
        prisma.customer.findUnique({ where: { id }, select: { name: true, mobile: true, totalDue: true } }),
        prisma.customer_transactions.findMany({
          where: { customer_id: id },
          orderBy: { created_at: 'desc' },
          take: 200
        })
      ]);
      return json({ entity, transactions });
    } else {
      const [entity, transactions] = await Promise.all([
        prisma.supplier.findUnique({ where: { id }, select: { name: true, mobile: true, balance: true } }),
        prisma.supplierTransaction.findMany({
          where: { supplierId: id },
          orderBy: { createdAt: 'desc' },
          take: 200
        })
      ]);
      return json({ entity, transactions });
    }
  }

  return json({ error: 'Unknown report_type' }, 400);
}

// ─── CA REPORTS ────────────────────────────────────────────────────────────
// Phase 1 of the CA/Accountant reporting layer: Sales Register, Purchase
// Register, GST Summary + monthly breakdown, Non-GST report, and a
// Data-Quality checklist. Every number here is read directly from what's
// already stored at billing/purchase time — see lib/gstClassification.ts's
// header comment for exactly what is and isn't invented. Single-shop only
// (same as Purchases/Financials above), matching what a CA needs precision
// on for one legal entity at a time rather than a pooled multi-shop total.
async function handleCA(shop: any, startDate: Date, endDate: Date, q: Record<string, string>) {
  const reportType = q.report_type || 'sales_register';

  if (reportType === 'sales_register') {
    const where: any = { sale: { shopId: shop.id, createdAt: { gte: startDate, lte: endDate } } };
    if (q.customer_id) where.sale.customerId = q.customer_id;
    if (q.payment_mode) where.sale.paymentType = q.payment_mode;
    if (q.gst_class && q.gst_class !== 'gst') where.sale.billType = 'non_gst';
    if (q.gst_class === 'gst') where.sale.billType = 'gst';

    const items = await prisma.saleItem.findMany({
      where,
      include: {
        sale: { include: { customer: { select: { name: true, mobile: true, gst: true } } } },
        product: { select: { id: true, name: true, hsnCode: true, gstPercent: true } },
      },
      orderBy: { sale: { createdAt: 'asc' } },
    });

    let rows = items.filter((it): it is typeof it & { sale: NonNullable<typeof it.sale> } => it.sale !== null).map((it) => {
      const sale = it.sale;
      const g: any = sale.gstDetails || {};
      const rate = it.product?.gstPercent ?? null;
      const lineTotal = (it.pricePerUnit || 0) * (it.quantity || 0);
      const taxable = rate != null && rate > 0 ? lineTotal / (1 + rate / 100) : lineTotal;
      const gstAmount = lineTotal - taxable;
      // Real per-line CGST/SGST/IGST only exists when the invoice's own
      // gstDetails.groups (from lib/gst.ts's computeGst()) carries a group
      // at this exact rate — never split an aggregate amount ourselves.
      const rateGroup = Array.isArray(g.groups) ? g.groups.find((gr: any) => gr.rate === rate) : null;
      const paidRatio = sale.totalAmount ? (sale.amountPaid || 0) / sale.totalAmount : 1;
      const paymentStatus = paidRatio >= 0.999 ? 'paid' : paidRatio > 0 ? 'partial' : 'unpaid';
      return {
        saleId: sale.id,
        date: sale.createdAt,
        invoiceNumber: sale.invoice_number,
        customerName: sale.customer?.name || '__walk_in__',
        customerGstin: sale.customer?.gst || '',
        product: it.product?.name || it.itemName || '__unknown_item__',
        hsn: it.product?.hsnCode || '',
        quantity: it.quantity,
        unit: it.unit || '',
        taxableValue: Math.round(taxable * 100) / 100,
        gstRate: rate,
        cgst: rateGroup ? rateGroup.cgst : null,
        sgst: rateGroup ? rateGroup.sgst : null,
        igst: rateGroup ? rateGroup.igst : null,
        gstAmount: sale.billType === 'gst' ? Math.round(gstAmount * 100) / 100 : 0,
        gstSplitRecorded: !!rateGroup,
        invoiceTotal: sale.totalAmount,
        paymentStatus,
        paymentMode: sale.paymentType,
        gstClass: classifySaleLine(sale.billType, it.product?.gstPercent, it.product?.hsnCode),
      };
    });

    if (q.gst_class === 'gst_info_missing') rows = rows.filter(r => r.gstClass === 'gst_info_missing');
    if (q.gst_rate) rows = rows.filter(r => String(r.gstRate ?? '') === q.gst_rate);
    if (q.hsn) rows = rows.filter(r => r.hsn === q.hsn);
    if (q.payment_status) rows = rows.filter(r => r.paymentStatus.toLowerCase() === q.payment_status.toLowerCase());

    const summary = {
      lineCount: rows.length,
      invoiceTotal: rows.reduce((a, r) => a + (r.invoiceTotal || 0), 0),
      taxableTotal: rows.reduce((a, r) => a + r.taxableValue, 0),
      gstTotal: rows.reduce((a, r) => a + r.gstAmount, 0),
    };
    return json({ rows, summary });
  }

  if (reportType === 'purchase_register') {
    const where: any = { purchaseInvoice: { shopId: shop.id, date: { gte: startDate, lte: endDate } } };
    if (q.supplier_id) where.purchaseInvoice.supplierId = q.supplier_id;

    const items = await prisma.purchaseItem.findMany({
      where,
      include: {
        purchaseInvoice: { include: { supplier: { select: { name: true, mobile: true, gst: true } } } },
        product: { select: { id: true, name: true, hsnCode: true, gstPercent: true } },
      },
      orderBy: { purchaseInvoice: { date: 'asc' } },
    });

    let rows = items.map((it) => {
      const inv = it.purchaseInvoice;
      const lineTotal = (it.cost || 0) * (it.quantity || 0);
      const gstClass = classifyPurchaseLine(it.gst, it.product?.gstPercent);
      return {
        purchaseInvoiceId: inv.id,
        date: inv.date,
        billNumber: inv.invoiceNumber,
        supplierName: inv.supplier?.name || '__unknown_supplier__',
        supplierGstin: inv.supplier?.gst || '',
        product: it.product?.name || '__unknown_item__',
        hsn: it.product?.hsnCode || '',
        quantity: it.quantity,
        taxableValue: Math.round((lineTotal - (it.gst || 0)) * 100) / 100,
        // No CGST/SGST/IGST split exists for purchases in this data model —
        // PurchaseItem.gst is a single recorded amount, never invented into
        // a split. See lib/gstClassification.ts.
        gstAmount: it.gst || 0,
        discountPercent: it.discountPercent,
        total: Math.round(lineTotal * 100) / 100,
        gstClass,
      };
    });

    if (q.gst_class) rows = rows.filter(r => r.gstClass === q.gst_class);

    const summary = {
      lineCount: rows.length,
      total: rows.reduce((a, r) => a + r.total, 0),
      gstTotal: rows.reduce((a, r) => a + r.gstAmount, 0),
    };
    return json({ rows, summary });
  }

  if (reportType === 'gst_summary' || reportType === 'gst_monthly') {
    const [saleItems, purchaseItems] = await Promise.all([
      prisma.saleItem.findMany({
        where: { sale: { shopId: shop.id, createdAt: { gte: startDate, lte: endDate }, billType: 'gst' } },
        include: { sale: { select: { createdAt: true, gstDetails: true } }, product: { select: { gstPercent: true } } },
      }),
      prisma.purchaseItem.findMany({
        where: { purchaseInvoice: { shopId: shop.id, date: { gte: startDate, lte: endDate } }, gst: { gt: 0 } },
        include: { purchaseInvoice: { select: { date: true } } },
      }),
    ]);

    const monthKey = (d: Date | null) => {
      const dt = d ? new Date(d) : new Date();
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    };

    const outputByRate = new Map<number, { taxable: number; cgst: number; sgst: number; igst: number }>();
    const outputByMonth = new Map<string, { taxable: number; gst: number }>();
    for (const it of saleItems) {
      if (!it.sale) continue;
      const rate = it.product?.gstPercent || 0;
      if (rate <= 0) continue;
      const lineTotal = (it.pricePerUnit || 0) * (it.quantity || 0);
      const taxable = lineTotal / (1 + rate / 100);
      const gstAmt = lineTotal - taxable;
      const g: any = it.sale.gstDetails || {};
      const rateGroup = Array.isArray(g.groups) ? g.groups.find((gr: any) => gr.rate === rate) : null;
      const r = outputByRate.get(rate) || { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      r.taxable += taxable;
      r.cgst += rateGroup ? rateGroup.cgst : gstAmt / 2;
      r.sgst += rateGroup ? rateGroup.sgst : gstAmt / 2;
      r.igst += rateGroup ? rateGroup.igst : 0;
      outputByRate.set(rate, r);
      const mk = monthKey(it.sale.createdAt);
      const m = outputByMonth.get(mk) || { taxable: 0, gst: 0 };
      m.taxable += taxable; m.gst += gstAmt;
      outputByMonth.set(mk, m);
    }

    let inputTaxable = 0, inputGst = 0;
    const inputByMonth = new Map<string, { taxable: number; gst: number }>();
    for (const it of purchaseItems) {
      const lineTotal = (it.cost || 0) * (it.quantity || 0);
      const taxable = lineTotal - (it.gst || 0);
      inputTaxable += taxable;
      inputGst += it.gst || 0;
      const mk = monthKey(it.purchaseInvoice.date);
      const m = inputByMonth.get(mk) || { taxable: 0, gst: 0 };
      m.taxable += taxable; m.gst += it.gst || 0;
      inputByMonth.set(mk, m);
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const outputRows = [...outputByRate.entries()].sort((a, b) => a[0] - b[0]).map(([rate, r]) => ({
      rate, taxable: round2(r.taxable), cgst: round2(r.cgst), sgst: round2(r.sgst), igst: round2(r.igst),
      total: round2(r.cgst + r.sgst + r.igst),
    }));
    const outputTotals = {
      taxable: round2(outputRows.reduce((a, r) => a + r.taxable, 0)),
      cgst: round2(outputRows.reduce((a, r) => a + r.cgst, 0)),
      sgst: round2(outputRows.reduce((a, r) => a + r.sgst, 0)),
      igst: round2(outputRows.reduce((a, r) => a + r.igst, 0)),
    };
    const inputTotals = { taxable: round2(inputTaxable), gst: round2(inputGst) };
    const netGst = round2((outputTotals.cgst + outputTotals.sgst + outputTotals.igst) - inputTotals.gst);

    if (reportType === 'gst_summary') {
      return json({ output: { rows: outputRows, ...outputTotals }, input: inputTotals, netGstDifference: netGst });
    }

    // gst_monthly — union of months actually present in the range, chronological.
    const allMonths = new Set([...outputByMonth.keys(), ...inputByMonth.keys()]);
    const monthly = [...allMonths].sort().map(mk => {
      const [y, m] = mk.split('-');
      const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      const out = outputByMonth.get(mk) || { taxable: 0, gst: 0 };
      const inp = inputByMonth.get(mk) || { taxable: 0, gst: 0 };
      return {
        month: mk, label,
        outputTaxable: round2(out.taxable), outputGst: round2(out.gst),
        inputTaxable: round2(inp.taxable), inputGst: round2(inp.gst),
        netGst: round2(out.gst - inp.gst),
      };
    });
    return json({ rows: monthly });
  }

  if (reportType === 'non_gst') {
    const [saleItems, purchaseItems] = await Promise.all([
      prisma.saleItem.findMany({
        where: { sale: { shopId: shop.id, createdAt: { gte: startDate, lte: endDate } } },
        include: { sale: { include: { customer: { select: { name: true } } } }, product: { select: { name: true, hsnCode: true, gstPercent: true } } },
      }),
      prisma.purchaseItem.findMany({
        where: { purchaseInvoice: { shopId: shop.id, date: { gte: startDate, lte: endDate } } },
        include: { purchaseInvoice: { include: { supplier: { select: { name: true } } } }, product: { select: { name: true, hsnCode: true, gstPercent: true } } },
      }),
    ]);

    const salesRows = saleItems
      .filter((it): it is typeof it & { sale: NonNullable<typeof it.sale> } => it.sale !== null)
      .filter(it => classifySaleLine(it.sale.billType, it.product?.gstPercent, it.product?.hsnCode) === 'non_gst')
      .map(it => ({
        source: 'sale' as const,
        date: it.sale.createdAt,
        docNumber: it.sale.invoice_number,
        party: it.sale.customer?.name || '__walk_in__',
        product: it.product?.name || it.itemName || '__unknown_item__',
        hsn: it.product?.hsnCode || '',
        amount: (it.pricePerUnit || 0) * (it.quantity || 0),
        classification: 'non_gst',
      }));

    const purchaseRows = purchaseItems
      .filter(it => classifyPurchaseLine(it.gst, it.product?.gstPercent) === 'non_gst')
      .map(it => ({
        source: 'purchase' as const,
        date: it.purchaseInvoice.date,
        docNumber: it.purchaseInvoice.invoiceNumber,
        party: it.purchaseInvoice.supplier?.name || '__unknown_supplier__',
        product: it.product?.name || '__unknown_item__',
        hsn: it.product?.hsnCode || '',
        amount: (it.cost || 0) * (it.quantity || 0),
        classification: 'non_gst',
      }));

    const rows = [...salesRows, ...purchaseRows].sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());
    return json({ rows, summary: { count: rows.length, total: rows.reduce((a, r) => a + r.amount, 0) } });
  }

  if (reportType === 'data_quality') {
    const isWholesale = shop.subscriptionPlan === 'wholesale';
    const [gstProductsMissingHsn, hsnProductsMissingGst, gstSalesMissingRate, negativeStockProducts, emptyCategoryExpenses, purchasesMissingGst] = await Promise.all([
      prisma.product.findMany({
        where: { shopId: shop.id, gstPercent: { gt: 0 }, OR: [{ hsnCode: null }, { hsnCode: '' }] },
        select: { id: true, name: true }, take: 100,
      }),
      prisma.product.findMany({
        where: { shopId: shop.id, AND: [{ hsnCode: { not: null } }, { hsnCode: { not: '' } }], gstPercent: null },
        select: { id: true, name: true }, take: 100,
      }),
      prisma.saleItem.findMany({
        where: { sale: { shopId: shop.id, createdAt: { gte: startDate, lte: endDate }, billType: 'gst' }, product: { gstPercent: null } },
        include: { sale: { select: { invoice_number: true, id: true } }, product: { select: { name: true } } },
        take: 100,
      }),
      prisma.product.findMany({
        where: { shopId: shop.id, currentStock: { lt: 0 } },
        select: { id: true, name: true, currentStock: true }, take: 100,
      }),
      // Expense.category is a required (non-nullable) column — "missing"
      // here can only mean an empty string, never a real null equals filter.
      prisma.expense.findMany({
        where: { shopId: shop.id, createdAt: { gte: startDate, lte: endDate }, category: '' },
        select: { id: true, description: true, amount: true }, take: 100,
      }),
      isWholesale
        ? prisma.purchaseItem.findMany({
            where: { purchaseInvoice: { shopId: shop.id, date: { gte: startDate, lte: endDate } }, gst: null },
            include: { purchaseInvoice: { select: { id: true, invoiceNumber: true } }, product: { select: { name: true } } },
            take: 100,
          })
        : Promise.resolve([]),
    ]);

    const warnings = [
      ...gstProductsMissingHsn.map(p => ({ type: 'product_missing_hsn', params: { name: p.name }, link: `/products?id=${p.id}` })),
      ...hsnProductsMissingGst.map(p => ({ type: 'product_missing_gst_rate', params: { name: p.name }, link: `/products?id=${p.id}` })),
      ...gstSalesMissingRate.filter(si => si.sale !== null).map(si => ({ type: 'gst_sale_missing_rate', params: { invoice: si.sale!.invoice_number, name: si.product?.name || '' }, link: `/billing/invoices?id=${si.sale!.id}` })),
      ...negativeStockProducts.map(p => ({ type: 'negative_stock', params: { name: p.name, stock: p.currentStock }, link: `/products?id=${p.id}` })),
      ...emptyCategoryExpenses.map(e => ({ type: 'expense_missing_category', params: { description: e.description || e.id, amount: e.amount }, link: `/expenses?id=${e.id}` })),
      ...purchasesMissingGst.map((pi: any) => ({ type: 'purchase_missing_gst', params: { invoice: pi.purchaseInvoice.invoiceNumber || pi.purchaseInvoice.id, name: pi.product?.name || '' }, link: `/purchases?id=${pi.purchaseInvoice.id}` })),
    ];

    return json({ warnings, summary: { count: warnings.length } });
  }

  if (reportType === 'profit_loss') {
    // Same aggregate queries handleFinancials()'s existing 'pnl' branch
    // already runs (Sale.totalProfit is the reliable, already-computed
    // per-sale gross-profit figure — reused rather than re-derived here),
    // plus the expense category breakdown so the CA sees WHERE the
    // indirect expenses went, matching the classic P&L layout requested.
    const [salesAgg, expensesAgg, expenseByCategory, salariesAgg] = await Promise.all([
      prisma.sale.aggregate({
        where: { shopId: shop.id, createdAt: { gte: startDate, lte: endDate } },
        _sum: { totalAmount: true, totalProfit: true },
      }),
      prisma.expense.aggregate({
        where: { shopId: shop.id, createdAt: { gte: startDate, lte: endDate } },
        _sum: { amount: true },
      }),
      prisma.expense.groupBy({
        by: ['category'],
        where: { shopId: shop.id, createdAt: { gte: startDate, lte: endDate } },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
      }),
      prisma.salaryPayment.aggregate({
        where: { staff: { shopId: shop.id }, paidAt: { gte: startDate, lte: endDate } },
        _sum: { netAmount: true },
      }),
    ]);

    const revenue = salesAgg._sum.totalAmount || 0;
    const grossProfit = salesAgg._sum.totalProfit || 0;
    const totalExpenses = expensesAgg._sum.amount || 0;
    const totalSalaries = salariesAgg._sum.netAmount || 0;
    const netProfit = grossProfit - totalExpenses - totalSalaries;

    const expenseRows = expenseByCategory.map((r) => ({ category: r.category, amount: r._sum.amount || 0 }));
    if (totalSalaries > 0) expenseRows.push({ category: '__salary_payroll__', amount: totalSalaries });

    return json({
      revenue,
      grossProfit,
      grossMargin: revenue > 0 ? round2((grossProfit / revenue) * 100) : 0,
      expenses: expenseRows,
      totalExpenses: totalExpenses + totalSalaries,
      netProfit,
      netMargin: revenue > 0 ? round2((netProfit / revenue) * 100) : 0,
    });
  }

  if (reportType === 'trading_account') {
    const movements = await computeProductMovements(shop.id, startDate, endDate);
    const products = await prisma.product.findMany({
      where: { shopId: shop.id },
      select: { id: true, name: true, currentStock: true, costPrice: true },
    });

    // COGS only balances (Opening + Purchases − Returns − Closing) when
    // every term is on the SAME valuation basis. Purchases is necessarily a
    // COST figure (what was paid), so Opening/Closing stock must be valued
    // at cost too — Product.costPrice, NOT sellingPrice (that earlier
    // version produced a wildly wrong, sometimes negative, COGS by mixing
    // bases — see schema comment on Product.wholesaleCost for the same
    // cost-vs-selling-price trap this app already warns about elsewhere).
    // A product with no recorded costPrice can't be valued at cost at all —
    // it's excluded and counted rather than silently valued at 0 or guessed.
    let openingStockValue = 0;
    let closingStockValue = 0;
    let uncostedCount = 0;
    for (const p of products) {
      const closingQty = p.currentStock || 0;
      if (closingQty === 0 && !p.costPrice) continue; // nothing to value either way
      if (p.costPrice == null) { if (closingQty !== 0) uncostedCount++; continue; }
      const cost = p.costPrice;
      const m = movements.byProduct.get(p.id);
      const openingQty = closingQty - (m?.purchaseQty || 0) + (m?.purchaseReturnQty || 0) + (m?.saleQty || 0) - (m?.saleReturnQty || 0);
      openingStockValue += openingQty * cost;
      closingStockValue += closingQty * cost;
    }

    const [purchasesAgg, purchaseReturnsAgg, salesAgg, salesReturnAgg] = await Promise.all([
      prisma.purchaseItem.aggregate({
        where: { purchaseInvoice: { shopId: shop.id, date: { gte: startDate, lte: endDate } } },
        _sum: { cost: true }, // per-unit; need quantity*cost so computed below instead
      }),
      prisma.purchaseReturn.aggregate({
        where: { shopId: shop.id, date: { gte: startDate, lte: endDate } },
        _sum: { totalAmount: true },
      }),
      prisma.sale.aggregate({
        where: { shopId: shop.id, createdAt: { gte: startDate, lte: endDate } },
        _sum: { totalAmount: true },
      }),
      prisma.returnItem.aggregate({
        where: { materialReturn: { shopId: shop.id, date: { gte: startDate, lte: endDate } } },
        _sum: { refundAmount: true },
      }),
    ]);
    // purchaseItem.aggregate can't sum quantity*cost directly — pull rows and reduce.
    const purchaseLines = await prisma.purchaseItem.findMany({
      where: { purchaseInvoice: { shopId: shop.id, date: { gte: startDate, lte: endDate } } },
      select: { quantity: true, cost: true },
    });
    const totalPurchases = purchaseLines.reduce((s, l) => s + (l.quantity || 0) * (l.cost || 0), 0);
    const purchaseReturns = purchaseReturnsAgg._sum.totalAmount || 0;
    const grossSales = salesAgg._sum.totalAmount || 0;
    const salesReturns = salesReturnAgg._sum.refundAmount || 0;

    const netSales = grossSales - salesReturns;
    const cogs = openingStockValue + totalPurchases - purchaseReturns - closingStockValue;
    const grossProfit = netSales - cogs;

    return json({
      openingStock: round2(openingStockValue),
      purchases: round2(totalPurchases),
      purchaseReturns: round2(purchaseReturns),
      closingStock: round2(closingStockValue),
      cogs: round2(cogs),
      grossSales: round2(grossSales),
      salesReturns: round2(salesReturns),
      netSales: round2(netSales),
      grossProfitOrLoss: round2(grossProfit),
      manualAdjustments: { count: movements.adjustmentCount, quantityTotal: movements.adjustmentQtyTotal },
      uncostedProducts: uncostedCount,
    });
  }

  if (reportType === 'stock_summary') {
    const movements = await computeProductMovements(shop.id, startDate, endDate);
    const products = await prisma.product.findMany({
      where: { shopId: shop.id },
      select: { id: true, name: true, category: true, currentStock: true, sellingPrice: true, size_variants: true, variants: true },
    });

    const rows = products.map((p) => {
      const m = movements.byProduct.get(p.id);
      const closingQty = p.currentStock || 0;
      const openingQty = closingQty - (m?.purchaseQty || 0) + (m?.purchaseReturnQty || 0) + (m?.saleQty || 0) - (m?.saleReturnQty || 0);
      return {
        productId: p.id,
        product: p.name,
        category: p.category || '',
        openingQty: round2(openingQty),
        purchasedQty: m?.purchaseQty || 0,
        soldQty: m?.saleQty || 0,
        purchaseReturnQty: m?.purchaseReturnQty || 0,
        salesReturnQty: m?.saleReturnQty || 0,
        closingQty: round2(closingQty),
        closingValue: round2(closingQty * (p.sellingPrice || 0)),
      };
    });

    return json({
      rows,
      summary: {
        totalClosingValue: round2(rows.reduce((s, r) => s + r.closingValue, 0)),
        manualAdjustments: movements.adjustmentCount,
      },
    });
  }

  if (reportType === 'receivables_ageing' || reportType === 'payables_ageing') {
    const isReceivable = reportType === 'receivables_ageing';
    // Deliberately NOT filtered by the selected FY/date range — an Ageing
    // report is a snapshot of every bill still open TODAY (exactly what
    // suppliers/pending-bills and crm/pending-bills already show on the
    // Supplier/Party pages), not "bills raised during this period". A bill
    // from before the FY started that's still unpaid is still real
    // exposure and must not silently disappear because of the FY picker.
    const bills = isReceivable
      ? await replayCustomerBills(shop.id, null)
      : await replaySupplierBills(shop.id);

    const now = Date.now();
    const bucketOf = (date: Date | null) => {
      if (!date) return '0-30';
      const days = Math.floor((now - new Date(date).getTime()) / 86400000);
      if (days <= 30) return '0-30';
      if (days <= 60) return '31-60';
      if (days <= 90) return '61-90';
      if (days <= 180) return '91-180';
      return '180+';
    };

    const rows = bills.map((b) => ({ ...b, ageBucket: bucketOf(b.date) }));
    const buckets = ['0-30', '31-60', '61-90', '91-180', '180+'];
    const bucketSummary = buckets.map((key) => ({
      bucket: key,
      amount: round2(rows.filter((r) => r.ageBucket === key).reduce((s, r) => s + r.remaining, 0)),
      count: rows.filter((r) => r.ageBucket === key).length,
    }));

    return json({ rows, bucketSummary, summary: { total: round2(rows.reduce((s, r) => s + r.remaining, 0)), count: rows.length } });
  }

  if (reportType === 'cash_bank_summary') {
    // CashBook only ever gets a row for CASH movements (see billing/route.ts —
    // the create is gated on paymentMode === 'cash'); it is not a bank
    // ledger. There is no bank-account/reconciliation model anywhere in this
    // schema, so "Bank" here can only mean "collected via a non-cash payment
    // mode", read from Sale.paymentType — same groupBy handleSales() already
    // uses for its 'by_payment' report, reused here rather than re-derived.
    const [cashEntries, paymentModeRows] = await Promise.all([
      // Matches the existing 'daybook' report's own date field choice
      // (createdAt, not the separate `date` column) so the two never disagree.
      prisma.cashBook.findMany({
        where: { shopId: shop.id, createdAt: { gte: startDate, lte: endDate } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.sale.groupBy({
        by: ['paymentType'],
        where: { shopId: shop.id, createdAt: { gte: startDate, lte: endDate } },
        _sum: { totalAmount: true, amountPaid: true },
        _count: { id: true },
      }),
    ]);

    // 'collection' = a customer's udhar/due payment collected in cash (see
    // lib/server/customerPayment.ts) — cash flowing IN, not out. 'refund'
    // (a customer refund paid out in cash — billing/returns/route.ts) is
    // correctly left out of this set so it falls through to "Out" below.
    const inTypes = new Set(['sale', 'collection', 'opening_balance', 'deposit']);
    const cashByType = new Map<string, number>();
    for (const e of cashEntries) cashByType.set(e.type, (cashByType.get(e.type) || 0) + e.amount);
    const cashRows = [...cashByType.entries()].map(([type, amount]) => ({ type, direction: inTypes.has(type) ? 'In' : 'Out', amount: round2(amount) }));
    const cashIn = round2(cashRows.filter((r) => r.direction === 'In').reduce((s, r) => s + r.amount, 0));
    const cashOut = round2(cashRows.filter((r) => r.direction === 'Out').reduce((s, r) => s + r.amount, 0));

    const paymentModeSummary = paymentModeRows.map((r) => ({
      mode: r.paymentType || '__unknown__',
      revenue: round2(r._sum.totalAmount || 0),
      collected: round2(r._sum.amountPaid || 0),
      count: r._count.id,
    }));

    return json({
      cashRows,
      cashIn,
      cashOut,
      netCashFlow: round2(cashIn - cashOut),
      paymentModeSummary,
    });
  }

  if (reportType === 'mill_raw_material' || reportType === 'mill_production' || reportType === 'mill_byproducts') {
    // Gated on the Bada Udyog package rather than the single businessType
    // literal 'millprocessing' — several legacy business types (ricemill,
    // flourmill, oilmill, foodprocessing, smallmanufacturing) are also
    // Bada Udyog mills but don't carry that exact businessType string; see
    // lib/businessConfig.ts's defaultPackage per type and
    // components/reports/CAReportPackModal.tsx's matching client-side gate.
    if (shop.packageType !== 'badaudyog') {
      return json({ error: 'Mill reports require the Bada Udyog package.' }, 403);
    }

    if (reportType === 'mill_raw_material') {
      const lots = await prisma.rawMaterialLot.findMany({
        where: { shopId: shop.id, purchaseDate: { gte: startDate, lte: endDate } },
        include: { supplier: { select: { name: true } } },
        orderBy: { purchaseDate: 'asc' },
      });
      const rows = lots.map((l) => ({
        lotNumber: l.lotNumber || '',
        farmerName: l.farmerName || l.supplier?.name || '',
        purchaseDate: l.purchaseDate,
        weightKg: l.weightKg || 0,
        moisturePct: l.moisturePct,
        ratePerKg: l.ratePerKg || 0,
        totalAmount: l.totalAmount || 0,
        remainingKg: l.remainingKg ?? l.weightKg ?? 0,
      }));
      return json({
        rows,
        summary: {
          totalWeightKg: round2(rows.reduce((s, r) => s + r.weightKg, 0)),
          totalAmount: round2(rows.reduce((s, r) => s + r.totalAmount, 0)),
          remainingKg: round2(rows.reduce((s, r) => s + r.remainingKg, 0)),
        },
      });
    }

    if (reportType === 'mill_production') {
      const batches = await prisma.productionBatch.findMany({
        where: { shopId: shop.id, startedAt: { gte: startDate, lte: endDate } },
        orderBy: { startedAt: 'asc' },
      });
      const rows = batches.map((b) => ({
        batchNumber: b.batchNumber,
        startedAt: b.startedAt,
        status: b.status,
        currentStage: b.currentStage,
        inputKg: b.inputKg || 0,
        outputKg: b.outputKg || 0,
        wastageKg: b.wastageKg || 0,
        brokenKg: b.brokenKg || 0,
        branKg: b.branKg || 0,
        huskKg: b.huskKg || 0,
        recoveryPct: b.recoveryPct,
      }));
      const totalInput = rows.reduce((s, r) => s + r.inputKg, 0);
      const totalOutput = rows.reduce((s, r) => s + r.outputKg, 0);
      return json({
        rows,
        summary: {
          batchCount: rows.length,
          totalInputKg: round2(totalInput),
          totalOutputKg: round2(totalOutput),
          avgRecoveryPct: totalInput > 0 ? round2((totalOutput / totalInput) * 100) : 0,
        },
      });
    }

    // mill_byproducts
    const byProducts = await prisma.byProduct.findMany({
      where: { shopId: shop.id, createdAt: { gte: startDate, lte: endDate } },
      orderBy: { createdAt: 'asc' },
    });
    const rows = byProducts.map((b) => ({
      name: b.name,
      quantityKg: b.quantityKg || 0,
      soldKg: b.soldKg || 0,
      remainingKg: round2((b.quantityKg || 0) - (b.soldKg || 0)),
      ratePerKg: b.ratePerKg || 0,
      soldValue: round2((b.soldKg || 0) * (b.ratePerKg || 0)),
    }));
    return json({
      rows,
      summary: {
        totalQuantityKg: round2(rows.reduce((s, r) => s + r.quantityKg, 0)),
        totalSoldValue: round2(rows.reduce((s, r) => s + r.soldValue, 0)),
      },
    });
  }

  return json({ error: 'Unknown report_type' }, 400);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Per-product quantity movement from unambiguous-sign sources only (see
 *  lib/server/ledgerClassification.ts's header for why 'adjustment'-type
 *  StockMovement rows can't be signed and netted here — their count/total
 *  magnitude is surfaced separately so the caller can flag, never guess). */
async function computeProductMovements(shopId: string, startDate: Date, endDate: Date) {
  const [purchases, purchaseReturns, sales, saleReturns, adjustments] = await Promise.all([
    prisma.purchaseItem.groupBy({
      by: ['productId'],
      where: { purchaseInvoice: { shopId, date: { gte: startDate, lte: endDate } } },
      _sum: { quantity: true },
    }),
    prisma.purchaseReturnItem.groupBy({
      by: ['productId'],
      where: { purchaseReturn: { shopId, date: { gte: startDate, lte: endDate } } },
      _sum: { quantity: true },
    }),
    prisma.saleItem.groupBy({
      by: ['productId'],
      where: { productId: { not: null }, sale: { shopId, createdAt: { gte: startDate, lte: endDate } } },
      _sum: { quantity: true },
    }),
    prisma.returnItem.groupBy({
      by: ['productId'],
      where: { stockRestored: true, materialReturn: { shopId, date: { gte: startDate, lte: endDate } } },
      _sum: { quantity: true },
    }),
    prisma.stockMovement.aggregate({
      where: { shopId, type: 'adjustment', createdAt: { gte: startDate, lte: endDate } },
      _sum: { quantity: true },
      _count: { id: true },
    }),
  ]);

  const byProduct = new Map<string, { purchaseQty: number; purchaseReturnQty: number; saleQty: number; saleReturnQty: number }>();
  const ensure = (id: string) => {
    if (!byProduct.has(id)) byProduct.set(id, { purchaseQty: 0, purchaseReturnQty: 0, saleQty: 0, saleReturnQty: 0 });
    return byProduct.get(id)!;
  };
  for (const r of purchases) if (r.productId) ensure(r.productId).purchaseQty = r._sum.quantity || 0;
  for (const r of purchaseReturns) if (r.productId) ensure(r.productId).purchaseReturnQty = r._sum.quantity || 0;
  for (const r of sales) if (r.productId) ensure(r.productId).saleQty = r._sum.quantity || 0;
  for (const r of saleReturns) if (r.productId) ensure(r.productId).saleReturnQty = r._sum.quantity || 0;

  return {
    byProduct,
    adjustmentCount: adjustments._count.id,
    adjustmentQtyTotal: adjustments._sum.quantity || 0,
  };
}

/** Same FIFO-replay-oldest-purchase-first logic as
 *  app/api/v1/suppliers/pending-bills/route.ts — kept as its own copy here
 *  (matching that file's own precedent of duplicating this same logic
 *  rather than sharing it, see its header comment) so the Ageing report
 *  can never disagree with what the Supplier detail pages already show. */
async function replaySupplierBills(shopId: string) {
  const suppliers = await prisma.supplier.findMany({ where: { shopId }, select: { id: true, name: true } });
  if (!suppliers.length) return [] as { id: string; party: string; billNumber: string; date: Date | null; originalAmount: number; remaining: number }[];
  const supplierIds = suppliers.map((s) => s.id);
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));
  const allTxns = await prisma.supplierTransaction.findMany({
    where: { supplierId: { in: supplierIds } },
    orderBy: [{ createdAt: 'asc' }, { sequence: 'asc' }],
  });
  const bySupplier = new Map<string, typeof allTxns>();
  for (const t of allTxns) {
    if (!t.supplierId) continue;
    if (!bySupplier.has(t.supplierId)) bySupplier.set(t.supplierId, []);
    bySupplier.get(t.supplierId)!.push(t);
  }
  const bills: { id: string; party: string; billNumber: string; date: Date | null; originalAmount: number; remaining: number }[] = [];
  for (const [supplierId, txns] of bySupplier) {
    const open: { id: string; billNumber: string; date: Date | null; originalAmount: number; remaining: number }[] = [];
    for (const t of txns) {
      const amount = Number(t.amount) || 0;
      if (isSupplierCredit(t.type)) {
        let toApply = amount;
        for (const p of open) { if (toApply <= 0) break; const take = Math.min(p.remaining, toApply); p.remaining -= take; toApply -= take; }
        while (open.length && open[0].remaining <= 1e-6) open.shift();
      } else if (amount > 1e-6) {
        open.push({ id: t.id, billNumber: t.billNumber || '', date: t.createdAt, originalAmount: amount, remaining: amount });
      }
    }
    for (const p of open) if (p.remaining > 1e-6) bills.push({ ...p, party: supplierById.get(supplierId)?.name || '' });
  }
  return bills;
}

/** Same FIFO replay as app/api/v1/crm/pending-bills/route.ts — see that
 *  file's header for why payment allocation has to be replayed rather than
 *  read from stored data. `entityTypeFilter` is unused (kept for a possible
 *  future party/customer split) — Phase 2's Ageing report covers both pools
 *  together, matching how Total Outstanding already reads shop-wide. */
async function replayCustomerBills(shopId: string, _entityTypeFilter: string | null) {
  const entities = await prisma.customer.findMany({ where: { shopId }, select: { id: true, name: true } });
  if (!entities.length) return [] as { id: string; party: string; billNumber: string; date: Date | null; originalAmount: number; remaining: number }[];
  const entityIds = entities.map((e) => e.id);
  const entityById = new Map(entities.map((e) => [e.id, e]));
  const allTxns = await prisma.customer_transactions.findMany({
    where: { customer_id: { in: entityIds } },
    orderBy: [{ created_at: 'asc' }],
  });
  const byEntity = new Map<string, typeof allTxns>();
  for (const t of allTxns) {
    if (!t.customer_id) continue;
    if (!byEntity.has(t.customer_id)) byEntity.set(t.customer_id, []);
    byEntity.get(t.customer_id)!.push(t);
  }
  const bills: { id: string; party: string; billNumber: string; date: Date | null; originalAmount: number; remaining: number }[] = [];
  for (const [entityId, txns] of byEntity) {
    const open: { id: string; billNumber: string; date: Date | null; originalAmount: number; remaining: number }[] = [];
    for (const t of txns) {
      const amount = Number(t.amount) || 0;
      if (isCustomerCredit(t.type)) {
        let toApply = amount;
        for (const b of open) { if (toApply <= 0) break; const take = Math.min(b.remaining, toApply); b.remaining -= take; toApply -= take; }
        while (open.length && open[0].remaining <= 1e-6) open.shift();
      } else if (amount > 1e-6) {
        open.push({ id: t.id, billNumber: t.bill_number || '', date: t.created_at, originalAmount: amount, remaining: amount });
      }
    }
    for (const b of open) if (b.remaining > 1e-6) bills.push({ ...b, party: entityById.get(entityId)?.name || '' });
  }
  return bills;
}
