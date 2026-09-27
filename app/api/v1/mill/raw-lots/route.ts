import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { assertOwned as assertRefsOwned } from '@/lib/server/ownership';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { kgPerUnit, kgToProductUnit, round3, lotSource, canonicalReceivedDate, computeLotQuantities } from '@/lib/server/millProduction';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getDateBounds(preset?: string | null, customStart?: string | null, customEnd?: string | null): { start?: Date; end?: Date } {
  const now = new Date();
  if (preset === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { start, end };
  }
  if (preset === 'yesterday') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
    return { start, end };
  }
  if (preset === 'this_week') {
    const day = now.getDay();
    const diff = (day === 0 ? -6 : 1) - day; // Monday
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { start, end };
  }
  if (preset === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }
  if (customStart || customEnd) {
    const start = customStart ? new Date(customStart) : undefined;
    const end = customEnd ? new Date(new Date(customEnd).setHours(23, 59, 59, 999)) : undefined;
    return { start, end };
  }
  return {};
}

/**
 * Raw material lots — the mill's incoming grain (Paddy / Wheat / Turad / …)
 * arriving from farmers in batches with a lot number, weight, moisture %,
 * and rate. Each lot is consumed by one or more ProductionBatch rows.
 *
 * GET  /api/v1/mill/raw-lots — list with canonical receivedDate sorting, date & source filters, and quantity states
 * POST /api/v1/mill/raw-lots — create a lot; sets remainingQuantity = quantity on create
 */

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const url = new URL(req.url);
  const productId = url.searchParams.get('productId');
  const supplierId = url.searchParams.get('supplierId');
  const status = url.searchParams.get('status'); // 'available' | 'allocated' | 'in_production' | 'consumed' | 'all'
  const source = url.searchParams.get('source'); // 'purchase' | 'weighbridge' | 'manual'
  const sort = url.searchParams.get('sort') || 'desc'; // 'desc' (default: newest received first) | 'asc'
  const datePreset = url.searchParams.get('datePreset');
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');

  const where: any = { shopId: shop.id };
  if (productId) where.productId = productId;
  if (supplierId) where.supplierId = supplierId;

  const lots = await (prisma as any).rawMaterialLot.findMany({
    where,
    include: {
      product: { select: { id: true, name: true, baseUnit: true } },
      supplier: { select: { id: true, name: true, mobile: true } },
      batches: { select: { id: true, batchNumber: true, inputKg: true, status: true, currentStage: true, startedAt: true } },
      weighbridgeEntries: { select: { slipNumber: true } },
    },
    take: 500,
  });

  const { start: filterStart, end: filterEnd } = getDateBounds(datePreset, startDate, endDate);

  // Map each lot with its source, canonical receivedDate, and computed quantity states
  let mapped = lots.map((l: any) => {
    const { weighbridgeEntries, ...rest } = l;
    const src = lotSource(l);
    const recDate = canonicalReceivedDate(l);
    const qty = computeLotQuantities(l);
    return {
      ...rest,
      ...src,
      receivedDate: recDate.toISOString(),
      receivedKg: qty.quantity,
      allocatedKg: qty.allocatedKg,
      consumedKg: qty.consumedKg,
      availableKg: qty.availableKg,
      operationalStatus: qty.operationalStatus,
    };
  });

  // Filter by canonical received date if requested
  if (filterStart || filterEnd) {
    mapped = mapped.filter((l: any) => {
      const d = new Date(l.receivedDate).getTime();
      if (filterStart && d < filterStart.getTime()) return false;
      if (filterEnd && d > filterEnd.getTime()) return false;
      return true;
    });
  }

  // Filter by source if requested
  if (source && source !== 'all') {
    mapped = mapped.filter((l: any) => l.source === source);
  }

  // Filter by operational status if requested
  if (status && status !== 'all') {
    if (status === 'available') {
      // Do not hide partially available lots from the Available view
      mapped = mapped.filter((l: any) => l.availableKg > 0);
    } else if (status === 'allocated' || status === 'in_production') {
      mapped = mapped.filter((l: any) => l.allocatedKg > 0);
    } else if (status === 'consumed') {
      mapped = mapped.filter((l: any) => l.availableKg <= 0 && l.allocatedKg <= 0);
    }
  }

  // Sort by canonical receivedDate: default Newest Received -> Oldest ('desc')
  mapped.sort((a: any, b: any) => {
    const ta = new Date(a.receivedDate).getTime();
    const tb = new Date(b.receivedDate).getTime();
    return sort === 'asc' ? ta - tb : tb - ta;
  });

  return json(mapped);
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody<any>(req);
  // Linked ids are client-supplied — they must belong to this shop, or another
  // shop's names/mobiles come back through the response join.
  await assertRefsOwned(shop.id, { productId: body.productId, supplierId: body.supplierId });
  if (!body.productId) throw new ApiError(400, 'Select the raw material product for this lot.', 'PRODUCT_REQUIRED');

  const product = await prisma.product.findFirst({ where: { id: body.productId, shopId: shop.id }, select: { id: true, name: true, baseUnit: true, isRawMaterial: true } });
  if (!product) throw new ApiError(404, 'Product not found for this shop');
  if (product.isRawMaterial !== true) throw new ApiError(400, 'Product is not marked as a raw material.', 'INVALID_PRODUCT');

  let quantity = Number(body.quantity);
  let ratePerUnit = body.ratePerUnit === undefined || body.ratePerUnit === null || body.ratePerUnit === '' ? 0 : Number(body.ratePerUnit);
  let unit = (body.unit || product.baseUnit || '').toString().trim();
  if (!unit) throw new ApiError(400, 'Unit is required for generic raw materials', 'UNIT_REQUIRED');

  let lotNumber: string = (body.lotNumber || '').toString().trim();
  let farmerName: string = (body.farmerName || '').toString().trim();
  let supplierId: string | null = body.supplierId || null;
  let godownId: string | null = body.godownId || null;
  let purchaseDate = body.purchaseDate ? new Date(body.purchaseDate) : new Date();
  let notes: string = (body.notes || '').toString().trim();
  let stockAlreadyCounted = false;

  if (supplierId) {
    const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, shopId: shop.id }});
    if (!supplier) throw new ApiError(404, 'Supplier not found for this shop');
    farmerName = ''; // Do NOT store free text when supplierId is supplied
  }

  if (godownId) {
    const godown = await prisma.godown.findFirst({ where: { id: godownId, shopId: shop.id }});
    if (!godown) throw new ApiError(404, 'Godown not found for this shop');
  }

  // Import from a purchase line: the line, its weight, its rate and its supplier are read from the DATABASE (never taken from the
  // client), it must be this shop's, and a line can only ever become a lot once. The purchase already added the stock.
  if (body.purchaseItemId) {
    const item = await prisma.purchaseItem.findFirst({
      where: { id: String(body.purchaseItemId), purchaseInvoice: { shopId: shop.id } },
      include: { purchaseInvoice: { include: { supplier: { select: { id: true, name: true } } } }, product: { select: { id: true, baseUnit: true } } },
    });
    if (!item) throw new ApiError(404, 'Purchase line not found for this shop');
    if (item.productId !== product.id) throw new ApiError(400, 'That purchase line is for a different product.', 'PURCHASE_LINE_PRODUCT_MISMATCH');
    
    // Existing guards preserved for duplicates
    const invNo = item.purchaseInvoice.invoiceNumber || '';
    if (invNo) {
      const dup = await prisma.rawMaterialLot.findFirst({
        where: { shopId: shop.id, productId: item.productId, OR: [{ lotNumber: invNo }, { lotNumber: { startsWith: `${invNo}-L` } }] },
        select: { id: true },
      });
      if (dup) throw new ApiError(409, 'This purchase line is already in Raw Material.', 'PURCHASE_LINE_ALREADY_IMPORTED');
    }
    
    // Keep quantity/unit generic instead of forcing Kg conversion
    quantity = Number(item.quantity) || 0;
    ratePerUnit = Number(item.cost) || 0;
    unit = item.product.baseUnit || 'kg';
    supplierId = item.purchaseInvoice.supplierId;
    farmerName = farmerName || item.purchaseInvoice.supplier?.name || '';
    lotNumber = lotNumber || invNo;
    purchaseDate = item.purchaseInvoice.date || purchaseDate;
    notes = `Imported from Purchase Invoice ${invNo}`;
    stockAlreadyCounted = true;
  }

  let weighbridgeEntryId = body.weighbridgeEntryId || null;

  if (!isFinite(quantity) || quantity <= 0) {
    throw new ApiError(400, 'quantity must be a positive number');
  }
  if (!isFinite(ratePerUnit) || ratePerUnit < 0) throw new ApiError(400, 'Rate must be zero or a positive number', 'INVALID_RATE');
  if (Number.isNaN(purchaseDate.getTime())) throw new ApiError(400, 'Invalid date');

  let moisturePct: number | null = null;
  if (body.moisturePct != null && body.moisturePct !== '') {
    const m = Number(body.moisturePct);
    if (!isFinite(m) || m < 0 || m > 100) throw new ApiError(400, 'Moisture must be between 0 and 100 %', 'INVALID_MOISTURE');
    moisturePct = m;
  }

  const totalAmount = ratePerUnit > 0 ? Math.round(ratePerUnit * quantity * 100) / 100 : null;

  // Manual lots add stock natively. Imported lots do not.
  const stockQty = stockAlreadyCounted ? null : quantity;

  let created: any = null;
  let attempts = 0;
  
  while (!created && attempts < 5) {
    attempts++;
    let currentLotNumber = lotNumber;
    
    try {
      created = await prisma.$transaction(async (tx) => {
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
            purchaseItemId: body.purchaseItemId || null,
            weighbridgeEntryId,
            lotNumber: currentLotNumber,
            farmerName: farmerName || null,
            purchaseDate,
            quantity,
            unit,
            moisturePct,
            ratePerUnit: ratePerUnit || null,
            totalAmount,
            // A fresh lot starts fully available; production consumes it (conditionally, at finalize).
            remainingQuantity: quantity,
            notes: notes || null,
          },
        });
        
        if (stockQty) {
          await tx.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) + ${stockQty} WHERE id = ${product.id}::uuid AND shop_id = ${shop.id}::uuid`;
          await tx.stockMovement.create({ data: { shopId: shop.id, productId: product.id, type: 'raw_material_receipt', quantity: stockQty, referenceId: lot.id } });
          
          if (godownId) {
            const godownIdUuid = String(godownId);
            await tx.godownProduct.upsert({
              where: { godownId_productId: { godownId: godownIdUuid, productId: product.id } },
              update: { quantity: { increment: stockQty } },
              create: { godownId: godownIdUuid, productId: product.id, quantity: stockQty }
            });
          }
        }
        return lot;
      }, { timeout: 20000, maxWait: 10000 });
      
    } catch (err: any) {
      if (err.code === 'P2002' && !lotNumber) {
        // Unique constraint failed on our generated lotNumber. Retry.
        continue;
      }
      throw err;
    }
  }
  
  if (!created) {
    throw new ApiError(500, 'Failed to generate a unique lot number after 5 attempts.');
  }

  const recDate = canonicalReceivedDate(created);
  const qty = computeLotQuantities(created);
  return json({
    ...created,
    ...lotSource(created),
    receivedDate: recDate.toISOString(),
    receivedKg: qty.quantity,
    allocatedKg: qty.allocatedKg,
    consumedKg: qty.consumedKg,
    availableKg: qty.availableKg,
    operationalStatus: qty.operationalStatus,
  }, 201);
});
