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
  }

  const entries = await prisma.cashBook.findMany({
    where: whereClause,
    orderBy: { date: 'desc' }
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
