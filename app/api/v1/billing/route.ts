import crypto from 'crypto';
import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { checkLargeTransactionAlert, checkLowStockAlerts } from '@/lib/server/notificationsEngine';

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
  const amountPaid = typeof body.amount_paid !== 'undefined' ? Number(body.amount_paid) : (paymentType === 'Udhar' ? 0 : totalAmount);
  const paymentDetails = body.payment_details || {};
  const outstandingAmount = Math.max(0, totalAmount - amountPaid);

  if (outstandingAmount > 0 && (!customerId && !body.customer_name)) {
    throw new ApiError(400, 'Customer is required for Udhar / Outstanding amounts');
  }

  if (!items || !items.length) throw new ApiError(400, 'No items in bill');
  
  // Validation: Check for negative or zero quantities and prices
  for (const item of items) {
    if (item.quantity <= 0) throw new ApiError(400, `Invalid quantity for item ${item.product_id || item.productId}`);
    if (item.price_per_unit < 0 || item.pricePerUnit < 0) throw new ApiError(400, `Invalid price for item ${item.product_id || item.productId}`);
  }

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
          amountPaid,
          paymentDetails,
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
          shop.packageType === 'wholesale' 
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

          if (shop.packageType === 'wholesale') {
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

      if (outstandingAmount > 0 && finalCustomerId) {
        const custData = await tx.customer.findUnique({ where: { id: finalCustomerId }});
        if (custData && (custData.creditLimit ?? 0) > 0) {
          const currentDue = custData.totalDue || 0;
          if (currentDue + outstandingAmount > custData.creditLimit!) {
            throw new Error(`Credit Limit of ₹${custData.creditLimit} exceeded by ₹${(currentDue + outstandingAmount) - custData.creditLimit!}`);
          }
        }
        
        await Promise.all([
          tx.customer.update({
            where: { id: finalCustomerId },
            data: { totalDue: { increment: outstandingAmount } },
          }),
          tx.customer_transactions.create({
            data: {
              customer_id: finalCustomerId,
              type: 'udhar',
              amount: outstandingAmount,
              note: `Bill: ${invoice_number}`,
              bill_number: invoice_number,
              created_at: new Date()
            }
          })
        ]);
      }

      const cashAmount = paymentType === 'Split' ? Number(paymentDetails?.cash || 0) : (paymentType === 'Cash' ? amountPaid : 0);
      if (cashAmount > 0) {
        await tx.cashBook.create({
          data: {
            shopId: shop.id,
            type: 'sale',
            amount: cashAmount,
            referenceId: created.id,
            description: paymentType === 'Split' ? `Split Sale (Cash portion): ${invoice_number}` : `Cash Sale: ${invoice_number}`
          }
        });
      }

      await tx.activityLog.create({
        data: {
          shopId: shop.id,
          action: 'bill_created',
          entityId: created.id,
          details: { invoice: invoice_number, total: totalAmount }
        }
      });

      return created;
    }, {
      maxWait: 10000, // 10 seconds
      timeout: 20000  // 20 seconds
    });

    try {
      await prisma.$transaction(async (tx) => {
        await checkLargeTransactionAlert(tx, shop.id, totalAmount, 'sale', invoice_number);
        // Extract unique product IDs
        const productIds = Array.from(new Set(items.map((i: any) => i.product_id || i.productId)));
        await checkLowStockAlerts(tx, shop.id, productIds as string[]);
      });
    } catch(e) { console.error('Notification failed', e); }

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
      amount_paid: s.amountPaid,
      payment_details: s.paymentDetails,
      customer_name: s.customer?.name || null,
      customer_mobile: s.customer?.mobile || null,
      customer_email: s.customer?.email || null,
      created_at: s.createdAt,
    })),
  );
});
