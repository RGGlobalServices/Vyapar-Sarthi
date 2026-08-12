import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';
import { recordDeletion } from '@/lib/server/trash';
import { getReturnedQuantitiesForSale, reverseSaleEffects, cleanupSaleBatches } from '@/lib/server/sales';

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
      items: { include: { product: { select: { name: true, hsnCode: true, gstPercent: true } } } },
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
          items: { include: { product: { select: { name: true, hsnCode: true, gstPercent: true } } } },
          customer: { select: { name: true } },
        },
      });
    }
  }

  if (!sale) throw new ApiError(404, 'Invoice not found');

  const returnedQuantities = await getReturnedQuantitiesForSale(prisma, shopId, sale.id);

  return json({
    id: sale.id,
    invoice_number: sale.invoice_number,
    total_amount: sale.totalAmount,
    payment_type: sale.paymentType,
    amount_paid: sale.amountPaid,
    payment_details: sale.paymentDetails,
    bill_type: sale.billType,
    gst_amount: sale.gstAmount,
    gst_details: sale.gstDetails,
    is_manual: sale.isManual,
    bill_image_url: sale.billImageUrl,
    customer_name: sale.customer?.name || null,
    created_at: sale.createdAt,
    items: sale.items.map((item) => {
      const returnedQty = returnedQuantities[item.id] || returnedQuantities[item.productId || ''] || returnedQuantities[item.product?.name || ''] || 0;
      return {
        id: item.id,
        product_id: item.productId,
        name: item.product?.name || item.itemName || item.variant || (sale!.isManual ? 'Manual Bill' : 'Unknown'),
        price_per_unit: item.pricePerUnit,
        quantity: item.quantity,
        returned_quantity: returnedQty,
        total: (item.pricePerUnit || 0) * (item.quantity || 0),
        hsnCode: item.product?.hsnCode || '',
        gstPercent: item.product?.gstPercent || 0,
      };
    }),
  });
});

export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { identifier } = await params;
  const { shop, user } = await requireShop(req);

  const sale = await prisma.sale.findFirst({
    where: { id: identifier, shopId: shop.id },
    include: { items: true },
  });
  if (!sale) throw new ApiError(404, 'Invoice not found');

  // Snapshot before reversal — recoverable from the recycle bin even though
  // the reversal below already restores stock/ledger, matching every other
  // delete route's snapshot-before-destroy ordering.
  await recordDeletion({
    shopId: shop.id,
    entityType: 'sale',
    entityId: sale.id,
    label: sale.invoice_number,
    data: sale,
    deletedBy: user.email,
  });

  const { netQuantitiesByProduct } = await prisma.$transaction(
    (tx) => reverseSaleEffects(tx, shop.id, sale.id),
    { timeout: 15000, maxWait: 10000 }
  );

  try {
    await cleanupSaleBatches(prisma, shop.id, sale.id, shop.packageType, netQuantitiesByProduct);
  } catch (e) {
    console.error('Sale batch/movement cleanup failed:', e);
  }

  return json({ detail: 'Bill deleted' });
});
