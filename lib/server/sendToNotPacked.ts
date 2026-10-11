import { randomUUID } from 'crypto';
import { unitToKg } from '@/lib/quickEntry';

/**
 * Makes a ready product show up in Milling -> "Not Packed" even though it never went through a
 * production run — a mill that buys a by-product (bran, husk …) straight from someone else in bulk,
 * or a Quick Production by-product the shopkeeper wants bagged like a finished good, needs the exact
 * same "weigh it into bags, print a slip" flow. "Not Packed" (GET/POST /mill/packing) is hard-wired to
 * production_outputs rows with output_type = 'finished_good' on a CLOSED, non-Job-Work batch — there is
 * no lighter path — so this creates one tiny synthetic ProductionBatch (batchType 'PURCHASE', already
 * closed) to carry a single ProductionOutput + FinishedGoodsLot. It never touches `products.current_stock`
 * itself — the caller (purchase save, or the production run) already credits stock through its own normal
 * path; this only adds the lot/output rows the packing queries read.
 */
export async function sendToNotPacked(
  tx: any,
  shopId: string,
  o: { productId: string; productName: string; quantity: number; unit: string; batchLabel: string; sourceNote: string },
): Promise<{ batchId: string; outputId: string; lotId: string } | null> {
  const quantity = Number(o.quantity) || 0;
  if (quantity <= 0) return null;

  // Idempotency: re-saving an edited purchase (or re-running the same production-entry call) must not
  // create a second lot for the same line every time — one already carrying this exact note means it
  // was already sent, so this is a no-op.
  const already = await tx.finishedGoodsLot.findFirst({ where: { shopId, productId: o.productId, notes: o.sourceNote.slice(0, 250) }, select: { id: true, batchId: true } });
  if (already) return { batchId: already.batchId, outputId: '', lotId: already.id };

  const quantityKg = unitToKg(quantity, o.unit) ?? quantity;

  const batchNumber = await uniqueBatchNumber(tx, shopId, o.batchLabel);
  const now = new Date();
  const batch = await tx.productionBatch.create({
    data: {
      shopId, batchNumber, batchType: 'PURCHASE', status: 'closed', currentStage: 'done',
      startedAt: now, closedAt: now, outputKg: quantityKg, notes: o.sourceNote.slice(0, 250),
    },
  });
  const output = await tx.productionOutput.create({
    data: {
      shopId, batchId: batch.id, productId: o.productId, name: o.productName.slice(0, 200), outputType: 'finished_good',
      quantity, unit: o.unit || 'kg', quantityKg, notes: o.sourceNote.slice(0, 250),
    },
  });
  const lotNumber = await uniqueLotNumber(tx, shopId, now);
  // sourceOutputId (if set) must point at a BatchStageOutput row — the stage-based production flow's
  // own output record, a different model from the ProductionOutput this (Quick Production) flow uses.
  // Leaving it null is correct here; "Not Packed" (OUTPUTS_SQL) looks up the lot by batchId + productId,
  // never by this column.
  const lot = await tx.finishedGoodsLot.create({
    data: {
      shopId, lotNumber, productId: o.productId, quantity, availableQuantity: quantity, unit: o.unit || 'kg',
      batchId: batch.id, status: 'AVAILABLE', notes: o.sourceNote.slice(0, 250),
    },
  });
  return { batchId: batch.id, outputId: output.id, lotId: lot.id };
}

// One round trip each (not a loop of existence checks) — this sandbox's DB latency alone was enough to
// blow a 5s transaction timeout when this used to probe candidates one at a time.
async function uniqueBatchNumber(tx: any, shopId: string, label: string): Promise<string> {
  // A manual purchase gets an auto-generated invoice number already shaped "PUR-XXXXXXXX" — don't
  // double that prefix; an invoice number the shopkeeper actually typed gets it added for clarity.
  const base = (/^PUR-/i.test(label) ? label : `PUR-${label}`).slice(0, 40);
  const rows: Array<{ n: string }> = await tx.$queryRawUnsafe(
    `SELECT batch_number AS n FROM production_batches WHERE shop_id = $1::uuid AND batch_number LIKE $2`,
    shopId, `${base}%`,
  );
  if (rows.length === 0) return base;
  const taken = new Set(rows.map((r) => r.n));
  if (!taken.has(base)) return base;
  for (let i = 1; i <= 500; i++) {
    const candidate = `${base}-L${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${randomUUID().slice(0, 6)}`;
}

async function uniqueLotNumber(tx: any, shopId: string, now: Date): Promise<string> {
  const prefix = `FG-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-`;
  const rows: Array<{ n: string }> = await tx.$queryRawUnsafe(
    `SELECT lot_number AS n FROM finished_goods_lots WHERE shop_id = $1::uuid AND lot_number LIKE $2`,
    shopId, `${prefix}%`,
  );
  const taken = new Set(rows.map((r) => r.n));
  for (let i = 1; i <= 2000; i++) {
    const candidate = `${prefix}${String(i).padStart(3, '0')}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${prefix}${randomUUID().slice(0, 6)}`;
}
