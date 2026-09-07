import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/mill/weighbridge/[id]/convert-to-lot
 *
 * The one-click step the Weighbridge scaffold promised: once a slip's net
 * weight is known (status 'completed'), turn it into a RawMaterialLot — the
 * same model /mill/batches already reads from, so the truck's material is
 * immediately available to start a Production Batch. If a rate/kg and
 * supplier are on the slip, this also posts the purchase to the supplier's
 * ledger (balance + a SupplierTransaction row), mirroring how a normal
 * Purchase invoice affects a supplier — a mill buying grain from a farmer/
 * vendor by weight doesn't fit the GST/HSN-heavy Purchases module, but still
 * needs the amount owed tracked somewhere real.
 */
export const POST = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const body = await readBody<any>(req);

  const entry = await (prisma as any).weighbridgeEntry.findFirst({ where: { id, shopId: shop.id } });
  if (!entry) throw new ApiError(404, 'Weighbridge entry not found');
  if (entry.status === 'converted') throw new ApiError(400, 'This slip has already been converted to a Raw Material Lot');
  if (entry.status !== 'completed' || !entry.netWeightKg || entry.netWeightKg <= 0) {
    throw new ApiError(400, 'Record the tare (second) weighment before converting to a Raw Material Lot');
  }

  const ratePerKg = body.ratePerKg != null && body.ratePerKg !== '' ? Number(body.ratePerKg) : (entry.ratePerKg || 0);
  const totalAmount = ratePerKg > 0 ? Math.round(ratePerKg * entry.netWeightKg * 100) / 100 : null;
  const lotNumber = (body.lotNumber || '').toString().trim() || entry.slipNumber;

  const result = await prisma.$transaction(async (tx) => {
    const lot = await (tx as any).rawMaterialLot.create({
      data: {
        shopId: shop.id,
        productId: body.productId || entry.productId || null,
        supplierId: body.supplierId || entry.supplierId || null,
        lotNumber,
        farmerName: (body.farmerName || '').trim() || null,
        purchaseDate: new Date(),
        weightKg: entry.netWeightKg,
        moisturePct: entry.moisturePct,
        ratePerKg: ratePerKg || null,
        totalAmount,
        remainingKg: entry.netWeightKg,
        notes: `Converted from Weighbridge slip ${entry.slipNumber}`,
      },
    });

    await (tx as any).weighbridgeEntry.update({
      where: { id: entry.id },
      data: { rawLotId: lot.id, status: 'converted' },
    });

    // Post to the supplier's ledger — same shape purchases/route.ts uses for
    // its own supplier balance + SupplierTransaction writes.
    const supplierId = body.supplierId || entry.supplierId;
    if (supplierId && totalAmount && totalAmount > 0) {
      await (tx as any).supplier.update({
        where: { id: supplierId },
        data: { balance: { increment: totalAmount } },
      });
      await (tx as any).supplierTransaction.create({
        data: {
          supplierId,
          type: 'purchase',
          amount: totalAmount,
          billNumber: lotNumber,
          note: `Raw material — ${entry.netWeightKg} Kg via Weighbridge slip ${entry.slipNumber}`,
        },
      });
    }

    if (entry.gateEntryId) {
      await (tx as any).gateEntry.update({ where: { id: entry.gateEntryId }, data: { status: 'exited', exitedAt: new Date() } }).catch(() => {});
    }

    return lot;
  }, { timeout: 15000, maxWait: 10000 });

  return json(result, 201);
});
