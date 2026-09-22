import prisma from '@/lib/server/prisma';
import { requireShopScope } from '@/lib/server/auth';
import { handle, json, query, ApiError } from '@/lib/server/http';
import { getDateRange, startOfDay, endOfDay, formatDate } from '@/lib/server/dates';
import { getDashboardCache, setDashboardCache } from '@/lib/server/dashboardCache';
import { isWholesaleTierPackage } from '@/lib/config/packageConfig';
import { runBatched } from '@/lib/server/runBatched';
import { isStaffUiRole } from '@/lib/server/staffAccess';
import { getSalesMetrics, getCreditMetrics, getBalanceMetrics, marginOnNetGoods, type PaymentModes } from '@/lib/server/salesMetrics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// How many of the (independent) queries run at once — kept under the pool size so a cache miss never starves other requests.
const BATCH = 6;

// A malformed date must be a 400, never a 500. Empty/missing keeps the existing "today" default; the selected-range
// semantics (and the IST day boundaries applied by getDateRange) are unchanged.
function cleanDateParam(name: string, raw: string | undefined): string | undefined {
  if (raw === undefined || raw === '') return undefined;
  const bad = () => new ApiError(400, `Invalid ${name}: expected an ISO date (YYYY-MM-DD) or timestamp.`, 'INVALID_DATE');
  if (raw.length > 64 || /[\u0000-\u001f]/.test(raw)) throw bad();
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime()) || d.getUTCFullYear() < 2000 || d.getUTCFullYear() > 2100) throw bad();
  return raw;
}

// What a staff-mode session must NOT receive from this API (the UI hides these cards for staff; the server now enforces it,
// through the existing x-ui-role mechanism — see lib/server/staffAccess.ts): profit, and the money-in/money-out row.
const STAFF_HIDDEN_SUMMARY_KEYS = [
  'today_profit', 'expected_profit', 'cash_profit', 'udhar_profit', 'net_margin',
  'sales_collection', 'udhar_collection', 'advance_collection', 'total_collection', 'amount_received',
  'collection_cash', 'collection_upi', 'collection_card', 'collection_other', 'collection_bank', 'collection_cheque', 'collection_unclassified',
  'expenses_amount', 'expenses_count', 'today_expenses_amount', 'today_expenses_count', 'month_expenses_amount', 'month_expenses_count',
  'purchases_amount', 'purchases_count', 'today_purchases_amount', 'today_purchases_count', 'month_purchases_amount', 'month_purchases_count',
  'total_purchases_amount', 'total_purchases_count', 'supplier_payable',
  'net_goods_sales', 'gst_collected', 'commercial_charges', 'round_off', 'discount',
];
function viewFor(payload: any, staff: boolean) {
  if (!staff) return payload;
  const summary = { ...payload.summary };
  for (const k of STAFF_HIDDEN_SUMMARY_KEYS) delete summary[k];
  return { ...payload, summary };
}

