import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const { endpoint, keys } = await readBody(req);
  if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
    throw new ApiError(400, 'endpoint, keys.p256dh, and keys.auth are required');
  }
  const subscription = await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { p256dh: keys.p256dh, auth: keys.auth },
    create: { userId: user.uuid, endpoint, p256dh: keys.p256dh, auth: keys.auth },
  });
  return json(subscription);
});
