import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/server/prisma';
import { config } from '@/lib/server/config';
import { buildTokenResponse } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The OAuth client id the Google button was issued for. Must match the audience
// of the id_token, otherwise the token was minted for a different app.
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';

// Sign in (or sign up) with a Google id_token credential from Google Identity
// Services. We verify the token with Google's tokeninfo endpoint (no extra
// dependency), then find-or-create the user and return the same JWT shape as
// /auth/login. New Google users get a free trial, mirroring /auth/register.
export const POST = handle(async (req) => {
  const { credential } = await readBody<{ credential?: string }>(req);
  if (!credential) throw new ApiError(400, 'Missing Google credential');
  if (!CLIENT_ID) throw new ApiError(500, 'Google sign-in is not configured on the server');

  // Verify the token with Google (validates signature + expiry, returns claims).
  const resp = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
  );
  if (!resp.ok) throw new ApiError(401, 'Invalid Google credential');
  const payload = await resp.json();

  if (payload.aud !== CLIENT_ID) throw new ApiError(401, 'Google token was issued for a different app');
  const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
  if (!payload.email || !emailVerified) throw new ApiError(401, 'Google account email is not verified');

  const email = String(payload.email).toLowerCase();
  const name = payload.given_name || payload.name || email.split('@')[0];
  const fullName = payload.name || null;

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // No password for Google accounts — store a random, unusable hash to satisfy
    // the schema. Start a free trial like the email signup flow does.
    const randomPassword = await bcrypt.hash(randomUUID(), 10);
    user = await prisma.user.create({
      data: { uuid: randomUUID(), email, password: randomPassword, name, fullName },
    });
    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + config.trialDays);
    await prisma.shop.create({
      data: {
        ownerId: user.uuid,
        name: `${email.split('@')[0]}'s Shop`,
        subscriptionStatus: 'trial',
        subscriptionTrialEnds: trialEnds,
        subscriptionExpiry: trialEnds,
      },
    });
  }

  return json(buildTokenResponse(user));
});
