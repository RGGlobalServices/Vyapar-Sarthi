import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody } from '@/lib/server/http';
import { getBatchInputLotsService, addBatchInputLotService } from '@/lib/server/batchMaterialService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req, ctx: any) => {
  const { shop } = await requireShop(req);
  const { id } = await ctx.params;

  const result = await getBatchInputLotsService(shop.id, id);
  return json(result);
});

export const POST = handle(async (req, ctx: any) => {
  const { shop, user } = await requireShop(req);
  const { id } = await ctx.params;
  const body = await readBody(req);

  const userId = user?.id || shop.id;

  const newLot = await addBatchInputLotService(shop.id, userId, id, {
    rawMaterialLotId: body.rawMaterialLotId,
    quantity: body.quantity,
    unit: body.unit,
    notes: body.notes,
  });

  return json(newLot, 201);
});
