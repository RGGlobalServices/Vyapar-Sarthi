import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Registers an FCM device token (web SDK getToken(), or the native
// Capacitor app's PushNotifications 'registration' event) — mirrors
// /api/v1/notifications/subscribe's shape for Web Push subscriptions, but
// an FCM token is a single opaque string shared by every platform, so one
// upsert-by-token is enough (no separate keys object).
export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const { token, platform } = await readBody(req);
  if (!token || typeof token !== 'string') {
    throw new ApiError(400, 'token is required');
  }
  if (platform !== undefined && !['web', 'android', 'ios'].includes(platform)) {
    throw new ApiError(400, "platform must be 'web', 'android', or 'ios'");
  }
  const saved = await prisma.deviceToken.upsert({
    where: { token },
    update: { userId: user.uuid, platform: platform || null },
    create: { userId: user.uuid, token, platform: platform || null },
  });
  return json(saved);
});

// A device token becomes invalid when the app is uninstalled or the
// browser's registration is cleared — let the client proactively drop it
// (e.g. on logout) instead of waiting for the next failed send to prune it.
export const DELETE = handle(async (req) => {
  const user = await requireUser(req);
  const { token } = await readBody(req);
  if (!token || typeof token !== 'string') {
    throw new ApiError(400, 'token is required');
  }
  await prisma.deviceToken.deleteMany({ where: { token, userId: user.uuid } });
  return json({ detail: 'Device token removed' });
});
