import { NextResponse } from 'next/server';
import { requireShop } from '@/lib/server/auth';
import prisma from '@/lib/server/prisma';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await requireShop(req);
    


    const data = await req.json();

    const supplier = await prisma.supplier.findUnique({
      where: { id, shopId: auth.shop.id },
    });

    if (!supplier) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
    }

    // Use ts-ignore temporarily for new fields in case prisma client is not regenerated yet
    // @ts-ignore
    const updated = await prisma.supplier.update({
      where: { id },
      data: {
        name: data.name !== undefined ? data.name : supplier.name,
        contact: data.contact !== undefined ? data.contact : supplier.contact,
        mobile: data.mobile !== undefined ? data.mobile : (supplier as any).mobile,
        email: data.email !== undefined ? data.email : (supplier as any).email,
        address: data.address !== undefined ? data.address : (supplier as any).address,
        gst: data.gst !== undefined ? data.gst : supplier.gst,
        balance: data.balance !== undefined ? parseFloat(data.balance) : (supplier as any).balance,
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('[API] Error updating supplier:', error);
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await requireShop(req);



    await prisma.supplier.delete({
      where: { id, shopId: auth.shop.id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API] Error deleting supplier:', error);
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
