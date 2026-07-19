import { NextResponse } from 'next/server';
import { requireShop } from '@/lib/server/auth';
import prisma from '@/lib/server/prisma';
import { ensureWholesaleTables } from '@/lib/server/wholesale';
import { ensureGodownTables } from '@/lib/server/godowns';
import { randomUUID } from 'crypto';
import { checkLargeTransactionAlert } from '@/lib/server/notificationsEngine';

export async function GET(req: Request) {
  try {
    const auth = await requireShop(req);
    await ensureWholesaleTables();



    const invoices = await prisma.purchaseInvoice.findMany({
      where: { shopId: auth.shop.id },
      include: {
        supplier: true,
        purchaseItems: {
          include: { product: true }
        }
      },
      orderBy: { date: 'desc' },
      take: 50,
    });

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
    const { supplierId, invoiceNumber, date, warehouseId, items, paymentMode, amountPaid } = data;

    if (!supplierId || !warehouseId || !items || items.length === 0) {
      return NextResponse.json({ error: 'Missing required purchase details.' }, { status: 400 });
    }

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

      // 3. Bulk Insert Items, Batches, and Movements
      prisma.purchaseItem.createMany({
        data: processedItems.map((item: any) => ({
          purchaseInvoiceId: invoiceId,
          productId: item.productId,
          variantId: item.variantId || null,
          quantity: item.baseQuantity,
          cost: item.baseCost,
          gst: item.gst || 0,
        }))
      }),

      prisma.batch.createMany({
        data: processedItems.map((item: any) => ({
          shopId: auth.shop.id,
          productId: item.productId,
          variantId: item.variantId || null,
          batchNumber: item.batchNumber || null,
          mfgDate: item.mfgDate ? new Date(item.mfgDate) : null,
          expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
          quantity: item.baseQuantity,
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
        prisma.godownProduct.upsert({
          where: {
            godownId_productId: {
              godownId: warehouseId,
              productId: item.productId
            }
          },
          update: { quantity: { increment: item.baseQuantity } },
          create: { godownId: warehouseId, productId: item.productId, quantity: item.baseQuantity }
        }),
        prisma.product.update({
          where: { id: item.productId },
          data: { currentStock: { increment: item.baseQuantity } }
        })
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
          note: `Purchase Invoice: ${invoiceNumber || invoiceId}`,
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

    // 8. Notifications Trigger (Outside transaction so it doesn't fail the primary purchase if it errors, but wait, the instructions say "Background helpers that can run safely inside transactions" -> wait, prisma.$transaction(transactionOps) is an array transaction, we can't await functions inside array. 
    // We can just run it after since notification is not strictly mission-critical for database consistency, or we rewrite it as an interactive transaction). Let's run it after.
    try {
      await prisma.$transaction(async (tx) => {
        await checkLargeTransactionAlert(tx, auth.shop.id, totalCost, 'purchase', invoiceNumber || invoiceId);
      });
    } catch(e) { console.error('Notification failed', e); }

    return NextResponse.json({ success: true, invoice });
  } catch (error: any) {
    console.error('[API] Error processing purchase:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
