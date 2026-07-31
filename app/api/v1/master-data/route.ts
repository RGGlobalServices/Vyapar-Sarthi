import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);

  const [categories, brands, units] = await Promise.all([
    prisma.category.findMany({
      where: { shopId: shop.id },
      include: { children: true },
      orderBy: { name: 'asc' },
    }),
    prisma.brand.findMany({
      where: { shopId: shop.id },
      orderBy: { name: 'asc' },
    }),
    prisma.unit.findMany({
      where: { shopId: shop.id },
      include: { baseUnit: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return json({ categories, brands, units });
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody(req);
  const { type, name, parentId, manufacturer, shortName, baseUnitId, conversionFactor } = body;

  if (!type || !name) {
    return json({ error: 'Type and name are required.' }, 400);
  }

  let result;

  switch (type) {
    case 'category':
      result = await prisma.category.create({
        data: {
          shopId: shop.id,
          name,
          parentId: parentId || null,
        },
      });
      break;

    case 'brand':
      result = await prisma.brand.create({
        data: {
          shopId: shop.id,
          name,
          manufacturer: manufacturer || false,
        },
      });
      break;

    case 'unit':
      if (!shortName) return json({ error: 'Short name is required for units.' }, 400);
      result = await prisma.unit.create({
        data: {
          shopId: shop.id,
          name,
          shortName,
          baseUnitId: baseUnitId || null,
          conversionFactor: conversionFactor ? Number(conversionFactor) : 1,
        },
      });
      break;

    default:
      return json({ error: 'Invalid master data type.' }, 400);
  }

  return json(result, 201);
});

// PATCH — rename a brand or toggle its manufacturer flag. Same shape as the
// other master-data mutations (POST/DELETE) so the client can keep using the
// single `/master-data` endpoint. Only brand/category/unit updates are
// supported here; anything else returns 400.
export const PATCH = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody(req);
  const { type, id, name, manufacturer, shortName, baseUnitId, conversionFactor } = body;

  if (!type || !id) return json({ error: 'Type and ID are required.' }, 400);

  let result;
  switch (type) {
    case 'brand': {
      const patch: any = {};
      if (name !== undefined) patch.name = name;
      if (manufacturer !== undefined) patch.manufacturer = !!manufacturer;
      result = await prisma.brand.update({ where: { id, shopId: shop.id }, data: patch });
      break;
    }
    case 'category': {
      const patch: any = {};
      if (name !== undefined) patch.name = name;
      result = await prisma.category.update({ where: { id, shopId: shop.id }, data: patch });
      break;
    }
    case 'unit': {
      const patch: any = {};
      if (name !== undefined) patch.name = name;
      if (shortName !== undefined) patch.shortName = shortName;
      if (baseUnitId !== undefined) patch.baseUnitId = baseUnitId || null;
      if (conversionFactor !== undefined) patch.conversionFactor = Number(conversionFactor) || 1;
      result = await prisma.unit.update({ where: { id, shopId: shop.id }, data: patch });
      break;
    }
    default:
      return json({ error: 'Invalid master data type.' }, 400);
  }
  return json(result);
});

export const DELETE = handle(async (req) => {
  const { shop } = await requireShop(req);
  const url = new URL(req.url);
  const type = url.searchParams.get('type');
  const id = url.searchParams.get('id');

  if (!type || !id) {
    return json({ error: 'Type and ID are required.' }, 400);
  }

  try {
    switch (type) {
      case 'category':
        await prisma.category.delete({ where: { id, shopId: shop.id } });
        break;
      case 'brand':
        await prisma.brand.delete({ where: { id, shopId: shop.id } });
        break;
      case 'unit':
        await prisma.unit.delete({ where: { id, shopId: shop.id } });
        break;
      default:
        return json({ error: 'Invalid master data type.' }, 400);
    }
    return json({ success: true });
  } catch (error: any) {
    return json({ error: 'Item cannot be deleted as it is in use.' }, 400);
  }
});
