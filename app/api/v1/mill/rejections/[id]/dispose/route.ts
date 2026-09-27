import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody } from '@/lib/server/http';
import { disposeRejectionLotService } from '@/lib/server/rejectionService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle<Ctx>(async (req, { params }) => {
  const { shop } = await requireShop(req);
  const { id } = await params;
  const body = await readBody<any>(req);

  const result = await disposeRejectionLotService({
    shopId: shop.id,
    rejectionId: id,
    quantity: Number(body.quantity),
    reason: body.reason,
    notes: body.notes,
  });

  return json(result, 200);
});
