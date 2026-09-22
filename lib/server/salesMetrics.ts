/**
 * Shared reporting metrics — the ONE place the frozen reporting contract is implemented (Dashboard + Reports).
 *
 *   Billed Value        = Σ Sale.totalAmount                       (the invoice value; Dashboard headline Sales / Turnover)
 *   Net Goods Sales     = Σ (totalAmount − gstAmount − chargesTotal − roundOffAmount)
 *   GST Collected       = Σ gstAmount                              (Mill: stored rate-group total; legacy: stored embedded GST)
 *   Commercial Charges  = Σ chargesTotal                           (never goods revenue, never profit)
 *   Round Off           = Σ roundOffAmount                         (signed)
 *   Discount            = Σ discountAmount                         (invoice level; Mill only — legacy discounts are not stored separately)
 *   Profit              = Σ stored Sale.totalProfit                (never recomputed from price × quantity)
 *   Amount Received     = Σ amountPaid
 *   Udhar (given)       = customer_transactions type 'udhar' — retail pool and Party pool reported separately
 *   Outstanding         = Σ Customer.totalDue — retail pool and Party pool reported separately
 *   Party Credit Given  = Party-pool 'udhar' transactions
 *   Margin              = Profit ÷ Net Goods Sales   (NOT ÷ Billed Value, which includes GST and charges)
 *
 * All sums are computed in SQL from STORED columns; nothing is derived from cart/line prices. Legacy rows have NULL Mill
 * columns, which count as 0, so for a legacy sale Net Goods Sales = totalAmount − gstAmount.
 */
import { Prisma } from '@prisma/client';
import prisma from '@/lib/server/prisma';

export const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export type PaymentModes = { cash: number; upi: number; card: number; bank: number; cheque: number; other: number };
const emptyModes = (): PaymentModes => ({ cash: 0, upi: 0, card: 0, bank: 0, cheque: 0, other: 0 });

/** Net Goods Sales of ONE stored sale (pure helper for reports/tests; the SQL below is the same expression). */
export function netGoodsSalesOf(s: { totalAmount?: number | null; gstAmount?: number | null; chargesTotal?: number | null; roundOffAmount?: number | null }): number {
  return (s.totalAmount || 0) - (s.gstAmount || 0) - (s.chargesTotal || 0) - (s.roundOffAmount || 0);
}
/** Margin = Profit ÷ Net Goods Sales (0 when there is no goods revenue). */
export function marginOnNetGoods(profit: number, netGoodsSales: number): number {
  return netGoodsSales > 0 ? profit / netGoodsSales : 0;
}

/** Payment-mode bucket for a free-text mode / payment type. Order matters (first match wins). */
export function paymentBucketFor(raw: string | null | undefined): keyof PaymentModes {
  const m = String(raw || '').toLowerCase();
  if (m.includes('cash')) return 'cash';
  if (/upi|gpay|phonepe|paytm/.test(m)) return 'upi';
  if (/bank|neft|rtgs|imps/.test(m)) return 'bank';
  if (/cheque|check/.test(m)) return 'cheque';
  if (/card|debit|credit/.test(m)) return 'card';
  return 'other';
}
// The same rule as SQL, applied to a text expression.
const bucketSql = (expr: Prisma.Sql) => Prisma.sql`CASE
  WHEN ${expr} LIKE '%cash%' THEN 'cash'
  WHEN ${expr} ~ '(upi|gpay|phonepe|paytm)' THEN 'upi'
  WHEN ${expr} ~ '(bank|neft|rtgs|imps)' THEN 'bank'
  WHEN ${expr} ~ '(cheque|check)' THEN 'cheque'
  WHEN ${expr} ~ '(card|debit|credit)' THEN 'card'
  ELSE 'other' END`;

type Opts = { onQuery?: () => void };

