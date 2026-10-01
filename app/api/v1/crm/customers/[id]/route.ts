import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { softDeleteCustomer } from '@/lib/server/customers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req, { params }: any) => {
  const { shop } = await requireShop(req);
  const { id } = await params;

  const customer = await prisma.customer.findFirst({
    where: { id, shopId: shop.id },
    include: {
      jobWorkOrders: {
        orderBy: { receivedAt: 'desc' },
      },
      customer_transactions: {
        orderBy: { created_at: 'desc' },
        take: 100,
      },
    },
  });

  if (!customer) throw new ApiError(404, 'Customer/Party not found');

  // Fetch production batches linked to their job work orders
  const jwOrderNumbers = (customer.jobWorkOrders || []).map((j: any) => j.orderNumber).filter(Boolean);
  let linkedBatches: any[] = [];
  if (jwOrderNumbers.length > 0) {
    linkedBatches = await (prisma as any).productionBatch.findMany({
      where: {
        shopId: shop.id,
        OR: jwOrderNumbers.map((num: string) => ({ notes: { contains: num } })),
      },
      include: {
        stages: { orderBy: { sequence: 'asc' } },
        outputs: true,
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  // Search raw material lots where farmerName matches customer name or mobile
  const rawLots = await (prisma as any).rawMaterialLot.findMany({
    where: {
      shopId: shop.id,
      OR: [
        { farmerName: { contains: customer.name, mode: 'insensitive' } },
        ...(customer.mobile ? [{ farmerName: { contains: customer.mobile, mode: 'insensitive' } }] : []),
      ],
    },
    include: {
      product: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  // Calculate financial statistics
  const txs = customer.customer_transactions || [];
  const totalCharged = txs.filter((t: any) => t.type === 'charge' || t.type === 'debit').reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0);
  const totalPaid = txs.filter((t: any) => t.type === 'payment' || t.type === 'credit' || t.type === 'advance').reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0);
  const netDue = Number(customer.totalDue) || 0;

  // ---- Material flow for this customer's job work (read-only, all computed on the server) ----
  // Job work orders carry the customer's grain in and the finished weight out; the production batches linked to them
  // (by order number in the batch notes) carry the detail: wastage, broken/bran/husk, and the WIP / rejected /
  // by-product / finished lots each batch produced, plus reprocessing batches started from its rejected lots.
  const r3 = (n: number) => Math.round((Number(n) || 0) * 1000) / 1000;
  const sum = (rows: any[], pick: (r: any) => number) => r3(rows.reduce((a: number, r: any) => a + (Number(pick(r)) || 0), 0));
  const batchIds: string[] = linkedBatches.map((b: any) => b.id);
  const [wipLots, rejectLots, byproductLots, finishedLots] = batchIds.length
    ? await Promise.all([
        (prisma as any).wipLot.findMany({ where: { shopId: shop.id, batchId: { in: batchIds } }, select: { batchId: true, quantity: true, availableQuantity: true } }),
        (prisma as any).rejectionLot.findMany({ where: { shopId: shop.id, batchId: { in: batchIds } }, select: { id: true, batchId: true, quantity: true, availableQuantity: true, disposedQuantity: true } }),
        (prisma as any).byProductLot.findMany({ where: { shopId: shop.id, batchId: { in: batchIds } }, select: { batchId: true, quantity: true } }),
        (prisma as any).finishedGoodsLot.findMany({ where: { shopId: shop.id, batchId: { in: batchIds } }, select: { batchId: true, quantity: true } }),
      ])
    : [[], [], [], []];
  const rejectLotIds: string[] = rejectLots.map((r: any) => r.id);
  const reprocessBatches = rejectLotIds.length
    ? await (prisma as any).productionBatch.findMany({
        where: { shopId: shop.id, rejectionLotId: { in: rejectLotIds } },
        select: { id: true, batchNumber: true, rejectionLotId: true, inputKg: true, outputKg: true, status: true },
      })
    : [];
  const keptByProducts = jwOrderNumbers.length
    ? await (prisma as any).byProduct.findMany({
        where: { shopId: shop.id, OR: jwOrderNumbers.map((num: string) => ({ notes: { startsWith: `Job work ${num}` } })) },
        select: { name: true, quantityKg: true, notes: true },
      })
    : [];

  const jwOrders: any[] = customer.jobWorkOrders || [];
  const done = jwOrders.filter((j: any) => j.status === 'completed' || j.status === 'delivered');
  const byProductKeptKg = sum(keptByProducts, (r) => r.quantityKg);
  const jwReceivedKg = sum(jwOrders, (j) => j.inputWeightKg);
  const jwFinishedKg = sum(done, (j) => j.outputWeightKg);
  const jwDoneInputKg = sum(done, (j) => j.inputWeightKg);
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
  const materialFlow = {
    jobWork: {
      orders: jwOrders.length,
      byStatus: {
        received: jwOrders.filter((j: any) => j.status === 'received').length,
        processing: jwOrders.filter((j: any) => j.status === 'processing').length,
        completed: jwOrders.filter((j: any) => j.status === 'completed').length,
        delivered: jwOrders.filter((j: any) => j.status === 'delivered').length,
      },
      receivedKg: jwReceivedKg,
      finishedKg: jwFinishedKg,
      byProductKeptKg,
      byProductBreakdown,
      // Anything that went in on a completed order and neither came back as finished grain nor stayed as a kept by-product.
      wasteKg: Math.max(0, r3(jwDoneInputKg - jwFinishedKg - byProductKeptKg)),
      yieldPct: jwDoneInputKg > 0 ? Math.round((jwFinishedKg / jwDoneInputKg) * 1000) / 10 : null,
      pendingKg: sum(jwOrders.filter((j: any) => j.status === 'received' || j.status === 'processing'), (j) => j.inputWeightKg),
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

  return json({
    customer,
    jobWorkOrders: customer.jobWorkOrders,
    linkedBatches,
    materialFlow,
    rawLots,
    finance: {
      totalDue: netDue,
      totalCharged,
      totalPaid,
      status: netDue > 0 ? 'due' : netDue < 0 ? 'advance' : 'clear',
    },
  });
});

export const PUT = handle(async (req, { params }: any) => {
  const { shop } = await requireShop(req);
  const data = await readBody(req);
  const { id } = await params;

  if (!data.name?.trim()) throw new ApiError(400, 'Name is required');

  const fullAddress = [
    data.address?.trim(),
    data.village?.trim() ? `गाव: ${data.village.trim()}` : null,
    data.taluka?.trim() ? `ता: ${data.taluka.trim()}` : null,
    data.district?.trim() ? `जि: ${data.district.trim()}` : (data.city?.trim() || null),
    data.state?.trim(),
    data.pincode?.trim() ? `PIN: ${data.pincode.trim()}` : null,
  ].filter(Boolean).join(', ') || data.address?.trim() || null;

  const metadata = {
    partyType: data.partyType || null,
    farmerType: data.farmerType || null,
    alternateMobile: data.alternateMobile?.trim() || null,
    village: data.village?.trim() || null,
    taluka: data.taluka?.trim() || null,
    district: data.district?.trim() || null,
    city: data.city?.trim() || null,
    state: data.state?.trim() || null,
    pincode: data.pincode?.trim() || null,
    paymentTerms: data.paymentTerms?.trim() || null,
    defaultGodownId: data.defaultGodownId?.trim() || null,
    vehicleNumbers: data.vehicleNumbers?.trim() || null,
    driverName: data.driverName?.trim() || null,
    driverMobile: data.driverMobile?.trim() || null,
    transporterCode: data.transporterCode?.trim() || null,
    // Broker Commission & Payment Details
    commissionType: data.commissionType?.trim() || null,
    commissionRate: data.commissionRate !== undefined && data.commissionRate !== '' ? Number(data.commissionRate) : null,
    commissionApplicableOn: data.commissionApplicableOn?.trim() || null,
    bankName: data.bankName?.trim() || null,
    accountHolder: data.accountHolder?.trim() || null,
    accountNumber: data.accountNumber?.trim() || null,
    ifsc: data.ifsc?.trim()?.toUpperCase() || null,
    upiId: data.upiId?.trim() || null,
    status: data.status || 'active',
  };

  const customer = await prisma.customer.update({
    where: { id, shopId: shop.id },
    data: {
      name: data.name.trim(),
      mobile: data.mobile?.trim() || '',
      email: data.email?.trim() || '',
      customerType: data.customerType || 'customer',
      shopName: data.shopName?.trim() || null,
      gst: data.gst?.trim() || null,
      pan: data.pan?.trim() || null,
      address: fullAddress,
      creditDays: parseInt(data.creditDays) || 0,
      creditLimit: parseFloat(data.creditLimit) || 0,
      notes: data.notes?.trim() || null,
      ...(data.customerType === 'broker' ? { brokerType: data.brokerType || null } : {}),
      ...(data.documents !== undefined ? { documents: data.documents } : { documents: metadata as any }),
    },
  });

  return json(customer);
});

export const DELETE = handle(async (req, { params }: any) => {
  const { shop, user } = await requireShop(req);
  const { id } = await params;

  // Soft delete by archiving, since they might have ledgers/transactions
  // which would block a hard delete due to foreign key constraints. The row
  // itself is never destroyed, but it's still logged to the trash bin so
  // there's one unified place to find and restore anything deleted —
  // "restore" for a customer means un-prefixing customerType (see
  // /api/v1/admin/trash/[id]/restore), not re-inserting from `data`. Shared
  // with the Udhar delete route (customers/[id]) — see lib/server/customers.ts.
  await softDeleteCustomer(shop.id, id, user.email);

  return json({ success: true });
});
