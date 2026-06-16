import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const sales = await prisma.sale.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: { customer: { select: { name: true, mobile: true } } },
  });
  return json(
    sales.map((s) => ({
      id: s.id,
      // NOTE: original backend read s.invoiceNumber (undefined). Corrected to
      // the actual schema field invoice_number.
      invoice_number: s.invoice_number,
      total_amount: s.totalAmount,
      payment_type: s.paymentType,
      customer_name: s.customer?.name,
      customer_mobile: s.customer?.mobile,
      created_at: s.createdAt,
    })),
  );
});
