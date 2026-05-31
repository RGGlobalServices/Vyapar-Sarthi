export interface SubscriptionProfileLike {
  subscriptionPlan?: string | null;
  subscriptionStatus?: string | null;
  subscriptionExpiry?: string | null;
}

export function isSubscriptionEnded(_profile: SubscriptionProfileLike): boolean {
  return false;
}

export const ENDED_ALLOWED_PATHS = new Set([
  '/billing',
  '/products',
  '/stock',
  '/settings',
]);

export function isAllowedWhenEnded(pathname: string): boolean {
  return ENDED_ALLOWED_PATHS.has(pathname);
}
