import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';
import { buildMillInvoiceData } from '@/lib/millInvoice';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);
  const url = new URL(req.url);
  const entityType = url.searchParams.get('entityType'); // 'customer' or 'supplier'
  const entityId = url.searchParams.get('entityId');
  const fromRaw = url.searchParams.get('from');
  const toRaw = url.searchParams.get('to');

  if (!entityType || !entityId) {
    throw new ApiError(400, 'Missing entityType or entityId');
  }

  const from = fromRaw ? new Date(fromRaw) : null;
  const to = toRaw ? new Date(toRaw) : null;
  if (to) to.setHours(23, 59, 59, 999);
  const dateFilter = (field: 'created_at' | 'createdAt') =>
    from || to ? { [field]: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};

  if (entityType === 'customer' || entityType === 'party') {
    // Fetch every Sale ever billed to this customer (not just the ones a
    // bill_number in `ledger` already points at) — needed below to backfill
    // history for bills paid in FULL at billing time, which never get a
    // customer_transactions row at all (see the outstandingAmount>0 gate in
    // app/api/v1/billing/route.ts) and would otherwise be invisible here
    // even though a real sale happened. Doubles as the existing GST/items
    // enrichment join, batched into one query instead of N+1 per row.
    const [ledger, sales, customerDocs] = await Promise.all([
      prisma.customer_transactions.findMany({
        where: { customer_id: entityId, customers: { shopId: shop.id }, ...dateFilter('created_at') },
        orderBy: { created_at: 'desc' },
      }),
      prisma.sale.findMany({
        where: { shopId: shop.id, customerId: entityId, ...dateFilter('createdAt') },
        select: {
          id: true, invoice_number: true, totalAmount: true, amountPaid: true, createdAt: true,
          gstAmount: true, gstDetails: true, billType: true,
          // Mill (mill_v2) bills only — null on every legacy sale. They let the ledger show the stored Mill breakdown
          // instead of applying the legacy inclusive-GST reading to a GST-exclusive bill.
          pricingModel: true, discountAmount: true, charges: true, chargesTotal: true, roundOffAmount: true,
          // paymentType + paymentDetails power the "How this bill was paid"
          // block in TransactionDetailModal — same shape the return-refund
          // attribution and the AddBill "This return will…" preview use.
          paymentType: true, paymentDetails: true,
          items: {
            select: {
              itemName: true, quantity: true, pricePerUnit: true, marginPerUnit: true, productId: true, variant: true,
              product: { select: { name: true } },
            },
          },
        },
      }),
      prisma.customer.findFirst({ where: { id: entityId, shopId: shop.id }, select: { documents: true } }),
    ]);
    // Bill photos attached via AddBillModal — a flat JSON array on the
    // customer row (same convention as Supplier.documents), each entry
    // tagged with the customer_transactions.id it belongs to so it can be
    // shown inline on its own ledger row instead of a generic unlinked pile.
    const docsByTxId = new Map<string, { id: string; url: string; uploadedAt: string }[]>();
    for (const d of (Array.isArray(customerDocs?.documents) ? (customerDocs!.documents as any[]) : [])) {
      if (!d?.transactionId) continue;
      const list = docsByTxId.get(d.transactionId) || [];
      list.push({ id: d.id, url: d.url, uploadedAt: d.uploadedAt });
      docsByTxId.set(d.transactionId, list);
    }
    const saleByInvoice = new Map(sales.map((s) => [s.invoice_number, s]));

    // A bill only gets a real 'udhar' customer_transactions row when it left
    // something outstanding. For any sale that doesn't have one, the WHOLE
    // amount was collected at billing time — synthesize a 'sale' row for it
    // so it shows up in history instead of vanishing. Skipped for bills that
    // DO have a real udhar row (any remaining balance) so a partially-paid
    // bill isn't shown twice — the existing udhar entry already covers it.
    const udharBillNumbers = new Set(
      ledger.filter((t) => t.type === 'udhar' && t.bill_number).map((t) => t.bill_number)
    );
    const paidInFullEntries = sales
      .filter((s) => !udharBillNumbers.has(s.invoice_number) && ((Number(s.totalAmount) || 0) - (Number(s.amountPaid) || 0)) <= 0)
      .map((s) => ({
        id: `sale-${s.id}`,
        customer_id: entityId,
        type: 'sale',
        amount: s.totalAmount,
        note: `Bill: ${s.invoice_number}`,
        bill_number: s.invoice_number,
        created_at: s.createdAt,
      }));

    const combined = [...ledger, ...paidInFullEntries].sort(
      (a, b) => new Date(b.created_at as any).getTime() - new Date(a.created_at as any).getTime()
    );

    // Cost price for the profit-per-product export: SaleItem only persists
    // marginPerUnit (₹ profit already computed at billing time, correctly
    // GST/discount-adjusted — see lib/financialEngine.ts) and pricePerUnit
    // (the pre-discount quoted price) — it never stores the cost price that
    // was actually used, so it can't be recovered exactly for a historical
    // bill. Falling back to the product's CURRENT costPrice is the same
    // convention lib/profitCalc.ts already uses everywhere else in the app
    // (Products table/modal/detail sheet) — it may drift from the true cost
    // on the day this specific bill was made if that product's cost has
    // since changed, but marginPerUnit itself (the ₹ amount) is always the
    // real, historically-accurate figure regardless.
    const productIds = Array.from(new Set(
      sales.flatMap((s) => s.items.map((i) => i.productId)).filter((id): id is string => !!id)
    ));
    const products = productIds.length > 0
      ? await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, costPrice: true, mrp: true, purchaseDiscountPercent: true } })
      : [];
    const costById = new Map(products.map((p) => [p.id, p.costPrice]));
    const mrpById = new Map(products.map((p) => [p.id, p.mrp]));
    const purchasePercentById = new Map(products.map((p) => [p.id, p.purchaseDiscountPercent]));

    const enriched = combined.map((t) => {
      const sale = t.bill_number ? saleByInvoice.get(t.bill_number) : undefined;
      const isGstBill = sale?.billType === 'gst';
      // GstBreakdown (lib/gst.ts) has no single top-level rate — a bill can mix
      // items across GST slabs, so the real rate(s) live per-entry in `groups`.
      // Most bills have exactly one group (one uniform rate); joining handles
      // the rarer mixed-rate case without fabricating a misleading blended %.
      const groups: { rate: number }[] = Array.isArray((sale?.gstDetails as any)?.groups)
        ? (sale!.gstDetails as any).groups
        : [];
      const gstPercent = isGstBill && groups.length > 0
        ? groups.map((g) => g.rate).join(', ')
        : null;

      const items = (sale?.items || []).map((i) => {
        const costPrice = i.productId ? Number(costById.get(i.productId)) || 0 : 0;
        const marginPerUnit = Number(i.marginPerUnit) || 0;
        return {
          name: i.product?.name || i.itemName || i.variant || 'Unknown Product',
          quantity: Number(i.quantity) || 0,
          sellingPrice: Number(i.pricePerUnit) || 0,
          costPrice,
          // Same "current product state, not a historical snapshot" caveat
          // as costPrice above — these reflect the product's setting today.
          mrp: i.productId ? mrpById.get(i.productId) ?? null : null,
          purchaseDiscountPercent: i.productId ? purchasePercentById.get(i.productId) ?? null : null,
          profitPerUnit: marginPerUnit,
          profitPercent: costPrice > 0 ? Math.round((marginPerUnit / costPrice) * 100 * 10) / 10 : null,
        };
      });

      // Per-bill money breakdown — total, paid so far, remaining Udhar,
      // and the payment-mode split (Cash / UPI / Card) when the bill was
      // Split. Same shape TransactionDetailModal and the Add-Bill preview
      // already expect. Null when the row isn't tied to a Sale (payment/
      // opening-balance/refund rows).
      const saleTotalAmount = sale ? Number(sale.totalAmount) || 0 : null;
      const saleAmountPaid = sale ? Number(sale.amountPaid) || 0 : null;
      const outstandingAmount = saleTotalAmount !== null && saleAmountPaid !== null
        ? Math.max(0, saleTotalAmount - saleAmountPaid)
        : null;

      // Mill bill: the stored breakdown (same builder the Mill invoice uses — no legacy inclusive-GST maths).
      let mill: any = null;
      if (sale && (sale as any).pricingModel === 'mill_v2') {
        const d = buildMillInvoiceData({
          invoice_number: sale.invoice_number, bill_type: sale.billType, total_amount: sale.totalAmount, amount_paid: sale.amountPaid,
          payment_type: sale.paymentType, payment_details: sale.paymentDetails, pricing_model: 'mill_v2',
          discount_amount: (sale as any).discountAmount, charges: (sale as any).charges, charges_total: (sale as any).chargesTotal,
          round_off_amount: (sale as any).roundOffAmount, gst_details: sale.gstDetails,
          items: sale.items.map((i) => ({ name: i.product?.name || i.itemName || '', quantity: i.quantity, price_per_unit: i.pricePerUnit })),
        }, {}, '');
        const r = (p: number) => p / 100;
        mill = {
          goods: r(d.goodsPaise), discount: r(d.discountPaise), taxable: r(d.taxablePaise),
          gstBilled: d.gstBilled, interState: d.interState, cgst: r(d.cgstPaise), sgst: r(d.sgstPaise), igst: r(d.igstPaise), totalGst: r(d.totalGstPaise),
          charges: Object.fromEntries(Object.entries(d.charges).map(([k, v]) => [k, r(v as number)])), chargesTotal: r(d.chargesTotalPaise),
          roundOff: r(d.roundOffPaise), grand: r(d.grandPaise), paid: r(d.paidPaise), balance: r(d.balancePaise),
          consistent: d.consistent, problems: d.problems,
        };
      }

      return {
        ...t,
        pricingModel: mill ? 'mill_v2' : null,
        saleId: sale?.id ?? null,
        mill,
        gstPercent,
        gstAmount: isGstBill ? Number(sale?.gstAmount) || 0 : null,
        items,
        documents: docsByTxId.get(t.id) || [],
        // The bill money breakdown — nulls on non-sale rows (payments etc).
        saleTotalAmount,
        saleAmountPaid,
        outstandingAmount,
        paymentType: sale?.paymentType || null,
        paymentDetails: sale?.paymentDetails ?? null,
      };
    });

    return json(enriched);
  } else if (entityType === 'supplier') {
    const ledger = await prisma.supplierTransaction.findMany({
      where: { supplierId: entityId, supplier: { shopId: shop.id }, ...dateFilter('createdAt') },
      orderBy: { createdAt: 'desc' },
    });
    return json(ledger);
  } else {
    throw new ApiError(400, 'Invalid entityType');
  }
});
