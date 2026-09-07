import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET  /api/v1/mill/batches/[id] — full detail (rawLot + stages + byProducts)
 * PATCH /api/v1/mill/batches/[id] — batch-level edits: currentStage, output/
 *                                    broken/bran/husk kg, close batch.
 *                                    On status='closed', recoveryPct is
 *                                    auto-computed from outputKg / inputKg and
 *                                    closedAt is stamped.
 */

async function assertOwned(req: Request, id: string) {
  const { shop } = await requireShop(req);
  const batch = await (prisma as any).productionBatch.findFirst({
    where: { id, shopId: shop.id },
    include: { byProducts: { select: { id: true } } },
  });
  if (!batch) throw new ApiError(404, 'Production batch not found');
  return { shop, batch };
}

export const GET = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const batch = await (prisma as any).productionBatch.findFirst({
    where: { id, shopId: shop.id },
    include: {
      rawLot: {
        include: {
          product: { select: { name: true, baseUnit: true } },
          supplier: { select: { name: true, mobile: true } },
        },
      },
      stages: { orderBy: { sequence: 'asc' } },
      byProducts: true,
    },
  });
  if (!batch) throw new ApiError(404, 'Production batch not found');
  return json(batch);
});

export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop, batch } = await assertOwned(req, id);
  const body = await readBody<any>(req);

  const patch: any = {};
  const numKeys = ['inputKg', 'outputKg', 'wastageKg', 'brokenKg', 'branKg', 'huskKg'] as const;
  for (const k of numKeys) {
    if (body[k] !== undefined) patch[k] = body[k] === null || body[k] === '' ? null : Number(body[k]);
  }
  if (body.currentStage !== undefined) patch.currentStage = String(body.currentStage);
  if (body.notes !== undefined) patch.notes = String(body.notes).trim() || null;
  if (body.status !== undefined) patch.status = String(body.status);
  if (body.outputProductId !== undefined) {
    if (body.outputProductId) {
      const product = await prisma.product.findFirst({ where: { id: body.outputProductId, shopId: shop.id } });
      if (!product) throw new ApiError(400, 'Output product not found for this shop');
    }
    patch.outputProductId = body.outputProductId || null;
  }

  // Closing a batch is the moment recovery is measured — output ÷ input ×
  // 100. Guard against divide-by-zero; a batch closed with no input is a
  // data-entry error, not a math problem, so leave recoveryPct null and let
  // the UI show a warning instead of "Infinity%".
  const closing = patch.status === 'closed' && batch.status !== 'closed';
  let finalOutput = 0;
  if (closing) {
    finalOutput = Number(patch.outputKg ?? batch.outputKg ?? 0) || 0;
    const finalInput = Number(patch.inputKg ?? batch.inputKg ?? 0) || 0;
    patch.recoveryPct = finalInput > 0
      ? Math.round((finalOutput / finalInput) * 10000) / 100
      : null;
    patch.closedAt = new Date();
    patch.currentStage = 'packing';
  }

  const outputProductId: string | null = patch.outputProductId !== undefined ? patch.outputProductId : batch.outputProductId;

  // Closing with a known output product credits that product's stock in the
  // same transaction as the batch update, and auto-records the three
  // hardcoded by-product fields (broken/bran/husk) as real ByProduct rows —
  // otherwise those numbers only ever lived on the batch itself and nothing
  // else in the codebase ever read them (ByProduct was defined but unused).
  // Skipped if by-products were already recorded for this batch (e.g. a
  // re-save after closing) so re-patching never double-credits stock.
  const ops: any[] = [
    (prisma as any).productionBatch.update({
      where: { id },
      data: patch,
      include: {
        rawLot: {
          include: {
            product: { select: { name: true, baseUnit: true } },
            supplier: { select: { name: true, mobile: true } },
          },
        },
        stages: { orderBy: { sequence: 'asc' } },
        byProducts: true,
      },
    }),
  ];

  if (closing && outputProductId && finalOutput > 0) {
    ops.push(
      prisma.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) + ${finalOutput} WHERE id = ${outputProductId}::uuid`,
      prisma.stockMovement.create({
        data: { shopId: shop.id, productId: outputProductId, type: 'production_output', quantity: finalOutput, referenceId: id },
      }),
    );
  }

  if (closing && (batch.byProducts?.length ?? 0) === 0) {
    const autoByProducts: { name: string; quantityKg: number }[] = [];
    const brokenKg = patch.brokenKg ?? batch.brokenKg;
    const branKg = patch.branKg ?? batch.branKg;
    const huskKg = patch.huskKg ?? batch.huskKg;
    if (brokenKg && brokenKg > 0) autoByProducts.push({ name: 'Broken Rice', quantityKg: brokenKg });
    if (branKg && branKg > 0) autoByProducts.push({ name: 'Bran', quantityKg: branKg });
    if (huskKg && huskKg > 0) autoByProducts.push({ name: 'Husk', quantityKg: huskKg });
    for (const bp of autoByProducts) {
      ops.push((prisma as any).byProduct.create({
        data: { shopId: shop.id, batchId: id, name: bp.name, quantityKg: bp.quantityKg },
      }));
    }
  }

  const [updated] = await prisma.$transaction(ops);
  return json(updated);
});

export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { batch } = await assertOwned(req, id);
  // Return the consumed weight to the source lot so the raw-material ledger
  // stays consistent — otherwise deleting a mid-run batch would silently
  // "eat" inventory. Skipped for closed batches on the assumption that the
  // consumption is already reflected in downstream inventory.
  if (batch.rawLotId && batch.status !== 'closed' && batch.inputKg) {
    await (prisma as any).rawMaterialLot.update({
      where: { id: batch.rawLotId },
      data: { remainingKg: { increment: Number(batch.inputKg) || 0 } },
    });
  }
  await (prisma as any).productionBatch.delete({ where: { id } });
  return json({ success: true });
});
