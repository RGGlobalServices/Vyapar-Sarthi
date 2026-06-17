import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/server/prisma';
import { config } from '@/lib/server/config';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  const { email, password } = await readBody(req);
  if (!email || !password) throw new ApiError(400, 'Email and password required');

  const admin = await prisma.adminUser.findUnique({ where: { email } });
  if (!admin) throw new ApiError(401, 'Invalid credentials');

  const valid = await bcrypt.compare(password, admin.hashedPassword);
  if (!valid) throw new ApiError(401, 'Invalid credentials');

  if (!admin.isActive) throw new ApiError(403, 'Account is inactive');

  const accessToken = jwt.sign({ sub: admin.id }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.jwtExpiresIn,
  } as jwt.SignOptions);

  return json({
    access_token: accessToken,
    token_type: 'bearer',
    admin: { id: admin.id, email: admin.email, name: admin.fullName, role: admin.role },
  });
});
