import prisma from '@/lib/server/prisma';
import { recordDeletion } from '@/lib/server/trash';
import {
  cleanVariants, parseSizeVariantsMap, variantsToSizeMap, sizeMapToVariants, sumStock, variantKeyOf,
  normKey, type VariantRow,
} from '@/lib/variants';
import { parseVariantTitle, baseKey } from '@/lib/variantTitleParser';

/**
 * Finds (dry-run) and fixes products whose colour/size stock disagrees between screens, and
 * suggests merging products that are really one model listed once per size/colour
 * ("K BEAUTY 7273 32X34 OFF WHITE", "K BEAUTY 7273 32X36 CREAM" ...).
 * Nothing here deletes data: fixes log the "before" state to ActivityLog, merged-away
 * products are archived (and snapshotted to the trash bin), never destroyed.
 */

type P = {
  id: string; name: string | null; currentStock: number | null; variants: any; size_variants: any;
  productType: string | null; sellingPrice: any; mrp: any; costPrice: any; wholesaleCost: any; barcode: string | null; metadata: any;
};

const SELECT = {
  id: true, name: true, currentStock: true, variants: true, size_variants: true, productType: true,
  sellingPrice: true, mrp: true, costPrice: true, wholesaleCost: true, barcode: true, metadata: true,
} as const;

const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const sameMap = (a: Record<string, number>, b: Record<string, number>) => {
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  const nb = new Map(kb.map((k) => [normKey(k), num(b[k])]));
  return ka.every((k) => nb.has(normKey(k)) && nb.get(normKey(k)) === num(a[k]));
};

export type DriftItem = {
  id: string; name: string; currentStock: number; sumVariants: number; sumSizeMap: number;
  source: 'variants' | 'size_variants'; issues: string[]; proposedStock: number; variantCount: number;
  /** variants add up to a different total than the product — never auto-changed, only on explicit request */
  totalMismatch: boolean;
};

/** Which store is right? The one whose total matches currentStock; else the tier's own store. */
function planFix(p: P, wholesaleTier: boolean) {
  const rows = cleanVariants(p.variants);
  const map = parseSizeVariantsMap(p.size_variants);
  const hasRows = rows.length > 0;
  const hasMap = Object.keys(map).length > 0;
  if (!hasRows && !hasMap) return null;
  const sumRows = sumStock(rows);
  const sumMap = Object.values(map).reduce((s, v) => s + num(v), 0);
  const cs = num(p.currentStock);
  let source: 'variants' | 'size_variants';
  if (hasRows && !hasMap) source = 'variants';
  else if (hasMap && !hasRows) source = 'size_variants';
  else if (sumRows === cs) source = 'variants';
  else if (sumMap === cs) source = 'size_variants';
  else source = wholesaleTier ? 'variants' : 'size_variants';
  const finalRows: VariantRow[] = source === 'variants' ? rows : sizeMapToVariants(map, rows);
  const finalMap = variantsToSizeMap(finalRows);
  const proposedStock = sumStock(finalRows);
  const issues: string[] = [];
  if (hasRows && hasMap && !sameMap(variantsToSizeMap(rows), map)) issues.push('The two variant lists (Dukan-style and Udyog-style screens) show different quantities');
  if (wholesaleTier ? !hasRows : !hasMap) issues.push('Size/colour list is missing for the screens of this shop (e.g. product came from an import)');
  if (wholesaleTier && finalRows.length && p.productType !== 'variant') issues.push('Not marked as a variant product, so billing will not offer its sizes/colours');
  const totalMismatch = proposedStock !== cs;
  if (totalMismatch) {
    issues.push(proposedStock < cs
      ? `${cs - proposedStock} pcs of the total ${cs} are not assigned to any size/colour`
      : `Sizes/colours add up to ${proposedStock} but the product total says ${cs}`);
  }
  return { rows: finalRows, map: finalMap, source, sumRows, sumMap, proposedStock, issues, totalMismatch };
}

export async function auditVariants(shopId: string, wholesaleTier: boolean) {
  const products = (await prisma.product.findMany({
    where: { shopId, OR: [{ archived: false }, { archived: null }] },
    select: SELECT,
  })) as unknown as P[];

  const drift: DriftItem[] = [];
  const flat: P[] = [];
  for (const p of products) {
    const plan = planFix(p, wholesaleTier);
    if (!plan) { flat.push(p); continue; }
    if (plan.issues.length) {
      drift.push({
        id: p.id, name: p.name || '', currentStock: num(p.currentStock), sumVariants: plan.sumRows, sumSizeMap: plan.sumMap,
        source: plan.source, issues: plan.issues, proposedStock: plan.proposedStock, variantCount: plan.rows.length,
        totalMismatch: plan.totalMismatch,
      });
    }
  }

  // Flat products whose NAME carries the size/colour: group by the parsed base name.
  const groups = new Map<string, { baseName: string; items: Array<{ id: string; name: string; stock: number; size: string; color: string }> }>();
  for (const p of flat) {
    const name = p.name || '';
    const parsed = parseVariantTitle(name);
    if (parsed.confidence === 'low' || !parsed.size) continue;
    const key = baseKey(parsed.baseName);
    const g = groups.get(key) || { baseName: parsed.baseName, items: [] };
    g.items.push({ id: p.id, name, stock: num(p.currentStock), size: parsed.size, color: parsed.color });
    groups.set(key, g);
  }
  const merges = [...groups.values()]
    .filter((g) => g.items.length >= 2)
    .map((g) => ({ ...g, totalStock: g.items.reduce((s, i) => s + i.stock, 0) }))
    .sort((a, b) => b.items.length - a.items.length);

  return { totalProducts: products.length, drift, merges };
}

