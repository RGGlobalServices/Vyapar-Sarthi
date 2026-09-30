import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { cleanVariants, normalizeVariants, variantKeyOf, keysMatch, sumStock } from '@/lib/variants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_PRODUCTS = 300;
const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/**
 * Bulk-create products, each with any number of colour/size variants, in one call.
 * Body: { products: [{ name, category?, brand?, hsnCode?, gstPercent?, unit?, mrp?, sellingPrice?,
 *                      wholesaleCost?, costPrice?, minStock?, barcode?, variants?: [{color,size,stock,costPrice,
 *                      wholesalePrice,sellingPrice,mrp}], stock? }] }
 * A product whose name already exists in this shop gets the new variants merged in (stock added,
 * existing per-variant prices kept) instead of a duplicate being created.
 * variants[] / size_variants / currentStock are always written together via lib/variants.
 */
export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody(req);
  const list: any[] = Array.isArray(body?.products) ? body.products : [];
  if (!list.length) throw new ApiError(400, 'No products provided');
  if (list.length > MAX_PRODUCTS) throw new ApiError(400, `Too many products at once (max ${MAX_PRODUCTS}).`);

  const existing = await prisma.product.findMany({
    where: { shopId: shop.id, name: { in: list.map((p) => String(p?.name ?? '').trim()).filter(Boolean), mode: 'insensitive' } },
    select: { id: true, name: true, variants: true, currentStock: true, size_variants: true },
  });
  const byName = new Map(existing.map((p) => [String(p.name).trim().toLowerCase(), p]));

  const results: Array<{ index: number; name: string; status: 'created' | 'updated' | 'error'; id?: string; error?: string }> = [];
  const seenThisCall = new Map<string, any>();

  for (let i = 0; i < list.length; i++) {
    const p = list[i] || {};
    const name = String(p.name ?? '').trim();
    if (!name) { results.push({ index: i, name: '', status: 'error', error: 'Product name is required' }); continue; }
    try {
      const incoming = cleanVariants(p.variants);
      const key = name.toLowerCase();
      const prior = byName.get(key) || seenThisCall.get(key);

      if (prior) {
        // Merge: add stock to matching variants, append new ones; keep existing prices.
        const merged = cleanVariants(prior.variants);
        for (const v of incoming) {
          const row = merged.find((m) => keysMatch(variantKeyOf(m), variantKeyOf(v)));
          if (row) {
            row.stock = (Number(row.stock) || 0) + num(v.stock);
            for (const f of ['costPrice', 'wholesalePrice', 'sellingPrice', 'mrp'] as const) {
              if (!row[f] && num(v[f]) > 0) row[f] = num(v[f]);
            }
          } else merged.push(v);
        }
        const nv = normalizeVariants({ variants: merged });
        const addedStock = incoming.length ? sumStock(incoming) : num(p.stock);
        const updated = await prisma.product.update({
          where: { id: prior.id },
          data: nv.hasVariants
            ? { variants: nv.variants as any, size_variants: nv.sizeVariantsJson, currentStock: nv.currentStock!, productType: 'variant' }
            : { currentStock: (Number(prior.currentStock) || 0) + addedStock },
        });
        if (addedStock > 0) {
          await prisma.stockLog.create({ data: { shopId: shop.id, productId: prior.id, type: 'in', quantity: addedStock, note: 'Bulk add' } }).catch(() => {});
        }
        seenThisCall.set(key, { ...prior, variants: updated.variants, currentStock: updated.currentStock });
        results.push({ index: i, name, status: 'updated', id: prior.id });
        continue;
      }

      const nv = normalizeVariants({ variants: incoming });
      const first = incoming[0];
      const sellingPrice = num(p.sellingPrice) || num(first?.sellingPrice);
      const cost = num(p.wholesaleCost) || num(p.costPrice) || num(first?.wholesalePrice) || num(first?.costPrice);
      const mrp = num(p.mrp) || num(first?.mrp);
      const stock = nv.hasVariants ? nv.currentStock! : num(p.stock);
      const created = await prisma.product.create({
        data: {
          shopId: shop.id,
          name,
          category: p.category || undefined,
          brand: p.brand || undefined,
          hsnCode: p.hsnCode || undefined,
          gstPercent: p.gstPercent !== undefined && p.gstPercent !== '' ? num(p.gstPercent) : undefined,
          baseUnit: p.unit || p.baseUnit || undefined,
          barcode: p.barcode?.toString().trim() || `BAR-${Date.now()}-${i}`,
          sellingPrice: sellingPrice > 0 ? sellingPrice : undefined,
          wholesaleCost: cost > 0 ? cost : undefined,
          costPrice: cost > 0 ? cost : undefined,
          mrp: mrp > 0 ? mrp : undefined,
          minStock: p.minStock !== undefined && p.minStock !== '' ? num(p.minStock) : undefined,
          currentStock: stock,
          ...(nv.hasVariants ? { variants: nv.variants as any, size_variants: nv.sizeVariantsJson, productType: 'variant' } : {}),
        },
      });
      if (stock > 0) {
        await prisma.stockLog.create({ data: { shopId: shop.id, productId: created.id, type: 'in', quantity: stock, note: 'Opening stock (bulk add)' } }).catch(() => {});
      }
      seenThisCall.set(key, { id: created.id, variants: created.variants, currentStock: created.currentStock });
      results.push({ index: i, name, status: 'created', id: created.id });
    } catch (e: any) {
      const msg = e?.code === 'P2002' ? 'Barcode/SKU already exists' : (e?.message || 'Failed');
      results.push({ index: i, name, status: 'error', error: msg });
    }
  }

  return json({
    created: results.filter((r) => r.status === 'created').length,
    updated: results.filter((r) => r.status === 'updated').length,
    failed: results.filter((r) => r.status === 'error').length,
    results,
  }, 201);
});
