import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { dbGodown } from '@/lib/server/godowns';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// GET /godowns/:id
export const GET = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const godown = await dbGodown(id, shop.id);
  if (!godown) throw new ApiError(404, 'Godown not found');
  return json(godown);
});

// PATCH /godowns/:id
export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const { name, location } = await readBody(req);
  const rows = (await prisma.$queryRaw`
    UPDATE godowns
    SET name     = COALESCE(${name?.trim() ?? null}, name),
        location = ${location !== undefined ? location?.trim() || null : null}
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
  await prisma.$executeRaw`DELETE FROM godown_products WHERE godown_id = ${id}::uuid`;
  await prisma.$executeRaw`DELETE FROM godowns WHERE id = ${id}::uuid`;
  return json({ detail: 'Godown deleted' });
});
