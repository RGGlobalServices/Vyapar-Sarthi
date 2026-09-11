import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/master-data/industry-categories — the platform-wide list of
 * industry categories (Kirana, Garment, Pharmacy, Bhagar/Rice Mill, …) that
 * Profile's "Change Business Category" wizard reads for its searchable Step
 * 2. Shop-authenticated (any logged-in shop can read this), not shop-scoped
 * data — see the IndustryCategory model comment in schema.prisma for why
 * this is separate from the per-shop /master-data (Category/Brand/Unit).
 *
 * Query params (all optional):
 *   search — case-insensitive substring match on name
 *   meta   — filter to one businessTypeMeta ('retail'|'wholesale'|'distributor'|'service'|'manufacturing'|'other')
 */
export const GET = handle(async (req) => {
  await requireShop(req, { enforceSubscription: false });
  const url = new URL(req.url);
  const search = url.searchParams.get('search')?.trim();
  const meta = url.searchParams.get('meta')?.trim();

  const where: any = { active: true };
  if (meta) where.businessTypeMeta = meta;
  if (search) where.name = { contains: search, mode: 'insensitive' };

  const categories = await prisma.industryCategory.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  return json({ categories });
});
