/**
 * Mill (`pricing_model = "mill_v2"`) invoice data for print / PDF / reprint / WhatsApp.
 *
 * SERVER-AUTHORITATIVE: every figure here is read from the STORED sale (GET /billing/:id). Nothing is recalculated with
 * the legacy billing engine, and nothing is taken from a client cart. The only arithmetic is whole-paise integer
 * bookkeeping needed to *derive* a figure the server did not store as its own column (e.g. Goods Subtotal =
 * Taxable + Discount) — and every derived figure is cross-checked against the stored Grand Total: if the parts do not
 * add up to the stored total, `consistent` is false and the template shows a visible warning instead of a wrong bill.
 */

export const MILL_CHARGE_ORDER = ['freight', 'hamali', 'loading', 'unloading', 'other'] as const;
export type MillChargeName = (typeof MILL_CHARGE_ORDER)[number];

const paise = (n: unknown) => Math.round((Number(n) || 0) * 100);
export const fmtPaise = (p: number) => {
  const neg = p < 0; const a = Math.abs(p);
  const rupees = Math.floor(a / 100); const ps = String(a % 100).padStart(2, '0');
  return `${neg ? '-' : ''}₹${rupees.toLocaleString('en-IN')}.${ps}`;
};

export interface MillInvoiceShop {
  name?: string; address?: string; mobile?: string; gst?: string; pan?: string; email?: string;
  signatureUrl?: string; footer?: string; upiId?: string;
  bankName?: string; bankAccountName?: string; bankAccountNumber?: string; bankIfsc?: string;
}

export interface MillInvoiceLine {
  name: string; batch: string; unit: string; qty: number; ratePaise: number; amountPaise: number;
}
export interface MillTaxRow { rate: number; hsn: string; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number }

export interface MillInvoiceData {
  invoiceNumber: string;
  dateText: string;
  shop: MillInvoiceShop;
  customer: { name: string; mobile: string; address: string; gst: string };
  lines: MillInvoiceLine[];
  goodsPaise: number;
  discountPaise: number;
  taxablePaise: number;
  gstBilled: boolean;
  interState: boolean;
  cgstPaise: number; sgstPaise: number; igstPaise: number; totalGstPaise: number;
  taxRows: MillTaxRow[];
  charges: Record<MillChargeName, number>; // paise
  chargesTotalPaise: number;
  roundOffPaise: number;
  grandPaise: number;
  paidPaise: number;
  balancePaise: number;
  paymentMode: string;
  /** false → the stored parts do not add up to the stored Grand Total (never expected; shown as a visible warning) */
  consistent: boolean;
  problems: string[];
}

export function isMillInvoice(sale: any): boolean {
  return !!sale && sale.pricing_model === 'mill_v2';
}

function paymentModeText(sale: any): string {
  let pd: any = sale.payment_details;
  if (typeof pd === 'string') { try { pd = JSON.parse(pd); } catch { pd = null; } }
  const parts: string[] = [];
  if (pd && typeof pd === 'object') {
    const label: Record<string, string> = { cash: 'Cash', upi: 'UPI', card: 'Card', bank: 'Bank' };
    for (const k of ['cash', 'upi', 'card', 'bank']) if (Number(pd[k]) > 0) parts.push(`${label[k]} ${fmtPaise(paise(pd[k]))}`);
    if (Number(pd.udhar) > 0) parts.push(`Udhar ${fmtPaise(paise(pd.udhar))}`);
  }
  const base = String(sale.payment_type || '').trim();
  if (parts.length > 1 || (parts.length === 1 && /mixed|split|credit|udhar/i.test(base))) return `${base || 'Mixed'} (${parts.join(', ')})`;
  return base || parts[0] || '—';
}

