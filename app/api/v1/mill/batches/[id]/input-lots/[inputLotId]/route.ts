import { requireShop } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';
import { deleteBatchInputLotService } from '@/lib/server/batchMaterialService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const DELETE = handle(async (req, ctx: any) => {
  const { shop, user } = await requireShop(req);
  const { id, inputLotId } = await ctx.params;

  const userId = user?.id || shop.id;

  const res = await deleteBatchInputLotService(shop.id, userId, id, inputLotId);
  return json(res);
});
