import prisma from '@/lib/server/prisma';
import { sendPushAll } from '@/lib/server/pushAll';

// Shared by the standalone /api/v1/cron/daily-summary route and the unified
// /api/v1/cron/tick scheduler (see README "Scheduling").
export async function runDailySummary(opts?: { force?: boolean }): Promise<{ count: number }> {
  const force = !!opts?.force;
  const settings = await prisma.notificationSetting.findMany({
    where: { dailySummaryEnabled: true }
  });

  let count = 0;
  const now = new Date();
  // Yesterday start and end
  const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, -1);
  // The scheduler (see README "Scheduling") hits this hourly, not once a day
  // at a fixed time — alertTime ("HH:MM", IST, set in Settings) is honored
  // here by only firing for users whose chosen hour matches the current
  // server hour. force=true bypasses this for manual testing.
  const currentHourIST = Number(
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(now)
  );

  for (const setting of settings) {
    if (!setting.userId) continue;
    if (!force) {
      const alertHour = Number((setting.alertTime || '08:00').split(':')[0]);
      if (Number.isFinite(alertHour) && alertHour !== currentHourIST) continue;
    }

    const shop = await prisma.shop.findFirst({
      where: { ownerId: setting.userId }
    });
    if (!shop) continue;

    // Calculate yesterday's sales
    const sales = await prisma.sale.aggregate({
      where: {
        shopId: shop.id,
        createdAt: {
          gte: yesterdayStart,
          lte: yesterdayEnd
        }
      },
      _sum: { totalAmount: true }
    });

    // Calculate yesterday's purchases
    const purchases = await prisma.purchaseInvoice.aggregate({
      where: {
        shopId: shop.id,
        date: {
          gte: yesterdayStart,
          lte: yesterdayEnd
        }
      },
      _sum: { totalCost: true }
    });

    const totalSales = Number(sales._sum.totalAmount || 0);
    const totalPurchases = Number(purchases._sum.totalCost || 0);

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

      await sendPushAll(setting.userId, { title, body: message, url: `/dashboard` });
      count++;
    }
  }

  return { count };
}