// ───────────────────────────── sales metrics (one SQL pass) ─────────────────────────────
export interface SalesMetrics {
  invoiceCount: number;
  /** How many of those invoices are Mill (pricing_model = 'mill_v2') bills. */
  millInvoiceCount: number;
  billedValue: number;
  netGoodsSales: number;
  gstCollected: number;
  commercialCharges: number;
  roundOff: number;
  discount: number;
  profit: number;
  amountReceived: number;
  /** Σ (paid ÷ total × profit) — profit already realised in cash. */
  realizedProfit: number;
  /** Where the paid amount of the period's bills came in (cash/upi/card/bank/cheque; `other` = unclassified remainder). */
  collectionBySalesMode: PaymentModes;
}

// A guarded numeric read of one key of the payment_details JSON object (never throws on junk).
const pdNum = (key: string) => Prisma.sql`CASE WHEN (b.pd->>(${key}::text)) ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (b.pd->>(${key}::text))::float8 ELSE 0 END`;

export async function getSalesMetrics(shopIds: string[], start: Date, end: Date, opts: Opts = {}): Promise<SalesMetrics> {
  opts.onQuery?.();
  const rows = await prisma.$queryRaw<any[]>`
    WITH b AS (
      SELECT s.total_amount, s.total_profit, s.amount_paid, s.gst_amount, s.charges_total, s.round_off_amount, s.discount_amount, s.pricing_model,
             LOWER(COALESCE(s.payment_type, '')) AS ptype,
             CASE WHEN jsonb_typeof(s.payment_details) = 'object' THEN s.payment_details END AS pd,
             COALESCE(jsonb_typeof(s.payment_details) = 'string', false) AS pd_is_string
      FROM sales s
      WHERE s.shop_id = ANY(${shopIds}::uuid[]) AND s.created_at >= ${start} AND s.created_at <= ${end}
    ), c AS (
      SELECT b.*, ${pdNum('cash')} AS v_cash, ${pdNum('upi')} AS v_upi, ${pdNum('card')} AS v_card, ${pdNum('bank')} AS v_bank, ${pdNum('cheque')} AS v_cheque
      FROM b
    ), m AS (
      SELECT c.*, (v_cash + v_upi + v_card + v_bank + v_cheque) AS split, ${bucketSql(Prisma.sql`c.ptype`)} AS fb
      FROM c
    )
    SELECT
      COUNT(*)::int AS invoice_count,
      (COUNT(*) FILTER (WHERE pricing_model = 'mill_v2'))::int AS mill_invoice_count,
      COALESCE(SUM(total_amount), 0)::float8 AS billed_value,
      COALESCE(SUM(total_amount - COALESCE(gst_amount, 0) - COALESCE(charges_total, 0) - COALESCE(round_off_amount, 0)), 0)::float8 AS net_goods_sales,
      COALESCE(SUM(COALESCE(gst_amount, 0)), 0)::float8 AS gst_collected,
      COALESCE(SUM(COALESCE(charges_total, 0)), 0)::float8 AS commercial_charges,
      COALESCE(SUM(COALESCE(round_off_amount, 0)), 0)::float8 AS round_off,
      COALESCE(SUM(COALESCE(discount_amount, 0)), 0)::float8 AS discount,
      COALESCE(SUM(total_profit), 0)::float8 AS profit,
      COALESCE(SUM(amount_paid), 0)::float8 AS amount_received,
      COALESCE(SUM(CASE WHEN total_amount > 0 THEN (amount_paid / total_amount) * total_profit ELSE 0 END), 0)::float8 AS realized_profit,
      COALESCE(SUM(CASE WHEN amount_paid > 0 AND NOT pd_is_string THEN (CASE WHEN split > 0 THEN v_cash   WHEN fb = 'cash'   THEN amount_paid ELSE 0 END) ELSE 0 END), 0)::float8 AS m_cash,
      COALESCE(SUM(CASE WHEN amount_paid > 0 AND NOT pd_is_string THEN (CASE WHEN split > 0 THEN v_upi    WHEN fb = 'upi'    THEN amount_paid ELSE 0 END) ELSE 0 END), 0)::float8 AS m_upi,
      COALESCE(SUM(CASE WHEN amount_paid > 0 AND NOT pd_is_string THEN (CASE WHEN split > 0 THEN v_card   WHEN fb = 'card'   THEN amount_paid ELSE 0 END) ELSE 0 END), 0)::float8 AS m_card,
      COALESCE(SUM(CASE WHEN amount_paid > 0 AND NOT pd_is_string THEN (CASE WHEN split > 0 THEN v_bank   WHEN fb = 'bank'   THEN amount_paid ELSE 0 END) ELSE 0 END), 0)::float8 AS m_bank,
      COALESCE(SUM(CASE WHEN amount_paid > 0 AND NOT pd_is_string THEN (CASE WHEN split > 0 THEN v_cheque WHEN fb = 'cheque' THEN amount_paid ELSE 0 END) ELSE 0 END), 0)::float8 AS m_cheque,
      COALESCE(SUM(CASE WHEN amount_paid > 0 AND NOT pd_is_string THEN (CASE WHEN split > 0 THEN GREATEST(0, amount_paid - split) WHEN fb = 'other' THEN amount_paid ELSE 0 END) ELSE 0 END), 0)::float8 AS m_other,
      (COUNT(*) FILTER (WHERE pd_is_string AND amount_paid > 0))::int AS string_rows
    FROM m
  `;
  const r = rows[0] || {};
  const modes: PaymentModes = { cash: +r.m_cash || 0, upi: +r.m_upi || 0, card: +r.m_card || 0, bank: +r.m_bank || 0, cheque: +r.m_cheque || 0, other: +r.m_other || 0 };

  // Rare legacy quirk: payment_details stored as a JSON *string* (double-encoded). Those few rows are parsed in JS with
  // the same rules — the SQL above deliberately skips them so a malformed string can never break the whole query.
  if ((r.string_rows || 0) > 0) {
    opts.onQuery?.();
    const odd = await prisma.$queryRaw<{ ptype: string | null; pd: any; paid: number }[]>`
      SELECT s.payment_type AS ptype, s.payment_details AS pd, s.amount_paid::float8 AS paid
      FROM sales s
      WHERE s.shop_id = ANY(${shopIds}::uuid[]) AND s.created_at >= ${start} AND s.created_at <= ${end}
        AND jsonb_typeof(s.payment_details) = 'string' AND s.amount_paid > 0
    `;
    for (const s of odd) {
      let d: any = s.pd; if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = null; } }
      const cash = Number(d?.cash) || 0, upi = Number(d?.upi) || 0, card = Number(d?.card) || 0, bank = Number(d?.bank) || 0, cheque = Number(d?.cheque) || 0;
      const split = cash + upi + card + bank + cheque;
      if (split > 0) { modes.cash += cash; modes.upi += upi; modes.card += card; modes.bank += bank; modes.cheque += cheque; if (s.paid > split) modes.other += s.paid - split; }
      else modes[paymentBucketFor(s.ptype)] += s.paid;
    }
  }
  return {
    invoiceCount: r.invoice_count || 0,
    millInvoiceCount: r.mill_invoice_count || 0,
    billedValue: +r.billed_value || 0, netGoodsSales: +r.net_goods_sales || 0, gstCollected: +r.gst_collected || 0,
    commercialCharges: +r.commercial_charges || 0, roundOff: +r.round_off || 0, discount: +r.discount || 0,
    profit: +r.profit || 0, amountReceived: +r.amount_received || 0, realizedProfit: +r.realized_profit || 0,
    collectionBySalesMode: modes,
  };
}

