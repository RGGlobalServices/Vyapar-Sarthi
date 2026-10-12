import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req, ctx: any) => {
  const { shop } = await requireShop(req);
  const { id: bankAccountId } = await ctx.params;
  const body = await readBody(req);

  const amount = parseFloat(body.amount);
  if (!amount || amount <= 0) throw new ApiError(400, 'Valid amount is required');
  if (!body.supplierId) throw new ApiError(400, 'supplierId is required');

  const [account, supplier] = await Promise.all([
    prisma.bankAccount.findFirst({ where: { id: bankAccountId, shopId: shop.id } }),
    prisma.supplier.findFirst({ where: { id: body.supplierId, shopId: shop.id } }),
  ]);
  if (!account) throw new ApiError(404, 'Bank account not found');
  if (!supplier) throw new ApiError(404, 'Supplier not found');

  const result = await prisma.$transaction(async (tx) => {
    const bankTxn = await tx.bankTransaction.create({
      data: {
        bankAccountId,
        type: 'debit',
        amount,
        description: `Payment to ${supplier.name}`,
        source: 'supplier_payment',
        referenceId: supplier.id,
      },
    });
    await tx.bankAccount.update({
      where: { id: bankAccountId },
      data: { balance: { decrement: amount } },
    });

    // Reduce supplier balance
    await tx.supplier.update({
      where: { id: supplier.id },
      data: { balance: { decrement: amount } },
    });

    // Supplier ledger entry
    const supplierTxn = await tx.supplierTransaction.create({
      data: {
        supplierId: supplier.id,
        type: 'payment',
        amount,
        note: `Payment via Bank (${account.name})${body.note ? ` — ${body.note}` : ''}`.trim(),
      },
    });

    return { bankTxn, supplierTxn, newBalance: Number(account.balance) - amount };
  }, { timeout: 15000 });

  return json(result, 201);
});
