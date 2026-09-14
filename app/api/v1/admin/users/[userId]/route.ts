import prisma from '@/lib/server/prisma';
import { requireAdmin } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ userId: string }> };

export const GET = handle<Ctx>(async (req, { params }) => {
  await requireAdmin(req);
  const userId = parseInt((await params).userId, 10);
  if (!Number.isFinite(userId)) throw new ApiError(400, 'Invalid user id');
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, 'User not found');

  // Users with incomplete data (no uuid — e.g. legacy/test accounts) have no
  // shop or referrals. Skip the uuid-keyed lookups so we never pass null into a
  // non-nullable uuid filter, which would throw a Prisma validation error.
  const uuid = user.uuid;
  const [shop, referralCode, supportTicketCount, referralsGivenRaw, referralsReceivedRaw] = uuid
    ? await Promise.all([
        prisma.shop.findFirst({
          where: { ownerId: uuid },
          include: {
            products: { select: { id: true, name: true, currentStock: true, minStock: true } },
            customers: { select: { id: true, name: true, mobile: true, totalDue: true } },
            paymentTransactions: {
              select: { id: true, txnid: true, amount: true, status: true, plan: true, createdAt: true },
              orderBy: { createdAt: 'desc' }
            },
          },
        }),
        prisma.referralCode.findFirst({ where: { userId: uuid } }),
        prisma.supportTicket.count({ where: { userId: uuid } }),
        prisma.referral.findMany({ where: { referrerId: uuid } }),
        prisma.referral.findMany({ where: { referredId: uuid } }),
      ])
    : [null, null, 0, [] as Awaited<ReturnType<typeof prisma.referral.findMany>>, [] as Awaited<ReturnType<typeof prisma.referral.findMany>>];

  // Map referred users for referralsGiven
  const referredUuids = referralsGivenRaw.map(r => r.referredId).filter(Boolean) as string[];
  const referredUsers = referredUuids.length > 0 
    ? await prisma.user.findMany({
        where: { uuid: { in: referredUuids } },
        select: { uuid: true, email: true, name: true, fullName: true },
      })
    : [];
  const referredUserMap = new Map(referredUsers.map(u => [u.uuid, u]));

  const referralsGiven = referralsGivenRaw.map(r => {
    const refUser = r.referredId ? referredUserMap.get(r.referredId) : null;
    return {
      id: r.id,
      status: r.status,
      referred: refUser ? {
        email: refUser.email,
        name: refUser.fullName || refUser.name || '',
      } : {
        email: r.referredEmail || '',
        name: 'Pending Register',
      }
    };
  });

  // Map referrer users for referralsReceived
  const referrerUuids = referralsReceivedRaw.map(r => r.referrerId).filter(Boolean) as string[];
  const referrerUsers = referrerUuids.length > 0 
    ? await prisma.user.findMany({
        where: { uuid: { in: referrerUuids } },
        select: { uuid: true, email: true, name: true, fullName: true },
      })
    : [];
  const referrerUserMap = new Map(referrerUsers.map(u => [u.uuid, u]));

  const referralsReceived = referralsReceivedRaw.map(r => {
    const refUser = referrerUserMap.get(r.referrerId);
    return {
      id: r.id,
      referrer: refUser ? {
        email: refUser.email,
        name: refUser.fullName || refUser.name || '',
      } : {
        email: '',
        name: 'Unknown User',
      }
    };
  });

  return json({
    id: user.id,
    email: user.email,
    name: user.fullName || user.name || '',
    storeName: user.storeName || '',
    mobile: user.mobile || '',
    businessType: user.businessType || '',
    isActive: !!user.isActive,
    maxShops: user.maxShops,
    canAddShop: user.canAddShop !== false,
    createdAt: user.createdAt,
    shop: shop || null,
    referralCode: referralCode || null,
    referralsGiven,
    referralsReceived,
    ticketCount: supportTicketCount,
  });
});

