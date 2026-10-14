import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { isMillBillingPackage } from '@/lib/config/packageConfig';
import { packingTable, PACK_TYPES } from '@/lib/server/packing';
import { round3 } from '@/lib/server/millProduction';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** DELETE /api/v1/mill/packing/[id] — remove one pack line (a mistake in the packing); the weight goes back to "not packed". */
export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  if (!isMillBillingPackage((shop as any).packageType)) throw new ApiError(403, 'Packing is a Bada Udyog feature.', 'NOT_MILL_SHOP');
  if (!(await packingTable())) throw new ApiError(503, 'Packing is not set up on this database yet.', 'PACKING_NOT_READY');
  const n = await prisma.$executeRawUnsafe(`DELETE FROM production_output_packs WHERE id = $1::uuid AND shop_id = $2::uuid`, id, shop.id);
  if (!n) throw new ApiError(404, 'Pack line not found');
  return json({ success: true });
});

/**
 * PATCH /api/v1/mill/packing/[id] — edit one pack line (correct a mistake in packKg, packs, or packType).
 * Validates that the new weight does not exceed the output's produced kg.
 */
export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  if (!isMillBillingPackage((shop as any).packageType)) throw new ApiError(403, 'Packing is a Bada Udyog feature.', 'NOT_MILL_SHOP');
  if (!(await packingTable())) throw new ApiError(503, 'Packing is not set up on this database yet.', 'PACKING_NOT_READY');

  const body = await readBody<any>(req);
  const packKg = Number(body.packKg);
  const packs = Math.round(Number(body.packs));
  const packTypeRaw = String(body.packType ?? 'bag').toLowerCase();
  const packType = (PACK_TYPES as readonly string[]).includes(packTypeRaw) ? packTypeRaw : 'bag';

  if (!isFinite(packKg) || packKg <= 0) throw new ApiError(400, 'packKg must be > 0', 'INVALID_PACK_KG');
  if (!isFinite(packs) || packs <= 0) throw new ApiError(400, 'packs must be > 0', 'INVALID_PACK_COUNT');

  // Verify the row exists and get its output so we can validate against total produced kg.
  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT k.id::text AS id, o.quantity_kg::float8 AS output_kg,
            COALESCE((SELECT sum(k2.pack_kg * k2.packs) FROM production_output_packs k2 WHERE k2.output_id = o.id AND k2.id <> k.id::uuid), 0)::float8 AS other_packed_kg
       FROM production_output_packs k
       JOIN production_outputs o ON o.id = k.output_id
      WHERE k.id = $1::uuid AND k.shop_id = $2::uuid`,
    id, shop.id,
  );
  if (!rows.length) throw new ApiError(404, 'Pack line not found');

  const outputKg = Number(rows[0].output_kg);
  const otherKg = Number(rows[0].other_packed_kg);
  const newTotal = round3(otherKg + packKg * packs);
  if (newTotal > round3(outputKg) + 0.005) {
    throw new ApiError(400, `The updated packs add up to ${newTotal} kg but only ${round3(outputKg)} kg was produced.`, 'PACKED_MORE_THAN_PRODUCED');
  }

  await prisma.$executeRawUnsafe(
    `UPDATE production_output_packs SET pack_kg = $1::float8, packs = $2::int, pack_type = $3 WHERE id = $4::uuid AND shop_id = $5::uuid`,
    round3(packKg), packs, packType, id, shop.id,
  );
  return json({ success: true });
});
