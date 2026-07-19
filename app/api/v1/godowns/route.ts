import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { dbGodowns, generateGodownCode, ensureGodownTables } from '@/lib/server/godowns';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Auto-create tables on first use (idempotent — IF NOT EXISTS guards).

// GET /godowns
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);

  await ensureGodownTables();
  const rows = await dbGodowns(shop.id);
  return json(rows);
});

// POST /godowns
export const POST = handle(async (req) => {
  const { user, shop } = await requireShop(req);

  const { name, location } = await readBody(req);
  if (!name?.trim()) throw new ApiError(400, 'name is required');

  await ensureGodownTables();

  // Generate unique code
  let godownCode = '';
  for (let i = 0; i < 5; i++) {
    godownCode = generateGodownCode(name.trim());
    const existing = (await prisma.$queryRaw`SELECT id FROM godowns WHERE godown_code = ${godownCode} LIMIT 1`) as unknown[];
    if (!existing || existing.length === 0) break;
  }

  const godownOwnerId = user.uuid || shop.ownerId || '00000000-0000-0000-0000-000000000000';
  const newId = crypto.randomUUID();
  try {
    const rows = (await prisma.$queryRaw`
      INSERT INTO godowns (id, shop_id, owner_id, name, location, godown_code)
      VALUES (${newId}::uuid, ${shop.id}::uuid, ${godownOwnerId}::uuid, ${name.trim()}, ${location?.trim() || null}::varchar, ${godownCode})
      RETURNING *
    `) as unknown[];
    return json(rows[0]);
  } catch (err: any) {
    console.error('Godown insert error:', err);
    throw new ApiError(500, 'DB Error: ' + (err.message || err.toString()));
  }
});

