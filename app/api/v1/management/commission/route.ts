import prisma from '@/lib/server/prisma';
import { withBillTags, tagRows } from '@/lib/server/billTags';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, query, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Commission ledger — a running account per Broker (Customer row with
 * customerType='broker'), mirrors /api/v1/logistics/freight exactly: 'charge'
 * rows add to what the mill owes the broker for a deal they closed, 'payment'
 * rows reduce it.
 *
 * GET  /api/v1/management/commission — every broker with balance + recent entries
 * POST /api/v1/management/commission — record a charge or payment
 */
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const q = query(req);

  const brokers = await prisma.customer.findMany({
    where: { shopId: shop.id, customerType: 'broker', ...(q.brokerId ? { id: q.brokerId } : {}) },
    select: { id: true, name: true, mobile: true },
  });
  if (brokers.length === 0) return json({ brokers: [], entries: [] });

  const brokerIds = brokers.map((b) => b.id);
  const entries = await (prisma as any).commissionEntry.findMany({
    where: { brokerId: { in: brokerIds } },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });

  const byBroker = new Map(brokers.map((b) => [b.id, { ...b, balance: 0, entryCount: 0 }]));
  for (const e of entries) {
    const bucket = byBroker.get(e.brokerId);
    if (!bucket) continue;
    bucket.balance += e.type === 'charge' ? Number(e.amount) : -Number(e.amount);
    bucket.entryCount += 1;
  }

  return json({
    brokers: Array.from(byBroker.values()),
    entries: (await withBillTags(shop.id, 'commission_entries', entries.map((e: any) => ({
      id: e.id, brokerId: e.brokerId, type: e.type, amount: Number(e.amount) || 0,
      billNumber: e.billNumber, paymentMethod: e.paymentMethod, note: e.note, date: e.createdAt,
    })))),
  });
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody<any>(req);

  const brokerId = body.brokerId;
  if (!brokerId) throw new ApiError(400, 'brokerId is required');
  const broker = await prisma.customer.findFirst({ where: { id: brokerId, shopId: shop.id, customerType: 'broker' } });
  if (!broker) throw new ApiError(404, 'Broker not found for this shop');

  const type = body.type === 'payment' ? 'payment' : 'charge';
  const amount = Math.max(0, parseFloat(String(body.amount ?? '')) || 0);
  const discount = type === 'payment' ? Math.max(0, parseFloat(String(body.discount ?? '')) || 0) : 0;
  if (type === 'charge' && amount <= 0) throw new ApiError(400, 'A positive amount is required');
  if (type === 'payment' && amount <= 0 && discount <= 0) throw new ApiError(400, 'Enter payment amount or discount');

  const paymentMethod = type === 'payment' ? (['Cash', 'UPI', 'Card'].includes(body.paymentMethod) ? body.paymentMethod : 'Cash') : null;
  const noteText = (body.note || '').trim() || null;

  const ops: any[] = [];
  if (amount > 0) {
    ops.push((prisma as any).commissionEntry.create({
      data: { shopId: shop.id, brokerId, type, amount, billNumber: (body.billNumber || '').trim() || null, paymentMethod, note: noteText },
    }));
  }
  if (discount > 0) {
    ops.push((prisma as any).commissionEntry.create({
      data: { shopId: shop.id, brokerId, type: 'payment', amount: discount, paymentMethod: null, note: `Discount / Write-off${noteText ? ` · ${noteText}` : ''}` },
    }));
  }

  if (type === 'payment' && amount > 0 && paymentMethod === 'Cash') {
    ops.push(
      prisma.cashBook.create({
        data: { shopId: shop.id, type: 'withdrawal', amount, description: `Commission payment to ${broker.name}` },
      }),
    );
  }

  const [created] = await prisma.$transaction(ops);
  if (body.direction === 'purchase' || body.direction === 'sale') {
    await tagRows(prisma as any, 'commission_entries', [(created as any).id], { direction: body.direction, purchaseInvoiceId: body.purchaseInvoiceId, challanId: body.challanId });
  }
  return json(created, 201);
});
