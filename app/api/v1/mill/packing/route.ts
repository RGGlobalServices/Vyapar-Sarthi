import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, query, ApiError } from '@/lib/server/http';
import { isMillBillingPackage } from '@/lib/config/packageConfig';
import { round3 } from '@/lib/server/millProduction';
import { packingTable, parsePackLines, insertPackLines, packsOfOutputs } from '@/lib/server/packing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function millShop(req: Request) {
  const { shop } = await requireShop(req);
  if (!isMillBillingPackage((shop as any).packageType)) throw new ApiError(403, 'Packing is a Bada Udyog feature.', 'NOT_MILL_SHOP');
  return shop;
}

const OUTPUTS_SQL = `
  SELECT o.id::text AS output_id, b.id::text AS batch_id, b.batch_number, b.started_at, b.closed_at, o.product_id::text AS product_id,
         COALESCE(p.name, o.name) AS name, o.quantity_kg::float8 AS kg,
         COALESCE((SELECT sum(k.pack_kg * k.packs) FROM production_output_packs k WHERE k.output_id = o.id), 0)::float8 AS packed_kg,
         (SELECT lot_number FROM finished_goods_lots f WHERE f.batch_id = b.id AND f.product_id = o.product_id ORDER BY f.created_at ASC LIMIT 1) AS lot_number
    FROM production_outputs o
    JOIN production_batches b ON b.id = o.batch_id
    LEFT JOIN products p ON p.id = o.product_id
   WHERE o.shop_id = $1::uuid AND o.output_type = 'finished_good' AND b.status = 'closed' AND b.batch_type <> 'JOB_WORK'`;

/**
 * GET  /api/v1/mill/packing — the ready products of finished production runs: `pending` (not packed, or only partly) and `packed`
 *      (recently fully packed, with their pack lines so a mistake can be fixed). Bada Udyog only.
 * POST /api/v1/mill/packing  { outputId, lines: [{ packKg, packs, packType }] } — record how (part of) a ready product was packed.
 *      The packs can never add up to more than was produced. Stock stays in kg; the packs are recorded on the product's lot.
 */
export const GET = handle(async (req) => {
  const shop = await millShop(req);
  if (!(await packingTable())) return json({ enabled: false, pending: [], packed: [] });
  const q = query(req);
  const rows: any[] = await prisma.$queryRawUnsafe(`${OUTPUTS_SQL} ORDER BY b.closed_at DESC NULLS LAST, o.created_at DESC LIMIT ${q.limit ? Math.min(500, Number(q.limit) || 200) : 200}`, shop.id);
  const map = (r: any) => ({
    outputId: r.output_id, batchId: r.batch_id, batchNumber: r.batch_number, date: r.closed_at || r.started_at, productId: r.product_id, name: r.name,
    kg: round3(r.kg), packedKg: round3(r.packed_kg), unpackedKg: round3(Math.max(0, r.kg - r.packed_kg)), lotNumber: r.lot_number,
  });
  const all = rows.map(map);
  const pending = all.filter((r) => r.unpackedKg > 0.005);
  const packedRows = all.filter((r) => r.unpackedKg <= 0.005 && r.packedKg > 0).slice(0, 30);
  const lines = await packsOfOutputs(prisma, packedRows.map((r) => r.outputId));
  const pendingLines = await packsOfOutputs(prisma, pending.filter((r) => r.packedKg > 0).map((r) => r.outputId));
  return json({
    enabled: true,
    pending: pending.map((r) => ({ ...r, lines: pendingLines.get(r.outputId) ?? [] })),
    packed: packedRows.map((r) => ({ ...r, lines: lines.get(r.outputId) ?? [] })),
  });
});

export const POST = handle(async (req) => {
  const shop = await millShop(req);
  if (!(await packingTable())) throw new ApiError(503, 'Packing is not set up on this database yet.', 'PACKING_NOT_READY');
  const body = await readBody<any>(req);
  const outputId = String(body.outputId ?? '').trim();
  if (!outputId) throw new ApiError(400, 'outputId is required.', 'OUTPUT_REQUIRED');

  const out: any[] = await prisma.$queryRawUnsafe(`${OUTPUTS_SQL} AND o.id = $2::uuid`, shop.id, outputId);
  const o = out[0];
  if (!o) throw new ApiError(404, 'That ready product was not found (or its run is not finished).', 'OUTPUT_NOT_FOUND');
  const left = round3(Math.max(0, o.kg - o.packed_kg));
  const lines = parsePackLines(body.lines, left, 'Packing');
  if (!lines.length) throw new ApiError(400, 'Add at least one pack size.', 'PACKS_REQUIRED');

  await prisma.$transaction(async (tx: any) => {
    await insertPackLines(tx, shop.id, o.batch_id, [{ outputId, lines }]);
    // the product's default pack size is filled from its first packing (never overwritten): billing then pre-fills bags x size
    if (o.product_id && lines.length === 1) {
      await tx.$executeRawUnsafe(`UPDATE products SET pack_size = $1::float8, pack_unit = COALESCE(pack_unit, 'Kg') WHERE id = $2::uuid AND shop_id = $3::uuid AND pack_size IS NULL`, lines[0].packKg, o.product_id, shop.id);
    }
  }, { timeout: 30000, maxWait: 10000 });
  return json({ success: true, packedKg: round3(lines.reduce((s, l) => s + l.packKg * l.packs, 0)) }, 201);
});
