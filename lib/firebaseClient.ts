'use client';

// Web-only FCM registration (browser / PWA). The native Android/iOS app
// uses @capacitor/push-notifications instead — see
// lib/notificationRegistration.ts, which picks the right path.
//
// Needs 6 env vars from Firebase Console → Project Settings → General →
// "Your apps" → Web app (add one if none exists) → the firebaseConfig
// object. These are NEXT_PUBLIC_ (safe to expose — Firebase's web API key
// identifies the project, it does not authorize anything by itself; access
// is still controlled server-side):
//   NEXT_PUBLIC_FIREBASE_API_KEY
//   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
//   NEXT_PUBLIC_FIREBASE_PROJECT_ID
//   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
//   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
//   NEXT_PUBLIC_FIREBASE_APP_ID
// Plus one more, from Project Settings → Cloud Messaging → Web Push
// certificates → "Generate key pair":
//   NEXT_PUBLIC_FIREBASE_VAPID_KEY
// (This is a DIFFERENT VAPID key from the existing NEXT_PUBLIC_VAPID_PUBLIC_KEY
// used by the raw browser Push API in Settings — FCM's web push uses its own.)

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function isFirebaseWebConfigured(): boolean {
  return !!(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.messagingSenderId &&
    firebaseConfig.appId &&
    process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
  );
}

/** Requests notification permission, registers the FCM service worker, and
 *  returns a device token for this browser — or null if Firebase web config
 *  is missing, the browser doesn't support FCM, or permission was denied.
 *  Safe to call unconditionally: every failure path returns null instead of
 *  throwing, matching sendWebPush/sendFcmPush's no-op-when-unconfigured
 *  convention on the server side. */
export async function getWebFcmToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  if (!isFirebaseWebConfigured()) return null;
  if (!('serviceWorker' in navigator)) return null;

  try {
    const { initializeApp, getApps, getApp } = await import('firebase/app');
    const { getMessaging, isSupported, getToken } = await import('firebase/messaging');

    if (!(await isSupported())) return null;

    const app = getApps().length ? getApp() : initializeApp(firebaseConfig as Record<string, string>);
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const messaging = getMessaging(app);

    return await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
  } catch (err) {
    console.error('[FCM web] getWebFcmToken failed:', err);
    return null;
  }
}
