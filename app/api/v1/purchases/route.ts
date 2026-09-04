import { NextResponse } from 'next/server';
import { requireShop } from '@/lib/server/auth';
import prisma from '@/lib/server/prisma';
import { ensureWholesaleTables } from '@/lib/server/wholesale';
import { ensureGodownTables } from '@/lib/server/godowns';
import { randomUUID } from 'crypto';
import { checkLargeTransactionAlert } from '@/lib/server/notificationsEngine';
import { applyVariantStockDeltas } from '@/lib/server/variantStock';
import { invalidateDashboardCacheForShop } from '@/lib/server/dashboardCache';

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
            // `batch` rides along so the Purchase Details modal can print
            // that lot's own barcode stickers (PROD101-B1) without a second
            // round-trip — the FK was added alongside batch costing.
            include: { product: true, batch: true }
          },
          // Lets the Purchase Details modal / Return button compute
          // per-item "remaining" returnable quantity and a live "Net
          // Payable" without a second round-trip when a row is opened.
          purchaseReturns: { include: { items: true } },
        },
        // date alone ties for same-day invoices (e.g. several imported from
        // the same printed date); createdAt breaks the tie so same-day rows
        // still land most-recently-added-first instead of in a DB-arbitrary order.
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: paginated ? skip : undefined,
        take: paginated ? limit : 50,
      }),
      paginated ? prisma.purchaseInvoice.count({ where }) : Promise.resolve(0),
    ]);

    if (paginated) {
      return NextResponse.json({ data: invoices, total, page, limit });
    }
    // Backwards compatibility for callers (e.g. sidebar prefetch) expecting a plain array.
    return NextResponse.json(invoices);
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

    if (!supplierId || !items || items.length === 0) {
      return NextResponse.json({ error: 'Missing required purchase details.' }, { status: 400 });
    }

    // Auto-generate a professional invoice number when the shopkeeper leaves
    // it blank — same convention Sale.invoice_number already uses (see
    // app/api/v1/billing/route.ts) so purchase and sale documents read
    // consistently. Previously an empty invoiceNumber meant the linked
    // SupplierTransaction's note fell back to the raw internal invoiceId (a
    // UUID), which is what showed up as "Purchase Invoice: 4c0030bc-..." in
    // Payment History — not something a shopkeeper would recognize as a bill number.
    const invoiceNumber = (rawInvoiceNumber && String(rawInvoiceNumber).trim())
      || `PUR-${randomUUID().substring(0, 8).toUpperCase()}`;

    const finalAmountPaid = typeof amountPaid === 'number' ? amountPaid : 0;
    const finalPaymentMode = paymentMode || 'Cash';

    // We use a sequential Array Transaction so the entire process runs in exactly 1 Database Round-Trip.
    const invoiceId = randomUUID();

    // 1. Calculate totals and normalize to base units
    let totalCost = 0;
    let totalGst = 0;

    const processedItems = items.map((item: any) => {
      const factor = Number(item.conversionFactor) || 1;
      const baseQuantity = item.quantity * factor;
      const baseCost = item.cost / factor;
      return { ...item, baseQuantity, baseCost };
    });

    for (const item of processedItems) {
      totalCost += item.quantity * item.cost; // Use original for invoice total
      if (item.gst) totalGst += item.gst;
    }

    // Pre-generate a Batch id + batch-specific scan code per line, BEFORE the
    // transaction, so the sibling purchaseItem.createMany/batch.createMany
    // calls below can cross-reference each other despite neither being able
    // to read the other's generated id back mid-array-transaction. The scan
    // code format (`<product code>-B<n>`) mirrors the spec example
    // ("PROD101-B1") and is purely additive — it never replaces or touches
    // Product.barcode/ProductVariant.barcode, so stickers already printed
    // keep scanning exactly as before.
    const purchaseProductIds = [...new Set(processedItems.map((i: any) => i.productId))] as string[];
    const [purchaseProductsInfo, existingBatchCounts] = await Promise.all([
      prisma.product.findMany({ where: { id: { in: purchaseProductIds } }, select: { id: true, barcode: true, sku: true } }),
      prisma.batch.groupBy({ by: ['productId'], where: { productId: { in: purchaseProductIds } }, _count: { _all: true } }),
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

    const transactionOps = [
      // 2. Create Invoice
      prisma.purchaseInvoice.create({
        data: {
          id: invoiceId,
          shopId: auth.shop.id,
          supplierId,
          invoiceNumber: invoiceNumber || null,
          date: date ? new Date(date) : new Date(),
          totalCost,
          gst: totalGst,
        },
      }),

      // 3. Bulk Insert Batches, Items, and Movements — Batch MUST be created
      // before PurchaseItem, since PurchaseItem.batchId is a real FK to it
      // and this array-transaction executes each op sequentially (a
      // referencing row can't insert before the row it references exists,
      // even within the same transaction).
      prisma.batch.createMany({
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
      }),

      prisma.purchaseItem.createMany({
        data: processedItems.map((item: any, i: number) => ({
          purchaseInvoiceId: invoiceId,
          productId: item.productId,
          variantId: item.variantId || null,
          variantKey: item.variant || null,
          quantity: item.baseQuantity,
          cost: item.baseCost,
          gst: item.gst || 0,
          // Locked in permanently at insert time — never recomputed from the
          // product's current mrp/purchaseDiscountPercent later. Null when
          // this line was entered in Manual cost mode.
          mrp: item.mrp != null ? Number(item.mrp) : null,
          discountPercent: item.discountPercent != null ? Number(item.discountPercent) : null,
          batchId: batchPlan[i].id,
        }))
      }),

      prisma.stockMovement.createMany({
        data: processedItems.map((item: any) => ({
          shopId: auth.shop.id,
          productId: item.productId,
          variantId: item.variantId || null,
          warehouseId,
          type: 'purchase',
          quantity: item.baseQuantity,
          referenceId: invoiceId,
        }))
      }),

      // 4. Update Global Stock and Warehouse Inventory concurrently
      ...processedItems.flatMap((item: any) => [
        // Godowns are an Udyog/Bada Udyog-only concept — warehouseId is null
        // for a Dukan/Vyapar purchase (no godown to assign it to), so skip
        // this write entirely rather than upserting a row with a null
        // godownId. current_stock below still updates either way.
        ...(warehouseId ? [prisma.godownProduct.upsert({
          where: {
            godownId_productId: {
              godownId: warehouseId,
              productId: item.productId
            }
          },
          update: { quantity: { increment: item.baseQuantity } },
          create: { godownId: warehouseId, productId: item.productId, quantity: item.baseQuantity }
        })] : []),
        // currentStock has no DB default and is often NULL for products that
        // never had an opening stock set — a plain Prisma `increment` runs as
        // SQL `current_stock + N`, and NULL + N is NULL, so the stock silently
        // never moves. COALESCE it to 0 first (same fix already used in
        // stock/adjust/route.ts).
        prisma.$executeRaw`UPDATE products SET current_stock = COALESCE(current_stock, 0) + ${item.baseQuantity} WHERE id = ${item.productId}::uuid`
      ]),

      // 5. Update Supplier Ledger
      prisma.supplier.update({
        where: { id: supplierId },
        data: { balance: { increment: totalCost - finalAmountPaid } }
      }),
      prisma.supplierTransaction.create({
        data: {
          supplierId,
          type: 'purchase',
          amount: totalCost,
          billNumber: invoiceNumber,
          note: `Purchase Invoice: ${invoiceNumber}`,
        }
      }),

      // 6. CashBook Entry (if payment made)
      ...(finalAmountPaid > 0 && finalPaymentMode.toLowerCase() === 'cash' ? [
        prisma.cashBook.create({
          data: {
            shopId: auth.shop.id,
            type: 'purchase',
            amount: finalAmountPaid,
            referenceId: invoiceId,
            description: `Payment for Purchase Invoice: ${invoiceNumber || invoiceId}`
          }
        })
      ] : []),

      // 7. Activity Log
      prisma.activityLog.create({
        data: {
          shopId: auth.shop.id,
          action: 'purchase_added',
          entityId: invoiceId,
          details: { invoice: invoiceNumber || invoiceId, total: totalCost }
        }
      })
    ];

    const results = await prisma.$transaction(transactionOps);
    const invoice = results[0];

    // 8. Per-variant stock breakdown (Udyog colour/size rows in
    // Product.variants[]) — best-effort, after the critical transaction
    // above has already committed the flat currentStock/godown totals.
    try {
      await applyVariantStockDeltas(
        prisma,
        processedItems
          .filter((item: any) => item.variant)
          .map((item: any) => ({ productId: item.productId, variantKey: item.variant, delta: item.baseQuantity }))
      );
    } catch (e) { console.error('Variant stock update failed:', e); }

    // 9. Notifications Trigger (Outside transaction so it doesn't fail the primary purchase if it errors, but wait, the instructions say "Background helpers that can run safely inside transactions" -> wait, prisma.$transaction(transactionOps) is an array transaction, we can't await functions inside array. 
    // We can just run it after since notification is not strictly mission-critical for database consistency, or we rewrite it as an interactive transaction). Let's run it after.
    try {
      await prisma.$transaction(async (tx) => {
        await checkLargeTransactionAlert(tx, auth.shop.id, totalCost, 'purchase', invoiceNumber || invoiceId);
      });
    } catch(e) { console.error('Notification failed', e); }

    invalidateDashboardCacheForShop(auth.shop.id);
    return NextResponse.json({ success: true, invoice });
  } catch (error: any) {
    console.error('[API] Error processing purchase:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
