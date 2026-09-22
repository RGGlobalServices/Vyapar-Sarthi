import { NextResponse } from 'next/server';
import { requireShop } from '@/lib/server/auth';
import { assertOwned } from '@/lib/server/ownership';
import { apiErrorResponse, ApiError } from '@/lib/server/http';
import prisma from '@/lib/server/prisma';
import { ensureWholesaleTables } from '@/lib/server/wholesale';
import { ensureGodownTables } from '@/lib/server/godowns';
import { randomUUID } from 'crypto';
import { isMillBillingPackage } from '@/lib/config/packageConfig';
import { checkLargeTransactionAlert } from '@/lib/server/notificationsEngine';
import { applyVariantStockDeltas } from '@/lib/server/variantStock';
import { invalidateDashboardCacheForShop } from '@/lib/server/dashboardCache';
import { withTenantIdempotency } from '@/lib/server/idempotency';


// Bada Udyog: whether a saved purchase's items include a Raw-Material-classed product, and whether it has already been pushed into
// Raw Material (created at save time, or via the retroactive "Add to Raw Material" button) — so the button can read "Already Added"
// instead of the shopkeeper clicking it and hitting an error. Same note-matching convention as POST .../to-raw-material.
async function annotateRawMaterialStatus(shopId: string, invoices: any[]) {
  const millInvoices = invoices.filter((inv) => inv.purchaseItems?.some((it: any) => it.product?.millCategory === 'raw_material'));
  if (millInvoices.length === 0) return invoices.map((inv) => ({ ...inv, hasRawMaterialItems: false, rawMaterialAdded: false }));
  const lots = await (prisma as any).rawMaterialLot.findMany({
    where: { shopId, OR: millInvoices.map((inv: any) => ({ notes: { contains: `Purchase Invoice ${inv.invoiceNumber}` } })) },
    select: { notes: true },
  });
  const addedNumbers = new Set(
    lots.flatMap((l: any) => millInvoices.filter((inv: any) => String(l.notes || '').includes(`Purchase Invoice ${inv.invoiceNumber}`)).map((inv: any) => inv.invoiceNumber)),
  );
  return invoices.map((inv) => {
    const hasRawMaterialItems = inv.purchaseItems?.some((it: any) => it.product?.millCategory === 'raw_material') || false;
    return { ...inv, hasRawMaterialItems, rawMaterialAdded: hasRawMaterialItems && addedNumbers.has(inv.invoiceNumber) };
  });
}

