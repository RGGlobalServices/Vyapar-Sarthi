import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { recordDeletion } from '@/lib/server/trash';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  
  const staff = await prisma.staff.findFirst({
    where: { id, shopId: shop.id },
  });
  if (!staff) throw new ApiError(404, 'Staff member not found');
  
  return json(staff);
});

export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const b = await readBody(req);
  
  const existing = await prisma.staff.findFirst({ where: { id, shopId: shop.id } });
  if (!existing) throw new ApiError(404, 'Staff member not found');

  const data: any = {};
  if (b.name !== undefined) data.name = b.name.trim();
  if (b.mobile !== undefined) data.mobile = b.mobile.trim();
  if (b.address !== undefined) data.address = b.address?.trim() || null;
  if (b.idProof !== undefined) data.idProof = b.idProof?.trim() || null;
  if (b.emergencyContact !== undefined) data.emergencyContact = b.emergencyContact?.trim() || null;
  if (b.role !== undefined) data.role = b.role?.trim() || 'Other';
  if (b.joiningDate !== undefined) data.joiningDate = b.joiningDate ? new Date(b.joiningDate) : new Date();
  if (b.salaryType !== undefined) data.salaryType = b.salaryType === 'daily' ? 'daily' : 'monthly';
  if (b.salaryAmount !== undefined) data.salaryAmount = parseFloat(b.salaryAmount);
  if (b.bankAccount !== undefined) data.bankAccount = b.bankAccount || null;
  if (b.documents !== undefined) data.documents = b.documents || {};
  if (b.photoUrl !== undefined) data.photoUrl = b.photoUrl || null;

  const staff = await prisma.staff.update({
    where: { id },
    data,
  });
  
  return json(staff);
});

export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop, user } = await requireShop(req);

  const existing = await prisma.staff.findFirst({ where: { id, shopId: shop.id } });
  if (!existing) throw new ApiError(404, 'Staff member not found');

  // Attendance/salary payments/advances all cascade-delete with the staff
  // row (onDelete: Cascade) — snapshot them too, not just the profile,
  // or a restore would bring back a staff member with no history.
  const [attendance, salaryPayments, advanceSalaries] = await Promise.all([
    prisma.attendance.findMany({ where: { staffId: id } }),
    prisma.salaryPayment.findMany({ where: { staffId: id } }),
    prisma.advanceSalary.findMany({ where: { staffId: id } }),
  ]);
  await recordDeletion({
    shopId: shop.id,
    entityType: 'staff',
    entityId: id,
    label: existing.name,
    data: { staff: existing, attendance, salaryPayments, advanceSalaries },
    deletedBy: user.email,
  });

  await prisma.staff.delete({ where: { id } });

  return json({ success: true });
});
