import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
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
  
  if (!b.name?.trim()) throw new ApiError(400, 'Name is required');
  if (!b.mobile?.trim()) throw new ApiError(400, 'Mobile is required');
  if (b.salaryAmount == null || isNaN(parseFloat(b.salaryAmount))) {
    throw new ApiError(400, 'Valid salary amount is required');
  }

  const staff = await prisma.staff.create({
    data: {
      shopId: shop.id,
      name: b.name.trim(),
      mobile: b.mobile.trim(),
      address: b.address?.trim() || null,
      idProof: b.idProof?.trim() || null,
      emergencyContact: b.emergencyContact?.trim() || null,
      salaryType: b.salaryType === 'daily' ? 'daily' : 'monthly',
      salaryAmount: parseFloat(b.salaryAmount),
      photoUrl: b.photoUrl || null,
    },
  });
  return json(staff, 201);
});
