// One-shot, in-memory hand-off from the Invoices page ("Duplicate") to the Mill billing screen. The Mill cart is a separate
// cart (see millCartKey), so the duplicated lines must be delivered to IT — never to the legacy cart. Module state survives
// the client-side navigation between the two pages and is consumed exactly once.

export interface MillDuplicateLine {
  product_id: string | null;
  name: string;
  unit: string | null;
  variant: string | null;
  quantity: number;
  rate: number;
}

export interface MillDuplicate {
  /** The SOURCE invoice id — sent back with the new bill so the server re-enforces the duplicate rules. */
  duplicatedFrom: string;
  /** 'non_gst' when the source was a legacy non-GST invoice: the copy must stay non-GST until its rates are re-entered. */
  forceBillType: 'non_gst' | null;
  items: MillDuplicateLine[];
  charges: Partial<Record<'freight' | 'hamali' | 'loading' | 'unloading' | 'other', number>> | null;
  discount: { type: 'fixed'; value: number } | null;
  sourceInvoiceNumber?: string | null;
}

let pending: MillDuplicate | null = null;
export const setMillDuplicate = (p: MillDuplicate | null) => { pending = p; };
export const takeMillDuplicate = (): MillDuplicate | null => { const p = pending; pending = null; return p; };
