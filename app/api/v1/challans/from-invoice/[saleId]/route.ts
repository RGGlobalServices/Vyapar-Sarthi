import { NextResponse } from 'next/server';
import { requireShop } from '@/lib/server/auth';
import { isMillBillingPackage } from '@/lib/config/packageConfig';
import { remainingForSale } from '@/lib/server/challanFromInvoice';

/**
 * GET /api/v1/challans/from-invoice/[saleId] — Bada Udyog: what a bill still has to deliver, to prefill a "challan from invoice".
 * { saleId, invoiceNumber, customer, items: [{ productId, name, unit, price, billedQty, alreadyQty, remainingQty }] }
 */
export async function GET(req: Request, ctx: any) {
  try {
    const { shop } = await requireShop(req);
    if (!isMillBillingPackage((shop as any).packageType)) return NextResponse.json({ error: 'A challan from an invoice is a Bada Udyog feature.' }, { status: 403 });
    const { saleId } = await ctx.params;
    const { sale, lines } = await remainingForSale(shop.id, saleId);
    return NextResponse.json({ saleId: sale.id, invoiceNumber: sale.invoice_number, customer: sale.customer, items: lines });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load the invoice' }, { status: err?.status || 500 });
  }
}
