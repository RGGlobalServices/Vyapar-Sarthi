import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ identifier: string }> };

export const GET = handle<Ctx>(async (req, { params }) => {
  const { identifier } = await params;
  const { shop } = await requireShop(req);
  const shopId = shop.id;

  const cleanId = identifier.replace(/^INV[-_]?/i, '').replace(/[^a-zA-Z0-9]/g, '');
  const invVariants = [`INV-${cleanId}`, `INV_${cleanId}`, `INV${cleanId}`, cleanId];

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
  const isHexSegment = /^[0-9a-f]{8,}$/i.test(cleanId);

  let sale = await prisma.sale.findFirst({
    where: {
      OR: [
        ...(isUUID ? [{ id: identifier }] : []),
        ...invVariants.map((inv) => ({ invoice_number: inv })),
      ],
      shopId,
    },
    include: {
      items: { include: { product: { select: { name: true } } } },
      customer: { select: { name: true } },
    },
  });

  if (!sale && isHexSegment) {
    const raw = (await prisma.$queryRawUnsafe(
      'SELECT id FROM sales WHERE id::text LIKE $1 AND shop_id = $2::uuid LIMIT 1',
      `${cleanId.toLowerCase()}%`,
      shopId,
    )) as Array<{ id: string }>;
    if (raw.length) {
      sale = await prisma.sale.findFirst({
        where: { id: raw[0].id },
        include: {
          items: { include: { product: { select: { name: true } } } },
          customer: { select: { name: true } },
        },
      });
    }
  }

  if (!sale) throw new ApiError(404, 'Invoice not found');

  return json({
    id: sale.id,
    invoice_number: sale.invoice_number,
    total_amount: sale.totalAmount,
    payment_type: sale.paymentType,
    customer_name: sale.customer?.name || null,
    created_at: sale.createdAt,
    items: sale.items.map((item) => ({
      id: item.id,
      product_id: item.productId,
      name: item.product?.name || 'Unknown',
      price_per_unit: item.pricePerUnit,
      quantity: item.quantity,
      total: (item.pricePerUnit || 0) * (item.quantity || 0),
    })),
  });
});
