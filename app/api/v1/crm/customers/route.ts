import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const url = new URL(req.url);
  const type = url.searchParams.get('type') || 'customer';
  // ?type=all skips the customerType filter so the CRM page can show every
  // customer regardless of role (Farmer / Dealer / Distributor / Institution /
  // Retail Customer) in one list. Existing callers passing an explicit type
  // (e.g. 'supplier') keep today's filtered behaviour.
  const where: any = { shopId: shop.id };
  if (type !== 'all') where.customerType = type;

  const customers = await prisma.customer.findMany({
    where,
    include: {
      customer_transactions: {
        orderBy: { created_at: 'desc' },
        take: 5
      }
    },
    orderBy: { name: 'asc' },
  });

  return json(customers);
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const data = await readBody(req);

  if (!data.name?.trim()) throw new ApiError(400, 'Name is required');

  const rawOpBal = Math.abs(parseFloat(data.openingBalance) || 0);
  const isPayable = data.balanceType === 'payable' || data.balanceType === 'PAYABLE';
  const computedTotalDue = rawOpBal > 0 ? (isPayable ? -rawOpBal : rawOpBal) : 0;

  // Build structured full address
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
    balanceType: data.balanceType || (computedTotalDue < 0 ? 'payable' : 'receivable'),
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

  const customer = await prisma.customer.create({
    data: {
      shopId: shop.id,
      name: data.name.trim(),
      mobile: data.mobile?.trim() || '',
      email: data.email?.trim() || '',
      customerType: data.customerType || 'customer',
      shopName: data.shopName?.trim() || (metadata.partyType ? `${data.name.trim()} (${metadata.partyType})` : null),
      gst: data.gst?.trim() || null,
      pan: data.pan?.trim() || null,
      address: fullAddress,
      creditDays: parseInt(data.creditDays) || (data.paymentTerms?.includes('15') ? 15 : data.paymentTerms?.includes('30') ? 30 : 0),
      creditLimit: parseFloat(data.creditLimit) || 0,
      notes: data.notes?.trim() || null,
      documents: metadata as any,
      ...(data.customerType === 'broker' ? { brokerType: data.brokerType || null } : {}),
      totalDue: computedTotalDue,
    },
  });

  // If there is an opening balance, record it in the ledger
  if (computedTotalDue !== 0) {
    await prisma.customer_transactions.create({
      data: {
        customer_id: customer.id,
        type: computedTotalDue > 0 ? 'udhar' : 'advance',
        amount: Math.abs(computedTotalDue),
        note: `Opening Balance (${isPayable ? 'Payable' : 'Receivable'})`,
      }
    });
  }

  return json(customer);
});
