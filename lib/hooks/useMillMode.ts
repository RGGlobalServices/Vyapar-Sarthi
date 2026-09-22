'use client';

import { useBusinessStore } from '@/lib/businessStore';

/**
 * Which billing model the ACTIVE shop uses — decided from the shop's PACKAGE alone, synchronously, with no network call
 * and no per-shop status, activation or confirmation. Bada Udyog package = Mill Billing (`mill_v2`); every other package
 * keeps its own billing untouched.
 *
 * This only chooses which SCREEN to render. It grants nothing: every Mill operation is authorised again on the server
 * (Bada Udyog package + the internal MILL_V2_ENABLED platform flag), so a client that mis-reports its package, or a
 * platform that has the flag off, is rejected by the server and never falls back to legacy billing.
 */
export interface MillMode {
  state: 'not_applicable' | 'ready';
  isMill: boolean;
}

/** The Mill cart is a SEPARATE cart (own key) so a legacy GST-inclusive cart can never be reinterpreted as exclusive. */
export const millCartKey = (shopId: string) => `${shopId}:mill_v2`;

export function useMillMode(): MillMode {
  const { profile } = useBusinessStore();
  const isBada = profile?.packageType === 'badaudyog' || profile?.subscriptionPlan === 'badaudyog';
  return isBada ? { state: 'ready', isMill: true } : { state: 'not_applicable', isMill: false };
}
