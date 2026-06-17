import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/server/prisma';
import { config } from '@/lib/server/config';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  const { resetToken, newPassword } = await readBody<{ resetToken?: string; newPassword?: string }>(req);

  if (!resetToken) throw new ApiError(400, 'Reset token is missing. Please restart the process.');
  if (!newPassword || newPassword.length < 6) {
    throw new ApiError(400, 'Password must be at least 6 characters.');
  }

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(resetToken, config.jwtSecret) as jwt.JwtPayload;
  } catch {
    throw new ApiError(400, 'Reset link has expired. Please request a new one.');
  }
  if (payload.purpose !== 'pwd_reset') throw new ApiError(400, 'Invalid reset token.');

  const user = await prisma.user.findUnique({ where: { uuid: payload.sub! } });
  if (!user) throw new ApiError(400, 'User not found.');

  const hashed = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashed, passwordResetToken: null, passwordResetExpiry: null },
  });

  return json({ ok: true });
});
