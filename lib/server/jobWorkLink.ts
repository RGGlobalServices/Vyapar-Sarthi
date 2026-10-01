import prisma from '@/lib/server/prisma';

/**
 * production_batches.job_work_order_id comes from supabase/17_batch_job_work_link.sql — a permanent link from a batch to
 * the Job Work order it processes. Like the lot columns it is deliberately NOT in prisma/schema.prisma (a build deployed
 * before the migration would otherwise fail on every batch query), so it is read/written with small raw queries that only
 * run once the column exists. Until then the older link — the order number written into the batch notes — keeps working.
 */

let ready = false;
let checkedAt = 0;
const RECHECK_MS = 60_000;

export async function jobWorkLinkColumn(): Promise<boolean> {
  const now = Date.now();
  if (ready) return true;
  if (now - checkedAt < RECHECK_MS) return false;
  checkedAt = now;
  try {
    const rows = await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'production_batches' AND column_name = 'job_work_order_id'`;
    ready = (rows[0]?.n ?? 0) > 0;
  } catch {
    ready = false;
  }
  return ready;
}

type Db = Pick<typeof prisma, '$queryRaw' | '$executeRawUnsafe'>;

/** Links a batch to its Job Work order. No-op until the column exists. */
export async function setBatchJobWork(db: Db, batchId: string, jobWorkOrderId: string | null | undefined) {
  if (!jobWorkOrderId || !(await jobWorkLinkColumn())) return;
  await db.$executeRawUnsafe(`UPDATE production_batches SET job_work_order_id = $1::uuid WHERE id = $2::uuid`, jobWorkOrderId, batchId);
}

/** ids of the batches permanently linked to any of the given orders (empty until the column exists). */
export async function batchIdsLinkedToOrders(db: Db, shopId: string, orderIds: string[]): Promise<string[]> {
  if (!orderIds.length || !(await jobWorkLinkColumn())) return [];
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT id::text AS id FROM production_batches
    WHERE shop_id = ${shopId}::uuid AND job_work_order_id = ANY(${orderIds}::uuid[])`;
  return rows.map((r) => r.id);
}

/** batchId -> job work order id, for the given batches (empty until the column exists). */
export async function jobWorkOrderIdsOfBatches(db: Db, batchIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!batchIds.length || !(await jobWorkLinkColumn())) return out;
  const rows = await db.$queryRaw<Array<{ id: string; jw: string | null }>>`
    SELECT id::text AS id, job_work_order_id::text AS jw FROM production_batches WHERE id = ANY(${batchIds}::uuid[])`;
  for (const r of rows) if (r.jw) out.set(r.id, r.jw);
  return out;
}
