import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const url = new URL(req.url);
  const productId = url.searchParams.get('productId');
  const active = url.searchParams.get('active');

  const where: any = { shopId: shop.id };
  
  if (productId) {
    where.productId = productId;
  }
  
  if (active !== null) {
    where.isActive = active === 'true';
  }

  const workflows = await prisma.workflow.findMany({
    where,
    include: {
      product: {
        select: { id: true, name: true }
      },
      versions: {
        orderBy: { versionNumber: 'desc' },
        take: 1
      }
    },
    orderBy: { createdAt: 'desc' },
  });

  return json(workflows);
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody(req);
  const { code, name, description, productId, isActive } = body;

  if (!code || !name || !productId) {
    return json({ error: 'Code, name, and productId are required.' }, 400);
  }

  // Validate product belongs to shop
  const product = await prisma.product.findFirst({
    where: { id: productId, shopId: shop.id }
  });

  if (!product) {
    return json({ error: 'Product not found.' }, 404);
  }

  try {
    const newWorkflow = await prisma.workflow.create({
      data: {
        shopId: shop.id,
        productId,
        code,
        name,
        description: description || null,
        isActive: isActive !== undefined ? isActive : true,
      },
    });

    return json(newWorkflow, 201);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return json({ error: 'A workflow with this code already exists.' }, 409);
    }
    throw error;
  }
});
