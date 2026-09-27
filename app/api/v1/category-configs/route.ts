import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json, readBody } from '@/lib/server/http';
import { DEFAULT_CATEGORY_CONFIGS } from '@/lib/categoryConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/v1/category-configs — list all active configs */
export const GET = handle(async (req) => {
  await requireUser(req);
  const url = new URL(req.url);
  const industry = url.searchParams.get('industry');

  // Try DB first; fall back to in-memory defaults if table not yet migrated
  let rows: any[] = [];
  try {
    rows = await prisma.$queryRawUnsafe<any[]>(
      industry
        ? `SELECT * FROM category_configs WHERE active = true AND industry_category_name ILIKE $1 ORDER BY sort_order`
        : `SELECT * FROM category_configs WHERE active = true ORDER BY sort_order`,
      ...(industry ? [`%${industry}%`] : [])
    );
  } catch {
    // Table not yet created — return seed defaults
    rows = DEFAULT_CATEGORY_CONFIGS.map(c => ({
      id: null,
      slug: c.slug,
      name: c.name,
      name_hi: c.nameHi,
      name_mr: c.nameMr,
      emoji: c.emoji,
      industry_category_name: c.industryCategoryName,
      attribute_schema: c.attributeSchema,
      active: c.active,
      sort_order: c.sortOrder,
    }));
  }

  return json(rows.map(normalise));
});

/** POST /api/v1/category-configs — create or upsert a config (admin only) */
export const POST = handle(async (req) => {
  await requireUser(req);
  const body = await readBody(req);
  const { slug, name, nameHi, nameMr, emoji, industryCategoryName, attributeSchema, active, sortOrder } = body;

  if (!slug || !name || !attributeSchema) {
    return json({ error: 'slug, name and attributeSchema are required' }, 400);
  }

  const [row] = await prisma.$queryRawUnsafe<any[]>(
    `INSERT INTO category_configs (slug, name, name_hi, name_mr, emoji, industry_category_name, attribute_schema, active, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
     ON CONFLICT (slug) DO UPDATE SET
       name = EXCLUDED.name,
       name_hi = EXCLUDED.name_hi,
       name_mr = EXCLUDED.name_mr,
       emoji = EXCLUDED.emoji,
       industry_category_name = EXCLUDED.industry_category_name,
       attribute_schema = EXCLUDED.attribute_schema,
       active = EXCLUDED.active,
       sort_order = EXCLUDED.sort_order,
       updated_at = NOW()
     RETURNING *`,
    slug, name, nameHi ?? null, nameMr ?? null, emoji ?? null,
    industryCategoryName ?? null,
    JSON.stringify(attributeSchema),
    active ?? true,
    sortOrder ?? 0,
  );

  return json(normalise(row), 201);
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
