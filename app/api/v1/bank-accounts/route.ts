import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const accounts = await prisma.bankAccount.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: 'asc' },
  });
  return json(accounts);
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody(req);

  if (!body.name?.trim()) throw new ApiError(400, 'Account name is required');

  const openingBalance = parseFloat(body.openingBalance) || 0;
  const account = await prisma.bankAccount.create({
    data: {
      shopId: shop.id,
      name: body.name.trim(),
      bankName: body.bankName?.trim() || null,
      accountNumber: body.accountNumber?.trim() || null,
      ifsc: body.ifsc?.trim() || null,
      openingBalance,
      balance: openingBalance,
    },
  });

  // If opening balance > 0, create an opening entry
  if (openingBalance > 0) {
    await prisma.bankTransaction.create({
      data: {
        bankAccountId: account.id,
        type: 'credit',
        amount: openingBalance,
        description: 'Opening Balance',
        source: 'opening',
      },
    });
  }

  return json(account, 201);
});
