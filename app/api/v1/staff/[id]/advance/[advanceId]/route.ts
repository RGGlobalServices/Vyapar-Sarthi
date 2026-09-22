import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; advanceId: string }> };

async function getOwnedAdvance(req: Request, staffId: string, advanceId: string) {
  const { shop } = await requireShop(req);
  const staff = await prisma.staff.findFirst({ where: { id: staffId, shopId: shop.id } });
  if (!staff) throw new ApiError(404, 'Staff not found');
  const advance = await prisma.advanceSalary.findFirst({ where: { id: advanceId, staffId } });
  if (!advance) throw new ApiError(404, 'Advance not found');
  return { shop, staff, advance };
}

// Advances aren't reflected in any running balance column — pendingAdvanceTotal
// is summed client-side from the list on every load, and a settled advance's
// deduction is a frozen snapshot on the SalaryPayment row it was paid against
// (SalaryPayment.deductions). Editing/deleting an advance here never needs to
// touch the `deducted`/SalaryPayment side of things — but it DOES now need to
// keep the CashBook entry POST /staff/:id/advance writes in sync, since that
// entry didn't exist when this comment was first written.
export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { id, advanceId } = await params;
  const { shop } = await getOwnedAdvance(req, id, advanceId);
  const b = await readBody(req);

  const data: any = {};
  if (b.amount != null) {
    const amount = parseFloat(b.amount);
    if (!isFinite(amount) || amount <= 0) throw new ApiError(400, 'A positive amount is required');
    data.amount = amount;
  }
  if (b.date) data.date = new Date(b.date);
  if (b.deducted != null) data.deducted = !!b.deducted;

  const ops: any[] = [prisma.advanceSalary.update({ where: { id: advanceId }, data })];
  if (data.amount !== undefined || data.date !== undefined) {
    ops.push(prisma.cashBook.updateMany({
      where: { shopId: shop.id, referenceId: advanceId, type: 'withdrawal' },
      data: {
        ...(data.amount !== undefined && { amount: data.amount }),
        ...(data.date !== undefined && { date: data.date }),
      },
    }));
  }
  const [updated] = await prisma.$transaction(ops);
  return json(updated);
});

export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id, advanceId } = await params;
  const { shop } = await getOwnedAdvance(req, id, advanceId);
  await prisma.$transaction([
    prisma.cashBook.deleteMany({ where: { shopId: shop.id, referenceId: advanceId, type: 'withdrawal' } }),
    prisma.advanceSalary.delete({ where: { id: advanceId } }),
  ]);
  return json({ success: true });
});
