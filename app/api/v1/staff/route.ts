import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { assertOwned } from '@/lib/server/ownership';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const staff = await prisma.staff.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: 'desc' },
  });
  return json(staff);
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const b = await readBody(req);

  // Linked ids are client-supplied — they must belong to this shop.
  await assertOwned(shop.id, { godownId: b.warehouseId, staffId: b.reportingManagerId });
  
  if (!b.name?.trim()) throw new ApiError(400, 'Name is required');
  if (!b.mobile?.trim()) throw new ApiError(400, 'Mobile is required');
  if (b.salaryAmount == null || isNaN(parseFloat(b.salaryAmount))) {
    throw new ApiError(400, 'Valid salary amount is required');
  }

  const employeeCode = b.employeeCode?.trim() || null;
  if (employeeCode) {
    // No DB-level unique constraint on (shopId, employeeCode) — see the
    // Staff model's own comment in schema.prisma for why — so this check is
    // the actual source of truth for "no duplicate employee codes in a shop".
    const dupe = await prisma.staff.findFirst({ where: { shopId: shop.id, employeeCode } });
    if (dupe) throw new ApiError(409, `Employee code "${employeeCode}" is already in use`);
  }

  // Array-form transaction for the create (single round trip); the
  // activity-log write is a best-effort follow-up rather than part of an
  // interactive transaction — see the note in [id]/salary/route.ts for why
  // (remote-DB latency can expire an interactive transaction mid-flight).
  const [staff] = await prisma.$transaction([
    prisma.staff.create({
      data: {
        shopId: shop.id,
        name: b.name.trim(),
        mobile: b.mobile.trim(),
        address: b.address?.trim() || null,
        idProof: b.idProof?.trim() || null,
        emergencyContact: b.emergencyContact?.trim() || null,
        role: b.role?.trim() || 'Other',
        joiningDate: b.joiningDate ? new Date(b.joiningDate) : new Date(),
        salaryType: b.salaryType === 'daily' ? 'daily' : 'monthly',
        salaryAmount: parseFloat(b.salaryAmount),
        bankAccount: b.bankAccount || null,
        documents: b.documents || {},
        photoUrl: b.photoUrl || null,
        status: b.status || 'active',
        warehouseId: b.warehouseId || null,
        employeeCode,
        department: b.department?.trim() || null,
        employeeType: b.employeeType || 'full_time',
        email: b.email?.trim() || null,
        alternateMobile: b.alternateMobile?.trim() || null,
        dateOfBirth: b.dateOfBirth ? new Date(b.dateOfBirth) : null,
        gender: b.gender || null,
        shift: b.shift?.trim() || null,
        reportingManagerId: b.reportingManagerId || null,
        preferredPaymentMode: b.preferredPaymentMode || 'Cash',
        pan: b.pan?.trim().toUpperCase() || null,
        aadhaarLast4: b.aadhaarLast4?.trim() || null,
        uan: b.uan?.trim() || null,
        pfApplicable: !!b.pfApplicable,
        esiApplicable: !!b.esiApplicable,
        ptApplicable: !!b.ptApplicable,
        tdsApplicable: !!b.tdsApplicable,
      },
    }),
  ]);

  await prisma.activityLog.create({
    data: {
      shopId: shop.id,
      action: 'staff_added',
      entityId: staff.id,
      details: { name: staff.name, role: staff.role }
    }
  }).catch((err) => {
    console.error('[staff POST] activity log write failed:', err);
  });

  return json(staff, 201);
});
