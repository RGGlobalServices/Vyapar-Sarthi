import { NextResponse } from 'next/server';
import prisma from '@/lib/server/prisma';
import { sendWebPush } from '@/lib/server/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const settings = await prisma.notificationSetting.findMany({
      where: { dailySummaryEnabled: true }
    });

    let count = 0;
    const now = new Date();
    // Yesterday start and end
    const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, -1);

    for (const setting of settings) {
      if (!setting.userId) continue;

      const shop = await prisma.shop.findFirst({
        where: { ownerId: setting.userId }
      });
      if (!shop) continue;

      // Calculate yesterday's sales
      const sales = await prisma.sale.aggregate({
        where: {
          shopId: shop.id,
          date: {
            gte: yesterdayStart,
            lte: yesterdayEnd
          }
        },
        _sum: { totalAmount: true }
      });

      // Calculate yesterday's purchases
      const purchases = await prisma.purchase.aggregate({
        where: {
          shopId: shop.id,
          date: {
            gte: yesterdayStart,
            lte: yesterdayEnd
          }
        },
        _sum: { totalAmount: true }
      });

      const totalSales = Number(sales._sum.totalAmount || 0);
      const totalPurchases = Number(purchases._sum.totalAmount || 0);

      if (totalSales > 0 || totalPurchases > 0) {
        const title = `Yesterday's Summary`;
        const message = `Sales: ₹${totalSales.toFixed(2)} | Purchases: ₹${totalPurchases.toFixed(2)}. Open app for full report.`;

        await prisma.userNotification.create({
          data: {
            userId: setting.userId,
            title,
            message,
            notificationType: 'DAILY_SUMMARY',
            isRead: false,
            link: `/dashboard`
          }
        });

        await sendWebPush(setting.userId, { title, body: message, url: `/dashboard` });
        count++;
      }
    }

    return NextResponse.json({ success: true, count });
  } catch (err: any) {
    console.error('[CRON] Error generating daily summaries:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
