import prisma from '@/lib/server/prisma';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const [shopsCount, wholesaleShopsCount, businessTypesGroup, categoriesGroup, billingsCount, usersCount] = await Promise.all([
    // Total shops (retailers and general businesses)
    prisma.shop.count(),

    // Total wholesale shops
    prisma.shop.count({
      where: {
        OR: [
          { subscriptionPlan: 'wholesale' },
          { businessType: 'general' }
        ]
      }
    }),

    // Unique business types used by shops
    prisma.shop.groupBy({
      by: ['businessType'],
      where: {
        businessType: { not: null }
      }
    }),

    // Unique product categories added by users
    prisma.product.groupBy({
      by: ['category'],
      where: {
        AND: [
          { category: { not: null } },
          { category: { not: '' } }
        ]
      }
    }),

    // Total bills generated (all time)
    prisma.sale.count(),

    // Total registered users
    prisma.user.count(),
  ]);

  const activeBusinessTypes = Math.max(businessTypesGroup.length, 7);
  const activeCategories = Math.max(categoriesGroup.length, 36);
  const activeShops = Math.max(shopsCount, 128);
  const activeWholesalers = Math.max(wholesaleShopsCount, 15);
  const activeBillings = Math.max(billingsCount, 10000);
  const activeUsers = Math.max(usersCount, 200);

  return json({
    shops: activeShops,
    wholesalers: activeWholesalers,
    businessTypes: activeBusinessTypes,
    categories: activeCategories,
    billings: activeBillings,
    users: activeUsers,
    raw: {
      shops: shopsCount,
      wholesalers: wholesaleShopsCount,
      businessTypes: businessTypesGroup.length,
      categories: categoriesGroup.length,
      billings: billingsCount,
      users: usersCount,
    }
  });
});
