import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, query } from '@/lib/server/http';
import { getDateRange } from '@/lib/server/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const q = query(req);
  const limit = parseInt(q.limit) || 10;
  const { startDate, endDate } = getDateRange(q);

  const res = await prisma.$queryRaw<any[]>`
    SELECT 
      c.id, 
      COALESCE(c.name, 'Unknown Customer') as name, 
      c.mobile,
      SUM(s.total_amount) as total_revenue,
      COUNT(s.id) as total_invoices
    FROM sales s
    JOIN customers c ON s.customer_id = c.id
    WHERE s.shop_id = ${shop.id}::uuid 
      AND s.created_at >= ${startDate}::timestamptz 
      AND s.created_at <= ${endDate}::timestamptz
    GROUP BY c.id, c.name, c.mobile
    ORDER BY total_revenue DESC
    LIMIT ${limit}
  `;

  const items = res.map(r => ({
    id: r.id,
    name: r.name,
    mobile: r.mobile,
    value: Number(r.total_revenue || 0),
    total_invoices: Number(r.total_invoices || 0)
  }));

  const total = items.reduce((sum, i) => sum + i.value, 0);

  return json({ items, total, currency: 'INR' });
});
