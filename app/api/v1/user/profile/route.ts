import bcrypt from 'bcryptjs';
import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/v1/user/profile — return connected user & shop profile information
export const GET = handle(async (req) => {
  const user = await requireUser(req);
  const primaryShop = user.uuid
    ? await prisma.shop.findFirst({ where: { ownerId: user.uuid } })
    : null;

  return json({
    id: user.id,
    uuid: user.uuid,
    name: user.name,
    fullName: user.fullName,
    email: user.email,
    mobile: user.mobile || primaryShop?.mobile || null,
    storeName: user.storeName || primaryShop?.name || null,
    businessType: user.businessType || primaryShop?.businessType || 'kirana',
    hasProfitPassword: !!user.profitViewPassword,
    hasAdminPin: !!user.adminPin,
    shop: primaryShop ? {
      id: primaryShop.id,
      name: primaryShop.name,
      address: primaryShop.address,
      mobile: primaryShop.mobile,
      businessType: primaryShop.businessType,
      gst: primaryShop.gst,
      pan: primaryShop.pan,
    } : null,
  });
});

// PATCH /api/v1/user/profile — update name/mobile/email/storeName/businessType OR change password
export const PATCH = handle(async (req) => {
  const user = await requireUser(req);
  const body = await readBody<{
    name?: string;
    fullName?: string;
    email?: string;
    mobile?: string;
    storeName?: string;
    shopName?: string;
    businessType?: string;
    business_type?: string;
    currentPassword?: string;
    newPassword?: string;
    profitViewPassword?: string;
    removeProfitPassword?: boolean;
    adminPin?: string;
    removeAdminPin?: boolean;
  }>(req);

  const updates: Record<string, unknown> = {};

  // Basic info
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.fullName !== undefined) updates.fullName = body.fullName.trim();
  if (body.mobile !== undefined) updates.mobile = body.mobile.trim() || null;

  const store = body.storeName || body.shopName;
  if (store !== undefined) updates.storeName = store.trim() || null;

  const bType = body.businessType || body.business_type;
  if (bType !== undefined) updates.businessType = bType.trim() || null;

  // Email update
  if (body.email !== undefined) {
    const trimmedEmail = body.email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
      throw new ApiError(400, 'Please enter a valid email address.');
    }

    if (trimmedEmail !== user.email.toLowerCase()) {
      if (user.password) {
        if (!body.currentPassword) {
          throw new ApiError(400, 'Current password is required to change your email address.');
        }
        const valid = await bcrypt.compare(body.currentPassword, user.password);
        if (!valid) {
          throw new ApiError(401, 'Current password is incorrect.');
        }
      }

      const existing = await prisma.user.findFirst({
        where: {
          email: trimmedEmail,
          NOT: { id: user.id }
        }
      });

      if (existing) {
        throw new ApiError(400, 'This email address is already in use by another account.');
      }

      updates.email = trimmedEmail;
    }
  }

  // Change login password
  if (body.newPassword !== undefined) {
    if (!body.currentPassword) throw new ApiError(400, 'Current password is required to change your password.');
    const valid = await bcrypt.compare(body.currentPassword, user.password);
    if (!valid) throw new ApiError(401, 'Current password is incorrect.');
    if (body.newPassword.length < 6) throw new ApiError(400, 'New password must be at least 6 characters.');
    updates.password = await bcrypt.hash(body.newPassword, 10);
  }

  // Set / update profit-view password
  if (body.profitViewPassword !== undefined || body.removeProfitPassword) {
    if (!body.currentPassword) throw new ApiError(400, 'Enter your current login password to change this setting.');
    const valid = await bcrypt.compare(body.currentPassword, user.password);
    if (!valid) throw new ApiError(401, 'Current password is incorrect.');
    if (body.removeProfitPassword) {
      updates.profitViewPassword = null;
    } else if (body.profitViewPassword) {
      if (body.profitViewPassword.length < 4) throw new ApiError(400, 'Profit password must be at least 4 characters.');
      updates.profitViewPassword = await bcrypt.hash(body.profitViewPassword, 10);
    }
  }

  // Set / update admin PIN
  if (body.adminPin !== undefined || body.removeAdminPin) {
    if (!body.currentPassword) throw new ApiError(400, 'Enter your current login password to change this setting.');
    const valid = await bcrypt.compare(body.currentPassword, user.password);
    if (!valid) throw new ApiError(401, 'Current password is incorrect.');
    if (body.removeAdminPin) {
      updates.adminPin = null;
    } else if (body.adminPin) {
      if (body.adminPin.length < 4) throw new ApiError(400, 'Admin PIN must be at least 4 characters.');
      updates.adminPin = await bcrypt.hash(body.adminPin, 10);
    }
  }

  let updatedUser: any = user;
  if (Object.keys(updates).length > 0) {
    updatedUser = await prisma.user.update({ where: { id: user.id }, data: updates });
  }

  // Synchronize changes to owner's Shop records
  const shopUpdates: Record<string, unknown> = {};
  if (updates.mobile !== undefined) shopUpdates.mobile = updates.mobile;
  if (updates.storeName !== undefined) shopUpdates.name = updates.storeName;
  if (updates.businessType !== undefined) shopUpdates.businessType = updates.businessType;

  if (Object.keys(shopUpdates).length > 0 && user.uuid) {
    await prisma.shop.updateMany({
      where: { ownerId: user.uuid },
      data: shopUpdates,
    });
  }

  return json({
    ok: true,
    user: {
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      fullName: updatedUser.fullName,
      mobile: updatedUser.mobile,
      storeName: updatedUser.storeName,
      businessType: updatedUser.businessType,
    }
  });
});
