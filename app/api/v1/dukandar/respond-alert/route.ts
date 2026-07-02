import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const { alertId, response } = await readBody(req);
  if (!alertId || !response) throw new ApiError(400, 'alertId and response required');
  if (!['accepted', 'rejected', 'quotation'].includes(response)) {
    throw new ApiError(400, 'Invalid response. Must be accepted, rejected, or quotation');
  }

  const alert = await prisma.dukandarStockAlert.findUnique({ where: { id: alertId } });
  if (!alert) throw new ApiError(404, 'Alert not found');
  if (alert.retailerId !== user.uuid) throw new ApiError(403, 'Unauthorized');
  if (alert.status !== 'pending') throw new ApiError(400, 'Alert already responded');

  await prisma.dukandarStockAlert.update({
    where: { id: alertId },
    data: { status: response, respondedAt: new Date() },
  });

  await prisma.userNotification.create({
    data: {
      userId: alert.wholesalerId,   // recipient = wholesaler
      title: 'Stock Alert Response',
      message: `Your dukandar has ${
        response === 'accepted' ? 'accepted' : response === 'quotation' ? 'requested a quotation for' : 'declined'
      } the stock restock offer.`,
      notificationType: 'dukandar_stock_alert',
      link: `/dukandar`,
    },
  });

  return json({ detail: 'Response recorded', status: response });
});
