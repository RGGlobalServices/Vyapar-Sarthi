import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  return json(shop);
});

export const PATCH = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody(req);
  const allowedFields = ['name', 'address', 'mobile', 'businessType', 'logoUrl', 'setupComplete', 'gst', 'pan'];
  const data: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) data[field] = body[field];
  }
  if (Object.keys(data).length === 0) throw new ApiError(400, 'No valid fields provided');
  const updated = await prisma.shop.update({ where: { id: shop.id }, data });
  return json(updated);
});
