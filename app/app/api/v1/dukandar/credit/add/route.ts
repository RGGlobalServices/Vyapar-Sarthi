import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const { retailerId, amount, description, items, dueDate } = await readBody(req);
  if (!retailerId || !amount) throw new ApiError(400, 'retailerId and amount required');

  const relationship = await prisma.dukandarRelationship.findFirst({
    where: { wholesalerId: user.uuid, retailerId, status: 'active' },
  });
  if (!relationship) throw new ApiError(404, 'Dukandar relationship not found');

  const credit = await prisma.dukandarCredit.create({
    data: {
      relationshipId: relationship.id,
      wholesalerId: user.uuid,
      retailerId,
      amount: parseFloat(amount),
      description: description || '',
      items: items ? JSON.stringify(items) : '[]',
      dueDate: dueDate ? new Date(dueDate) : null,
    },
  });

  await prisma.userNotification.create({
    data: {
      userId: retailerId,
      title: 'New Credit Added',
      message: `Wholesaler added a credit of ₹${parseFloat(amount).toLocaleString('en-IN')} to your account.`,
      notificationType: 'dukandar_credit',
      link: '/dukandar-credit',
    },
  });

  return json({ detail: 'Credit added', creditId: credit.id });
});
