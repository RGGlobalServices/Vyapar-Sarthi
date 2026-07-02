import { NextRequest, NextResponse } from 'next/server';
import { requireShop } from '@/lib/server/auth';
import prisma from '@/lib/server/prisma';

export async function GET(req: NextRequest) {
  try {
    const { shop } = await requireShop(req);
    const { searchParams } = new URL(req.url);
    const start_date = searchParams.get('start_date');
    const end_date = searchParams.get('end_date');

    const where: any = { shopId: shop.id };
    if (start_date || end_date) {
      where.date = {};
      if (start_date) where.date.gte = new Date(start_date);
      if (end_date) where.date.lte = new Date(end_date + 'T23:59:59.999Z');
    }

    const returns = await prisma.materialReturn.findMany({
      where,
      orderBy: { date: 'desc' },
      include: { product: true }
    });

    return NextResponse.json(returns);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { shop } = await requireShop(req);
    const data = await req.json();

    const newReturn = await prisma.materialReturn.create({
      data: {
        shopId: shop.id,
        productId: data.productId || null,
        itemName: data.itemName,
        quantity: data.quantity,
        reason: data.reason,
        amount: data.amount,
        date: data.date ? new Date(data.date) : new Date(),
      }
    });

    // Also adjust stock if linked to a product
    if (data.productId) {
      await prisma.product.update({
        where: { id: data.productId, shopId: shop.id },
        data: { currentStock: { increment: data.quantity } }
      });
      await prisma.stockLog.create({
        data: {
          shopId: shop.id,
          productId: data.productId,
          quantity: data.quantity,
          type: 'in',
          note: `Material Return: ${data.reason}`,
        }
      });
      
      // ERP Feature: Restock to Batch & Stock Movement Logging
      if (shop.subscriptionPlan === 'wholesale') {
        const latestBatch = await prisma.batch.findFirst({
          where: { productId: data.productId, shopId: shop.id },
          orderBy: { createdAt: 'desc' }
        });
        if (latestBatch) {
          await prisma.batch.update({
            where: { id: latestBatch.id },
            data: { quantity: { increment: data.quantity } }
          });
        }
        await prisma.$executeRaw`
          INSERT INTO stock_movements (shop_id, product_id, type, quantity, reference_id, created_at)
          VALUES (${shop.id}::uuid, ${data.productId}::uuid, 'return', ${data.quantity}, ${newReturn.id}::uuid, NOW())
        `;
      }
    }

    return NextResponse.json(newReturn);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
