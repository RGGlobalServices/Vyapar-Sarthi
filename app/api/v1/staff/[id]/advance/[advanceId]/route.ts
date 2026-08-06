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
// (SalaryPayment.deductions). So editing/deleting an advance here never needs
// to reverse anything elsewhere, unlike Purchases.
export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { id, advanceId } = await params;
  await getOwnedAdvance(req, id, advanceId);
  const b = await readBody(req);

  const data: any = {};
  if (b.amount != null) {
    const amount = parseFloat(b.amount);
    if (!isFinite(amount) || amount <= 0) throw new ApiError(400, 'A positive amount is required');
    data.amount = amount;
  }
  if (b.date) data.date = new Date(b.date);
  if (b.deducted != null) data.deducted = !!b.deducted;

  const updated = await prisma.advanceSalary.update({ where: { id: advanceId }, data });
  return json(updated);
});

export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id, advanceId } = await params;
  await getOwnedAdvance(req, id, advanceId);
  await prisma.advanceSalary.delete({ where: { id: advanceId } });
  return json({ success: true });
});
