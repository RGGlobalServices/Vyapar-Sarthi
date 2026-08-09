import { NextResponse } from 'next/server';
import { requireShop } from '@/lib/server/auth';
import prisma from '@/lib/server/prisma';
import { ensureWholesaleTables } from '@/lib/server/wholesale';
import { checkLowStockAlerts } from '@/lib/server/notificationsEngine';
import { applyVariantStockDeltas } from '@/lib/server/variantStock';

export async function POST(req: Request) {
  try {
    const auth = await requireShop(req);
    await ensureWholesaleTables();

    const data = await req.json();
    const { productId, warehouseId, reason, notes } = data;
    // Colour/size products send one delta per variant instead of a single
    // flat difference — the product total is derived by summing them, and
    // each variant's own current stock (Product.variants[].stock) is what
    // actually moves, not just the aggregate godown/currentStock counters.
    const variantDeltas: { variantKey: string; delta: number }[] = Array.isArray(data.variantDeltas)
      ? data.variantDeltas
          .map((d: any) => ({ variantKey: String(d.variantKey || ''), delta: Number(d.delta) }))
          .filter((d: any) => d.variantKey && Number.isFinite(d.delta) && d.delta !== 0)
      : [];
    const difference = variantDeltas.length > 0
      ? variantDeltas.reduce((sum, d) => sum + d.delta, 0)
      : Number(data.difference);

    if (!productId || !warehouseId || typeof difference !== 'number' || Number.isNaN(difference)) {
      return NextResponse.json({ error: 'Invalid adjustment details.' }, { status: 400 });
    }

    if (difference === 0) {
      return NextResponse.json({ error: 'Difference cannot be zero.' }, { status: 400 });
    }

    if (variantDeltas.length > 0) {
      const product = await prisma.product.findUnique({ where: { id: productId }, select: { variants: true } });
      const variants = Array.isArray(product?.variants) ? (product!.variants as any[]) : [];
      const rowKey = (v: any) => (v.color ? `${v.color} / ${v.size || ''}` : (v.size || ''));
      for (const d of variantDeltas) {
        if (d.delta >= 0) continue;
        const row = variants.find((v) => rowKey(v) === d.variantKey);
        const currentQty = Number(row?.stock) || 0;
        if (currentQty + d.delta < 0) {
          return NextResponse.json({ error: `Negative stock is not allowed for "${d.variantKey}".` }, { status: 400 });
        }
      }
    } else if (difference < 0) {
      const current = await prisma.godownProduct.findUnique({
        where: { godownId_productId: { godownId: warehouseId, productId } }
      });
      if (!current || current.quantity + difference < 0) {
        return NextResponse.json({ error: 'Negative stock is not allowed.' }, { status: 400 });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // Update Warehouse Stock
      await tx.$executeRaw`
        INSERT INTO godown_products (id, godown_id, product_id, quantity, updated_at)
        VALUES (gen_random_uuid(), ${warehouseId}::uuid, ${productId}::uuid, ${difference}, NOW())
        ON CONFLICT (godown_id, product_id)
        DO UPDATE SET 
          quantity = godown_products.quantity + ${difference},
          updated_at = NOW()
      `;

      // Update Global Product Stock
      await tx.product.update({
        where: { id: productId },
        data: {
          currentStock: { increment: difference }
        }
      });

      // Log Adjustment
      await tx.stockMovement.create({
        data: {
          shopId: auth.shop.id,
          productId,
          warehouseId,
          type: 'adjustment',
          quantity: Math.abs(difference),
          referenceId: null,
        },
      });

      await tx.activityLog.create({
        data: {
          shopId: auth.shop.id,
          action: 'stock_adjusted',
          entityId: productId,
          details: {
            productId, difference, warehouseId, reason: reason || 'Manual adjustment',
            ...(variantDeltas.length > 0 ? { variantDeltas } : {}),
          }
        }
      });

      return { success: true };
    });

    // Per-variant stock breakdown (Udyog colour/size rows in Product.variants[])
    // — best-effort, after the critical transaction above has already
    // committed the flat currentStock/godown totals. Same pattern as
    // purchases/route.ts.
    if (variantDeltas.length > 0) {
      try {
        await applyVariantStockDeltas(prisma, variantDeltas.map((d) => ({ productId, variantKey: d.variantKey, delta: d.delta })));
      } catch (e) { console.error('Variant stock update failed:', e); }
    }

    try {
      await prisma.$transaction(async (tx) => {
        await checkLowStockAlerts(tx, auth.shop.id, [productId]);
      });
    } catch(e) { console.error('Low stock alert failed', e); }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API] Error processing stock adjustment:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
