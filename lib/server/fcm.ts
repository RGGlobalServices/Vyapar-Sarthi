import prisma from './prisma';
import { initializeApp, getApps, getApp, cert, type App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

// Mirrors lib/server/push.ts's safe-no-op pattern exactly: without a
// configured service account this silently skips (logs once) rather than
// throwing, so every caller (stockAlerts, dailySummary) can call
// sendFcmPush unconditionally alongside sendWebPush and nothing breaks
// before Firebase credentials exist.
//
// Needs three env vars from the Firebase service account JSON (Firebase
// Console → Project Settings → Service Accounts → Generate new private key):
//   FIREBASE_PROJECT_ID
//   FIREBASE_CLIENT_EMAIL
//   FIREBASE_PRIVATE_KEY   (keep the literal \n escapes — see below)
let cachedApp: App | null | undefined;

function getAdminApp(): App | null {
  if (cachedApp !== undefined) return cachedApp;

  const projectId = process.env.FIREBASE_PROJECT_ID || '';
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || '';
  // The JSON file's private_key has real newlines; most hosts' env var UIs
  // can't store those, so it's normally pasted with literal "\n" sequences
  // and unescaped back to real newlines here.
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    console.warn('[FCM] Firebase service account not configured, skipping push');
    cachedApp = null;
    return null;
  }

  cachedApp = getApps().length ? getApp() : initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  return cachedApp;
}

export interface FcmPayload {
  title: string;
  body: string;
  url?: string;
}

/** Sends to every device token the user has registered (web + Android + iOS
 *  all share one DeviceToken table — see prisma schema). Stale/unregistered
 *  tokens are pruned automatically, same as sendWebPush does for expired
 *  Web Push subscriptions. */
export async function sendFcmPush(userId: string, payload: FcmPayload) {
  const app = getAdminApp();
  if (!app) return;

  const tokens = await prisma.deviceToken.findMany({ where: { userId } });
  if (tokens.length === 0) return;

  const staleTokens: string[] = [];

  try {
    const res = await getMessaging(app).sendEachForMulticast({
      notification: { title: payload.title, body: payload.body },
      data: { url: payload.url || '/' },
      tokens: tokens.map((t) => t.token),
    });
    res.responses.forEach((r, i) => {
      if (r.success) return;
      const code = r.error?.code;
      if (code === 'messaging/invalid-registration-token' || code === 'messaging/registration-token-not-registered') {
        staleTokens.push(tokens[i].token);
      } else {
        console.error('[FCM] Failed to send to', tokens[i].token, r.error);
      }
    });
  } catch (err) {
    console.error('[FCM] sendEachForMulticast failed:', err);
  }

  if (staleTokens.length > 0) {
    await prisma.deviceToken.deleteMany({ where: { token: { in: staleTokens } } });
  }
}
