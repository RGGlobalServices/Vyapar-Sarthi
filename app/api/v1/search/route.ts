import { requireShop } from '@/lib/server/auth';
import prisma from '@/lib/server/prisma';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Uses the shared `handle()` wrapper so auth/subscription failures from
// requireShop (401/403) surface with their real status + `{ detail }` shape —
// without it, every error here (including an expired session) fell through to
// a generic 500 with `{ error }`, which the client's 401/403 auto-redirect
// logic doesn't recognize, leaving the user stuck on a raw error instead of
// being sent back to login/billing like every other route.
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() || '';

  if (!q) {
    return json({ products: [], suppliers: [], customers: [] });
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

    // Suppliers — Udyog plan only
    shop.subscriptionPlan === 'wholesale'
      ? prisma.supplier.findMany({
          where: { shopId: shop.id, OR: supplierOr },
          take: 5,
          select: { id: true, name: true, contact: true, mobile: true },
        })
      : Promise.resolve([]),

    // Customers
    prisma.customer.findMany({
      where: { shopId: shop.id, OR: customerOr },
      take: 5,
      select: { id: true, name: true, mobile: true },
    })
  ]);

  return json({ products, suppliers, customers });
});
