import bcrypt from 'bcryptjs';
import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const { pin } = await readBody<{ pin: string }>(req);

  if (!pin) {
    throw new ApiError(400, 'Password/PIN is required.');
  }

  let isValid = false;

  if (user.adminPin) {
    // Check against admin PIN
    isValid = await bcrypt.compare(pin, user.adminPin);
  } else {
    // Fallback: check against main login password
    isValid = await bcrypt.compare(pin, user.password);
  }

  if (!isValid) {
    console.log('[VerifyPIN] Failed! User tried pin length:', pin.length, 'Has adminPin?', !!user.adminPin);
    throw new ApiError(401, 'Incorrect Password/PIN.');
  }

  return json({ ok: true });
});