export async function GET(req: Request) {
  try {
    const auth = await requireShop(req);
    await ensureWholesaleTables();

    const url = new URL(req.url);
    const q = url.searchParams.get('q') || '';
    const supplierId = url.searchParams.get('supplierId') || '';
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const pageStr = url.searchParams.get('page');
    const limitStr = url.searchParams.get('limit');
    const paginated = !!(pageStr || limitStr || q || supplierId || from || to);

    const page = pageStr ? parseInt(pageStr, 10) : 1;
    const limit = limitStr ? parseInt(limitStr, 10) : 50;
    const skip = (page - 1) * limit;

    const where: any = { shopId: auth.shop.id };
    if (supplierId) where.supplierId = supplierId;
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(`${to}T23:59:59.999`);
    }
    if (q) {
      where.OR = [
        { invoiceNumber: { contains: q, mode: 'insensitive' } },
        { supplier: { name: { contains: q, mode: 'insensitive' } } },
        { purchaseItems: { some: { product: { name: { contains: q, mode: 'insensitive' } } } } },
      ];
    }

    const [invoices, total] = await Promise.all([
      prisma.purchaseInvoice.findMany({
        where,
        include: {
          supplier: true,
          purchaseItems: {
            include: { product: true, batch: true }
          },
          purchaseReturns: { include: { items: true } },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: paginated ? skip : undefined,
        take: paginated ? limit : 50,
      }),
      paginated ? prisma.purchaseInvoice.count({ where }) : Promise.resolve(0),
    ]);

    const annotated = await annotateRawMaterialStatus(auth.shop.id, invoices);
    if (paginated) {
      return NextResponse.json({ data: annotated, total, page, limit });
    }
    return NextResponse.json(annotated);
  } catch (error: any) {
    console.error('[API] Error fetching purchases:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireShop(req);
    await ensureWholesaleTables();
    await ensureGodownTables();

    const data = await req.json();
    const { supplierId, invoiceNumber: rawInvoiceNumber, date, warehouseId, items, paymentMode, amountPaid } = data;
    // Optional: the completed weighbridge slip this purchase was imported from (Bada Udyog). It is only ever a shortcut — a purchase
    // never needs one — but once used, the slip is marked converted so it cannot ALSO be turned into a second raw material lot.
    const weighbridgeEntryId: string | null = data.weighbridgeEntryId ? String(data.weighbridgeEntryId) : null;

    const idempotencyKey = req.headers.get('x-idempotency-key') || data.idempotencyKey || data.idempotency_key || null;
    const deviceId = req.headers.get('x-device-id') || data.deviceId || data.device_id || null;
    const localId = data.localId || data.local_id || data.localTransactionId || null;
    const offlineRefNumber = data.offlineRefNumber || data.offline_ref_number || null;

    if (!supplierId || !items || items.length === 0) {
      return NextResponse.json({ error: 'Missing required purchase details.' }, { status: 400 });
    }

    // Supplier, warehouse and every product must belong to THIS shop before any
    // read or write — a foreign id would otherwise change another shop's stock,
    // godown quantities or supplier balance.
    await assertOwned(auth.shop.id, {
      supplierId,
      godownId: warehouseId,
      productId: items.map((i: any) => i.productId),
      weighbridgeEntryId,
    });

    const invoiceNumber = (rawInvoiceNumber && String(rawInvoiceNumber).trim())
      || `PUR-${randomUUID().substring(0, 8).toUpperCase()}`;

    const finalAmountPaid = typeof amountPaid === 'number' ? amountPaid : 0;
    const finalPaymentMode = paymentMode || 'Cash';
    const invoiceId = randomUUID();

    let totalCost = 0;
    let totalGst = 0;

    const processedItems = items.map((item: any) => {
      const factor = Number(item.conversionFactor) || 1;
      const baseQuantity = item.quantity * factor;
      const baseCost = item.cost / factor;
      return { ...item, baseQuantity, baseCost };
    });

    for (const item of processedItems) {
      totalCost += item.quantity * item.cost;
      if (item.gst) totalGst += item.gst;
    }

    const purchaseProductIds = [...new Set(processedItems.map((i: any) => i.productId))] as string[];
    const [purchaseProductsInfo, existingBatchCounts] = await Promise.all([
      prisma.product.findMany({ where: { id: { in: purchaseProductIds }, shopId: auth.shop.id }, select: { id: true, barcode: true, sku: true, millCategory: true } }),
      prisma.batch.groupBy({ by: ['productId'], where: { productId: { in: purchaseProductIds }, shopId: auth.shop.id }, _count: { _all: true } }),
    ]);
    const purchaseProductById = new Map(purchaseProductsInfo.map((p) => [p.id, p]));
    const nextBatchSeq = new Map<string, number>(
      existingBatchCounts.map((r) => [r.productId, r._count._all])
    );
    const purchaseDate = date ? new Date(date) : new Date();
    const batchPlan = processedItems.map((item: any) => {
      const seq = (nextBatchSeq.get(item.productId) || 0) + 1;
      nextBatchSeq.set(item.productId, seq);
      const p = purchaseProductById.get(item.productId);
      const codeBase = p?.barcode || p?.sku || item.productId.slice(0, 8);
      return { id: randomUUID(), barcode: `${codeBase}-B${seq}` };
    });

    const idempotencyOutcome = await prisma.$transaction(async (tx) => {
      return await withTenantIdempotency(tx, {
        shopId: auth.shop.id,
        idempotencyKey,
        deviceId,
        entityType: 'purchase',
        localId,
        handler: async () => {
          // 1. Create Invoice
          const invoice = await tx.purchaseInvoice.create({
            data: {
              id: invoiceId,
              shopId: auth.shop.id,
              supplierId,
              invoiceNumber: invoiceNumber || null,
              offlineRefNumber: offlineRefNumber || null,
              date: date ? new Date(date) : new Date(),
              totalCost,
              gst: totalGst,
              ...(data.tareWeightKg != null && data.tareWeightKg !== '' ? { tareWeightKg: Number(data.tareWeightKg) } : {}),
              ...(data.grossWeightKg != null && data.grossWeightKg !== '' ? { grossWeightKg: Number(data.grossWeightKg) } : {}),
            },
          });

          // 2. Insert Batches
          await tx.batch.createMany({
            data: processedItems.map((item: any, i: number) => ({
              id: batchPlan[i].id,
              shopId: auth.shop.id,
              productId: item.productId,
              variantId: item.variantId || null,
              batchNumber: item.batchNumber || null,
              mfgDate: item.mfgDate ? new Date(item.mfgDate) : null,
              expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
              quantity: item.baseQuantity,
              initialQuantity: item.baseQuantity,
              costPrice: item.baseCost,
              sellingPrice: item.sellingPrice != null ? Number(item.sellingPrice) : null,
              purchaseDate,
              barcode: batchPlan[i].barcode,
            }))
          });

          // 3. Purchase Items
          await tx.purchaseItem.createMany({
            data: processedItems.map((item: any, i: number) => ({
              purchaseInvoiceId: invoiceId,
              productId: item.productId,
              variantId: item.variantId || null,
              variantKey: item.variant || null,
              quantity: item.baseQuantity,
              cost: item.baseCost,
              gst: item.gst || 0,
              mrp: item.mrp != null ? Number(item.mrp) : null,
              discountPercent: item.discountPercent != null ? Number(item.discountPercent) : null,
              batchId: batchPlan[i].id,
            }))
          });

          // 4. Stock Movements
          await tx.stockMovement.createMany({
            data: processedItems.map((item: any) => ({
              shopId: auth.shop.id,
              productId: item.productId,
              variantId: item.variantId || null,
              warehouseId,
              type: 'purchase',
              quantity: item.baseQuantity,
              referenceId: invoiceId,
            }))
          });

          // 5. Update Stock
          for (const item of processedItems) {
            if (warehouseId) {
              await tx.godownProduct.upsert({
                where: {
                  godownId_productId: {
                    godownId: warehouseId,
                    productId: item.productId
                  }
                },
                update: { quantity: { increment: item.baseQuantity } },
                create: { godownId: warehouseId, productId: item.productId, quantity: item.baseQuantity }
              });
            }
            await tx.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) + ${item.baseQuantity} WHERE id = ${item.productId}::uuid AND shop_id = ${auth.shop.id}::uuid`;
          }

          // 6. Mill Raw Material Lot if applicable
          let firstLotId: string | null = null;
          // A Bada Udyog purchase line can be pushed to Raw Material explicitly (`addToRawMaterial`); when the flag is absent the product's own
          // category decides, as before. The flag is ignored for every other package.
          const millShop = isMillBillingPackage(auth.shop.packageType);
          const rawItems = processedItems.filter((item: any) => (millShop && typeof item.addToRawMaterial === 'boolean')
            ? item.addToRawMaterial === true
            : purchaseProductById.get(item.productId)?.millCategory === 'raw_material');
          for (let i = 0; i < rawItems.length; i++) {
            const item = rawItems[i];
            const lot = await tx.rawMaterialLot.create({
              data: {
                shopId: auth.shop.id,
                productId: item.productId,
                supplierId,
                lotNumber: `${invoiceNumber}${processedItems.length > 1 ? `-L${i + 1}` : ''}`,
                purchaseDate,
                weightKg: item.baseQuantity,
                ratePerKg: item.baseCost || null,
                totalAmount: Math.round(item.baseQuantity * (item.baseCost || 0) * 100) / 100,
                remainingKg: item.baseQuantity,
                notes: `Auto-created from Purchase Invoice ${invoiceNumber}`,
              },
            });
            if (!firstLotId) firstLotId = lot.id;
          }

          if (weighbridgeEntryId) {
            const used = await tx.weighbridgeEntry.updateMany({
              where: { id: weighbridgeEntryId, shopId: auth.shop.id, status: 'completed' },
              data: { status: 'converted', rawLotId: firstLotId },
            });
            if (used.count === 0) throw new ApiError(409, 'That weighbridge slip is not available (already used, or not completed).', 'WEIGHBRIDGE_SLIP_UNAVAILABLE');
          }

          // 7. Supplier Ledger
          await tx.supplier.update({
            where: { id: supplierId, shopId: auth.shop.id },
            data: { balance: { increment: totalCost - finalAmountPaid } }
          });

          await tx.supplierTransaction.create({
            data: {
              supplierId,
              type: 'purchase',
              amount: totalCost,
              billNumber: invoiceNumber,
              note: `Purchase Invoice: ${invoiceNumber}`,
            }
          });

          // 8. CashBook
          if (finalAmountPaid > 0 && finalPaymentMode.toLowerCase() === 'cash') {
            await tx.cashBook.create({
              data: {
                shopId: auth.shop.id,
                type: 'purchase',
                amount: finalAmountPaid,
                referenceId: invoiceId,
                description: `Payment for Purchase Invoice: ${invoiceNumber || invoiceId}`
              }
            });
          }

          // 9. Variant Stock (atomic inside transaction)
          const variantDeltas = processedItems
            .filter((item: any) => item.variant)
            .map((item: any) => ({ productId: item.productId, variantKey: item.variant, delta: item.baseQuantity }));
          if (variantDeltas.length) {
            await applyVariantStockDeltas(tx, variantDeltas, auth.shop.id);
          }

          // 10. Activity Log
          await tx.activityLog.create({
            data: {
              shopId: auth.shop.id,
              action: 'purchase_added',
              entityId: invoiceId,
              details: { invoice: invoiceNumber || invoiceId, total: totalCost }
            }
          });

          return { serverId: invoice.id, response: invoice };
        }
      });
    }, {
      maxWait: 10000,
      timeout: 25000,
    });

    const invoice = idempotencyOutcome.result;

    if (!idempotencyOutcome.isDuplicate) {
      try {
        prisma.$transaction(async (tx) => {
          await checkLargeTransactionAlert(tx, auth.shop.id, totalCost, 'purchase', invoiceNumber || invoiceId);
        }).catch(() => {});
      } catch(e) {}
    }

    invalidateDashboardCacheForShop(auth.shop.id);
    return NextResponse.json({ success: true, invoice, isDuplicate: idempotencyOutcome.isDuplicate });
  } catch (error: any) {
    const known = apiErrorResponse(error);
    if (known) return known;
    console.error('[API] Error processing purchase:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
