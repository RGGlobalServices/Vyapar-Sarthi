import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, query } from '@/lib/server/http';
import { getDateRange, formatDate, startOfDay, endOfDay } from '@/lib/server/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const q = query(req);
  const { startDate, endDate } = getDateRange(q);
  const module = q.module || 'sales'; // sales | purchases | stock | crm | financials | expenses | staff

  switch (module) {
    case 'sales':
      return handleSales(shop, startDate, endDate, q);
    case 'purchases':
      return handlePurchases(shop, startDate, endDate, q);
    case 'stock':
      return handleStock(shop, startDate, endDate, q);
    case 'financials':
      return handleFinancials(shop, startDate, endDate, q);
    case 'expenses':
      return handleExpenses(shop, startDate, endDate, q);
    case 'staff':
      return handleStaff(shop, startDate, endDate, q);
    case 'crm':
      return handleCRM(shop, startDate, endDate, q);
    default:
      return json({ error: 'Unknown module' }, 400);
  }
});

// ─── SALES ──────────────────────────────────────────────────────────────────
async function handleSales(shop: any, startDate: Date, endDate: Date, q: Record<string, string>) {
  const reportType = q.report_type || 'trend'; // trend | by_product | by_category | by_customer | by_payment | gst

  if (reportType === 'trend') {
    const groupBy = q.group_by || 'day'; // day | week | month

    const sales = await prisma.sale.findMany({
      where: { shopId: shop.id, createdAt: { gte: startDate, lte: endDate } },
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
      SELECT p.id, p.name, p.category, p.brand,
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
      GROUP BY p.id, p.name, p.category, p.brand
      ORDER BY revenue DESC
      LIMIT 100
    `;
    return json({ rows: rows.map(r => ({ ...r, revenue: Number(r.revenue), profit: Number(r.profit), qty: Number(r.qty) })) });
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
    const rows = await prisma.$queryRaw<any[]>`
      SELECT COALESCE(p.gst_percent, 0)::float as gst_rate,
        SUM(si.price_per_unit * si.quantity)::float as taxable_value,
        SUM(si.price_per_unit * si.quantity * COALESCE(p.gst_percent, 0) / 100)::float as gst_amount,
        SUM(si.quantity)::float as qty
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN products p ON si.product_id = p.id
      WHERE s.shop_id = ${shop.id}::uuid
        AND s.created_at >= ${startDate}
        AND s.created_at <= ${endDate}
      GROUP BY gst_rate
      ORDER BY gst_rate
    `;
    return json({ rows: rows.map(r => ({ ...r, gst_rate: Number(r.gst_rate), taxable_value: Number(r.taxable_value), gst_amount: Number(r.gst_amount) })) });
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
async function handleStock(shop: any, startDate: Date, endDate: Date, q: Record<string, string>) {
  const reportType = q.report_type || 'current';

  if (reportType === 'current') {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, name, category, brand, current_stock, min_stock, selling_price,
        (current_stock * selling_price)::float as stock_value,
        CASE WHEN min_stock > 0 AND current_stock <= min_stock THEN 'low'
             WHEN current_stock = 0 THEN 'out'
             ELSE 'ok' END as status
      FROM products
      WHERE shop_id = ${shop.id}::uuid
      ORDER BY current_stock ASC
    `;
    const totalValue = rows.reduce((a, r) => a + Number(r.stock_value || 0), 0);
    const lowCount = rows.filter(r => r.status === 'low').length;
    const outCount = rows.filter(r => r.status === 'out').length;
    return json({
      rows: rows.map(r => ({ ...r, current_stock: Number(r.current_stock), stock_value: Number(r.stock_value || 0) })),
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

    const inflow = entries.filter(e => ['sale', 'payment_in', 'opening_balance', 'deposit'].includes(e.type));
    const outflow = entries.filter(e => ['purchase', 'expense', 'salary', 'advance', 'withdrawal', 'payment_out'].includes(e.type));

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
    const presentCount = rows.filter(r => r.status === 'Present').length;
    const absentCount = rows.filter(r => r.status === 'Absent').length;
    return json({ rows, summary: { present: presentCount, absent: absentCount, halfDay: rows.filter(r => r.status === 'Half').length } });
  }

  return json({ error: 'Unknown report_type' }, 400);
}

// ─── CRM ──────────────────────────────────────────────────────────────────────
async function handleCRM(shop: any, startDate: Date, endDate: Date, q: Record<string, string>) {
  const reportType = q.report_type || 'outstanding';
  const entityType = q.entity_type || 'customer'; // customer | supplier

  if (reportType === 'outstanding') {
    if (entityType === 'customer') {
      const rows = await prisma.customer.findMany({
        where: { shopId: shop.id, totalDue: { gt: 0 } },
        select: { id: true, name: true, mobile: true, totalDue: true, creditLimit: true },
        orderBy: { totalDue: 'desc' }
      });
      const total = rows.reduce((a, r) => a + (r.totalDue || 0), 0);
      return json({ rows, summary: { total, count: rows.length } });
    } else {
      const rows = await prisma.supplier.findMany({
        where: { shopId: shop.id, balance: { gt: 0 } },
        select: { id: true, name: true, mobile: true, balance: true },
        orderBy: { balance: 'desc' }
      });
      const total = rows.reduce((a, r) => a + (r.balance || 0), 0);
      return json({ rows, summary: { total, count: rows.length } });
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
