import crypto from 'crypto';
import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const shopId = shop.id;
  const body = await readBody(req);
  const customerId = (body.customer_id && body.customer_id !== '') ? body.customer_id : null;
  const items = body.items;
  const totalAmount = isNaN(body.total_amount) ? 0 : body.total_amount;
  const totalProfit = isNaN(body.total_profit) ? 0 : body.total_profit;
  const paymentType = body.payment_type || 'Cash';

  if (!items || !items.length) throw new ApiError(400, 'No items in bill');

  const invoice_number = `INV-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;

  let sale;
  try {
    sale = await prisma.$transaction(async (tx) => {
      let finalCustomerId = customerId;

      if (!finalCustomerId && body.customer_name) {
        const existing = await tx.customer.findFirst({
          where: { shopId, name: body.customer_name }
        });
        
        if (existing) {
          finalCustomerId = existing.id;
          if ((body.customer_mobile && !existing.mobile) || (body.customer_email && !existing.email)) {
            await tx.customer.update({
              where: { id: existing.id },
              data: {
                ...(body.customer_mobile && !existing.mobile ? { mobile: body.customer_mobile } : {}),
                ...(body.customer_email && !existing.email ? { email: body.customer_email } : {})
              }
            });
          }
        } else {
          const newCust = await tx.customer.create({
            data: {
              shopId,
              name: body.customer_name,
              mobile: body.customer_mobile || null,
              email: body.customer_email || null,
              totalDue: 0
            }
          });
          finalCustomerId = newCust.id;
        }
      }

      const created = await tx.sale.create({
        data: {
          shopId,
          customerId: finalCustomerId,
          totalAmount,
          totalProfit,
          paymentType,
          invoice_number,
          createdAt: body.created_at ? new Date(body.created_at) : undefined,
          items: {
            create: items.map((item: any) => ({
              productId: item.product_id || item.productId,
              unit: item.unit,
              variant: item.variant || null,
              quantity: item.quantity,
              pricePerUnit: item.price_per_unit || item.pricePerUnit,
              marginPerUnit: item.margin_per_unit || item.marginPerUnit,
            })),
          },
        },
        include: { items: true },
      });
      const itemGroups = items.reduce((acc: any, item: any) => {
        const pid = item.product_id || item.productId;
        if (!pid) return acc;
        if (!acc[pid]) acc[pid] = [];
        acc[pid].push(item);
        return acc;
      }, {});

      const productIds = Object.keys(itemGroups);
      if (productIds.length > 0) {
        const [products, activeBatches] = await Promise.all([
          tx.product.findMany({ where: { id: { in: productIds } } }),
          shop.subscriptionPlan === 'wholesale' 
            ? tx.batch.findMany({ where: { productId: { in: productIds }, shopId, quantity: { gt: 0 } }, orderBy: { createdAt: 'asc' } })
            : Promise.resolve([])
        ]);

        const batchMap = new Map();
        activeBatches.forEach((b: any) => {
          if (!batchMap.has(b.productId)) batchMap.set(b.productId, []);
          batchMap.get(b.productId).push(b);
        });

        const promises = [];

        for (const product of products) {
          const productItems = itemGroups[product.id];
          let totalQty = 0;
          let newSizeVariants = product.size_variants;

          for (const item of productItems) {
            totalQty += item.quantity;
            if (item.variant && newSizeVariants) {
              try {
                const parsed = typeof newSizeVariants === 'string' ? JSON.parse(newSizeVariants) : newSizeVariants;
                if (parsed[item.variant] !== undefined) {
                  parsed[item.variant] = Math.max(0, (parsed[item.variant] || 0) - item.quantity);
                  newSizeVariants = JSON.stringify(parsed);
                }
              } catch {}
            }
          }

          promises.push(
            tx.product.update({
              where: { id: product.id },
              data: { 
                ...(product.currentStock !== null ? { currentStock: { decrement: totalQty } } : {}),
                size_variants: newSizeVariants
              },
            })
          );

          if (shop.subscriptionPlan === 'wholesale') {
            let remainingQty = totalQty;
            const pBatches = batchMap.get(product.id) || [];
            for (const batch of pBatches) {
              if (remainingQty <= 0) break;
              const deduct = Math.min(batch.quantity, remainingQty);
              promises.push(
                tx.batch.update({
                  where: { id: batch.id },
                  data: { quantity: { decrement: deduct } }
                })
              );
              remainingQty -= deduct;
            }

            promises.push(
              tx.stockMovement.create({
                data: {
                  shopId: shopId,
                  productId: product.id,
                  type: 'sale',
                  quantity: totalQty,
                  referenceId: created.id,
                }
              })
            );
          }
        }
        await Promise.all(promises);
      }

      if (paymentType === 'Udhar' && finalCustomerId) {
        await Promise.all([
          tx.customer.update({
            where: { id: finalCustomerId },
            data: { totalDue: { increment: totalAmount } },
          }),
          tx.customer_transactions.create({
            data: {
              customer_id: finalCustomerId,
              type: 'udhar',
              amount: totalAmount,
              note: `Bill: ${invoice_number}`,
              bill_number: invoice_number,
              created_at: new Date()
            }
          })
        ]);
      }
      return created;
    }, {
      maxWait: 10000, // 10 seconds
      timeout: 20000  // 20 seconds
    });
  } catch (err: any) {
    const fs = require('fs');
    fs.writeFileSync('error.log', JSON.stringify({ message: err?.message, stack: err?.stack }, null, 2));
    return json({ 
      detail: err?.message || err?.toString() || 'Unknown error',
      stack: err?.stack,
      name: err?.name
    }, 500);
  }
  return json(sale, 201);
});

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const sales = await prisma.sale.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: 'desc' },
    include: { customer: { select: { name: true, mobile: true, email: true } } },
  });
  return json(
    sales.map((s) => ({
      id: s.id,
      invoice_number: s.invoice_number,
      total_amount: s.totalAmount,
      payment_type: s.paymentType,
      customer_name: s.customer?.name || null,
      customer_mobile: s.customer?.mobile || null,
      customer_email: s.customer?.email || null,
      created_at: s.createdAt,
    })),
  );
});
