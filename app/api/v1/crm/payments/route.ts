import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { applyCustomerPayment } from '@/lib/server/customerPayment';
import { invalidateDashboardCacheForShop } from '@/lib/server/dashboardCache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const data = await readBody(req);
  
  const { entityType, entityId, amount, discount, paymentMode, note } = data;
  const discountAmount = Math.max(0, parseFloat(discount) || 0);

  if (!entityType || !entityId || ((!amount || amount <= 0) && discountAmount <= 0)) {
    throw new ApiError(400, 'Invalid payment data');
  }

  // Use a transaction to ensure atomicity
  const result = await prisma.$transaction(async (tx) => {
    if (entityType === 'customer' || entityType === 'party') {
      const { customerTransactionId, customerName, customerMobile, newTotalDue } = await applyCustomerPayment(tx, {
        shopId: shop.id,
        customerId: entityId,
        amount: amount || 0,
        discount: discountAmount,
        paymentMode,
        note,
      });
      return { transaction: { id: customerTransactionId }, customerName, customerMobile, newTotalDue };

    } else if (entityType === 'supplier') {
      const supplier = await tx.supplier.findUnique({
        where: { id: entityId, shopId: shop.id }
      });
      if (!supplier) throw new ApiError(404, 'Supplier not found');

      // Reduce Balance by payment + any write-off discount
      const updated = await tx.supplier.update({
        where: { id: entityId },
        data: { balance: { decrement: (amount || 0) + discountAmount } }
      });

      // Payment ledger entry
      let transactionId = '';
      if ((amount || 0) > 0) {
        const transaction = await tx.supplierTransaction.create({
          data: {
            supplierId: entityId,
            type: 'payment',
            amount: amount,
            note: `Payment via ${paymentMode || 'Cash'} - ${note || ''}`.trim(),
          }
        });
        transactionId = transaction.id;

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
      }

      // Discount / write-off ledger entry
      if (discountAmount > 0) {
        const discountTxn = await tx.supplierTransaction.create({
          data: {
            supplierId: entityId,
            type: 'discount',
            amount: discountAmount,
            note: `Discount/Write-off${note ? ` - ${note}` : ''}`.trim(),
          }
        });
        if (!transactionId) transactionId = discountTxn.id;
      }

      await tx.activityLog.create({
        data: {
          shopId: shop.id,
          action: 'payment_given',
          entityId: transactionId,
          details: { entityType: 'supplier', name: supplier.name, amount, ...(discountAmount > 0 ? { discount: discountAmount } : {}) }
        }
      });

      return { updated, transaction: { id: transactionId } };
    } else {
      throw new ApiError(400, 'Invalid entityType');
    }
  }, { timeout: 15000, maxWait: 10000 });

  // A collected payment shifts Total Collection / Udhar Collection / Net In
  // Hand on the dashboard — invalidate so the shopkeeper doesn't see the old
  // numbers up to 15s after recording money.
  invalidateDashboardCacheForShop(shop.id);

  return json(result);
});
