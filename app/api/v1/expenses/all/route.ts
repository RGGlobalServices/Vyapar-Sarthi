import prisma from '@/lib/server/prisma';
import { handle, json } from '@/lib/server/http';
import { requireShop } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/expenses/all
 * Unified expense view — merges manual Expense rows with auto-generated cost
 * entries from other modules: FreightEntry (charges), CommissionEntry (charges),
 * and GateEntry hamali amounts.  Each row carries a `source` tag so the UI can
 * colour-code and filter by origin.
 */
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const shopId = shop.id;

  const [manualExpenses, freightCharges, commissionCharges, hamaliEntries] = await Promise.all([
    // 1. Manual expenses
    (prisma as any).expense.findMany({
      where: { shopId },
      include: { party: { select: { id: true, name: true } } },
      orderBy: { date: 'desc' },
    }),

    // 2. Freight charges (mill owes transporter)
    (prisma as any).freightEntry.findMany({
      where: { shopId, type: 'charge' },
      include: { transporter: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    }),

    // 3. Commission charges (mill owes broker)
    (prisma as any).commissionEntry.findMany({
      where: { shopId, type: 'charge' },
      include: { broker: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    }),

    // 4. Gate entry hamali amounts
    (prisma as any).gateEntry.findMany({
      where: { shopId, hamaliAmount: { gt: 0 } },
      select: {
        id: true, entryNumber: true, vehicleNumber: true,
        hamaliAmount: true, enteredAt: true, supplierId: true,
        supplier: { select: { id: true, name: true } },
      },
      orderBy: { enteredAt: 'desc' },
    }),
  ]);

  const rows: any[] = [];

  for (const e of manualExpenses) {
    rows.push({
      id: e.id,
      source: 'manual',
      sourceLabel: 'Manual',
      category: e.category,
      amount: Number(e.amount),
      description: e.description || '',
      paymentMode: e.paymentMode || 'Cash',
      date: e.date || e.createdAt,
      partyName: e.party?.name || null,
      referenceLabel: null,
    });
  }

  for (const f of freightCharges) {
    rows.push({
      id: f.id,
      source: 'freight',
      sourceLabel: 'Freight',
      category: 'Freight',
      amount: Number(f.amount),
      description: f.note || (f.vehicleNumber ? `Vehicle: ${f.vehicleNumber}` : ''),
      paymentMode: f.paymentMethod || 'Cash',
      date: f.createdAt,
      partyName: f.transporter?.name || null,
      referenceLabel: f.vehicleNumber || null,
    });
  }

  for (const c of commissionCharges) {
    rows.push({
      id: c.id,
      source: 'commission',
      sourceLabel: 'Commission',
      category: 'Commission',
      amount: Number(c.amount),
      description: c.note || (c.billNumber ? `Bill: ${c.billNumber}` : ''),
      paymentMode: c.paymentMethod || 'Cash',
      date: c.createdAt,
      partyName: c.broker?.name || null,
      referenceLabel: c.billNumber || null,
    });
  }

  for (const g of hamaliEntries) {
    rows.push({
      id: `hamali-${g.id}`,
      source: 'hamali',
      sourceLabel: 'Hamali',
      category: 'Hamali',
      amount: Number(g.hamaliAmount),
      description: `Gate Entry ${g.entryNumber}${g.vehicleNumber ? ` · ${g.vehicleNumber}` : ''}`,
      paymentMode: 'Cash',
      date: g.enteredAt,
      partyName: g.supplier?.name || null,
      referenceLabel: g.entryNumber || null,
    });
  }

  // Sort all by date desc
  rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return json(rows);
});
