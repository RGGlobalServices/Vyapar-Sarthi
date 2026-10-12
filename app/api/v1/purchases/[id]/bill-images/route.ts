import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET: return current bill images for a purchase
export const GET = handle(async (req, { params }: any) => {
  const { shop } = await requireShop(req);
  const { id } = await params;

  const inv = await prisma.purchaseInvoice.findFirst({
    where: { id, shopId: shop.id },
    select: { id: true, billImages: true },
  });
  if (!inv) throw new ApiError(404, 'Purchase not found');

  return json({ billImages: (inv.billImages as string[]) || [] });
});

// PATCH: update (add/remove) bill images
export const PATCH = handle(async (req, { params }: any) => {
  const { shop } = await requireShop(req);
  const { id } = await params;
  const data = await readBody(req);

  const inv = await prisma.purchaseInvoice.findFirst({
    where: { id, shopId: shop.id },
    select: { id: true, billImages: true },
  });
  if (!inv) throw new ApiError(404, 'Purchase not found');

  // Accepts { billImages: string[] } — full replacement
  const images: string[] = Array.isArray(data.billImages) ? data.billImages : [];

  const updated = await prisma.purchaseInvoice.update({
    where: { id },
    data: { billImages: images },
    select: { id: true, billImages: true },
  });

  return json({ billImages: (updated.billImages as string[]) || [] });
});
