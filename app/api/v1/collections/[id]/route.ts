import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { isWholesaleTierPackage } from '@/lib/config/packageConfig';
import { reverseCustomerPayment } from '@/lib/server/customerPayment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// GET /collections/:id — full detail incl. entries + party name/mobile
export const GET = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  if (!isWholesaleTierPackage(shop.packageType)) throw new ApiError(403, 'Udyog package required');

  const sheet = await prisma.collectionSheet.findFirst({
    where: { id, shopId: shop.id },
    include: {
      entries: {
        orderBy: [{ createdAt: 'desc' }, { sequence: 'desc' }],
        include: { customer: { select: { id: true, name: true, mobile: true, totalDue: true } } },
      },
    },
  });
  if (!sheet) throw new ApiError(404, 'Collection not found');

  return json(sheet);
});

// PATCH /collections/:id { name?, date? } — metadata only, no status change
export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { shop } = await requireShop(req);
  if (!isWholesaleTierPackage(shop.packageType)) throw new ApiError(403, 'Udyog package required');

  const existing = await prisma.collectionSheet.findFirst({ where: { id, shopId: shop.id } });
  if (!existing) throw new ApiError(404, 'Collection not found');

  const data = await readBody(req);
  const update: any = {};
  if (data.name !== undefined) {
    const name = String(data.name).trim();
    if (!name) throw new ApiError(400, 'Collection name is required');
    update.name = name;
  }
  if (data.date !== undefined) {
    const date = new Date(data.date);
    if (isNaN(date.getTime())) throw new ApiError(400, 'Invalid date');
    update.date = date;
  }

  const sheet = await prisma.collectionSheet.update({ where: { id }, data: update });
  return json(sheet);
});

// DELETE /collections/:id — reverses every entry that posted a real payment,
// then removes the sheet (entries cascade via the FK). Reversals run one at
// a time, not batched in a single transaction — see reverseCustomerPayment's
// own comment for why looping many payment reversals inside one interactive
// transaction is a real timeout risk against this remote DB.
export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { user, shop } = await requireShop(req);
  if (!isWholesaleTierPackage(shop.packageType)) throw new ApiError(403, 'Udyog package required');

  const sheet = await prisma.collectionSheet.findFirst({
    where: { id, shopId: shop.id },
    include: { entries: true },
  });
  if (!sheet) throw new ApiError(404, 'Collection not found');

  for (const entry of sheet.entries) {
    if (!entry.customerTransactionId) continue;
    await reverseCustomerPayment({
      shopId: shop.id,
      customerId: entry.customerId,
      customerTransactionId: entry.customerTransactionId,
      deletedBy: user.email,
    });
  }

  await prisma.collectionSheet.delete({ where: { id } });

  return json({ detail: 'Collection deleted' });
});
