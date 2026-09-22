import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { assertCanViewStaffPayroll } from '@/lib/server/staffAccess';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (req, { params }) => {
  assertCanViewStaffPayroll(req);
  const { id } = await params;
  const { shop } = await requireShop(req);

  const staff = await prisma.staff.findFirst({ where: { id, shopId: shop.id } });
  if (!staff) throw new ApiError(404, 'Staff not found');

  const advances = await prisma.advanceSalary.findMany({
    where: { staffId: id },
    orderBy: { date: 'desc' }
  });
  
  return json(advances);
});

export const POST = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const b = await readBody(req);
  
  const staff = await prisma.staff.findFirst({ where: { id, shopId: shop.id } });
  if (!staff) throw new ApiError(404, 'Staff not found');
  
  if (b.amount == null) throw new ApiError(400, 'amount is required');

  // Mirrors the working CashBook/ActivityLog pattern from the dead legacy
  // route app/api/v1/staff/advance/route.ts — this is the route the UI
  // actually calls, and it never wrote either until now.
  //
  // Array-form transaction for the create itself (single round trip); the
  // CashBook/ActivityLog writes are best-effort follow-ups rather than part
  // of an interactive transaction — see the note in [id]/salary/route.ts
  // for why (remote-DB latency can expire an interactive transaction).
  const paymentMode = b.paymentMode || 'Cash';
  const [created] = await prisma.$transaction([
    prisma.advanceSalary.create({
      data: {
        staffId: id,
        amount: parseFloat(b.amount),
        date: b.date ? new Date(b.date) : new Date(),
      },
    }),
  ]);

  const followUps: any[] = [];
  if (paymentMode === 'Cash') {
    followUps.push(prisma.cashBook.create({
      data: {
        shopId: shop.id,
        type: 'withdrawal',
        amount: created.amount,
        referenceId: created.id,
        description: `Advance Salary: ${staff.name}`,
        date: created.date,
      },
    }));
  }
  followUps.push(prisma.activityLog.create({
    data: {
      shopId: shop.id,
      action: 'advance_salary_given',
      entityId: created.id,
      details: { staffName: staff.name, amount: created.amount },
    },
  }));
  await Promise.all(followUps).catch((err) => {
    console.error('[advance POST] follow-up writes failed:', err);
  });

  return json(created, 201);
});
