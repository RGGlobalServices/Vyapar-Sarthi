import bcrypt from 'bcryptjs';
import prisma from '@/lib/server/prisma';
import { config } from '@/lib/server/config';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  const { email, password, fullName, secretKey } = await readBody(req);
  if (!email || !password || !fullName || !secretKey) {
    throw new ApiError(400, 'All fields required (email, password, fullName, secretKey)');
  }
  // Fail closed in production if the admin secret was never configured (or is the
  // public dev default committed to this repo) — otherwise anyone could
  // self-register as an admin using the well-known default key.
  if (
    process.env.NODE_ENV === 'production' &&
    (!process.env.ADMIN_SECRET_KEY || process.env.ADMIN_SECRET_KEY === 'vyapar-sarthi-admin-secret-2025')
  ) {
    throw new ApiError(500, 'Server misconfigured: ADMIN_SECRET_KEY must be set to a strong, unique value.');
  }
  if (secretKey !== config.adminSecretKey) throw new ApiError(403, 'Invalid secret key');

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) throw new ApiError(409, 'Admin with this email already exists');

  const hashedPassword = await bcrypt.hash(password, 10);
  const admin = await prisma.adminUser.create({
    data: { email, hashedPassword, fullName, isActive: 1, role: 'superadmin' },
  });

  return json({ id: admin.id, email: admin.email, fullName: admin.fullName, role: admin.role }, 201);
});
