/**
 * SupplierTransaction / customer_transactions rows are typed by a free-text
 * `type` string, and every FIFO "which bills are still open" replay (Ageing
 * reports, the supplier/party detail pages' Due Invoices figure, and the
 * balance-delta on transaction delete) needs to agree on which types REDUCE
 * what's owed versus which ADD to it. Historically only 'payment' was
 * treated as a reduction — 'purchase_return' (added this session) and
 * 'refund' (sales returns) are equally real reductions and were being
 * silently counted as NEW debts, inflating Due Invoices / Overdue Amount /
 * Total Purchased. Centralized here so every reader (and the Phase 2 Ageing
 * reports built on top of them) can't drift out of sync again.
 */

/** SupplierTransaction types that reduce what the shop owes a supplier. */
export function isSupplierCredit(type: string | null | undefined): boolean {
  return type === 'payment' || type === 'purchase_return';
}

/** customer_transactions types that reduce what a customer/party owes the shop. */
export function isCustomerCredit(type: string | null | undefined): boolean {
  return type === 'payment' || type === 'refund';
}
