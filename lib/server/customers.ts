import prisma from '@/lib/server/prisma';
import { ApiError } from '@/lib/server/http';
import { recordDeletion } from '@/lib/server/trash';

/**
 * Shared soft-delete for Customer rows — used by BOTH the Party/Customer-tab
 * delete route (crm/customers/[id]) and the Udhar delete route
 * (customers/[id]), which used to diverge: Party safely soft-deleted while
 * Udhar hard-deleted with zero recovery for the exact same underlying
 * Customer row. Never destroys the row — prefixes customerType with
 * `archived_` (see the doc-comment on DeletedRecord in prisma/schema.prisma);
 * restoring un-prefixes it instead of re-inserting from the snapshot.
 *
 * Idempotency-guarded: calling this twice on an already-archived customer
 * (double-click, retry, a race) would otherwise double-prefix
 * (`archived_archived_customer`), which restore only ever strips one layer
 * of — leaving the row permanently mis-tagged. No-ops with a 400 instead.
 */
export async function softDeleteCustomer(shopId: string, customerId: string, deletedByEmail?: string | null) {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, shopId } });
  if (!customer) throw new ApiError(404, 'Customer not found');
  if (customer.customerType?.startsWith('archived_')) {
    throw new ApiError(400, 'Customer is already deleted');
  }

  await recordDeletion({
    shopId,
    entityType: 'customer',
    entityId: customer.id,
    label: customer.shopName || customer.name,
    data: customer,
    deletedBy: deletedByEmail,
  });

  await prisma.customer.update({
    where: { id: customer.id },
    data: { customerType: `archived_${customer.customerType || 'customer'}` },
  });

  return customer;
}
