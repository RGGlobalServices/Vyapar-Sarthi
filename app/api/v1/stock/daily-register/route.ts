import { NextResponse } from 'next/server';
import { requireShop } from '@/lib/server/auth';
import prisma from '@/lib/server/prisma';

function parseDateParam(raw: string | null): Date {
  const s = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : new Date().toISOString().slice(0, 10);
  return new Date(`${s}T00:00:00.000Z`);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  try {
    const { shop } = await requireShop(req, { enforceSubscription: false });
    const url = new URL(req.url);
    const dateParam = url.searchParams.get('date');
    const date = parseDateParam(dateParam);
    const dateStr = date.toISOString().slice(0, 10);
    const isToday = dateStr === todayStr();
    const dayEnd = new Date(date.getTime() + 24 * 60 * 60 * 1000);

    const products = await prisma.product.findMany({
      where: { shopId: shop.id, OR: [{ archived: false }, { archived: null }] },
      select: { id: true, name: true, category: true, baseUnit: true, sellingPrice: true, currentStock: true },
      orderBy: { name: 'asc' },
    });

    const [entriesToday, priorEntries] = await Promise.all([
      prisma.dailyStockEntry.findMany({ where: { shopId: shop.id, date } }),
      prisma.dailyStockEntry.findMany({
        where: { shopId: shop.id, date: { lt: date }, closingQty: { not: null } },
        orderBy: { date: 'desc' },
        select: { productId: true, closingQty: true, date: true },
      }),
    ]);

    const entryByProduct = new Map(entriesToday.map(e => [e.productId, e]));
    const lastCloseByProduct = new Map<string, number>();
    for (const e of priorEntries) {
      if (!lastCloseByProduct.has(e.productId)) lastCloseByProduct.set(e.productId, e.closingQty ?? 0);
    }

    // Suggested "received today" — best-effort, editable by the user.
    const receivedSuggestions = new Map<string, number>();
    if (shop.subscriptionPlan === 'wholesale') {
      const rows = await prisma.stockMovement.groupBy({
        by: ['productId'],
        where: { shopId: shop.id, type: 'purchase', createdAt: { gte: date, lt: dayEnd } },
        _sum: { quantity: true },
      });
      for (const r of rows) receivedSuggestions.set(r.productId as string, r._sum.quantity || 0);
    } else {
      const rows = await prisma.stockLog.groupBy({
        by: ['productId'],
        where: { shopId: shop.id, quantity: { gt: 0 }, createdAt: { gte: date, lt: dayEnd } },
        _sum: { quantity: true },
      });
      for (const r of rows) if (r.productId) receivedSuggestions.set(r.productId, r._sum.quantity || 0);
    }

    // Actual quantity billed per product on this date — the authoritative "Sale" figure.
    // Read directly from real billing records (Sale/SaleItem, written for every plan on
    // every bill) rather than derived from a manually-entered closing count, so it always
    // reflects what billing has actually sold, live, whether or not the day's register row
    // has been saved yet.
    const saleItems = await prisma.saleItem.findMany({
      where: { sale: { shopId: shop.id, createdAt: { gte: date, lt: dayEnd } } },
      select: { productId: true, quantity: true },
    });
    const billedSoldByProduct = new Map<string, number>();
    for (const si of saleItems) {
      if (!si.productId) continue;
      billedSoldByProduct.set(si.productId, (billedSoldByProduct.get(si.productId) || 0) + (si.quantity || 0));
    }

    const rows = products.map(p => {
      const saved = entryByProduct.get(p.id);
      const opening = saved ? saved.openingQty : (lastCloseByProduct.get(p.id) ?? (isToday ? (p.currentStock ?? 0) : 0));
      const received = saved ? saved.receivedQty : (receivedSuggestions.get(p.id) ?? 0);
      const total = opening + received;
      const sold = billedSoldByProduct.get(p.id) ?? 0;
      const closing = saved
        ? saved.closingQty
        : (isToday ? (p.currentStock ?? (total - sold)) : (total - sold));
      return {
        productId: p.id,
        name: p.name,
        category: p.category,
        unit: p.baseUnit,
        rate: p.sellingPrice,
        opening,
        received,
        total,
        closing,
        sold,
        saved: !!saved,
      };
    });

    return NextResponse.json({ date: dateStr, rows });
  } catch (error: any) {
    console.error('[API] Error fetching daily stock register:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { shop } = await requireShop(req, { enforceSubscription: false });
    const body = await req.json();
    const date = parseDateParam(body.date);
    const entries: Array<{ productId: string; openingQty: number; receivedQty: number; closingQty: number | null }> = body.entries || [];

    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ error: 'No entries to save.' }, { status: 400 });
    }

    const saved = await prisma.$transaction(entries.map(e => {
      const opening = Number(e.openingQty) || 0;
      const received = Number(e.receivedQty) || 0;
      const closing = e.closingQty === null || e.closingQty === undefined || e.closingQty === '' as any
        ? null
        : Number(e.closingQty);
      const soldQty = closing != null ? opening + received - closing : null;

      return prisma.dailyStockEntry.upsert({
        where: { shopId_productId_date: { shopId: shop.id, productId: e.productId, date } },
        update: { openingQty: opening, receivedQty: received, closingQty: closing, soldQty },
        create: { shopId: shop.id, productId: e.productId, date, openingQty: opening, receivedQty: received, closingQty: closing, soldQty },
      });
    }));

    return NextResponse.json({ success: true, count: saved.length });
  } catch (error: any) {
    console.error('[API] Error saving daily stock register:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
