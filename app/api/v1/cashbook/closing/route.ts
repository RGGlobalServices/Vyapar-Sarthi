import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, query, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const closings = await prisma.dailyClosing.findMany({
    where: { shopId: shop.id },
    orderBy: { date: 'desc' },
    take: 30
  });
  return json(closings);
});

export const POST = handle(async (req) => {
  const { shop, user } = await requireShop(req);
  const data = await readBody<{ date: string, closingCash: number }>(req);

  if (!data.date || data.closingCash == null) {
    throw new ApiError(400, 'date and closingCash are required');
  }

  const date = new Date(data.date);
  date.setUTCHours(0, 0, 0, 0);
  const nextDate = new Date(date);
  nextDate.setUTCHours(23, 59, 59, 999);

  const result = await prisma.$transaction(async (tx) => {
    // 1. Calculate from CashBook
    const cashEntries = await tx.cashBook.findMany({
      where: {
        shopId: shop.id,
        date: { gte: date, lte: nextDate }
      }
    });

    let openingCash = 0;
    let cashSales = 0;
    let cashCollection = 0;
    let cashExpenses = 0;
    let cashDeposits = 0;

    cashEntries.forEach(entry => {
      if (entry.type === 'opening_balance') openingCash += entry.amount;
      else if (entry.type === 'sale') cashSales += entry.amount;
      else if (entry.type === 'collection') cashCollection += entry.amount;
      else if (entry.type === 'expense' || entry.type === 'purchase') cashExpenses += entry.amount;
      else if (entry.type === 'withdrawal') cashExpenses += entry.amount;
      else if (entry.type === 'deposit') cashDeposits += entry.amount;
    });

    const expectedCash = openingCash + cashSales + cashCollection + cashDeposits - cashExpenses;
    const difference = data.closingCash - expectedCash;

    const closing = await tx.dailyClosing.upsert({
      where: {
        shopId_date: {
          shopId: shop.id,
          date: date
        }
      },
      update: {
        openingCash,
        cashSales,
        cashCollection,
        cashExpenses,
        cashDeposits,
        closingCash: data.closingCash,
        difference,
        closedBy: user.id.toString()
      },
      create: {
        shopId: shop.id,
        date: date,
        openingCash,
        cashSales,
        cashCollection,
        cashExpenses,
        cashDeposits,
        closingCash: data.closingCash,
        difference,
        closedBy: user.id.toString()
      }
    });

    await tx.activityLog.create({
      data: {
        shopId: shop.id,
        action: 'daily_closed',
        entityId: closing.id,
        details: { date: data.date, expected: expectedCash, actual: data.closingCash, diff: difference }
      }
    });

    return closing;
  });

  return json(result, 201);
});
