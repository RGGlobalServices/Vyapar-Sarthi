import { NextResponse } from 'next/server';
import prisma from '@/lib/server/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WARN_AFTER_DAYS = 27;
const PURGE_AFTER_WARN_DAYS = 3;

export async function GET(req: Request) {
  // In a real app, you would verify a cron secret here.
  // const authHeader = req.headers.get('authorization');
  // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const now = Date.now();
    const warnCutoff = new Date(now - WARN_AFTER_DAYS * 24 * 60 * 60 * 1000);
    const purgeCutoff = new Date(now - PURGE_AFTER_WARN_DAYS * 24 * 60 * 60 * 1000);

    let warned = 0;

    // 1. Warn — a record can only ever reach the purge step below once it's
    // been warned here first: the purge query's WHERE clause structurally
    // requires purgeWarnedAt to already be set, so a row can never be
    // permanently deleted without a prior notification having gone out,
    // regardless of how the two steps' timing lines up run to run.
    const toWarn = await prisma.deletedRecord.findMany({
      where: { restoredAt: null, purgeWarnedAt: null, deletedAt: { lte: warnCutoff } },
      select: { id: true, shopId: true },
    });

    if (toWarn.length > 0) {
      const idsByShop = new Map<string, string[]>();
      for (const r of toWarn) {
        if (!idsByShop.has(r.shopId)) idsByShop.set(r.shopId, []);
        idsByShop.get(r.shopId)!.push(r.id);
      }

      const shops = await prisma.shop.findMany({
        where: { id: { in: Array.from(idsByShop.keys()) } },
        select: { id: true, ownerId: true },
      });
      const ownerByShop = new Map(shops.map(s => [s.id, s.ownerId]));

      for (const [shopId, ids] of idsByShop.entries()) {
        const ownerId = ownerByShop.get(shopId);
        if (ownerId) {
          // One batched notification per shop, not one per record — a
          // shopkeeper who bulk-deleted 40 products 27 days ago shouldn't
          // get 40 separate pushes. Dedup on a 24h lookback in case this
          // cron runs more than once a day.
          const recentWarning = await prisma.userNotification.findFirst({
            where: {
              userId: ownerId,
              notificationType: 'PURGE_WARNING',
              createdAt: { gte: new Date(now - 24 * 60 * 60 * 1000) },
            },
          });

          if (!recentWarning) {
            const count = ids.length;
            await prisma.userNotification.create({
              data: {
                userId: ownerId,
                title: 'Items expiring soon in Recycle Bin',
                message: `${count} deleted item${count === 1 ? '' : 's'} in your Recycle Bin will be permanently deleted in ${PURGE_AFTER_WARN_DAYS} days. Restore them now if you need them.`,
                notificationType: 'PURGE_WARNING',
                isRead: false,
                link: '/trash',
              },
            });
          }
        }

        // Stamp every selected row for this shop regardless of whether the
        // notification itself was deduped this run — the purge guarantee
        // depends on purgeWarnedAt being set, not on a notification firing
        // on this exact invocation.
        await prisma.deletedRecord.updateMany({
          where: { id: { in: ids } },
          data: { purgeWarnedAt: new Date() },
        });
        warned += ids.length;
      }
    }

    // 2. Purge — only rows already warned at least PURGE_AFTER_WARN_DAYS ago.
    const purgeResult = await prisma.deletedRecord.deleteMany({
      where: { restoredAt: null, purgeWarnedAt: { not: null, lte: purgeCutoff } },
    });

    return NextResponse.json({ success: true, warned, purged: purgeResult.count });
  } catch (error: any) {
    console.error('[Cron] purge-trash failed:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
