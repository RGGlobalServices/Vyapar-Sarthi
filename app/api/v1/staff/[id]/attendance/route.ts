import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, query, ApiError } from '@/lib/server/http';
import { normalizeAttendanceStatus, getMonthRangeUTC } from '@/lib/attendance';

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
    // UTC boundaries — matches how dates are written below
    // (setUTCHours(0,0,0,0)); local-time boundaries here would shift by the
    // server's UTC offset and can silently drop the month's first/last day.
    const { start, end } = getMonthRangeUTC(q.monthYear);
    whereClause.date = {
      gte: start,
      lte: end
    };
  }

  const records = await prisma.attendance.findMany({
    where: whereClause,
    orderBy: { date: 'desc' }
  });

  return json(records.map(r => ({ ...r, status: normalizeAttendanceStatus(r.status) })));
});

export const POST = handle<Ctx>(async (req, { params }) => {
  const { shop } = await requireShop(req);
  const { id } = await params;
  const b = await readBody(req);
  
  if (!b.date) throw new ApiError(400, 'Date is required');
  const status = normalizeAttendanceStatus(b.status);
  if (!status) throw new ApiError(400, 'Status is required (Present, Absent, Half Day, Leave)');

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
      status,
      reason: b.reason || null,
    },
    create: {
      staffId: id,
      date: date,
      status,
      reason: b.reason || null,
    },
  });

  return json(att);
});
