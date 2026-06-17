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

export function buildTokenResponse(user: UserRecord) {
  assertJwtSecret();
  const access_token = jwt.sign({ sub: user.uuid }, config.jwtSecret, {
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

export function getUserIdFromToken(req: Request): string {
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

export async function requireUser(req: Request) {
  const userId = getUserIdFromToken(req);
  const user = await prisma.user.findUnique({ where: { uuid: userId } });
  if (!user) throw new ApiError(401, 'User not found');
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
  const user = await requireUser(req);
  const requestedShopId = req.headers.get('x-shop-id');
  let shop;

  if (requestedShopId) {
    shop = await prisma.shop.findFirst({ where: { id: requestedShopId, ownerId: user.uuid! } });
    if (!shop) throw new ApiError(403, 'Shop not found or access denied');
  } else {
    shop = await prisma.shop.findFirst({ where: { ownerId: user.uuid! } });
    if (!shop) throw new ApiError(404, 'Shop not found');
  }

  const enforce = options.enforceSubscription ?? true;
  
  if (enforce && isSubscriptionEnded(shop)) {
    const url = new URL(req.url);
    const path = url.pathname;
    
    // Core profile and payment APIs must remain accessible even when expired
    const isExempt = path.includes('/shop/profile') || 
                     path.includes('/shop/switch-plan') || 
                     path.includes('/payments/create-order') ||
                     path.includes('/payments/activate-plan') ||
                     path.includes('/user/tool-usage');
                     
    if (!isExempt) {
      throw new ApiError(403, 'Subscription expired');
    }
  }

  return { user, shop };
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