// ───────────────────────────── credit (Udhar) metrics — one SQL pass ─────────────────────────────
export interface CreditMetrics {
  /** Credit extended in the period (customer_transactions type 'udhar'). */
  periodUdharRetail: number;
  periodUdharParty: number;
  /** Money received against credit in the period, both pools: 'payment' rows and 'advance' rows. */
  udharCollection: number;
  advanceCollection: number;
  /** Retail-pool 'payment' rows only (used for the realised-profit estimate). */
  retailPaymentsPeriod: number;
  /** By how it arrived (payments + advances of the period; mode recovered from the "via X" note, default cash). */
  collectionByMode: PaymentModes;
  /** Party-pool payments received today (fixed IST day, independent of the selected range). */
  partyPaymentsToday: number;
}

export async function getCreditMetrics(shopIds: string[], start: Date, end: Date, todayStart: Date, todayEnd: Date, opts: Opts = {}): Promise<CreditMetrics> {
  opts.onQuery?.();
  const rows = await prisma.$queryRaw<{ is_party: boolean; type: string; bucket: string | null; period_amt: number; today_amt: number }[]>`
    SELECT (COALESCE(c.customer_type, '') = 'party') AS is_party, t.type,
           CASE WHEN t.type IN ('payment', 'advance')
                THEN ${bucketSql(Prisma.sql`LOWER(COALESCE(SUBSTRING(t.note FROM '(?i)via\\s+([a-z]+)'), 'cash'))`)}
           END AS bucket,
           COALESCE(SUM(t.amount) FILTER (WHERE t.created_at >= ${start} AND t.created_at <= ${end}), 0)::float8 AS period_amt,
           COALESCE(SUM(t.amount) FILTER (WHERE t.created_at >= ${todayStart} AND t.created_at <= ${todayEnd}), 0)::float8 AS today_amt
    FROM customer_transactions t
    JOIN customers c ON t.customer_id = c.id
    WHERE c.shop_id = ANY(${shopIds}::uuid[])
      AND t.type IN ('udhar', 'payment', 'advance')
      AND t.created_at >= LEAST(${start}::timestamptz, ${todayStart}::timestamptz)
      AND t.created_at <= GREATEST(${end}::timestamptz, ${todayEnd}::timestamptz)
    GROUP BY 1, 2, 3
  `;
  const out: CreditMetrics = { periodUdharRetail: 0, periodUdharParty: 0, udharCollection: 0, advanceCollection: 0, retailPaymentsPeriod: 0, collectionByMode: emptyModes(), partyPaymentsToday: 0 };
  for (const r of rows) {
    const p = +r.period_amt || 0, t = +r.today_amt || 0;
    if (r.type === 'udhar') { if (r.is_party) out.periodUdharParty += p; else out.periodUdharRetail += p; continue; }
    if (r.type === 'payment') { out.udharCollection += p; if (!r.is_party) out.retailPaymentsPeriod += p; else out.partyPaymentsToday += t; }
    if (r.type === 'advance') out.advanceCollection += p;
    if (r.bucket && p > 0) out.collectionByMode[r.bucket as keyof PaymentModes] += p;
  }
  return out;
}

