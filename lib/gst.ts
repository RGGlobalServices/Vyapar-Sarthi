// GST computation for billing.
//
// Prices in this app are treated as GST-INCLUSIVE (MRP-style retail), so turning
// a bill into a GST invoice must NOT change the amount the customer pays. We only
// break the existing total into its taxable value and embedded tax. That keeps
// non-GST and GST invoices numerically identical in total — only the GST invoice
// additionally shows the tax split.

export interface GstLineItem {
  total: number;        // line total (price * qty), GST-inclusive
  gstPercent?: number;  // per-item GST rate, e.g. 18
  hsnCode?: string;
}

export interface GstRateGroup {
  rate: number;         // GST %
  taxable: number;      // taxable value at this rate
  cgst: number;
  sgst: number;
  igst: number;
}

export interface GstBreakdown {
  interState: boolean;
  taxable: number;      // total taxable value across all items
  cgst: number;
  sgst: number;
  igst: number;
  totalGst: number;     // cgst + sgst + igst
  grandTotal: number;   // taxable + totalGst  (== the bill total)
  groups: GstRateGroup[]; // rate-wise summary for the tax table
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Break a GST-inclusive bill into taxable value + tax.
 *
 * @param items    cart lines with per-item gstPercent
 * @param discount whole-bill discount (spread proportionally across lines)
 * @param interState true → IGST, false → CGST + SGST (half each)
 */
export function computeGst(
  items: GstLineItem[],
  discount = 0,
  interState = false
): GstBreakdown {
  const subtotal = items.reduce((a, i) => a + (i.total || 0), 0);
  // Scale every line down by the same ratio so a bill-level discount reduces
  // each line's taxable + tax proportionally.
  const scale = subtotal > 0 ? Math.max(0, subtotal - discount) / subtotal : 0;

  const byRate = new Map<number, { taxable: number; gst: number }>();
  let taxable = 0;
  let totalGst = 0;

  for (const item of items) {
    const rate = Number(item.gstPercent) || 0;
    const gross = (item.total || 0) * scale;         // discounted, GST-inclusive
    const lineTaxable = rate > 0 ? gross / (1 + rate / 100) : gross;
    const lineGst = gross - lineTaxable;

    taxable += lineTaxable;
    totalGst += lineGst;

    const g = byRate.get(rate) || { taxable: 0, gst: 0 };
    g.taxable += lineTaxable;
    g.gst += lineGst;
    byRate.set(rate, g);
  }

  const groups: GstRateGroup[] = [...byRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, g]) => ({
      rate,
      taxable: round2(g.taxable),
      cgst: interState ? 0 : round2(g.gst / 2),
      sgst: interState ? 0 : round2(g.gst / 2),
      igst: interState ? round2(g.gst) : 0,
    }));

  const cgst = interState ? 0 : round2(totalGst / 2);
  const sgst = interState ? 0 : round2(totalGst / 2);
  const igst = interState ? round2(totalGst) : 0;

  return {
    interState,
    taxable: round2(taxable),
    cgst,
    sgst,
    igst,
    totalGst: round2(totalGst),
    grandTotal: round2(taxable + totalGst),
    groups,
  };
}
