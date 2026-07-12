import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const data = await readBody(req);
  
  const { entityType, entityId, amount, paymentMode, note } = data;

  if (!entityType || !entityId || !amount || amount <= 0) {
    throw new ApiError(400, 'Invalid payment data');
  }

  // Use a transaction to ensure atomicity
  const result = await prisma.$transaction(async (tx) => {
    if (entityType === 'customer' || entityType === 'party') {
      const customer = await tx.customer.findUnique({
        where: { id: entityId, shopId: shop.id }
      });
      if (!customer) throw new ApiError(404, 'Customer/Party not found');

      // Reduce Outstanding (TotalDue)
      const updated = await tx.customer.update({
        where: { id: entityId },
        data: { totalDue: { decrement: amount } }
      });

      // Insert Ledger Entry
      const transaction = await tx.customer_transactions.create({
        data: {
          customer_id: entityId,
          type: 'payment',
          amount: amount,
          note: `Payment via ${paymentMode || 'Cash'} - ${note || ''}`.trim(),
        }
      });

      if ((paymentMode || 'Cash').toLowerCase() === 'cash') {
        await tx.cashBook.create({
          data: {
            shopId: shop.id,
            type: 'collection',
            amount: amount,
            referenceId: transaction.id,
            description: `Payment from Customer: ${customer.name}`
          }
        });
      }

      await tx.activityLog.create({
        data: {
          shopId: shop.id,
          action: 'payment_collected',
          entityId: transaction.id,
          details: { entityType: 'customer', name: customer.name, amount }
        }
      });

      return { updated, transaction };

    } else if (entityType === 'supplier') {
      const supplier = await tx.supplier.findUnique({
        where: { id: entityId, shopId: shop.id }
      });
      if (!supplier) throw new ApiError(404, 'Supplier not found');

      // Reduce Balance
      const updated = await tx.supplier.update({
        where: { id: entityId },
        data: { balance: { decrement: amount } }
      });

      // Insert Ledger Entry
      const transaction = await tx.supplierTransaction.create({
        data: {
          supplierId: entityId,
          type: 'payment',
          amount: amount,
          note: `Payment via ${paymentMode || 'Cash'} - ${note || ''}`.trim(),
        }
      });

      if ((paymentMode || 'Cash').toLowerCase() === 'cash') {
        await tx.cashBook.create({
          data: {
            shopId: shop.id,
            type: 'withdrawal',
            amount: amount,
            referenceId: transaction.id,
            description: `Payment to Supplier: ${supplier.name}`
          }
        });
      }

      await tx.activityLog.create({
        data: {
          shopId: shop.id,
          action: 'payment_given',
          entityId: transaction.id,
          details: { entityType: 'supplier', name: supplier.name, amount }
        }
      });

      return { updated, transaction };
    } else {
      throw new ApiError(400, 'Invalid entityType');
    }
  });

  return json(result);
});
