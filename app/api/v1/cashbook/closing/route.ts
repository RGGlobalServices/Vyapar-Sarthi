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

  const isDay = /^\d{4}-\d{2}-\d{2}$/.test(String(data.date));
  // the closing row is keyed by the calendar date; the entries counted are those of that day in IST (UTC+5:30)
  const date = isDay ? new Date(`${data.date}T00:00:00.000Z`) : (() => { const d = new Date(data.date); d.setUTCHours(0, 0, 0, 0); return d; })();
  const windowStart = isDay ? new Date(`${data.date}T00:00:00+05:30`) : date;
  const windowEnd = isDay ? new Date(`${data.date}T23:59:59.999+05:30`) : (() => { const d = new Date(date); d.setUTCHours(23, 59, 59, 999); return d; })();

  const result = await prisma.$transaction(async (tx) => {
    // 1. Calculate from CashBook
    const cashEntries = await tx.cashBook.findMany({
      where: {
        shopId: shop.id,
        date: { gte: windowStart, lte: windowEnd }
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
      else if (entry.type === 'withdrawal' || entry.type === 'refund') cashExpenses += entry.amount; // a cash refund to a customer is cash out
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
