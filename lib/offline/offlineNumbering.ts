'use client';

import { getDeviceId } from './device';

let offlineCounter = 0;

/**
 * Generates an audit-safe offline reference number.
 * Example: OFF-20260917-DEV01-000123
 */
export function generateOfflineRefNumber(prefix: string = 'OFF'): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const datePart = `${yyyy}${mm}${dd}`;

  const deviceId = getDeviceId().slice(-5).toUpperCase();
  offlineCounter = (offlineCounter + 1) % 1000000;
  const seq = String(offlineCounter).padStart(4, '0');
  const randomSalt = Math.random().toString(36).slice(2, 5).toUpperCase();

  return `${prefix}-${datePart}-${deviceId}-${seq}${randomSalt}`;
}