export const DELETE = handle<Ctx>(async (req, { params }) => {
  const admin = await requireAdmin(req);
  if (admin.role !== 'superadmin') throw new ApiError(403, 'Only superadmin can delete users');

  const userId = parseInt((await params).userId, 10);
  if (!Number.isFinite(userId)) throw new ApiError(400, 'Invalid user id');
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, 'User not found');

  // No uuid → no related data; just remove the user record.
  if (!user.uuid) {
    await prisma.user.delete({ where: { id: userId } });
    return json({ detail: 'User deleted successfully' });
  }
  const uuid = user.uuid;

  // Every shop the user owns (a user may own more than one). Needed for the
  // handful of shop-scoped tables that store a raw `shop_id` column WITHOUT a
  // Prisma `shop` relation (CalendarEvent, StockMovement) — they can only be
  // filtered by shopId, not by `shop: { ownerId }`.
  const shopIds = (await prisma.shop.findMany({ where: { ownerId: uuid }, select: { id: true } })).map((s) => s.id);

  // Full ordered cascade. The DB has ~30 shop-scoped tables; most `onDelete:
  // Cascade` on their shop relation, so they vanish automatically when the
  // shop row is deleted. But a growing number hold `onDelete: NoAction`
  // foreign keys pointing at Product / Customer / Supplier / DukandarRelationship
  // (or at a Cascade table like Supplier that is itself about to be
  // cascade-deleted). Any one of those blocks the delete with a foreign-key
  // violation and rolls the whole transaction back — which is exactly the
  // production "Failed to delete user" bug (the old transaction only cleared
  // a handful of the tables that existed when it was written).
  //
  // Order matters: delete every NoAction child BEFORE the row it points at,
  // finishing with shop (cascades all the remaining Cascade tables) and the
  // user. Each entry notes the NoAction FK it unblocks.
  try {
    // Interactive transaction (callback form) so we can raise the timeout well
    // above the 5s default — a shop with lots of history means many deleteMany
    // statements against the remote DB, which has shown high latency.
    await prisma.$transaction(async (tx) => {
      // ─ children with NoAction FKs into Sale / Customer / Product / Supplier ─
      await tx.saleItem.deleteMany({ where: { sale: { shop: { ownerId: uuid } } } });                 // SaleItem→sale/product NoAction
      await tx.customer_transactions.deleteMany({ where: { customers: { shop: { ownerId: uuid } } } }); // customer_transactions→customer NoAction (the common blocker)
      await tx.orderItem.deleteMany({ where: { order: { shop: { ownerId: uuid } } } });
      await tx.order.deleteMany({ where: { shop: { ownerId: uuid } } });                                // Order→customer/supplier NoAction
      await tx.returnItem.deleteMany({ where: { materialReturn: { shop: { ownerId: uuid } } } });       // ReturnItem→product NoAction
      await tx.materialReturn.deleteMany({ where: { shop: { ownerId: uuid } } });
      await tx.supplierTransaction.deleteMany({ where: { supplier: { shop: { ownerId: uuid } } } });    // SupplierTransaction→supplier NoAction (blocks supplier cascade)
      await tx.productionBatch.deleteMany({ where: { shop: { ownerId: uuid } } });                      // ProductionBatch→rawLot NoAction
      await tx.rawMaterialLot.deleteMany({ where: { shop: { ownerId: uuid } } });                       // RawMaterialLot→product/supplier NoAction
      await tx.batch.deleteMany({ where: { shop: { ownerId: uuid } } });
      await tx.stockLog.deleteMany({ where: { shop: { ownerId: uuid } } });                             // StockLog→product NoAction
      await tx.stockMovement.deleteMany({ where: { shopId: { in: shopIds } } });                        // raw shop_id, no relation
      await tx.dailyStockEntry.deleteMany({ where: { shop: { ownerId: uuid } } });
      await tx.dailyRegisterLog.deleteMany({ where: { shop: { ownerId: uuid } } });
      await tx.dukandarStockAlert.deleteMany({ where: { relationship: { OR: [{ wholesalerId: uuid }, { retailerId: uuid }] } } }); // →relationship NoAction
      await tx.dukandarCredit.deleteMany({ where: { relationship: { OR: [{ wholesalerId: uuid }, { retailerId: uuid }] } } });     // →relationship NoAction

      // ─ parents that are now unblocked ─
      await tx.purchaseInvoice.deleteMany({ where: { shop: { ownerId: uuid } } });  // cascades PurchaseItem
      await tx.sale.deleteMany({ where: { shop: { ownerId: uuid } } });
      await tx.product.deleteMany({ where: { shop: { ownerId: uuid } } });          // cascades ProductVariant / GodownProduct
      await tx.customer.deleteMany({ where: { shop: { ownerId: uuid } } });
      await tx.supplier.deleteMany({ where: { shop: { ownerId: uuid } } });
      // Master data has self-referential NoAction FKs (Category.parent, Unit.baseUnit)
      // and Product references them — clear after products, before the shop cascade.
      await tx.category.deleteMany({ where: { shop: { ownerId: uuid } } });
      await tx.unit.deleteMany({ where: { shop: { ownerId: uuid } } });
      await tx.calendarEvent.deleteMany({ where: { shopId: { in: shopIds } } });    // raw shop_id, no relation
      // Godown's shop relation is onDelete: NoAction — must go before shop.
      await tx.godown.deleteMany({ where: { shop: { ownerId: uuid } } });

      // ─ user-scoped (by uuid) ─
      await tx.dukandarRelationship.deleteMany({ where: { OR: [{ wholesalerId: uuid }, { retailerId: uuid }] } });
      await tx.referral.deleteMany({ where: { OR: [{ referrerId: uuid }, { referredId: uuid }] } });
      await tx.referralCode.deleteMany({ where: { userId: uuid } });
      await tx.userNotification.deleteMany({ where: { userId: uuid } });
      await tx.pushSubscription.deleteMany({ where: { userId: uuid } });
      await tx.notificationSetting.deleteMany({ where: { userId: uuid } });
      await tx.supportTicket.deleteMany({ where: { userId: uuid } });
      // ToolUsage keys on the INTEGER user id (not uuid) and its FK has no
      // cascade — must be cleared or user.delete below hits tool_usage_user_id_fkey.
      // (UserSession → user IS onDelete: Cascade, so it needs no explicit delete.)
      await tx.toolUsage.deleteMany({ where: { userId } });

      // ─ shop cascades everything still Cascade-linked (Expense, PaymentTransaction,
      //   Staff+Attendance+Salary+Advance, CollectionSheet+Entry, DeletedRecord,
      //   Brand, ExpenseCategory, CashBook, DailyClosing, ActivityLog, ImportLog,
      //   ByProduct, …) then finally the user. ─
      await tx.shop.deleteMany({ where: { ownerId: uuid } });
      await tx.user.delete({ where: { id: userId } });
    }, { timeout: 60000, maxWait: 10000 });
  } catch (err) {
    // Surface the REAL cause instead of an opaque 500 — a Prisma FK violation
    // (P2003) names the constraint/table, so a future missing table is
    // diagnosable from the admin UI rather than a silent "Failed to delete".
    const e = err as { code?: string; message?: string; meta?: Record<string, unknown> };
    console.error('Admin delete-user failed:', e?.code, e?.message, e?.meta);
    const where = e?.meta?.modelName || e?.meta?.field_name || e?.meta?.constraint;
    throw new ApiError(500, `Failed to delete user: ${e?.code === 'P2003' ? `related data still references it${where ? ` (${where})` : ''}` : (e?.message || 'unexpected error')}`);
  }

  return json({ detail: 'User and all related data deleted successfully' });
});

