import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { assertOwned } from '@/lib/server/ownership';
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
  if (entry.status === 'converted' || entry.rawLotId) throw new ApiError(409, 'This slip has already been converted to a Raw Material Lot', 'ALREADY_CONVERTED');
  if (entry.status !== 'completed' || !entry.netWeightKg || entry.netWeightKg <= 0) {
    throw new ApiError(400, 'Record the tare (second) weighment before converting to a Raw Material Lot');
  }

  const existingLot = await (prisma as any).rawMaterialLot.findFirst({ where: { weighbridgeEntryId: id, shopId: shop.id } });
  if (existingLot) throw new ApiError(409, 'This weighbridge slip is already converted to a Raw Material Lot.', 'ALREADY_CONVERTED');

  const lotProductId = body.productId || entry.productId;
  if (!lotProductId) throw new ApiError(400, 'Select the raw material product for this lot.', 'PRODUCT_REQUIRED');

  const product = await prisma.product.findFirst({ where: { id: lotProductId, shopId: shop.id }, select: { id: true, name: true, baseUnit: true, isRawMaterial: true } });
  if (!product) throw new ApiError(404, 'Product not found for this shop');
  if (product.isRawMaterial !== true) throw new ApiError(400, 'Product is not marked as a raw material.', 'INVALID_PRODUCT');

  const quantity = entry.netWeightKg;
  const unit = 'Kg';
  const ratePerUnit = body.ratePerUnit != null && body.ratePerUnit !== '' ? Number(body.ratePerUnit) : (entry.ratePerUnit || 0);
  const totalAmount = ratePerUnit > 0 ? Math.round(ratePerUnit * quantity * 100) / 100 : null;

  let lotNumberInput: string = (body.lotNumber || '').toString().trim();
  let supplierId: string | null = body.supplierId || entry.supplierId || null;
  let farmerName: string | null = (body.farmerName || '').trim() || null;
  let godownId: string | null = body.godownId || null;

  if (supplierId) {
    const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, shopId: shop.id }});
    if (!supplier) throw new ApiError(404, 'Supplier not found for this shop');
    farmerName = null; // Do not store duplicate free-text when linked to a supplier
  }

  if (godownId) {
    const godown = await prisma.godown.findFirst({ where: { id: godownId, shopId: shop.id }});
    if (!godown) throw new ApiError(404, 'Godown not found for this shop');
  }

  let created: any = null;
  let attempts = 0;

  while (!created && attempts < 5) {
    attempts++;
    let currentLotNumber = lotNumberInput;

    try {
      created = await prisma.$transaction(async (tx) => {
        const dupEntry = await (tx as any).weighbridgeEntry.findUnique({ where: { id } });
        if (dupEntry?.status === 'converted' || dupEntry?.rawLotId) {
          throw new Error('DUPLICATE_CONVERSION');
        }
        const existingLotTx = await (tx as any).rawMaterialLot.findFirst({ where: { weighbridgeEntryId: id } });
        if (existingLotTx) throw new Error('DUPLICATE_CONVERSION');

        if (!currentLotNumber) {
          const d = new Date();
          const prefix = `RM-${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
          const same = await (tx as any).rawMaterialLot.count({ where: { shopId: shop.id, lotNumber: { startsWith: prefix } } });
          currentLotNumber = `${prefix}-${String(same + 1).padStart(3, '0')}`;
        }

        const lot = await (tx as any).rawMaterialLot.create({
          data: {
            shopId: shop.id,
            productId: product.id,
            supplierId,
            godownId,
            weighbridgeEntryId: id,
            lotNumber: currentLotNumber,
            farmerName,
            purchaseDate: new Date(),
            quantity,
            unit,
            moisturePct: (body.moisturePct !== undefined && body.moisturePct !== '' && body.moisturePct !== null && Number(body.moisturePct) >= 0 && Number(body.moisturePct) <= 100) ? Number(body.moisturePct) : entry.moisturePct,
            ratePerUnit: ratePerUnit || null,
            totalAmount,
            remainingQuantity: quantity,
            notes: `Converted from Weighbridge slip ${entry.slipNumber}`,
          },
        });

        await (tx as any).weighbridgeEntry.update({
          where: { id: entry.id },
          data: { rawLotId: lot.id, status: 'converted' },
        });

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
              billNumber: currentLotNumber,
              note: `Raw material — ${quantity} Kg via Weighbridge slip ${entry.slipNumber}`,
            },
          });
        }

        await tx.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) + ${quantity} WHERE id = ${product.id}::uuid AND shop_id = ${shop.id}::uuid`;
        await tx.stockMovement.create({ data: { shopId: shop.id, productId: product.id, type: 'purchase', quantity: quantity, referenceId: lot.id } });
        
        if (godownId) {
          const godownIdUuid = String(godownId);
          await tx.godownProduct.upsert({
            where: { godownId_productId: { godownId: godownIdUuid, productId: product.id } },
            update: { quantity: { increment: quantity } },
            create: { godownId: godownIdUuid, productId: product.id, quantity: quantity }
          });
        }

        if (entry.gateEntryId) {
          await (tx as any).gateEntry.update({ where: { id: entry.gateEntryId }, data: { status: 'exited', exitedAt: new Date() } }).catch(() => {});
        }

        return lot;
      }, { timeout: 20000, maxWait: 10000 });
      
    } catch (err: any) {
      if (err.message === 'DUPLICATE_CONVERSION') {
        throw new ApiError(409, 'This weighbridge slip is already converted to a Raw Material Lot.', 'ALREADY_CONVERTED');
      }
      if (err.code === 'P2002' && !lotNumberInput) {
        continue;
      }
      throw err;
    }
  }

  if (!created) {
    throw new ApiError(500, 'Failed to generate a unique lot number after 5 attempts.');
  }

  return json(created, 201);
});
