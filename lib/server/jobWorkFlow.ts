import prisma from '@/lib/server/prisma';
import { batchIdsLinkedToOrders, jobWorkOrderIdsOfBatches } from '@/lib/server/jobWorkLink';

/**
 * Material flow of Job Work orders (one order, or all of one customer's): grain in -> finished / by-products / waste, plus
 * what the production batches made from it hold in WIP / rejected / reprocessing. Read-only, computed on the server.
 *
 * A batch belongs to an order by the permanent job_work_order_id link when the column exists (supabase/17), and — always,
 * as the fallback that older batches rely on — by the order number written in the batch notes.
 */

const r3 = (n: any) => Math.round((Number(n) || 0) * 1000) / 1000;
const sum = (rows: any[], pick: (r: any) => number) => r3(rows.reduce((a: number, r: any) => a + (Number(pick(r)) || 0), 0));

export async function findLinkedBatches(shopId: string, orders: Array<{ id: string; orderNumber: string }>) {
  if (!orders.length) return [] as any[];
  const numbers = orders.map((o) => o.orderNumber).filter(Boolean);
  const linkedIds = await batchIdsLinkedToOrders(prisma as any, shopId, orders.map((o) => o.id));
  return (prisma as any).productionBatch.findMany({
    where: {
      shopId,
      OR: [
        ...numbers.map((num) => ({ notes: { contains: num } })),
        ...(linkedIds.length ? [{ id: { in: linkedIds } }] : []),
      ],
    },
    include: { stages: { orderBy: { sequence: 'asc' } }, outputs: true },
    orderBy: { startedAt: 'desc' },
  });
}

export async function loadMaterialFlow(shopId: string, orders: any[], linkedBatches: any[]) {
  const orderNumbers = orders.map((o) => o.orderNumber).filter(Boolean);
  const batchIds: string[] = linkedBatches.map((b: any) => b.id);

  const [wipLots, rejectLots, byproductLots, finishedLots] = batchIds.length
    ? await Promise.all([
        (prisma as any).wipLot.findMany({ where: { shopId, batchId: { in: batchIds } }, select: { batchId: true, quantity: true, availableQuantity: true } }),
        (prisma as any).rejectionLot.findMany({ where: { shopId, batchId: { in: batchIds } }, select: { id: true, batchId: true, quantity: true, availableQuantity: true, disposedQuantity: true } }),
        (prisma as any).byProductLot.findMany({ where: { shopId, batchId: { in: batchIds } }, select: { batchId: true, quantity: true } }),
        (prisma as any).finishedGoodsLot.findMany({ where: { shopId, batchId: { in: batchIds } }, select: { batchId: true, quantity: true } }),
      ])
    : [[], [], [], []];
  const rejectLotIds: string[] = rejectLots.map((r: any) => r.id);
  const reprocessBatches = rejectLotIds.length
    ? await (prisma as any).productionBatch.findMany({
        where: { shopId, rejectionLotId: { in: rejectLotIds } },
        select: { id: true, batchNumber: true, rejectionLotId: true, inputKg: true, outputKg: true, status: true },
      })
    : [];
  const keptByProducts = orderNumbers.length
    ? await (prisma as any).byProduct.findMany({
        where: { shopId, OR: orderNumbers.map((num) => ({ notes: { startsWith: `Job work ${num}` } })) },
        select: { name: true, quantityKg: true, notes: true },
      })
    : [];
  const batchJw = await jobWorkOrderIdsOfBatches(prisma as any, batchIds);

  const done = orders.filter((j: any) => j.status === 'completed' || j.status === 'delivered');
  const byProductKeptKg = sum(keptByProducts, (r) => r.quantityKg);
  const jwDoneInputKg = sum(done, (j) => j.inputWeightKg);
  const jwFinishedKg = sum(done, (j) => j.outputWeightKg);
  const byProductBreakdown: Record<string, number> = {};
  for (const r of keptByProducts) byProductBreakdown[r.name] = r3((byProductBreakdown[r.name] || 0) + (Number(r.quantityKg) || 0));

  const perBatch = linkedBatches.map((b: any) => {
    const mine = (rows: any[]) => rows.filter((r: any) => r.batchId === b.id);
    const myReject = mine(rejectLots);
    const myRejectIds = new Set(myReject.map((r: any) => r.id));
    const myReprocess = reprocessBatches.filter((x: any) => myRejectIds.has(x.rejectionLotId));
    return {
      id: b.id,
      batchNumber: b.batchNumber,
      status: b.status,
      currentStage: b.currentStage,
      jobWorkOrderId: batchJw.get(b.id) ?? orders.find((o) => o.orderNumber && String(b.notes || '').includes(o.orderNumber))?.id ?? null,
      inputKg: r3(b.inputKg),
      outputKg: b.outputKg == null ? null : r3(b.outputKg),
      wastageKg: r3(b.wastageKg),
      brokenKg: r3(b.brokenKg),
      branKg: r3(b.branKg),
      huskKg: r3(b.huskKg),
      finishedKg: sum(mine(finishedLots), (r) => r.quantity),
      wipKg: sum(mine(wipLots), (r) => r.availableQuantity),
      rejectedKg: sum(myReject, (r) => r.quantity),
      rejectedOpenKg: sum(myReject, (r) => r.availableQuantity),
      byProductKg: sum(mine(byproductLots), (r) => r.quantity),
      reprocessedKg: sum(myReprocess, (r) => r.inputKg),
      reprocessBatches: myReprocess.map((x: any) => ({ id: x.id, batchNumber: x.batchNumber, status: x.status, inputKg: r3(x.inputKg), outputKg: x.outputKg == null ? null : r3(x.outputKg) })),
    };
  });
  const tot = (k: string) => r3(perBatch.reduce((a: number, b: any) => a + (Number(b[k]) || 0), 0));

  return {
    jobWork: {
      orders: orders.length,
      byStatus: {
        received: orders.filter((j: any) => j.status === 'received').length,
        processing: orders.filter((j: any) => j.status === 'processing').length,
        completed: orders.filter((j: any) => j.status === 'completed').length,
        delivered: orders.filter((j: any) => j.status === 'delivered').length,
      },
      receivedKg: sum(orders, (j) => j.inputWeightKg),
      finishedKg: jwFinishedKg,
      byProductKeptKg,
      byProductBreakdown,
      // Went in on a completed order and neither came back as finished grain nor stayed as a kept by-product.
      wasteKg: Math.max(0, r3(jwDoneInputKg - jwFinishedKg - byProductKeptKg)),
      yieldPct: jwDoneInputKg > 0 ? Math.round((jwFinishedKg / jwDoneInputKg) * 1000) / 10 : null,
      pendingKg: sum(orders.filter((j: any) => j.status === 'received' || j.status === 'processing'), (j) => j.inputWeightKg),
    },
    batches: {
      count: perBatch.length,
      inputKg: tot('inputKg'),
      finishedKg: tot('finishedKg'),
      wastageKg: tot('wastageKg'),
      wipKg: tot('wipKg'),
      rejectedKg: tot('rejectedKg'),
      rejectedOpenKg: tot('rejectedOpenKg'),
      byProductKg: tot('byProductKg'),
      reprocessedKg: tot('reprocessedKg'),
      brokenKg: tot('brokenKg'),
      branKg: tot('branKg'),
      huskKg: tot('huskKg'),
    },
    perBatch,
  };
}
