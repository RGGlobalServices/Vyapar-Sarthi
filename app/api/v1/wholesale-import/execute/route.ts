import { NextRequest, NextResponse } from 'next/server';
import { parseCharges, chargesTotal } from '@/lib/server/purchaseCharges';
import { logBrokerCommission } from '@/lib/server/brokerCommission';
import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { assertOwned } from '@/lib/server/ownership';
import { apiErrorResponse } from '@/lib/server/http';
import { parseFlexibleDate } from '@/lib/server/dates';
import { parseSizeRange } from '@/lib/sizeRange';
import { isWholesaleTierPackage, isMillBillingPackage } from '@/lib/config/packageConfig';
import { getBusinessConfig } from '@/lib/businessConfig';

/**
 * Build the "<Colour> / <Size>" composite key used everywhere else in the
 * system to identify a specific variant row (matches billing/route.ts's
 * stock-decrement code and the returns route). Bare size or bare colour
 * fall back to just that half. Empty → null so the caller can guard on it.
 */
function variantKey(colour: string | null, size: string | null): string | null {
  const c = (colour || '').trim();
  const sz = (size || '').trim();
  if (c && sz) return `${c} / ${sz}`;
  return sz || c || null;
}

/**
 * Merge a per-variant qty into a product's `variants[]` JSON — creates a new
 * row when the colour/size combination doesn't exist yet, otherwise adds
 * the qty to the existing row's stock. Prices from the imported row are
 * used only for a NEW variant (so an existing variant's carefully-set
 * price isn't clobbered by an import).
 */
function mergeVariantIntoArray(
  existing: any,
  colour: string | null,
  size: string | null,
  qty: number,
  costPrice: number,
  mrp: number,
  sellingPrice: number = 0,
): any[] {
  const arr: any[] = Array.isArray(existing) ? existing.map((v: any) => ({ ...v })) : [];
  const c = (colour || '').trim();
  const sz = (size || '').trim();
  const idx = arr.findIndex((v: any) =>
    (String(v.color || '').trim() === c) && (String(v.size || '').trim() === sz)
  );
  if (idx >= 0) {
    arr[idx].stock = (Number(arr[idx].stock) || 0) + qty;
    // Keep price fields as-is on an existing variant so an import doesn't
    // silently over-write per-variant prices the shopkeeper set by hand —
    // except sellingPrice when THIS import row explicitly carried one, which
    // is a deliberate edit, not a guess.
    if (!arr[idx].costPrice && costPrice > 0) arr[idx].costPrice = costPrice;
    if (!arr[idx].wholesalePrice && costPrice > 0) arr[idx].wholesalePrice = costPrice;
    if (!arr[idx].mrp && mrp > 0) arr[idx].mrp = mrp;
    if (sellingPrice > 0) arr[idx].sellingPrice = sellingPrice;
  } else {
    arr.push({
      color: c || null,
      size: sz || null,
      stock: qty,
      costPrice: costPrice > 0 ? costPrice : undefined,
      wholesalePrice: costPrice > 0 ? costPrice : undefined,
      // No blind markup guess — a row with no selling price leaves it unset
      // so the shopkeeper sets it their own way (review table or Edit
      // Product), instead of the import silently inventing a 20% margin.
      sellingPrice: sellingPrice > 0 ? sellingPrice : undefined,
      mrp: mrp > 0 ? mrp : undefined,
    });
  }
  return arr;
}

/**
 * Row-level {colour, size} for variant tracking — normally the row's own
 * Colour/Size columns, but for a liquor shop with no such columns (the
 * common case: a wholesaler's bill has Volume + Bottle Type instead), falls
 * back to those. `getVal` is passed in rather than imported since it's a
 * per-request closure defined inside POST.
 */