// ───────────────────────────── balances (outstanding + party collections + supplier payable) — one statement ─────────────────────────────
export interface BalanceMetrics {
  retailOutstanding: number;
  partyOutstanding: number;
  partyCollectionsAllTime: number;
  supplierPayable: number;
}
export async function getBalanceMetrics(shopIds: string[], opts: Opts = {}): Promise<BalanceMetrics> {
  opts.onQuery?.();
  const rows = await prisma.$queryRaw<any[]>`
    SELECT
      (SELECT COALESCE(SUM(total_due), 0) FROM customers WHERE shop_id = ANY(${shopIds}::uuid[]) AND (customer_type IS NULL OR customer_type <> 'party'))::float8 AS retail_outstanding,
      (SELECT COALESCE(SUM(total_due), 0) FROM customers WHERE shop_id = ANY(${shopIds}::uuid[]) AND customer_type = 'party')::float8 AS party_outstanding,
      (SELECT COALESCE(SUM(t.amount), 0) FROM customer_transactions t JOIN customers c ON t.customer_id = c.id
         WHERE c.shop_id = ANY(${shopIds}::uuid[]) AND t.type = 'payment' AND c.customer_type = 'party')::float8 AS party_collections_all_time,
      (SELECT COALESCE(SUM(balance), 0) FROM suppliers WHERE shop_id = ANY(${shopIds}::uuid[]))::float8 AS supplier_payable
  `;
  const r = rows[0] || {};
  return { retailOutstanding: +r.retail_outstanding || 0, partyOutstanding: +r.party_outstanding || 0, partyCollectionsAllTime: +r.party_collections_all_time || 0, supplierPayable: +r.supplier_payable || 0 };
}
