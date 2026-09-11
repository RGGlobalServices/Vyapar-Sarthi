import prisma from '@/lib/server/prisma';
import { requireAdmin } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin CRUD for the platform-wide IndustryCategory master list — lets an
 * admin add/edit/deactivate categories and set mappedBusinessType without a
 * code deploy (see schema.prisma's IndustryCategory model comment for what
 * this table is and why it's separate from the per-shop product Category).
 *
 * GET  — list every category (including inactive ones — admin needs to see
 *        what's disabled to re-enable it).
 * POST — create a new category.
 */
export const GET = handle(async (req) => {
  await requireAdmin(req);
  const categories = await prisma.industryCategory.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return json({ categories });
});

export const POST = handle(async (req) => {
  await requireAdmin(req);
  const body = await readBody<any>(req);

  const name = (body.name || '').toString().trim();
  const businessTypeMeta = (body.businessTypeMeta || '').toString().trim();
  if (!name) throw new ApiError(400, 'Category name is required');
  if (!businessTypeMeta) throw new ApiError(400, 'Business Type (meta) is required');

  const category = await prisma.industryCategory.create({
    data: {
      name,
      nameHi: body.nameHi || null,
      nameMr: body.nameMr || null,
      emoji: body.emoji || null,
      businessTypeMeta,
      mappedBusinessType: body.mappedBusinessType || null,
      active: body.active !== false,
      sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
    },
  });
  return json(category, 201);
});
