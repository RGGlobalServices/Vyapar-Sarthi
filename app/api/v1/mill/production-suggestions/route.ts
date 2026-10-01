import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, query } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/mill/production-suggestions?productId=<material product>
 *
 * What this mill actually produced from that material before: for every output kind (finished_good / by_product / wip / rejection)
 * the product ids used, most frequent first. The Quick Production form pre-selects from it, so a repeat run needs only the weights.
 * Read-only; looks at this shop's own closed runs (production_outputs) whose raw lot is of the given product.
 */
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const productId = String(query(req).productId || '').trim();
  const out: Record<string, string[]> = { finished_good: [], by_product: [], wip: [], rejection: [] };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId)) return json(out);

  const rows = await prisma.$queryRaw<Array<{ output_type: string; product_id: string; n: number }>>`
    SELECT o.output_type, o.product_id::text AS product_id, count(*)::int AS n
      FROM production_outputs o
      JOIN production_batches b ON b.id = o.batch_id
      JOIN raw_material_lots l ON l.id = b.raw_lot_id
     WHERE o.shop_id = ${shop.id}::uuid AND l.product_id = ${productId}::uuid AND o.product_id IS NOT NULL
     GROUP BY o.output_type, o.product_id
     ORDER BY n DESC`;
  for (const r of rows) if (out[r.output_type]) out[r.output_type].push(r.product_id);
  return json(out);
});
