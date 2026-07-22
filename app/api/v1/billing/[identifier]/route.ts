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

  const priorReturns = await prisma.materialReturn.findMany({
    where: {
      shopId,
      note: {
        contains: sale.id
      }
    }
  });

  const returnedQuantities: Record<string, number> = {};
  for (const r of priorReturns) {
    let noteData: any = {};
    try {
      if (r.note) noteData = JSON.parse(r.note);
    } catch (e) {}
    
    // Match by saleItemId first, then productId, then itemName
    const key = noteData?.saleItemId || r.productId || r.itemName;
    if (key) {
      returnedQuantities[key] = (returnedQuantities[key] || 0) + r.quantity;
    }
  }

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
        name: item.product?.name || (sale!.isManual ? 'Manual Bill' : 'Unknown'),
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
