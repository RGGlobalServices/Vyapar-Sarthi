import { requireShop } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';
import { softDeleteCustomer } from '@/lib/server/customers';

export const runtime = 'nodejs';

// DELETE /crm/customers/bulk?ids=csv — soft-deletes each Party/Customer row
// (same underlying Customer model as the Udhar-side /customers/bulk route,
// distinguished only by customerType='party' vs 'customer'), reporting
// success/failure per id (an already-archived or missing id shouldn't sink
// the rest of the batch). Mirrors app/api/v1/customers/bulk/route.ts exactly,
// just under the crm/customers path used by the Parties/Customers tabs.
export const DELETE = handle(async (req) => {
  const { shop, user } = await requireShop(req);
  const url = new URL(req.url);
  const idsParam = url.searchParams.get('ids');
  if (!idsParam) throw new ApiError(400, 'No customer IDs provided');
  const ids = idsParam.split(',').filter(Boolean);

  const deleted: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const id of ids) {
    try {
      await softDeleteCustomer(shop.id, id, user.email);
      deleted.push(id);
    } catch (error: any) {
      failed.push({ id, error: error.message || 'Delete failed' });
    }
  }

  return json({ success: true, deleted, failed });
});
