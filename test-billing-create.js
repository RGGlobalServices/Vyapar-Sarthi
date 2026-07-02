const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const crypto = require('crypto');

async function main() {
  try {
    const shop = await prisma.shop.findFirst();
    if (!shop) return;
    
    const items = [{
      productName: 'Imported Sale',
      category: 'Import',
      quantity: 1,
      unit: 'Unit',
      pricePerUnit: 1000,
      marginPerUnit: 0
    }];

    const invoice_number = `INV-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;

    const created = await prisma.sale.create({
      data: {
        shopId: shop.id,
        customerId: null,
        totalAmount: 1000,
        totalProfit: 0,
        paymentType: 'Mixed',
        invoice_number,
        createdAt: new Date('2026-05-01'),
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            unit: item.unit,
            quantity: item.quantity,
            pricePerUnit: item.pricePerUnit,
            marginPerUnit: item.marginPerUnit,
          })),
        },
      },
      include: { items: true },
    });
    
    console.log('SUCCESS:', created);
  } catch (e) {
    console.log('ERROR:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
