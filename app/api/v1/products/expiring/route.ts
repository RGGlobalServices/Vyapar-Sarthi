import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';
import { startOfDay } from '@/lib/server/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/products/expiring
 *
 * Returns products bucketed by proximity to their expiry date, for the
 * Expiry Management screen. Buckets are cumulative-exclusive:
 *
 *   expired   → expiryDate < today
 *   within30  → 0…30 days
 *   within60  → 31…60 days
 *   within90  → 61…90 days
 *
 * Each product is included in exactly one bucket. Buckets are sorted by
 * daysLeft ascending so the most-urgent row is at the top. Stock value
 * (currentStock × wholesaleCost) is summed per bucket so the shopkeeper
 * can see how much money is tied up in soon-to-expire inventory.
 *
 * Only products with a non-null expiryDate that fall within the 90-day
 * horizon or are already expired appear here — everything else is safe.
 */
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req, { enforceSubscription: false });
  const today = startOfDay();
  const in90 = new Date(today.getTime() + 90 * 86400000);
  // Product.expiryDate is stored as VarChar in YYYY-MM-DD form (see
  // prisma/schema.prisma:213), NOT a DateTime, so string comparison is what
  // Prisma expects here. The 90-day cutoff is an inclusive upper bound —
  // rows further out are safe and skipped.
  const in90Str = in90.toISOString().slice(0, 10);

  const rows = await prisma.product.findMany({
    where: {
      shopId: shop.id,
      OR: [{ archived: false }, { archived: null }],
      AND: [
        { expiryDate: { not: null } },
        { expiryDate: { lte: in90Str } },
      ],
    },
    select: {
      id: true, name: true, category: true, currentStock: true,
      wholesaleCost: true, sellingPrice: true, mrp: true, baseUnit: true,
      batch_number: true, expiryDate: true, barcode: true, brand: true,
    },
    orderBy: { expiryDate: 'asc' },
  });

  // Lot-level expiry: each live lot (stock left) with its own expiry date in the 90-day window. A product that has
  // such lots is listed by its lots only — its product-level date would count the same stock twice.
  const lots = await prisma.batch.findMany({
    where: { shopId: shop.id, quantity: { gt: 0 }, expiryDate: { not: null, lte: in90 }, product: { OR: [{ archived: false }, { archived: null }] } },
    select: {
      id: true, productId: true, batchNumber: true, quantity: true, costPrice: true, sellingPrice: true, expiryDate: true, barcode: true,
      product: { select: { name: true, category: true, wholesaleCost: true, sellingPrice: true, mrp: true, baseUnit: true, brand: true } },
    },
    orderBy: { expiryDate: 'asc' },
  });
  const productsWithLotExpiry = new Set(lots.map((l) => l.productId));
  const lotRows = lots.map((l) => ({
    id: l.id,
    name: `${l.product.name} · Lot ${l.batchNumber || l.id.slice(0, 4).toUpperCase()}`,
    category: l.product.category,
    currentStock: l.quantity,
    wholesaleCost: l.costPrice ?? l.product.wholesaleCost,
    sellingPrice: l.sellingPrice ?? l.product.sellingPrice,
    mrp: l.product.mrp,
    baseUnit: l.product.baseUnit,
    batch_number: l.batchNumber,
    expiryDate: l.expiryDate!.toISOString().slice(0, 10),
    barcode: l.barcode,
    brand: l.product.brand,
  }));

  const allRows: any[] = [...rows.filter((p) => !productsWithLotExpiry.has(p.id)), ...lotRows];
  type Row = typeof allRows[number];
  const withDelta = allRows.map((p: Row) => {
    const exp = new Date(p.expiryDate!);
    // Un-parseable / legacy garbage dates land silently in the "already
    // expired" bucket (daysLeft = -Infinity is clamped by the filters).
    const days = isNaN(exp.getTime())
      ? -9999
      : Math.round((exp.getTime() - today.getTime()) / 86400000);
    const value = (Number(p.currentStock) || 0) * (Number(p.wholesaleCost) || 0);
    return { ...p, daysLeft: days, stockValue: value };
  });

  withDelta.sort((a: any, b: any) => a.daysLeft - b.daysLeft);
  const expired = withDelta.filter(p => p.daysLeft < 0);
  const within30 = withDelta.filter(p => p.daysLeft >= 0 && p.daysLeft <= 30);
  const within60 = withDelta.filter(p => p.daysLeft > 30 && p.daysLeft <= 60);
  const within90 = withDelta.filter(p => p.daysLeft > 60 && p.daysLeft <= 90);

  const sumValue = (arr: { stockValue: number }[]) => arr.reduce((s, p) => s + p.stockValue, 0);
  const sumStock = (arr: { currentStock: number | null }[]) => arr.reduce((s, p) => s + (Number(p.currentStock) || 0), 0);

  return json({
    counts: { expired: expired.length, within30: within30.length, within60: within60.length, within90: within90.length },
    stockValue: { expired: sumValue(expired), within30: sumValue(within30), within60: sumValue(within60), within90: sumValue(within90) },
    stockUnits: { expired: sumStock(expired), within30: sumStock(within30), within60: sumStock(within60), within90: sumStock(within90) },
    expired, within30, within60, within90,
  });
});
