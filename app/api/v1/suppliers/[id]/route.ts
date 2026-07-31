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
        creditLimit: data.creditLimit !== undefined ? (parseFloat(data.creditLimit) || 0) : (supplier as any).creditLimit,
        creditDays: data.creditDays !== undefined ? (parseInt(data.creditDays) || 0) : (supplier as any).creditDays,
        documents: data.documents !== undefined ? data.documents : (supplier as any).documents,
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

    // If ?cascade=true is passed, wipe the supplier's transaction/purchase
    // history first — the FK relations use onDelete: NoAction, so a plain
    // delete throws P2003 whenever anything references the row. Callers that
    // don't opt into cascade get a friendly 409 explaining the block and how
    // many rows are in the way, so they can decide whether to purge or keep.
    const url = new URL(req.url);
    const cascade = url.searchParams.get('cascade') === 'true';

    const [txnCount, invoiceCount] = await Promise.all([
      prisma.supplierTransaction.count({ where: { supplierId: id } }),
      prisma.purchaseInvoice.count({ where: { supplierId: id } }),
    ]);
    const linked = txnCount + invoiceCount;

    if (linked > 0 && !cascade) {
      return NextResponse.json(
        {
          error: `This supplier has ${txnCount} transaction${txnCount === 1 ? '' : 's'}${invoiceCount ? ` and ${invoiceCount} purchase invoice${invoiceCount === 1 ? '' : 's'}` : ''}. Delete those first, or confirm to remove everything.`,
          code: 'HAS_HISTORY',
          txnCount,
          invoiceCount,
        },
        { status: 409 }
      );
    }

    if (cascade && linked > 0) {
      // Ordered inside a transaction so a mid-way failure doesn't half-delete.
      await prisma.$transaction([
        prisma.supplierTransaction.deleteMany({ where: { supplierId: id } }),
        prisma.purchaseInvoice.deleteMany({ where: { supplierId: id } }),
        prisma.supplier.delete({ where: { id, shopId: auth.shop.id } }),
      ]);
    } else {
      await prisma.supplier.delete({ where: { id, shopId: auth.shop.id } });
    }

    return NextResponse.json({ success: true, cascaded: cascade && linked > 0, purged: linked });
  } catch (error: any) {
    console.error('[API] Error deleting supplier:', error);
    // Catch-all safety net so a raw Prisma error message never reaches the UI.
    const message = error?.code === 'P2003'
      ? 'This supplier is linked to other records and cannot be deleted directly. Confirm to remove all its history.'
      : (error?.message || 'Failed to delete supplier.');
    return NextResponse.json({ error: message, code: error?.code }, { status: error?.status || 500 });
  }
}
