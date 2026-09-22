import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, query, ApiError } from '@/lib/server/http';
import { assertCanViewStaffPayroll } from '@/lib/server/staffAccess';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (req, { params }) => {
  assertCanViewStaffPayroll(req);
  const { id } = await params;
  const { shop } = await requireShop(req);
  const q = query(req);

  const staff = await prisma.staff.findFirst({ where: { id, shopId: shop.id } });
  if (!staff) throw new ApiError(404, 'Staff not found');

  if (q.month) {
    // Return all salary payments for this staff member (could filter by month)
    const payments = await prisma.salaryPayment.findMany({
      where: { staffId: id },
      orderBy: { paidAt: 'desc' }
    });
    return json(payments);
  }

  return json({ message: 'Use ?month=YYYY-MM' });
});

export const POST = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const b = await readBody(req);
  
  const staff = await prisma.staff.findFirst({ where: { id, shopId: shop.id } });
  if (!staff) throw new ApiError(404, 'Staff not found');
  
  if (!b.monthYear) throw new ApiError(400, 'monthYear is required');
  if (b.baseAmount == null) throw new ApiError(400, 'baseAmount is required');
  if (b.netAmount == null) throw new ApiError(400, 'netAmount is required');

  // Guard against paying the same month twice. Without this, a slow
  // response (or a shopkeeper re-clicking because nothing visibly
  // happened) silently created a second SalaryPayment row for the same
  // staff+month — this produced real duplicate payroll records in
  // production before this fix. The client also disables the button once
  // a month is already paid, but this is the actual source of truth. Done
  // as its own round trip before the transaction (not inside it) since the
  // array-transaction form below can't branch on this result mid-flight.
  const existingPayment = await prisma.salaryPayment.findFirst({ where: { staffId: id, monthYear: b.monthYear } });
  if (existingPayment) throw new ApiError(409, `Salary for ${b.monthYear} is already marked as paid`);

  const paymentMode = b.paymentMode || 'Cash';
  const paidAt = b.paidAt ? new Date(b.paidAt) : new Date();

  // Array-form transaction (single round trip) rather than an interactive
  // callback — see the identical note in [id]/route.ts: an interactive
  // transaction can hit "Transaction already closed" under this remote DB's
  // real latency once ~5s elapses, and this is the highest-traffic payroll
  // route in the app.
  const payment = prisma.salaryPayment.create({
    data: {
      staffId: id,
      monthYear: b.monthYear,
      baseAmount: parseFloat(b.baseAmount),
      deductions: b.deductions ? parseFloat(b.deductions) : 0,
      bonus: b.bonus ? JSON.stringify(b.bonus) : null,
      netAmount: parseFloat(b.netAmount),
      paymentMode,
      paidAt,
    },
  });

  const [p] = await prisma.$transaction([payment]);

  const followUps: any[] = [];
  if (b.advanceIds && Array.isArray(b.advanceIds) && b.advanceIds.length > 0) {
    followUps.push(prisma.advanceSalary.updateMany({
      where: { id: { in: b.advanceIds }, staffId: id },
      data: { deducted: true, deductedFromSalaryId: p.id }
    }));
  }

  // Salary is a real cash outflow — until now this route never touched
  // the shop's cash ledger or activity log at all (a dead pair of routes,
  // app/api/v1/staff/salary/route.ts + staff/advance/route.ts, already had
  // this exact pattern but the UI never called them). Mirrored here so
  // salary payouts actually show up in netInHand/reports like every other
  // cash movement in the app.
  if (p.paymentMode === 'Cash') {
    followUps.push(prisma.cashBook.create({
      data: {
        shopId: shop.id,
        type: 'expense',
        amount: p.netAmount,
        referenceId: p.id,
        description: `Salary: ${staff.name} (${p.monthYear})`,
        date: p.paidAt,
      },
    }));
  }
  followUps.push(prisma.activityLog.create({
    data: {
      shopId: shop.id,
      action: 'salary_paid',
      entityId: p.id,
      details: { staffName: staff.name, amount: p.netAmount, monthYear: p.monthYear, paymentMode: p.paymentMode },
    },
  }));

  // Best-effort — these are side records (advance-deduction flags, ledger,
  // audit log), not the payment of record itself, which is already
  // committed above. Matches the established best-effort pattern elsewhere
  // in this codebase (see feedback_prisma_interactive_transaction_latency).
  if (followUps.length > 0) {
    await Promise.all(followUps).catch((err) => {
      console.error('[salary POST] follow-up writes failed:', err);
    });
  }

  return json(p, 201);
});
