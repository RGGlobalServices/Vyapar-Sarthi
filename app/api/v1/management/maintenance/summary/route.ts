import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET — what maintenance and spare parts have cost: all-time, this month, and per machine (service costs). */
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [entries, parts] = await Promise.all([
    (prisma as any).maintenanceEntry.findMany({ where: { shopId: shop.id }, select: { machineId: true, cost: true, serviceDate: true, machine: { select: { name: true } } } }),
    prisma.expense.findMany({ where: { shopId: shop.id, category: 'Spare Parts' }, select: { amount: true, date: true } }),
  ]);
  const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
  const byMachine = new Map<string, { machineId: string; name: string; cost: number; visits: number }>();
  for (const e of entries as any[]) {
    const b = byMachine.get(e.machineId) || { machineId: e.machineId, name: e.machine?.name || '-', cost: 0, visits: 0 };
    b.cost += Number(e.cost) || 0;
    b.visits += 1;
    byMachine.set(e.machineId, b);
  }
  return json({
    maintenanceTotal: sum((entries as any[]).map((e) => Number(e.cost) || 0)),
    maintenanceMonth: sum((entries as any[]).filter((e) => new Date(e.serviceDate) >= monthStart).map((e) => Number(e.cost) || 0)),
    sparePartsTotal: sum(parts.map((p) => p.amount)),
    sparePartsMonth: sum(parts.filter((p) => p.date >= monthStart).map((p) => p.amount)),
    byMachine: [...byMachine.values()].sort((a, b) => b.cost - a.cost),
  });
});
