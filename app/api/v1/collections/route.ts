import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, query, readBody, ApiError } from '@/lib/server/http';
import { isWholesaleTierPackage } from '@/lib/config/packageConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /collections?q=&dateFrom=&dateTo=&status=
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  if (!isWholesaleTierPackage(shop.packageType)) throw new ApiError(403, 'Udyog package required');

  const { q, dateFrom, dateTo, status } = query(req);
  const where: any = { shopId: shop.id };
  if (q?.trim()) where.name = { contains: q.trim(), mode: 'insensitive' };
  if (status && status !== 'all') where.status = status;
  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) where.date.gte = new Date(dateFrom);
    if (dateTo) where.date.lte = new Date(dateTo);
  }

  const sheets = await prisma.collectionSheet.findMany({
    where,
    include: { entries: { select: { amount: true } } },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  });

  const summaries = sheets.map(s => ({
    id: s.id,
    name: s.name,
    date: s.date,
    status: s.status,
    finalizedAt: s.finalizedAt,
    createdAt: s.createdAt,
    entryCount: s.entries.length,
    totalAmount: s.entries.reduce((sum, e) => sum + e.amount, 0),
  }));

  return json(summaries);
});

// POST /collections { name, date }
export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  if (!isWholesaleTierPackage(shop.packageType)) throw new ApiError(403, 'Udyog package required');

  const data = await readBody(req);
  const name = (data.name || '').trim();
  if (!name) throw new ApiError(400, 'Collection name is required');
  const date = data.date ? new Date(data.date) : new Date();
  if (isNaN(date.getTime())) throw new ApiError(400, 'Invalid date');

  const sheet = await prisma.collectionSheet.create({
    data: { shopId: shop.id, name, date, status: 'draft' },
  });

  return json(sheet, 201);
});
