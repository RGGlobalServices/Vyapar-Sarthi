import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// POST /customers/:id/transactions — add udhar or payment
export const POST = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  const customer = await prisma.customer.findFirst({ where: { id, shopId: shop.id } });
  if (!customer) throw new ApiError(404, 'Customer not found');

  const { type, amount, note, billNumber, date } = await readBody(req);
  if (!type || !amount || amount <= 0) throw new ApiError(400, 'type and positive amount required');
  if (!['udhar', 'payment'].includes(type)) throw new ApiError(400, 'type must be udhar or payment');

  const tx = await prisma.customer_transactions.create({
    data: {
      customer_id: id,
      type,
      amount: parseFloat(amount),
      note: note || '',
      bill_number: billNumber || '',
      created_at: date ? new Date(date) : new Date(),
    },
  });

  // Recalculate totalDue
  const allTx = await prisma.customer_transactions.findMany({ where: { customer_id: id } });
  const totalDue = allTx.reduce(
    (sum, t) => (t.type === 'udhar' ? sum + (t.amount || 0) : sum - (t.amount || 0)),
    0,
  );
  await prisma.customer.update({ where: { id }, data: { totalDue } });

  return json({
    id: tx.id,
    type: tx.type,
    amount: tx.amount,
    note: tx.note,
    billNumber: tx.bill_number,
    date: tx.created_at?.toISOString(),
  });
});
