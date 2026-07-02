import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, query } from '@/lib/server/http';
import { getDateRange } from '@/lib/server/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Entry = { name: string; value: number };

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const q = query(req);
  const groupBy = q.group_by || 'revenue';
  const limit = parseInt(q.limit) || 10;
  const { startDate, endDate } = getDateRange(q);
  let items: Entry[] = [];
  let total = 0;

  if (groupBy === 'revenue') {
    const res = await prisma.$queryRaw<any[]>`
      SELECT p.id, COALESCE(p.name, 'Other Sales') as name, COALESCE(p.category, 'Other') as category, SUM(si.price_per_unit * si.quantity) as value, SUM(si.quantity) as qty
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      LEFT JOIN products p ON si.product_id = p.id
      WHERE s.shop_id = ${shop.id}::uuid AND s.created_at >= ${startDate}::timestamptz AND s.created_at <= ${endDate}::timestamptz
      GROUP BY p.id, p.name, p.category
      ORDER BY value DESC
    `;
    items = res.map(r => ({ id: r.id, name: r.name, category: r.category, value: Number(r.value || 0), qty: Number(r.qty || 0) })).slice(0, limit);
    total = res.reduce((sum, r) => sum + Number(r.value || 0), 0);
  } else if (groupBy === 'quantity') {
    const res = await prisma.$queryRaw<any[]>`
      SELECT p.id, COALESCE(p.name, 'Other Sales') as name, COALESCE(p.category, 'Other') as category, SUM(si.quantity) as value, SUM(si.quantity) as qty
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      LEFT JOIN products p ON si.product_id = p.id
      WHERE s.shop_id = ${shop.id}::uuid AND s.created_at >= ${startDate}::timestamptz AND s.created_at <= ${endDate}::timestamptz
      GROUP BY p.id, p.name, p.category
      ORDER BY value DESC
    `;
    items = res.map(r => ({ id: r.id, name: r.name, category: r.category, value: Number(r.value || 0), qty: Number(r.qty || 0) })).slice(0, limit);
    total = res.reduce((sum, r) => sum + Number(r.value || 0), 0);
  } else if (groupBy === 'category') {
    const res = await prisma.$queryRaw<any[]>`
      SELECT COALESCE(p.category, 'Other') as name, SUM(si.price_per_unit * si.quantity) as value
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      LEFT JOIN products p ON si.product_id = p.id
      WHERE s.shop_id = ${shop.id}::uuid AND s.created_at >= ${startDate}::timestamptz AND s.created_at <= ${endDate}::timestamptz
      GROUP BY p.category
      ORDER BY value DESC
    `;
    items = res.map(r => ({ name: r.name, value: Number(r.value || 0) })).slice(0, limit);
    total = res.reduce((sum, r) => sum + Number(r.value || 0), 0);
  } else if (groupBy === 'udhar') {
    const res = await prisma.$queryRaw<any[]>`
      SELECT p.id, COALESCE(p.name, 'Other Sales') as name, COALESCE(p.category, 'Other') as category, SUM(si.price_per_unit * si.quantity) as value, SUM(si.quantity) as qty
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      LEFT JOIN products p ON si.product_id = p.id
      WHERE s.shop_id = ${shop.id}::uuid AND s.created_at >= ${startDate}::timestamptz AND s.created_at <= ${endDate}::timestamptz AND s.payment_type = 'UDHAR'
      GROUP BY p.id, p.name, p.category
      ORDER BY value DESC
    `;
    items = res.map(r => ({ id: r.id, name: r.name, category: r.category, value: Number(r.value || 0), qty: Number(r.qty || 0) })).slice(0, limit);
    total = res.reduce((sum, r) => sum + Number(r.value || 0), 0);
  }

  return json({ items, total, currency: 'INR' });
});
