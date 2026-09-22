import prisma from '@/lib/server/prisma';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { requireShop } from '@/lib/server/auth';
import { assertOwned } from '@/lib/server/ownership';
import { invalidateDashboardCacheForShop } from '@/lib/server/dashboardCache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const expenses = await prisma.expense.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: 'desc' }
  });
  return json(expenses);
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const data = await readBody<{ category: string, amount: number, description?: string, paymentMode?: string, date?: string, attachmentUrl?: string, isRecurring?: boolean, warehouseId?: string }>(req);
  await assertOwned(shop.id, { godownId: data.warehouseId });
  
  if (!data.category || !data.amount) {
    throw new ApiError(400, 'Category and amount are required');
  }

  const result = await prisma.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        shopId: shop.id,
        category: data.category,
        amount: data.amount,
        description: data.description,
        paymentMode: data.paymentMode || 'Cash',
        date: data.date ? new Date(data.date) : new Date(),
        attachmentUrl: data.attachmentUrl || null,
        isRecurring: data.isRecurring || false,
        warehouseId: data.warehouseId || null,
      }
    });

    if (expense.paymentMode === 'Cash') {
      await tx.cashBook.create({
        data: {
          shopId: shop.id,
          type: 'expense',
          amount: data.amount,
          referenceId: expense.id,
          description: `Expense: ${data.category}`,
          date: expense.date,
        }
      });
    }

    await tx.activityLog.create({
      data: {
        shopId: shop.id,
        action: 'expense_added',
        entityId: expense.id,
        details: { category: data.category, amount: data.amount }
      }
    });

    return expense;
  });

  // Fresh expense → drop the shop's dashboard cache so the KPI reflects it
  // on the very next dashboard fetch, not up to 15s later.
  invalidateDashboardCacheForShop(shop.id);

  return json(result, 201);
});
