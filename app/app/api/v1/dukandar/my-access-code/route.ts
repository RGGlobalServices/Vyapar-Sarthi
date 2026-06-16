import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function generateNameBasedCode(nameBase: string) {
  const clean = nameBase.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 5);
  const suffix = Math.floor(Math.random() * 900) + 100;
  return clean + suffix;
}

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  let refCode = await prisma.referralCode.findUnique({ where: { userId: user.uuid! } });
  if (!refCode) {
    const base = user.storeName || user.fullName || user.name || user.email;
    const code = generateNameBasedCode(base);
    refCode = await prisma.referralCode.create({ data: { userId: user.uuid, code } });
  }
  const shop = await prisma.shop.findFirst({ where: { ownerId: user.uuid! } });
  return json({
    accessCode: refCode.code,
    shopName: shop?.name || user.storeName || '',
    ownerName: user.fullName || user.name || '',
  });
});
