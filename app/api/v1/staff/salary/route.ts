import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const salaries = await prisma.salaryPayment.findMany({
    where: { staff: { shopId: shop.id } },
    include: { staff: { select: { name: true, role: true } } },
    orderBy: { paidAt: 'desc' }
  });
  return json(salaries);
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const data = await readBody<{ staffId: string, monthYear: string, baseAmount: number, deductions?: number, bonus?: number, netAmount: number, paymentMode?: string }>(req);

  if (!data.staffId || !data.monthYear || data.netAmount == null) {
    throw new ApiError(400, 'staffId, monthYear, and netAmount are required');
  }

  const result = await prisma.$transaction(async (tx) => {
    // 1. Create Salary Record
    const salary = await tx.salaryPayment.create({
      data: {
        staffId: data.staffId,
        monthYear: data.monthYear,
        baseAmount: data.baseAmount,
        deductions: data.deductions || 0,
        bonus: data.bonus ? data.bonus.toString() : null,
        netAmount: data.netAmount,
        paymentMode: data.paymentMode || 'Cash',
      }
    });

    // 2. Insert into Cashbook if Cash
    if (salary.paymentMode === 'Cash') {
      await tx.cashBook.create({
        data: {
          shopId: shop.id,
          type: 'expense', // Salary is an expense
          amount: data.netAmount,
          referenceId: salary.id,
          description: `Salary Payment (${data.monthYear})`
        }
      });
    }

    // 3. Insert ActivityLog
    const staff = await tx.staff.findUnique({ where: { id: data.staffId }});
    await tx.activityLog.create({
      data: {
        shopId: shop.id,
        action: 'salary_paid',
        entityId: salary.id,
        details: { staffName: staff?.name, amount: data.netAmount, monthYear: data.monthYear }
      }
    });

    return salary;
  });

  return json(result, 201);
});
