import jwt from 'jsonwebtoken';
import { config } from './config';
import prisma from './prisma';
import { ApiError } from './http';

// ── Token + identity helpers (replacing Express middleware chains) ──
// authenticateUser  -> getUserIdFromToken
// getCurrentUser    -> requireUser
// getCurrentShop    -> requireShop
// authenticateAdmin -> getAdminIdFromToken
// getAdminUser      -> requireAdmin

type UserRecord = {
  id: number;
  uuid: string | null;
  email: string;
  name: string | null;
  storeName: string | null;
  mobile: string | null;
};

// Fail closed in production if the JWT secret was never configured (or is the
// public dev default committed to this repo) — otherwise tokens could be forged.
function assertJwtSecret() {
  if (
    process.env.NODE_ENV === 'production' &&
    (!process.env.SECRET_KEY || process.env.SECRET_KEY === 'your-secret-key-for-dev-only')
  ) {
    throw new ApiError(500, 'Server misconfigured: SECRET_KEY must be set to a strong, unique value.');
  }
}

export function buildTokenResponse(user: UserRecord, sessionId?: string) {
  assertJwtSecret();
  const payload: any = { sub: user.uuid };
  if (sessionId) payload.sessionId = sessionId;
  
  const access_token = jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  } as jwt.SignOptions);
  return {
    access_token,
    token_type: 'bearer',
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      storeName: user.storeName,
      mobile: user.mobile,
    },
  };
}

export function getAuthPayloadFromToken(req: Request): { sub: string; sessionId?: string } {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new ApiError(401, 'Not authenticated');
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    if (!payload.sub) throw new ApiError(401, 'Invalid token');
    return { sub: payload.sub as string, sessionId: payload.sessionId as string | undefined };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(401, 'Invalid token');
  }
}

// One browser page load fires many parallel API calls (products, master-data,
// notifications, calendar, shop/profile, …) and every single one independently
// re-ran the same 2-3 auth queries (user + session + owned shops) for the
// exact same request-token, multiplying real DB round trips ~N-fold for one
// page and materially contributing to the "too many database connections"
// errors seen under load. Since this data is effectively immutable within a
// few seconds (a user doesn't get renamed or lose a shop mid-page-load), a
// short in-memory TTL cache keyed by (userId, sessionId) collapses that whole
// burst into a single DB round trip. Safe in both a persistent Node process
// (this cache does its job) and a serverless/per-request environment (the
// module-level Map just starts empty each time — pure no-op, same as before).
const AUTH_CACHE_TTL_MS = 4000;
const authContextCache = new Map<string, { data: Promise<{ user: any; session: any; shops: any[] }>; expires: number }>();

function loadAuthContext(userId: string, sessionId?: string) {
  const key = `${userId}:${sessionId || ''}`;
  const cached = authContextCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.data;

  // Cache the in-flight Promise itself (not just the resolved value) so
  // concurrent requests racing in during the same burst share one query
  // instead of each starting their own before the first resolves.
  const promise = Promise.all([
    prisma.user.findUnique({ where: { uuid: userId } }),
    sessionId
      ? prisma.userSession.findUnique({ where: { id: sessionId } })
      : Promise.resolve(null),
    prisma.shop.findMany({ where: { ownerId: userId } }),
  ]).then(([user, session, shops]) => ({ user, session, shops }));

  authContextCache.set(key, { data: promise, expires: Date.now() + AUTH_CACHE_TTL_MS });
  // A failed lookup shouldn't stay cached and keep failing for the TTL window.
  promise.catch(() => authContextCache.delete(key));

  // Opportunistic cleanup so a long-lived dev/prod process doesn't accumulate
  // one entry per (user, session) forever.
  if (authContextCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of authContextCache) if (v.expires <= now) authContextCache.delete(k);
  }
  return promise;
}

// A supplied x-shop-id must be one of the caller's own shops. It used to fall
// back silently to shops[0] when it wasn't, so a stale or tampered header made
// writes land in a different shop than the one the user was looking at. Only
// a genuinely ABSENT header falls back to the first owned shop.
function resolveActiveShop<S extends { id: string }>(shops: S[], requestedShopId: string | null): S {
  if (requestedShopId) {
    const match = shops.find(s => s.id === requestedShopId);
    if (!match) throw new ApiError(403, 'Invalid or unauthorized shop', 'SHOP_INVALID');
    return match;
  }
  const first = shops[0];
  if (!first) throw new ApiError(404, 'Shop not found');
  return first;
}

export async function requireUser(req: Request) {
  const { sub: userId, sessionId } = getAuthPayloadFromToken(req);

  const { user, session } = await loadAuthContext(userId, sessionId);

  if (!user) throw new ApiError(401, 'User not found');
  if (sessionId && !session) {
    throw new ApiError(401, 'Session expired or revoked from another device. Please log in again.');
  }

  // A user authenticated by uuid always has a non-null uuid — narrow the type
  // so route code can use user.uuid without repeated non-null assertions.
  return user as typeof user & { uuid: string };
}

import { isSubscriptionEnded } from '../subscriptionAccess';

