import prisma from '@/lib/server/prisma';
import { ApiError } from '@/lib/server/http';
import { MILL_PRICING_MODEL } from '@/lib/millBilling';

/** True only for Postgres "undefined column" on pricing_model (SQLSTATE 42703). */
function isMissingPricingModelColumn(e: any): boolean {
  const msg = String(e?.message || '');
  const code = String(e?.meta?.code || e?.code || '');
  return (code === '42703' || msg.includes('42703') || /column .*pricing_model.* does not exist/i.test(msg));
}

/**
 * Returns the sale's pricing model ('mill_v2' or null = legacy). `pricing_model` is written once when the bill is
 * created and never changes, so reading it OUTSIDE the caller's transaction is race-free.
 *
 * The ONLY error swallowed is "column pricing_model does not exist": in a database that predates the mill columns no
 * mill_v2 sale can exist, so treating every sale as legacy is the correct answer (and keeps legacy returns/exchange
 * working during the rollout window). Any other error propagates — this guard never fails open on a real problem.
 */
export async function getSalePricingModel(shopId: string, saleId: string): Promise<string | null> {
  // A malformed id is the caller's own (unchanged) validation problem — don't change its error behaviour here.
  if (typeof saleId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(saleId)) return null;
  try {
    const rows = await prisma.$queryRaw<Array<{ pricing_model: string | null }>>`
      SELECT pricing_model FROM sales WHERE id = ${saleId}::uuid AND shop_id = ${shopId}::uuid LIMIT 1
    `;
    return rows[0]?.pricing_model ?? null;
  } catch (e) {
    if (isMissingPricingModelColumn(e)) return null;
    throw e;
  }
}

export async function assertNotMillSale(shopId: string, saleId: string, action: 'return' | 'exchange') {
  const model = await getSalePricingModel(shopId, saleId);
  if (model === MILL_PRICING_MODEL) {
    throw new ApiError(
      409,
      action === 'return'
        ? 'Returns are not supported yet on mill bills. Delete and re-bill instead.'
        : 'Exchanges are not supported yet on mill bills. Delete and re-bill instead.',
      action === 'return' ? 'MILL_V2_RETURN_NOT_SUPPORTED' : 'MILL_V2_EXCHANGE_NOT_SUPPORTED',
    );
  }
}

export function assertSaleEditable(sale: { pricingModel?: string | null }) {
  if (sale.pricingModel === MILL_PRICING_MODEL) {
    throw new ApiError(409, 'Mill bills cannot be edited yet. Delete and re-bill instead.', 'MILL_V2_EDIT_NOT_SUPPORTED');
  }
}
