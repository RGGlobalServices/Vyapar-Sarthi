import { PrismaClient } from '@prisma/client';

export type NotificationType = 'low_stock' | 'outstanding_due' | 'large_sale' | 'large_purchase' | 'system';

export async function createNotification(
  tx: any, 
  shopId: string, 
  type: NotificationType, 
  title: string, 
  message: string,
  link?: string
) {
  return tx.userNotification.create({
    data: {
      shopId,
      title,
      message,
      type,
      link: link || null,
      isRead: false
    }
  });
}

// Background helpers that can run safely inside transactions
export async function checkLowStockAlerts(tx: any, shopId: string, productIds: string[]) {
  if (!productIds.length) return;
  const products = await tx.product.findMany({
    where: { shopId, id: { in: productIds } }
  });

  const alerts = [];
  for (const p of products) {
    if (p.currentStock !== null && p.minStock !== null && p.currentStock <= p.minStock) {
      alerts.push(createNotification(
        tx,
        shopId,
        'low_stock',
        'Low Stock Alert',
        `Product "${p.name}" has reached low stock level (${p.currentStock} remaining).`,
        `/products/${p.id}`
      ));
    }
  }

  await Promise.all(alerts);
}

export async function checkLargeTransactionAlert(tx: any, shopId: string, amount: number, type: 'sale' | 'purchase', invoiceNumber: string) {
  const threshold = type === 'sale' ? 10000 : 50000; // Configurable thresholds
  
  if (amount >= threshold) {
    await createNotification(
      tx,
      shopId,
      type === 'sale' ? 'large_sale' : 'large_purchase',
      type === 'sale' ? 'Large Sale Recorded' : 'Large Purchase Recorded',
      `A ${type} of ₹${amount.toLocaleString()} was just recorded (Inv: ${invoiceNumber}).`,
      type === 'sale' ? `/billing` : `/purchases`
    );
  }
}
