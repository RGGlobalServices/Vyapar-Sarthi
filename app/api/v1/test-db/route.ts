import prisma from '@/lib/server/prisma';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const shop = await prisma.shop.findFirst({ where: { subscriptionPlan: 'wholesale' } });
    if (!shop) return NextResponse.json({ error: 'No shop' });

    const ownerId = shop.ownerId || '00000000-0000-0000-0000-000000000000';
    const godownCode = 'TEST-' + Date.now();
    
    // Check if table exists
    const tableExists = await prisma.$queryRawUnsafe(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE  table_schema = 'public'
        AND    table_name   = 'godowns'
      );
    `);

    const rows = await prisma.$queryRaw`
      INSERT INTO godowns (shop_id, owner_id, name, location, godown_code)
      VALUES (${shop.id}::uuid, ${ownerId}::uuid, 'Test', null::varchar, ${godownCode})
      RETURNING *
    `;
    
    // Cleanup
    await prisma.$executeRawUnsafe(`DELETE FROM godowns WHERE godown_code = '${godownCode}'`);
    
    return NextResponse.json({ success: true, tableExists, rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
}
