import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/server/prisma';
import { config } from '@/lib/server/config';
import { buildTokenResponse } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeBusinessType(input?: string): string {
  if (!input) return 'kirana';
  const val = input.toLowerCase().trim();
  if (val.includes('kirana') || val.includes('grocery')) return 'kirana';
  if (val.includes('pharmacy') || val.includes('medical')) return 'medical';
  if (val.includes('boutique') || val.includes('cosmetics')) return 'boutique';
  if (val.includes('shoes') || val.includes('footwear')) return 'shoes';
  if (val.includes('clothing') || val.includes('clothes') || val.includes('textiles')) return 'clothes';
  if (val.includes('electric') || val.includes('hardware')) return 'electric';
  if (val.includes('electronics')) return 'electronics';
  if (val.includes('beer') || val.includes('wine') || val.includes('liquor')) return 'liquor';
  if (val.includes('general') || val.includes('wholesale') || val.includes('store')) return 'general';
  return val;
}

export const POST = handle(async (req) => {
  const body = await readBody<Record<string, string>>(req);
  const email = body.email;
  const password = body.password;
  const name = body.name || body.full_name || body.fullName || '';
  const fullName = body.fullName || body.full_name || null;
  const mobile = body.mobile || null;
  const storeName = body.storeName || body.shop_name || body.shopName || null;
  const rawType = body.businessType || body.business_type || 'kirana';
  const businessType = normalizeBusinessType(rawType);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ApiError(400, 'Email already registered');

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      uuid: randomUUID(),
      email,
      password: hashedPassword,
      name: name,
      fullName: fullName,
      mobile: mobile,
      storeName: storeName,
      businessType: businessType,
    },
  });

  const shopLabel = storeName || `${email.split('@')[0]}'s Shop`;

  // Start a free trial automatically (no payment). 7 days by default; extended
  // to 14 days later if the user applies a referral code (see /referrals/apply).
  const trialEnds = new Date();
  trialEnds.setDate(trialEnds.getDate() + config.trialDays);

  await prisma.shop.create({
    data: {
      ownerId: user.uuid,
      name: shopLabel,
      businessType: businessType,
      subscriptionStatus: 'trial',
      subscriptionTrialEnds: trialEnds,
      subscriptionExpiry: trialEnds,
    },
  });

  return json(buildTokenResponse(user), 201);
});
