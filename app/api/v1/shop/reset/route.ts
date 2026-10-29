import { NextRequest, NextResponse } from 'next/server';
import { requireShop } from '@/lib/server/auth';
import prisma from '@/lib/server/prisma';
import { isMillBillingPackage } from '@/lib/config/packageConfig';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/shop/reset
 * Deletes ALL business data for the current shop.
 * Shop profile, subscription and user account are untouched.
 * Body: { confirmText: "RESET" }
 */
export async function POST(req: NextRequest) {
  let shop: Awaited<ReturnType<typeof requireShop>>['shop'];
  try {
    ({ shop } = await requireShop(req));
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  if (body.confirmText !== 'RESET') {
    return NextResponse.json({ error: 'Confirmation text mismatch' }, { status: 400 });
  }

  const shopId = shop.id;
  const isMill = isMillBillingPackage(shop.packageType);

  try {
    // Use raw SQL inside a transaction to delete in dependency order.
    // NoAction FK tables (sale_items, purchase_items, etc.) are deleted first;
    // Cascade FK tables (delivery_challan_items, etc.) are handled automatically.
    await prisma.$transaction(async (tx) => {
      // ── Milling-only tables (skip for non-mill packages) ───────────────────
      if (isMill) {
        await tx.$executeRaw`
          DELETE FROM batch_stage_execution_fields
          WHERE batch_stage_id IN (
            SELECT bs.id FROM batch_stages bs
            JOIN production_batches pb ON pb.id = bs.batch_id
            WHERE pb.shop_id = ${shopId}::uuid
          )`;

        await tx.$executeRaw`
          DELETE FROM batch_stage_inputs
          WHERE batch_stage_snapshot_id IN (
            SELECT bss.id FROM batch_stage_snapshots bss
            JOIN batch_workflow_snapshots bws ON bws.id = bss.batch_workflow_snapshot_id
            JOIN production_batches pb ON pb.id = bws.production_batch_id
            WHERE pb.shop_id = ${shopId}::uuid
          )`;
        await tx.$executeRaw`
          DELETE FROM batch_stage_outputs
          WHERE batch_stage_snapshot_id IN (
            SELECT bss.id FROM batch_stage_snapshots bss
            JOIN batch_workflow_snapshots bws ON bws.id = bss.batch_workflow_snapshot_id
            JOIN production_batches pb ON pb.id = bws.production_batch_id
            WHERE pb.shop_id = ${shopId}::uuid
          )`;
        await tx.$executeRaw`
          DELETE FROM batch_stage_quality_parameters
          WHERE batch_stage_snapshot_id IN (
            SELECT bss.id FROM batch_stage_snapshots bss
            JOIN batch_workflow_snapshots bws ON bws.id = bss.batch_workflow_snapshot_id
            JOIN production_batches pb ON pb.id = bws.production_batch_id
            WHERE pb.shop_id = ${shopId}::uuid
          )`;
        await tx.$executeRaw`
          DELETE FROM batch_stage_snapshots
          WHERE batch_workflow_snapshot_id IN (
            SELECT bws.id FROM batch_workflow_snapshots bws
            JOIN production_batches pb ON pb.id = bws.production_batch_id
            WHERE pb.shop_id = ${shopId}::uuid
          )`;
        await tx.$executeRaw`
          DELETE FROM batch_workflow_snapshots
          WHERE production_batch_id IN (SELECT id FROM production_batches WHERE shop_id = ${shopId}::uuid)`;

        await tx.$executeRaw`
          DELETE FROM batch_stages
          WHERE batch_id IN (SELECT id FROM production_batches WHERE shop_id = ${shopId}::uuid)`;

        // Milling lots that reference production_batches
        await tx.batchInputLot.deleteMany({ where: { shopId } });
        await tx.wipLot.deleteMany({ where: { shopId } });
        await tx.finishedGoodsLot.deleteMany({ where: { shopId } });
        await tx.byProductLot.deleteMany({ where: { shopId } });
        await tx.rejectionLot.deleteMany({ where: { shopId } });
        await tx.productionOutput.deleteMany({ where: { shopId } });
        await tx.qualityTest.deleteMany({ where: { shopId } });
        await tx.productionBatch.deleteMany({ where: { shopId } });
        await tx.rawMaterialLot.deleteMany({ where: { shopId } });

        // Mill operational logs
        await tx.gateEntry.deleteMany({ where: { shopId } });
        await tx.weighbridgeEntry.deleteMany({ where: { shopId } });
        await tx.freightEntry.deleteMany({ where: { shopId } });
        await tx.dispatchEntry.deleteMany({ where: { shopId } });
        await tx.jobWorkOrder.deleteMany({ where: { shopId } });
        await tx.commissionEntry.deleteMany({ where: { shopId } });

        // Machines & maintenance
        await tx.sparePartMovement.deleteMany({ where: { shopId } });
        await tx.sparePart.deleteMany({ where: { shopId } });
        await tx.machineDowntime.deleteMany({ where: { shopId } });
        await tx.maintenanceEntry.deleteMany({ where: { shopId } });
        await tx.machine.deleteMany({ where: { shopId } });
      }

      // ── Sales hierarchy ────────────────────────────────────────────────────
      await tx.$executeRaw`
        DELETE FROM sale_item_batches
        WHERE sale_item_id IN (
          SELECT si.id FROM sale_items si
          JOIN sales s ON s.id = si.sale_id
          WHERE s.shop_id = ${shopId}::uuid
        )`;
      await tx.$executeRaw`
        DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE shop_id = ${shopId}::uuid)`;
      await tx.paymentTransaction.deleteMany({ where: { shopId } });
      // delivery_challan_items cascade from delivery_challans
      await tx.deliveryChallan.deleteMany({ where: { shopId } });
      // return_items cascade from material_returns
      await tx.materialReturn.deleteMany({ where: { shopId } });
      await tx.sale.deleteMany({ where: { shopId } });

      // ── Orders ─────────────────────────────────────────────────────────────
      // Must run before BOTH Supplier (below) and Customer (further down) —
      // Order.supplierId and Order.customerId are both onDelete: NoAction
      // (orders_supplier_id_fkey / orders_customer_id_fkey), so a supplier
      // or customer with orders still attached can't be deleted first.
      await tx.$executeRaw`
        DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE shop_id = ${shopId}::uuid)`;
      await tx.order.deleteMany({ where: { shopId } });

      // ── Purchases ──────────────────────────────────────────────────────────
      // purchase_returns cascade from purchase_invoices (purchase_invoice_id FK, onDelete: Cascade)
      // purchase_return_items cascade from purchase_returns (onDelete: Cascade)
      // purchase_items cascade from purchase_invoices (onDelete: Cascade)
      await tx.purchaseInvoice.deleteMany({ where: { shopId } });
      await tx.$executeRaw`DELETE FROM supplier_transactions WHERE supplier_id IN (SELECT id FROM suppliers WHERE shop_id = ${shopId}::uuid)`;
      await tx.supplier.deleteMany({ where: { shopId } });

      // ── Customers / parties & udhar ────────────────────────────────────────
      // Expense.partyId is also onDelete: NoAction (expenses_party_id_fkey) —
      // same reason, must run before the Customer delete.
      await tx.expense.deleteMany({ where: { shopId } });
      await tx.$executeRaw`
        DELETE FROM collection_entries
        WHERE sheet_id IN (SELECT id FROM collection_sheets WHERE shop_id = ${shopId}::uuid)`;
      await tx.collectionSheet.deleteMany({ where: { shopId } });
      // customer_transactions has no shopId — delete via customer FK
      await tx.$executeRaw`
        DELETE FROM customer_transactions
        WHERE customer_id IN (SELECT id FROM customers WHERE shop_id = ${shopId}::uuid)`;
      await tx.customer.deleteMany({ where: { shopId } });

      // ── Stock ──────────────────────────────────────────────────────────────
      await tx.$executeRaw`
        DELETE FROM stock_take_items
        WHERE session_id IN (SELECT id FROM stock_take_sessions WHERE shop_id = ${shopId}::uuid)`;
      await tx.stockTakeSession.deleteMany({ where: { shopId } });
      await tx.stockLog.deleteMany({ where: { shopId } });
      await tx.stockMovement.deleteMany({ where: { shopId } });
      await tx.dailyStockEntry.deleteMany({ where: { shopId } });

      // ── Products ──────────────────────────────────────────────────────────
      await tx.$executeRaw`
        DELETE FROM godown_products
        WHERE godown_id IN (SELECT id FROM godowns WHERE shop_id = ${shopId}::uuid)`;
      await tx.godown.deleteMany({ where: { shopId } });
      // product_variants cascade from product if CASCADE is set; if not, delete first
      await tx.$executeRaw`
        DELETE FROM product_variants WHERE product_id IN (SELECT id FROM products WHERE shop_id = ${shopId}::uuid)`;
      await tx.byProduct.deleteMany({ where: { shopId } });
      await tx.batch.deleteMany({ where: { shopId } });
      await tx.product.deleteMany({ where: { shopId } });

      // ── Staff ─────────────────────────────────────────────────────────────
      await tx.$executeRaw`
        DELETE FROM salary_revisions WHERE staff_id IN (SELECT id FROM staff WHERE shop_id = ${shopId}::uuid)`;
      await tx.$executeRaw`
        DELETE FROM attendance WHERE staff_id IN (SELECT id FROM staff WHERE shop_id = ${shopId}::uuid)`;
      await tx.$executeRaw`
        DELETE FROM salary_payments WHERE staff_id IN (SELECT id FROM staff WHERE shop_id = ${shopId}::uuid)`;
      await tx.$executeRaw`DELETE FROM advance_salaries WHERE staff_id IN (SELECT id FROM staff WHERE shop_id = ${shopId}::uuid)`;
      await tx.staff.deleteMany({ where: { shopId } });

      // ── Financials & logs ─────────────────────────────────────────────────
      // Expense is deleted earlier, before Customer (see above).
      await tx.cashBook.deleteMany({ where: { shopId } });
      await tx.dailyClosing.deleteMany({ where: { shopId } });
      await tx.dailyRegisterLog.deleteMany({ where: { shopId } });
      await tx.importLog.deleteMany({ where: { shopId } });
      await tx.activityLog.deleteMany({ where: { shopId } });
      await tx.syncRecord.deleteMany({ where: { shopId } });
      await tx.deletedRecord.deleteMany({ where: { shopId } });
      await tx.calendarEvent.deleteMany({ where: { shopId } });

    }, { maxWait: 60000, timeout: 300000 });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Shop reset failed:', err);
    return NextResponse.json({ error: 'Reset failed: ' + (err?.message || 'Unknown error') }, { status: 500 });
  }
}
