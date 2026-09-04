import { NextResponse } from 'next/server';
import { requireShop } from '@/lib/server/auth';
import prisma from '@/lib/server/prisma';
import { isWholesaleTierPackage } from '@/lib/config/packageConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { shop } = await requireShop(req);

    if (!isWholesaleTierPackage(shop.subscriptionPlan)) {
      return NextResponse.json({ error: 'Udyog Plan Required' }, { status: 403 });
    }

    // Run queries concurrently for fast loading
    const [valuation, expiry, purchases, sales] = await Promise.all([
      // Stock Valuation. costPrice is the real per-unit cost on wholesale-tier
      // shops (Udyog/Bada Udyog) — wholesaleCost is repurposed there as the
      // wholesale SELLING price, not cost (see memory: udyog-three-tier-pricing;
      // same convention app/api/v1/billing/route.ts's cost-basis resolution
      // follows). wholesaleCost is kept as a fallback for older products saved
      // before the 3-tier pricing split, where costPrice may still be null.
      prisma.product.findMany({
        where: { shopId: shop.id, currentStock: { gt: 0 } },
        select: { id: true, name: true, barcode: true, currentStock: true, costPrice: true, wholesaleCost: true },
        orderBy: { currentStock: 'desc' },
      }),

      // Expiry Report
      prisma.batch.findMany({
        where: { shopId: shop.id, quantity: { gt: 0 } },
        include: { product: { select: { name: true } } },
        orderBy: { expiryDate: 'asc' },
      }),

      // Purchase Report
      prisma.purchaseInvoice.findMany({
        where: { shopId: shop.id },
        include: { supplier: { select: { name: true } } },
        orderBy: { date: 'desc' },
        take: 100, // Limit to recent 100 for fast UI
      }),

      // Sales Report
      prisma.sale.findMany({
        where: { shopId: shop.id },
        select: { id: true, createdAt: true, invoice_number: true, totalAmount: true, totalProfit: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
    ]);

    return NextResponse.json({ valuation, expiry, purchases, sales });
  } catch (err: any) {
    console.error('[API] Error fetching wholesale reports:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
