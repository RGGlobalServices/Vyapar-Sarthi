import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/server/prisma';
import { config } from '@/lib/server/config';
import { buildTokenResponse } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { BUSINESS_CONFIGS } from '@/lib/businessConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeBusinessType(input?: string): string {
  if (!input) return 'kirana';
  const val = input.toLowerCase().trim();
  // Exact key from the picker (signup/profile/add-shop all send BusinessType
  // slugs directly) always wins — the heuristics below exist only to recover
  // a type from old free-text data and must never shadow a real key (e.g.
  // 'generalstore' contains 'general' and would otherwise collapse to it).
  if (val in BUSINESS_CONFIGS) return val;
  if (val.includes('kirana') || val.includes('grocery')) return 'kirana';
  if (val.includes('medical') && val.includes('distribut')) return 'medicaldistributor';
  if (val.includes('pharmacy') || val.includes('medical')) return 'medical';
  if (val.includes('boutique') || val.includes('cosmetics')) return 'boutique';
  if (val.includes('shoes') || val.includes('footwear')) return 'shoes';
  if (val.includes('textile') && val.includes('wholesale')) return 'textilewholesale';
  if (val.includes('clothing') || val.includes('clothes') || val.includes('textiles')) return 'clothes';
  if (val.includes('electrical') && val.includes('distribut')) return 'electricaldistributor';
  if (val.includes('electric') || val.includes('hardware')) return 'electric';
  if (val.includes('electronics')) return 'electronics';
  if (val.includes('beer') || val.includes('wine') || val.includes('liquor')) return 'liquor';
  if (val.includes('flour') && val.includes('mill')) return 'flourmill';
  if (val.includes('oil') && val.includes('mill')) return 'oilmill';
  if (val.includes('rice mill') || val.includes('dal mill') || val.includes('bhagar') || val.includes('ricemill')) return 'ricemill';
  if (val.includes('food process')) return 'foodprocessing';
  if (val.includes('manufactur')) return 'smallmanufacturing';
  if (val.includes('fmcg')) return 'fmcgdistributor';
  if (val.includes('organic')) return 'organicproducts';
  if (val.includes('farm equipment') || val.includes('farm tool')) return 'farmequipment';
  if (val.includes('seed') && (val.includes('distribut') || val.includes('wholesale'))) return 'seeddistributor';
  if (val.includes('fertiliz') && (val.includes('distribut') || val.includes('wholesale'))) return 'fertilizerdistributor';
  if (val.includes('pesticid') && (val.includes('distribut') || val.includes('wholesale'))) return 'pesticidedistributor';
  if ((val.includes('agro') || val.includes('agri') || val.includes('krushi') || val.includes('krishi')) && (val.includes('wholesale') || val.includes('distribut'))) return 'agrowholesale';
  if (val.includes('agro') || val.includes('agri') || val.includes('fertiliz') || val.includes('seeds') || val.includes('pesticid') || val.includes('krushi') || val.includes('krishi')) return 'agrostore';
  if (val.includes('general store') || val.includes('generalstore')) return 'generalstore';
  if (val.includes('general') || val.includes('wholesale') || val.includes('store')) return 'general';
  return val;
}

// Landing-page package keys map onto the DB packageType strings the app uses
// everywhere else (Shop.package_type). Anything unknown falls back to dukan
// so a stale/typo'd value never breaks signup.
function normalizePackageType(input?: string): string {
  if (!input) return 'dukan';
  const v = input.toLowerCase().trim();
  if (v === 'shop' || v === 'starter' || v === 'dukan' || v === 'dukaan') return 'dukan';
  if (v === 'vyapar') return 'vyapar';
  if (v === 'wholesale' || v === 'udyog') return 'wholesale';
  if (v === 'badaudyog' || v === 'bada_udyog' || v === 'bada-udyog') return 'badaudyog';
  return 'dukan';
}

// subscriptionPlan (billing-facing) vs packageType (sidebar/module-access)
// are two separate columns and MUST match — /shop/profile self-heals
// packageType from subscriptionPlan via packageTypeForPlan (see lib/planGates)
// so setting packageType alone gets clobbered. Landing signup passes the
// billing key (shop/vyapar/wholesale/badaudyog) — collapse it here.
function subscriptionPlanForPackage(pkg: string): string {
  if (pkg === 'badaudyog') return 'badaudyog';
  if (pkg === 'wholesale') return 'wholesale';
  if (pkg === 'vyapar')    return 'vyapar';
  return 'shop';
}

export const POST = handle(async (req) => {
  // Body accepts string fields (name/email/etc.) AND array fields
  // (businessProducts) — widened to `any` per field so both shapes co-exist
  // without introducing a per-field discriminated union.
  const body = await readBody<Record<string, any>>(req);
  const email = body.email;
  const password = body.password;
  const name = body.name || body.full_name || body.fullName || '';
  const fullName = body.fullName || body.full_name || null;
  const mobile = body.mobile || null;
  const storeName = body.storeName || body.shop_name || body.shopName || null;
  const rawType = body.businessType || body.business_type || 'kirana';
  const businessType = normalizeBusinessType(rawType);
  // Optional shop-side fields the landing signup now collects up-front so the
  // shopkeeper doesn't land in an empty Profile after checkout. All optional
  // — the shopkeeper can still fill/change them from Profile later.
  const address     = body.address    || body.shop_address || null;
  const gst         = (body.gst || body.gstin || '').toUpperCase().trim() || null;
  const rawPackage  = body.packageType || body.package_type || body.plan || '';
  const packageType = normalizePackageType(rawPackage);
  // Mill sub-type + processed products — only meaningful when
  // businessType='millprocessing' (the unified Mills & Grain Processing
  // type used by Bada Udyog). See MILL_TYPES / MILL_PRODUCT_TYPES in
  // lib/businessConfig.ts for valid values, though the API stores
  // whatever the client sends (extensible without a schema change).
  const businessSubtype = (body.businessSubtype || body.business_subtype || '').trim() || null;
  const rawProducts     = (body as any).businessProducts ?? (body as any).business_products;
  const businessProducts: string[] = Array.isArray(rawProducts)
    ? rawProducts.filter((p: unknown): p is string => typeof p === 'string' && p.trim().length > 0)
    : [];

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
      packageType: packageType,
      // subscriptionPlan MUST stay in sync with packageType (see comment on
      // subscriptionPlanForPackage above) or /shop/profile's self-heal resets
      // packageType back to the plan-derived default.
      subscriptionPlan: subscriptionPlanForPackage(packageType),
      // Landing-page collected profile fields — persisted here so the Profile
      // page shows what the shopkeeper already typed, instead of asking again.
      address: address,
      mobile: mobile,
      gst: gst,
      // Mill sub-type + processed products — only populated when the shopkeeper
      // signs up as Bada Udyog → Mills & Grain Processing and picks a mill
      // type + products in step 3.
      businessSubtype: businessSubtype,
      businessProducts: businessProducts,
      subscriptionStatus: 'trial',
      subscriptionTrialEnds: trialEnds,
      subscriptionExpiry: trialEnds,
    },
  });

  return json(buildTokenResponse(user), 201);
});
