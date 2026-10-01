import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody } from '@/lib/server/http';
import { createQuickEntry } from '@/lib/server/quickProduction';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/mill/production-entry — Quick Production Entry: one call records a whole production run.
 *
 *   body: { source: { type: 'raw_lot' | 'job_work' | 'wip' | 'rejection', id },
 *           inputQuantity, unit?,                       // how much of the source was used (weight units only)
 *           outputs: [{ outputType: finished_good|by_product|wip|rejection, productId?, name?, quantity, unit, outputLotNumber?, notes? }],
 *           lossKg?, operatorName?, machineId?, startedAt?, notes?, batchNumber?, idempotency_key? }
 *
 * Opens a batch with a single "Production" stage and closes it with the same engine as the stage-based Finalize, in ONE
 * transaction: nothing is written unless the whole run balances (input = outputs + loss) and every stock rule holds.
 * Send an idempotency key (header `x-idempotency-key` or body `idempotency_key`) so a double tap / retry can never book it twice.
 */
export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody<any>(req);
  const key = req.headers.get('x-idempotency-key') || body.idempotency_key || null;
  const { result, isDuplicate } = await createQuickEntry(shop, body, key);
  return json({ ...result, duplicate: isDuplicate }, isDuplicate ? 200 : 201);
});
