import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (req, { params }) => {
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

  const advance = await prisma.advanceSalary.create({
    data: {
      staffId: id,
      amount: parseFloat(b.amount),
      date: b.date ? new Date(b.date) : new Date(),
    },
  });

  return json(advance, 201);
});
