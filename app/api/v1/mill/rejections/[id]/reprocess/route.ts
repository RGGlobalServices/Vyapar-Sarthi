import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody } from '@/lib/server/http';
import { reprocessRejectionLotService } from '@/lib/server/rejectionService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle<Ctx>(async (req, { params }) => {
  const { shop } = await requireShop(req);
  const { id } = await params;
  const body = await readBody<any>(req);

  const result = await reprocessRejectionLotService({
    shopId: shop.id,
    rejectionId: id,
    quantity: Number(body.quantity),
    unit: body.unit,
    godownId: body.godownId,
    workflowVersionId: body.workflowVersionId,
    notes: body.notes,
  });

  return json(result, 201);
});
