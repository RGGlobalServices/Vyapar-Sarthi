import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, query, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (req, { params }) => {
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

  const payment = await prisma.salaryPayment.create({
    data: {
      staffId: id,
      monthYear: b.monthYear,
      baseAmount: parseFloat(b.baseAmount),
      deductions: b.deductions ? parseFloat(b.deductions) : 0,
      bonus: b.bonus ? JSON.stringify(b.bonus) : null,
      netAmount: parseFloat(b.netAmount),
      paymentMode: b.paymentMode || 'Cash',
      paidAt: b.paidAt ? new Date(b.paidAt) : new Date(),
    },
  });

  return json(payment, 201);
});
