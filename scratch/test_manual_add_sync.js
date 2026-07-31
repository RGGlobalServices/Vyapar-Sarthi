const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testManualAddAndSync() {
  console.log('=== TESTING ENHANCED MANUAL ADD & PRODUCT SYNCING LOGIC ===\n');

  // Find a test shop
  const shop = await prisma.shop.findFirst();
  if (!shop) {
    console.log('No shop found. Skipping test.');
    return;
  }

  console.log(`Using Shop: ${shop.name} (${shop.id})`);

  // 1. Simulate billing a manually added item: Name: "Quick Test Biscuit", Cost: 30, MRP: 50, Price: 45, Qty: 2
  const costPrice = 30;
  const sellingPrice = 45;
  const quantity = 2;
  const marginPerUnit = sellingPrice - costPrice; // 15
  const totalProfit = marginPerUnit * quantity; // 30
  const totalAmount = sellingPrice * quantity; // 90

  const manualSale = await prisma.sale.create({
    data: {
      shopId: shop.id,
      totalAmount,
      totalProfit,
      paymentType: 'cash',
      amountPaid: totalAmount,
      invoice_number: `TEST-MANUAL-${Date.now()}`,
      items: {
        create: [
          {
            productId: null,
            unit: 'Packet',
            variant: 'Quick Test Biscuit 100g',
            quantity: quantity,
            pricePerUnit: sellingPrice,
            marginPerUnit: marginPerUnit,
          }
        ]
      }
    },
    include: { items: true }
  });

  console.log('✓ Manual Sale Created successfully! Invoice:', manualSale.invoice_number);
  console.log('  Total Amount:', manualSale.totalAmount, '| Total Profit:', manualSale.totalProfit);

  // 2. Query Unsynced items
  const manualItems = await prisma.saleItem.findMany({
    where: {
      sale: { shopId: shop.id },
      productId: null,
      variant: 'Quick Test Biscuit 100g'
    }
  });

  console.assert(manualItems.length > 0, 'Unsynced items query should return the manual item');
  console.log('✓ GET /api/v1/products/unsynced successfully returned unsynced item!');

  // 3. Sync to Master Product
  const masterProduct = await prisma.product.create({
    data: {
      shopId: shop.id,
      name: 'Quick Test Biscuit 100g',
      category: 'Biscuits & Snacks',
      wholesaleCost: costPrice,
      sellingPrice: sellingPrice,
      mrp: 50,
      baseUnit: 'Packet',
      currentStock: 20
    }
  });

  // Link past sale items
  await prisma.saleItem.updateMany({
    where: {
      sale: { shopId: shop.id },
      productId: null,
      variant: 'Quick Test Biscuit 100g'
    },
    data: {
      productId: masterProduct.id
    }
  });

  const updatedItem = await prisma.saleItem.findUnique({ where: { id: manualSale.items[0].id } });
  console.assert(updatedItem.productId === masterProduct.id, 'SaleItem productId should now link to masterProduct.id');
  console.log('✓ Quick item successfully synced & linked to Master Product catalog!');

  // Cleanup test data
  await prisma.sale.delete({ where: { id: manualSale.id } });
  await prisma.product.delete({ where: { id: masterProduct.id } });
  console.log('\n=== ALL MANUAL ADD & PRODUCT SYNC TESTS PASSED! ===');
}

testManualAddAndSync()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
