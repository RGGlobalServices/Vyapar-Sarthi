import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';
import { assertCanViewStaffPayroll } from '@/lib/server/staffAccess';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// Read-only history of salary rate changes for this staff member — written
// automatically by PATCH /staff/:id whenever salaryAmount actually changes.
export const GET = handle<Ctx>(async (req, { params }) => {
  assertCanViewStaffPayroll(req);
  const { id } = await params;
  const { shop } = await requireShop(req);

  const staff = await prisma.staff.findFirst({ where: { id, shopId: shop.id } });
  if (!staff) throw new ApiError(404, 'Staff not found');

  const revisions = await prisma.salaryRevision.findMany({
    where: { staffId: id },
    orderBy: { effectiveFrom: 'desc' },
  });
  return json(revisions);
});
