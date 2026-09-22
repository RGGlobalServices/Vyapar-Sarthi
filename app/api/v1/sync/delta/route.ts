import { NextResponse } from 'next/server';
import { requireShop } from '@/lib/server/auth';
import prisma from '@/lib/server/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const auth = await requireShop(req);
    const shopId = auth.shop.id;

    const url = new URL(req.url);
    const sinceParam = url.searchParams.get('since');
    const sinceDate = sinceParam ? new Date(sinceParam) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [products, customers, suppliers, recentSales, recentPurchases] = await Promise.all([
      prisma.product.findMany({
        where: { shopId },
      }),
      prisma.customer.findMany({
        where: { shopId },
        include: {
          customer_transactions: {
            where: { created_at: { gte: sinceDate } },
            orderBy: { created_at: 'desc' },
            take: 20,
          },
        },
      }),
      prisma.supplier.findMany({
        where: { shopId },
        include: {
          supplierTransactions: {
            where: { createdAt: { gte: sinceDate } },
            orderBy: { createdAt: 'desc' },
            take: 20,
          },
        },
      }),
      prisma.sale.findMany({
        where: {
          shopId,
          createdAt: { gte: sinceDate },
        },
        include: {
          items: true,
          customer: { select: { name: true, mobile: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.purchaseInvoice.findMany({
        where: {
          shopId,
          createdAt: { gte: sinceDate },
        },
        include: {
          supplier: true,
          purchaseItems: { include: { product: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      shopId,
      products,
      customers,
      suppliers,
      sales: recentSales,
      purchases: recentPurchases,
    });
  } catch (error: any) {
    console.error('[API] Error in sync delta:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
