import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { NextResponse } from 'next/server';
import { recordDeletion } from '@/lib/server/trash';

export const runtime = 'nodejs';

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
