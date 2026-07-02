import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, query, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const q = query(req);
  if (!q.date) throw new ApiError(400, 'Date parameter is required');

  const date = new Date(q.date);
  date.setUTCHours(0, 0, 0, 0);

  const attendance = await prisma.attendance.findMany({
    where: {
      staff: { shopId: shop.id },
      date: date,
    },
    include: { staff: true },
  });
  return json(attendance);
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const b = await readBody(req);
  if (!b.date) throw new ApiError(400, 'Date is required');
  if (!Array.isArray(b.records)) throw new ApiError(400, 'Records must be an array');

  const date = new Date(b.date);
  date.setUTCHours(0, 0, 0, 0);

  // Validate that all staff IDs belong to this shop
  const staffIds = b.records.map((r: any) => r.staffId);
  const validStaff = await prisma.staff.findMany({
    where: { shopId: shop.id, id: { in: staffIds } },
  });
  const validStaffIds = new Set(validStaff.map(s => s.id));

  const results = [];
  for (const record of b.records) {
    if (!validStaffIds.has(record.staffId)) continue;
    
    const att = await prisma.attendance.upsert({
      where: {
        staffId_date: {
          staffId: record.staffId,
          date: date,
        },
      },
      update: {
        status: record.status,
        reason: record.reason || null,
      },
      create: {
        staffId: record.staffId,
        date: date,
        status: record.status,
        reason: record.reason || null,
      },
    });
    results.push(att);
  }

  return json(results);
});
