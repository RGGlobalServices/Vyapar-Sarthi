import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  let settings = await prisma.notificationSetting.findUnique({ where: { userId: user.uuid! } });
  if (!settings) {
    settings = await prisma.notificationSetting.create({ data: { userId: user.uuid } });
  }
  return json(settings);
});

export const PATCH = handle(async (req) => {
  const user = await requireUser(req);
  const body = await readBody(req);
  const allowedFields = ['dailySummaryEnabled', 'lowStockAlertEnabled', 'alertTime'];
  const data: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) data[field] = body[field];
  }
  if (Object.keys(data).length === 0) throw new ApiError(400, 'No valid fields provided');
  let settings = await prisma.notificationSetting.findUnique({ where: { userId: user.uuid! } });
  if (!settings) {
    settings = await prisma.notificationSetting.create({ data: { userId: user.uuid, ...data } });
  } else {
    settings = await prisma.notificationSetting.update({ where: { userId: user.uuid! }, data });
  }
  return json(settings);
});
