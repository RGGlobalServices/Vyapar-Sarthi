const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const crypto = require('crypto');

async function main() {
  try {
    const shop = await prisma.shop.findFirst();
    if (!shop) return;
    
    const s = {
      date: '2026-05-01',
      endDate: '2026-05-31',
      totalAmount: 31000,
      totalProfit: 0,
      paymentMethod: 'Cash'
    };

    const startDate = new Date(s.date);
    const endDate = new Date(s.endDate);

    const itemsWithIds = [{
      productName: 'Imported Sale',
      category: 'Import',
      quantity: 1,
      unit: 'Unit',
      pricePerUnit: s.totalAmount || 0,
      marginPerUnit: s.totalProfit || 0
    }];

    if (endDate && endDate > startDate) {
      const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const dailyAmount = (s.totalAmount || 0) / daysDiff;
      const dailyProfit = (s.totalProfit || 0) / daysDiff;
      
      console.log(`daysDiff: ${daysDiff}, dailyAmount: ${dailyAmount}`);

      for (let i = 0; i < daysDiff; i++) {
        const current = new Date(startDate);
        current.setDate(startDate.getDate() + i);
        
        const dailyItems = itemsWithIds.map((item) => ({
          ...item,
          pricePerUnit: item.pricePerUnit ? item.pricePerUnit / daysDiff : 0,
          marginPerUnit: item.marginPerUnit ? item.marginPerUnit / daysDiff : 0
        }));

        const invoice_number = `INV-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;

        // Insert into DB exactly as api.post('/billing') would
        await prisma.sale.create({
          data: {
            shopId: shop.id,
            customerId: null,
            totalAmount: dailyAmount,
            totalProfit: dailyProfit,
            paymentType: s.paymentMethod,
            invoice_number,
            createdAt: new Date(current.toISOString()),
            items: {
              create: dailyItems.map((item) => ({
                productId: item.productId || null,
                unit: item.unit,
                quantity: item.quantity,
                pricePerUnit: item.pricePerUnit,
                marginPerUnit: item.marginPerUnit,
              })),
            },
          }
        });
      }
      console.log(`Successfully inserted ${daysDiff} daily sales!`);
    }

  } catch (e) {
    console.log('ERROR:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
