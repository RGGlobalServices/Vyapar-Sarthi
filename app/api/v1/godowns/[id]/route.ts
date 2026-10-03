import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { dbGodown, ensureGodownTables } from '@/lib/server/godowns';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// GET /godowns/:id
export const GET = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);

  await ensureGodownTables();
  const godown = await dbGodown(id, shop.id);
  if (!godown) throw new ApiError(404, 'Godown not found');
  return json(godown);
});

// PATCH /godowns/:id
export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);

  const { name, location } = await readBody(req);
  await ensureGodownTables();
  const rows = (await prisma.$queryRaw`
    UPDATE godowns
    SET name     = COALESCE(${name?.trim() || null}, name),
        location = CASE WHEN ${location !== undefined}::boolean THEN ${location?.trim() || null}::varchar ELSE location END
    WHERE id = ${id}::uuid AND shop_id = ${shop.id}::uuid
    RETURNING *
  `) as unknown[];
  if (!rows || rows.length === 0) throw new ApiError(404, 'Godown not found');
  return json(rows[0]);
});

// DELETE /godowns/:id
export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);

  const existing = (await prisma.$queryRaw`SELECT id FROM godowns WHERE id = ${id}::uuid AND shop_id = ${shop.id}::uuid LIMIT 1`) as unknown[];
  if (!existing || existing.length === 0) throw new ApiError(404, 'Godown not found');
  // a godown that still holds stock, or that raw lots / finished goods sit in, cannot just be deleted (that stock would lose its place)
  const held = (await prisma.$queryRaw`SELECT COALESCE(SUM(quantity), 0)::float8 AS q FROM godown_products WHERE godown_id = ${id}::uuid AND quantity > 0`) as Array<{ q: number }>;
  if (Number(held[0]?.q) > 0) throw new ApiError(409, `This godown still holds ${Math.round(Number(held[0].q) * 1000) / 1000} units of stock - transfer it to another godown first.`);
  const lots = (await prisma.$queryRaw`SELECT (SELECT count(*) FROM raw_material_lots WHERE godown_id = ${id}::uuid AND COALESCE(remaining_quantity, 0) > 0)::int AS n`) as Array<{ n: number }>;
  if (Number(lots[0]?.n) > 0) throw new ApiError(409, 'Raw material lots with stock are kept in this godown - move or use them first.');
  await prisma.$executeRaw`DELETE FROM godown_products WHERE godown_id = ${id}::uuid`;
  await prisma.$executeRaw`DELETE FROM godowns WHERE id = ${id}::uuid`;
  return json({ detail: 'Godown deleted' });
});
