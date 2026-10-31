import { sendWebPush, type PushPayload } from './push';
import { sendFcmPush, type FcmPayload } from './fcm';

/** Sends to every channel the user has registered — VAPID Web Push
 *  subscriptions (browser/PWA) AND FCM device tokens (web notification
 *  permission via the Firebase SDK, plus the native Android/iOS app). Each
 *  channel is independently a safe no-op if its credentials aren't
 *  configured (see push.ts / fcm.ts) or the user has no registration on
 *  that channel, so call sites don't need to care which channels exist. */
export async function sendPushAll(userId: string, payload: PushPayload & FcmPayload) {
  await Promise.allSettled([
    sendWebPush(userId, payload),
    sendFcmPush(userId, payload),
  ]);
}
