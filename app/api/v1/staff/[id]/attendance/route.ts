import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, query, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (req, { params }) => {
  const { shop } = await requireShop(req);
  const { id } = await params;
  
  const q = query(req);
  // Optional date filtering e.g. ?monthYear=2026-07
  let whereClause: any = { staffId: id, staff: { shopId: shop.id } };
  
  if (q.monthYear) {
    const [year, month] = q.monthYear.split('-');
    const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
    const endDate = new Date(parseInt(year), parseInt(month), 0);
    whereClause.date = {
      gte: startDate,
      lte: endDate
    };
  }
  
  const records = await prisma.attendance.findMany({
    where: whereClause,
    orderBy: { date: 'desc' }
  });
  
  return json(records);
});

export const POST = handle<Ctx>(async (req, { params }) => {
  const { shop } = await requireShop(req);
  const { id } = await params;
  const b = await readBody(req);
  
  if (!b.date) throw new ApiError(400, 'Date is required');
  if (!b.status) throw new ApiError(400, 'Status is required (Present, Absent, Half Day, Leave)');

  const date = new Date(b.date);
  date.setUTCHours(0, 0, 0, 0);

  // Validate staff belongs to shop
  const staff = await prisma.staff.findFirst({
    where: { id, shopId: shop.id },
  });
  if (!staff) throw new ApiError(404, 'Staff member not found');

  const att = await prisma.attendance.upsert({
    where: {
      staffId_date: {
        staffId: id,
        date: date,
      },
    },
    update: {
      status: b.status,
      reason: b.reason || null,
    },
    create: {
      staffId: id,
      date: date,
      status: b.status,
      reason: b.reason || null,
    },
  });

  return json(att);
});
