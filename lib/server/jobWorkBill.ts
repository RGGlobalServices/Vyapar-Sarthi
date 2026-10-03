/**
 * The bill of a completed Job Work order (Billing -> Invoices, marked "Job Work"). Its number comes from the order number so it is clear
 * where the bill came from: order JW-20261003-001 -> bill JWB-20261003-001.
 */

/**
 * `existingOnly` = false: the number a NEW bill for this order should get (the base number, or base-2, base-3 … if it is taken).
 * `existingOnly` = true : the number of the bill already made for this order (or the base number when none exists yet).
 */
export async function jobWorkBillNumber(db: any, shopId: string, orderNumber: string, existingOnly = false): Promise<string> {
  const base = `JWB-${String(orderNumber).replace(/^JW-?/i, '') || orderNumber}`.slice(0, 60);
  if (existingOnly) {
    const rows: Array<{ invoice_number: string }> = await db.$queryRawUnsafe(
      `SELECT invoice_number FROM sales WHERE shop_id = $1::uuid AND invoice_number LIKE $2 AND payment_details->>'source' = 'job_work' AND payment_details->>'orderNumber' = $3 ORDER BY created_at DESC LIMIT 1`,
      shopId, `${base}%`, orderNumber,
    );
    return rows[0]?.invoice_number || base;
  }
  const taken: Array<{ invoice_number: string }> = await db.$queryRawUnsafe(`SELECT invoice_number FROM sales WHERE invoice_number LIKE $1`, `${base}%`);
  const used = new Set(taken.map((r) => r.invoice_number));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