export const GET = handle(async (req) => {
  const { shop, shopIds, allShopAccess, ownedShops } = await requireShopScope(req);
  const shopNameById = new Map(ownedShops.map(s => [s.id, s.name]));
  const q = query(req);
  const { startDate, endDate } = getDateRange({
    ...q,
    start_date: cleanDateParam('start_date', q.start_date) as any,
    end_date: cleanDateParam('end_date', q.end_date) as any,
  });
  const forceRefresh = q.refresh === 'true' || q.refresh === '1';
  const staff = isStaffUiRole(req);

  // Pooled and single-shop requests must never share a cache entry — the same
  // date range means two very different result sets depending on scope.
  // The cache holds the FULL payload; the staff view is derived per request, so a staff call can never poison an admin's.
  const scopeKey = allShopAccess ? `all:${[...shopIds].sort().join(',')}` : shop.id;
  const cacheKey = `${scopeKey}_${startDate.getTime()}_${endDate.getTime()}`;

  if (!forceRefresh) {
    const cached = getDashboardCache(cacheKey);
    if (cached) {
      console.log(`[API] Dashboard Cache HIT for shop ${shop.id}`);
      return json(viewFor(cached, staff));
    }
  }

  const t0 = Date.now();
  let queryCount = 0;
  const tally = () => { queryCount++; };
  const track = <T,>(fn: () => Promise<T>) => () => { tally(); return fn(); };

  // Today's and this-month's expenses/purchases are shown on the dashboard regardless
  // of the selected timeframe filter, so they use their own fixed date bounds.
  const todayStart = startOfDay();
  const todayEnd = endOfDay();
  const [todayYear, todayMonth] = formatDate().split('-');
  const monthStart = startOfDay(`${todayYear}-${todayMonth}-01`);
  const isWholesaleTier = isWholesaleTierPackage(shop.subscriptionPlan);

  // ── Every query is independent; they run BATCH at a time (see runBatched). The former ~32 statements are folded into
  //    ~12: one pass over sales (all sales metrics + payment modes), one over customer_transactions, one balances
  //    statement, one each for expenses / purchases / returns / low stock / product movers.
  const jobs: Record<string, () => Promise<any>> = {
    sales: () => getSalesMetrics(shopIds, startDate, endDate, { onQuery: tally }),
    credit: () => getCreditMetrics(shopIds, startDate, endDate, todayStart, todayEnd, { onQuery: tally }),
    balances: () => getBalanceMetrics(shopIds, { onQuery: tally }),

    // period / today / this-month expenses in ONE scan
    expenses: track(() => prisma.$queryRaw<any[]>`
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE date >= ${startDate} AND date <= ${endDate}), 0)::float8 AS period_amount,
        (COUNT(*) FILTER (WHERE date >= ${startDate} AND date <= ${endDate}))::int AS period_count,
        COALESCE(SUM(amount) FILTER (WHERE date >= ${todayStart} AND date <= ${todayEnd}), 0)::float8 AS today_amount,
        (COUNT(*) FILTER (WHERE date >= ${todayStart} AND date <= ${todayEnd}))::int AS today_count,
        COALESCE(SUM(amount) FILTER (WHERE date >= ${monthStart} AND date <= ${todayEnd}), 0)::float8 AS month_amount,
        (COUNT(*) FILTER (WHERE date >= ${monthStart} AND date <= ${todayEnd}))::int AS month_count
      FROM expenses
      WHERE shop_id = ANY(${shopIds}::uuid[])
        AND date >= LEAST(${startDate}::timestamptz, ${monthStart}::timestamptz) AND date <= GREATEST(${endDate}::timestamptz, ${todayEnd}::timestamptz)
    `),

    // period / today / month / all-time supplier bills in ONE scan (aggregated on the purchase `date`, like the Purchases page)
    purchases: track(() => prisma.$queryRaw<any[]>`
      SELECT
        COALESCE(SUM(total_cost) FILTER (WHERE date >= ${startDate} AND date <= ${endDate}), 0)::float8 AS period_amount,
        (COUNT(*) FILTER (WHERE date >= ${startDate} AND date <= ${endDate}))::int AS period_count,
        COALESCE(SUM(total_cost) FILTER (WHERE date >= ${todayStart} AND date <= ${todayEnd}), 0)::float8 AS today_amount,
        (COUNT(*) FILTER (WHERE date >= ${todayStart} AND date <= ${todayEnd}))::int AS today_count,
        COALESCE(SUM(total_cost) FILTER (WHERE date >= ${monthStart} AND date <= ${todayEnd}), 0)::float8 AS month_amount,
        (COUNT(*) FILTER (WHERE date >= ${monthStart} AND date <= ${todayEnd}))::int AS month_count,
        COALESCE(SUM(total_cost), 0)::float8 AS total_amount,
        COUNT(*)::int AS total_count
      FROM purchase_invoices
      WHERE shop_id = ANY(${shopIds}::uuid[])
    `),

    // Returns: the breakdown card (every row) and the unsettled/legacy figures the maths uses — one statement.
    // Post-fix returns are marked settled:true in their note JSON and are already reflected in the Sale row, so only
    // unsettled rows count toward the totals (subtracting settled ones again would double-count).
    returns: track(() => prisma.$queryRaw<any[]>`
      SELECT r.reason,
        COALESCE(SUM(r.amount), 0)::float8 AS amount,
        COUNT(*)::int AS cnt,
        COALESCE(SUM(r.amount) FILTER (WHERE r.note IS NULL OR r.note NOT LIKE '%"settled":true%'), 0)::float8 AS unsettled_amount,
        (COUNT(*) FILTER (WHERE r.note IS NULL OR r.note NOT LIKE '%"settled":true%'))::int AS unsettled_count,
        COALESCE(SUM(r.quantity * (COALESCE(p.selling_price, 0) - COALESCE(p.cost_price, p.wholesale_cost, 0)))
                 FILTER (WHERE r.note IS NULL OR r.note NOT LIKE '%"settled":true%'), 0)::float8 AS profit_lost
      FROM material_returns r
      LEFT JOIN products p ON r.product_id = p.id
      WHERE r.shop_id = ANY(${shopIds}::uuid[]) AND r.date >= ${startDate} AND r.date <= ${endDate}
      GROUP BY r.reason
    `),

    // Low stock: the list and the badge count come from the same predicate in one statement.
    lowStock: track(() => prisma.$queryRaw<any[]>`
      SELECT id, name, category, current_stock, min_stock, shop_id, (COUNT(*) OVER ())::int AS total
      FROM products
      WHERE shop_id = ANY(${shopIds}::uuid[]) AND current_stock <= min_stock AND min_stock > 0
      ORDER BY (current_stock / min_stock) ASC
      LIMIT 5
    `),

    recentBills: track(() => prisma.sale.findMany({
      where: { shopId: { in: shopIds } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { customer: { select: { name: true, mobile: true } } },
    })),

    // Top by value, fast-moving by quantity and slow-moving: ONE aggregation over sale_items, shared by all three lists.
    movers: track(() => prisma.$queryRaw<any[]>`
      WITH agg AS (
        SELECT si.product_id, SUM(si.price_per_unit * si.quantity) AS value, SUM(si.quantity) AS qty
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        WHERE s.shop_id = ANY(${shopIds}::uuid[]) AND s.created_at >= ${startDate} AND s.created_at <= ${endDate}
        GROUP BY si.product_id
      ), top AS (
        SELECT p.id, p.name, p.category, p.shop_id, p.base_unit, a.value, a.qty, ROW_NUMBER() OVER (ORDER BY a.value DESC) AS rn
        FROM agg a JOIN products p ON a.product_id = p.id ORDER BY a.value DESC LIMIT 5
      ), fast AS (
        SELECT p.id, p.name, p.category, p.shop_id, p.base_unit, a.value, a.qty, ROW_NUMBER() OVER (ORDER BY a.qty DESC) AS rn
        FROM agg a JOIN products p ON a.product_id = p.id ORDER BY a.qty DESC LIMIT 5
      ), slow AS (
        SELECT p.id, p.name, p.category, p.shop_id, p.base_unit, COALESCE(a.qty, 0)::float8 AS qty, p.current_stock,
               ROW_NUMBER() OVER (ORDER BY COALESCE(a.qty, 0) ASC, p.current_stock DESC) AS rn
        FROM products p LEFT JOIN agg a ON p.id = a.product_id
        WHERE p.shop_id = ANY(${shopIds}::uuid[]) AND p.current_stock > 0
        ORDER BY COALESCE(a.qty, 0) ASC, p.current_stock DESC LIMIT 5
      )
      SELECT 'top' AS kind, id, name, category, shop_id, base_unit, value::float8 AS value, qty::float8 AS qty, NULL::float8 AS current_stock, rn::int AS rn FROM top
      UNION ALL SELECT 'fast', id, name, category, shop_id, base_unit, value::float8, qty::float8, NULL::float8, rn::int FROM fast
      UNION ALL SELECT 'slow', id, name, category, shop_id, base_unit, NULL::float8, qty::float8, current_stock::float8, rn::int FROM slow
    `),
  };

  // ERP / wholesale-tier extras join the same batches instead of running as a separate sequential round afterwards.
  if (isWholesaleTier) {
    // cost_price is the real per-unit cost on wholesale-tier shops — wholesale_cost is repurposed there as the wholesale
    // SELLING price; it is only a fallback for older products saved before the 3-tier pricing split.
    jobs.inventoryValue = track(() => prisma.$queryRaw<{ total_value: number }[]>`
      SELECT COALESCE(SUM(current_stock * COALESCE(NULLIF(cost_price, 0), wholesale_cost, 0)), 0)::float as total_value
      FROM products
      WHERE shop_id = ANY(${shopIds}::uuid[]) AND current_stock > 0
    `);
    jobs.expiringBatches = track(() => prisma.batch.findMany({
      where: { shopId: { in: shopIds }, quantity: { gt: 0 }, expiryDate: { lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } },
      include: { product: { select: { name: true } } },
      orderBy: { expiryDate: 'asc' },
      take: 5,
    }));
    jobs.recentFeeds = track(() => prisma.$queryRaw<any[]>`
      SELECT m.id, m.type, m.quantity, m.created_at, m.shop_id, p.name as product_name
      FROM stock_movements m
      JOIN products p ON p.id = m.product_id
      WHERE m.shop_id = ANY(${shopIds}::uuid[])
      ORDER BY m.created_at DESC
      LIMIT 5
    `);
  }

  const names = Object.keys(jobs);
  const results = await runBatched(names.map((n) => jobs[n]) as any, BATCH) as any[];
  const R: Record<string, any> = {};
  names.forEach((n, i) => { R[n] = results[i]; });
  const rounds = Math.ceil(names.length / BATCH);

  const sales = R.sales as Awaited<ReturnType<typeof getSalesMetrics>>;
  const credit = R.credit as Awaited<ReturnType<typeof getCreditMetrics>>;
  const bal = R.balances as Awaited<ReturnType<typeof getBalanceMetrics>>;
  const exp = R.expenses[0] || {};
  const pur = R.purchases[0] || {};

  // ── Returns (legacy / unsettled rows only participate in the maths; the by-reason card shows everything) ──
  const returnsRows: any[] = R.returns;
  const returnsAmount = returnsRows.reduce((a, r) => a + (+r.unsettled_amount || 0), 0);
  const returnsCount = returnsRows.reduce((a, r) => a + (+r.unsettled_count || 0), 0);
  let returnsProfit = returnsRows.reduce((a, r) => a + (+r.profit_lost || 0), 0);
  // Contract margin = Profit ÷ NET GOODS SALES (Billed Value would include GST and commercial charges).
  const periodMargin = marginOnNetGoods(sales.profit, sales.netGoodsSales);
  // Returns whose profit could not be derived from product prices are estimated at the period's margin. Compatibility rule:
  // a period with NO Mill invoices keeps the estimation basis this dashboard has always used (profit ÷ Billed Value), so
  // legacy-only numbers do not move; a period that contains Mill invoices uses the contract basis (Net Goods Sales).
  const returnsEstimateMargin = sales.millInvoiceCount > 0
    ? periodMargin
    : (sales.billedValue > 0 ? sales.profit / sales.billedValue : 0);
  if (returnsAmount > 0 && returnsProfit === 0) returnsProfit = returnsAmount * returnsEstimateMargin;

  // Realised profit = profit already collected in cash + the retail Udhar paid back × the period's Net-Goods margin.
  const finalProfit = sales.realizedProfit + credit.retailPaymentsPeriod * periodMargin;

  // ── Collection by mode: bills' paid amounts + Udhar/advance payments, by HOW it arrived ──
  const modes: PaymentModes = { ...sales.collectionBySalesMode };
  (Object.keys(credit.collectionByMode) as (keyof PaymentModes)[]).forEach((k) => { modes[k] += credit.collectionByMode[k]; });

  // Cash-flow figures a shopkeeper closes the day on — money MOVED, not billed value.
  const salesCollection = sales.amountReceived;
  const totalCollection = salesCollection + credit.udharCollection + credit.advanceCollection - returnsAmount;

  // Udhar: the retail Customer pool AND, for wholesale-tier packages (Udyog / Bada Udyog), the B2B Party pool —
  // the Party pool is where a mill's credit sales live. The two pools are also exposed separately.
  const totalUdhar = bal.retailOutstanding + (isWholesaleTier ? bal.partyOutstanding : 0);
  const periodUdhar = credit.periodUdharRetail + (isWholesaleTier ? credit.periodUdharParty : 0);

  const movers = (kind: string) => (R.movers as any[]).filter((r) => r.kind === kind).sort((a, b) => a.rn - b.rn);
  const shopTag = (id: string) => (allShopAccess ? { shopName: shopNameById.get(id) } : {});

  const payload: any = {
    summary: {
      // Headline: Billed Value less legacy unsettled returns — definition unchanged.
      today_sales: sales.billedValue - returnsAmount,
      today_profit: sales.profit - returnsProfit,
      expected_profit: sales.profit - returnsProfit,
      cash_profit: finalProfit - returnsProfit,
      udhar_profit: Math.max(0, sales.profit - finalProfit),
      total_udhar: totalUdhar,
      period_udhar: periodUdhar,
      low_stock_count: Number(R.lowStock[0]?.total || 0),
      returns_amount: returnsAmount,
      returns_count: returnsCount,
      sales_collection: salesCollection,
      udhar_collection: credit.udharCollection,
      advance_collection: credit.advanceCollection,
      total_collection: totalCollection,
      expenses_amount: +exp.period_amount || 0,
      expenses_count: +exp.period_count || 0,
      today_expenses_amount: +exp.today_amount || 0,
      today_expenses_count: +exp.today_count || 0,
      month_expenses_amount: +exp.month_amount || 0,
      month_expenses_count: +exp.month_count || 0,
      purchases_amount: +pur.period_amount || 0,
      purchases_count: +pur.period_count || 0,
      today_purchases_amount: +pur.today_amount || 0,
      today_purchases_count: +pur.today_count || 0,
      month_purchases_amount: +pur.month_amount || 0,
      month_purchases_count: +pur.month_count || 0,
      total_purchases_amount: +pur.total_amount || 0,
      total_purchases_count: +pur.total_count || 0,
      supplier_payable: bal.supplierPayable,
      // How the money arrived. `collection_other` keeps its previous meaning "everything that is not cash/UPI/card" (so the
      // existing chips still add up to Total Collection) — bank and cheque are now also broken out on their own.
      collection_cash: modes.cash,
      collection_upi: modes.upi,
      collection_card: modes.card,
      collection_other: modes.other + modes.bank + modes.cheque,
      collection_bank: modes.bank,
      collection_cheque: modes.cheque,
      collection_unclassified: modes.other,

      // ── Reporting-contract metrics (additive) — defined once in lib/server/salesMetrics.ts ──
      billed_value: sales.billedValue,
      net_goods_sales: sales.netGoodsSales,
      gst_collected: sales.gstCollected,
      commercial_charges: sales.commercialCharges,
      round_off: sales.roundOff,
      discount: sales.discount,
      amount_received: sales.amountReceived,
      invoice_count: sales.invoiceCount,
      net_margin: periodMargin,
      retail_udhar_outstanding: bal.retailOutstanding,
      party_outstanding: bal.partyOutstanding,
      period_retail_udhar: credit.periodUdharRetail,
      period_party_udhar: credit.periodUdharParty,
      udhar_includes_party: isWholesaleTier,
    },
    returnsByReason: returnsRows.map((r) => ({ reason: r.reason, amount: +r.amount || 0, count: +r.cnt || 0 })),
    lowStock: R.lowStock.map((p: any) => ({
      id: p.id, name: p.name, category: p.category, current_stock: p.current_stock, min_stock: p.min_stock,
      ...shopTag(p.shop_id),
    })),
    recentBills: R.recentBills.map((s: any) => ({
      id: s.id,
      invoice_number: s.invoice_number,
      total_amount: s.totalAmount || 0,
      payment_type: s.paymentType,
      payment_details: s.paymentDetails,
      customer_name: s.customer?.name,
      customer_mobile: s.customer?.mobile,
      created_at: s.createdAt,
      ...(allShopAccess ? { shopName: shopNameById.get(s.shopId as string) } : {}),
    })),
    topProducts: movers('top').map((r) => ({ id: r.id, name: r.name, category: r.category, unit: r.base_unit || null, value: Number(r.value || 0), qty: Number(r.qty || 0), ...shopTag(r.shop_id) })),
    fastMoving: movers('fast').map((r) => ({ id: r.id, name: r.name, category: r.category, unit: r.base_unit || null, value: Number(r.value || 0), qty: Number(r.qty || 0), ...shopTag(r.shop_id) })),
    slowMoving: movers('slow').map((r) => ({ id: r.id, name: r.name, category: r.category, unit: r.base_unit || null, current_stock: Number(r.current_stock || 0), qty: Number(r.qty || 0), ...shopTag(r.shop_id) })),
  };

  if (isWholesaleTier) {
    payload.wholesale = {
      inventoryValue: R.inventoryValue?.[0]?.total_value || 0,
      expiringBatches: allShopAccess
        ? R.expiringBatches.map((b: any) => ({ ...b, shopName: shopNameById.get(b.shopId as string) }))
        : R.expiringBatches,
      recentFeeds: allShopAccess
        ? R.recentFeeds.map((f: any) => ({ ...f, shopName: shopNameById.get(f.shop_id) }))
        : R.recentFeeds,
      partyCreditTotal: bal.partyOutstanding,
      partyCreditCollectionTotal: bal.partyCollectionsAllTime,
      partyCreditCollectionToday: credit.partyPaymentsToday,
    };
  }

  console.log(`[API] Dashboard Cache MISS/REFRESH for shop ${shop.id}: queries=${queryCount} rounds=${rounds} ms=${Date.now() - t0}`);
  setDashboardCache(cacheKey, payload);

  return json(viewFor(payload, staff));
});
