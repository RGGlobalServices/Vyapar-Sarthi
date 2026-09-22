'use client';

import { idbGet, idbPut } from './idb';

export interface OfflineSession {
  shopId: string;
  userId: string;
  userName: string;
  userEmail: string;
  role: 'admin' | 'staff';
  storeName: string;
  businessType: string;
  packageType: string;
  subscriptionPlan: string;
  subscriptionStatus: string;
  allowNegativeStock: boolean;
  permissions: string[];
  lastAuthenticatedAt: number;
  graceExpiryAt: number; // default 7 days from last online authentication
}

// Configurable grace period: default 7 days
const DEFAULT_GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Saves non-sensitive session metadata for offline use when user logs in or refreshes profile online.
 * Never stores passwords or secrets.
 */
export async function saveOfflineSession(sessionData: {
  shopId: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  role?: 'admin' | 'staff';
  storeName?: string;
  businessType?: string;
  packageType?: string;
  subscriptionPlan?: string;
  subscriptionStatus?: string;
  allowNegativeStock?: boolean;
  permissions?: string[];
  gracePeriodMs?: number;
}): Promise<void> {
  const now = Date.now();
  const graceMs = sessionData.gracePeriodMs || DEFAULT_GRACE_PERIOD_MS;

  const session: OfflineSession = {
    shopId: sessionData.shopId,
    userId: sessionData.userId,
    userName: sessionData.userName || '',
    userEmail: sessionData.userEmail || '',
    role: sessionData.role || 'admin',
    storeName: sessionData.storeName || '',
    businessType: sessionData.businessType || 'kirana',
    packageType: sessionData.packageType || 'dukan',
    subscriptionPlan: sessionData.subscriptionPlan || 'trial',
    subscriptionStatus: sessionData.subscriptionStatus || 'active',
    allowNegativeStock: Boolean(sessionData.allowNegativeStock),
    permissions: sessionData.permissions || [],
    lastAuthenticatedAt: now,
    graceExpiryAt: now + graceMs,
  };

  await idbPut('auth_session', session);
}

/**
 * Checks if the device has a valid offline authorization for the given shopId.
 */
export async function getValidOfflineSession(shopId: string): Promise<OfflineSession | null> {
  if (!shopId) return null;
  const session = await idbGet<OfflineSession>('auth_session', shopId);
  if (!session) return null;

  // Check if 7-day grace period is still valid
  const now = Date.now();
  if (now > session.graceExpiryAt) {
    return null; // Grace period expired, requires online re-authentication
  }

  return session;
}
