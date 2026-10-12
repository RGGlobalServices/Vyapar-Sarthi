import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req, ctx: any) => {
  const { shop } = await requireShop(req);
  const { id } = await ctx.params;
  const account = await prisma.bankAccount.findFirst({ where: { id, shopId: shop.id } });
  if (!account) throw new ApiError(404, 'Bank account not found');
  return json(account);
});

export const PUT = handle(async (req, ctx: any) => {
  const { shop } = await requireShop(req);
  const { id } = await ctx.params;
  const body = await readBody(req);
  const account = await prisma.bankAccount.findFirst({ where: { id, shopId: shop.id } });
  if (!account) throw new ApiError(404, 'Bank account not found');
  const updated = await prisma.bankAccount.update({
    where: { id },
    data: {
      name: body.name?.trim() || account.name,
      bankName: body.bankName?.trim() ?? account.bankName,
      accountNumber: body.accountNumber?.trim() ?? account.accountNumber,
      ifsc: body.ifsc?.trim() ?? account.ifsc,
    },
  });
  return json(updated);
});

export const DELETE = handle(async (req, ctx: any) => {
  const { shop } = await requireShop(req);
  const { id } = await ctx.params;
  const account = await prisma.bankAccount.findFirst({ where: { id, shopId: shop.id } });
  if (!account) throw new ApiError(404, 'Bank account not found');
  await prisma.bankAccount.delete({ where: { id } });
  return json({ success: true });
});
