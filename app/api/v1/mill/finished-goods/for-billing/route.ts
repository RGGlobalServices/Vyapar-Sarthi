import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';
import { isMillBillingPackage } from '@/lib/config/packageConfig';
import { packSummaryForLots, packingTable } from '@/lib/server/packing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/mill/finished-goods/for-billing
 *
 * Returns available Finished Goods Lots grouped by productId, with pack summary
 * (how many bags/goni of each size are available). Used by the Bada Udyog billing
 * screen to let the user pick which lots to sell from.
 *
 * Response: { [productId]: Array<FgLotForBilling> }
 * where FgLotForBilling = { id, lotNumber, batchId, batchNumber, availableQuantity, unit,
 *                           godownName, packs: [{packType, packKg, packs}] }
 */
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req, { enforceSubscription: false });
  if (!isMillBillingPackage((shop as any).packageType)) {
    return json({});
  }

  const lots = await prisma.finishedGoodsLot.findMany({
    where: { shopId: shop.id, status: 'AVAILABLE', availableQuantity: { gt: 0.005 } },
    include: {
      batch: { select: { id: true, batchNumber: true } },
      godown: { select: { name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (!lots.length) return json({});

  // Get pack summaries (how the kg was packed into bags/goni)
  const packTable = await packingTable();
  const packSummaries = packTable
    ? await packSummaryForLots(prisma, shop.id, lots.map((l) => ({ batchId: l.batchId, productId: l.productId })))
    : new Map();

  const byProduct: Record<string, any[]> = {};
  for (const lot of lots) {
    const packKey = `${lot.batchId}:${lot.productId}`;
    const packs = packSummaries.get(packKey) || [];
    const entry = {
      id: lot.id,
      lotNumber: lot.lotNumber,
      batchId: lot.batchId,
      batchNumber: lot.batch?.batchNumber || null,
      availableQuantity: lot.availableQuantity,
      unit: lot.unit,
      godownName: lot.godown?.name || null,
      packs,
    };
    (byProduct[lot.productId] ||= []).push(entry);
  }

  return json(byProduct);
});
