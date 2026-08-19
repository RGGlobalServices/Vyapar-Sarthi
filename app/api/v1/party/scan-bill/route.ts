import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';
import { aiVisionComplete } from '@/lib/server/ai';
import { getSimilarity } from '@/lib/fuzzy';
import { parseSizeRange } from '@/lib/sizeRange';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Kept in sync with scan-collection: 8MB base64-payload ceiling to OpenRouter,
// 0.55 similarity floor below which we don't auto-pick a product for the row.
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MATCH_THRESHOLD = 0.55;

interface ExtractedItem {
  name: string;
  colour: string | null;
  size: string | null;
  quantity: number | null;
  pricePerUnit: number | null;
  amount: number | null;
  unit: string | null;
}

/** Strip a fenced code block a vision model routinely wraps its JSON in
 *  even when told not to, then parse. Same shape as scan-collection. */
function parseJsonArray(raw: string): ExtractedItem[] {
  let text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) text = text.slice(start, end + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiError(502, 'AI could not read this photo as a bill. Try a clearer, well-lit photo.');
  }
  if (!Array.isArray(parsed)) throw new ApiError(502, 'AI response was not a list of items. Please try again.');

  const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(String(v).replace(/[,₹\s]/g, ''));
    return Number.isFinite(n) ? n : null;
  };

  const s = (v: unknown): string | null => {
    if (v === null || v === undefined || v === '') return null;
    const t = String(v).trim();
    return t.length ? t : null;
  };

  return (parsed as Record<string, unknown>[])
    .map((r) => ({
      name: String(r.name ?? r.item ?? r.product ?? '').trim(),
      colour: s(r.colour ?? r.color),
      size: s(r.size),
      quantity: num(r.quantity ?? r.qty ?? r.q),
      pricePerUnit: num(r.pricePerUnit ?? r.price ?? r.rate ?? r.unitPrice),
      amount: num(r.amount ?? r.total ?? r.lineTotal),
      unit: r.unit ? String(r.unit).trim() : null,
    }))
    .filter((r) => r.name.length > 0);
}

/** Build the exact key format the existing billing/route.ts stock-decrement
 *  code uses to match a variant row: "<colour> / <size>" if both, else just
 *  the size (or colour). Keeps this in sync with billing/route.ts line
 *  ~194 — any change there needs mirroring here. */
