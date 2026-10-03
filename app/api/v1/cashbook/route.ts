import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, query, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A cash-book "day" is the shop's own day (India, IST = UTC+5:30). Cutting at UTC midnight put every entry between 00:00 and 05:30 IST
// on the PREVIOUS date. Anything that is not a plain YYYY-MM-DD keeps the old reading.
const DAY = /^\d{4}-\d{2}-\d{2}$/;
function dayStart(v: string): Date { return DAY.test(v) ? new Date(`${v}T00:00:00+05:30`) : (() => { const d = new Date(v); d.setUTCHours(0, 0, 0, 0); return d; })(); }
function dayEnd(v: string): Date { return DAY.test(v) ? new Date(`${v}T23:59:59.999+05:30`) : (() => { const d = new Date(v); d.setUTCHours(23, 59, 59, 999); return d; })(); }

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const q = query(req);
  
  const whereClause: any = { shopId: shop.id };
  if (q.date) {
    whereClause.date = { gte: dayStart(q.date), lte: dayEnd(q.date) };
  } else if (q.from || q.to) {
    // Ledger page range view — a wider window than the single-day form the
    // Daily Closing screen already used this endpoint for.
    const range: any = {};
    if (q.from) range.gte = dayStart(q.from);
    if (q.to) range.lte = dayEnd(q.to);
    whereClause.date = range;
  }
  if (q.type) whereClause.type = q.type;

  const limit = Math.min(1000, Math.max(1, parseInt(q.limit || '300') || 300));

  const entries = await prisma.cashBook.findMany({
    where: whereClause,
    orderBy: { date: 'desc' },
    take: limit,
  });

  return json(entries);
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const data = await readBody<{ type: string, amount: number, description?: string, date?: string }>(req);

  if (!data.type || !data.amount) {
    throw new ApiError(400, 'type and amount are required');
  }

  const entry = await prisma.cashBook.create({
    data: {
      shopId: shop.id,
      type: data.type,
      amount: data.amount,
      description: data.description,
      date: data.date ? new Date(data.date) : new Date()
    }
  });

  return json(entry, 201);
});
