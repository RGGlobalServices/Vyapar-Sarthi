import { NextResponse } from 'next/server';
import { requireShop } from '@/lib/server/auth';
import prisma from '@/lib/server/prisma';
import { ensureWholesaleTables } from '@/lib/server/wholesale';

export async function GET(req: Request) {
  try {
    const auth = await requireShop(req);
    await ensureWholesaleTables();

    // Only allow wholesale (udyog) plan users to access these routes, or all plans if backward compat requires it?
    // The instruction says "this changes want for only Udyog plan other two plan keep same dont change there"
    // So we can enforce it.


    const suppliers = await prisma.supplier.findMany({
      where: { shopId: auth.shop.id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(suppliers);
  } catch (error: any) {
    console.error('[API] Error fetching suppliers:', error);
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireShop(req);
    await ensureWholesaleTables();



    const data = await req.json();

    if (!data.name) {
      return NextResponse.json({ error: 'Supplier name is required' }, { status: 400 });
    }

    const newSupplier = await prisma.supplier.create({
      data: {
        shopId: auth.shop.id,
        name: data.name,
        contact: data.contact || null,
        mobile: data.mobile || null,
        email: data.email || null,
        address: data.address || null,
        gst: data.gst || null,
        balance: data.balance ? parseFloat(data.balance) : 0,
      },
    });

    return NextResponse.json(newSupplier);
  } catch (error: any) {
    console.error('[API] Error creating supplier:', error);
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
