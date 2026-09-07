import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, query, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Freight ledger — a running account per Transporter (Customer row with
 * customerType='transporter'): 'charge' rows add to what the mill owes them,
 * 'payment' rows reduce it. Unlike a Party's udhar, the direction here is the
 * mill owing the transporter, so this is a plain running balance rather than
 * reusing customer_transactions/totalDue (which point the other way).
 *
 * GET  /api/v1/logistics/freight — every transporter with their balance +
 *      recent entries; ?transporterId= narrows to one.
 * POST /api/v1/logistics/freight — record a charge or payment
 */
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const q = query(req);

  const transporters = await prisma.customer.findMany({
    where: { shopId: shop.id, customerType: 'transporter', ...(q.transporterId ? { id: q.transporterId } : {}) },
    select: { id: true, name: true, mobile: true },
  });
  if (transporters.length === 0) return json({ transporters: [], entries: [] });

  const transporterIds = transporters.map((t) => t.id);
  const entries = await (prisma as any).freightEntry.findMany({
    where: { transporterId: { in: transporterIds } },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });

  const byTransporter = new Map(transporters.map((t) => [t.id, { ...t, balance: 0, entryCount: 0 }]));
  for (const e of entries) {
    const bucket = byTransporter.get(e.transporterId);
    if (!bucket) continue;
    bucket.balance += e.type === 'charge' ? Number(e.amount) : -Number(e.amount);
    bucket.entryCount += 1;
  }

  return json({
    transporters: Array.from(byTransporter.values()),
    entries: entries.map((e: any) => ({
      id: e.id, transporterId: e.transporterId, type: e.type, amount: Number(e.amount) || 0,
      vehicleNumber: e.vehicleNumber, paymentMethod: e.paymentMethod, note: e.note, date: e.createdAt,
    })),
  });
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody<any>(req);

  const transporterId = body.transporterId;
  if (!transporterId) throw new ApiError(400, 'transporterId is required');
  const transporter = await prisma.customer.findFirst({ where: { id: transporterId, shopId: shop.id, customerType: 'transporter' } });
  if (!transporter) throw new ApiError(404, 'Transporter not found for this shop');

  const type = body.type === 'payment' ? 'payment' : 'charge';
  const amount = parseFloat(String(body.amount ?? ''));
  if (!isFinite(amount) || amount <= 0) throw new ApiError(400, 'A positive amount is required');

  const ops: any[] = [
    (prisma as any).freightEntry.create({
      data: {
        shopId: shop.id,
        transporterId,
        type,
        amount,
        vehicleNumber: (body.vehicleNumber || '').trim() || null,
        gateEntryId: body.gateEntryId || null,
        paymentMethod: type === 'payment' ? (['Cash', 'UPI', 'Card'].includes(body.paymentMethod) ? body.paymentMethod : 'Cash') : null,
        note: (body.note || '').trim() || null,
      },
    }),
  ];

  // A cash payment moves the physical drawer — same convention as every
  // other outgoing-payment path in this app (Supplier/Party payments).
  if (type === 'payment' && (body.paymentMethod || 'Cash') === 'Cash') {
    ops.push(
      prisma.cashBook.create({
        data: {
          shopId: shop.id,
          type: 'withdrawal',
          amount,
          description: `Freight payment to ${transporter.name}`,
        },
      }),
    );
  }

  const [created] = await prisma.$transaction(ops);
  return json(created, 201);
});
