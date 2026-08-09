import prisma from '@/lib/server/prisma';
import { requireAdmin } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// Restoring means re-creating each row from its own snapshot with its
// original id, so anything that referenced it (an order, a bill line) that
// itself survived points at a real row again. Rows whose snapshot references
// something that's gone too (e.g. a purchase item's product) are skipped
// individually and reported back, rather than failing the whole restore.
export const POST = handle<Ctx>(async (req, { params }) => {
  await requireAdmin(req);
  const { id } = await params;

  const record = await prisma.deletedRecord.findUnique({ where: { id } });
  if (!record) throw new ApiError(404, 'Deleted record not found');
  if (record.restoredAt) throw new ApiError(400, 'This record was already restored');

  const data = record.data as any;
  const skipped: string[] = [];

  switch (record.entityType) {
    case 'product': {
      const existing = await prisma.product.findUnique({ where: { id: record.entityId } });
      if (existing) throw new ApiError(409, 'A product with this ID already exists — it may have been restored or re-created already.');
      await prisma.product.create({ data });
      break;
    }

    case 'staff': {
      const { staff, attendance, salaryPayments, advanceSalaries } = data;
      const existing = await prisma.staff.findUnique({ where: { id: record.entityId } });
      if (existing) throw new ApiError(409, 'A staff member with this ID already exists — it may have been restored already.');
      await prisma.staff.create({ data: staff });
      for (const a of attendance || []) {
        try { await prisma.attendance.create({ data: a }); } catch { skipped.push(`attendance ${a.date}`); }
      }
      for (const s of salaryPayments || []) {
        try { await prisma.salaryPayment.create({ data: s }); } catch { skipped.push(`salary payment ${s.id}`); }
      }
      for (const adv of advanceSalaries || []) {
        try { await prisma.advanceSalary.create({ data: adv }); } catch { skipped.push(`advance ${adv.id}`); }
      }
      break;
    }

    case 'supplier': {
      const { supplier, supplierTransactions, purchaseInvoices } = data;
      const existing = await prisma.supplier.findUnique({ where: { id: record.entityId } });
      if (existing) throw new ApiError(409, 'A supplier with this ID already exists — it may have been restored already.');
      await prisma.supplier.create({ data: supplier });
      for (const t of supplierTransactions || []) {
        try { await prisma.supplierTransaction.create({ data: t }); } catch { skipped.push(`transaction ${t.id}`); }
      }
      for (const inv of purchaseInvoices || []) {
        const { purchaseItems, ...invoiceFields } = inv;
        try {
          await prisma.purchaseInvoice.create({ data: invoiceFields });
        } catch {
          skipped.push(`purchase invoice ${inv.invoiceNumber || inv.id}`);
          continue;
        }
        for (const item of purchaseItems || []) {
          try { await prisma.purchaseItem.create({ data: item }); }
          catch { skipped.push(`purchase item on invoice ${inv.invoiceNumber || inv.id} (product may no longer exist)`); }
        }
      }
      break;
    }

    case 'customer': {
      // Customers are never actually destroyed — the row is still there,
      // just tagged `archived_<type>`. Restoring means stripping that prefix.
      const customer = await prisma.customer.findUnique({ where: { id: record.entityId } });
      if (!customer) throw new ApiError(404, 'The customer row no longer exists — it may have been hard-deleted through another path.');
      const restoredType = (customer.customerType || '').startsWith('archived_')
        ? customer.customerType!.slice('archived_'.length)
        : (customer.customerType || 'customer');
      await prisma.customer.update({ where: { id: record.entityId }, data: { customerType: restoredType } });
      break;
    }

    default:
      throw new ApiError(400, `Unknown entity type: ${record.entityType}`);
  }

  await prisma.deletedRecord.update({ where: { id }, data: { restoredAt: new Date() } });

  return json({ success: true, skipped });
});
