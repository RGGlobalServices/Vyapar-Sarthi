import bcrypt from 'bcryptjs';
import prisma from '@/lib/server/prisma';
import { buildTokenResponse } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  const { email, password } = await readBody<{ email?: string; password?: string }>(req);
  const wrong = 'Wrong user ID or password. Please try again or create a new account.';
  const user = await prisma.user.findUnique({ where: { email: email ?? '' } });
  if (!user) throw new ApiError(401, wrong);
  const valid = await bcrypt.compare(password ?? '', user.password);
  if (!valid) throw new ApiError(401, wrong);
  return json(buildTokenResponse(user));
});
