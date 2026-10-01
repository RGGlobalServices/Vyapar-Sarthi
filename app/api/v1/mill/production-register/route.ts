import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, query, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const r3 = (n: any) => Math.round((Number(n) || 0) * 1000) / 1000;
const r1 = (n: number) => Math.round(n * 10) / 10;
const dayOf = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD, shop-local day

/**
 * GET /api/v1/mill/production-register?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * The production register for a date range — closed runs only, whether they were entered with the Quick form or worked through
 * stages (both close the same way). Everything is computed here from what was actually booked (production_outputs, wastage), so a
 * report can never disagree with the stock pages:
 *   entries     one row per run: what went in, finished / by-product / WIP / rejected / waste, yield %, operator
 *   byDay       the same totals per day
 *   byMaterial  yield and loss per input material
 *   totals      the whole range
 */
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const q = query(req);
  const from = q.from ? new Date(`${q.from}T00:00:00+05:30`) : null;
  const to = q.to ? new Date(`${q.to}T23:59:59.999+05:30`) : null;
  if ((from && isNaN(from.getTime())) || (to && isNaN(to.getTime()))) throw new ApiError(400, 'Invalid date range', 'INVALID_DATE');

  const batches = await (prisma as any).productionBatch.findMany({
    where: { shopId: shop.id, status: 'closed', ...(from || to ? { startedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
    include: {
      rawLot: { select: { lotNumber: true, product: { select: { name: true } } } },
      outputs: { select: { outputType: true, name: true, quantityKg: true } },
      stages: { orderBy: { sequence: 'asc' }, select: { stageName: true, operatorName: true } },
    },
    orderBy: { startedAt: 'desc' },
    take: 1000,
  });

  // material of a reprocessing run = the product of the rejection lot it came from
  const rjIds = [...new Set(batches.map((b: any) => b.rejectionLotId).filter(Boolean))] as string[];
  const rjProducts = rjIds.length
    ? await (prisma as any).rejectionLot.findMany({ where: { shopId: shop.id, id: { in: rjIds } }, select: { id: true, product: { select: { name: true } } } })
    : [];
  const rjName = new Map<string, string>(rjProducts.map((r: any) => [r.id, r.product?.name || '']));

  const sourceOf = (b: any) => (b.batchType === 'JOB_WORK' ? 'Job Work' : b.batchType === 'REPROCESSING' ? 'Reprocessing' : /^WIP lot/i.test(b.notes || '') ? 'WIP' : 'Raw material');
  const materialOf = (b: any) => {
    if (b.rawLot?.product?.name) return b.rawLot.product.name;
    if (b.batchType === 'REPROCESSING' && b.rejectionLotId) return rjName.get(b.rejectionLotId) || 'Rejected material';
    if (b.batchType === 'JOB_WORK') { const m = String(b.notes || '').split(' · ')[1]; return m ? `${m} (customer)` : 'Customer grain'; }
    if (/^WIP lot/i.test(b.notes || '')) return 'WIP material';
    return '—';
  };

  const entries = batches.map((b: any) => {
    const sum = (type: string) => r3((b.outputs || []).filter((o: any) => o.outputType === type).reduce((s: number, o: any) => s + (Number(o.quantityKg) || 0), 0));
    const inputKg = r3(b.inputKg);
    const finishedKg = sum('finished_good');
    const lossKg = r3(b.wastageKg);
    const text = (type: string) => (b.outputs || []).filter((o: any) => o.outputType === type).map((o: any) => `${o.name} ${r3(o.quantityKg)} kg`).join('; ') || '—';
    const operators = [...new Set((b.stages || []).map((s: any) => s.operatorName).filter(Boolean))];
    return {
      id: b.id,
      date: dayOf(new Date(b.startedAt)),
      batchNumber: b.batchNumber,
      mode: (b.stages || []).length === 1 && b.stages[0].stageName === 'Production' ? 'Quick entry' : 'Stages',
      source: sourceOf(b),
      material: materialOf(b),
      inputKg,
      finishedKg,
      byProductKg: sum('by_product'),
      wipKg: sum('wip'),
      rejectedKg: sum('rejection'),
      lossKg,
      yieldPct: inputKg > 0 ? r1((finishedKg / inputKg) * 100) : null,
      lossPct: inputKg > 0 ? r1((lossKg / inputKg) * 100) : null,
      operator: operators.join(', ') || '—',
      finishedText: text('finished_good'),
      byProductText: text('by_product'),
      wipText: text('wip'),
      rejectedText: text('rejection'),
      notes: b.notes || '',
    };
  });

  const blank = () => ({ runs: 0, inputKg: 0, finishedKg: 0, byProductKg: 0, wipKg: 0, rejectedKg: 0, lossKg: 0 });
  const add = (a: ReturnType<typeof blank>, e: any) => {
    a.runs += 1; a.inputKg += e.inputKg; a.finishedKg += e.finishedKg; a.byProductKg += e.byProductKg; a.wipKg += e.wipKg; a.rejectedKg += e.rejectedKg; a.lossKg += e.lossKg;
  };
  const finish = (a: ReturnType<typeof blank>) => ({
    ...Object.fromEntries(Object.entries(a).map(([k, v]) => [k, k === 'runs' ? v : r3(v as number)])) as ReturnType<typeof blank>,
    yieldPct: a.inputKg > 0 ? r1((a.finishedKg / a.inputKg) * 100) : null,
    lossPct: a.inputKg > 0 ? r1((a.lossKg / a.inputKg) * 100) : null,
  });

  const days = new Map<string, ReturnType<typeof blank>>();
  const mats = new Map<string, ReturnType<typeof blank>>();
  const total = blank();
  for (const e of entries) {
    if (!days.has(e.date)) days.set(e.date, blank());
    if (!mats.has(e.material)) mats.set(e.material, blank());
    add(days.get(e.date)!, e); add(mats.get(e.material)!, e); add(total, e);
  }

  return json({
    from: q.from || null,
    to: q.to || null,
    truncated: batches.length >= 1000,
    totals: finish(total),
    byDay: [...days.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([date, a]) => ({ date, ...finish(a) })),
    byMaterial: [...mats.entries()].sort((a, b) => b[1].inputKg - a[1].inputKg).map(([material, a]) => ({ material, ...finish(a) })),
    entries,
  });
});
