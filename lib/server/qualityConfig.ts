import prisma from '@/lib/server/prisma';
import { ApiError } from '@/lib/server/http';
import { QUALITY_FLAG_THRESHOLDS } from '@/lib/businessConfig';

/**
 * Quality / Lab support that is not in prisma/schema.prisma (table from supabase/21_quality_thresholds.sql):
 *  - per-shop flag limits (amber / red %), defaulting to QUALITY_FLAG_THRESHOLDS when the shop never set its own;
 *  - "is this raw lot rejected?" — a lot whose most recent quality test was Rejected cannot go into production.
 */
export type Bands = { amber: number; red: number };
export type Thresholds = { moisturePct: Bands; foreignMatterPct: Bands; brokenPct: Bands; damagedPct: Bands };
export const THRESHOLD_KEYS = ['moisturePct', 'foreignMatterPct', 'brokenPct', 'damagedPct'] as const;

export const DEFAULT_THRESHOLDS: Thresholds = JSON.parse(JSON.stringify(QUALITY_FLAG_THRESHOLDS));

let ready = false;
let checkedAt = 0;
async function tableReady(): Promise<boolean> {
  if (ready) return true;
  if (Date.now() - checkedAt < 60_000) return false;
  checkedAt = Date.now();
  try {
    const r = await prisma.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'quality_thresholds'`;
    ready = (r[0]?.n ?? 0) > 0;
  } catch { ready = false; }
  return ready;
}

export async function getThresholds(shopId: string): Promise<{ thresholds: Thresholds; custom: boolean; canCustomize: boolean }> {
  if (!(await tableReady())) return { thresholds: DEFAULT_THRESHOLDS, custom: false, canCustomize: false };
  try {
    const rows: Array<{ config: any }> = await prisma.$queryRawUnsafe(`SELECT config FROM quality_thresholds WHERE shop_id = $1::uuid`, shopId);
    if (!rows.length) return { thresholds: DEFAULT_THRESHOLDS, custom: false, canCustomize: true };
    return { thresholds: { ...DEFAULT_THRESHOLDS, ...rows[0].config }, custom: true, canCustomize: true };
  } catch { return { thresholds: DEFAULT_THRESHOLDS, custom: false, canCustomize: false }; }
}

/** Validates what the client sent: every key present, 0 <= amber <= red <= 100. Throws a 400 otherwise. */
export function parseThresholds(raw: any): Thresholds {
  const out: any = {};
  for (const k of THRESHOLD_KEYS) {
    const a = Number(raw?.[k]?.amber), r = Number(raw?.[k]?.red);
    if (!Number.isFinite(a) || !Number.isFinite(r) || a < 0 || r > 100 || a > r) {
      throw new ApiError(400, `${k}: amber and red must be numbers with 0 ≤ amber ≤ red ≤ 100`);
    }
    out[k] = { amber: a, red: r };
  }
  return out;
}

export async function saveThresholds(shopId: string, t: Thresholds | null): Promise<void> {
  if (!(await tableReady())) throw new ApiError(503, 'Custom limits are not available yet (database migration pending).');
  if (t === null) { await prisma.$executeRawUnsafe(`DELETE FROM quality_thresholds WHERE shop_id = $1::uuid`, shopId); return; }
  await prisma.$executeRawUnsafe(
    `INSERT INTO quality_thresholds (shop_id, config, updated_at) VALUES ($1::uuid, $2::jsonb, now())
     ON CONFLICT (shop_id) DO UPDATE SET config = EXCLUDED.config, updated_at = now()`, shopId, JSON.stringify(t));
}

/** Of these lots, the ones whose most recent quality test is Rejected. Works inside or outside a transaction (`db`). */
export async function rejectedLots(db: any, shopId: string, lotIds: string[]): Promise<Array<{ id: string; lot_number: string | null }>> {
  if (!lotIds.length) return [];
  return db.$queryRawUnsafe(
    `SELECT l.id::text AS id, l.lot_number
       FROM raw_material_lots l
      WHERE l.shop_id = $1::uuid AND l.id = ANY($2::uuid[])
        AND (SELECT t.decision FROM quality_tests t WHERE t.raw_lot_id = l.id ORDER BY t.test_date DESC, t.created_at DESC LIMIT 1) = 'rejected'`,
    shopId, lotIds);
}

export async function assertLotNotRejected(db: any, shopId: string, lotId: string): Promise<void> {
  const r = await rejectedLots(db, shopId, [lotId]);
  if (r.length) throw new ApiError(409, `Lot ${r[0].lot_number || lotId} was rejected in the Quality Lab — it cannot be used in production. Change its decision in Quality / Lab first if that was a mistake.`, 'LOT_REJECTED');
}
