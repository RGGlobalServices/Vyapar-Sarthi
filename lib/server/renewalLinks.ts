import crypto from 'crypto';
import { MONTHLY_BASE_PRICES, type BillingCycle } from '../subscriptionPricing';

// One-click renewal links sent over WhatsApp / email. The token carries WHO
// (shopId) and WHAT (plan + cycle) only. It deliberately does NOT carry a price:
// renewal-pay recomputes the amount server-side from plan + cycle, so a token
// can never be used to buy a plan for less than it costs.
interface RenewalPayload {
  shopId: string;
  plan: string;
  cycle: BillingCycle;
  exp: number; // Unix timestamp (ms)
}

const MIN_SECRET_LENGTH = 16;

// Dedicated signing key — NOT CRON_SECRET, and no fallback. Fails closed: with
// no (or a trivially short) RENEWAL_LINK_SECRET no token is issued or accepted.
function getSecret(): string {
  const secret = process.env.RENEWAL_LINK_SECRET || '';
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`RENEWAL_LINK_SECRET is not configured (min ${MIN_SECRET_LENGTH} chars); renewal links are disabled.`);
  }
  return secret;
}

function hmac(data: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Throws if RENEWAL_LINK_SECRET is missing — callers must handle that. */
export function generateRenewalToken(
  shopId: string,
  plan: string,
  cycle: BillingCycle = 'monthly',
): string {
  const secret = getSecret();
  const payload: RenewalPayload = {
    shopId,
    plan,
    cycle,
    exp: Date.now() + 72 * 60 * 60 * 1000, // 72 hours
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${hmac(encoded, secret)}`;
}

/** Returns the verified payload, or null for any invalid / forged / expired token. */
export function verifyRenewalToken(token: string): RenewalPayload | null {
  try {
    const secret = getSecret(); // missing secret -> caught below -> null (fail closed)

    const dot = token.lastIndexOf('.');
    if (dot === -1) return null;

    const encoded = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    if (!safeEqual(sig, hmac(encoded, secret))) return null;

    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));

    if (typeof payload.shopId !== 'string' || !payload.shopId) return null;
    if (typeof payload.plan !== 'string' || !(payload.plan in MONTHLY_BASE_PRICES)) return null;
    if (!['monthly', 'yearly', '5_years'].includes(payload.cycle)) return null;
    if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;

    return { shopId: payload.shopId, plan: payload.plan, cycle: payload.cycle, exp: payload.exp };
  } catch {
    return null;
  }
}

// Historical plan names still sit on some shops. Only the plans in
// MONTHLY_BASE_PRICES can be bought, and a token for anything else can never
// verify — so a reminder must not carry one. `starter` is the documented legacy
// alias of Dukaan (see planGates.ts); other legacy names ('professional', ...)
// have no equivalent and get no one-click link.
const LEGACY_PLAN_ALIASES: Record<string, string> = { starter: 'shop' };

export function sellablePlanFor(plan: string): string | null {
  if (plan in MONTHLY_BASE_PRICES) return plan;
  return LEGACY_PLAN_ALIASES[plan] ?? null;
}

export function buildRenewalUrl(appUrl: string, token: string): string {
  return `${appUrl}/api/v1/payments/renewal-pay?token=${token}`;
}

// Authenticated in-app path. For a plan that cannot be bought directly it points
// at Settings (where the current plans are listed) instead of an unbuyable plan.
export function buildInAppRenewalUrl(appUrl: string, plan: string, cycle: BillingCycle): string {
  const sellable = sellablePlanFor(plan);
  return sellable
    ? `${appUrl}/en/payment?plan=${encodeURIComponent(sellable)}&cycle=${cycle}`
    : `${appUrl}/en/settings`;
}
