import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── Types ─────────────────────────────────────────────────────────────────

interface ExtractedProduct {
  productName: string;
  category?: string;
  brand?: string;
  barcode?: string;
  sku?: string;
  unit?: string;
  quantity?: number;
  wholesaleCost?: number;
  mrp?: number;
  sellingPrice?: number;
  suggestedSellingPrice?: number;
  expiryDate?: string;
  batch_number?: string;
  drug_schedule?: string;
  model_number?: string;
  warranty_months?: number | string;
  gender?: string;
  shade?: string;
  size_variants?: Record<string, number> | string | null;
  hsnCode?: string;
  hsn_code?: string;
  gstPercent?: number;
  minStock?: number;
  // additional
  missingPrice?: boolean;
  missingUnit?: boolean;
  weight?: string;
  color?: string;
  fabric?: string;
  sole_material?: string;
}

interface ProcessRequest {
  importName: string;
  fileName?: string;
  source: 'stock' | 'purchase' | 'mixed';
  products: ExtractedProduct[];
}

interface ProductResult {
  productName: string;
  action: 'created' | 'updated' | 'skipped' | 'failed';
  reason?: string;
  productId?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Normalize a barcode/SKU string — trim, upper-case, remove stray chars.
 */
function normalizeBarcode(val: string | null | undefined): string | null {
  if (!val || !val.trim()) return null;
  return val.trim().toUpperCase().replace(/[^\w\-]/g, '');
}

/**
 * Parse size_variants into a JSON string suitable for storage.
 * Handles object, CSV string ("S:10,M:5"), or already stringified JSON.
 */
function parseSizeVariants(sv: any): { jsonStr: string | null; totalQty: number } {
  if (!sv) return { jsonStr: null, totalQty: 0 };

  if (typeof sv === 'object' && !Array.isArray(sv)) {
    const keys = Object.keys(sv);
    if (keys.length === 0) return { jsonStr: null, totalQty: 0 };
    const totalQty = Object.values(sv).reduce(
      (sum: number, v: any) => sum + (parseFloat(String(v)) || 0),
      0
    );
    return { jsonStr: JSON.stringify(sv), totalQty };
  }

  if (typeof sv === 'string') {
    const trimmed = sv.trim();
    if (!trimmed) return { jsonStr: null, totalQty: 0 };

    // Try JSON parse first
    try {
      const parsed = JSON.parse(trimmed);
      return parseSizeVariants(parsed);
    } catch {
      // Try CSV "S:10,M:15" format
      if (trimmed.includes(':')) {
        const obj: Record<string, number> = {};
        trimmed.split(',').forEach((part) => {
          const [k, v] = part.trim().split(':');
          if (k && v !== undefined) obj[k.trim()] = parseFloat(v.trim()) || 0;
        });
        const keys = Object.keys(obj);
        if (keys.length > 0) {
          const totalQty = Object.values(obj).reduce((s, v) => s + v, 0);
          return { jsonStr: JSON.stringify(obj), totalQty };
        }
      }
    }
  }

  return { jsonStr: null, totalQty: 0 };
}

/**
 * Safely parse a numeric value from potentially mixed input.
 */
function safeNum(val: any, fallback = 0): number {
  const n = parseFloat(String(val ?? ''));
  return isNaN(n) ? fallback : n;
}

// ─── POST /api/v1/import/process ────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  let shop: any;
  try {
    ({ shop } = await requireShop(req));
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: ProcessRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { importName, fileName, source = 'stock', products } = body;

  if (!importName?.trim()) {
    return NextResponse.json({ error: 'importName is required' }, { status: 400 });
  }
  if (!Array.isArray(products) || products.length === 0) {
    return NextResponse.json({ error: 'No products provided' }, { status: 400 });
  }

  const results: ProductResult[] = [];

  // ── Process each product — isolated per row so one failure doesn't abort all ──
  for (const raw of products) {
    const productName = raw.productName?.trim();

    if (!productName) {
      results.push({ productName: '(unnamed)', action: 'skipped', reason: 'Missing product name' });
      continue;
    }

    try {
      // ── 1. Field Mapping ──────────────────────────────────────────────────
      const barcode = normalizeBarcode(raw.barcode || raw.sku || null);
      const hsnCode = raw.hsnCode || raw.hsn_code || null;
      const openingQty = safeNum(raw.quantity, 0);

      const { jsonStr: sizeVariantsJson, totalQty: variantTotalQty } = parseSizeVariants(raw.size_variants);
      // If size_variants provided, use their total as actual stock
      const finalQty = sizeVariantsJson && variantTotalQty > 0 ? variantTotalQty : openingQty;

      const sellingPrice = safeNum(raw.sellingPrice || raw.suggestedSellingPrice, 0);
      const mrp = safeNum(raw.mrp, sellingPrice);
      const wholesaleCost = safeNum(raw.wholesaleCost, 0);
      const warrantyMonths = raw.warranty_months ? parseInt(String(raw.warranty_months)) : null;
      const gstPercent = safeNum(raw.gstPercent, 0);
      const minStock = safeNum(raw.minStock, 0);
      const category = raw.category?.trim() || 'General';
      const baseUnit = raw.unit?.trim() || 'PCS';

      const metadata: Record<string, any> = {};
      if (raw.color) metadata.color = raw.color;
      if (raw.fabric) metadata.fabric = raw.fabric;
      if (raw.sole_material) metadata.sole_material = raw.sole_material;
      if (raw.weight) metadata.weight = raw.weight;

      const productData = {
        shopId: shop.id,
        name: productName,
        category,
        brand: raw.brand?.trim() || null,
        baseUnit,
        mrp,
        sellingPrice,
        wholesaleCost,
        currentStock: finalQty,
        minStock,
        barcode,
        expiryDate: raw.expiryDate?.trim() || null,
        batch_number: raw.batch_number?.trim() || null,
        drug_schedule: raw.drug_schedule?.trim() || null,
        model_number: raw.model_number?.trim() || null,
        warranty_months: warrantyMonths,
        gender: raw.gender?.trim() || null,
        shade: raw.shade?.trim() || null,
        size_variants: sizeVariantsJson,
        hsnCode: hsnCode?.trim() || null,
        gstPercent: gstPercent || null,
        productType: 'single',
        metadata: Object.keys(metadata).length > 0 ? metadata : {},
      };

      // ── 2. Duplicate Detection: barcode → name ──────────────────────────
      let existing: any = null;

      if (barcode) {
        existing = await prisma.product.findFirst({
          where: { shopId: shop.id, barcode },
        });
      }

      if (!existing) {
        existing = await prisma.product.findFirst({
          where: {
            shopId: shop.id,
            name: { equals: productName, mode: 'insensitive' },
            OR: [{ archived: false }, { archived: null }],
          },
        });
      }

      // ── 3. Create or Update ──────────────────────────────────────────────
      let productId: string;
      let action: ProductResult['action'];

      if (existing) {
        // Update: increment stock, update pricing if provided
        const updateData: any = {
          currentStock: { increment: finalQty },
        };
        // Only update prices if AI extracted non-zero values
        if (sellingPrice > 0) updateData.sellingPrice = sellingPrice;
        if (mrp > 0) updateData.mrp = mrp;
        if (wholesaleCost > 0) updateData.wholesaleCost = wholesaleCost;
        if (sizeVariantsJson) updateData.size_variants = sizeVariantsJson;
        if (barcode && !existing.barcode) updateData.barcode = barcode;
        if (Object.keys(metadata).length > 0) {
          // If existing metadata exists, we might overwrite it. 
          // Since it's a simple flat object, we can just assign the new values.
          updateData.metadata = metadata;
        }

        await prisma.product.update({
          where: { id: existing.id },
          data: updateData,
        });

        productId = existing.id;
        action = 'updated';
      } else {
        // Create new product
        const created = await prisma.product.create({ data: productData });
        productId = created.id;
        action = 'created';
      }

      // ── 4. StockMovement (opening stock / import audit) ─────────────────
      if (finalQty > 0) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO stock_movements (id, shop_id, product_id, type, quantity, created_at)
           VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'opening_stock', $3, NOW())`,
          shop.id,
          productId,
          finalQty
        );

        // Also create a StockLog entry for the native logs UI
        await prisma.stockLog.create({
          data: {
            shopId: shop.id,
            productId,
            type: 'in',
            quantity: finalQty,
            note: `AI Import: ${importName}`,
          },
        });
      }

      // ── 5. Batch Record (if expiry/batch info present) ───────────────────
      if (raw.expiryDate?.trim() || raw.batch_number?.trim()) {
        let expiryDt: Date | null = null;
        if (raw.expiryDate?.trim()) {
          const parsed = new Date(raw.expiryDate.trim());
          if (!isNaN(parsed.getTime())) expiryDt = parsed;
        }

        // Check if this batch already exists to avoid duplicate constraint errors
        const batchNum = raw.batch_number?.trim() || `IMPORT-${Date.now()}`;
        const existingBatch = await prisma.batch.findFirst({
          where: { shopId: shop.id, productId, batchNumber: batchNum },
        });

        if (!existingBatch) {
          await prisma.batch.create({
            data: {
              shopId: shop.id,
              productId,
              batchNumber: batchNum,
              expiryDate: expiryDt,
              quantity: finalQty,
            },
          });
        } else {
          // Increment batch quantity
          await prisma.batch.update({
            where: { id: existingBatch.id },
            data: { quantity: { increment: finalQty } },
          });
        }
      }

      results.push({ productName, action, productId });
    } catch (err: any) {
      console.error(`[ImportProcess] Failed for "${productName}":`, err?.message);
      results.push({
        productName,
        action: 'failed',
        reason: err?.message?.includes('Unique constraint')
          ? 'Duplicate barcode/SKU — product skipped'
          : (err?.message || 'Unknown error'),
      });
    }
  }

  // ── 6. Aggregate Results ────────────────────────────────────────────────
  const importedCount = results.filter((r) => r.action === 'created').length;
  const updatedCount = results.filter((r) => r.action === 'updated').length;
  const skippedCount = results.filter((r) => r.action === 'skipped').length;
  const failedCount = results.filter((r) => r.action === 'failed').length;
  const errors = results
    .filter((r) => r.action === 'failed' || r.action === 'skipped')
    .map((r) => ({ productName: r.productName, reason: r.reason }));

  const processingMs = Date.now() - startTime;

  // ── 7. Create ImportLog record ───────────────────────────────────────────
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO import_logs
         (id, shop_id, import_name, file_name, source, total_rows, imported_count, updated_count, skipped_count, failed_count, errors, processing_ms, created_at)
       VALUES
         (gen_random_uuid(), $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, NOW())`,
      shop.id,
      importName.trim(),
      fileName || null,
      source,
      products.length,
      importedCount,
      updatedCount,
      skippedCount,
      failedCount,
      JSON.stringify(errors),
      processingMs
    );
  } catch (logErr) {
    // Non-fatal: log failure shouldn't break the import response
    console.error('[ImportProcess] Failed to write ImportLog:', logErr);
  }

  // ── 8. Return Summary ────────────────────────────────────────────────────
  return NextResponse.json({
    success: true,
    importedCount,
    updatedCount,
    skippedCount,
    failedCount,
    totalRows: products.length,
    processingMs,
    errors,
    results,
  });
}
