import { NextResponse } from 'next/server';
import prisma from '@/lib/server/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // In a real app, you would verify a cron secret here.
  // const authHeader = req.headers.get('authorization');
  // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // Scan every shop (was previously gated to `subscriptionPlan='wholesale'`
    // which excluded Dukan / Vyapar / agrostore / medical shops from receiving
    // any low-stock or expiry alerts — the ones who need them most).
    const shops = await prisma.shop.findMany();

    let notificationsCreated = 0;
    const now = Date.now();
    const in30 = new Date(now + 30 * 24 * 60 * 60 * 1000);
    // Product.expiryDate is stored as VarChar YYYY-MM-DD (see prisma schema),
    // so string comparison is what the filter expects — same convention as the
    // /products/expiring endpoint from Phase 2.
    const in30Str = in30.toISOString().slice(0, 10);
    const todayStr = new Date(now).toISOString().slice(0, 10);

    for (const shop of shops) {
      if (!shop.ownerId) continue;
      const ownerId = shop.ownerId as string; // Assign to the shop owner

      // 1. Low Stock Alerts
      const lowStockProducts = await prisma.product.findMany({
        where: {
          shopId: shop.id,
          currentStock: { lte: prisma.product.fields.minStock },
          minStock: { gt: 0 }
        }
      });

      for (const p of lowStockProducts) {
        // Prevent spam: check if notified recently
        const recentNotif = await prisma.userNotification.findFirst({
          where: {
            userId: ownerId,
            notificationType: 'LOW_STOCK',
            title: { contains: p.name || '' },
            createdAt: { gte: new Date(now - 24 * 60 * 60 * 1000) } // last 24h
          }
        });

        if (!recentNotif) {
          await prisma.userNotification.create({
            data: {
              userId: ownerId,
              title: `Low Stock: ${p.name || 'Product'}`,
              message: `Your stock for ${p.name || 'this product'} has dropped to ${p.currentStock}. Please restock.`,
              notificationType: 'LOW_STOCK',
              isRead: false,
              link: `/products/${p.id}`
            }
          });
          notificationsCreated++;
        }
      }

      // 2. Batch Expiry Alerts (Next 30 days) — for shops using the Batch model
      const expiringBatches = await prisma.batch.findMany({
        where: {
          shopId: shop.id,
          quantity: { gt: 0 },
          expiryDate: { lte: in30 }
        },
        include: { product: true }
      });

      for (const b of expiringBatches) {
        const recentNotif = await prisma.userNotification.findFirst({
          where: {
            userId: ownerId,
            notificationType: 'BATCH_EXPIRY',
            title: { contains: b.product?.name || '' },
            createdAt: { gte: new Date(now - 7 * 24 * 60 * 60 * 1000) } // every 7 days
          }
        });

        if (!recentNotif) {
          const daysLeft = Math.ceil((new Date(b.expiryDate!).getTime() - now) / (1000 * 3600 * 24));
          await prisma.userNotification.create({
            data: {
              userId: ownerId,
              title: `Expiring Soon: ${b.product.name}`,
              message: `Batch ${b.batchNumber || 'Unknown'} is expiring in ${daysLeft} days. Quantity left: ${b.quantity}.`,
              notificationType: 'BATCH_EXPIRY',
              isRead: false,
              link: `/stock`
            }
          });
          notificationsCreated++;
        }
      }

      // 3. Product-level Expiry Alerts — the Batch path above only fires for
      // shops that populated the Batch table. Agro / medical / cosmetics /
      // kirana shops usually track expiry directly on Product.expiryDate, so
      // that model was silently invisible to the cron. Scan both 'expired'
      // and 'within 30 days' buckets, using two separate notification types
      // so the "expiring soon" reminder doesn't suppress a fresh "expired"
      // alert on the same product.
      const productsWithExpiry = await prisma.product.findMany({
        where: {
          shopId: shop.id,
          currentStock: { gt: 0 },
          OR: [{ archived: false }, { archived: null }],
          AND: [
            { expiryDate: { not: null } },
            { expiryDate: { lte: in30Str } },
          ],
        },
        select: { id: true, name: true, expiryDate: true, currentStock: true, batch_number: true, baseUnit: true },
      });

      for (const p of productsWithExpiry) {
        if (!p.expiryDate) continue;
        const isExpired = p.expiryDate < todayStr;
        const notifType = isExpired ? 'PRODUCT_EXPIRED' : 'PRODUCT_EXPIRING';
        // Expired alerts fire once every 24h (louder — needs pulling off shelf);
        // expiring-soon fires once per 7 days (quieter — planning horizon).
        const dedupeWindowMs = isExpired ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;

        const recentNotif = await prisma.userNotification.findFirst({
          where: {
            userId: ownerId,
            notificationType: notifType,
            title: { contains: p.name || '' },
            createdAt: { gte: new Date(now - dedupeWindowMs) },
          },
        });
        if (recentNotif) continue;

        const daysDiff = Math.round((new Date(p.expiryDate).getTime() - now) / (1000 * 3600 * 24));
        const batchSuffix = p.batch_number ? ` (Batch: ${p.batch_number})` : '';
        const stockLabel = `${Number(p.currentStock) || 0} ${p.baseUnit || 'units'}`;
        await prisma.userNotification.create({
          data: {
            userId: ownerId,
            title: isExpired
              ? `Expired: ${p.name || 'Product'}`
              : `Expiring in ${daysDiff}d: ${p.name || 'Product'}`,
            message: isExpired
              ? `${p.name || 'Product'}${batchSuffix} expired ${Math.abs(daysDiff)} days ago. ${stockLabel} still in stock — pull from shelves.`
              : `${p.name || 'Product'}${batchSuffix} expires in ${daysDiff} days. ${stockLabel} in stock — plan a promotion or return to supplier.`,
            notificationType: notifType,
            isRead: false,
            link: `/expiry`,
          },
        });
        notificationsCreated++;
      }
    }

    return NextResponse.json({ success: true, notificationsCreated });
  } catch (err: any) {
    console.error('[CRON] Error generating stock alerts:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
