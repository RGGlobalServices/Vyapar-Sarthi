import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { assertOwned } from '@/lib/server/ownership';
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
  const { shop, user } = await requireShop(req);
  const b = await readBody(req);

  const existing = await prisma.staff.findFirst({ where: { id, shopId: shop.id } });
  if (!existing) throw new ApiError(404, 'Staff member not found');

  await assertOwned(shop.id, { godownId: b.warehouseId, staffId: b.reportingManagerId });

  if (b.employeeCode !== undefined) {
    const code = b.employeeCode?.trim() || null;
    if (code && code !== existing.employeeCode) {
      const dupe = await prisma.staff.findFirst({ where: { shopId: shop.id, employeeCode: code, id: { not: id } } });
      if (dupe) throw new ApiError(409, `Employee code "${code}" is already in use`);
    }
  }

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
  if (b.status !== undefined) data.status = b.status || 'active';
  if (b.warehouseId !== undefined) data.warehouseId = b.warehouseId || null;
  if (b.employeeCode !== undefined) data.employeeCode = b.employeeCode?.trim() || null;
  if (b.department !== undefined) data.department = b.department?.trim() || null;
  if (b.employeeType !== undefined) data.employeeType = b.employeeType || 'full_time';
  if (b.email !== undefined) data.email = b.email?.trim() || null;
  if (b.alternateMobile !== undefined) data.alternateMobile = b.alternateMobile?.trim() || null;
  if (b.dateOfBirth !== undefined) data.dateOfBirth = b.dateOfBirth ? new Date(b.dateOfBirth) : null;
  if (b.gender !== undefined) data.gender = b.gender || null;
  if (b.shift !== undefined) data.shift = b.shift?.trim() || null;
  if (b.reportingManagerId !== undefined) data.reportingManagerId = b.reportingManagerId || null;
  if (b.preferredPaymentMode !== undefined) data.preferredPaymentMode = b.preferredPaymentMode || 'Cash';
  if (b.pan !== undefined) data.pan = b.pan?.trim().toUpperCase() || null;
  if (b.aadhaarLast4 !== undefined) data.aadhaarLast4 = b.aadhaarLast4?.trim() || null;
  if (b.uan !== undefined) data.uan = b.uan?.trim() || null;
  if (b.pfApplicable !== undefined) data.pfApplicable = !!b.pfApplicable;
  if (b.esiApplicable !== undefined) data.esiApplicable = !!b.esiApplicable;
  if (b.ptApplicable !== undefined) data.ptApplicable = !!b.ptApplicable;
  if (b.tdsApplicable !== undefined) data.tdsApplicable = !!b.tdsApplicable;
  if (b.resignationDate !== undefined) data.resignationDate = b.resignationDate ? new Date(b.resignationDate) : null;
  if (b.lastWorkingDay !== undefined) data.lastWorkingDay = b.lastWorkingDay ? new Date(b.lastWorkingDay) : null;
  if (b.exitReason !== undefined) data.exitReason = b.exitReason?.trim() || null;
  if (b.noticePeriodDays !== undefined) data.noticePeriodDays = b.noticePeriodDays != null ? parseInt(b.noticePeriodDays) : null;
  if (b.exitNotes !== undefined) data.exitNotes = b.exitNotes?.trim() || null;

  // A genuine rate change gets a permanent SalaryRevision row before the
  // live Staff.salaryAmount is overwritten — past SalaryPayment rows already
  // freeze the rate used at the time, this just makes the RATE CHANGE ITSELF
  // traceable (section 11 of the HR upgrade: "never overwrite historical salary").
  const salaryChanged = data.salaryAmount !== undefined && data.salaryAmount !== existing.salaryAmount;

  // Array-form transaction (single round trip) rather than an interactive
  // callback — this remote DB's connection pooling doesn't reliably hold
  // session affinity across an interactive transaction's multiple round
  // trips (already documented elsewhere in this codebase: it can close the
  // transaction mid-flight under real latency, e.g. "Transaction already
  // closed" once ~5s elapses). The array form fires everything in one
  // statement and is immune to that.
  const ops: any[] = [];
  if (salaryChanged) {
    ops.push(prisma.salaryRevision.create({
      data: {
        staffId: id,
        oldAmount: existing.salaryAmount,
        newAmount: data.salaryAmount,
        reason: b.salaryChangeReason?.trim() || null,
        changedBy: user.email,
      },
    }));
  }
  ops.push(prisma.staff.update({ where: { id }, data }));
  const results = await prisma.$transaction(ops);
  const staff = results[results.length - 1];

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
