import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json, readBody } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/v1/category-configs/:slug */
export const GET = handle(async (req, ctx: any) => {
  await requireUser(req);
  const { slug } = await ctx.params;

  const [row] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM category_configs WHERE slug = $1 LIMIT 1`, slug
  );

  if (!row) return json({ error: 'Not found' }, 404);
  return json(normalise(row));
});

/** PUT /api/v1/category-configs/:slug — full update */
export const PUT = handle(async (req, ctx: any) => {
  await requireUser(req);
  const { slug } = await ctx.params;
  const body = await readBody(req);
  const { name, nameHi, nameMr, emoji, industryCategoryName, attributeSchema, active, sortOrder } = body;

  const [row] = await prisma.$queryRawUnsafe<any[]>(
    `UPDATE category_configs
     SET name = COALESCE($2, name),
         name_hi = $3,
         name_mr = $4,
         emoji = $5,
         industry_category_name = $6,
         attribute_schema = COALESCE($7::jsonb, attribute_schema),
         active = COALESCE($8, active),
         sort_order = COALESCE($9, sort_order),
         updated_at = NOW()
     WHERE slug = $1
     RETURNING *`,
    slug, name ?? null, nameHi ?? null, nameMr ?? null, emoji ?? null,
    industryCategoryName ?? null,
    attributeSchema ? JSON.stringify(attributeSchema) : null,
    active ?? null, sortOrder ?? null,
  );

  if (!row) return json({ error: 'Not found' }, 404);
  return json(normalise(row));
});

/** DELETE /api/v1/category-configs/:slug — soft-delete */
export const DELETE = handle(async (req, ctx: any) => {
  await requireUser(req);
  const { slug } = await ctx.params;

  await prisma.$executeRawUnsafe(
    `UPDATE category_configs SET active = false, updated_at = NOW() WHERE slug = $1`, slug
  );
  return json({ ok: true });
});

function normalise(r: any) {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    nameHi: r.name_hi,
    nameMr: r.name_mr,
    emoji: r.emoji,
    industryCategoryName: r.industry_category_name,
    attributeSchema: typeof r.attribute_schema === 'string' ? JSON.parse(r.attribute_schema) : r.attribute_schema,
    active: r.active,
    sortOrder: r.sort_order,
  };
}
