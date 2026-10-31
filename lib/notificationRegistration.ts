'use client';

import { Capacitor } from '@capacitor/core';
import api from '@/lib/api';
import { getWebFcmToken } from '@/lib/firebaseClient';

export interface RegisterResult {
  ok: boolean;
  error?: string;
}

/**
 * Registers this device for push notifications and saves its FCM token on
 * the server (see POST /api/v1/notifications/device-token), picking the
 * right path for the platform:
 *   - Native Android/iOS app (Capacitor): @capacitor/push-notifications,
 *     backed by the Firebase project already wired into the Android build
 *     (android/app/google-services.json + the Gradle google-services
 *     plugin) — this is what actually delivers notifications while the app
 *     is closed, which Web Push inside the app's WebView cannot do
 *     reliably.
 *   - Browser/PWA: the Firebase JS SDK (lib/firebaseClient.ts), alongside
 *     the existing raw VAPID Web Push subscription in Settings — both
 *     channels are independent and both get tried by the server
 *     (lib/server/pushAll.ts).
 *
 * Every failure path returns { ok: false, error } instead of throwing, so a
 * caller can show a message without a try/catch of its own.
 */
export async function registerForPushNotifications(): Promise<RegisterResult> {
  if (Capacitor.isNativePlatform()) {
    return registerNative();
  }
  return registerWeb();
}

async function registerNative(): Promise<RegisterResult> {
  try {
    // Loaded dynamically so a web-only build (or a page rendered before
    // hydration) never pays for the native plugin's bundle cost.
    const { PushNotifications } = await import('@capacitor/push-notifications');

    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') {
      return { ok: false, error: 'Notification permission denied' };
    }

    return await new Promise<RegisterResult>((resolve) => {
      const successListener = PushNotifications.addListener('registration', async (token) => {
        try {
          await api.post('/notifications/device-token', {
            token: token.value,
            platform: Capacitor.getPlatform(), // 'android' | 'ios'
          });
          resolve({ ok: true });
        } catch (err: any) {
          resolve({ ok: false, error: err?.response?.data?.detail || err?.message || 'Failed to save device token' });
        } finally {
          successListener.then((l) => l.remove());
          errorListener.then((l) => l.remove());
        }
      });
      const errorListener = PushNotifications.addListener('registrationError', (err) => {
        resolve({ ok: false, error: err?.error || 'Native push registration failed' });
        successListener.then((l) => l.remove());
        errorListener.then((l) => l.remove());
      });

      PushNotifications.register();
    });
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Native push registration failed' };
  }
}

async function registerWeb(): Promise<RegisterResult> {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      const result = await Notification.requestPermission();
      if (result !== 'granted') return { ok: false, error: 'Notification permission denied' };
    }
    const token = await getWebFcmToken();
    if (!token) return { ok: false, error: 'FCM is not configured or not supported in this browser' };
    await api.post('/notifications/device-token', { token, platform: 'web' });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.response?.data?.detail || err?.message || 'Web push registration failed' };
  }
}
