'use client';

const DEVICE_ID_KEY = 'vyapar_device_id';

/**
 * Returns a persistent, unique device identifier.
 * Stored in localStorage for instant access.
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server_device';

  try {
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      // Generate a crypto random device identifier
      const array = new Uint8Array(12);
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(array);
        deviceId = 'DEV-' + Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
      } else {
        deviceId = 'DEV-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
      }
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  } catch {
    return 'fallback_device';
  }
}
