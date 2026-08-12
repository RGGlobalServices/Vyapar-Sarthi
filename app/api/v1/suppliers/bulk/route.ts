import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';
import { recordDeletion } from '@/lib/server/trash';

export const runtime = 'nodejs';

// DELETE /suppliers/bulk?ids=csv&cascade=true — batch version of
// suppliers/[id]'s single-delete cascade dance. Each supplier needs its own
// linked-history check + snapshot before it can be deleted, so this loops
// per id (like billing/bulk) rather than a single deleteMany. `cascade`
// applies to the whole batch rather than per-supplier — simpler than asking
// per-row in a bulk context: ids with no history always delete; ids with
// history are skipped into `blocked` unless the caller already knows about
// them and retries the same call with cascade=true.
export const DELETE = handle(async (req) => {
  const { shop, user } = await requireShop(req);
  const url = new URL(req.url);
  const idsParam = url.searchParams.get('ids');
  if (!idsParam) throw new ApiError(400, 'No supplier IDs provided');
  const ids = idsParam.split(',').filter(Boolean);
  const cascade = url.searchParams.get('cascade') === 'true';

  const deleted: string[] = [];
  const blocked: { id: string; name: string; txnCount: number; invoiceCount: number }[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const id of ids) {
    try {
      const supplier = await prisma.supplier.findUnique({ where: { id, shopId: shop.id } });
      if (!supplier) {
        failed.push({ id, error: 'Not found' });
        continue;
      }

      const [txnCount, invoiceCount] = await Promise.all([
        prisma.supplierTransaction.count({ where: { supplierId: id } }),
        prisma.purchaseInvoice.count({ where: { supplierId: id } }),
      ]);
      const linked = txnCount + invoiceCount;

      // Same block-and-report behavior as the single-delete route's 409, just
      // recorded into `blocked` here instead of aborting the whole batch —
      // ids without history in the same call still proceed normally.
      if (linked > 0 && !cascade) {
        blocked.push({ id, name: supplier.name, txnCount, invoiceCount });
        continue;
      }

      const [supplierTransactions, purchaseInvoices] = await Promise.all([
        cascade && linked > 0 ? prisma.supplierTransaction.findMany({ where: { supplierId: id } }) : Promise.resolve([]),
        cascade && linked > 0 ? prisma.purchaseInvoice.findMany({ where: { supplierId: id }, include: { purchaseItems: true } }) : Promise.resolve([]),
      ]);

      // Snapshot before destroying, same as the single-delete route.
      await recordDeletion({
        shopId: shop.id,
        entityType: 'supplier',
        entityId: id,
        label: supplier.name,
        data: { supplier, supplierTransactions, purchaseInvoices },
        deletedBy: user.email,
      });

      if (cascade && linked > 0) {
        await prisma.$transaction([
          prisma.supplierTransaction.deleteMany({ where: { supplierId: id } }),
          prisma.purchaseInvoice.deleteMany({ where: { supplierId: id } }),
          prisma.supplier.delete({ where: { id, shopId: shop.id } }),
        ]);
      } else {
        await prisma.supplier.delete({ where: { id, shopId: shop.id } });
      }

      deleted.push(id);
    } catch (error: any) {
      console.error(`[API] Bulk supplier delete failed for ${id}:`, error);
      const message = error?.code === 'P2003'
        ? 'This supplier is linked to other records and cannot be deleted directly.'
        : (error.message || 'Delete failed');
      failed.push({ id, error: message });
    }
  }

  return json({ success: true, deleted, blocked, failed });
});
