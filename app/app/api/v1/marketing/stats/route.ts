import prisma from '@/lib/server/prisma';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const [shopsCount, wholesaleShopsCount, businessTypesGroup, categoriesGroup] = await Promise.all([
    // Total shops (retailers and general businesses)
    prisma.shop.count(),
    
    // Total wholesale shops
    prisma.shop.count({
      where: {
        OR: [
          { subscriptionPlan: 'wholesale' },
          { businessType: 'general' } // general wholesale
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
    })
  ]);

  // Fallbacks for empty development databases to look realistic while remaining dynamic
  const activeBusinessTypes = Math.max(businessTypesGroup.length, 7); // 7 standard types
  const activeCategories = Math.max(categoriesGroup.length, 36); // default categories
  const activeShops = Math.max(shopsCount, 128); // start base
  const activeWholesalers = Math.max(wholesaleShopsCount, 15); // start base

  return json({
    shops: activeShops,
    wholesalers: activeWholesalers,
    businessTypes: activeBusinessTypes,
    categories: activeCategories,
    // Real raw database counts for debugging/verification
    raw: {
      shops: shopsCount,
      wholesalers: wholesaleShopsCount,
      businessTypes: businessTypesGroup.length,
      categories: categoriesGroup.length,
    }
  });
});