export const PATCH = handle<Ctx>(async (req, { params }) => {
  await requireAdmin(req);
  const userId = parseInt((await params).userId, 10);
  if (!Number.isFinite(userId)) throw new ApiError(400, 'Invalid user id');
  
  const body = await req.json();
  const updateData: any = {};

  if (body.maxShops !== undefined) {
    updateData.maxShops = body.maxShops === null ? null : parseInt(body.maxShops, 10);
  }

  if (body.canAddShop !== undefined) {
    updateData.canAddShop = !!body.canAddShop;
  }

  // Basic profile fields — the admin panel's User Information card was
  // previously read-only with no way to fix a typo'd email/mobile or
  // relabel a shop's business type without touching the DB directly.
  if (body.name !== undefined) updateData.fullName = body.name || null;
  if (body.email !== undefined) {
    if (!body.email) throw new ApiError(400, 'Email cannot be empty');
    updateData.email = body.email;
  }
  if (body.mobile !== undefined) updateData.mobile = body.mobile || null;
  if (body.storeName !== undefined) updateData.storeName = body.storeName || null;
  if (body.businessType !== undefined) updateData.businessType = body.businessType || null;

  if (Object.keys(updateData).length === 0) {
    throw new ApiError(400, 'No valid fields provided for update');
  }

  let user;
  try {
    user = await prisma.user.update({
      where: { id: userId },
      data: updateData
    });
  } catch (err) {
    const e = err as { code?: string; meta?: { target?: string[] } };
    if (e?.code === 'P2002' && e.meta?.target?.includes('email')) {
      throw new ApiError(409, 'Another account already uses this email');
    }
    throw err;
  }

  return json(user);
});
