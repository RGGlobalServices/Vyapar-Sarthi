import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { assertOwned } from '@/lib/server/ownership';
import { isMillBillingPackage } from '@/lib/config/packageConfig';
import { setDirection } from '@/lib/server/billTags';
import { invalidateDashboardCacheForShop } from '@/lib/server/dashboardCache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const HAMALI = 'Hamali / Labour';

async function load(req: Request, id: string) {
  const { shop } = await requireShop(req);
  // Bada Udyog only, and only the hamali rows: this is the Hamali page's edit / delete, not a general expense editor
  if (!isMillBillingPackage((shop as any).packageType)) throw new ApiError(403, 'Editing hamali is a Bada Udyog feature.', 'NOT_MILL_SHOP');
  const expense = await (prisma as any).expense.findFirst({ where: { id, shopId: shop.id } });
  if (!expense) throw new ApiError(404, 'Expense not found');
  if (expense.category !== HAMALI) throw new ApiError(400, 'Only hamali entries can be changed here.', 'NOT_HAMALI');
  return { shop, expense };
}

/**
 * PATCH  /api/v1/expenses/[id] — correct a hamali entry: amount, description, payment mode, labour contractor, date, Purchase / Sale.
 * DELETE /api/v1/expenses/[id] — remove it. Its cash-book row (written when it was paid in cash) goes with it.
 * The cash book follows the entry: a cash amount that changes changes the cash-book row; Cash <-> UPI / Card adds or removes it.
 */
export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop, expense } = await load(req, id);
  const body = await readBody<any>(req);

  const data: any = {};
  let amount = Number(expense.amount);
  if (body.amount !== undefined) {
    amount = Number(body.amount);
    if (!isFinite(amount) || amount <= 0) throw new ApiError(400, 'A positive amount is required');
    data.amount = amount;
  }
  if (body.description !== undefined) data.description = String(body.description || '').trim().slice(0, 250) || null;
  if (body.date) { const d = new Date(body.date); if (!isNaN(d.getTime())) data.date = d; }
  if (body.partyId !== undefined) {
    const pid = body.partyId ? String(body.partyId) : null;
    if (pid) await assertOwned(shop.id, { customerId: pid });
    data.partyId = pid;
  }
  const wasCash = (expense.paymentMode || 'Cash') === 'Cash';
  let mode = expense.paymentMode || 'Cash';
  if (body.paymentMode !== undefined) { mode = ['Cash', 'UPI', 'Card', 'Bank'].includes(body.paymentMode) ? body.paymentMode : 'Cash'; data.paymentMode = mode; }
  const isCash = mode === 'Cash';

  await prisma.$transaction(async (tx: any) => {
    if (Object.keys(data).length) await tx.expense.update({ where: { id }, data });
    const cash = await tx.cashBook.findFirst({ where: { shopId: shop.id, referenceId: id, type: 'expense' } });
    const when = data.date || expense.date;
    if (isCash && cash) await tx.cashBook.update({ where: { id: cash.id }, data: { amount, date: when } });
    else if (!isCash && cash) await tx.cashBook.delete({ where: { id: cash.id } });
    else if (isCash && !cash && !wasCash) await tx.cashBook.create({ data: { shopId: shop.id, type: 'expense', amount, referenceId: id, description: `Expense: ${HAMALI}`, date: when } });
    if (body.direction === 'purchase' || body.direction === 'sale') await setDirection(tx, 'expenses', id, body.direction);
  }, { timeout: 30000, maxWait: 10000 });
  invalidateDashboardCacheForShop(shop.id);
  return json({ success: true });
});

export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await load(req, id);
  await prisma.$transaction(async (tx: any) => {
    await tx.cashBook.deleteMany({ where: { shopId: shop.id, referenceId: id, type: 'expense' } });
    await tx.expense.delete({ where: { id } });
  }, { timeout: 30000, maxWait: 10000 });
  invalidateDashboardCacheForShop(shop.id);
  return json({ success: true });
});
