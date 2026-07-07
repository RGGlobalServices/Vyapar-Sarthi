import bcrypt from 'bcryptjs';
import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/v1/user/profile — return user-level profile (separate from shop profile)
export const GET = handle(async (req) => {
  const user = await requireUser(req);
  return json({
    name: user.name,
    fullName: user.fullName,
    email: user.email,
    mobile: user.mobile,
    hasProfitPassword: !!user.profitViewPassword,
    hasAdminPin: !!user.adminPin,
  });
});

// PATCH /api/v1/user/profile — update name/mobile OR change password OR set profit password
export const PATCH = handle(async (req) => {
  const user = await requireUser(req);
  const body = await readBody<{
    name?: string;
    mobile?: string;
    currentPassword?: string;
    newPassword?: string;
    profitViewPassword?: string;   // set/clear the profit-view lock
    removeProfitPassword?: boolean;
    adminPin?: string;
    removeAdminPin?: boolean;
  }>(req);

  const updates: Record<string, unknown> = {};

  // Basic info
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.mobile !== undefined) updates.mobile = body.mobile.trim() || null;

  // Change login password
  if (body.newPassword !== undefined) {
    if (!body.currentPassword) throw new ApiError(400, 'Current password is required to change your password.');
    const valid = await bcrypt.compare(body.currentPassword, user.password);
    if (!valid) throw new ApiError(401, 'Current password is incorrect.');
    if (body.newPassword.length < 6) throw new ApiError(400, 'New password must be at least 6 characters.');
    updates.password = await bcrypt.hash(body.newPassword, 10);
  }

  // Set / update profit-view password (requires current login password for security)
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

  // Set / update admin PIN (requires current login password for security)
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

  if (Object.keys(updates).length === 0) return json({ ok: true });

  await prisma.user.update({ where: { id: user.id }, data: updates });
  return json({ ok: true });
});
