import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/server/prisma';
import { config } from '@/lib/server/config';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  const { email, otp } = await readBody<{ email?: string; otp?: string }>(req);
  if (!email?.trim() || !otp?.trim()) throw new ApiError(400, 'Email and OTP are required.');

  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  const invalid = () => new ApiError(400, 'Incorrect OTP. Please check and try again.');

  if (!user || !user.passwordResetToken || !user.passwordResetExpiry) throw invalid();
  if (new Date() > user.passwordResetExpiry) {
    throw new ApiError(400, 'OTP has expired. Please request a new one.');
  }

  const valid = await bcrypt.compare(otp.trim(), user.passwordResetToken);
  if (!valid) throw invalid();

  // Issue a short-lived reset token (15 min). The purpose claim guards against reuse.
  const resetToken = jwt.sign(
    { sub: user.uuid, email: user.email, purpose: 'pwd_reset' },
    config.jwtSecret,
    { expiresIn: '15m' } as jwt.SignOptions,
  );

  return json({ resetToken });
});
