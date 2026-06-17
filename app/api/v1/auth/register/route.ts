import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/server/prisma';
import { config } from '@/lib/server/config';
import { buildTokenResponse } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  const { email, password, name, fullName, mobile, storeName, shopName, businessType } =
    await readBody<Record<string, string>>(req);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ApiError(400, 'Email already registered');

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      uuid: randomUUID(),
      email,
      password: hashedPassword,
      name: name || '',
      fullName: fullName || null,
      mobile: mobile || null,
      storeName: storeName || null,
      businessType: businessType || null,
    },
  });

  const shopLabel = storeName || shopName || `${email.split('@')[0]}'s Shop`;

  // Start a free trial automatically (no payment). 7 days by default; extended
  // to 14 days later if the user applies a referral code (see /referrals/apply).
  const trialEnds = new Date();
  trialEnds.setDate(trialEnds.getDate() + config.trialDays);

  await prisma.shop.create({
    data: {
      ownerId: user.uuid,
      name: shopLabel,
      subscriptionStatus: 'trial',
      subscriptionTrialEnds: trialEnds,
      subscriptionExpiry: trialEnds,
    },
  });

  return json(buildTokenResponse(user), 201);
});
