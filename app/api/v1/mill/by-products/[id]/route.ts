import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/v1/mill/by-products/[id] — record a sale (increments soldKg) or
 * edit ratePerKg/notes. Used by the By-Products page's inline "Record Sale"
 * action — quantityKg itself is immutable here (it's what the batch actually
 * produced); only how much of it has been sold moves.
 * DELETE /api/v1/mill/by-products/[id] — remove a manually-added entry.
 */

export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const existing = await (prisma as any).byProduct.findFirst({ where: { id, shopId: shop.id } });
  if (!existing) throw new ApiError(404, 'By-product entry not found');

  const body = await readBody<any>(req);
  const patch: any = {};

  if (body.addSoldKg !== undefined) {
    const add = Number(body.addSoldKg);
    if (!isFinite(add) || add <= 0) throw new ApiError(400, 'addSoldKg must be a positive number');
    const cap = existing.quantityKg ?? Infinity;
    patch.soldKg = Math.min(cap, (existing.soldKg ?? 0) + add);
  }
  if (body.ratePerKg !== undefined) {
    patch.ratePerKg = body.ratePerKg === '' || body.ratePerKg === null ? null : Number(body.ratePerKg);
  }
  if (body.notes !== undefined) patch.notes = (body.notes || '').toString().trim() || null;

  const updated = await (prisma as any).byProduct.update({
    where: { id },
    data: patch,
    include: { product: { select: { id: true, name: true, baseUnit: true } } },
  });
  return json(updated);
});

export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const existing = await (prisma as any).byProduct.findFirst({ where: { id, shopId: shop.id } });
  if (!existing) throw new ApiError(404, 'By-product entry not found');
  await (prisma as any).byProduct.delete({ where: { id } });
  return json({ success: true });
});
