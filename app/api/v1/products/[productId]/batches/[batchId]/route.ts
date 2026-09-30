import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ productId: string; batchId: string }> };

const num = (v: any): number | null => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};

/**
 * Edit one lot's own details: lot number, selling price, cost price, expiry. Quantity is NOT editable here
 * (stock moves through purchases, sales, returns and adjustments). Changing a lot's price affects only that
 * lot; the product's own price and every other lot stay as they are.
 */
export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { productId, batchId } = await params;
  const { shop } = await requireShop(req);
  const b = await readBody(req);

  const batch = await prisma.batch.findFirst({ where: { id: batchId, productId, shopId: shop.id } });
  if (!batch) throw new ApiError(404, 'Lot not found');

  const data: Record<string, any> = {};
  if (b.batchNumber !== undefined || b.batch_number !== undefined) {
    const bn = String(b.batchNumber ?? b.batch_number ?? '').trim();
    if (!bn) throw new ApiError(400, 'Lot number cannot be empty.');
    const clash = await prisma.batch.findFirst({ where: { productId, shopId: shop.id, batchNumber: bn, id: { not: batchId } } });
    if (clash) throw new ApiError(400, `Another lot of this product already uses "${bn}".`);
    data.batchNumber = bn;
  }
  for (const [key, bodyKeys] of [['sellingPrice', ['sellingPrice', 'selling_price']], ['costPrice', ['costPrice', 'cost_price']]] as const) {
    const k = bodyKeys.find((x) => b[x] !== undefined);
    if (!k) continue;
    const n = num(b[k]);
    if (n !== null && Number.isNaN(n)) throw new ApiError(400, `${key} must be a number.`);
    data[key] = n;
  }
  const ek = ['expiryDate', 'expiry_date'].find((x) => b[x] !== undefined);
  if (ek) {
    const v = b[ek];
    if (!v) data.expiryDate = null;
    else {
      const d = new Date(v);
      if (!Number.isFinite(d.getTime())) throw new ApiError(400, 'Invalid expiry date.');
      data.expiryDate = d;
    }
  }
  if (!Object.keys(data).length) throw new ApiError(400, 'Nothing to change.');

  const updated = await prisma.batch.update({ where: { id: batchId }, data });
  return json(updated);
});
