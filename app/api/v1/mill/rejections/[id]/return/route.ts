import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { returnRejectionLotService } from '@/lib/server/rejectionService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req, { params }: any) => {
  const { shop } = await requireShop(req);
  const { id } = await params;
  const body = await readBody(req);

  if (!body.quantity || Number(body.quantity) <= 0) {
    throw new ApiError(400, 'Valid return quantity is required', 'INVALID_QUANTITY');
  }

  const result = await returnRejectionLotService({
    shopId: shop.id,
    rejectionId: id,
    quantity: Number(body.quantity),
    returnTo: body.returnTo || 'supplier',
    partyId: body.partyId || null,
    partyName: body.partyName || 'Party',
    partyMobile: body.partyMobile || null,
    reason: body.reason || null,
    gatePassNumber: body.gatePassNumber || null,
    transporterName: body.transporterName || null,
    vehicleNumber: body.vehicleNumber || null,
    debitNoteAmount: body.debitNoteAmount ? Number(body.debitNoteAmount) : 0,
    notes: body.notes || null,
  });

  return json(result);
});
