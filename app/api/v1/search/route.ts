import { NextResponse } from 'next/server';
import { requireShop } from '@/lib/server/auth';
import prisma from '@/lib/server/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { shop } = await requireShop(req);
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim() || '';

    if (!q) {
      return NextResponse.json({ products: [], suppliers: [], customers: [] });
    }

    const isNumeric = /^\d+$/.test(q);
    
    // Build optimized OR conditions to prevent full-table sequential scans
    // Multiple ILIKE (contains/mode:insensitive) conditions are extremely slow.
    const productOr: any[] = [{ name: { contains: q, mode: 'insensitive' } }];
    if (isNumeric) productOr.push({ barcode: { startsWith: q } });

    const supplierOr: any[] = [{ name: { contains: q, mode: 'insensitive' } }];
    if (isNumeric) supplierOr.push({ mobile: { startsWith: q } });
    else supplierOr.push({ gst: { startsWith: q, mode: 'insensitive' } });

    const customerOr: any[] = [{ name: { contains: q, mode: 'insensitive' } }];
    if (isNumeric) customerOr.push({ mobile: { startsWith: q } });

    const [products, suppliers, customers] = await Promise.all([
      // Products
      prisma.product.findMany({
        where: { shopId: shop.id, OR: productOr },
        take: 5,
        select: { id: true, name: true, barcode: true, sellingPrice: true },
      }),
      
      // Suppliers
      prisma.supplier.findMany({
        where: { shopId: shop.id, OR: supplierOr },
        take: 5,
        select: { id: true, name: true, contact: true, mobile: true },
      }),

      // Customers
      prisma.customer.findMany({
        where: { shopId: shop.id, OR: customerOr },
        take: 5,
        select: { id: true, name: true, mobile: true },
      })
    ]);

    return NextResponse.json({ products, suppliers, customers });
  } catch (error: any) {
    console.error('[API] Error in global search:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
