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

  return json({
    customer,
    jobWorkOrders: customer.jobWorkOrders,
    linkedBatches,
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
