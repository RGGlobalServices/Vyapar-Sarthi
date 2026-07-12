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
  const allowedFields = ['name', 'address', 'mobile', 'businessType', 'packageType', 'logoUrl', 'setupComplete', 'gst', 'pan'];
  const data: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) data[field] = body[field];
  }
  if (Object.keys(data).length === 0) throw new ApiError(400, 'No valid fields provided');
  const updated = await prisma.shop.update({ where: { id: shop.id }, data });
  return json(updated);
});

export const POST = handle(async (req) => {
  // Dummy endpoint to prevent 405 Method Not Allowed when frontend switchShop calls api.post('/shop/profile')
  // The actual shop switching is stateless and handled via the x-shop-id header on subsequent requests.
  return json({ success: true });
});
