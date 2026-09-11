import prisma from '@/lib/server/prisma';
import { requireAdmin } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH — edit a category's fields (name, meta, mapped business type) or
 * toggle it active/inactive. Inactive categories stop appearing in the
 * Profile wizard's Step 2 search (see master-data/industry-categories which
 * filters active:true) but existing shops that already picked one keep
 * their industryCategoryId — this only affects future selection.
 * DELETE — hard delete, only really meant for cleaning up a mis-typed entry
 * nobody has picked yet; prefer PATCH active:false for anything already live.
 */
export const PATCH = handle<Ctx>(async (req, { params }) => {
  await requireAdmin(req);
  const { id } = await params;
  const body = await readBody<any>(req);

  const existing = await prisma.industryCategory.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'Category not found');

  const data: any = {};
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.nameHi !== undefined) data.nameHi = body.nameHi || null;
  if (body.nameMr !== undefined) data.nameMr = body.nameMr || null;
  if (body.emoji !== undefined) data.emoji = body.emoji || null;
  if (body.businessTypeMeta !== undefined) data.businessTypeMeta = String(body.businessTypeMeta).trim();
  if (body.mappedBusinessType !== undefined) data.mappedBusinessType = body.mappedBusinessType || null;
  if (body.active !== undefined) data.active = !!body.active;
  if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder) || 0;

  const updated = await prisma.industryCategory.update({ where: { id }, data });
  return json(updated);
});

export const DELETE = handle<Ctx>(async (req, { params }) => {
  await requireAdmin(req);
  const { id } = await params;
  const existing = await prisma.industryCategory.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'Category not found');
  await prisma.industryCategory.delete({ where: { id } });
  return json({ success: true });
});
