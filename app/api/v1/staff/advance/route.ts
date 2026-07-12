import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const advances = await prisma.advanceSalary.findMany({
    where: { staff: { shopId: shop.id } },
    include: { staff: { select: { name: true } } },
    orderBy: { date: 'desc' }
  });
  return json(advances);
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const data = await readBody<{ staffId: string, amount: number, date?: string, paymentMode?: string }>(req);

  if (!data.staffId || !data.amount) {
    throw new ApiError(400, 'staffId and amount are required');
  }

  const result = await prisma.$transaction(async (tx) => {
    const advance = await tx.advanceSalary.create({
      data: {
        staffId: data.staffId,
        amount: data.amount,
        date: data.date ? new Date(data.date) : new Date(),
      }
    });

    const paymentMode = data.paymentMode || 'Cash';
    if (paymentMode === 'Cash') {
      await tx.cashBook.create({
        data: {
          shopId: shop.id,
          type: 'withdrawal', 
          amount: data.amount,
          referenceId: advance.id,
          description: `Advance Salary Payment`
        }
      });
    }

    const staff = await tx.staff.findUnique({ where: { id: data.staffId }});
    await tx.activityLog.create({
      data: {
        shopId: shop.id,
        action: 'advance_salary_given',
        entityId: advance.id,
        details: { staffName: staff?.name, amount: data.amount }
      }
    });

    return advance;
  });

  return json(result, 201);
});
