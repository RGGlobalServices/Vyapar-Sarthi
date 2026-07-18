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

  // Parse User-Agent
  const uaString = req.headers.get('user-agent') || '';
  let os = 'Unknown OS';
  let browser = 'Unknown Browser';
  
  if (/windows/i.test(uaString)) os = 'Windows';
  else if (/mac/i.test(uaString)) os = 'macOS';
  else if (/linux/i.test(uaString)) os = 'Linux';
  else if (/android/i.test(uaString)) os = 'Android';
  else if (/iphone|ipad|ipod/i.test(uaString)) os = 'iOS';
  
  if (/edg/i.test(uaString)) browser = 'Edge';
  else if (/chrome|crios/i.test(uaString)) browser = 'Chrome';
  else if (/firefox|fxios/i.test(uaString)) browser = 'Firefox';
  else if (/safari/i.test(uaString)) browser = 'Safari';

  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'Unknown IP';
  const cleanIp = ip.split(',')[0].trim();
  const device = `${browser} on ${os}`;

  // Reuse an existing session for this same device+browser+IP (just bump
  // lastSeen) instead of inserting a new row every login — otherwise the
  // same browser piles up a fresh "Active" entry on every single sign-in.
  const existingSession = await prisma.userSession.findFirst({
    where: { userId: user.id, device, browser },
  });
  const session = existingSession
    ? await prisma.userSession.update({
        where: { id: existingSession.id },
        data: { lastSeen: new Date(), ip: cleanIp },
      })
    : await prisma.userSession.create({
        data: { userId: user.id, device, os, browser, ip: cleanIp },
      });

  return json(buildTokenResponse(user, session.id));
});
