import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/v1/products/unsynced — Fetch all manually added (unsynced) sale items for active shop
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);

  // Find all sale items with no associated productId
  const manualItems = await prisma.saleItem.findMany({
    where: {
      sale: { shopId: shop.id },
      productId: null,
    },
    include: {
      sale: {
        select: {
          invoice_number: true,
          createdAt: true,
        },
      },
    },
    orderBy: { sale: { createdAt: 'desc' } },
  });

  // Group by variant / name key
  const groupedMap = new Map<string, {
    key: string;
    variant: string | null;
    unit: string | null;
    sellingPrice: number;
    costPrice: number;
    totalQtySold: number;
    lastSoldDate: Date | null;
    sampleInvoice: string | null;
    itemCount: number;
  }>();

  for (const item of manualItems) {
    const key = `${(item.variant || 'Uncategorized Item').trim().toLowerCase()}_${item.unit || 'unit'}`;
    const sp = item.pricePerUnit || 0;
    const margin = item.marginPerUnit || 0;
    const cp = Math.max(0, sp - margin);
    const qty = item.quantity || 0;
    const date = item.sale?.createdAt || null;

    if (!groupedMap.has(key)) {
      groupedMap.set(key, {
        key,
        variant: item.variant || 'Uncategorized Item',
        unit: item.unit || 'Piece',
        sellingPrice: sp,
        costPrice: cp,
        totalQtySold: qty,
        lastSoldDate: date,
        sampleInvoice: item.sale?.invoice_number || null,
        itemCount: 1,
      });
    } else {
      const existing = groupedMap.get(key)!;
      existing.totalQtySold += qty;
      existing.itemCount += 1;
      if (date && (!existing.lastSoldDate || date > existing.lastSoldDate)) {
        existing.lastSoldDate = date;
      }
    }
  }

  const itemsList = Array.from(groupedMap.values());
  return json({ ok: true, count: itemsList.length, data: itemsList });
});

// POST /api/v1/products/unsynced — Sync a manual item to Master Product & Stock
export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody<{
    name: string;
    variantKey?: string;
    category?: string;
    subCategory?: string;
    costPrice?: number;
    mrp?: number;
    sellingPrice: number;
    baseUnit?: string;
    initialStock?: number;
    barcode?: string;
    sku?: string;
  }>(req);

  if (!body.name?.trim()) {
    throw new ApiError(400, 'Product name is required to sync to catalog.');
  }

  const costPrice = Math.max(0, Number(body.costPrice) || 0);
  const sellingPrice = Math.max(0, Number(body.sellingPrice) || 0);
  const mrp = Math.max(sellingPrice, Number(body.mrp) || sellingPrice);
  const initialStock = Math.max(0, Number(body.initialStock) || 0);

  // 1. Create new Product in Master catalog
  const newProduct = await prisma.product.create({
    data: {
      shopId: shop.id,
      name: body.name.trim(),
      category: body.category?.trim() || 'General',
      wholesaleCost: costPrice,
      sellingPrice: sellingPrice,
      mrp: mrp,
      baseUnit: body.baseUnit || 'Piece',
      currentStock: initialStock,
      barcode: body.barcode?.trim() || null,
    },
  });

  // 2. Link all past matching manual SaleItems to this new Product ID.
  if (body.variantKey) {
    await prisma.saleItem.updateMany({
      where: {
        sale: { shopId: shop.id },
        productId: null,
        OR: variantMatchConditions(body.variantKey),
      },
      data: {
        productId: newProduct.id,
      },
    });
  }

  return json({ ok: true, product: newProduct });
});

// Shared: resolve a grouped key (`${variant}_${unit}`, see GET above) back to
// the SaleItem match conditions. Split on the LAST underscore so a variant
// name that itself contains one isn't truncated. The grouped key falls back
// to "uncategorized item" for a SaleItem whose `variant` is actually NULL
// (see `item.variant || 'Uncategorized Item'` in GET) — an `equals` match
// alone can never hit a NULL column, which is why syncing/deleting that
// bucket used to leave it stuck in the unsynced list forever. Match NULL
// explicitly in that case.
function variantMatchConditions(variantKey: string) {
  const lastUnderscore = variantKey.lastIndexOf('_');
  const searchVariant = lastUnderscore >= 0 ? variantKey.slice(0, lastUnderscore) : variantKey;
  const conditions: any[] = [{ variant: { equals: searchVariant, mode: 'insensitive' } }];
  if (searchVariant === 'uncategorized item') {
    conditions.push({ variant: null });
  }
  return conditions;
}

// DELETE /api/v1/products/unsynced — Discard an unsynced quick-item bucket:
// removes those manual SaleItem lines entirely (they were never linked to a
// real product) so it stops nagging to be synced.
export const DELETE = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody<{ variantKey?: string }>(req);
  if (!body.variantKey) {
    throw new ApiError(400, 'variantKey is required.');
  }

  const result = await prisma.saleItem.deleteMany({
    where: {
      sale: { shopId: shop.id },
      productId: null,
      OR: variantMatchConditions(body.variantKey),
    },
  });

  return json({ ok: true, deleted: result.count });
});
