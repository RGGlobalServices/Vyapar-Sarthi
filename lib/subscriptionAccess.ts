export interface SubscriptionProfileLike {
  subscriptionPlan?: string | null;
  subscriptionStatus?: string | null;
  subscriptionExpiry?: string | Date | null;
  trialPaused?: boolean | null;
  trialPauseStart?: string | Date | null;
}

// A subscription is "ended" when it has been explicitly expired/cancelled, or
// when its expiry date has passed. While `trial` or `active` with a future
// expiry, full access is granted.
export function isSubscriptionEnded(profile: SubscriptionProfileLike): boolean {
  const status = (profile.subscriptionStatus || '').toLowerCase();
  if (status === 'expired' || status === 'cancelled') return true;
  // If trial is paused, it has not ended yet.
  if (status === 'trial' && profile.trialPaused) return false;
  // Trial / active but past the expiry date → treat as ended.
  if ((status === 'trial' || status === 'active') && profile.subscriptionExpiry) {
    return new Date(profile.subscriptionExpiry).getTime() < Date.now();
  }
  return false;
}

// Pages that remain usable after a subscription ends, so the shopkeeper can
// keep running the core of their business and still reach billing to renew.
export const ENDED_ALLOWED_PATHS = new Set([
  '/billing',
  '/products',
  '/stock',
  '/settings',
  '/payment',
]);

export function isAllowedWhenEnded(pathname: string): boolean {
  // Strip locale prefix (/en, /hi, /mr) then match the bare path prefix.
  const bare = pathname.replace(/^\/(en|hi|mr)/, '') || '/';
  for (const allowed of ENDED_ALLOWED_PATHS) {
    if (bare === allowed || bare.startsWith(`${allowed}/`)) return true;
  }
  return false;
}
