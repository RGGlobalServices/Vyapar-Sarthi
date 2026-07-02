import { NextResponse } from 'next/server';
import prisma from '@/lib/server/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // In a real app, you would verify a cron secret here.
  // const authHeader = req.headers.get('authorization');
  // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const shops = await prisma.shop.findMany({
      where: { subscriptionPlan: 'wholesale' }
    });

    let notificationsCreated = 0;

    for (const shop of shops) {
      if (!shop.ownerId) continue;
      const ownerId = shop.ownerId; // Assign to the shop owner

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
            title: { contains: p.name },
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // last 24h
          }
        });
        
        if (!recentNotif) {
          await prisma.userNotification.create({
            data: {
              userId: ownerId,
              title: `Low Stock: ${p.name}`,
              message: `Your stock for ${p.name} has dropped to ${p.currentStock}. Please restock.`,
              notificationType: 'LOW_STOCK',
              isRead: false,
              link: `/products/${p.id}`
            }
          });
          notificationsCreated++;
        }
      }

      // 2. Batch Expiry Alerts (Next 30 days)
      const expiringBatches = await prisma.batch.findMany({
        where: {
          shopId: shop.id,
          quantity: { gt: 0 },
          expiryDate: { lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }
        },
        include: { product: true }
      });

      for (const b of expiringBatches) {
        const recentNotif = await prisma.userNotification.findFirst({
          where: {
            userId: ownerId,
            notificationType: 'BATCH_EXPIRY',
            title: { contains: b.product.name },
            createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // every 7 days
          }
        });

        if (!recentNotif) {
          const daysLeft = Math.ceil((new Date(b.expiryDate!).getTime() - Date.now()) / (1000 * 3600 * 24));
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
    }

    return NextResponse.json({ success: true, notificationsCreated });
  } catch (err: any) {
    console.error('[CRON] Error generating stock alerts:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