// Loads the user and the active shop. Honors the x-shop-id header for
// multi-shop switching, validating ownership.
export async function requireShop(
  req: Request,
  options: { enforceSubscription?: boolean } = {}
) {
  const { sub: userId, sessionId } = getAuthPayloadFromToken(req);
  const requestedShopId = req.headers.get('x-shop-id');

  // Shared, short-TTL cache — see loadAuthContext above. Fetching every owned
  // shop (a shopkeeper has a handful) lets us resolve the x-shop-id header in
  // memory rather than paying a second query for the fallback. Filtering on
  // ownerId is what enforces ownership, as before.
  const { user, session, shops } = await loadAuthContext(userId, sessionId);

  // Check order matches the previous sequential flow so callers see the same errors.
  if (!user) throw new ApiError(401, 'User not found');
  if (sessionId && !session) {
    throw new ApiError(401, 'Session expired or revoked from another device. Please log in again.');
  }

  const shop = resolveActiveShop(shops, requestedShopId);

  // Removed cross-shop subscription sharing to enforce strict Data Isolation per shop.
  // Each shop now maintains its own independent packageType and subscriptionPlan.

  const enforce = options.enforceSubscription ?? true;
  
  if (enforce && isSubscriptionEnded(shop)) {
    const url = new URL(req.url);
    const path = url.pathname;
    
    // Core profile and payment APIs must remain accessible even when expired
    const isExempt = path.includes('/shop/profile') || 
                     path.includes('/shop/switch-plan') || 
                     path.includes('/payments/create-order') ||
                     path.includes('/user/tool-usage');
                     
    if (!isExempt) {
      throw new ApiError(403, 'Subscription expired');
    }
  }

  // Narrow uuid as requireUser does — a user found by uuid always has one.
  return { user: user as typeof user & { uuid: string }, shop };
}

/**
 * Like requireShop(), but also resolves the owner's "All Shop Access"
 * preference into a shopIds list to pool read-only queries across every shop
 * they own: [shop.id] when the preference is off (identical scope to
 * requireShop() — the default for every existing user, since the column
 * defaults false), every eligible owned shop's id when on. Callers should
 * always filter with `shopId: { in: shopIds }` — that degenerates to exactly
 * today's `shopId: shop.id` query when off.
 *
 * Deliberately duplicates requireShop()'s resolution block rather than
 * refactoring it to share code: requireShop() is called by ~100 existing
 * routes and must not risk any behavioral drift, so this stays fully
 * separate — nothing about today's single-shop auth path is touched.
 */
export async function requireShopScope(
  req: Request,
  options: { enforceSubscription?: boolean } = {}
) {
  const { sub: userId, sessionId } = getAuthPayloadFromToken(req);
  const requestedShopId = req.headers.get('x-shop-id');

  // Same shared, short-TTL cache as requireShop() — see loadAuthContext above.
  // Only the query-fetching is shared; the resolution/enforcement logic below
  // stays fully duplicated per the note above.
  const { user, session, shops } = await loadAuthContext(userId, sessionId);

  if (!user) throw new ApiError(401, 'User not found');
  if (sessionId && !session) {
    throw new ApiError(401, 'Session expired or revoked from another device. Please log in again.');
  }

  const shop = resolveActiveShop(shops, requestedShopId);

  const enforce = options.enforceSubscription ?? true;

  if (enforce && isSubscriptionEnded(shop)) {
    const url = new URL(req.url);
    const path = url.pathname;
    const isExempt = path.includes('/shop/profile') ||
                     path.includes('/shop/switch-plan') ||
                     path.includes('/payments/create-order') ||
                     path.includes('/user/tool-usage');
    if (!isExempt) {
      throw new ApiError(403, 'Subscription expired');
    }
  }

  // Strict equality — null/undefined (every pre-existing user) reads as off.
  const allShopAccess = user.allShopAccess === true;

  // Owner-level narrowing of WHICH shops "All Shop Access" pools — empty
  // (every pre-existing All-Shop-Access user, and anyone who's never opened
  // the picker) means "no explicit selection", which must keep behaving
  // exactly like before this column existed: every owned shop.
  const selectedShopIds = Array.isArray(user.selectedShopIds) && user.selectedShopIds.length > 0
    ? user.selectedShopIds
    : null;

  // A lapsed shop shows no data if it were the active shop today, so it
  // shouldn't silently reappear via pooling either.
  const eligibleShops = enforce ? shops.filter(s => !isSubscriptionEnded(s)) : shops;
  const pooledShops = selectedShopIds
    ? eligibleShops.filter(s => selectedShopIds.includes(s.id))
    : eligibleShops;
  const shopIds = allShopAccess ? pooledShops.map(s => s.id) : [shop.id];

  return {
    user: user as typeof user & { uuid: string },
    shop,
    // Every shop this owner has (unfiltered) — for building shopId -> name
    // maps, independent of which ids ended up eligible for pooling.
    ownedShops: shops,
    shopIds,
    allShopAccess,
    // Raw selection, null when unset — for routes (like all-shops-summary)
    // that need to distinguish "explicitly chose these" from "no selection
    // yet, default to everything" rather than just consuming shopIds.
    selectedShopIds,
  };
}

export function getAdminIdFromToken(req: Request): string {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new ApiError(401, 'Not authenticated');
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    if (!payload.sub) throw new ApiError(401, 'Invalid token');
    return payload.sub as string;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(401, 'Invalid token');
  }
}

export async function requireAdmin(req: Request) {
  const adminId = getAdminIdFromToken(req);
  const admin = await prisma.adminUser.findUnique({ where: { id: adminId } });
  if (!admin || !admin.isActive) throw new ApiError(401, 'Admin not found or inactive');
  return admin;
}
