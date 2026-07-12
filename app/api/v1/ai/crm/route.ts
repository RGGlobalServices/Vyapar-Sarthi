import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * AI CRM Intelligence — read-only, returns structured analysis.
 * Identifies inactive customers, credit risk, overdue parties, top customers.
 * Never writes data.
 */
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const shopId = shop.id;

  const since30 = new Date();
  since30.setDate(since30.getDate() - 30);
  const since90 = new Date();
  since90.setDate(since90.getDate() - 90);

  // --- Fetch CRM data in parallel ---
  const [customers, recentBuyerIds, topCustomerStats, partyData] = await Promise.all([
    // All customers with outstanding
    prisma.customer.findMany({
      where: { shopId },
      select: { id: true, name: true, mobile: true, totalDue: true, creditLimit: true },
      orderBy: { totalDue: 'desc' },
      take: 200,
    }),

    // Customers who bought in last 30 days
    prisma.sale.findMany({
      where: { shopId, createdAt: { gte: since30 }, customerId: { not: null } },
      select: { customerId: true },
      distinct: ['customerId'],
    }),

    // Top customers by revenue in last 90 days
    prisma.$queryRaw<{ customer_id: string; name: string; mobile: string; total_spent: number; bill_count: number }[]>`
      SELECT c.id as customer_id, c.name, c.mobile,
        SUM(s.total_amount)::float as total_spent,
        COUNT(s.id)::int as bill_count
      FROM sales s
      JOIN customers c ON s.customer_id = c.id
      WHERE s.shop_id = ${shopId}::uuid
        AND s.created_at >= ${since90}
        AND c.id IS NOT NULL
      GROUP BY c.id, c.name, c.mobile
      ORDER BY total_spent DESC
      LIMIT 10
    `,

    // Supplier/party outstanding (wholesale)
    shop.subscriptionPlan === 'wholesale'
      ? prisma.supplier.findMany({
          where: { shopId, balance: { gt: 0 } },
          select: { id: true, name: true, mobile: true, balance: true },
          orderBy: { balance: 'desc' },
          take: 20,
        })
      : Promise.resolve([]),
  ]);

  const recentBuyerSet = new Set(recentBuyerIds.map((r) => r.customerId).filter(Boolean));

  // --- Analysis segments ---

  // Inactive customers: have outstanding but no purchase in 30d
  const inactiveCustomers = customers
    .filter((c) => !recentBuyerSet.has(c.id))
    .slice(0, 15)
    .map((c) => ({
      id: c.id,
      name: c.name,
      mobile: c.mobile,
      outstanding: c.totalDue || 0,
      riskLevel: (c.totalDue || 0) > 5000 ? 'high' : (c.totalDue || 0) > 1000 ? 'medium' : 'low',
    }));

  // Outstanding customers: sorted by amount due
  const outstandingCustomers = customers
    .filter((c) => (c.totalDue || 0) > 0)
    .slice(0, 20)
    .map((c) => ({
      id: c.id,
      name: c.name,
      mobile: c.mobile,
      outstanding: c.totalDue || 0,
      creditLimit: c.creditLimit || 0,
      utilization: c.creditLimit ? Math.round(((c.totalDue || 0) / c.creditLimit) * 100) : null,
    }));

  // Credit risk: customers above 80% of credit limit
  const creditRisk = customers
    .filter((c) => c.creditLimit && c.creditLimit > 0 && (c.totalDue || 0) / c.creditLimit >= 0.8)
    .map((c) => ({
      id: c.id,
      name: c.name,
      mobile: c.mobile,
      outstanding: c.totalDue || 0,
      creditLimit: c.creditLimit || 0,
      utilization: Math.round(((c.totalDue || 0) / (c.creditLimit || 1)) * 100),
    }));

  // Top customers
  const topCustomers = topCustomerStats.map((r) => ({
    id: r.customer_id,
    name: r.name,
    mobile: r.mobile,
    totalSpent: Math.round(Number(r.total_spent || 0)),
    billCount: Number(r.bill_count || 0),
  }));

  // Summary stats
  const totalOutstanding = customers.reduce((a, c) => a + (c.totalDue || 0), 0);
  const crmHealthScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100 -
          (inactiveCustomers.length / Math.max(customers.length, 1)) * 30 -
          (creditRisk.length / Math.max(customers.length, 1)) * 40
      )
    )
  );

  return json({
    summary: {
      totalCustomers: customers.length,
      totalOutstanding,
      inactiveCount: inactiveCustomers.length,
      creditRiskCount: creditRisk.length,
      crmHealthScore,
    },
    inactiveCustomers,
    outstandingCustomers,
    creditRisk,
    topCustomers,
    supplierOutstanding: (partyData as any[]).map((s) => ({
      id: s.id,
      name: s.name,
      mobile: s.mobile,
      balance: s.balance,
    })),
  });
});
