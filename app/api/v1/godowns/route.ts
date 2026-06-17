import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { dbGodowns, generateGodownCode } from '@/lib/server/godowns';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /godowns
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const rows = await dbGodowns(shop.id);
  return json(rows);
});

// POST /godowns
export const POST = handle(async (req) => {
  const { user, shop } = await requireShop(req);
  const { name, location } = await readBody(req);
  if (!name?.trim()) throw new ApiError(400, 'name is required');

  // Generate unique code
  let godownCode = '';
  for (let i = 0; i < 5; i++) {
    godownCode = generateGodownCode(name.trim());
    const existing = (await prisma.$queryRaw`SELECT id FROM godowns WHERE godown_code = ${godownCode} LIMIT 1`) as unknown[];
    if (!existing || existing.length === 0) break;
  }

  const rows = (await prisma.$queryRaw`
    INSERT INTO godowns (shop_id, owner_id, name, location, godown_code)
    VALUES (${shop.id}::uuid, ${user.uuid}::uuid, ${name.trim()}, ${location?.trim() || null}, ${godownCode})
    RETURNING *
  `) as unknown[];
  return json(rows[0]);
});