export function buildMillInvoiceData(sale: any, shop: MillInvoiceShop, dateText: string): MillInvoiceData {
  const problems: string[] = [];
  let gd: any = sale.gst_details;
  if (typeof gd === 'string') { try { gd = JSON.parse(gd); } catch { gd = null; } }
  const gstBilled = sale.bill_type === 'gst' && !!gd && gd.model === 'mill_v2';

  const grandPaise = paise(sale.total_amount);
  const roundOffPaise = paise(sale.round_off_amount);
  const discountPaise = paise(sale.discount_amount);
  const chargesRaw = (sale.charges && typeof sale.charges === 'object') ? sale.charges : {};
  const charges = {} as Record<MillChargeName, number>;
  let chargesSum = 0;
  for (const k of MILL_CHARGE_ORDER) { charges[k] = paise(chargesRaw[k]); chargesSum += charges[k]; }
  const chargesTotalPaise = paise(sale.charges_total);
  if (chargesSum !== chargesTotalPaise) problems.push('charges do not add up to the stored charges total');

  const totalGstPaise = gstBilled ? paise(gd.totalGst) : 0;
  const cgstPaise = gstBilled ? paise(gd.cgst) : 0;
  const sgstPaise = gstBilled ? paise(gd.sgst) : 0;
  const igstPaise = gstBilled ? paise(gd.igst) : 0;
  // Taxable amount: stored for GST bills; for non-GST bills there is no GST, so it is what is left of the stored total.
  const taxablePaise = gstBilled ? paise(gd.taxable) : grandPaise - roundOffPaise - chargesTotalPaise;
  const goodsPaise = taxablePaise + discountPaise;

  const lines: MillInvoiceLine[] = (sale.items || []).map((i: any) => {
    const qty = Number(i.quantity) || 0;
    const ratePaise = paise(i.price_per_unit);
    return {
      name: String(i.name || 'Item') + (i.variant ? ` (${i.variant})` : ''),
      batch: Array.isArray(i.batch_numbers) ? i.batch_numbers.join(', ') : '',
      unit: String(i.unit || ''),
      qty,
      ratePaise,
      // same per-line rounding as the billing engine (lib/millBilling.ts: toPaise(rate × qty))
      amountPaise: Math.round(((Number(i.price_per_unit) || 0) * qty + Number.EPSILON) * 100),
    };
  });
  const linesSum = lines.reduce((s, l) => s + l.amountPaise, 0);
  if (linesSum !== goodsPaise) problems.push(`line amounts (${fmtPaise(linesSum)}) do not equal Goods Subtotal (${fmtPaise(goodsPaise)})`);
  if (gstBilled && cgstPaise + sgstPaise + igstPaise !== totalGstPaise) problems.push('CGST+SGST+IGST do not equal stored GST');
  if (taxablePaise + totalGstPaise + chargesTotalPaise + roundOffPaise !== grandPaise) {
    problems.push('Taxable + GST + charges + round-off do not equal the stored Grand Total');
  }

  const taxRows: MillTaxRow[] = gstBilled
    ? (Array.isArray(gd.hsnGroups) && gd.hsnGroups.length ? gd.hsnGroups : (gd.groups || [])).map((g: any) => ({
        rate: Number(g.rate) || 0, hsn: String(g.hsnCode && g.hsnCode !== '-' ? g.hsnCode : ''),
        taxablePaise: paise(g.taxable), cgstPaise: paise(g.cgst), sgstPaise: paise(g.sgst), igstPaise: paise(g.igst),
      }))
    : [];

  const paidPaise = paise(sale.amount_paid);
  return {
    invoiceNumber: sale.invoice_number || `INV-${String(sale.id || '').substring(0, 8).toUpperCase()}`,
    dateText,
    shop,
    customer: { name: sale.customer_name || '', mobile: sale.customer_mobile || '', address: sale.customer_address || '', gst: sale.customer_gst || '' },
    lines, goodsPaise, discountPaise, taxablePaise,
    gstBilled, interState: gstBilled ? !!gd.interState : false,
    cgstPaise, sgstPaise, igstPaise, totalGstPaise, taxRows,
    charges, chargesTotalPaise, roundOffPaise, grandPaise, paidPaise,
    balancePaise: Math.max(0, grandPaise - paidPaise),
    paymentMode: paymentModeText(sale),
    consistent: problems.length === 0,
    problems,
  };
}

/** WhatsApp text for a Mill invoice — the same stored figures as the printed invoice, rates shown ex-GST. */
export function millWhatsAppText(d: MillInvoiceData): string {
  const L: string[] = [];
  L.push(`*${d.shop.name || 'Invoice'}*`);
  if (d.shop.address) L.push(d.shop.address);
  if (d.shop.mobile) L.push(`Ph: ${d.shop.mobile}`);
  if (d.shop.gst) L.push(`GSTIN: ${d.shop.gst}`);
  L.push('');
  L.push(`*${d.gstBilled ? 'TAX INVOICE' : 'INVOICE'}* ${d.invoiceNumber}`);
  L.push(`Date: ${d.dateText}`);
  if (d.customer.name) L.push(`Customer: ${d.customer.name}`);
  L.push('');
  L.push('*Items* (rates exclusive of GST)');
  d.lines.forEach((l, i) => {
    L.push(`${i + 1}. ${l.name}${l.batch ? ` [Batch ${l.batch}]` : ''}`);
    L.push(`   ${l.qty} ${l.unit} × ${fmtPaise(l.ratePaise)} = ${fmtPaise(l.amountPaise)}`);
  });
  L.push('');
  L.push(`Goods Subtotal: ${fmtPaise(d.goodsPaise)}`);
  if (d.discountPaise) L.push(`Discount: -${fmtPaise(d.discountPaise)}`);
  L.push(`Taxable Amount: ${fmtPaise(d.taxablePaise)}`);
  if (d.gstBilled) {
    if (d.interState) L.push(`IGST: ${fmtPaise(d.igstPaise)}`);
    else { L.push(`CGST: ${fmtPaise(d.cgstPaise)}`); L.push(`SGST: ${fmtPaise(d.sgstPaise)}`); }
  }
  const names: Record<MillChargeName, string> = { freight: 'Freight', hamali: 'Hamali', loading: 'Loading', unloading: 'Unloading', other: 'Other Charges' };
  for (const k of MILL_CHARGE_ORDER) if (d.charges[k]) L.push(`${names[k]}: ${fmtPaise(d.charges[k])}`);
  if (d.roundOffPaise) L.push(`Round Off: ${d.roundOffPaise > 0 ? '+' : '-'}${fmtPaise(Math.abs(d.roundOffPaise))}`);
  L.push(`*Grand Total: ${fmtPaise(d.grandPaise)}*`);
  L.push(`Payment: ${d.paymentMode}`);
  L.push(`Amount Received: ${fmtPaise(d.paidPaise)}`);
  if (d.balancePaise > 0) L.push(`*Balance Due: ${fmtPaise(d.balancePaise)}*`);
  L.push('');
  L.push('Thank you for your business!');
  return L.join('\n');
}
