import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { isMillBillingPackage } from '@/lib/config/packageConfig';
import { tagRows } from '@/lib/server/billTags';
import { normalizeMillBill, freightMismatch } from '@/lib/millBill';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/mill/purchase-extras — Bada Udyog only.
 *
 * Called right after a purchase bill has been imported. A mill's purchase bill (grain merchant bill + motor challan) carries more
 * than the goods: the truck, the driver, the freight and the hamali. This turns those into the mill's own records — all in ONE
 * transaction, so either everything is created or nothing is:
 *   - Gate Entry (inward): vehicle, driver, supplier, material, hamali (+ the Hamali expense, same as a hand-made gate entry)
 *   - Freight: the transporter's running account — a 'charge' for the total freight and, when an advance was paid, a 'payment' for it
 *   - Raw material lots: one lot per purchased line (stock was already counted by the purchase, so it is NOT counted again)
 * The purchase itself is not touched. Running it twice does not duplicate anything: every record carries a [PUR <invoice id>] marker.
 *
 *   body: { supplierId, invoiceNumber? (else the supplier's newest bill of the last 30 min), millBill, options?: { gateEntry, freight, lots, advancePaidBy: 'seller' | 'mill' | 'skip' } }
 */
export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  if (!isMillBillingPackage((shop as any).packageType)) throw new ApiError(403, 'Mill purchase details are a Bada Udyog feature.', 'NOT_MILL_SHOP');
  const body = await readBody<any>(req);

  const supplierId = String(body.supplierId ?? '').trim();
  const givenInvoiceNumber = String(body.invoiceNumber ?? '').trim();
  if (!supplierId) throw new ApiError(400, 'supplierId is required.', 'INVOICE_REQUIRED');

  const mb = normalizeMillBill(body.millBill);
  const o = body.options && typeof body.options === 'object' ? body.options : {};
  const want = { gateEntry: o.gateEntry !== false, freight: o.freight !== false, lots: o.lots !== false };
  const advancePaidBy: 'seller' | 'mill' | 'skip' = o.advancePaidBy === 'mill' ? 'mill' : o.advancePaidBy === 'skip' ? 'skip' : 'seller';
  if (freightMismatch(mb)) throw new ApiError(400, 'Freight total must equal advance + balance.', 'FREIGHT_MISMATCH');

  const invoice = await (prisma as any).purchaseInvoice.findFirst({
    where: { shopId: shop.id, supplierId, ...(givenInvoiceNumber ? { invoiceNumber: givenInvoiceNumber } : { createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) } }) },
    orderBy: { createdAt: 'desc' },
    include: { supplier: { select: { id: true, name: true } }, purchaseItems: { include: { product: { select: { id: true, name: true, baseUnit: true, isRawMaterial: true, millCategory: true } } } } },
  });
  if (!invoice) throw new ApiError(404, 'That purchase bill was not found — import it first.', 'PURCHASE_NOT_FOUND');

  const invoiceNumber = String(invoice.invoiceNumber || givenInvoiceNumber || invoice.id.slice(0, 8));
  const marker = `[PUR ${invoice.id}]`;
  const skipped: string[] = [];

  const result = await prisma.$transaction(async (tx: any) => {
    // two clicks / two tabs at once must not both create the records: one runs, the other waits and then finds them
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', marker);
    // ---------------- Gate Entry ----------------
    let gate: any = null;
    if (want.gateEntry) {
      if (!mb.vehicleNumber) {
        skipped.push('Gate entry: no vehicle number.');
      } else {
        gate = await tx.gateEntry.findFirst({ where: { shopId: shop.id, notes: { contains: marker } } });
        if (!gate) {
          const d = new Date();
          const prefix = `GE-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
          const same = await tx.gateEntry.count({ where: { shopId: shop.id, entryNumber: { startsWith: prefix } } });
          const entryNumber = `${prefix}-${String(same + 1).padStart(3, '0')}`;
          const materials = invoice.purchaseItems.map((i: any) => i.product?.name).filter(Boolean).join(', ');
          const bags = mb.totalBags ? ` · ${mb.totalBags} bags` : '';
          gate = await tx.gateEntry.create({
            data: {
              shopId: shop.id, entryNumber, direction: 'inward', vehicleNumber: mb.vehicleNumber,
              driverName: mb.driverName || null, driverMobile: mb.driverMobile || null,
              supplierId, materialDescription: materials.slice(0, 200) || null, status: 'at_gate',
              notes: `${marker} Purchase bill ${invoiceNumber}${bags}${mb.broker ? ` · Broker ${mb.broker}` : ''}`.slice(0, 250),
              hamaliAmount: mb.hamali && mb.hamali > 0 ? mb.hamali : null,
            },
          });
          if (mb.hamali && mb.hamali > 0) {
            const hx = await tx.expense.create({ data: { shopId: shop.id, category: 'Hamali / Labour', amount: mb.hamali, paymentMode: 'Cash', description: `Hamali - ${entryNumber} (${mb.vehicleNumber}) · Purchase bill ${invoiceNumber}`, date: new Date() } });
            await tagRows(tx, 'expenses', [hx.id], { direction: 'purchase', purchaseInvoiceId: invoice.id });
          }
        }
      }
    }

    // ---------------- Freight ----------------
    let freight: any = null;
    if (want.freight) {
      const total = mb.freightTotal ?? 0;
      if (!(total > 0)) {
        skipped.push('Freight: no freight amount.');
      } else {
        const tName = (mb.transportCompany || mb.truckOwnerName || mb.driverName || (mb.vehicleNumber ? `Truck ${mb.vehicleNumber}` : '')).slice(0, 80);
        if (!tName) {
          skipped.push('Freight: no transporter / truck owner name.');
        } else {
          const already = await tx.freightEntry.findFirst({ where: { shopId: shop.id, note: { contains: marker } } });
          if (!already) {
            let transporter = await tx.customer.findFirst({ where: { shopId: shop.id, customerType: 'transporter', name: { equals: tName, mode: 'insensitive' } } });
            if (!transporter) {
              transporter = await tx.customer.create({ data: { shopId: shop.id, name: tName, mobile: mb.truckOwnerMobile || mb.driverMobile || null, customerType: 'transporter' } as any });
            }
            const fc = await tx.freightEntry.create({
              data: { shopId: shop.id, transporterId: transporter.id, type: 'charge', amount: total, vehicleNumber: mb.vehicleNumber || null, gateEntryId: gate?.id ?? null, note: `${marker} Freight — purchase bill ${invoiceNumber}` },
            });
            await tagRows(tx, 'freight_entries', [fc.id], { direction: 'purchase', purchaseInvoiceId: invoice.id });
            const adv = mb.freightAdvance ?? 0;
            if (adv > 0 && advancePaidBy !== 'skip') {
              const fp = await tx.freightEntry.create({
                data: {
                  shopId: shop.id, transporterId: transporter.id, type: 'payment', amount: adv, vehicleNumber: mb.vehicleNumber || null, gateEntryId: gate?.id ?? null,
                  // an advance the SELLER paid the driver is not a cash movement of the mill; one the mill paid is
                  paymentMethod: advancePaidBy === 'mill' ? 'Cash' : 'Seller',
                  note: `${marker} Advance freight${advancePaidBy === 'seller' ? ' (paid by seller)' : ''} — purchase bill ${invoiceNumber}`,
                },
              });
              await tagRows(tx, 'freight_entries', [fp.id], { direction: 'purchase', purchaseInvoiceId: invoice.id });
              if (advancePaidBy === 'mill') {
                await tx.cashBook.create({ data: { shopId: shop.id, type: 'withdrawal', amount: adv, description: `Freight payment to ${transporter.name}` } });
              }
            }
            freight = { transporterId: transporter.id, transporter: transporter.name, total, advance: adv, advancePaidBy: adv > 0 ? advancePaidBy : null, balance: Math.max(0, total - (advancePaidBy === 'skip' ? 0 : adv)) };
          } else {
            freight = { alreadyRecorded: true };
          }
        }
      }
    }

    // Check once whether purchase_item_id column exists (migration 22 may not have run yet)
    const hasPurchaseItemCol = await (async () => {
      try {
        const r = await tx.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'raw_material_lots' AND column_name = 'purchase_item_id'`;
        return (r[0]?.n ?? 0) > 0;
      } catch { return false; }
    })();

    // ---------------- Raw material lots ----------------
    const lots: any[] = [];
    if (want.lots) {
      let n = 0;
      for (const item of invoice.purchaseItems) {
        n += 1;
        const p = item.product;
        if (!p) { skipped.push(`Lot: a line has no product.`); continue; }
        // Use purchaseItemId dedup only when the column exists; fall back to marker in notes
        const exists = hasPurchaseItemCol
          ? await tx.rawMaterialLot.findFirst({ where: { shopId: shop.id, purchaseItemId: item.id }, select: { id: true } })
          : await tx.rawMaterialLot.findFirst({ where: { shopId: shop.id, notes: { contains: `[PUR ${invoice.id}]` }, productId: p.id }, select: { id: true } });
        if (exists) continue;
        if (p.isRawMaterial !== true) {
          // a product used only as raw material in this mill (no other mill role yet) is marked as raw material; anything else is left alone
          if (!p.millCategory || p.millCategory === 'raw_material') {
            await tx.product.update({ where: { id: p.id }, data: { isRawMaterial: true, millCategory: 'raw_material' } });
          } else {
            skipped.push(`Lot: "${p.name}" is set up as ${p.millCategory}, not raw material — no lot made.`);
            continue;
          }
        }
        const qty = Number(item.quantity) || 0;
        if (qty <= 0) continue;
        const base = invoice.invoiceNumber || invoiceNumber;
        const lotNumber = invoice.purchaseItems.length > 1 ? `${base}-L${n}` : base;
        const dup = await tx.rawMaterialLot.findFirst({ where: { shopId: shop.id, productId: p.id, lotNumber }, select: { id: true } });
        if (dup) { skipped.push(`Lot ${lotNumber}: a lot with this number already exists.`); continue; }
        const lot = await tx.rawMaterialLot.create({
          data: {
            shopId: shop.id, productId: p.id, supplierId, lotNumber, farmerName: null,
            purchaseDate: invoice.date || new Date(), quantity: qty, unit: p.baseUnit || 'kg',
            ratePerUnit: Number(item.cost) || null, totalAmount: Number(item.cost) > 0 ? Math.round(Number(item.cost) * qty * 100) / 100 : null,
            remainingQuantity: qty,
            ...(hasPurchaseItemCol ? { purchaseItemId: item.id } : {}),
            notes: `Imported from Purchase Invoice ${invoiceNumber}${mb.totalBags && invoice.purchaseItems.length === 1 ? ` · ${mb.totalBags} bags` : ''}${mb.vehicleNumber ? ` · ${mb.vehicleNumber}` : ''} ${marker}`.slice(0, 250),
          },
        });
        lots.push({ id: lot.id, lotNumber, product: p.name, quantity: qty, unit: p.baseUnit || 'kg' });
      }
    }

    // the broker commission the import logged for this bill (kind 'supplier') — link it to the purchase
    const comm = await tx.commissionEntry.findMany({ where: { shopId: shop.id, billNumber: invoiceNumber, note: { startsWith: '[Supplier broker]' } }, select: { id: true } });
    if (comm.length) await tagRows(tx, 'commission_entries', comm.map((c: any) => c.id), { direction: 'purchase', purchaseInvoiceId: invoice.id });

    return { gateEntry: gate ? { id: gate.id, entryNumber: gate.entryNumber, vehicleNumber: gate.vehicleNumber } : null, freight, lots };
  }, { timeout: 60000, maxWait: 15000 });

  return json({ ...result, skipped }, 201);
});
