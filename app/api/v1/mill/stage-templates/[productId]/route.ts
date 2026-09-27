import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ productId: string }> };

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Stages are stored in Product.metadata.processingStages - a JSON array of trimmed stage
 * name strings. No new table or migration required; the metadata column already exists on
 * every product row and is already read/written by the product edit endpoint.
 *
 * GET  /api/v1/mill/stage-templates/[productId]  - fetch stages for a product (empty array if none)
 * PUT  /api/v1/mill/stage-templates/[productId]  - save stages for a product
 */

export const GET = handle<Ctx>(async (req, { params }) => {
  const { productId } = await params;
  if (!uuidRegex.test(productId)) throw new ApiError(404, 'Product not found');

  const { shop } = await requireShop(req);
  const product = await prisma.product.findFirst({
    where: { id: productId, shopId: shop.id },
    select: { id: true, name: true, millCategory: true, metadata: true },
  });
  if (!product) throw new ApiError(404, 'Product not found');

  const meta = (product.metadata as Record<string, any>) ?? {};
  const stages: string[] = Array.isArray(meta.processingStages)
    ? (meta.processingStages as any[]).filter((s) => typeof s === 'string' && s.trim()).map((s) => String(s).trim())
    : [];

  return json({
    productId: product.id,
    productName: product.name,
    millCategory: product.millCategory,
    stages,
  });
});

export const PUT = handle<Ctx>(async (req, { params }) => {
  const { productId } = await params;
  if (!uuidRegex.test(productId)) throw new ApiError(404, 'Product not found');

  const { shop } = await requireShop(req);
  const body = await readBody<{ stages: any }>(req);

  if (!Array.isArray(body.stages)) {
    throw new ApiError(400, 'stages must be an array of stage names', 'INVALID_STAGES');
  }

  const seen = new Set<string>();
  const stages: string[] = [];
  for (const s of body.stages) {
    const name = String(s ?? '').trim().slice(0, 60);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    stages.push(name);
  }
  if (stages.length > 20) {
    throw new ApiError(400, 'A product can have at most 20 processing stages', 'TOO_MANY_STAGES');
  }

  const product = await prisma.product.findFirst({
    where: { id: productId, shopId: shop.id },
    select: { id: true, name: true, metadata: true },
  });
  if (!product) throw new ApiError(404, 'Product not found');

  const existingMeta = (product.metadata as Record<string, any>) ?? {};
  const newMeta = { ...existingMeta, processingStages: stages };

  await prisma.product.update({
    where: { id: productId },
    data: { metadata: newMeta },
  });

  return json({ productId, stages });
});