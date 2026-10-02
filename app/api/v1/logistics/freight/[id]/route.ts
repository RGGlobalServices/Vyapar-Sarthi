import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { setDirection, findCashRow } from '@/lib/server/billTags';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

async function load(req: Request, id: string) {
  const { shop } = await requireShop(req);
  const entry = await (prisma as any).freightEntry.findFirst({ where: { id, shopId: shop.id }, include: { transporter: { select: { name: true } } } });
  if (!entry) throw new ApiError(404, 'Freight entry not found');
  return { shop, entry };
}

/**
 * PATCH  /api/v1/logistics/freight/[id] — correct an entry: amount, vehicle, note, Purchase / Sale, and (payments) the mode.
 * DELETE /api/v1/logistics/freight/[id] — remove it. A cash payment's cash-book row goes with it.
 * A cash payment moved the drawer when it was recorded, so changing its amount (or mode) moves the cash-book row the same way.
 */
export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop, entry } = await load(req, id);
  const body = await readBody<any>(req);

  const data: any = {};
  let amount = Number(entry.amount);
  if (body.amount !== undefined) {
    amount = parseFloat(String(body.amount));
    if (!isFinite(amount) || amount <= 0) throw new ApiError(400, 'A positive amount is required');
    data.amount = amount;
  }
  if (body.vehicleNumber !== undefined) data.vehicleNumber = String(body.vehicleNumber || '').trim() || null;
  if (body.note !== undefined) data.note = String(body.note || '').trim().slice(0, 250) || null;
  const wasCash = entry.type === 'payment' && (entry.paymentMethod || 'Cash') === 'Cash';
  let method: string | null = entry.paymentMethod;
  if (entry.type === 'payment' && body.paymentMethod !== undefined) {
    method = ['Cash', 'UPI', 'Card', 'Bank', 'Cheque', 'Seller'].includes(body.paymentMethod) ? body.paymentMethod : 'Cash';
    data.paymentMethod = method;
  }
  const isCash = entry.type === 'payment' && (method || 'Cash') === 'Cash';

  await prisma.$transaction(async (tx: any) => {
    // find the existing cash-book row BEFORE changing anything
    const cashDesc = `Freight payment to ${entry.transporter?.name}`;
    const cashId = wasCash ? await findCashRow(tx, shop.id, { type: 'withdrawal', description: cashDesc, amount: Number(entry.amount), at: new Date(entry.createdAt) }) : null;
    if (Object.keys(data).length) await tx.freightEntry.update({ where: { id }, data });
    if (wasCash && isCash && cashId && body.amount !== undefined) await tx.cashBook.update({ where: { id: cashId }, data: { amount } });
    else if (wasCash && !isCash && cashId) await tx.cashBook.delete({ where: { id: cashId } });
    else if (!wasCash && isCash) await tx.cashBook.create({ data: { shopId: shop.id, type: 'withdrawal', amount, description: cashDesc } });
    if (body.direction === 'purchase' || body.direction === 'sale') await setDirection(tx, 'freight_entries', id, body.direction);
  }, { timeout: 30000, maxWait: 10000 });
  return json({ success: true });
});

export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop, entry } = await load(req, id);
  const wasCash = entry.type === 'payment' && (entry.paymentMethod || 'Cash') === 'Cash';
  await prisma.$transaction(async (tx: any) => {
    if (wasCash) {
      const cashId = await findCashRow(tx, shop.id, { type: 'withdrawal', description: `Freight payment to ${entry.transporter?.name}`, amount: Number(entry.amount), at: new Date(entry.createdAt) });
      if (cashId) await tx.cashBook.delete({ where: { id: cashId } });
    }
    await tx.freightEntry.delete({ where: { id } });
  }, { timeout: 30000, maxWait: 10000 });
  return json({ success: true });
});
