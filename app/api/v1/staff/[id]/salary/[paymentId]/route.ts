import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';
import { recordDeletion } from '@/lib/server/trash';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; paymentId: string }> };

// Lets a shopkeeper remove a salary payment that shouldn't exist — most
// commonly a duplicate created by the (now-fixed) same-month double-pay bug,
// but also useful for a genuine mistake (wrong amount/mode entered). Reverses
// any advance-salary rows this payment had marked as deducted, reverses the
// CashBook entry it wrote (see POST above), and snapshots everything to the
// recycle bin first so this is recoverable — a payroll record is exactly the
// kind of thing section 24 of the HR upgrade says must never just vanish.
export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id, paymentId } = await params;
  const { shop, user } = await requireShop(req);

  const staff = await prisma.staff.findFirst({ where: { id, shopId: shop.id } });
  if (!staff) throw new ApiError(404, 'Staff not found');

  const payment = await prisma.salaryPayment.findFirst({ where: { id: paymentId, staffId: id } });
  if (!payment) throw new ApiError(404, 'Salary payment not found');

  const [cashBookEntry, deductedAdvances] = await Promise.all([
    prisma.cashBook.findFirst({ where: { referenceId: paymentId, type: 'expense' } }),
    prisma.advanceSalary.findMany({ where: { deductedFromSalaryId: paymentId } }),
  ]);

  await recordDeletion({
    shopId: shop.id,
    entityType: 'salary_payment',
    entityId: paymentId,
    label: `${staff.name} — ${payment.monthYear}`,
    data: { payment, cashBookEntry, deductedAdvanceIds: deductedAdvances.map(a => a.id) },
    deletedBy: user.email,
  });

  await prisma.$transaction([
    prisma.advanceSalary.updateMany({
      where: { deductedFromSalaryId: paymentId },
      data: { deducted: false, deductedFromSalaryId: null },
    }),
    prisma.cashBook.deleteMany({ where: { shopId: shop.id, referenceId: paymentId, type: 'expense' } }),
    prisma.salaryPayment.delete({ where: { id: paymentId } }),
  ]);

  return json({ success: true });
});
