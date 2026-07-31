import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, query } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const limit = parseInt(query(req).limit) || 5;

  const activeProducts = await prisma.product.findMany({
    where: {
      shopId: shop.id,
      OR: [{ archived: false }, { archived: null }],
    },
    select: { id: true, name: true, category: true, currentStock: true, minStock: true, size_variants: true, metadata: true }
  });

  const lowItems: { id: string, name: string, category: string, current_stock: number, min_stock: number, ratio: number }[] = [];

  for (const p of activeProducts) {
    let sizeVariants: Record<string, number> = {};
    let sizePrices: Record<string, any> = {};
    
    try {
      if (typeof p.size_variants === 'string' && p.size_variants.length > 2) {
         sizeVariants = JSON.parse(p.size_variants);
      }
      if (p.metadata) {
         const m = typeof p.metadata === 'string' ? JSON.parse(p.metadata) : (p.metadata as any);
         if (m && typeof m === 'object' && m.size_prices) {
           sizePrices = m.size_prices;
         }
      }
    } catch (e) {}

    const activeSizes = Object.entries(sizeVariants).filter(([_, qty]) => typeof qty === 'number');

    if (activeSizes.length > 0) {
      for (const [sz, qty] of activeSizes) {
        const variantMin = sizePrices[sz]?.minStock !== undefined && sizePrices[sz]?.minStock !== '' 
          ? Number(sizePrices[sz].minStock) 
          : Number(p.minStock || 0);
          
        if (variantMin > 0 && qty <= variantMin) {
           lowItems.push({
             id: p.id,
             name: `${p.name} (${sz})`,
             category: p.category || '',
             current_stock: qty,
             min_stock: variantMin,
             ratio: qty / variantMin
           });
        }
      }
    } else {
      if ((p.minStock || 0) > 0 && (p.currentStock || 0) <= p.minStock!) {
        lowItems.push({
          id: p.id,
          name: p.name || 'Product',
          category: p.category || '',
          current_stock: p.currentStock || 0,
          min_stock: p.minStock!,
          ratio: (p.currentStock || 0) / p.minStock!
        });
      }
    }
  }

  lowItems.sort((a, b) => a.ratio - b.ratio);

  return json(
    lowItems.slice(0, limit).map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      current_stock: item.current_stock,
      min_stock: item.min_stock,
    }))
  );
});
