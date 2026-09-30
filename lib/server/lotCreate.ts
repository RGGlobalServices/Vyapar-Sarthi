import type { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ApiError } from '@/lib/server/http';
import { setLotVariantKey } from '@/lib/server/lotColumns';
import { openVariantStores, adjustVariantStores, closeVariantStores, variantKeyOf, cleanVariants, parseSizeVariantsMap } from '@/lib/variants';

type Db = Prisma.TransactionClient | PrismaClient;

export type NewLotInput = {
  shopId: string;
  productId: string;
  batchNumber?: string | null;
  quantity: number;
  costPrice?: number | null;
  sellingPrice?: number | null;
  expiryDate?: string | Date | null;
  mfgDate?: string | Date | null;
  variantKey?: string | null;
};

const toDate = (v: any): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
};
const posNum = (v: any): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** True when the product tracks stock per size/colour (either store has entries). */
export function productHasVariantStock(product: { size_variants?: any; variants?: any }): boolean {
  return Object.keys(parseSizeVariantsMap(product.size_variants)).length > 0 || cleanVariants(product.variants).length > 0;
}

/**
 * Receives a new lot: creates (or tops up, when the same lot number already exists for that product/variant) a
 * Batch, and moves product stock — currentStock and, for a colour/size product, that variant's stock in BOTH
 * variant stores. Old lots are never touched: each lot keeps its own cost and selling price, and changing the
 * product's own price later does not rewrite them. Must run inside a transaction.
 */
export async function receiveLot(tx: Db, input: NewLotInput) {
  const qty = Number(input.quantity);
  if (!Number.isFinite(qty) || qty <= 0) throw new ApiError(400, 'Lot quantity must be more than 0.');

  const product = await tx.product.findFirst({ where: { id: input.productId, shopId: input.shopId } });
  if (!product) throw new ApiError(404, 'Product not found');

  const hasVariants = productHasVariantStock(product);
  const variantKey = String(input.variantKey ?? '').trim();
  if (hasVariants && !variantKey) throw new ApiError(400, 'This product has sizes/colours — choose which size/colour this lot is for.');

  const costPrice = posNum(input.costPrice) ?? posNum(product.costPrice) ?? posNum(product.wholesaleCost);
  const sellingPrice = posNum(input.sellingPrice) ?? posNum(product.sellingPrice);

  // Lot number: typed one, else the next free auto number for this product.
  let batchNumber = String(input.batchNumber ?? '').trim();
  if (!batchNumber) {
    const n = await tx.batch.count({ where: { productId: product.id, shopId: input.shopId } });
    const d = new Date();
    batchNumber = `L${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${n + 1}`;
  }

  // Same lot number again (same product) = more stock for that lot.
  const existing = await tx.batch.findFirst({ where: { productId: product.id, shopId: input.shopId, batchNumber } });
  let batchId: string;
  if (existing) {
    await tx.batch.update({
      where: { id: existing.id },
      data: {
        quantity: { increment: qty },
        initialQuantity: { increment: qty },
        ...(costPrice ? { costPrice } : {}),
        ...(sellingPrice ? { sellingPrice } : {}),
        ...(toDate(input.expiryDate) ? { expiryDate: toDate(input.expiryDate)! } : {}),
      },
    });
    batchId = existing.id;
  } else {
    const seq = (await tx.batch.count({ where: { productId: product.id, shopId: input.shopId } })) + 1;
    const created = await tx.batch.create({
      data: {
        id: randomUUID(),
        shopId: input.shopId,
        productId: product.id,
        batchNumber,
        quantity: qty,
        initialQuantity: qty,
        costPrice,
        sellingPrice,
        mfgDate: toDate(input.mfgDate),
        expiryDate: toDate(input.expiryDate),
        purchaseDate: new Date(),
        barcode: `${product.barcode || product.sku || product.id.slice(0, 8)}-L${seq}-${randomUUID().slice(0, 4)}`,
      },
    });
    batchId = created.id;
  }
  await setLotVariantKey(tx as any, batchId, variantKey);

  // Stock: product total + the variant this lot is for.
  const stores = openVariantStores(product);
  if (hasVariants) adjustVariantStores(stores, variantKey, qty, { createIfMissing: true });
  const write = hasVariants ? closeVariantStores(stores) : {};
  await tx.product.update({
    where: { id: product.id, shopId: input.shopId },
    data: { currentStock: { increment: qty }, ...(write as any) },
  });
  await tx.stockLog.create({
    data: { shopId: input.shopId, productId: product.id, type: 'in', quantity: qty, note: `New lot ${batchNumber}${variantKey ? ` (${variantKey})` : ''}` },
  });

  return { batchId, batchNumber, merged: !!existing, variantKey: variantKey || null, costPrice, sellingPrice, quantity: qty };
}

/**
 * Opening lot(s) for a product created with stock. Stock is ALREADY on the product (no stock movement here) —
 * this only records the lot(s) that stock belongs to so billing can show "Lot X · price · qty".
 * A colour/size product gets one lot per variant that has stock.
 */
export async function createOpeningLots(
  tx: Db,
  opts: {
    shopId: string;
    product: { id: string; barcode?: string | null; sku?: string | null; currentStock?: number | null; costPrice?: any; wholesaleCost?: any; sellingPrice?: any; variants?: any; size_variants?: any };
    batchNumber: string;
    expiryDate?: string | Date | null;
  },
) {
  const p = opts.product;
  const rows = cleanVariants(p.variants);
  const map = parseSizeVariantsMap(p.size_variants);
  const lots: Array<{ qty: number; variantKey: string | null; cost: number | null; sell: number | null }> = [];
  const defCost = posNum(p.costPrice) ?? posNum(p.wholesaleCost);
  const defSell = posNum(p.sellingPrice);
  if (rows.length) {
    for (const r of rows) if ((Number(r.stock) || 0) > 0) lots.push({ qty: Number(r.stock), variantKey: variantKeyOf(r), cost: posNum(r.costPrice) ?? defCost, sell: posNum(r.sellingPrice) ?? defSell });
  } else if (Object.keys(map).length) {
    for (const [k, q] of Object.entries(map)) if ((Number(q) || 0) > 0) lots.push({ qty: Number(q), variantKey: k, cost: defCost, sell: defSell });
  } else if ((Number(p.currentStock) || 0) > 0) {
    lots.push({ qty: Number(p.currentStock), variantKey: null, cost: defCost, sell: defSell });
  }
  let seq = 0;
  for (const l of lots) {
    seq++;
    const created = await tx.batch.create({
      data: {
        id: randomUUID(),
        shopId: opts.shopId,
        productId: p.id,
        batchNumber: opts.batchNumber,
        quantity: l.qty,
        initialQuantity: l.qty,
        costPrice: l.cost,
        sellingPrice: l.sell,
        expiryDate: toDate(opts.expiryDate),
        purchaseDate: new Date(),
        barcode: `${p.barcode || p.sku || p.id.slice(0, 8)}-L${seq}-${randomUUID().slice(0, 4)}`,
      },
    });
    await setLotVariantKey(tx as any, created.id, l.variantKey);
  }
  return lots.length;
}
