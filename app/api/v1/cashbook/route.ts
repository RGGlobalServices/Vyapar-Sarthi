import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, query, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const q = query(req);
  
  const whereClause: any = { shopId: shop.id };
  if (q.date) {
    const start = new Date(q.date);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCHours(23, 59, 59, 999);
    whereClause.date = { gte: start, lte: end };
  } else if (q.from || q.to) {
    // Ledger page range view — a wider window than the single-day form the
    // Daily Closing screen already used this endpoint for.
    const range: any = {};
    if (q.from) { const s = new Date(q.from); s.setUTCHours(0, 0, 0, 0); range.gte = s; }
    if (q.to) { const e = new Date(q.to); e.setUTCHours(23, 59, 59, 999); range.lte = e; }
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
