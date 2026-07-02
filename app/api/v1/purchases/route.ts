import { NextResponse } from 'next/server';
import { requireShop } from '@/lib/server/auth';
import prisma from '@/lib/server/prisma';
import { ensureWholesaleTables } from '@/lib/server/wholesale';
import { ensureGodownTables } from '@/lib/server/godowns';
import { randomUUID } from 'crypto';

export async function GET(req: Request) {
  try {
    const auth = await requireShop(req);
    await ensureWholesaleTables();

    if (auth.shop.subscriptionPlan !== 'wholesale') {
      return NextResponse.json({ error: 'This feature is only available on the Udyog plan.' }, { status: 403 });
    }

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

    if (auth.shop.subscriptionPlan !== 'wholesale') {
      return NextResponse.json({ error: 'This feature is only available on the Udyog plan.' }, { status: 403 });
    }

    const data = await req.json();
    const { supplierId, invoiceNumber, date, warehouseId, items } = data;

    if (!supplierId || !warehouseId || !items || items.length === 0) {
      return NextResponse.json({ error: 'Missing required purchase details.' }, { status: 400 });
    }

    // We use a sequential Array Transaction so the entire process runs in exactly 1 Database Round-Trip.
    const invoiceId = randomUUID();

    // 1. Calculate totals
    let totalCost = 0;
    let totalGst = 0;

    for (const item of items) {
      totalCost += item.quantity * item.cost;
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
        data: items.map((item: any) => ({
          purchaseInvoiceId: invoiceId,
          productId: item.productId,
          variantId: item.variantId || null,
          quantity: item.quantity,
          cost: item.cost,
          gst: item.gst || 0,
        }))
      }),

      prisma.batch.createMany({
        data: items.map((item: any) => ({
          shopId: auth.shop.id,
          productId: item.productId,
          variantId: item.variantId || null,
          batchNumber: item.batchNumber || null,
          mfgDate: item.mfgDate ? new Date(item.mfgDate) : null,
          expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
          quantity: item.quantity,
        }))
      }),

      prisma.stockMovement.createMany({
        data: items.map((item: any) => ({
          shopId: auth.shop.id,
          productId: item.productId,
          variantId: item.variantId || null,
          warehouseId,
          type: 'purchase',
          quantity: item.quantity,
          referenceId: invoiceId,
        }))
      }),

      // 4. Update Global Stock and Warehouse Inventory concurrently
      ...items.flatMap((item: any) => [
        prisma.godownProduct.upsert({
          where: {
            godownId_productId: {
              godownId: warehouseId,
              productId: item.productId
            }
          },
          update: { quantity: { increment: item.quantity } },
          create: { godownId: warehouseId, productId: item.productId, quantity: item.quantity }
        }),
        prisma.product.update({
          where: { id: item.productId },
          data: { currentStock: { increment: item.quantity } }
        })
      ])
    ];

    const results = await prisma.$transaction(transactionOps);
    const invoice = results[0];

    return NextResponse.json({ success: true, invoice });
  } catch (error: any) {
    console.error('[API] Error processing purchase:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