function resolveRowVariant(
  row: any,
  getVal: (row: any, keys: string[]) => any,
  isLiquorImport: boolean,
): { rowColour: string | null; rowSize: string | null } {
  let rowColour = String(getVal(row, ['colour', 'color']) || '').trim() || null;
  let rowSize = String(getVal(row, ['size']) || '').trim() || null;
  if (isLiquorImport && !rowColour && !rowSize) {
    const volume = getVal(row, ['volume', 'volumeml', 'ml', 'packsize']);
    if (volume !== undefined && String(volume).trim() !== '') {
      const v = String(volume).trim();
      rowColour = /ml$|l$/i.test(v) ? v : `${v}ml`;
    }
    const bottleType = getVal(row, ['bottletype', 'packaging', 'container', 'pack']);
    if (bottleType) rowSize = String(bottleType).trim();
  }
  return { rowColour, rowSize };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireShop(req);
    if (auth instanceof NextResponse) return auth;
    const shopId = auth.shop.id;
    // Liquor's variant dimension is Volume(ML) × Bottle Type, not Colour ×
    // Size — but it's stored through the exact same {color, size} shape
    // everywhere else in this file (variants[], PurchaseItem.variantKey,
    // and what Billing's stock-decrement/ML-column code reads), same
    // convention as ProductDetailsSheet/WholesaleBillingUI this session:
    // color slot = ML, size slot = Bottle Type. So a liquor row with no
    // explicit colour/size column falls back to volume/bottleType below
    // instead of importing as a single flat-stock product with the ML
    // size buried in metadata only (unreachable by the billing ML picker).
    const isLiquorImport = !!getBusinessConfig(auth.shop.businessType as any)?.hasLiquorSpecs;
    // Bada Udyog pack: purchase import creates financial records only (PurchaseInvoice +
    // PurchaseItems + Supplier). Stock is tracked through RawMaterialLots and production
    // batches — NOT through product.currentStock. Opening Stock ('stock') still updates stock.
    const isMillImport = isMillBillingPackage(auth.shop.packageType);

    const startedAt = Date.now();
    const body = await req.json();
    const { importType, data, godownId } = body;

    // godownId and importLogId are client-supplied: verify both belong to this
    // shop before any row is imported (a foreign godownId used to receive stock
    // and a foreign importLogId had its counters/errors overwritten).
    await assertOwned(shopId, { godownId, importLogId: body.importLogId });
    // Optional job metadata from the wizard for the ImportLog (recovery/audit).
    const fileName: string | null = body.fileName ? String(body.fileName) : null;
    const extractionStats = body.stats && typeof body.stats === 'object' ? body.stats : null;

    if (!data || !Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: 'No data to import' }, { status: 400 });
    }

    // Per-row conflict decision from the preview, parallel to `data`:
    //   'skip'   → this row matched an existing record and the user chose to keep the old data
    //   'update' → apply the row's (edited) values to the existing record
    //   undefined → default behaviour (update on match, create otherwise)
    // `existingPolicy` is the global default the preview picked: 'skip' means
    // "only import new records" unless a row is individually flipped to update.
    const rowDecisions: (string | undefined)[] = Array.isArray(body.rowDecisions) ? body.rowDecisions : [];
    const existingPolicy: 'update' | 'skip' = body.existingPolicy === 'skip' ? 'skip' : 'update';
    const skipExisting = (i: number) => {
      const d = rowDecisions[i];
      if (d === 'skip') return true;
      if (d === 'update') return false;
      return existingPolicy === 'skip';
    };

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const rowErrors: string[] = [];
    // Purchase-import only: capture the resolved supplier + newly-created
    // "Imported purchase invoice" SupplierTransaction id so the client can
    // attach the scanned bill photo to Suppliers → Payment History for the
    // matching row (instead of the user having to manually re-upload it).
    let purchaseSupplierId: string | null = null;
    let purchaseSupplierTxnId: string | null = null;
    // Products actually touched this batch — 'purchase' and 'stock' only,
    // the two import types that create/update real Product rows. Lets the
    // wizard offer "Print Barcode Labels" for exactly what was just
    // imported, without re-fetching/guessing from the row data.
    const affectedProductIds = new Set<string>();

    // Helper to extract values case-insensitively and space-insensitively
    const getVal = (row: any, possibleKeys: string[]) => {
      const rowKeys = Object.keys(row);
      for (const key of possibleKeys) {
        const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        for (const rKey of rowKeys) {
          if (rKey.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedKey) {
            return row[rKey];
          }
        }
      }
      return undefined;
    };

    // True only when a column was actually filled in — so a BLANK cell in the
    // preview never overwrites/zeros an existing product's real value on update.
    const has = (row: any, possibleKeys: string[]) => {
      const v = getVal(row, possibleKeys);
      return v !== undefined && v !== null && String(v).trim() !== '';
    };

    // The business-type-specific fields the dedicated "Add Product" form
    // (app/[locale]/(main)/products/page.tsx handleAddSubmit) sets that a
    // bulk import previously dropped on the floor — expiry, batch, drug
    // schedule (medical), model/warranty (electronics), gender/shade
    // (clothes/boutique). Only included when actually present in the row.
    const getProductExtras = (row: any) => {
      const extras: Record<string, any> = {};
      const rawExpiry = getVal(row, ['expirydate', 'expiry']);
      if (rawExpiry) {
        const parsed = Date.parse(rawExpiry);
        if (!isNaN(parsed)) extras.expiryDate = new Date(parsed);
      }
      const batch = getVal(row, ['batchnumber', 'batch']);
      if (batch) extras.batch_number = String(batch);
      const drugSchedule = getVal(row, ['drugschedule', 'schedule']);
      if (drugSchedule) extras.drug_schedule = String(drugSchedule);
      const model = getVal(row, ['modelnumber', 'model']);
      if (model) extras.model_number = String(model);
      const warranty = getVal(row, ['warrantymonths', 'warranty']);
      if (warranty) extras.warranty_months = parseInt(warranty) || 0;
      const gender = getVal(row, ['gender']);
      if (gender) extras.gender = String(gender);
      const shade = getVal(row, ['shade']);
      if (shade) extras.shade = String(shade);
      // GST invoice fields — same columns Products / Stock forms expose.
      const hsn = getVal(row, ['hsncode', 'hsn', 'sac', 'hsnsac']);
      if (hsn) extras.hsnCode = String(hsn);
      // Extra scannable identifiers used by the desktop barcode billing flow.
      const sku = getVal(row, ['sku', 'skucode', 'stockcode', 'articleno', 'articlecode']);
      if (sku) extras.sku = String(sku).trim();
      // Printable reference field — same "write once, reuse on labels" concept
      // as SKU (see Products form's Other Code field), just a separate slot.
      const otherCode = getVal(row, ['othercode', 'refcode', 'referencecode', 'altcode', 'alternatecode']);
      if (otherCode) extras.otherCode = String(otherCode).trim();
      const cartonBc = getVal(row, ['cartonbarcode', 'cartoncode', 'boxbarcode', 'outerbarcode', 'casebarcode']);
      if (cartonBc) extras.cartonBarcode = String(cartonBc).trim();
      const gstPct = getVal(row, ['gstpercent', 'gstrate', 'gstpercentage', 'taxrate', 'gst%']);
      if (gstPct !== undefined && String(gstPct).trim() !== '') {
        const n = parseFloat(gstPct);
        if (!isNaN(n)) extras.gstPercent = n;
      }
      // Brand is a real column (shared by electronics/clothes/liquor). Alcohol %,
      // volume and bottle type are liquor-specific → stored in the metadata JSON
      // so no schema change is needed, matching the Add Product form.
      const brand = getVal(row, ['brand', 'company', 'make', 'manufacturer']);
      if (brand) extras.brand = String(brand);
      const liquorMeta: Record<string, any> = {};
      const alcohol = getVal(row, ['alcoholpercentage', 'alcoholpercent', 'alcohol', 'abv']);
      if (alcohol !== undefined && String(alcohol).trim() !== '') liquorMeta.alcoholPercentage = String(alcohol).replace(/[^0-9.]/g, '');
      const volume = getVal(row, ['volume', 'volumeml', 'ml', 'packsize']);
      if (volume !== undefined && String(volume).trim() !== '') liquorMeta.volume = String(volume);
      const bottleType = getVal(row, ['bottletype', 'packaging', 'container', 'pack']);
      if (bottleType) liquorMeta.bottleType = String(bottleType);
      // Reorder level is the point at which stock should be replenished → minStock.
      const reorder = getVal(row, ['reorderlevel', 'reorder', 'reorderpoint']);
      if (reorder !== undefined && String(reorder).trim() !== '') {
        const n = parseFloat(reorder);
        if (!isNaN(n)) extras.minStock = n;
      }
      // Extra catalogue fields offered via the review table's "+ Column"
      // picker (lib/importTemplates.ts getAddableColumns) — real Product
      // columns, just not part of the default template so they don't
      // clutter every import.
      const location = getVal(row, ['location', 'rack', 'shelf', 'bin']);
      if (location) extras.location = String(location).trim();
      const millCat = getVal(row, ['millcategory', 'millclass', 'materialtype', 'itemclass']);
      if (millCat) {
        const k = String(millCat).trim().toLowerCase().replace(/[\s-]+/g, '_');
        const map: Record<string, string> = { raw_material: 'raw_material', raw: 'raw_material', rawmaterial: 'raw_material', finished_goods: 'finished_goods', finished: 'finished_goods', finishedgoods: 'finished_goods', by_product: 'by_product', byproduct: 'by_product', by_products: 'by_product' };
        if (map[k]) extras.millCategory = map[k];
      }
      const grade = getVal(row, ['grade']);
      if (grade) extras.grade = String(grade).trim();
      const variety = getVal(row, ['variety']);
      if (variety) extras.variety = String(variety).trim();
      const subcategory = getVal(row, ['subcategory', 'subcat']);
      if (subcategory) extras.subcategory = String(subcategory).trim();
      const packSize = getVal(row, ['packsize']);
      if (packSize !== undefined && String(packSize).trim() !== '') {
        const n = parseFloat(packSize);
        if (!isNaN(n)) extras.packSize = n;
      }
      const packUnit = getVal(row, ['packunit']);
      if (packUnit) extras.packUnit = String(packUnit).trim();
      if (Object.keys(liquorMeta).length > 0) extras.metadata = liquorMeta;
      // Unit conversion (e.g. 1 Case = 12 Bottles) → conversionFactor column.
      const conv = getVal(row, ['unitspercase', 'conversionfactor', 'unitspercarton', 'packqty', 'bottlespercase']);
      if (conv !== undefined && String(conv).trim() !== '') {
        const n = parseFloat(conv);
        if (!isNaN(n) && n > 0) extras.conversionFactor = n;
      }
      return extras;
    };

    switch (importType) {
      case 'product': {
        const existingProducts = await prisma.product.findMany({
          where: { shopId },
          select: { id: true, name: true, barcode: true, category: true }
        });

        // Exact (case-/whitespace-insensitive) name match only — a row whose
        // name merely resembles an existing product (e.g. same shirt in a
        // different size/colour, or two unrelated products sharing a common
        // word) must import as a NEW product, never silently merge into an
        // existing one. Fuzzy matching here previously did exactly that.
        const nameIndex = new Map<string, string>();
        for (const p of existingProducts) if (p.name) nameIndex.set(p.name.toLowerCase().trim(), p.id);

        // Pre-Validation Pass
        const seenBarcodes = new Set<string>();
        const errors: string[] = [];
        const masterUnits = await prisma.unit.findMany({ where: { shopId } });
        const validUnits = new Set(masterUnits.map(u => u.name.toLowerCase()));
        
        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          const barcode = getVal(row, ['barcode']);
          if (barcode) {
            const bcStr = String(barcode).trim();
            if (seenBarcodes.has(bcStr)) {
              errors.push(`Row ${i + 1}: Duplicate barcode found in import file (${bcStr}).`);
            }
            seenBarcodes.add(bcStr);
          }
          
          const unit = getVal(row, ['unit']);
          if (unit) {
            const unitStr = String(unit).trim().toLowerCase();
            if (validUnits.size > 0 && !validUnits.has(unitStr)) {
              errors.push(`Row ${i + 1}: Invalid unit '${unit}'. Must be one of defined master units.`);
            }
          }
        }

        if (errors.length > 0) {
          return NextResponse.json({ error: 'Validation failed', details: errors }, { status: 400 });
        }

        // Live barcode -> productId index, seeded from the DB and updated as we
        // create rows, so two new rows in the same file that share a barcode
        // match each other instead of both hitting the DB unique constraint.
        const barcodeIndex = new Map<string, string>();
        for (const p of existingProducts) if (p.barcode) barcodeIndex.set(p.barcode, p.id);
        // Per-product variants[] cache so multiple rows for the same product
        // merge into ONE variants array (each row is a distinct colour/size).
        // Need to fetch variants for products we might merge into.
        const productVariantsCache = new Map<string, any[]>();
        const existingWithVariants = await prisma.product.findMany({
          where: { id: { in: existingProducts.map(p => p.id) } },
          select: { id: true, variants: true },
        });
        for (const p of existingWithVariants) {
          productVariantsCache.set(p.id, Array.isArray(p.variants) ? (p.variants as any[]).map((v: any) => ({ ...v })) : []);
        }

        // Expand size ranges before iterating so a "6*8, qty 2" row becomes
        // 3 individual per-size rows (6, 7, 8) each qty 2 — same convention
        // the scan-bill route + AddBillModal use (see lib/sizeRange.ts).
        // Preserves the file's original size-column header name so downstream
        // getVal(...) picks it up unchanged.
        const expandedProductData: any[] = [];
        for (const row of data) {
          const sizeRaw = getVal(row, ['size']);
          const sizes = parseSizeRange(sizeRaw ? String(sizeRaw) : '');
          if (sizes.length <= 1) { expandedProductData.push(row); continue; }
          const sizeKey = Object.keys(row).find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === 'size');
          for (const s of sizes) {
            const clone: any = { ...row };
            if (sizeKey) clone[sizeKey] = s; else clone.Size = s;
            expandedProductData.push(clone);
          }
        }

        for (let i = 0; i < expandedProductData.length; i++) {
          const row = expandedProductData[i];
          try {
            const name = getVal(row, ['productname', 'name', 'description', 'item']);
            const barcode = getVal(row, ['barcode']);
            if (!name) {
              skipped++;
              rowErrors.push(`Row ${i + 1}: Skipped - Missing product name`);
              continue;
            }
            const barcodeStr = barcode ? String(barcode) : null;

            let matchId: string | null = barcodeStr ? barcodeIndex.get(barcodeStr) ?? null : null;
            if (!matchId) matchId = nameIndex.get(String(name).toLowerCase().trim()) ?? null;

            const price = parseFloat(getVal(row, ['sellingprice', 'price', 'rate']) || 0);
            const cost = parseFloat(getVal(row, ['costprice', 'wholesalecost', 'cost', 'purchaseprice']) || 0);
            const mrp = parseFloat(getVal(row, ['mrp']) || price);
            const category = getVal(row, ['category']) || 'General';
            const quantity = parseFloat(getVal(row, ['quantity', 'stock', 'qty']) || 0);
            const extras = getProductExtras(row);

            // Row-level colour+size (may be null for plain products) — falls
            // back to Volume/Bottle-Type for a liquor shop with no explicit
            // colour/size columns (see resolveRowVariant).
            const { rowColour, rowSize } = resolveRowVariant(row, getVal, isLiquorImport);
            const rowVariantKey = variantKey(rowColour, rowSize);

            if (matchId) {
              // Existing product the user chose to keep as-is → leave untouched.
              if (skipExisting(i)) { skipped++; continue; }
              // Only write fields the preview actually filled in, so a blank cell
              // never zeroes a real price/category. Quantity, when provided, is set
              // here too — this is what keeps Products and Stock in sync on import.
              const upd: Record<string, any> = { ...extras };
              // Only overwrite a price/cost when the row carries a REAL positive
              // value. A blank or 0 from an AI extraction that couldn't read the
              // figure must never zero a product's existing cost/price/MRP —
              // this was the "cost becomes 0 after AI import" bug.
              if (has(row, ['sellingprice', 'price', 'rate']) && price > 0) upd.sellingPrice = price;
              if (has(row, ['costprice', 'wholesalecost', 'cost', 'purchaseprice']) && cost > 0) { upd.wholesaleCost = cost; upd.costPrice = cost; }
              if (has(row, ['mrp']) && mrp > 0) upd.mrp = mrp;
              if (has(row, ['category'])) upd.category = category;
              if (has(row, ['minstock', 'minlevel'])) upd.minStock = parseFloat(getVal(row, ['minstock', 'minlevel']));
              if (has(row, ['quantity', 'stock', 'qty'])) upd.currentStock = quantity;

              // Per-variant stock — merge into variants[] so billing's stock
              // decrement can find the specific colour/size row. Falls back
              // to plain currentStock behaviour when no variant on the row.
              if (rowVariantKey && quantity > 0) {
                const merged = mergeVariantIntoArray(
                  productVariantsCache.get(matchId) ?? [],
                  rowColour, rowSize, quantity, cost, mrp,
                );
                upd.variants = merged as any;
                productVariantsCache.set(matchId, merged);
                // currentStock rollup mirrors the sum of variant stocks —
                // increment by this row's qty (not SET to it), so a
                // multi-row import for the same product adds correctly.
                if (has(row, ['quantity', 'stock', 'qty'])) upd.currentStock = { increment: quantity };
              }

              const metaUpdates: any = {};
              if (has(row, ['color', 'colour'])) metaUpdates.color = getVal(row, ['color', 'colour']);
              if (has(row, ['fabric'])) metaUpdates.fabric = getVal(row, ['fabric']);
              if (has(row, ['sole_material', 'solematerial'])) metaUpdates.sole_material = getVal(row, ['sole_material', 'solematerial']);
              if (has(row, ['weight'])) metaUpdates.weight = getVal(row, ['weight']);

              if (Object.keys(metaUpdates).length > 0) upd.metadata = metaUpdates;

              await prisma.product.update({ where: { id: matchId }, data: upd });
              updated++;
            } else {
              const minStock = getVal(row, ['minstock', 'minlevel']);

              const meta: any = {};
              if (getVal(row, ['color', 'colour'])) meta.color = getVal(row, ['color', 'colour']);
              if (getVal(row, ['fabric'])) meta.fabric = getVal(row, ['fabric']);
              if (getVal(row, ['sole_material', 'solematerial'])) meta.sole_material = getVal(row, ['sole_material', 'solematerial']);
              if (getVal(row, ['weight'])) meta.weight = getVal(row, ['weight']);

              // Seed variants[] with this row's variant so per-size stock is
              // tracked from row 1. Subsequent rows for the same product will
              // merge into this array via mergeVariantIntoArray().
              const initialVariants = rowVariantKey && quantity > 0
                ? [{
                    color: rowColour,
                    size: rowSize,
                    stock: quantity,
                    costPrice: cost > 0 ? cost : undefined,
                    wholesalePrice: cost > 0 ? cost : undefined,
                    sellingPrice: price > 0 ? price : undefined,
                    mrp: mrp > 0 ? mrp : undefined,
                  }]
                : [];

              const newProd = await prisma.product.create({
                data: {
                  shopId,
                  name: String(name),
                  barcode: barcodeStr ?? `BAR-${Date.now()}-${i}`,
                  // Leave price/cost UNSET (not 0) when the AI couldn't read a
                  // figure, so a new product doesn't come in with a hard 0 the
                  // shopkeeper then has to hunt down and fix.
                  sellingPrice: price > 0 ? price : undefined,
                  wholesaleCost: cost > 0 ? cost : undefined,
                  costPrice: cost > 0 ? cost : undefined,
                  mrp: mrp > 0 ? mrp : undefined,
                  category,
                  currentStock: quantity,
                  minStock: minStock ? parseFloat(minStock) : undefined,
                  baseUnit: getVal(row, ['unit']) || (masterUnits.length > 0 ? masterUnits[0].name : 'pcs'),
                  variants: initialVariants.length ? (initialVariants as any) : undefined,
                  metadata: meta,
                  ...extras
                }
              });
              matchId = newProd.id;
              if (barcodeStr) barcodeIndex.set(barcodeStr, matchId);
              nameIndex.set(String(name).toLowerCase().trim(), matchId);
              productVariantsCache.set(matchId, initialVariants);
              created++;
              // Log the imported opening stock so the "+N newly added" badge shows.
              if (quantity > 0) {
                await prisma.stockLog.create({
                  data: { shopId, productId: matchId, type: 'import', quantity, note: 'Imported opening stock' },
                }).catch(() => {});
              }
            }

            if (godownId && quantity > 0 && matchId) {
              const existingGodownProd = await prisma.godownProduct.findUnique({
                where: { godownId_productId: { godownId, productId: matchId } }
              });
              if (existingGodownProd) {
                await prisma.godownProduct.update({
                  where: { godownId_productId: { godownId, productId: matchId } },
                  data: { quantity: { increment: quantity } }
                });
              } else {
                await prisma.godownProduct.create({
                  data: { godownId, productId: matchId, quantity }
                });
              }
            }
          } catch (rowErr: any) {
            console.error(`Import row ${i + 1} failed [${importType}]:`, JSON.stringify(row), rowErr.message, rowErr.meta);
            skipped++;
            rowErrors.push(`Row ${i + 1}: ${rowErr.message || 'Failed to import'}`);
          }
        }
        break;
      }
      
      case 'suppliers': {

        const existingSuppliers = await prisma.supplier.findMany({ where: { shopId }, select: { id: true, name: true } });
        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          const name = getVal(row, ['suppliername', 'name', 'supplier', 'vendor', 'partyname', 'party']);
          if (!name) {
            skipped++;
            rowErrors.push(`Row ${i + 1}: Skipped - Missing supplier name`);
            continue;
          }
          const hit = existingSuppliers.find(s => (s.name ?? '').toLowerCase() === String(name).trim().toLowerCase());
          if (hit) {
            if (skipExisting(i)) { skipped++; continue; }
            await prisma.supplier.update({
              where: { id: hit.id },
              data: {
                ...(has(row, ['contact']) ? { contact: String(getVal(row, ['contact'])) } : {}),
                ...(has(row, ['mobile', 'phone']) ? { mobile: String(getVal(row, ['mobile', 'phone'])) } : {}),
                ...(has(row, ['gst']) ? { gst: String(getVal(row, ['gst'])) } : {}),
              }
            });
            updated++;
            continue;
          }
          const newSup = await prisma.supplier.create({
            data: {
              shopId,
              name: String(name),
              contact: String(getVal(row, ['contact']) || ''),
              mobile: String(getVal(row, ['mobile', 'phone']) || ''),
              gst: String(getVal(row, ['gst']) || ''),
              balance: parseFloat(getVal(row, ['balance', 'openingbalance']) || 0)
            }
          });
          existingSuppliers.push({ id: newSup.id, name: newSup.name });
          created++;
        }
        break;
      }

      case 'customers': {
        // Match the exact field set the dedicated "Add Customer" form
        // (app/api/v1/crm/customers/route.ts) writes, so imported customers
        // look identical to manually-added ones — not a sparse subset.
        const existingCustomers = await prisma.customer.findMany({
          where: { shopId },
          select: { id: true, name: true, mobile: true }
        });

        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          try {
            const name = getVal(row, ['customername', 'name', 'customer', 'client', 'partyname', 'party']);
            if (!name) { 
              skipped++; 
              rowErrors.push(`Row ${i + 1}: Skipped - Missing customer name`);
              continue; 
            }
            const mobile = String(getVal(row, ['mobile', 'phone']) || '').trim();
            const openingBalance = parseFloat(getVal(row, ['openingbalance', 'balance', 'openingudhar', 'udhar']) || 0);

            // No dedicated city/village column on Customer — fold it into address.
            const village = getVal(row, ['villagecity', 'village', 'city', 'town']);
            const addressRaw = getVal(row, ['address']);
            const address = [village, addressRaw].filter(Boolean).join(', ') || undefined;
            const gst = getVal(row, ['gst', 'gstin', 'gstnumber']);

            const existing = existingCustomers.find(c =>
              (mobile && c.mobile === mobile) || (c.name ?? '').toLowerCase() === String(name).trim().toLowerCase()
            );

            // Existing customer the user chose to keep unchanged → skip entirely
            // (don't touch details and don't add the opening-balance transaction).
            if (existing && skipExisting(i)) { skipped++; continue; }

            let customerId: string;
            if (existing) {
              await prisma.customer.update({
                where: { id: existing.id },
                data: {
                  email: getVal(row, ['email'])?.trim() || undefined,
                  shopName: getVal(row, ['shopname', 'businessname'])?.trim() || undefined,
                  gst: gst?.trim() || undefined,
                  pan: getVal(row, ['pan'])?.trim() || undefined,
                  address,
                  creditDays: getVal(row, ['creditdays']) ? parseInt(getVal(row, ['creditdays'])) : undefined,
                  creditLimit: getVal(row, ['creditlimit']) ? parseFloat(getVal(row, ['creditlimit'])) : undefined,
                  notes: getVal(row, ['notes'])?.trim() || undefined,
                  // Same atomic pattern the real "Add Udhar" flow uses
                  // (app/api/v1/customers/[id]/transactions/route.ts) — increment,
                  // don't overwrite, so re-importing doesn't clobber real activity.
                  ...(openingBalance > 0 ? { totalDue: { increment: openingBalance } } : {})
                }
              });
              customerId = existing.id;
              updated++;
            } else {
              const customer = await prisma.customer.create({
                data: {
                  shopId,
                  name: String(name).trim(),
                  mobile,
                  email: String(getVal(row, ['email']) || '').trim(),
                  customerType: getVal(row, ['customertype']) || 'customer',
                  shopName: getVal(row, ['shopname', 'businessname'])?.trim() || null,
                  gst: gst?.trim() || null,
                  pan: getVal(row, ['pan'])?.trim() || null,
                  address: address || null,
                  creditDays: parseInt(getVal(row, ['creditdays']) || 0),
                  creditLimit: parseFloat(getVal(row, ['creditlimit']) || 0),
                  notes: getVal(row, ['notes'])?.trim() || null,
                  totalDue: openingBalance,
                }
              });
              customerId = customer.id;
              existingCustomers.push({ id: customer.id, name: customer.name, mobile: customer.mobile });
              created++;
            }

            if (openingBalance > 0) {
              await prisma.customer_transactions.create({
                data: { customer_id: customerId, type: 'udhar', amount: openingBalance, note: 'Imported opening balance' }
              });
            }
          } catch (rowErr: any) {
            console.error(`Import row ${i + 1} failed [customers]:`, JSON.stringify(row), rowErr.message, rowErr.meta);
            skipped++;
            rowErrors.push(`Row ${i + 1}: ${rowErr.message || 'Failed to import'}`);
          }
        }
        break;
      }

      case 'purchase': {
        // Purchase invoice import is available on all plans (Dukan, Vyapar,
        // Udyog): it creates/updates products and increases their stock, which
        // every plan already supports.
        if (data.length === 0) break;
        const firstRow = data[0];
        // Preview-panel overrides win over row-extracted values: the wizard
        // exposes a "Supplier Details" card where the shopkeeper can correct
        // the name / mobile / GST or type the amount already paid before
        // hitting Import. Fall back to the row when the panel is empty.
        const supplierOverride = (body as any).supplier || {};
        const supplierName = String(
          supplierOverride.name ||
          getVal(firstRow, ['supplier', 'vendorname', 'vendor', 'suppliername']) ||
          'Unknown Supplier'
        ).trim();
        const supplierMobile = String(supplierOverride.mobile || getVal(firstRow, ['suppliermobile', 'mobile', 'phone']) || '').trim();
        const supplierGst = String(supplierOverride.gst || getVal(firstRow, ['suppliergst', 'gst', 'gstin']) || '').trim().toUpperCase();
        const supplierAddress = String(supplierOverride.address || getVal(firstRow, ['supplieraddress', 'address']) || '').trim();
        const supplierCreditDays = supplierOverride.creditDays != null && supplierOverride.creditDays !== ''
          ? Math.max(0, parseInt(String(supplierOverride.creditDays)) || 0) : null;
        const supplierCreditLimit = supplierOverride.creditLimit != null && supplierOverride.creditLimit !== ''
          ? Math.max(0, parseFloat(String(supplierOverride.creditLimit)) || 0) : null;
        // Amount the shopkeeper already handed over at the counter — the rest
        // becomes an unpaid balance the supplier is owed.
        const paidAtImport = Math.max(0, parseFloat(String(supplierOverride.paidAmount ?? '')) || 0);
        // Bill-level charges (hamali, freight …) reviewed in the import screen; sent with the first batch only. They are part of what the
        // supplier is owed and are stored on the purchase — never as products or stock.
        const billCharges = parseCharges((body as any).charges);
        const billChargesTotal = chargesTotal(billCharges);

        const invoiceNumber = getVal(firstRow, ['invoicenumber', 'billnumber', 'invoice']) || `INV-${Date.now()}`;
        const rawDate = getVal(firstRow, ['invoicedate', 'billdate', 'date']);
        const billDate = parseFlexibleDate(rawDate) || new Date();

        let dbSupplier = await prisma.supplier.findFirst({
          where: { shopId, name: { equals: supplierName, mode: 'insensitive' } }
        });
        if (!dbSupplier) {
          dbSupplier = await prisma.supplier.create({
            data: {
              shopId,
              name: supplierName,
              mobile: supplierMobile || null,
              gst: supplierGst || null,
              address: supplierAddress || null,
              creditDays: supplierCreditDays ?? 0,
              creditLimit: supplierCreditLimit ?? 0,
              balance: 0,
            } as any
          });
        } else {
          // Enrich existing supplier: blank imports never overwrite non-empty
          // fields (same convention the rest of the import flow uses), and
          // credit terms only change when the shopkeeper explicitly typed a
          // value in the preview panel.
          const patch: any = {};
          if (supplierMobile && !dbSupplier.mobile) patch.mobile = supplierMobile;
          if (supplierGst && !dbSupplier.gst) patch.gst = supplierGst;
          if (supplierAddress && !(dbSupplier as any).address) patch.address = supplierAddress;
          if (supplierCreditDays != null) patch.creditDays = supplierCreditDays;
          if (supplierCreditLimit != null) patch.creditLimit = supplierCreditLimit;
          if (Object.keys(patch).length) {
            dbSupplier = await prisma.supplier.update({ where: { id: dbSupplier.id }, data: patch });
          }
        }

        // Bada Udyog weighbridge/kanta-chitthi capture — bill-level, read once from the first row (same convention as invoiceNumber/date).
        const tareWeightRaw = getVal(firstRow, ['tareweight', 'tareweightkg', 'tare']);
        const grossWeightRaw = getVal(firstRow, ['grossweight', 'grossweightkg', 'totalweight', 'total']);
        const tareWeightKg = tareWeightRaw !== undefined && String(tareWeightRaw).trim() !== '' ? parseFloat(String(tareWeightRaw)) : null;
        const grossWeightKg = grossWeightRaw !== undefined && String(grossWeightRaw).trim() !== '' ? parseFloat(String(grossWeightRaw)) : null;

        const purchaseInvoice = await prisma.purchaseInvoice.create({
          data: {
            shopId,
            supplierId: dbSupplier.id,
            invoiceNumber: String(invoiceNumber),
            date: billDate,
            totalCost: 0,
            gst: 0,
            ...(tareWeightKg != null && isFinite(tareWeightKg) ? { tareWeightKg } : {}),
            ...(grossWeightKg != null && isFinite(grossWeightKg) ? { grossWeightKg } : {}),
          }
        });

        let totalInvoiceCost = 0;   // base + GST (what the supplier is owed)
        let totalInvoiceGst = 0;    // tax portion

        // Also pull the variants[] JSON up-front so we can merge per-variant
        // qty into it below without a per-row round-trip. Archived products
        // are excluded so a re-import doesn't silently un-archive and reuse
        // a soft-deleted row when the shopkeeper genuinely wants a new one.
        const existingProducts = await prisma.product.findMany({
          where: { shopId, archived: false },
          select: { id: true, name: true, barcode: true, currentStock: true, variants: true, millCategory: true }
        });
        const barcodeIndex = new Map<string, string>();
        const stockIndex = new Map<string, number>();
        // Mill raw-material bridge (see the create-lot block below) — only
        // ever true for a product already tagged via the mill Add-Product
        // form, never guessed from the import row itself (imports carry no
        // millCategory column).
        const millCategoryIndex = new Map<string, string | null>();
        // Exact (case-/whitespace-insensitive) name match only — see the
        // 'product' case above for why fuzzy matching was removed. Also
        // doubles as same-batch dedup: two rows referencing the same NEW
        // product (same name, no barcode) both miss the DB-seeded half of
        // this map, but the first row's create() populates it before the
        // second row runs, so they still merge into one product's variants[].
        const nameIndex = new Map<string, string>();
        // Live variants[] cache so two rows for the same product both merge
        // into the same array (last write wins would drop the first row's
        // qty otherwise).
        const variantsIndex = new Map<string, any[]>();
        for (const p of existingProducts) {
          if (p.barcode) barcodeIndex.set(p.barcode, p.id);
          if (p.name) nameIndex.set(p.name.toLowerCase().trim(), p.id);
          stockIndex.set(p.id, p.currentStock || 0);
          variantsIndex.set(p.id, Array.isArray(p.variants) ? (p.variants as any[]).map((v: any) => ({ ...v })) : []);
          millCategoryIndex.set(p.id, (p as any).millCategory ?? null);
        }

        // Size-range expansion: a supplier bill row for "size 6*8, qty 2" is
        // shorthand for 3 rows (6, 7, 8) each qty 2. Do this ONCE before the
        // main loop so downstream logic sees only concrete sizes. Same rule
        // the party/scan-bill route and AddBillModal already use — see
        // lib/sizeRange.ts. Non-range sizes and rows with no size at all
        // pass through unchanged, so this can't break existing imports.
        const expandedData: any[] = [];
        for (const row of data) {
          const sizeRaw = getVal(row, ['size']);
          const sizes = parseSizeRange(sizeRaw ? String(sizeRaw) : '');
          if (sizes.length <= 1) { expandedData.push(row); continue; }
          for (const s of sizes) {
            // Clone the row and overwrite whichever key the file used for size
            // so downstream getVal(row, ['size']) picks the individual value.
            const clone: any = { ...row };
            const sizeKey = Object.keys(row).find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === 'size');
            if (sizeKey) clone[sizeKey] = s;
            else clone.Size = s;
            expandedData.push(clone);
          }
        }
        // Accumulators — filled per row, flushed in bulk after the loop to
        // cut round-trips from O(N×5) sequential to ~O(N) + a few batch writes.
        const purchaseItemsData: any[] = [];
        const stockLogsData: any[] = [];
        const stockMovementsData: any[] = [];
        const rawLotsData: any[] = [];
        // Map of productId → latest updateData (last write wins — stock is cumulative)
        const productUpdateMap = new Map<string, { id: string; data: any }>();
        // Map of productId → total quantity to upsert into godownProduct
        const godownQtyMap = new Map<string, number>();

        // Iterate expanded rows so a "6*8" shorthand actually creates 3
        // per-size PurchaseItem rows + 3 variant entries downstream.
        for (let i = 0; i < expandedData.length; i++) {
          const row = expandedData[i];
          try {
            const name = getVal(row, ['productname', 'name', 'description', 'item']);
            const quantity = parseFloat(getVal(row, ['quantity', 'qty', 'stock']) || 0);
            const unitCost = parseFloat(getVal(row, ['unitcost', 'wholesalecost', 'cost', 'price', 'rate']) || 0);
            // MRP actually printed on the invoice, if the AI extracted one —
            // left unset (not guessed) when it didn't, so the shopkeeper sets
            // it their own way instead of the import inventing a margin.
            const extractedMrp = parseFloat(getVal(row, ['mrp']) || 0);
            // Same for selling price — only what the row/review table itself
            // actually carries; never a guessed markup over cost.
            const rowSellingPrice = parseFloat(getVal(row, ['sellingprice', 'sellprice', 'saleprice', 'retailprice']) || 0);

            if (!name) { skipped++; rowErrors.push(`Row ${i + 1}: Skipped - Missing product name`); continue; }
            if (quantity <= 0) { skipped++; rowErrors.push(`Row ${i + 1}: Skipped - Quantity must be greater than 0 (fill it in and re-import)`); continue; }

            const barcode = getVal(row, ['barcode']);
            const barcodeStr = barcode ? String(barcode) : null;
            let matchId: string | null = barcodeStr ? barcodeIndex.get(barcodeStr) ?? null : null;
            if (!matchId) matchId = nameIndex.get(String(name).toLowerCase().trim()) ?? null;

            // Colour / Size from THIS specific row — after size-range
            // expansion above, this is always one concrete pair (or empty
            // for a plain product row). Falls back to Volume/Bottle-Type
            // for a liquor shop (see resolveRowVariant).
            const { rowColour, rowSize } = resolveRowVariant(row, getVal, isLiquorImport);
            const rowVariantKey = variantKey(rowColour, rowSize);

            if (!matchId) {
              // New product — seed variants[] with the current row's variant
              // if present, so per-variant stock tracking is live from row 1.
              // Mill pack: stock stays 0 — tracked via RawMaterialLots/batches.
              const stockSeed = isMillImport ? 0 : quantity;
              const newVariants = rowVariantKey
                ? [{
                    color: rowColour,
                    size: rowSize,
                    stock: stockSeed,
                    costPrice: unitCost > 0 ? unitCost : undefined,
                    wholesalePrice: unitCost > 0 ? unitCost : undefined,
                    sellingPrice: rowSellingPrice > 0 ? rowSellingPrice : undefined,
                    mrp: extractedMrp > 0 ? extractedMrp : undefined,
                  }]
                : [];

              const newProduct = await prisma.product.create({
                data: {
                  shopId,
                  name: String(name),
                  barcode: barcodeStr ?? undefined,
                  baseUnit: getVal(row, ['unit']) || 'pcs',
                  wholesaleCost: unitCost > 0 ? unitCost : undefined,
                  costPrice: unitCost > 0 ? unitCost : undefined,
                  sellingPrice: rowSellingPrice > 0 ? rowSellingPrice : undefined,
                  mrp: extractedMrp > 0 ? extractedMrp : undefined,
                  category: getVal(row, ['category']) || 'General',
                  currentStock: stockSeed,
                  variants: newVariants.length ? (newVariants as any) : undefined,
                  metadata: rowColour ? { color: rowColour } : {},
                  ...getProductExtras(row),
                }
              });
              matchId = newProduct.id;
              if (barcodeStr) barcodeIndex.set(barcodeStr, matchId);
              nameIndex.set(String(name).toLowerCase().trim(), matchId);
              stockIndex.set(matchId, stockSeed);
              variantsIndex.set(matchId, newVariants);
              created++;
            } else {
              // Existing product — accumulate stock rollup.
              // Mill pack: skip stock update — tracked via RawMaterialLots/batches.
              const newStock = (stockIndex.get(matchId) || 0) + quantity;
              const updateData: any = isMillImport ? {} : {
                currentStock: newStock,
              };
              // Never overwrite a real cost with 0 — a purchase row whose cost
              // the AI couldn't read must still add stock without wiping the
              // product's existing wholesale cost (the "cost becomes 0" bug).
              if (unitCost > 0) { updateData.wholesaleCost = unitCost; updateData.costPrice = unitCost; }
              // Only touch selling price when the shopkeeper actually typed
              // one this import — an existing product's price is never
              // guessed/overwritten just because it got restocked.
              if (rowSellingPrice > 0) { updateData.sellingPrice = rowSellingPrice; }
              // Reference codes carried by this row (SKU / Other Code / HSN /
              // GST%) update the existing product too — but only when the row
              // actually has a value, so a blank bill row never wipes a code
              // the product already has. Matches the truthy-only guard used
              // by getProductExtras above.
              const extras = getProductExtras(row);
              if (extras.sku) updateData.sku = extras.sku;
              if (extras.otherCode) updateData.otherCode = extras.otherCode;
              if (extras.hsnCode) updateData.hsnCode = extras.hsnCode;
              if (extras.gstPercent !== undefined) updateData.gstPercent = extras.gstPercent;
              if (extras.location) updateData.location = extras.location;
              if (extras.grade) updateData.grade = extras.grade;
              if (extras.variety) updateData.variety = extras.variety;
              if (extras.subcategory) updateData.subcategory = extras.subcategory;
              if (extras.packSize !== undefined) updateData.packSize = extras.packSize;
              if (extras.packUnit) updateData.packUnit = extras.packUnit;
              if (rowVariantKey) {
                const mergedVariants = mergeVariantIntoArray(
                  variantsIndex.get(matchId) ?? [],
                  rowColour, rowSize, quantity, unitCost, extractedMrp, rowSellingPrice,
                );
                updateData.variants = mergedVariants as any;
                variantsIndex.set(matchId, mergedVariants);
              }
              productUpdateMap.set(matchId, { id: matchId as string, data: updateData });
              stockIndex.set(matchId, newStock);
              updated++;
            }

            // Mill pack: skip godown stock — stock tracked via RawMaterialLots/batches.
            if (!isMillImport && godownId && matchId) {
              godownQtyMap.set(matchId, (godownQtyMap.get(matchId) || 0) + quantity);
            }
            if (matchId) affectedProductIds.add(matchId);
            // Raw material lot creation is intentionally NOT auto-run here.
            // OCR quantities are often wrong, and auto-creating a lot blocks
            // the "Import from Purchase" dropdown in Add Raw Material Lot modal
            // (the lot-exists check filters out candidates that already have a lot).
            // The correct flow: import the bill → PurchaseItem is created →
            // user opens Raw Material → Add Lot → "Import from Purchase" dropdown
            // shows the bill line with correct data for verification before saving.

            // Purchase total = what the shopkeeper actually OWES the supplier =
            // the REAL bill total, WITH tax. Two things matter here:
            //   • It must be tax-inclusive (the client's bill's Grand Total,
            //     not the taxable Sub Total).
            //   • It must be the supplier's real price — NOT any landed-cost
            //     markup the shopkeeper adds to `unitCost` for their own
            //     pricing. The payable stays the real bill.
            // So prefer the AI-extracted per-line `amount` (the printed line
            // total after discount + GST), which satisfies both. Fall back to
            // base + GST%, then bare base, when the bill had no amount column.
            const rowGstPct = parseFloat(getVal(row, ['gst', 'gstpercent', 'gstrate', 'taxrate', 'tax']) || 0) || 0;
            const rowAmount = parseFloat(getVal(row, ['amount', 'total', 'lineamount', 'linetotal', 'netamount']) || 0) || 0;
            const itemBase = quantity * unitCost;
            const itemTotal = rowAmount > 0 ? rowAmount : itemBase * (1 + rowGstPct / 100);
            totalInvoiceGst += Math.max(0, itemTotal - itemBase);
            totalInvoiceCost += itemTotal;

            // Create Batch record first if a batch/lot number was provided in
            // the row so the PurchaseItem can reference it from birth (enables
            // FIFO billing and correct lot-based returns for imported invoices).
            // Fall back to the bill-level batch entered in the review panel.
            const billBatchNum = String(supplierOverride.batchNumber ?? '').trim();
            const rowBatchNum = getVal(row, ['batchnumber', 'batch', 'lotnumber', 'lot']) || (billBatchNum || undefined);
            let importedBatchId: string | null = null;
            if (rowBatchNum && matchId) {
              const expiryRaw = getVal(row, ['expirydate', 'expiry']);
              const expiryDt = expiryRaw ? new Date(expiryRaw) : undefined;
              const importedBatch = await prisma.batch.create({
                data: {
                  shopId,
                  productId: matchId as string,
                  batchNumber: String(rowBatchNum).trim(),
                  quantity,
                  initialQuantity: quantity,
                  costPrice: unitCost > 0 ? unitCost : undefined,
                  expiryDate: expiryDt && !isNaN(expiryDt.getTime()) ? expiryDt : undefined,
                  purchaseDate: billDate,
                },
              });
              importedBatchId = importedBatch.id;
            }

            purchaseItemsData.push({
              purchaseInvoiceId: purchaseInvoice.id,
              productId: matchId,
              variantKey: rowVariantKey ?? undefined,
              quantity,
              cost: unitCost,
              gst: rowGstPct,
              mrp: extractedMrp > 0 ? extractedMrp : undefined,
              ...(importedBatchId ? { batchId: importedBatchId } : {}),
            });

            stockLogsData.push({
              shopId,
              productId: matchId,
              type: 'purchase',
              quantity,
              note: `Purchase Invoice ${invoiceNumber}`,
            });
            // StockMovement is what reversePurchaseInvoiceEffects reads to
            // reverse stock when this invoice is deleted. Mill pack skips
            // this because we didn't update product stock — reversal would
            // have nothing to undo (mill stock is managed via lots/batches).
            if (!isMillImport) {
              stockMovementsData.push({
                shopId,
                productId: matchId as string,
                warehouseId: godownId || null,
                type: 'purchase',
                quantity,
                referenceId: purchaseInvoice.id,
              });
            }
          } catch (rowErr: any) {
            console.error(`Import row ${i + 1} failed [${importType}]:`, JSON.stringify(row), rowErr.message, rowErr.meta);
            skipped++;
            rowErrors.push(`Row ${i + 1}: ${rowErr.message || 'Failed to import'}`);
          }
        }

        // Bulk-flush all per-row writes accumulated above — turns O(N×5)
        // sequential round-trips into a handful of parallel batch inserts.
        {
          const flushOps: Promise<any>[] = [];
          if (purchaseItemsData.length) flushOps.push(prisma.purchaseItem.createMany({ data: purchaseItemsData }));
          if (stockLogsData.length) flushOps.push(prisma.stockLog.createMany({ data: stockLogsData }));
          if (stockMovementsData.length) flushOps.push(prisma.stockMovement.createMany({ data: stockMovementsData }));
          if (rawLotsData.length) flushOps.push(prisma.rawMaterialLot.createMany({ data: rawLotsData }));
          for (const { id, data } of productUpdateMap.values()) {
            flushOps.push(prisma.product.update({ where: { id }, data }));
          }
          if (godownId) {
            for (const [productId, qty] of godownQtyMap.entries()) {
              flushOps.push(prisma.godownProduct.upsert({
                where: { godownId_productId: { godownId, productId } },
                create: { godownId, productId, quantity: qty },
                update: { quantity: { increment: qty } },
              }));
            }
          }
          await Promise.all(flushOps);
        }

        await prisma.purchaseInvoice.update({
          where: { id: purchaseInvoice.id },
          // totalCost is tax-inclusive; gst holds the tax portion so the
          // Purchases detail can show Subtotal + GST = Total.
          data: {
            totalCost: totalInvoiceCost + billChargesTotal,
            gst: Math.round(totalInvoiceGst * 100) / 100,
            ...(billCharges.length ? { charges: billCharges as any } : {}),
          }
        });

        // Reflect the invoice on the supplier's ledger — otherwise the imported
        // purchase never shows up in Suppliers → Payment History, the "Remaining
        // to pay" tile stays at zero, and the credit-limit chip we just wired
        // has nothing to react to.
        // Gated on `payload.supplier` being present so a chunked multi-batch
        // import (rare: >DB_BATCH_SIZE items on one bill) still only writes the
        // supplier-ledger side-effects once, on the initial batch — subsequent
        // batches would double-count balance / spam Payment History otherwise.
        const runSupplierSideEffects = !!supplierOverride && Object.keys(supplierOverride).length > 0;
        const grandTotal = totalInvoiceCost + billChargesTotal;
        if (runSupplierSideEffects && grandTotal > 0) {
          const owed = Math.max(0, grandTotal - paidAtImport);
          await prisma.supplier.update({
            where: { id: dbSupplier.id },
            data: { balance: { increment: owed } },
          });
          const purchaseTxn = await prisma.supplierTransaction.create({
            data: {
              supplierId: dbSupplier.id,
              type: 'purchase',
              amount: grandTotal,
              billNumber: String(invoiceNumber),
              note: billCharges.length ? `Imported purchase invoice (incl. ${billCharges.map((c) => c.name).join(', ')})` : 'Imported purchase invoice',
              ...(billDate ? { createdAt: billDate } : {}),
            },
          });
          purchaseSupplierId = dbSupplier.id;
          purchaseSupplierTxnId = purchaseTxn.id;
          if (paidAtImport > 0) {
            await prisma.supplierTransaction.create({
              data: {
                supplierId: dbSupplier.id,
                type: 'payment',
                amount: paidAtImport,
                billNumber: String(invoiceNumber),
                note: 'Paid at import',
                ...(billDate ? { createdAt: billDate } : {}),
              },
            });
          }
        }
        // Broker who arranged this bill (Bada Udyog): find/create the Broker party and log the commission owed to them.
        // Best-effort and outside the purchase itself — a failure here must never undo the imported bill.
        try {
          const br = (body as any).broker;
          if (String(br?.name ?? '').trim()) await logBrokerCommission(shopId, { name: br.name, commission: br.commission, billNumber: String(invoiceNumber), kind: 'supplier', party: String(getVal(firstRow, ['supplier', 'vendor', 'suppliername']) || '') });
        } catch (e) { console.error('[import purchase] broker step failed (purchase kept):', e); }
        break;
      }

      case 'stock': {
        // Opening Stock: creates the product if it doesn't already exist, then
        // sets currentStock to the row's quantity — a baseline/snapshot, not an
        // increment, so re-running the same file is idempotent. Shows up in both
        // Products (via product.create) and Stock (currentStock is what
        // LegacyStockUI/WholesaleStockUI read for non-godown shops).
        const existingProducts = await prisma.product.findMany({
          where: { shopId },
          select: { id: true, name: true, barcode: true, currentStock: true }
        });

        const barcodeIndex = new Map<string, string>();
        // Exact (case-/whitespace-insensitive) name match only — see the
        // 'product' case above for why fuzzy matching was removed.
        const nameIndex = new Map<string, string>();
        for (const p of existingProducts) {
          if (p.barcode) barcodeIndex.set(p.barcode, p.id);
          if (p.name) nameIndex.set(p.name.toLowerCase().trim(), p.id);
        }

        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          try {
            const name = getVal(row, ['productname', 'name', 'description', 'item']);
            const quantity = parseFloat(getVal(row, ['quantity', 'stock', 'qty', 'openingstock']) || 0);
            if (!name) { skipped++; rowErrors.push(`Row ${i + 1}: Skipped - Missing product name`); continue; }

            const barcode = getVal(row, ['barcode']);
            const barcodeStr = barcode ? String(barcode) : null;
            let matchId: string | null = barcodeStr ? barcodeIndex.get(barcodeStr) ?? null : null;
            if (!matchId) matchId = nameIndex.get(String(name).toLowerCase().trim()) ?? null;

            const cost = parseFloat(getVal(row, ['costprice', 'wholesalecost', 'cost', 'purchaseprice']) || 0);
            const price = parseFloat(getVal(row, ['sellingprice', 'price', 'rate']) || 0);
            const category = getVal(row, ['category']) || 'General';
            const extras = getProductExtras(row);

            if (matchId) {
              // Keep existing untouched when the user chose so.
              if (skipExisting(i)) { skipped++; continue; }
              const upd: Record<string, any> = { ...extras };
              // Opening Stock is a snapshot: set stock only when a quantity was
              // actually given, otherwise leave the product's real stock alone.
              if (has(row, ['quantity', 'stock', 'qty', 'openingstock'])) upd.currentStock = quantity;
              // Guard against a 0/blank price or cost overwriting a real one.
              if (has(row, ['sellingprice', 'price', 'rate']) && price > 0) upd.sellingPrice = price;
              if (has(row, ['costprice', 'wholesalecost', 'cost', 'purchaseprice']) && cost > 0) { upd.wholesaleCost = cost; upd.costPrice = cost; }
              if (has(row, ['category'])) upd.category = category;
              await prisma.product.update({ where: { id: matchId }, data: upd });
              updated++;
            } else {
              const minStock = getVal(row, ['minstock', 'minlevel']);
              const newProduct = await prisma.product.create({
                data: {
                  shopId,
                  name: String(name),
                  barcode: barcodeStr ?? undefined,
                  baseUnit: getVal(row, ['unit']) || 'pcs',
                  sellingPrice: price,
                  wholesaleCost: cost,
                  mrp: parseFloat(getVal(row, ['mrp']) || price),
                  category,
                  currentStock: quantity,
                  minStock: minStock ? parseFloat(minStock) : undefined,
                  metadata: getVal(row, ['size']) || getVal(row, ['color']) ? { size: getVal(row, ['size']), color: getVal(row, ['color']) } : {},
                  ...extras
                }
              });
              matchId = newProduct.id;
              if (barcodeStr) barcodeIndex.set(barcodeStr, matchId);
              nameIndex.set(String(name).toLowerCase().trim(), matchId);
              created++;
            }

            if (godownId && matchId) {
              const existingGodownProd = await prisma.godownProduct.findUnique({
                where: { godownId_productId: { godownId, productId: matchId } }
              });
              if (existingGodownProd) {
                await prisma.godownProduct.update({
                  where: { godownId_productId: { godownId, productId: matchId } },
                  data: { quantity }
                });
              } else {
                await prisma.godownProduct.create({
                  data: { godownId, productId: matchId, quantity }
                });
              }
            }
            if (matchId) affectedProductIds.add(matchId);

            // Create Batch record for opening stock when a lot/batch number is
            // provided — lets FIFO billing pick up this stock immediately.
            const rowBatchNum = getVal(row, ['batchnumber', 'batch', 'lotnumber', 'lot']);
            if (rowBatchNum && matchId && quantity > 0) {
              const expiryRaw = getVal(row, ['expirydate', 'expiry']);
              const expiryDt = expiryRaw ? new Date(expiryRaw) : undefined;
              const existingBatch = await prisma.batch.findFirst({
                where: { shopId, productId: matchId, batchNumber: String(rowBatchNum).trim() },
              });
              if (!existingBatch) {
                await prisma.batch.create({
                  data: {
                    shopId,
                    productId: matchId,
                    batchNumber: String(rowBatchNum).trim(),
                    quantity,
                    initialQuantity: quantity,
                    costPrice: cost > 0 ? cost : undefined,
                    expiryDate: expiryDt && !isNaN(expiryDt.getTime()) ? expiryDt : undefined,
                  },
                });
              } else {
                await prisma.batch.update({
                  where: { id: existingBatch.id },
                  data: { quantity, initialQuantity: quantity },
                });
              }
            }
          } catch (rowErr: any) {
            console.error(`Import row ${i + 1} failed [stock]:`, JSON.stringify(row), rowErr.message, rowErr.meta);
            skipped++;
            rowErrors.push(`Row ${i + 1}: ${rowErr.message || 'Failed to import'}`);
          }
        }
        break;
      }

      case 'sales': {
        // Each row = one historical sale (one product line item). The pipeline
        // is idempotent and self-healing: products and customers are auto-created
        // if missing, amounts are reconciled from price OR line total, and bills
        // already imported are skipped so re-uploading never duplicates sales.
        const existingProducts = await prisma.product.findMany({
          where: { shopId },
          select: { id: true, name: true, barcode: true, wholesaleCost: true }
        });
        const barcodeMap = new Map<string, string>();
        // Exact (case-/whitespace-insensitive) name match only — see the
        // 'product' case above for why fuzzy matching was removed.
        const nameMap = new Map<string, string>();
        for (const p of existingProducts) {
          if (p.barcode) barcodeMap.set(p.barcode, p.id);
          if (p.name) nameMap.set(p.name.toLowerCase().trim(), p.id);
        }

        // Existing invoice numbers (lower-cased) so re-importing the same file
        // SKIPS already-imported bills instead of creating duplicate rows.
        const existingInvoices = new Set<string>(
          (await prisma.sale.findMany({ where: { shopId }, select: { invoice_number: true } }))
            .map(s => (s.invoice_number || '').trim().toLowerCase()).filter(Boolean)
        );
        const seenThisRun = new Set<string>();
        let duplicateCount = 0;
        // Reuse one customer record for repeated names within this file.
        const customerCache = new Map<string, string>();

        // Strip ₹ / commas / spaces before parsing a money or quantity cell.
        const parseNum = (v: any): number => {
          if (v === undefined || v === null || String(v).trim() === '') return NaN;
          const n = parseFloat(String(v).replace(/[₹,\s]/g, ''));
          return isFinite(n) ? n : NaN;
        };

        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          try {
            const productName = getVal(row, ['productname', 'name', 'description', 'item', 'product']);
            if (!productName || String(productName).trim() === '') {
              skipped++;
              rowErrors.push(`Row ${i + 1}: missing product name — skipped`);
              continue;
            }

            // Quantity defaults to 1 (a sale of "one") when the file omits it,
            // rather than silently dropping the row.
            let quantity = parseNum(getVal(row, ['quantity', 'qty', 'nos', 'units', 'pcs']));
            if (!isFinite(quantity) || quantity <= 0) quantity = 1;

            // A sales row may carry a per-unit price, a line total, or both.
            // Reconcile them so a sale is never recorded as ₹0 when the file
            // actually holds a value (the main cause of "sales not showing").
            let price = parseNum(getVal(row, ['sellingprice', 'price', 'rate', 'unitprice', 'sellprice', 'mrp']));
            const lineTotal = parseNum(getVal(row, ['amount', 'total', 'totalamount', 'saleamount', 'netamount', 'grandtotal', 'value', 'billamount', 'lineamount', 'subtotal']));
            if (!isFinite(price) && isFinite(lineTotal)) price = lineTotal / quantity;
            if (!isFinite(price)) price = 0;

            const barcode = getVal(row, ['barcode']);
            const barcodeStr = barcode ? String(barcode) : null;
            let productId: string | null = barcodeStr ? barcodeMap.get(barcodeStr) ?? null : null;
            if (!productId) productId = nameMap.get(String(productName).toLowerCase().trim()) ?? null;
            let productCost = 0;
            if (productId) {
              const p = existingProducts.find(x => x.id === productId);
              productCost = p ? (Number(p.wholesaleCost) || 0) : 0;
            }
            if (!productId) {
              const newProduct = await prisma.product.create({
                data: {
                  shopId,
                  name: String(productName),
                  barcode: barcodeStr ?? undefined,
                  baseUnit: getVal(row, ['unit']) || 'pcs',
                  sellingPrice: price,
                  wholesaleCost: price * 0.8,
                  category: 'Imported Sales',
                  currentStock: 0
                }
              });
              productId = newProduct.id;
              nameMap.set(String(productName).toLowerCase().trim(), productId);
              productCost = price * 0.8;
            }

            // Upsert the buyer into the CRM (Customers) — match on mobile first,
            // then name; create if new. This is what puts imported buyers into
            // the Customers module so they're linked to their sales history.
            const customerName = getVal(row, ['customername', 'customer', 'partyname', 'party', 'buyer']);
            const customerMobile = getVal(row, ['mobile', 'phone', 'customermobile', 'contact', 'mobilenumber']);
            let customerId: string | null = null;
            const cleanName = customerName ? String(customerName).trim() : '';
            const cleanMobile = customerMobile ? String(customerMobile).replace(/\D/g, '').trim() : '';
            if (cleanName || cleanMobile) {
              const cacheKey = cleanMobile ? `m:${cleanMobile}` : `n:${cleanName.toLowerCase()}`;
              const cached = customerCache.get(cacheKey);
              if (cached) {
                customerId = cached;
              } else {
                let customer = null;
                if (cleanMobile) {
                  customer = await prisma.customer.findFirst({ where: { shopId, mobile: cleanMobile } });
                }
                if (!customer && cleanName) {
                  customer = await prisma.customer.findFirst({
                    where: { shopId, name: { equals: cleanName, mode: 'insensitive' } }
                  });
                }
                if (!customer) {
                  customer = await prisma.customer.create({
                    data: { shopId, name: cleanName || `Customer ${cleanMobile}`, mobile: cleanMobile || null }
                  });
                }
                customerId = customer.id;
                customerCache.set(cacheKey, customerId);
              }
            }

            // Idempotent import: a bill we've already got (or that repeats within
            // this same file) is skipped, so re-uploading never multiplies sales.
            const rawInvoice = getVal(row, ['invoicenumber', 'billnumber', 'invoice', 'billno', 'invoiceno']);
            let invoiceNumber = rawInvoice ? String(rawInvoice).trim() : '';
            if (invoiceNumber) {
              const invKey = invoiceNumber.toLowerCase();
              if (existingInvoices.has(invKey) || seenThisRun.has(invKey)) {
                duplicateCount++;
                skipped++;
                continue;
              }
              seenThisRun.add(invKey);
            } else {
              invoiceNumber = `HIST-${Date.now()}-${i}`;
            }

            // Sales history is always in the past → preferPast repairs
            // day/month-swapped dates that would otherwise land in the future.
            const rawDate = getVal(row, ['date', 'billdate', 'saledate', 'invoicedate']);
            const saleDate = parseFlexibleDate(rawDate, { preferPast: true });

            // Prefer an explicit line total from the file; else quantity × price.
            let totalAmount = isFinite(lineTotal) ? lineTotal : quantity * price;
            if (!isFinite(totalAmount)) totalAmount = 0;
            
            const marginPerUnit = Math.max(0, price - productCost);
            const totalProfit = quantity * marginPerUnit;

            const rawPaymentType = String(getVal(row, ['paymenttype', 'paymentmode', 'mode']) || 'Cash');
            const isUdhar = rawPaymentType.toLowerCase().includes('udhar') || rawPaymentType.toLowerCase().includes('credit');
            const paymentType = isUdhar ? 'Udhar' : rawPaymentType;
            const amountPaid = isUdhar ? 0 : totalAmount;

            const sale = await prisma.sale.create({
              data: {
                shopId,
                customerId,
                totalAmount,
                totalProfit,
                paymentType,
                amountPaid,
                invoice_number: invoiceNumber,
                createdAt: saleDate,
                items: {
                  create: [{
                    productId,
                    unit: getVal(row, ['unit']) || 'pcs',
                    quantity,
                    pricePerUnit: price,
                    marginPerUnit
                  }]
                }
              }
            });

            if (isUdhar && customerId) {
              await prisma.customer.update({
                where: { id: customerId },
                data: { totalDue: { increment: totalAmount } }
              });
              await prisma.customer_transactions.create({
                data: {
                  customer_id: customerId,
                  type: 'udhar',
                  amount: totalAmount,
                  note: `Imported Udhar Sale ${invoiceNumber}`,
                  bill_number: invoiceNumber
                }
              });
            }
            created++;
          } catch (rowErr: any) {
            console.error(`Import row ${i + 1} failed [sales]:`, JSON.stringify(row), rowErr.message, rowErr.meta);
            skipped++;
            rowErrors.push(`Row ${i + 1}: ${rowErr.message || 'Failed to import'}`);
          }
        }
        if (duplicateCount > 0) {
          rowErrors.push(`${duplicateCount} row(s) skipped — bill already imported (duplicate invoice number).`);
        }
        break;
      }

      case 'ledger': {
        // Opening balances for customers (and, for Udyog shops, suppliers) —
        // matched/created by name, balance recorded as a transaction so it
        // shows up in the party's ledger history, not just a silent number bump.
        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          try {
            const name = getVal(row, ['partyname', 'name', 'customername', 'suppliername', 'party']);
            const balance = parseFloat(getVal(row, ['openingbalance', 'balance', 'amount']) || 0);
            if (!name) { skipped++; rowErrors.push(`Row ${i + 1}: Skipped - Missing party name`); continue; }
            if (balance === 0) { skipped++; rowErrors.push(`Row ${i + 1}: Skipped - Opening balance is 0 (fill it in and re-import)`); continue; }

            const partyType = String(getVal(row, ['type', 'partytype']) || 'customer').toLowerCase();
            const mobile = getVal(row, ['mobile', 'phone']);

            if (partyType === 'supplier') {
              if (!isWholesaleTierPackage(auth.shop.subscriptionPlan)) {
                skipped++;
                rowErrors.push(`Row ${i + 1}: Supplier ledger entries are only available on the Udyog plan.`);
                continue;
              }
              let supplier = await prisma.supplier.findFirst({
                where: { shopId, name: { equals: String(name), mode: 'insensitive' } }
              });
              if (supplier && skipExisting(i)) { skipped++; continue; }
              if (!supplier) {
                supplier = await prisma.supplier.create({
                  data: { shopId, name: String(name), mobile: mobile ? String(mobile) : null, balance: 0 }
                });
                created++;
              } else {
                updated++;
              }
              await prisma.supplier.update({ where: { id: supplier.id }, data: { balance: { increment: balance } } });
              await prisma.supplierTransaction.create({
                data: { supplierId: supplier.id, type: 'opening_balance', amount: balance, note: 'Imported opening balance' }
              });
            } else {
              let customer = await prisma.customer.findFirst({
                where: { shopId, name: { equals: String(name), mode: 'insensitive' } }
              });
              if (customer && skipExisting(i)) { skipped++; continue; }
              if (!customer) {
                customer = await prisma.customer.create({
                  data: { shopId, name: String(name), mobile: mobile ? String(mobile) : '' }
                });
                created++;
              } else {
                updated++;
              }
              await prisma.customer.update({ where: { id: customer.id }, data: { totalDue: { increment: balance } } });
              await prisma.customer_transactions.create({
                // 'udhar' (not 'opening_balance') — LedgerView.tsx specifically
                // checks for this type to render it as a credit/due-increase
                // ("Credit Bill", orange) rather than falling through to look
                // like a payment.
                data: { customer_id: customer.id, type: 'udhar', amount: balance, note: 'Imported opening balance' }
              });
            }
          } catch (rowErr: any) {
            console.error(`Import row ${i + 1} failed [ledger]:`, JSON.stringify(row), rowErr.message, rowErr.meta);
            skipped++;
            rowErrors.push(`Row ${i + 1}: ${rowErr.message || 'Failed to import'}`);
          }
        }
        break;
      }

      default:
        // Basic fallback handling
        skipped = data.length;
        break;
    }

    const processingMs = Date.now() - startedAt;

    // Durable import log doubles as the streaming JOB record for progress &
    // resume. The wizard streams the file in batches:
    //   • first batch  → no importLogId ⇒ CREATE the job with the FULL totalRows
    //   • later batches → pass importLogId ⇒ INCREMENT the running counts
    // processed = imported+updated+skipped+failed; job is resumable while
    // processed < totalRows (no status column needed — the cursor is derivable).
    const jobTotalRows = Number(body.totalRows) > 0 ? Number(body.totalRows) : data.length;
    let importLogId: string | null = body.importLogId ? String(body.importLogId) : null;

    if (importLogId) {
      // Append this batch's errors (read-modify-write; batches run sequentially).
      const existing = await prisma.importLog.findFirst({ where: { id: importLogId, shopId }, select: { errors: true } }).catch(() => null);
      const prevErrors = Array.isArray(existing?.errors) ? (existing!.errors as any[]) : [];
      await prisma.importLog.update({
        where: { id: importLogId, shopId },
        data: {
          importedCount: { increment: created },
          updatedCount: { increment: updated },
          skippedCount: { increment: skipped },
          failedCount: { increment: rowErrors.length },
          processingMs: { increment: processingMs },
          errors: [...prevErrors, ...rowErrors].slice(0, 500),
        },
      }).catch((e) => console.error('Failed to update ImportLog:', e));
    } else {
      const importLog = await prisma.importLog.create({
        data: {
          shopId,
          importName: `${importType} import`,
          fileName,
          source: importType,
          totalRows: jobTotalRows,
          importedCount: created,
          updatedCount: updated,
          skippedCount: skipped,
          failedCount: rowErrors.length,
          errors: rowErrors.slice(0, 500),
          processingMs,
        },
      }).catch((e) => { console.error('Failed to write ImportLog:', e); return null; });
      importLogId = importLog?.id ?? null;
    }

    // Fine-grained activity trail keeps the full metric object (flexible JSON).
    await prisma.activityLog.create({
      data: {
        shopId,
        userId: auth.user.uuid,
        action: 'import_completed',
        details: {
          importType, fileName,
          totalProcessed: data.length,
          created, updated, skipped, errorCount: rowErrors.length,
          processingMs,
          rowsPerSecond: processingMs > 0 ? Math.round((data.length / processingMs) * 1000) : null,
          extraction: extractionStats, // pages / chunks / dedup from analyze
        }
      }
    }).catch((e) => console.error('Failed to log import activity:', e));

    return NextResponse.json({
      summary: {
        totalProcessed: data.length,
        created,
        updated,
        skipped,
        failed: rowErrors.length,
        rowErrors,
        processingMs,
        rowsPerSecond: processingMs > 0 ? Math.round((data.length / processingMs) * 1000) : null,
        importLogId,
        productIds: affectedProductIds.size > 0 ? Array.from(affectedProductIds) : undefined,
        supplierId: purchaseSupplierId,
        supplierTransactionId: purchaseSupplierTxnId,
      }
    });

  } catch (error: any) {
    const known = apiErrorResponse(error);
    if (known) return known;
    console.error('Import execution error:', error);
    return NextResponse.json({ error: error.message || 'Failed to execute import' }, { status: 500 });
  }
}
