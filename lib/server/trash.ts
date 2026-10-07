import prisma from '@/lib/server/prisma';

export type TrashEntityType = 'product' | 'customer' | 'customer_transaction' | 'supplier' | 'supplier_transaction' | 'staff' | 'sale' | 'purchase_invoice' | 'salary_payment';

/**
 * Snapshots a record right before a real delete destroys it, so an admin can
 * browse/restore/download it later from the recovery bin. Always called
 * right before the actual delete, and deliberately swallows its own errors —
 * a shopkeeper's delete should never fail because the audit snapshot did.
 */
export async function recordDeletion(params: {
  shopId: string;
  entityType: TrashEntityType;
  entityId: string;
  label?: string | null;
  data: unknown;
  deletedBy?: string | null;
}) {
  try {
    await prisma.deletedRecord.create({
      data: {
        shopId: params.shopId,
        entityType: params.entityType,
        entityId: params.entityId,
        label: params.label || null,
        data: params.data as any,
        deletedBy: params.deletedBy || null,
      },
    });
  } catch (e) {
    console.error('[trash] Failed to record deletion snapshot:', e);
  }
}
