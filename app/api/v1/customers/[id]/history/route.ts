import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);

  const customer = await prisma.customer.findFirst({
    where: { id, shopId: shop.id },
  });

  if (!customer) throw new ApiError(404, 'Customer not found');

  const sales = await prisma.sale.findMany({
    where: { customerId: id, shopId: shop.id },
    orderBy: { createdAt: 'desc' },
    include: {
      items: {
        include: {
          product: {
            select: { name: true, category: true }
          }
        }
      }
    }
  });

  const history = sales.map(sale => ({
    id: sale.id,
    invoice_number: sale.invoice_number,
    total_amount: sale.totalAmount,
    total_profit: sale.totalProfit,
    payment_type: sale.paymentType,
    created_at: sale.createdAt,
    is_manual: sale.isManual,
    bill_image_url: sale.billImageUrl,
    items: sale.items.map(item => ({
      id: item.id,
      product_name: item.product?.name || (sale.isManual ? 'Manual Bill' : 'Unknown Product'),
      category: item.product?.category || 'Uncategorized',
      variant: item.variant,
      quantity: item.quantity,
      price_per_unit: item.pricePerUnit,
      total: (item.quantity || 0) * (item.pricePerUnit || 0)
    }))
  }));

  return json(history);
});
