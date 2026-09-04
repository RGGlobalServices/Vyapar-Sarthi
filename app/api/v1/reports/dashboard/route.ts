import prisma from '@/lib/server/prisma';
import { requireShopScope } from '@/lib/server/auth';
import { handle, json, query } from '@/lib/server/http';
import { getDateRange, startOfDay, endOfDay, formatDate } from '@/lib/server/dates';
import { getDashboardCache, setDashboardCache } from '@/lib/server/dashboardCache';
import { isWholesaleTierPackage } from '@/lib/config/packageConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop, shopIds, allShopAccess, ownedShops } = await requireShopScope(req);
  const shopNameById = new Map(ownedShops.map(s => [s.id, s.name]));
  const q = query(req);
  const { startDate, endDate } = getDateRange(q);
  const forceRefresh = q.refresh === 'true' || q.refresh === '1';

  // Pooled and single-shop requests must never share a cache entry — the same
  // date range means two very different result sets depending on scope.
  const scopeKey = allShopAccess ? `all:${[...shopIds].sort().join(',')}` : shop.id;
  const cacheKey = `${scopeKey}_${startDate.getTime()}_${endDate.getTime()}`;

  if (!forceRefresh) {
    const cached = getDashboardCache(cacheKey);
    if (cached) {
      console.log(`[API] Dashboard Cache HIT for shop ${shop.id}`);
      return json(cached);
    }
  }

  console.log(`[API] Dashboard Cache MISS/REFRESH for shop ${shop.id}. Fetching from DB...`);

  // Today's and this-month's expenses are shown on the dashboard regardless
  // of the selected timeframe filter, so they use their own fixed date
  // bounds instead of the query's startDate/endDate.
  const todayStart = startOfDay();
  const todayEnd = endOfDay();
  const [todayYear, todayMonth] = formatDate().split('-');
  const monthStart = startOfDay(`${todayYear}-${todayMonth}-01`);

  // None of these queries depend on each other's results, so they run
  // concurrently instead of one round-trip at a time. Prisma's own client
  // still caps actual concurrent DB connections at connection_limit (see
  // DATABASE_URL), so this can't reopen the connection-exhaustion issue —
  // it just lets independent queries queue/execute together instead of the
  // request blocking on each one serially.
  const [
    salesAndProfit,
    expensesAgg,
    todayExpensesAgg,
    monthExpensesAgg,
    salePayments,
    udharPaymentRows,
    customers,
    productsCount,
    returnsSummary,
    returnsByReason,
    returnsProfitLost,
    realizedProfitData,
    udharPaymentsData,
    marginData,
    udharGivenData,
    partyCreditAgg,
    partyCollectionTotalData,
    partyCollectionTodayData,
    lowStock,
    recentBills,
    topProd,
    fastProd,
    slowProd,
    periodPurchasesAgg,
    todayPurchasesAgg,
    monthPurchasesAgg,
    allTimePurchasesAgg,
    supplierPayableAgg,
  ] = await Promise.all([
    prisma.sale.aggregate({
      where: { shopId: { in: shopIds }, createdAt: { gte: startDate, lte: endDate } },
      // amountPaid is what actually came into the drawer; totalAmount includes
      // the udhar portion that has not been paid yet.
      _sum: { totalAmount: true, totalProfit: true, amountPaid: true },
    }),

    prisma.expense.aggregate({
      where: { shopId: { in: shopIds }, date: { gte: startDate, lte: endDate } },
      _sum: { amount: true },
      _count: { id: true },
    }),

    prisma.expense.aggregate({
      where: { shopId: { in: shopIds }, date: { gte: todayStart, lte: todayEnd } },
      _sum: { amount: true },
      _count: { id: true },
    }),

    prisma.expense.aggregate({
      where: { shopId: { in: shopIds }, date: { gte: monthStart, lte: todayEnd } },
      _sum: { amount: true },
      _count: { id: true },
    }),

    // Per-bill payment split, so collection can be reported by mode. A 'Split'
    // bill carries the breakdown in paymentDetails; anything else put its whole
    // paid amount through one mode.
    prisma.sale.findMany({
      where: { shopId: { in: shopIds }, createdAt: { gte: startDate, lte: endDate } },
      select: { paymentType: true, paymentDetails: true, amountPaid: true },
    }),

    // Udhar-side money in. There is no payment-mode column on
    // customer_transactions — /crm/payments records it in the note as
    // "Payment via UPI - ...", so the mode is recovered from there and falls
    // back to Cash (the overwhelmingly common case) when absent.
    // Includes BOTH retail Udhar (customer/NULL customer_type) AND B2B Party
    // credit collections (customer_type='party'): the dashboard's Total
    // Collection and today's Udhar Collection cards need to reflect every
    // rupee actually received against outstanding credit — whichever pool it
    // came from. Party collections are still reported on their own in the
    // WholesaleWidgets partyCreditCollectionTotal/Today counters below;
    // this is additive, not double-counting.
    prisma.$queryRaw<{ amount: number; note: string | null; type: string }[]>`
      SELECT t.amount::float AS amount, t.note, t.type
      FROM customer_transactions t
      JOIN customers c ON t.customer_id = c.id
      WHERE c.shop_id = ANY(${shopIds}::uuid[])
        AND t.type IN ('payment', 'advance')
        AND t.created_at >= ${startDate}
        AND t.created_at <= ${endDate}
    `,

    prisma.customer.aggregate({
      where: { shopId: { in: shopIds }, OR: [{ customerType: null }, { customerType: { not: 'party' } }] },
      _sum: { totalDue: true }
    }),

    // Low-stock count must match the low-stock list criteria below so the
    // dashboard badge and list agree.
    prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int as count
      FROM products
      WHERE shop_id = ANY(${shopIds}::uuid[])
        AND current_stock <= min_stock
        AND min_stock > 0
    `,

    // Returns aggregate — only counts rows the closed-loop pipeline HASN'T
    // already settled through Sale/customer.totalDue/cashBook. Post-fix
    // returns are marked settled:true in their note JSON so we don't
    // double-subtract them here. Legacy rows (no marker) are still summed
    // the old way so pre-existing dashboards keep the number they had.
    prisma.$queryRaw<{ total: number; cnt: number }[]>`
      SELECT COALESCE(SUM(amount), 0)::float as total, COUNT(*)::int as cnt
      FROM material_returns
      WHERE shop_id = ANY(${shopIds}::uuid[])
        AND date >= ${startDate} AND date <= ${endDate}
        AND (note IS NULL OR note NOT LIKE '%"settled":true%')
    `,

    // Grouped by reason — kept unfiltered so the "returns breakdown" card
    // still shows the full picture (legacy + new). It's display-only, doesn't
    // participate in the math.
    prisma.materialReturn.groupBy({
      by: ['reason'],
      where: { shopId: { in: shopIds }, date: { gte: startDate, lte: endDate } },
      _sum: { amount: true },
      _count: { id: true },
    }),

    // Profit-lost for LEGACY (unsettled) rows only — uses current product
    // cost as a rough estimate. Post-fix rows carry the *actual* historical
    // per-unit margin in note.refundProfit (computed from SaleItem.
    // marginPerUnit at return time), so those are read straight out below
    // and NOT recomputed here. This was the source of the "profit minus"
    // bug: the old query used product's current selling_price which drifts.
    prisma.$queryRaw<{ profit_lost: number }[]>`
      SELECT SUM(
        r.quantity * (COALESCE(p.selling_price, 0) - COALESCE(p.cost_price, p.wholesale_cost, 0))
      )::float as profit_lost
      FROM material_returns r
      LEFT JOIN products p ON r.product_id = p.id
      WHERE r.shop_id = ANY(${shopIds}::uuid[])
        AND r.date >= ${startDate} AND r.date <= ${endDate}
        AND (r.note IS NULL OR r.note NOT LIKE '%"settled":true%')
    `,

    prisma.$queryRaw<{ realized_sales_profit: number }[]>`
      SELECT SUM(
        CASE
          WHEN total_amount > 0 THEN (amount_paid / total_amount) * total_profit
          ELSE 0
        END
      )::float as realized_sales_profit
      FROM sales
      WHERE shop_id = ANY(${shopIds}::uuid[]) AND created_at >= ${startDate} AND created_at <= ${endDate}
    `,

    prisma.$queryRaw<{ total_udhar_paid: number }[]>`
      SELECT SUM(t.amount)::float as total_udhar_paid
      FROM customer_transactions t
      JOIN customers c ON t.customer_id = c.id
      WHERE c.shop_id = ANY(${shopIds}::uuid[])
        AND t.type = 'payment'
        AND t.created_at >= ${startDate}
        AND t.created_at <= ${endDate}
        AND (c.customer_type IS NULL OR c.customer_type != 'party')
    `,

    prisma.$queryRaw<{ total_profit: number, total_amount: number }[]>`
      SELECT SUM(total_profit)::float as total_profit, SUM(total_amount)::float as total_amount
      FROM sales
      WHERE shop_id = ANY(${shopIds}::uuid[])
    `,

    prisma.$queryRaw<{ total_udhar_given: number }[]>`
      SELECT SUM(t.amount)::float as total_udhar_given
      FROM customer_transactions t
      JOIN customers c ON t.customer_id = c.id
      WHERE c.shop_id = ANY(${shopIds}::uuid[])
        AND t.type = 'udhar'
        AND t.created_at >= ${startDate}
        AND t.created_at <= ${endDate}
        AND (c.customer_type IS NULL OR c.customer_type != 'party')
    `,

    // Party credit (Udyog B2B wholesale AR) — current outstanding balance,
    // reported separately from retail Udhar above. Same Customer table,
    // customerType='party' is what the /party page already keys off.
    prisma.customer.aggregate({
      where: { shopId: { in: shopIds }, customerType: 'party' },
      _sum: { totalDue: true }
    }),

    // All-time party-credit collections — deliberately NOT scoped to the
    // dashboard's startDate/endDate filter, same "total vs today" split the
    // expenses KPIs above already use.
    prisma.$queryRaw<{ total: number }[]>`
      SELECT SUM(t.amount)::float as total
      FROM customer_transactions t
      JOIN customers c ON t.customer_id = c.id
      WHERE c.shop_id = ANY(${shopIds}::uuid[])
        AND t.type = 'payment'
        AND c.customer_type = 'party'
    `,

    prisma.$queryRaw<{ total: number }[]>`
      SELECT SUM(t.amount)::float as total
      FROM customer_transactions t
      JOIN customers c ON t.customer_id = c.id
      WHERE c.shop_id = ANY(${shopIds}::uuid[])
        AND t.type = 'payment'
        AND c.customer_type = 'party'
        AND t.created_at >= ${todayStart}
        AND t.created_at <= ${todayEnd}
    `,

    // Low stock
    prisma.$queryRaw<any[]>`
      SELECT id, name, category, current_stock, min_stock, shop_id
      FROM products
      WHERE shop_id = ANY(${shopIds}::uuid[])
        AND current_stock <= min_stock
        AND min_stock > 0
      ORDER BY (current_stock / min_stock) ASC
      LIMIT 5
    `,

    // Recent bills
    prisma.sale.findMany({
      where: { shopId: { in: shopIds } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { customer: { select: { name: true, mobile: true } } },
    }),

    // Top Products by Value (Optimized)
    prisma.$queryRaw<any[]>`
      SELECT p.id, p.name, p.category, p.shop_id, s_agg.value, s_agg.qty
      FROM (
        SELECT si.product_id, SUM(si.price_per_unit * si.quantity) as value, SUM(si.quantity) as qty
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        WHERE s.shop_id = ANY(${shopIds}::uuid[]) AND s.created_at >= ${startDate} AND s.created_at <= ${endDate}
        GROUP BY si.product_id
      ) s_agg
      JOIN products p ON s_agg.product_id = p.id
      ORDER BY s_agg.value DESC
      LIMIT 5
    `,

    // Fast moving by Qty (Optimized)
    prisma.$queryRaw<any[]>`
      SELECT p.id, p.name, p.category, p.shop_id, s_agg.qty, s_agg.value
      FROM (
        SELECT si.product_id, SUM(si.quantity) as qty, SUM(si.price_per_unit * si.quantity) as value
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        WHERE s.shop_id = ANY(${shopIds}::uuid[]) AND s.created_at >= ${startDate} AND s.created_at <= ${endDate}
        GROUP BY si.product_id
      ) s_agg
      JOIN products p ON s_agg.product_id = p.id
      ORDER BY s_agg.qty DESC
      LIMIT 5
    `,

    // Slow moving (Products with high stock and low/zero sales)
    prisma.$queryRaw<any[]>`
      SELECT p.id, p.name, p.category, p.shop_id, COALESCE(s_agg.qty, 0)::float as qty, p.current_stock
      FROM products p
      LEFT JOIN (
        SELECT si.product_id, SUM(si.quantity) as qty
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        WHERE s.shop_id = ANY(${shopIds}::uuid[]) AND s.created_at >= ${startDate} AND s.created_at <= ${endDate}
        GROUP BY si.product_id
      ) s_agg ON p.id = s_agg.product_id
      WHERE p.shop_id = ANY(${shopIds}::uuid[]) AND p.current_stock > 0
      ORDER BY COALESCE(s_agg.qty, 0) ASC, p.current_stock DESC
      LIMIT 5
    `,

    // ── Purchases (supplier bills) — mirrors the sales/expenses KPIs so the
    //    dashboard can show what the shop BOUGHT, not just what it sold.
    //    Aggregated on the purchase `date` (what the shopkeeper picks when
    //    recording the bill), same field the Purchases page keys off. ──
    // Period (respects the dashboard's timeframe filter, like today_sales).
    prisma.purchaseInvoice.aggregate({
      where: { shopId: { in: shopIds }, date: { gte: startDate, lte: endDate } },
      _sum: { totalCost: true }, _count: { id: true },
    }),
    // Fixed "today" (ignores the filter, like today_expenses).
    prisma.purchaseInvoice.aggregate({
      where: { shopId: { in: shopIds }, date: { gte: todayStart, lte: todayEnd } },
      _sum: { totalCost: true }, _count: { id: true },
    }),
    // Fixed "this month".
    prisma.purchaseInvoice.aggregate({
      where: { shopId: { in: shopIds }, date: { gte: monthStart, lte: todayEnd } },
      _sum: { totalCost: true }, _count: { id: true },
    }),
    // All-time total purchases (parallel to all-time sales).
    prisma.purchaseInvoice.aggregate({
      where: { shopId: { in: shopIds } },
      _sum: { totalCost: true }, _count: { id: true },
    }),
    // Total outstanding payable to suppliers (parallel to total_udhar owed to us).
    prisma.supplier.aggregate({
      where: { shopId: { in: shopIds } },
      _sum: { balance: true },
    }),
  ]);

  const totalUdhar = customers._sum?.totalDue || 0;
  const lowStockCount = Number((productsCount as any[])[0]?.count || 0);
  // Legacy (unsettled) returns only. Post-fix returns are already reflected
  // in the Sale row, so they participate via salesAndProfit — subtracting
  // them here again would double-count and swing the KPIs negative when a
  // return day has few sales (the original bug).
  const legacyReturnsAmount = Number((returnsSummary as any[])[0]?.total || 0);
  const legacyReturnsCount = Number((returnsSummary as any[])[0]?.cnt || 0);
  let returnsProfit = Number((returnsProfitLost as any[])[0]?.profit_lost || 0);
  const returnsAmount = legacyReturnsAmount;

  // Realized Profit Calculation
  const realizedSalesProfit = Number((realizedProfitData as any[])[0]?.realized_sales_profit || 0);
  const udharPaid = Number((udharPaymentsData as any[])[0]?.total_udhar_paid || 0);
  const allTimeProfit = Number((marginData as any[])[0]?.total_profit || 0);
  const allTimeSales = Number((marginData as any[])[0]?.total_amount || 0);
  const avgMargin = allTimeSales > 0 ? (allTimeProfit / allTimeSales) : 0.0;
  
  if (returnsAmount > 0 && returnsProfit === 0) {
    const todayGrossSales = salesAndProfit._sum.totalAmount || 0;
    const todayGrossProfit = salesAndProfit._sum.totalProfit || 0;
    const todayMargin = todayGrossSales > 0 ? (todayGrossProfit / todayGrossSales) : avgMargin;
    returnsProfit = returnsAmount * todayMargin;
  }
  
  // Realized Profit = (Profit from Cash collected today) + (Udhar Payments collected today * All Time Profit Margin)
  const finalProfit = realizedSalesProfit + (udharPaid * avgMargin);

  // ── Cash-flow figures a shopkeeper closes the day on ──────────────────────
  // Deliberately about MONEY MOVED, not billed value:
  //   salesCollection — the paid portion of this period's bills (udhar excluded)
  //   udharCollection — old dues recovered in this period
  //   totalCollection — everything that came in, less refunds paid out
  //   netInHand       — what should actually be left after expenses
  const salesCollection = salesAndProfit._sum.amountPaid || 0;
  const expensesAmount = expensesAgg._sum.amount || 0;

  // ── Split every rupee collected by HOW it arrived ────────────────────────
  const modes = { cash: 0, upi: 0, card: 0, other: 0 };
  const bucketFor = (raw: string | null | undefined): keyof typeof modes => {
    const m = String(raw || '').toLowerCase();
    if (m.includes('cash')) return 'cash';
    if (m.includes('upi') || m.includes('gpay') || m.includes('phonepe') || m.includes('paytm')) return 'upi';
    if (m.includes('card') || m.includes('debit') || m.includes('credit')) return 'card';
    return 'other';
  };

  for (const s of salePayments) {
    const paid = Number(s.amountPaid) || 0;
    if (paid <= 0) continue;
    const details: any = typeof s.paymentDetails === 'string'
      ? (() => { try { return JSON.parse(s.paymentDetails as string); } catch { return null; } })()
      : s.paymentDetails;

    // Udhar inside a split bill is credit extended, not money received.
    const cash = Number(details?.cash) || 0;
    const upi = Number(details?.upi) || 0;
    const card = Number(details?.card) || 0;
    const splitTotal = cash + upi + card;

    if (splitTotal > 0) {
      modes.cash += cash;
      modes.upi += upi;
      modes.card += card;
      // A rounding gap between the split lines and what was actually paid.
      if (paid > splitTotal) modes.other += paid - splitTotal;
    } else {
      modes[bucketFor(s.paymentType)] += paid;
    }
  }

  // Money received in the Udhar section: dues cleared plus any advance.
  let udharCollection = 0;
  let advanceCollection = 0;
  for (const row of udharPaymentRows) {
    const amt = Number(row.amount) || 0;
    if (amt <= 0) continue;
    if (row.type === 'advance') advanceCollection += amt;
    else udharCollection += amt;
    // note looks like "Payment via UPI - remark"
    const viaMatch = /via\s+([a-z]+)/i.exec(row.note || '');
    modes[bucketFor(viaMatch?.[1] || 'cash')] += amt;
  }

  const totalCollection = salesCollection + udharCollection + advanceCollection - returnsAmount;
  const netInHand = totalCollection - expensesAmount;
  const netProfit = (salesAndProfit._sum.totalProfit || 0) - returnsProfit - expensesAmount;

  const payload: any = {
    summary: {
      today_sales: (salesAndProfit._sum.totalAmount || 0) - returnsAmount,
      today_profit: (salesAndProfit._sum.totalProfit || 0) - returnsProfit,
      expected_profit: (salesAndProfit._sum.totalProfit || 0) - returnsProfit,
      cash_profit: finalProfit - returnsProfit,
      udhar_profit: Math.max(0, (salesAndProfit._sum.totalProfit || 0) - finalProfit),
      total_udhar: totalUdhar,
      period_udhar: Number((udharGivenData as any[])[0]?.total_udhar_given || 0),
      low_stock_count: lowStockCount,
      returns_amount: returnsAmount,
      returns_count: legacyReturnsCount,
      // New cash-flow KPIs
      sales_collection: salesCollection,
      udhar_collection: udharCollection,
      advance_collection: advanceCollection,
      total_collection: totalCollection,
      expenses_amount: expensesAmount,
      expenses_count: expensesAgg._count.id || 0,
      today_expenses_amount: todayExpensesAgg._sum.amount || 0,
      today_expenses_count: todayExpensesAgg._count.id || 0,
      month_expenses_amount: monthExpensesAgg._sum.amount || 0,
      month_expenses_count: monthExpensesAgg._count.id || 0,
      // Purchases KPIs (supplier bills) — same shape as the expenses KPIs.
      purchases_amount: periodPurchasesAgg._sum.totalCost || 0,
      purchases_count: periodPurchasesAgg._count.id || 0,
      today_purchases_amount: todayPurchasesAgg._sum.totalCost || 0,
      today_purchases_count: todayPurchasesAgg._count.id || 0,
      month_purchases_amount: monthPurchasesAgg._sum.totalCost || 0,
      month_purchases_count: monthPurchasesAgg._count.id || 0,
      total_purchases_amount: allTimePurchasesAgg._sum.totalCost || 0,
      total_purchases_count: allTimePurchasesAgg._count.id || 0,
      supplier_payable: supplierPayableAgg._sum.balance || 0,
      net_in_hand: netInHand,
      net_profit: netProfit,
      // How the money arrived, and from where.
      collection_cash: modes.cash,
      collection_upi: modes.upi,
      collection_card: modes.card,
      collection_other: modes.other,
    },
    returnsByReason: returnsByReason.map(r => ({
      reason: r.reason,
      amount: r._sum.amount || 0,
      count: r._count.id || 0,
    })),
    lowStock: lowStock.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      current_stock: p.current_stock,
      min_stock: p.min_stock,
      ...(allShopAccess ? { shopName: shopNameById.get(p.shop_id) } : {}),
    })),
    recentBills: recentBills.map((s) => ({
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
    topProducts: topProd.map(r => ({
      id: r.id,
      name: r.name,
      category: r.category,
      value: Number(r.value || 0),
      qty: Number(r.qty || 0),
      ...(allShopAccess ? { shopName: shopNameById.get(r.shop_id) } : {}),
    })),
    fastMoving: fastProd.map(r => ({
      id: r.id,
      name: r.name,
      category: r.category,
      value: Number(r.value || 0),
      qty: Number(r.qty || 0),
      ...(allShopAccess ? { shopName: shopNameById.get(r.shop_id) } : {}),
    })),
    slowMoving: slowProd.map(r => ({
      id: r.id,
      name: r.name,
      category: r.category,
      current_stock: Number(r.current_stock || 0),
      qty: Number(r.qty || 0),
      ...(allShopAccess ? { shopName: shopNameById.get(r.shop_id) } : {}),
    }))
  };

  // Add ERP / Wholesale specific stats
  if (isWholesaleTierPackage(shop.subscriptionPlan)) {
    const [inventoryValueResult, expiringBatches, recentFeeds] = await Promise.all([
      prisma.$queryRaw<{ total_value: number }[]>`
        SELECT COALESCE(SUM(current_stock * wholesale_cost), 0)::float as total_value
        FROM products
        WHERE shop_id = ANY(${shopIds}::uuid[]) AND current_stock > 0
      `,
      prisma.batch.findMany({
        where: {
          shopId: { in: shopIds },
          quantity: { gt: 0 },
          expiryDate: { lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } // Next 30 days
        },
        include: { product: { select: { name: true } } },
        orderBy: { expiryDate: 'asc' },
        take: 5
      }),
      prisma.$queryRaw`
        SELECT m.id, m.type, m.quantity, m.created_at, m.shop_id, p.name as product_name
        FROM stock_movements m
        JOIN products p ON p.id = m.product_id
        WHERE m.shop_id = ANY(${shopIds}::uuid[])
        ORDER BY m.created_at DESC
        LIMIT 5
      ` as Promise<any[]>,
    ]);

    payload.wholesale = {
      inventoryValue: inventoryValueResult[0]?.total_value || 0,
      expiringBatches: allShopAccess
        ? expiringBatches.map(b => ({ ...b, shopName: shopNameById.get(b.shopId as string) }))
        : expiringBatches,
      recentFeeds: allShopAccess
        ? recentFeeds.map(f => ({ ...f, shopName: shopNameById.get(f.shop_id) }))
        : recentFeeds,
      partyCreditTotal: partyCreditAgg._sum?.totalDue || 0,
      partyCreditCollectionTotal: Number((partyCollectionTotalData as any[])[0]?.total || 0),
      partyCreditCollectionToday: Number((partyCollectionTodayData as any[])[0]?.total || 0),
    };
  }

  setDashboardCache(cacheKey, payload);

  return json(payload);
});
