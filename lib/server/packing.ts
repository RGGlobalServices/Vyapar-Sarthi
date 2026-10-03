import { randomUUID } from 'crypto';
import prisma from '@/lib/server/prisma';
import { ApiError } from '@/lib/server/http';
import { round3 } from '@/lib/server/millProduction';

/**
 * How a ready product was packed (table production_output_packs, supabase/19_production_output_packs.sql): one row per pack size of one
 * production output, e.g. "50 bags of 30 kg" and "10 gonis of 50 kg". Stock stays in kg; this records the packs. An output with no rows
 * is "not packed yet" (Milling -> Not packed). The table is not in prisma/schema.prisma (same approach as jobWorkLink / billTags), so
 * it is read and written with raw queries that run only once it exists.
 */

export const PACK_TYPES = ['bag', 'goni', 'other'] as const;
export type PackType = (typeof PACK_TYPES)[number];
export type PackLine = { packKg: number; packs: number; packType: PackType };

let ready = false;
let checkedAt = 0;
export async function packingTable(): Promise<boolean> {
  if (ready) return true;
  if (Date.now() - checkedAt < 60_000) return false;
  checkedAt = Date.now();
  try {
    const r = await prisma.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'production_output_packs'`;
    ready = (r[0]?.n ?? 0) > 0;
  } catch { ready = false; }
  return ready;
}

/** What the client sent for one output -> clean pack lines. The packed weight can never exceed the output's weight. */
export function parsePackLines(raw: any, outputKg: number, label = 'Packing'): PackLine[] {
  if (raw === undefined || raw === null || (Array.isArray(raw) && raw.length === 0)) return [];
  if (!Array.isArray(raw)) throw new ApiError(400, `${label}: packs must be a list.`, 'INVALID_PACKS');
  if (raw.length > 12) throw new ApiError(400, `${label}: at most 12 pack sizes.`, 'TOO_MANY_PACKS');
  const lines = raw.map((l: any): PackLine => {
    const packKg = Number(l?.packKg ?? l?.kg);
    const packs = Math.round(Number(l?.packs ?? l?.n));
    if (!isFinite(packKg) || packKg <= 0 || packKg > 100000) throw new ApiError(400, `${label}: enter the weight of one pack (kg).`, 'INVALID_PACK_KG');
    if (!isFinite(packs) || packs <= 0 || packs > 1_000_000) throw new ApiError(400, `${label}: enter how many packs.`, 'INVALID_PACK_COUNT');
    const type = String(l?.packType ?? l?.type ?? 'bag').toLowerCase();
    return { packKg: round3(packKg), packs, packType: (PACK_TYPES as readonly string[]).includes(type) ? (type as PackType) : 'bag' };
  });
  const total = round3(lines.reduce((s, l) => s + l.packKg * l.packs, 0));
  if (total > round3(outputKg) + 0.005) {
    throw new ApiError(400, `${label}: the packs add up to ${total} kg but only ${round3(outputKg)} kg can be packed.`, 'PACKED_MORE_THAN_PRODUCED');
  }
  return lines;
}

/** Writes pack lines for outputs (one statement). No-op without lines or before the table exists. */
export async function insertPackLines(db: any, shopId: string, batchId: string, rows: Array<{ outputId: string; lines: PackLine[] }>) {
  const flat = rows.flatMap((r) => r.lines.map((l) => ({ id: randomUUID(), output_id: r.outputId, pack_kg: l.packKg, packs: l.packs, pack_type: l.packType })));
  if (!flat.length || !(await packingTable())) return;
  await db.$executeRawUnsafe(
    `INSERT INTO production_output_packs (id, shop_id, batch_id, output_id, pack_kg, packs, pack_type)
     SELECT id, $1::uuid, $2::uuid, output_id, pack_kg, packs, pack_type
       FROM jsonb_to_recordset($3::jsonb) AS x(id uuid, output_id uuid, pack_kg float8, packs int, pack_type text)`,
    shopId, batchId, JSON.stringify(flat),
  );
}

/** output id -> its pack lines, for the given outputs. */
export async function packsOfOutputs(db: any, outputIds: string[]): Promise<Map<string, Array<{ id: string; packKg: number; packs: number; packType: string }>>> {
  const out = new Map<string, Array<{ id: string; packKg: number; packs: number; packType: string }>>();
  if (!outputIds.length || !(await packingTable())) return out;
  const rows: any[] = await db.$queryRawUnsafe(
    `SELECT id::text AS id, output_id::text AS output_id, pack_kg::float8 AS pack_kg, packs, pack_type FROM production_output_packs WHERE output_id = ANY($1::uuid[]) ORDER BY created_at ASC`,
    outputIds,
  );
  for (const r of rows) {
    const l = out.get(r.output_id) ?? [];
    l.push({ id: r.id, packKg: Number(r.pack_kg), packs: Number(r.packs), packType: r.pack_type });
    out.set(r.output_id, l);
  }
  return out;
}

/**
 * Pack summary for finished-goods lots: "batch + product" -> [{ packKg, packs, packType }] (the same pack size added together).
 * A lot is one ready product of one run, so this is how that lot was packed. Empty until packing is recorded.
 */
export async function packSummaryForLots(db: any, shopId: string, lots: Array<{ batchId: string; productId: string }>): Promise<Map<string, Array<{ packKg: number; packs: number; packType: string }>>> {
  const out = new Map<string, Array<{ packKg: number; packs: number; packType: string }>>();
  if (!lots.length || !(await packingTable())) return out;
  const rows: any[] = await db.$queryRawUnsafe(
    `SELECT o.batch_id::text AS batch_id, o.product_id::text AS product_id, k.pack_kg::float8 AS pack_kg, k.pack_type, sum(k.packs)::int AS packs
       FROM production_output_packs k JOIN production_outputs o ON o.id = k.output_id
      WHERE k.shop_id = $1::uuid AND o.batch_id = ANY($2::uuid[])
      GROUP BY o.batch_id, o.product_id, k.pack_kg, k.pack_type ORDER BY k.pack_kg DESC`,
    shopId, [...new Set(lots.map((l) => l.batchId))],
  );
  for (const r of rows) {
    const key = `${r.batch_id}:${r.product_id}`;
    const l = out.get(key) ?? [];
    l.push({ packKg: Number(r.pack_kg), packs: Number(r.packs), packType: r.pack_type });
    out.set(key, l);
  }
  return out;
}
