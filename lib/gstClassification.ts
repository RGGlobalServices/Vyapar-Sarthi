/**
 * Honest GST vs Non-GST classification for the CA reporting layer.
 *
 * This app has no B2B/B2C/exempt/nil-rated concept anywhere in the data
 * model (confirmed by inspecting Sale/PurchaseInvoice/Product) — the only
 * real signals are a bill/invoice's own billType ('gst'|'non_gst') and
 * whether the product on the line actually carries a GST rate/HSN. So
 * classification here never invents a rate or a category: a GST-billed
 * line whose product has no gstPercent/hsnCode is flagged as
 * 'gst_info_missing' rather than silently treated as 0% or exempt — the CA
 * report explicitly surfaces these instead of hiding them (see the Data
 * Quality / Non-GST reports built on top of this).
 */

export type GstClass = 'gst' | 'non_gst' | 'gst_info_missing';

export interface GstClassificationLabels {
  gst: string;
  non_gst: string;
  gst_info_missing: string;
}

export const GST_CLASS_LABELS: GstClassificationLabels = {
  gst: 'GST Applicable',
  non_gst: 'Non-GST / Other',
  gst_info_missing: 'GST Information Missing',
};

/** A sale line's classification: the invoice's own billType decides GST vs
 *  non-GST (that's the shopkeeper's actual choice at billing time); a
 *  GST-marked line whose product carries no rate/HSN is flagged missing
 *  rather than assumed 0%/exempt. */
export function classifySaleLine(
  saleBillType: string | null | undefined,
  productGstPercent: number | null | undefined,
  productHsnCode: string | null | undefined
): GstClass {
  if (saleBillType !== 'gst') return 'non_gst';
  if (productGstPercent == null || productHsnCode == null || productHsnCode === '') return 'gst_info_missing';
  return 'gst';
}

/** A purchase line's classification. PurchaseItem.gst is a recorded amount
 *  (not a rate) — its mere presence is the only real signal this data model
 *  has for "this purchase was GST-inclusive"; a positive recorded amount
 *  with no product GST rate on file is flagged missing rather than guessed. */
export function classifyPurchaseLine(
  recordedGstAmount: number | null | undefined,
  productGstPercent: number | null | undefined
): GstClass {
  const hasGstAmount = !!recordedGstAmount && recordedGstAmount > 0;
  if (!hasGstAmount) return 'non_gst';
  if (productGstPercent == null) return 'gst_info_missing';
  return 'gst';
}