export async function applyResync(shopId: string, ids: string[], wholesaleTier: boolean, by?: string | null, alignTotalIds: string[] = []) {
  const products = (await prisma.product.findMany({ where: { shopId, id: { in: ids } }, select: SELECT })) as unknown as P[];
  let fixed = 0;
  for (const p of products) {
    const plan = planFix(p, wholesaleTier);
    if (!plan || !plan.issues.length) continue;
    await prisma.$transaction([
      prisma.activityLog.create({
        data: {
          shopId, action: 'variant_cleanup_resync', entityId: p.id,
          details: { by, before: { currentStock: p.currentStock, size_variants: p.size_variants, variants: p.variants, productType: p.productType } } as any,
        },
      }),
      prisma.product.update({
        where: { id: p.id, shopId },
        // The product total is only touched when the shopkeeper explicitly asked for it (alignTotalIds):
        // a total that differs from the size/colour sum is usually stock never assigned to a size.
        data: {
          variants: plan.rows as any, size_variants: JSON.stringify(plan.map), productType: 'variant',
          ...(alignTotalIds.includes(p.id) ? { currentStock: plan.proposedStock } : {}),
        },
      }),
    ]);
    fixed++;
  }
  return { fixed };
}

/** Merge products [ids] (flat, title-embedded variants) into ONE variant product named `baseName`. */
export async function applyMerge(shopId: string, baseName: string, ids: string[], by?: string | null) {
  const products = (await prisma.product.findMany({ where: { shopId, id: { in: ids } }, select: SELECT })) as unknown as P[];
  if (products.length < 2) return { merged: 0 };
  if (products.some((p) => Object.keys(parseSizeVariantsMap(p.size_variants)).length || cleanVariants(p.variants).length)) {
    throw new Error('Only products without their own variants can be merged.');
  }
  const ordered = [...products].sort((a, b) => num(b.currentStock) - num(a.currentStock));
  const target = ordered[0];

  const rows: VariantRow[] = [];
  const sizePrices: Record<string, any> = { ...(target.metadata?.size_prices || {}) };
  for (const p of ordered) {
    const parsed = parseVariantTitle(p.name || '');
    const size = parsed.size || 'Free Size';
    const color = parsed.color || '';
    const row: VariantRow = {
      color, size, stock: num(p.currentStock),
      costPrice: num(p.costPrice) || undefined, wholesalePrice: num(p.wholesaleCost) || undefined,
      sellingPrice: num(p.sellingPrice) || undefined, mrp: num(p.mrp) || undefined,
    };
    rows.push(row);
    sizePrices[variantKeyOf(row)] = {
      mrp: num(p.mrp), sellingPrice: num(p.sellingPrice), cost: num(p.wholesaleCost) || num(p.costPrice),
      ...(p.barcode ? { barcode: p.barcode } : {}),
    };
  }
  const merged = cleanVariants(rows);
  const map = variantsToSizeMap(merged);

  await prisma.$transaction(async (tx) => {
    await tx.activityLog.create({
      data: { shopId, action: 'variant_cleanup_merge', entityId: target.id, details: { by, baseName, before: ordered } as any },
    });
    await tx.product.update({
      where: { id: target.id, shopId },
      data: {
        name: baseName, variants: merged as any, size_variants: JSON.stringify(map), currentStock: sumStock(merged), productType: 'variant',
        sellingPrice: num(target.sellingPrice) || undefined, mrp: num(target.mrp) || undefined,
        metadata: { ...(target.metadata || {}), size_prices: sizePrices },
      },
    });
    for (const p of ordered.slice(1)) {
      await tx.product.update({ where: { id: p.id, shopId }, data: { archived: true, currentStock: 0 } });
    }
  }, { maxWait: 30000, timeout: 60000 });
  for (const p of ordered.slice(1)) {
    await recordDeletion({ shopId, entityType: 'product', entityId: p.id, label: `${p.name} (merged into ${baseName})`, data: p, deletedBy: by || null });
  }
  return { merged: ordered.length - 1, targetId: target.id };
}
