import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';
import { isMillBillingPackage } from '@/lib/config/packageConfig';
import { packingTable } from '@/lib/server/packing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** DELETE /api/v1/mill/packing/[id] — remove one pack line (a mistake in the packing); the weight goes back to "not packed". */
export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  if (!isMillBillingPackage((shop as any).packageType)) throw new ApiError(403, 'Packing is a Bada Udyog feature.', 'NOT_MILL_SHOP');
  if (!(await packingTable())) throw new ApiError(503, 'Packing is not set up on this database yet.', 'PACKING_NOT_READY');
  const n = await prisma.$executeRawUnsafe(`DELETE FROM production_output_packs WHERE id = $1::uuid AND shop_id = $2::uuid`, id, shop.id);
  if (!n) throw new ApiError(404, 'Pack line not found');
  return json({ success: true });
});
