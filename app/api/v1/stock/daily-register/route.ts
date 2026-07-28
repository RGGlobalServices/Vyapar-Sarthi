import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
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

    const [entriesToday, priorEntries, logsToday] = await Promise.all([
      prisma.dailyStockEntry.findMany({ where: { shopId: shop.id, date } }),
      prisma.dailyStockEntry.findMany({
        where: { shopId: shop.id, date: { lt: date } },
        orderBy: { date: 'desc' },
        select: { id: true, productId: true, openingQty: true, receivedQty: true, closingQty: true, date: true },
      }),
      prisma.dailyRegisterLog.findMany({
        where: { shopId: shop.id, date },
        orderBy: { createdAt: 'asc' },
        select: { productId: true, type: true, quantity: true, note: true, createdAt: true },
      }),
    ]);

    const entryByProduct = new Map(entriesToday.map(e => [e.productId, e]));
    const historyByProduct = new Map<string, typeof logsToday>();
    for (const l of logsToday) {
      const list = historyByProduct.get(l.productId) || [];
      list.push(l);
      historyByProduct.set(l.productId, list);
    }

    // Most recent register row before `date`, one per product.
    const lastEntryByProduct = new Map<string, typeof priorEntries[number]>();
    for (const e of priorEntries) {
      if (!lastEntryByProduct.has(e.productId)) lastEntryByProduct.set(e.productId, e);
    }
    const lastEntries = [...lastEntryByProduct.values()];

    // Close is editable and gets saved every time, so a row almost always has
    // a closingQty by the time the next day is viewed — but any Sale that
    // landed *after* that save still needs to count. For each candidate prior
    // row, get its day's total Sale and the Sale since its own last saved
    // Close, so Close can be re-derived to the true end-of-day figure rather
    // than whatever was last typed in.
    const priorSoldByEntryId = new Map<string, { totalSold: number; soldSinceClose: number }>();
    const priorEntryIds = lastEntries.map(e => e.id);
    if (priorEntryIds.length > 0) {
      const rows = await prisma.$queryRaw<{ entry_id: string; total_sold: number; sold_since_close: number }[]>(Prisma.sql`
        SELECT
          dse.id AS entry_id,
          COALESCE(SUM(si.quantity), 0)::float AS total_sold,
          COALESCE(SUM(si.quantity) FILTER (
            WHERE s.created_at > COALESCE(lc.last_close_at, dse.date - interval '1 microsecond')
          ), 0)::float AS sold_since_close
        FROM daily_stock_entries dse
        JOIN sale_items si ON si.product_id = dse.product_id
        JOIN sales s ON s.id = si.sale_id
          AND s.shop_id = dse.shop_id
          AND s.created_at >= dse.date
          AND s.created_at < dse.date + interval '1 day'
        LEFT JOIN LATERAL (
          SELECT MAX(l.created_at) AS last_close_at
          FROM daily_register_logs l
          WHERE l.shop_id = dse.shop_id AND l.product_id = dse.product_id AND l.date = dse.date AND l.type = 'close'
        ) lc ON true
        WHERE dse.id IN (${Prisma.join(priorEntryIds.map(id => Prisma.sql`${id}::uuid`))})
        GROUP BY dse.id
      `);
      for (const r of rows) priorSoldByEntryId.set(r.entry_id, { totalSold: r.total_sold, soldSinceClose: r.sold_since_close });
    }

    const lastCloseByProduct = new Map<string, number>();
    for (const e of lastEntries) {
      const sold = priorSoldByEntryId.get(e.id);
      const priorClose = e.closingQty != null
        ? e.closingQty - (sold?.soldSinceClose || 0)
        : (e.openingQty + e.receivedQty - (sold?.totalSold || 0));
      lastCloseByProduct.set(e.productId, priorClose);
    }

    // Manual Stock In / Stock Out adjustments made from the Stock page (legacy
    // plan) today. Kept per-timestamp, the same way Sale already is, so Stock
    // In bumps Receive (and Close) and Stock Out pulls Close down — live, even
    // after the day's row has already been saved once.
    const stockAdjLogs = shop.subscriptionPlan === 'wholesale'
      ? []
      : await prisma.stockLog.findMany({
          where: { shopId: shop.id, type: { in: ['in', 'out'] }, createdAt: { gte: date, lt: dayEnd } },
          select: { productId: true, type: true, quantity: true, createdAt: true },
        });
    const stockAdjByProduct = new Map<string, { at: Date; type: string; quantity: number }[]>();
    for (const l of stockAdjLogs) {
      if (!l.productId || !l.createdAt || !l.type || l.quantity == null) continue;
      const list = stockAdjByProduct.get(l.productId) || [];
      list.push({ at: l.createdAt, type: l.type, quantity: l.quantity });
      stockAdjByProduct.set(l.productId, list);
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
      for (const [productId, logs] of stockAdjByProduct) {
        const total = logs.filter(l => l.type === 'in').reduce((sum, l) => sum + l.quantity, 0);
        if (total > 0) receivedSuggestions.set(productId, total);
      }
    }

    // Actual quantity billed per product on this date — the authoritative "Sale" figure.
    // Read directly from real billing records (Sale/SaleItem, written for every plan on
    // every bill) rather than derived from a manually-entered closing count, so it always
    // reflects what billing has actually sold, live, whether or not the day's register row
    // has been saved yet. createdAt is kept per sale so Close can tell how much of that
    // Sale happened before vs. after the last saved Close.
    const saleItems = await prisma.saleItem.findMany({
      where: { sale: { shopId: shop.id, createdAt: { gte: date, lt: dayEnd } } },
      select: { productId: true, quantity: true, sale: { select: { createdAt: true } } },
    });
    const billedSoldByProduct = new Map<string, number>();
    const saleItemsByProduct = new Map<string, { at: Date; quantity: number }[]>();
    for (const si of saleItems) {
      if (!si.productId || !si.sale?.createdAt) continue;
      billedSoldByProduct.set(si.productId, (billedSoldByProduct.get(si.productId) || 0) + (si.quantity || 0));
      const list = saleItemsByProduct.get(si.productId) || [];
      list.push({ at: si.sale.createdAt, quantity: si.quantity || 0 });
      saleItemsByProduct.set(si.productId, list);
    }

    const rows = products.map(p => {
      const saved = entryByProduct.get(p.id);
      const adjLogs = stockAdjByProduct.get(p.id) || [];
      // Stock In after the last saved Receive still bumps Receive (and Total)
      // live, the same way Sale already keeps Close live between saves.
      const receiveHistory = (historyByProduct.get(p.id) || []).filter(l => l.type === 'receive');
      const lastReceiveAt = receiveHistory.length > 0 ? receiveHistory[receiveHistory.length - 1].createdAt : null;
      const stockInSinceReceive = adjLogs
        .filter(l => l.type === 'in' && (!lastReceiveAt || l.at > lastReceiveAt))
        .reduce((sum, l) => sum + l.quantity, 0);
      const received = saved ? saved.receivedQty + stockInSinceReceive : (receivedSuggestions.get(p.id) ?? 0);
      const sold = billedSoldByProduct.get(p.id) ?? 0;
      // Bootstrap fallback for a product that has never had a register row at
      // all: currentStock is live, so by the time this is read it may already
      // reflect sales/receives that happened earlier *today* — back those out
      // to recover the actual start-of-day snapshot, instead of using the
      // live figure as-is (which would double-count today's activity).
      const opening = saved
        ? saved.openingQty
        : (lastCloseByProduct.has(p.id)
            ? lastCloseByProduct.get(p.id)!
            : (isToday ? ((p.currentStock ?? 0) - received + sold) : 0));
      const total = opening + received;
      // Close is editable (saved every time, like Opening/Receive), but it
      // still keeps tracking live in between saves: any Sale that lands
      // *after* the last saved Close still pulls it down from there, so it
      // never goes stale just because nobody re-saved the row.
      const savedClosing = saved ? saved.closingQty : null;
      let closing: number;
      if (savedClosing != null) {
        const closeHistory = (historyByProduct.get(p.id) || []).filter(l => l.type === 'close');
        const lastCloseAt = closeHistory.length > 0 ? closeHistory[closeHistory.length - 1].createdAt : null;
        const soldSinceClose = (saleItemsByProduct.get(p.id) || [])
          .filter(si => !lastCloseAt || si.at > lastCloseAt)
          .reduce((sum, si) => sum + si.quantity, 0);
        // Stock In after the last saved Close raises it back up, Stock Out
        // (breakage, loss, manual removal) pulls it down — same live re-baselining
        // Sale already gets.
        const stockInSinceClose = adjLogs
          .filter(l => l.type === 'in' && (!lastCloseAt || l.at > lastCloseAt))
          .reduce((sum, l) => sum + l.quantity, 0);
        const stockOutSinceClose = adjLogs
          .filter(l => l.type === 'out' && (!lastCloseAt || l.at > lastCloseAt))
          .reduce((sum, l) => sum + l.quantity, 0);
        closing = savedClosing - soldSinceClose + stockInSinceClose - stockOutSinceClose;
      } else {
        closing = isToday ? (p.currentStock ?? (total - sold)) : (total - sold);
      }
      const history = (historyByProduct.get(p.id) || []).map(l => ({
        type: l.type,
        quantity: l.quantity,
        note: l.note,
        at: l.createdAt,
      }));
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
        history,
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
    const dayEnd = new Date(date.getTime() + 24 * 60 * 60 * 1000);
    const entries: Array<{ productId: string; openingQty: number; receivedQty: number; closingQty: number | null }> = body.entries || [];

    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ error: 'No entries to save.' }, { status: 400 });
    }

    const productIds = entries.map(e => e.productId);

    // Rows already saved for this product/date — their receivedQty is already
    // reflected in currentStock from a prior save, so re-saving must apply only
    // the *change* since then, not the full figure again.
    const existingEntries = await prisma.dailyStockEntry.findMany({
      where: { shopId: shop.id, date, productId: { in: productIds } },
    });
    const existingByProduct = new Map(existingEntries.map(e => [e.productId, e]));

    // For a product with no prior register row, the "received" figure may just be
    // restating stock a purchase or manual adjustment already added today — pushing
    // it to currentStock again would double it. Recompute the same "already known"
    // suggestion the GET endpoint offers, and only apply the excess above that.
    const newProductIds = productIds.filter(id => !existingByProduct.has(id));
    const alreadyKnownByProduct = new Map<string, number>();
    if (newProductIds.length > 0) {
      if (shop.subscriptionPlan === 'wholesale') {
        const rows = await prisma.stockMovement.groupBy({
          by: ['productId'],
          where: { shopId: shop.id, type: 'purchase', productId: { in: newProductIds }, createdAt: { gte: date, lt: dayEnd } },
          _sum: { quantity: true },
        });
        for (const r of rows) alreadyKnownByProduct.set(r.productId as string, r._sum.quantity || 0);
      } else {
        const rows = await prisma.stockLog.groupBy({
          by: ['productId'],
          where: { shopId: shop.id, type: 'in', productId: { in: newProductIds }, createdAt: { gte: date, lt: dayEnd } },
          _sum: { quantity: true },
        });
        for (const r of rows) if (r.productId) alreadyKnownByProduct.set(r.productId, r._sum.quantity || 0);
      }
    }

    const dateStr = date.toISOString().slice(0, 10);
    const now = new Date();
    const ops: any[] = [];
    const newHistoryByProduct: Record<string, Array<{ type: string; quantity: number; note: string | null; at: string }>> = {};
    for (const e of entries) {
      const opening = Number(e.openingQty) || 0;
      const received = Number(e.receivedQty) || 0;
      const closing = e.closingQty === null || e.closingQty === undefined || e.closingQty === '' as any
        ? null
        : Number(e.closingQty);
      const existing = existingByProduct.get(e.productId);

      ops.push(prisma.dailyStockEntry.upsert({
        where: { shopId_productId_date: { shopId: shop.id, productId: e.productId, date } },
        update: { openingQty: opening, receivedQty: received, closingQty: closing },
        create: { shopId: shop.id, productId: e.productId, date, openingQty: opening, receivedQty: received, closingQty: closing },
      }));

      // Re-saving a row we already applied: the whole delta (up or down) is new intent.
      // First save of a row: only the portion above what's already known/applied counts.
      const stockDelta = existing
        ? received - existing.receivedQty
        : Math.max(0, received - (alreadyKnownByProduct.get(e.productId) || 0));

      if (stockDelta !== 0) {
        ops.push(prisma.product.update({
          where: { id: e.productId },
          data: { currentStock: { increment: stockDelta } },
        }));
        ops.push(prisma.stockLog.create({
          data: {
            shopId: shop.id,
            productId: e.productId,
            type: 'daily_register_receive',
            quantity: Math.abs(stockDelta),
            note: `Daily register (${dateStr}): received ${stockDelta > 0 ? '+' : ''}${stockDelta}`,
          },
        }));
      }

      // Audit trail: one dated/timed row per actual Receive or Close edit, so
      // the register can show exactly when each update was made — separate
      // from DailyStockEntry, which only holds the latest value per day.
      const prevReceived = existing ? existing.receivedQty : 0;
      if (received !== prevReceived) {
        const eventDelta = received - prevReceived;
        const note = `Received ${eventDelta > 0 ? '+' : ''}${eventDelta} (running total ${received})`;
        ops.push(prisma.dailyRegisterLog.create({
          data: {
            shopId: shop.id,
            productId: e.productId,
            date,
            type: 'receive',
            quantity: eventDelta,
            note,
            createdAt: now,
          },
        }));
        (newHistoryByProduct[e.productId] ||= []).push({ type: 'receive', quantity: eventDelta, note, at: now.toISOString() });
      }

      const prevClosing = existing ? existing.closingQty : null;
      if (closing != null && closing !== prevClosing) {
        const note = `Counted stock: ${closing}`;
        ops.push(prisma.dailyRegisterLog.create({
          data: {
            shopId: shop.id,
            productId: e.productId,
            date,
            type: 'close',
            quantity: closing,
            note,
            createdAt: now,
          },
        }));
        (newHistoryByProduct[e.productId] ||= []).push({ type: 'close', quantity: closing, note, at: now.toISOString() });
      }
    }

    await prisma.$transaction(ops);

    return NextResponse.json({ success: true, count: entries.length, newHistoryByProduct });
  } catch (error: any) {
    console.error('[API] Error saving daily stock register:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
