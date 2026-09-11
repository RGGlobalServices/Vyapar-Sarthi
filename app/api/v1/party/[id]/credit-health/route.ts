import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';
import { isCustomerCredit } from '@/lib/server/ledgerClassification';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/party/[id]/credit-health
 *
 * Fast, single-party version of the FIFO replay already used by
 * crm/pending-bills and suppliers/[id]/transactions — computes Due
 * Invoices / Overdue Amount for ONE party so WholesaleBillingUI can show a
 * credit-status badge the instant a party is selected, without pulling the
 * whole-shop rollup. dueDate = billDate + party.creditDays (0 = no due date,
 * so nothing is ever "overdue" for a party with no credit terms set).
 */
export const GET = handle(async (req, ctx: any) => {
  const { id } = await ctx.params;
  const { shop } = await requireShop(req);

  const party = await prisma.customer.findFirst({ where: { id, shopId: shop.id } });
  if (!party) throw new ApiError(404, 'Party not found');

  const creditLimit = Number((party as any).creditLimit) || 0;
  const creditDays = Number((party as any).creditDays) || 0;
  const outstanding = Number((party as any).totalDue) || 0;

  const txns = await prisma.customer_transactions.findMany({
    where: { customer_id: id },
    orderBy: [{ created_at: 'asc' }],
  });

  const computeDueDate = (created: Date | null | undefined, type: string | null | undefined): Date | null => {
    if (!created || isCustomerCredit(type) || creditDays <= 0) return null;
    return new Date(new Date(created).getTime() + creditDays * 86400000);
  };

  const openBills: { id: string; billNumber: string; date: Date | null; remaining: number; dueDate: Date | null }[] = [];
  for (const t of txns) {
    const amount = Number(t.amount) || 0;
    if (isCustomerCredit(t.type)) {
      let toApply = amount;
      for (const b of openBills) {
        if (toApply <= 0) break;
        const take = Math.min(b.remaining, toApply);
        b.remaining -= take;
        toApply -= take;
      }
      while (openBills.length && openBills[0].remaining <= 1e-6) openBills.shift();
    } else if (amount > 1e-6) {
      openBills.push({ id: t.id, billNumber: t.bill_number || '', date: t.created_at, remaining: amount, dueDate: computeDueDate(t.created_at, t.type) });
    }
  }

  const now = new Date();
  const stillOpen = openBills.filter((b) => b.remaining > 1e-6);
  const overdueBills = stillOpen.filter((b) => b.dueDate && b.dueDate < now);
  const overdueAmount = overdueBills.reduce((s, b) => s + b.remaining, 0);
  const oldestOverdueDays = overdueBills.reduce((max, b) => {
    if (!b.dueDate) return max;
    const days = Math.floor((now.getTime() - b.dueDate.getTime()) / 86400000);
    return Math.max(max, days);
  }, 0);

  return json({
    partyId: id,
    creditLimit,
    creditDays,
    outstanding,
    availableCredit: creditLimit > 0 ? Math.max(0, creditLimit - outstanding) : null,
    overLimitBy: creditLimit > 0 && outstanding > creditLimit ? outstanding - creditLimit : 0,
    dueInvoicesCount: stillOpen.length,
    overdueInvoicesCount: overdueBills.length,
    overdueAmount,
    oldestOverdueDays,
  });
});
