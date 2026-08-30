import prisma from '@/lib/server/prisma';
import { Prisma } from '@prisma/client';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { NextResponse } from 'next/server';
import { recordDeletion } from '@/lib/server/trash';

export const runtime = 'nodejs';

// Relative (increase/decrease-by-%) bulk price adjust, e.g. "bump MRP on
// these 12 selected products by +10%". Prisma's updateMany can only set an
// absolute value, never "column = column * 1.1" for each row, so this needs
// raw SQL. `column` is only ever taken from the fixed whitelist below (never
// interpolated from the request body), so composing it with Prisma.raw()
// carries no injection risk despite the query being raw SQL.
const ADJUSTABLE_COLUMNS: Record<string, string> = {
  mrp: 'mrp',
  sellingPrice: 'selling_price',
  wholesaleCost: 'wholesale_cost',
};

export const PATCH = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody(req);
  const { ids, field, mode, value } = body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    throw new ApiError(400, 'No product IDs provided');
  }
  const column = ADJUSTABLE_COLUMNS[field];
  if (!column) {
    throw new ApiError(400, 'Invalid field');
  }
  if (mode !== 'percent' && mode !== 'amount') {
    throw new ApiError(400, 'Invalid mode');
  }
  const v = Number(value);
  if (!Number.isFinite(v) || v === 0) {
    throw new ApiError(400, 'Enter a non-zero value');
  }

  const idList = Prisma.join(ids.map((id: string) => Prisma.sql`${id}::uuid`));
  const columnRef = Prisma.raw(`"${column}"`);
  // Floored at 0 so a large "-" percentage/amount can never push a price
  // negative — matches the same GREATEST(0, ...) guard used elsewhere
  // (e.g. RetailImport's row adjust) for the identical operation.
  const newValueExpr = mode === 'percent'
    ? Prisma.sql`GREATEST(0, ROUND((${columnRef} * (1 + ${v}::float / 100))::numeric, 2))`
    : Prisma.sql`GREATEST(0, ROUND((${columnRef} + ${v}::float)::numeric, 2))`;

  const count = await prisma.$executeRaw(Prisma.sql`
    UPDATE products SET ${columnRef} = ${newValueExpr}
    WHERE id IN (${idList}) AND shop_id = ${shop.id}::uuid AND ${columnRef} IS NOT NULL
  `);

  return json({ success: true, count });
});

export const PUT = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody(req);
  
  const { ids, data } = body;
  
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    throw new ApiError(400, 'No product IDs provided');
  }
  
  if (!data || Object.keys(data).length === 0) {
    throw new ApiError(400, 'No data provided to update');
  }

  // Ensure we only update allowed fields
  const updateData: any = {};
  if (data.category !== undefined) updateData.category = data.category;
  if (data.brand !== undefined) updateData.brand = data.brand;
  if (data.productType !== undefined) updateData.productType = data.productType;
  if (data.gstPercent !== undefined) updateData.gstPercent = data.gstPercent;

  if (Object.keys(updateData).length === 0) {
    throw new ApiError(400, 'No valid fields provided to update');
  }

  const result = await prisma.product.updateMany({
    where: {
      id: { in: ids },
      shopId: shop.id
    },
    data: updateData
  });

  return json({ success: true, count: result.count });
});

export const DELETE = handle(async (req) => {
  const { shop, user } = await requireShop(req);
  const url = new URL(req.url);
  const idsParam = url.searchParams.get('ids');

  if (!idsParam) {
    throw new ApiError(400, 'No product IDs provided');
  }

  const ids = idsParam.split(',');

  // Snapshot every product in the batch before the delete/archive attempt
  // below, whichever path it ends up taking — mirrors the single-product
  // DELETE route, which previously had this and bulk didn't, leaving
  // bulk-deleted products unrecoverable.
  const products = await prisma.product.findMany({ where: { id: { in: ids }, shopId: shop.id } });
  await Promise.all(products.map(product => recordDeletion({
    shopId: shop.id,
    entityType: 'product',
    entityId: product.id,
    label: product.name,
    data: product,
    deletedBy: user.email,
  })));

  try {
    const result = await prisma.product.deleteMany({
      where: {
        id: { in: ids },
        shopId: shop.id
      }
    });
    return json({ success: true, count: result.count });
  } catch (error: any) {
    if (error.code === 'P2003') {
      const result = await prisma.product.updateMany({
        where: {
          id: { in: ids },
          shopId: shop.id
        },
        data: { archived: true }
      });
      return json({ success: true, count: result.count, detail: 'Products archived due to existing constraints' });
    }
    console.error('[API] Bulk Delete Error:', error);
    throw error;
  }
});
