import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';
import { recordDeletion } from '@/lib/server/trash';
import { reverseSaleEffects, cleanupSaleBatches } from '@/lib/server/sales';

export const runtime = 'nodejs';

// Unlike products/bulk (a single deleteMany), each sale needs its own
// snapshot + transactional reversal, so this loops the single-sale delete
// logic per id and reports success/failure per id rather than one count —
// a bulk delete that reversed 8 of 10 sales shouldn't look like a full
// success or a full failure.
export const DELETE = handle(async (req) => {
  const { shop, user } = await requireShop(req);
  const url = new URL(req.url);
  const idsParam = url.searchParams.get('ids');
  if (!idsParam) throw new ApiError(400, 'No bill IDs provided');
  const ids = idsParam.split(',').filter(Boolean);

  const deleted: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const id of ids) {
    try {
      const sale = await prisma.sale.findFirst({ where: { id, shopId: shop.id }, include: { items: true } });
      if (!sale) {
        failed.push({ id, error: 'Not found' });
        continue;
      }

      await recordDeletion({
        shopId: shop.id,
        entityType: 'sale',
        entityId: sale.id,
        label: sale.invoice_number,
        data: sale,
        deletedBy: user.email,
      });

      const { netQuantitiesByProduct, lotRestores } = await prisma.$transaction(
        (tx) => reverseSaleEffects(tx, shop.id, sale.id),
        { timeout: 15000, maxWait: 10000 }
      );

      try {
        await cleanupSaleBatches(prisma, shop.id, sale.id, shop.packageType, netQuantitiesByProduct, lotRestores);
      } catch (e) {
        console.error('Sale batch/movement cleanup failed:', e);
      }

      deleted.push(id);
    } catch (error: any) {
      console.error(`[API] Bulk bill delete failed for ${id}:`, error);
      failed.push({ id, error: error.message || 'Delete failed' });
    }
  }

  return json({ success: true, deleted, failed });
});