function variantKey(colour: string | null, size: string | null): string | null {
  const c = (colour || '').trim();
  const sz = (size || '').trim();
  if (c && sz) return `${c} / ${sz}`;
  if (sz) return sz;
  if (c) return c;
  return null;
}

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) throw new ApiError(400, 'No photo uploaded');
  if (file.size > MAX_FILE_BYTES) throw new ApiError(400, 'Photo is too large — please retake at a lower resolution.');
  if (!file.type.startsWith('image/')) throw new ApiError(400, 'Please upload an image file.');

  const buf = Buffer.from(await file.arrayBuffer());
  const dataUrl = `data:${file.type};base64,${buf.toString('base64')}`;

  const prompt = `You are reading a paper bill / invoice / receipt written or printed by an Indian shopkeeper for a wholesale customer. Extract every line item that represents a product sold on this bill.

Wholesale bills for footwear, clothing, and other variant-heavy categories commonly list separate rows for each colour × size combination of the SAME base product (e.g. "Puma Sport Shoes / Black / UK/IND 4" is one row, "Puma Sport Shoes / Black / UK/IND 5" is the next). When that structure is present the bill will usually have dedicated "Colour" and "Size" columns — read them into their own fields, not glued onto the product name.

Return ONLY a raw JSON array (no markdown, no explanation, no code fence) — one object per line:
[{"name": "<base product name>", "colour": "<colour or null>", "size": "<size or null>", "quantity": <number or null>, "unit": "<unit or null>", "pricePerUnit": <number or null>, "amount": <number or null>}]

Rules:
- Skip the header rows (Bill No, Date, Customer, GSTIN etc.), the totals row(s) at the bottom (Sub Total, Discount, GST, Grand Total, Amount in Words), CGST/SGST rows, and any freight/loading/tax line that isn't a product.
- If a cell is blank, illegible, or crossed out, use null for that field — never guess a number.
- Strip currency symbols and thousands separators from numbers (e.g. "1,250.00" -> 1250).
- The "name" field is the BASE product (brand + model/style). If the bill has separate Colour and Size columns, put those in the colour and size fields — NOT in the name. If only the name column has "Black UK/IND 4" glued together, still split colour and size out from it into their own fields.
- Preserve size strings exactly as written (e.g. "UK/IND 4", "40", "M", "XL", "8.5"). Preserve colour spelling too.
- **If the bill writes a size RANGE like "6*8", "6-8", "6 to 8", or "S-XL" as a shorthand for multiple sizes on ONE row, keep that range VERBATIM in the size field — do NOT expand it into separate rows and do NOT multiply the quantity.** The caller expands ranges downstream using its own rules. Same applies to "40*44" (40, 41, 42, 43, 44) and "M-XL" etc.
- If the bill shows only qty and total but not per-unit rate, still include the row with pricePerUnit as null — the caller back-computes from amount / quantity.`;

  const raw = await aiVisionComplete(dataUrl, prompt, { maxTokens: 3000 });
  const rawItems = parseJsonArray(raw);

  // Indian shopkeepers routinely write a range on one line — "size 6*8, qty
  // 3" meaning "3 pairs each of sizes 6, 7 and 8". Expand any such row into
  // one row per individual size, all sharing the row's other fields. Each
  // per-size row carries the SAME quantity as the parent row — a shopkeeper
  // writing "6*8 qty 3" almost always means 3 pairs at EVERY size in the
  // range (that's the whole shorthand's point: matched sets of sizes).
  // Non-range sizes and rows with no size at all pass through unchanged.
  // See lib/sizeRange.ts for the accepted formats.
  const items: typeof rawItems = [];
  for (const row of rawItems) {
    const sizes = parseSizeRange(row.size);
    if (sizes.length <= 1) {
      items.push(row);
      continue;
    }
    // amount was a per-line-item figure written for the range as a whole —
    // when we split into N rows each with the SAME qty, the per-line amount
    // for each split is (qty * unitRate), same as before. So we can leave
    // amount alone; it becomes the amount PER expanded row, matching the
    // shopkeeper's expectation of "3 pairs @ ₹X per size = ₹3X per size".
    for (const s of sizes) items.push({ ...row, size: s });
  }

  const products = await prisma.product.findMany({
    where: { shopId: shop.id, archived: false },
    select: {
      id: true, name: true, sellingPrice: true, wholesaleCost: true, mrp: true,
      gstPercent: true, hsnCode: true, baseUnit: true, currentStock: true,
      size_variants: true, variants: true,
    },
  });

  /** Enumerate variant options for a product — the union of what's in the
   *  Udyog `variants[]` rows (real per-variant stock) and any legacy
   *  `size_variants` JSON, deduped by their variantKey. Used both to expose
   *  the picker's chip options and to try auto-match a scanned colour+size. */
  function productVariantOptions(p: typeof products[number]): Array<{ key: string; colour: string | null; size: string | null; stock: number | null; price?: number | null }> {
    const out: Array<{ key: string; colour: string | null; size: string | null; stock: number | null; price?: number | null }> = [];
    const seen = new Set<string>();
    const push = (colour: string | null, size: string | null, stock: number | null, price: number | null) => {
      const key = variantKey(colour, size);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push({ key, colour, size, stock, price });
    };
    // Udyog variants[] — authoritative per-variant stock and per-variant price
    if (Array.isArray(p.variants)) {
      for (const v of p.variants as Array<Record<string, unknown>>) {
        const colour = v.color ? String(v.color) : null;
        const size = v.size ? String(v.size) : null;
        const stock = v.stock !== undefined && v.stock !== null ? Number(v.stock) : (v.quantity !== undefined && v.quantity !== null ? Number(v.quantity) : null);
        const price = v.sellingPrice !== undefined && v.sellingPrice !== null ? Number(v.sellingPrice) : (v.wholesalePrice !== undefined && v.wholesalePrice !== null ? Number(v.wholesalePrice) : null);
        push(colour, size, stock, price);
      }
    }
    // Legacy size_variants map — `{ size: qty }` with no colour
    if (p.size_variants) {
      try {
        const sv = typeof p.size_variants === 'string' ? JSON.parse(p.size_variants) : p.size_variants;
        if (sv && typeof sv === 'object') {
          for (const [size, qty] of Object.entries(sv)) push(null, size, Number(qty) || 0, null);
        }
      } catch { /* ignore malformed */ }
    }
    return out;
  }

  // Compact projection so the frontend picker doesn't have to refetch — same
  // convention as scan-collection returns its `parties` list alongside rows.
  // `variants` here is the full option list (chips for the picker); the modal
  // uses it both to pick a variant manually and to seed the review UI when
  // the scan already resolved one.
  const productPicker = products.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.sellingPrice ?? p.mrp ?? 0,
    unit: p.baseUnit ?? null,
    currentStock: p.currentStock,
    gstPercent: p.gstPercent ?? 0,
    variants: productVariantOptions(p),
  }));

  const matched = items.map((row) => {
    // A common failure mode with a scanned bill is qty=1 and amount=<total>
    // but no per-unit rate — back-compute rather than dropping it.
    const backComputedRate =
      row.pricePerUnit ?? (row.amount && row.quantity && row.quantity > 0 ? row.amount / row.quantity : null);

    let best: { p: typeof products[number]; score: number } | null = null;
    for (const p of products) {
      const score = getSimilarity(row.name, p.name || '');
      if (!best || score > best.score) best = { p, score };
    }

    // Once the product is decided, try to match colour+size to a specific
    // variant. First try an exact key match (colour + " / " + size), then
    // relaxed size-only, then colour-only — so partial info from the AI (or
    // a bill that only listed size) still lands correctly.
    let matchedVariantKey: string | null = null;
    let matchedVariantStock: number | null = null;
    let matchedVariantPrice: number | null = null;
    const scannedKey = variantKey(row.colour, row.size);
    if (best && best.score >= MATCH_THRESHOLD) {
      const options = productVariantOptions(best.p);
      const norm = (s: string) => s.trim().toLowerCase();
      let hit = scannedKey ? options.find((o) => norm(o.key) === norm(scannedKey)) : null;
      if (!hit && row.size) hit = options.find((o) => o.size && norm(o.size) === norm(row.size!));
      if (!hit && row.colour) hit = options.find((o) => o.colour && norm(o.colour) === norm(row.colour!));
      if (hit) {
        matchedVariantKey = hit.key;
        matchedVariantStock = hit.stock;
        matchedVariantPrice = hit.price ?? null;
      }
    }

    const passed = best && best.score >= MATCH_THRESHOLD;
    return {
      name: row.name,
      colour: row.colour,
      size: row.size,
      scannedVariantKey: scannedKey,
      quantity: row.quantity,
      pricePerUnit: matchedVariantPrice ?? backComputedRate,
      amount: row.amount,
      unit: row.unit,
      matchedProductId: passed ? best!.p.id : null,
      matchedProductName: passed ? (best!.p.name || '') : null,
      matchedProductPrice: passed ? (best!.p.sellingPrice ?? best!.p.mrp ?? 0) : null,
      matchedProductUnit: passed ? (best!.p.baseUnit ?? null) : null,
      matchedProductStock: passed ? best!.p.currentStock : null,
      matchedProductGstPercent: passed ? (best!.p.gstPercent ?? 0) : null,
      matchedVariantKey,
      matchedVariantStock,
      matchScore: best?.score ?? 0,
    };
  });

  return json({ items: matched, products: productPicker });
});
