import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function test() {
  try {
    // We'll just try to fetch a shop to get a valid shopId
    const shop = await prisma.shop.findFirst();
    if (!shop) {
      console.log("No shop found");
      return;
    }

    console.log("Creating supplier for shop:", shop.id);
    
    // First let's ensure the table is updated just in case the API didn't do it
    await prisma.$executeRawUnsafe(`ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS mobile VARCHAR`);
    await prisma.$executeRawUnsafe(`ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS email VARCHAR`);
    await prisma.$executeRawUnsafe(`ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS address VARCHAR`);
    await prisma.$executeRawUnsafe(`ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS balance DOUBLE PRECISION DEFAULT 0`);
    
    const supplier = await prisma.supplier.create({
      data: {
        shopId: shop.id,
        name: 'Test Supplier from Script',
        contact: '1234567890',
        mobile: '1234567890',
        email: 'test@example.com',
        address: '123 Test St',
        gst: 'GST123',
        balance: 0,
      }
    });
    
    console.log("Supplier created successfully:", supplier);
    
    // Clean up
    await prisma.supplier.delete({ where: { id: supplier.id } });
    console.log("Test supplier cleaned up.");
    
  } catch (err) {
    console.error("Error creating supplier:", err);
  } finally {
    await prisma.$disconnect();
  }
}

test();
