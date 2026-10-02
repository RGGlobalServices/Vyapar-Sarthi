import prisma from '@/lib/server/prisma';

/**
 * Purchase / Sale tag + bill link on hamali (expenses), freight (freight_entries) and broker commission (commission_entries).
 * Columns come from supabase/18_purchase_sale_tags.sql and are deliberately NOT in prisma/schema.prisma (same approach as
 * jobWorkLink.ts), so they are read/written with small raw queries that run only once the columns exist.
 *   direction 'purchase' | 'sale' · purchase_invoice_id (purchase bill) · challan_id (sale = delivery challan)
 */
export type Direction = 'purchase' | 'sale';
export type BillTable = 'expenses' | 'freight_entries' | 'commission_entries';
export type Tag = { direction: Direction | null; purchaseInvoiceId: string | null; challanId: string | null };

let ready = false;
let checkedAt = 0;

export async function billTagColumns(): Promise<boolean> {
  if (ready) return true;
  if (Date.now() - checkedAt < 60_000) return false;
  checkedAt = Date.now();
  try {
    const rows = await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name IN ('expenses','freight_entries','commission_entries')
        AND column_name IN ('direction','purchase_invoice_id')`;
    ready = (rows[0]?.n ?? 0) >= 6;
  } catch { ready = false; }
  return ready;
}

type Db = Pick<typeof prisma, '$queryRaw' | '$executeRawUnsafe'>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tag rows (by id) as Purchase or Sale and link them to their bill. No-op until the columns exist. */
export async function tagRows(db: Db, table: BillTable, ids: string[], tag: { direction: Direction; purchaseInvoiceId?: string | null; challanId?: string | null }) {
  const clean = ids.filter((i) => UUID.test(i));
  if (!clean.length || !(await billTagColumns())) return;
  const pi = tag.purchaseInvoiceId && UUID.test(tag.purchaseInvoiceId) ? tag.purchaseInvoiceId : null;
  const ch = tag.challanId && UUID.test(tag.challanId) ? tag.challanId : null;
  // freight_entries already has a real challan_id column (FK); the other two tables get the plain one
  await db.$executeRawUnsafe(
    `UPDATE ${table} SET direction = $1, purchase_invoice_id = COALESCE($2::uuid, purchase_invoice_id), challan_id = COALESCE($3::uuid, challan_id) WHERE id = ANY($4::uuid[])`,
    tag.direction, pi, ch, clean,
  );
}

/** id -> tag for the given rows (empty until the columns exist). */
export async function readTags(db: Db, table: BillTable, ids: string[]): Promise<Map<string, Tag>> {
  const out = new Map<string, Tag>();
  const clean = ids.filter((i) => UUID.test(i));
  if (!clean.length || !(await billTagColumns())) return out;
  const rows = (await (db as any).$queryRawUnsafe(
    `SELECT id::text AS id, direction, purchase_invoice_id::text AS pi, challan_id::text AS ch FROM ${table} WHERE id = ANY($1::uuid[])`, clean,
  )) as Array<{ id: string; direction: string | null; pi: string | null; ch: string | null }>;
  for (const r of rows) out.set(r.id, { direction: r.direction === 'purchase' || r.direction === 'sale' ? r.direction : null, purchaseInvoiceId: r.pi, challanId: r.ch });
  return out;
}

/** Bill label for tags: "Purchase INV-12" / "Sale CH-AB12CD34" (looked up in one query each). */
export async function billLabels(db: Db, shopId: string, tags: Tag[]): Promise<{ purchase: Map<string, string>; challan: Map<string, string> }> {
  const pIds = Array.from(new Set(tags.map((t) => t.purchaseInvoiceId).filter(Boolean) as string[]));
  const cIds = Array.from(new Set(tags.map((t) => t.challanId).filter(Boolean) as string[]));
  const purchase = new Map<string, string>(); const challan = new Map<string, string>();
  if (pIds.length) {
    const rows = await (prisma as any).purchaseInvoice.findMany({ where: { shopId, id: { in: pIds } }, select: { id: true, invoiceNumber: true } });
    for (const r of rows) purchase.set(r.id, r.invoiceNumber || r.id.slice(0, 8));
  }
  if (cIds.length) {
    const rows = await (prisma as any).deliveryChallan.findMany({ where: { shopId, id: { in: cIds } }, select: { id: true, challanNumber: true } });
    for (const r of rows) challan.set(r.id, r.challanNumber);
  }
  return { purchase, challan };
}

/** Adds `direction`, `billType`, `billId`, `billLabel` to list rows (each must have an `id`). Rows are returned unchanged until the columns exist. */
export async function withBillTags<T extends { id: string }>(shopId: string, table: BillTable, rows: T[]): Promise<Array<T & { direction: Direction | null; billType: Direction | null; billId: string | null; billLabel: string | null }>> {
  const tags = await readTags(prisma as any, table, rows.map((r) => r.id));
  const labels = await billLabels(prisma as any, shopId, Array.from(tags.values()));
  return rows.map((r) => {
    const t = tags.get(r.id);
    const billId = t?.purchaseInvoiceId || t?.challanId || null;
    const billType: Direction | null = t?.purchaseInvoiceId ? 'purchase' : t?.challanId ? 'sale' : null;
    const billLabel = t?.purchaseInvoiceId ? labels.purchase.get(t.purchaseInvoiceId) ?? null : t?.challanId ? labels.challan.get(t.challanId) ?? null : null;
    return { ...r, direction: t?.direction ?? null, billType, billId, billLabel };
  });
}
