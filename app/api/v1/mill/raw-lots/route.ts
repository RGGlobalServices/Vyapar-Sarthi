import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { assertOwned as assertRefsOwned } from '@/lib/server/ownership';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { kgPerUnit, kgToProductUnit, round3, lotSource } from '@/lib/server/millProduction';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Raw material lots — the mill's incoming grain (Paddy / Wheat / Turad / …)
 * arriving from farmers in batches with a lot number, weight, moisture %,
 * and rate. Each lot is consumed by one or more ProductionBatch rows.
 *
 * GET  /api/v1/mill/raw-lots — list, newest first
 * POST /api/v1/mill/raw-lots — create a lot; sets remainingKg = weightKg on create
 */

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const url = new URL(req.url);
  const productId = url.searchParams.get('productId');
  const supplierId = url.searchParams.get('supplierId');
  const status = url.searchParams.get('status'); // 'available' | 'consumed' | undefined

  const where: any = { shopId: shop.id };
  if (productId) where.productId = productId;
  if (supplierId) where.supplierId = supplierId;
  // "available" = still has weight left. Uses raw > 0 so 0 and null are both
  // treated as consumed — a lot with no remainingKg recorded shouldn't show
  // up as available material to pull into a new batch.
  if (status === 'available') where.remainingKg = { gt: 0 };
  if (status === 'consumed') where.OR = [{ remainingKg: 0 }, { remainingKg: null }];

  const lots = await (prisma as any).rawMaterialLot.findMany({
    where,
    include: {
      product: { select: { id: true, name: true, baseUnit: true } },
      supplier: { select: { id: true, name: true, mobile: true } },
      batches: { select: { id: true, batchNumber: true, inputKg: true, status: true } },
      weighbridgeEntries: { select: { slipNumber: true } },
    },
    orderBy: { purchaseDate: 'desc' },
    take: 500,
  });

  // Where the lot came from, derived from what is already stored (no extra column): a linked weighbridge slip, or the note the
  // purchase paths write ("Auto-created from / Imported from Purchase Invoice X"), otherwise a manual entry.
  return json(lots.map((l: any) => {
    const { weighbridgeEntries, ...rest } = l;
    return { ...rest, ...lotSource(l) };
  }));
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody<any>(req);
  // Linked ids are client-supplied — they must belong to this shop, or another
  // shop's names/mobiles come back through the response join.
  await assertRefsOwned(shop.id, { productId: body.productId, supplierId: body.supplierId });
  if (!body.productId) throw new ApiError(400, 'Select the raw material product for this lot.', 'PRODUCT_REQUIRED');

  const product = await prisma.product.findFirst({ where: { id: body.productId, shopId: shop.id }, select: { id: true, name: true, baseUnit: true } });
  if (!product) throw new ApiError(404, 'Product not found for this shop');

  let weightKg = Number(body.weightKg);
  let ratePerKg = body.ratePerKg === undefined || body.ratePerKg === null || body.ratePerKg === '' ? 0 : Number(body.ratePerKg);
  let lotNumber: string = (body.lotNumber || '').toString().trim();
  let farmerName: string = (body.farmerName || '').toString().trim();
  let supplierId: string | null = body.supplierId || null;
  let purchaseDate = body.purchaseDate ? new Date(body.purchaseDate) : new Date();
  let notes: string = (body.notes || '').toString().trim();
  let stockAlreadyCounted = false;

  // Import from a purchase line: the line, its weight, its rate and its supplier are read from the DATABASE (never taken from the
  // client), it must be this shop's, and a line can only ever become a lot once. The purchase already added the stock.
  if (body.purchaseItemId) {
    const item = await prisma.purchaseItem.findFirst({
      where: { id: String(body.purchaseItemId), purchaseInvoice: { shopId: shop.id } },
      include: { purchaseInvoice: { include: { supplier: { select: { id: true, name: true } } } }, product: { select: { id: true, baseUnit: true } } },
    });
    if (!item) throw new ApiError(404, 'Purchase line not found for this shop');
    if (item.productId !== product.id) throw new ApiError(400, 'That purchase line is for a different product.', 'PURCHASE_LINE_PRODUCT_MISMATCH');
    const per = kgPerUnit(item.product.baseUnit);
    if (!per) throw new ApiError(400, 'This purchase line is not in a weight unit, so it cannot become a raw material lot.', 'UNIT_NOT_WEIGHT');
    const invNo = item.purchaseInvoice.invoiceNumber || '';
    if (invNo) {
      const dup = await prisma.rawMaterialLot.findFirst({
        where: { shopId: shop.id, productId: item.productId, OR: [{ lotNumber: invNo }, { lotNumber: { startsWith: `${invNo}-L` } }] },
        select: { id: true },
      });
      if (dup) throw new ApiError(409, 'This purchase line is already in Raw Material.', 'PURCHASE_LINE_ALREADY_IMPORTED');
    }
    weightKg = round3(Number(item.quantity) * per);
    ratePerKg = Math.round((Number(item.cost) || 0) / per * 100) / 100;
    supplierId = item.purchaseInvoice.supplierId;
    farmerName = farmerName || item.purchaseInvoice.supplier?.name || '';
    lotNumber = lotNumber || invNo;
    purchaseDate = item.purchaseInvoice.date || purchaseDate;
    notes = `Imported from Purchase Invoice ${invNo}`;
    stockAlreadyCounted = true;
  }

  if (!isFinite(weightKg) || weightKg <= 0) {
    throw new ApiError(400, 'weightKg must be a positive number');
  }
  if (!isFinite(ratePerKg) || ratePerKg < 0) throw new ApiError(400, 'Rate must be zero or a positive number', 'INVALID_RATE');
  if (Number.isNaN(purchaseDate.getTime())) throw new ApiError(400, 'Invalid date');

  let moisturePct: number | null = null;
  if (body.moisturePct != null && body.moisturePct !== '') {
    const m = Number(body.moisturePct);
    if (!isFinite(m) || m < 0 || m > 100) throw new ApiError(400, 'Moisture must be between 0 and 100 %', 'INVALID_MOISTURE');
    moisturePct = m;
  }

  const totalAmount = ratePerKg > 0 ? Math.round(ratePerKg * weightKg * 100) / 100 : null;

  // A manual lot is NEW raw material with no bill behind it, so the product's stock goes up with it (same as a purchase would do).
  // A lot imported from a purchase line must not add anything again.
  const stockQty = stockAlreadyCounted ? null : kgToProductUnit(weightKg, product.baseUnit, product.name ?? '');

  const lot = await prisma.$transaction(async (tx) => {
    const created = await (tx as any).rawMaterialLot.create({
      data: {
        shopId: shop.id,
        productId: product.id,
        supplierId,
        lotNumber: lotNumber || null,
        farmerName: farmerName || null,
        purchaseDate,
        weightKg,
        moisturePct,
        ratePerKg: ratePerKg || null,
        totalAmount,
        // A fresh lot starts fully available; production consumes it (conditionally, at finalize).
        remainingKg: weightKg,
        notes: notes || null,
      },
    });
    if (stockQty) {
      await tx.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) + ${stockQty} WHERE id = ${product.id}::uuid AND shop_id = ${shop.id}::uuid`;
      await tx.stockMovement.create({ data: { shopId: shop.id, productId: product.id, type: 'raw_material_receipt', quantity: stockQty, referenceId: created.id } });
    }
    return created;
  });

  return json(lot, 201);
});
