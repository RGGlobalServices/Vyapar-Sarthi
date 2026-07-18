import bcrypt from 'bcryptjs';
import prisma from '@/lib/server/prisma';
import { sendPasswordResetOTP } from '@/lib/server/email';
import { handle, json, readBody } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  const { email } = await readBody<{ email?: string }>(req);

  // Always return ok to avoid leaking which emails exist.
  if (!email?.trim()) return json({ ok: true });

  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) return json({ ok: true });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const hashedOtp = await bcrypt.hash(otp, 8);
  const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordResetToken: hashedOtp, passwordResetExpiry: expiry },
  });

  sendPasswordResetOTP(user.email, otp, user.name || user.fullName || 'User').catch(console.error);
  return json({ ok: true });
});
