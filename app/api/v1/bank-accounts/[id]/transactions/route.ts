import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, query, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req, ctx: any) => {
  const { shop } = await requireShop(req);
  const { id } = await ctx.params;
  const q = query(req);

  const account = await prisma.bankAccount.findFirst({ where: { id, shopId: shop.id } });
  if (!account) throw new ApiError(404, 'Bank account not found');

  const where: any = { bankAccountId: id };
  if (q.from || q.to) {
    where.date = {};
    if (q.from) where.date.gte = new Date(q.from);
    if (q.to) { const d = new Date(q.to); d.setHours(23, 59, 59, 999); where.date.lte = d; }
  }

  const limit = Math.min(500, parseInt(q.limit || '200') || 200);
  const txns = await prisma.bankTransaction.findMany({
    where,
    orderBy: { date: 'desc' },
    take: limit,
  });

  return json({ account, transactions: txns });
});

export const POST = handle(async (req, ctx: any) => {
  const { shop } = await requireShop(req);
  const { id } = await ctx.params;
  const body = await readBody(req);

  const account = await prisma.bankAccount.findFirst({ where: { id, shopId: shop.id } });
  if (!account) throw new ApiError(404, 'Bank account not found');

  const amount = parseFloat(body.amount);
  if (!amount || amount <= 0) throw new ApiError(400, 'Valid amount is required');
  if (!['credit', 'debit'].includes(body.type)) throw new ApiError(400, 'type must be credit or debit');

  const result = await prisma.$transaction(async (tx) => {
    const txn = await tx.bankTransaction.create({
      data: {
        bankAccountId: id,
        type: body.type,
        amount,
        description: body.description?.trim() || null,
        source: body.source || 'manual',
        date: body.date ? new Date(body.date) : new Date(),
      },
    });
    const balanceDelta = body.type === 'credit' ? amount : -amount;
    const updated = await tx.bankAccount.update({
      where: { id },
      data: { balance: { increment: balanceDelta } },
    });
    return { txn, balance: updated.balance };
  });

  return json(result, 201);
});
