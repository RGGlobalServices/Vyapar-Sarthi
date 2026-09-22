'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import useSWR from 'swr';
import { useTranslations, useLocale } from 'next-intl';
import { useSearchParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/routing';
import {
  TrendingUp, Wallet, AlertTriangle, ShoppingCart,
  Package, IndianRupee, Eye, EyeOff, RefreshCw, X,
  Sparkles, CheckCircle, Receipt, Banknote, HandCoins, ShoppingBag,
  Percent, Landmark, Truck, Tag, Scale, Users, Calculator,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { planLabel } from '@/lib/planGates';
import { isWholesaleTierPackage, isMillBillingPackage } from '@/lib/config/packageConfig';
import { useBusinessStore } from '@/lib/businessStore';
import { useAuthStore } from '@/lib/store';
import UpcomingEventsCard from '@/components/UpcomingEventsCard';
import { StatCard, rupees, signedRupees } from '@/components/dashboard/StatCard';
import PaymentBreakdown from '@/components/dashboard/PaymentBreakdown';
import { DashboardSkeleton, DashboardError, DashboardEmpty, StaleNotice } from '@/components/dashboard/DashboardStates';
import WholesaleWidgets from './WholesaleWidgets';

type Timeframe = 'today' | 'yesterday' | 'last7Days' | 'weekly' | 'monthly' | 'custom';
const TIMEFRAMES: Timeframe[] = ['today', 'yesterday', 'last7Days', 'weekly', 'monthly', 'custom'];

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">{children}</h2>;
}

function DashboardInner() {
  const t = useTranslations('Dashboard');
  const locale = useLocale();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { fetchProfile, activeShopId, profile, allShopAccess } = useBusinessStore();
  const { role } = useAuthStore();
  // Udyog/Bada Udyog packages track the same due/collection activity under
  // "Party" (customer_transactions is shared across customer & party rows —
  // see /crm/ledger) rather than a separate "Udhar" page, and '/udhar' isn't
  // in their package's module whitelist — linking there trips the route
  // guard and bounces the shopkeeper back with an error toast.
  const isWholesaleTier = isWholesaleTierPackage(profile.packageType);
  const isMill = isMillBillingPackage(profile.packageType);
  const udharHref = isWholesaleTier ? '/party' : '/udhar';

  const [paymentBanner, setPaymentBanner] = useState<{ plan: string } | null>(null);

  // Detect payment success redirect from PayU
  useEffect(() => {
    if (searchParams.get('payment_success') === '1') {
      const plan = searchParams.get('plan') || 'shop';
      setPaymentBanner({ plan });
      fetchProfile();
      router.replace(`/${locale}`, { scroll: false });
      const t = setTimeout(() => setPaymentBanner(null), 8000);
      return () => clearTimeout(t);
    }
  }, [searchParams, fetchProfile, router, locale]);

  const getFormattedPaymentType = (type: string, details: any) => {
    if (type !== 'Split' || !details) return type;
    try {
      const parsed = typeof details === 'string' ? JSON.parse(details) : details;
      const modes = [];
      if (Number(parsed.cash) > 0) modes.push(t('cash'));
      if (Number(parsed.upi) > 0) modes.push(t('upi'));
      if (Number(parsed.card) > 0) modes.push(t('card'));
      if (Number(parsed.udhar) > 0) modes.push(t('udhar'));
      return modes.length > 0 ? modes.join(' + ') : type;
    } catch {
      return type;
    }
  };

  const [showProfit, setShowProfit] = useState(true);

  // The filter is a stable key (not the translated label) so switching language never desyncs it.
  const [tf, setTf] = useState<Timeframe>('today');
  const timeframe = t(tf);
  const [customDates, setCustomDates] = useState({ start: '', end: '' });
  const [appliedCustomDates, setAppliedCustomDates] = useState({ start: '', end: '' });
  const [showTopProductsModal, setShowTopProductsModal] = useState(false);
  const [showStockAlertsModal, setShowStockAlertsModal] = useState(false);
  const [fullTopProducts, setFullTopProducts] = useState<any[]>([]);
  const [fullStockAlerts, setFullStockAlerts] = useState<any[]>([]);
  const [loadingFullTop, setLoadingFullTop] = useState(false);
  const [loadingFullAlerts, setLoadingFullAlerts] = useState(false);
  const [refillLoading, setRefillLoading] = useState<string | null>(null);
  const [refillValues, setRefillValues] = useState<Record<string, string>>({});

  const handleQuickFill = async (productId: string) => {
    const qty = parseFloat(refillValues[productId]);
    if (isNaN(qty) || qty <= 0) return;

    setRefillLoading(productId);
    try {
      await api.post(`/products/${productId}/adjust`, {
        quantity: qty,
        type: 'add',
        note: t('quickRefillNote')
      });

      // Refresh data in the background — no spinner, so the stock-alerts
      // modal (which sits on top of the dashboard) doesn't get blown away
      // by a skeleton while it's open.
      mutateDashboard();
      loadFullStockAlerts();

      // Clear value
      setRefillValues(prev => {
        const next = { ...prev };
        delete next[productId];
        return next;
      });
    } catch (e) {
      console.error("Failed to refill stock", e);
      alert(t('failedToUpdateStock'));
    } finally {
      setRefillLoading(null);
    }
  };

  // The date range is only *sent* to the server, which applies its own day boundaries; nothing is calculated from it here.
  const getDates = useCallback(() => {
    const end = new Date();
    let start = new Date();
    if (tf === 'yesterday') {
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
    } else if (tf === 'last7Days') {
      start.setDate(end.getDate() - 6);
    } else if (tf === 'weekly') {
      const day = end.getDay();
      const diff = end.getDate() - day + (day === 0 ? -6 : 1);
      start.setDate(diff);
    } else if (tf === 'monthly') {
      start.setDate(1); // Start of month
    } else if (tf === 'custom') {
      if (appliedCustomDates.start && appliedCustomDates.end) {
        // If it's a custom date string (YYYY-MM-DD), we should parse it to local bounds
        const d1 = new Date(appliedCustomDates.start);
        d1.setHours(0, 0, 0, 0);
        const d2 = new Date(appliedCustomDates.end);
        d2.setHours(23, 59, 59, 999);
        return { start_date: d1.toISOString(), end_date: d2.toISOString() };
      }
    }

    // Set start of day for start date
    start.setHours(0, 0, 0, 0);
    // Set end of day for end date
    end.setHours(23, 59, 59, 999);

    return {
      start_date: start.toISOString(),
      end_date: end.toISOString()
    };
  }, [tf, appliedCustomDates]);

  const getDynamicTitle = (baseLabel: string) => {
    const labelMap: Record<string, string> = {
      'Sales': t('todaysSales').split(' ')[1] || 'Sales',
      'Profit': t('todaysProfit').split(' ')[1] || 'Profit',
      'Returns': t('todaysReturns').split(' ')[1] || 'Returns'
    };

    // For today, we have exact translations like "आजची विक्री"
    if (tf === 'today') {
      if (baseLabel === 'Sales') return t('todaysSales');
      if (baseLabel === 'Profit') return t('todaysProfit');
      if (baseLabel === 'Returns') return t('todaysReturns');
      return `Today's ${baseLabel}`;
    }

    // For other timeframes, fallback to simple concatenation
    const translatedLabel = labelMap[baseLabel] || baseLabel;

    if (tf === 'custom') {
      if (appliedCustomDates.start && appliedCustomDates.end) {
        const d1 = new Date(appliedCustomDates.start);
        const d2 = new Date(appliedCustomDates.end);
        const diff = Math.max(1, Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1);
        return `${diff} Days ${translatedLabel}`;
      }
    }
    return `${timeframe} ${translatedLabel}`;
  };

  const { start_date, end_date } = getDates();

  // A clear statement of the period being shown.
  const periodText = (() => {
    const fmt = (d: Date) => {
      const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
      // A malformed locale segment in the URL must never crash the page.
      try { return d.toLocaleDateString(locale === 'en' ? 'en-IN' : locale, opts); } catch { return d.toLocaleDateString('en-IN', opts); }
    };
    const a = new Date(start_date), b = new Date(end_date);
    return a.toDateString() === b.toDateString() ? fmt(a) : `${fmt(a)} – ${fmt(b)}`;
  })();

  const fetcher = ([url]: [string, string]) => api.get(url).then(res => res.data);
  // Auto-poll the dashboard so a sale/expense/payment made in another tab or
  // section shows up without the shopkeeper hitting refresh. The backend has
  // a small in-memory cache (dashboardCache.ts) that write routes invalidate
  // on POST, so this polling is cheap most ticks — a cache-hit round-trip —
  // and returns fresh KPIs on the very first tick after any write. Focus /
  // reconnect revalidation still fires on top of this for the tab-switch case.
  const { data: dashboardPayload, error: dashboardError, isValidating, mutate: mutateDashboard } = useSWR(
    activeShopId ? [`/reports/dashboard?start_date=${start_date}&end_date=${end_date}`, activeShopId] : null,
    fetcher,
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      revalidateOnMount: true,
      // Explicitly off (the app-wide SWRProvider turns it on): a different period/shop must never briefly show the previous
      // one's figures under the new label.
      keepPreviousData: false,
      refreshInterval: 8000,
      refreshWhenHidden: false,
      // SWR's default 2s dedupe is enough — the earlier 4000ms swallowed the
      // very common case of "make a bill in another tab, immediately open
      // Dashboard": the mount-time revalidate got deduped against the polling
      // fetch that fired seconds before, so the shopkeeper saw stale numbers
      // until they hit browser refresh.
      dedupingInterval: 2000,
    }
  );

  // Every figure comes straight from the server's summary. A key the server did not send (staff redaction) is simply
  // absent: `has()` gates the card, so it is hidden rather than shown as ₹0 — and nothing is rebuilt client-side.
  const summary: Record<string, any> = dashboardPayload?.summary ?? {};
  const has = (k: string) => typeof summary[k] === 'number';
  const n = (k: string) => Number(summary[k] ?? 0);
  const data = {
    lowStock: dashboardPayload?.lowStock || [],
    recentBills: dashboardPayload?.recentBills || [],
    topProducts: dashboardPayload?.topProducts || [],
    fastMoving: dashboardPayload?.fastMoving || [],
    slowMoving: dashboardPayload?.slowMoving || [],
    returnsByReason: dashboardPayload?.returnsByReason || [],
    wholesale: dashboardPayload?.wholesale || null,
  };
  const showsWholesaleCredit = !!summary.udhar_includes_party;
  const initialLoading = !dashboardPayload && !dashboardError;
  const failedWithoutData = !dashboardPayload && !!dashboardError;
  const isEmptyShop = !!dashboardPayload && n('invoice_count') === 0 && data.recentBills.length === 0 && data.topProducts.length === 0;
  const retryDashboard = () => { mutateDashboard(); };

  const [topProductsError, setTopProductsError] = useState(false);
  const [stockAlertsError, setStockAlertsError] = useState(false);

  const loadFullTopProducts = async () => {
    setLoadingFullTop(true);
    setTopProductsError(false);
    const { start_date, end_date } = getDates();
    try {
      const res = await api.get(`/reports/top-products?limit=50&start_date=${start_date}&end_date=${end_date}`);
      setFullTopProducts(res.data.items || []);
    } catch (e) {
      console.error("Failed to load full top products", e);
      setTopProductsError(true);
    } finally {
      setLoadingFullTop(false);
    }
  };

  const loadFullStockAlerts = async () => {
    setLoadingFullAlerts(true);
    setStockAlertsError(false);
    try {
      const res = await api.get('/reports/low-stock?limit=100');
      setFullStockAlerts(res.data || []);
    } catch (e) {
      console.error("Failed to load full stock alerts", e);
      setStockAlertsError(true);
    } finally {
      setLoadingFullAlerts(false);
    }
  };

  useEffect(() => {
    if (showTopProductsModal && fullTopProducts.length === 0 && !topProductsError) {
      loadFullTopProducts();
    }
  }, [showTopProductsModal, fullTopProducts.length, activeShopId, topProductsError]);

  useEffect(() => {
    if (showStockAlertsModal && fullStockAlerts.length === 0 && !stockAlertsError) {
      loadFullStockAlerts();
    }
  }, [showStockAlertsModal, fullStockAlerts.length, activeShopId, stockAlertsError]);

  // Reset modal data when timeframe or shop changes so it fetches fresh data
  useEffect(() => {
    setFullTopProducts([]);
    setFullStockAlerts([]);
  }, [tf, appliedCustomDates, activeShopId]);

  // No mount-triggered fetch here: useSWR already fetches automatically as
  // soon as `activeShopId` makes the key non-null.

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Payment success banner */}
      {paymentBanner && (
        <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl px-5 py-4 animate-in slide-in-from-top-2">
          <CheckCircle size={20} className="text-emerald-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-bold text-emerald-400">🎉 Payment Successful!</p>
            <p className="text-sm text-slate-300 mt-0.5">
              Your <strong>{planLabel(paymentBanner.plan)}</strong> plan is now active. Enjoy all the new features!
            </p>
          </div>
          <button onClick={() => setPaymentBanner(null)} className="text-slate-500 hover:text-slate-300 p-1">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{t('title')}</h1>
          <p className="text-slate-500 text-sm font-medium">{t('businessHealth')}</p>
          <p data-testid="dashboard-period" className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-1">{t('showingPeriod', { range: periodText })}</p>
        </div>
        <div className="flex flex-col md:items-end gap-3 w-full md:w-auto min-w-0">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full">
            <div className="flex flex-wrap gap-1 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              {TIMEFRAMES.map(k => (
                <button
                  key={k}
                  onClick={() => setTf(k)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                    tf === k ? "bg-emerald-500 text-white dark:text-slate-900 shadow-sm" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  )}
                >
                  {t(k)}
                </button>
              ))}
            </div>
            {has('today_profit') && role !== 'staff' && (
              <button
                onClick={() => setShowProfit(!showProfit)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border shadow-sm',
                  showProfit
                    ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    : 'bg-emerald-600 border-emerald-500 text-white'
                )}
              >
                {showProfit ? <EyeOff size={14} /> : <Eye size={14} />}
                {showProfit ? t('hideProfit') : t('showProfit')}
              </button>
            )}
          </div>
          {tf === 'custom' && (
            <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-slate-900 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm animate-in fade-in slide-in-from-top-2">
              <input
                type="date"
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                value={customDates.start}
                onChange={e => setCustomDates({...customDates, start: e.target.value})}
              />
              <span className="text-slate-500 text-xs font-medium">to</span>
              <input
                type="date"
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                value={customDates.end}
                onChange={e => setCustomDates({...customDates, end: e.target.value})}
              />
              <button
                onClick={() => setAppliedCustomDates(customDates)}
                className="bg-emerald-500 text-white dark:text-slate-900 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-400 transition-colors shadow-sm ml-1"
                disabled={!customDates.start || !customDates.end}
              >
                Apply
              </button>
            </div>
          )}
        </div>
      </div>

      {initialLoading && <DashboardSkeleton />}
      {failedWithoutData && <DashboardError onRetry={retryDashboard} retrying={isValidating} />}

      {dashboardPayload && (<>
      {dashboardError && <StaleNotice onRetry={retryDashboard} />}
      {isEmptyShop && <DashboardEmpty />}

      {/* Row 1 — primary business cards */}
      <section data-testid="dash-primary">
        <div className={cn('grid grid-cols-2 gap-3 md:gap-6', showsWholesaleCredit ? 'lg:grid-cols-5' : 'lg:grid-cols-4')}>
          <StatCard
            title={t('salesBilledValue')}
            value={rupees(n('today_sales'))}
            footnote={t('billedValueNote')}
            icon={<TrendingUp className="text-emerald-500" />}
            href="/reports"
          />
          {has('total_collection') && (
            <StatCard
              title={t('totalCollection')}
              value={rupees(n('total_collection'))}
              icon={<Banknote className="text-emerald-500" />}
              href="/reports"
              accent="emerald"
              footnote={t('collectionFootnote', {
                billing: Math.round(n('sales_collection')).toLocaleString('en-IN'),
                udhar: Math.round(n('udhar_collection')).toLocaleString('en-IN'),
                advance: n('advance_collection') > 0 ? t('advanceSuffix', { amount: Math.round(n('advance_collection')).toLocaleString('en-IN') }) : '',
              })}
            />
          )}
          <StatCard
            title={tf === 'today' ? t('todaysUdharAllCaps') : t('periodUdharAllCaps')}
            value={rupees(n('period_udhar'))}
            icon={<Wallet className="text-orange-500" />}
            href={udharHref}
            accent="amber"
          />
          <StatCard
            title={t('outstandingLabel')}
            value={rupees(n('total_udhar'))}
            subtitle={t('outstandingNote')}
            footnote={showsWholesaleCredit ? t('retailOutstandingNote', { amount: Math.round(n('retail_udhar_outstanding')).toLocaleString('en-IN') }) : undefined}
            icon={<Scale className="text-red-500" />}
            href={udharHref}
            accent="red"
          />
          {showsWholesaleCredit && (
            <StatCard
              title={t('partyOutstandingLabel')}
              value={rupees(n('party_outstanding'))}
              subtitle={t('partyOutstandingNote')}
              icon={<Users className="text-indigo-500" />}
              href="/party"
              accent="indigo"
              highlight
              className="col-span-2 lg:col-span-1"
            />
          )}
        </div>
      </section>

      {/* Row 2 — Mill sales breakdown (Bada Udyog only; every figure is the server's own) */}
      {isMill && has('net_goods_sales') && (
        <section data-testid="dash-breakdown">
          <SectionHeading>{t('financialBreakdown')}</SectionHeading>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-6">
            <StatCard title={t('netGoodsSales')} value={rupees(n('net_goods_sales'))} footnote={t('netGoodsNote')} icon={<Calculator className="text-emerald-500" />} accent="emerald" />
            <StatCard title={t('gstCollected')} value={rupees(n('gst_collected'))} icon={<Percent className="text-blue-500" />} accent="blue" />
            <StatCard title={t('commercialCharges')} value={rupees(n('commercial_charges'))} footnote={t('commercialChargesNote')} icon={<Truck className="text-amber-500" />} accent="amber" />
            <StatCard title={t('discountLabel')} value={rupees(n('discount'))} icon={<Tag className="text-rose-500" />} accent="rose" />
            <StatCard title={t('roundOffLabel')} value={signedRupees(n('round_off'))} icon={<Scale className="text-slate-500" />} />
          </div>
        </section>
      )}

      {/* Row 3 — profit / purchasing / expenses (each card appears only if the server sent its figure) */}
      {(has('today_profit') || has('purchases_amount') || has('expenses_amount')) && (
        <section data-testid="dash-profit">
          <SectionHeading>{t('profitSection')}</SectionHeading>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-6">
            {has('today_profit') && showProfit && (
              <StatCard title={getDynamicTitle('Profit')} value={rupees(n('today_profit'))} icon={<ShoppingCart className="text-indigo-500" />} href="/reports" accent="indigo" />
            )}
            {isMill && has('net_margin') && has('today_profit') && showProfit && (
              <StatCard title={t('marginOnNetGoods')} value={`${(n('net_margin') * 100).toFixed(1)}%`} footnote={t('marginNote')} icon={<Percent className="text-indigo-500" />} accent="indigo" />
            )}
            {has('purchases_amount') && (
              <StatCard
                title={t('purchasesLabel')}
                value={rupees(n('purchases_amount'))}
                subtitle={t('thisMonthAmount', { amount: Math.round(n('month_purchases_amount')).toLocaleString('en-IN') })}
                icon={<ShoppingBag className="text-amber-500" />}
                href="/purchases"
                accent="amber"
              />
            )}
            {showsWholesaleCredit && has('supplier_payable') && (
              <StatCard title={t('supplierPayableTitle')} value={rupees(n('supplier_payable'))} footnote={t('supplierPayableNote')} icon={<Landmark className="text-orange-500" />} href="/purchases" accent="amber" />
            )}
            {has('expenses_amount') && (
              <StatCard
                title={t('expensesLabel')}
                value={rupees(n('expenses_amount'))}
                subtitle={t('thisMonthAmount', { amount: Math.round(n('month_expenses_amount')).toLocaleString('en-IN') })}
                icon={<Receipt className="text-rose-500" />}
                href="/expenses"
                accent="rose"
              />
            )}
          </div>
        </section>
      )}

      {/* Row 4 — payment breakdown */}
      {has('collection_cash') && <PaymentBreakdown summary={summary} />}

      {/* Row 5 — stock & operations */}
      <section data-testid="dash-operations">
        <SectionHeading>{t('operationsSection')}</SectionHeading>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
          <StatCard title={t('lowStockAlerts')} value={n('low_stock_count').toString()} icon={<AlertTriangle className="text-red-500" />} href="/stock" accent={n('low_stock_count') > 0 ? 'red' : 'slate'} />
          <StatCard title={getDynamicTitle('Returns')} value={rupees(n('returns_amount'))} icon={<RefreshCw className="text-purple-500" />} href="/returns" />
        </div>
      </section>

      {data.wholesale && <WholesaleWidgets data={data.wholesale} />}
      {/* Upcoming calendar events */}
      <UpcomingEventsCard />

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* {t('topProducts')} */}
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col">
          <CardHeader className="bg-slate-50 dark:bg-slate-800/20 py-4 flex flex-row items-center justify-between border-b border-slate-200 dark:border-slate-800/50">
            <CardTitle className="text-sm font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2">
              <TrendingUp size={16} className="text-emerald-500 dark:text-emerald-400" /> {t('topProductsSalesValue')}
            </CardTitle>
            <button onClick={() => setShowTopProductsModal(true)} className="text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 px-3 py-1 rounded-full font-bold transition-colors">
              {t('all')}
            </button>
          </CardHeader>
          <p className="px-6 py-2 text-[10px] leading-snug text-slate-500 border-b border-slate-100 dark:border-slate-800/50">{isMill ? t('topProductsBasisMill') : t('topProductsBasis')}</p>
          <CardContent className="p-0 flex-1 overflow-y-auto">
            {data.topProducts?.length > 0 ? data.topProducts.map((item: any, idx: number) => (
              <div key={idx} className="flex justify-between items-center px-6 py-4 border-b border-slate-100 dark:border-slate-800/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                <div>
                  <Link href={`/products/${item.id}`} className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors flex items-center gap-1">
                    {item.name}
                  </Link>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">
                    {item.category}{allShopAccess && item.shopName ? ` · ${item.shopName}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-slate-900 dark:text-slate-100">₹{item.value.toLocaleString('en-IN')}</p>
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-500/80 font-bold">{item.qty} {item.unit || t('unitNone')}</p>
                </div>
              </div>
            )) : (
              <div className="py-12 flex flex-col items-center justify-center text-center">
                <Package size={24} className="text-slate-400 dark:text-slate-700 mb-2" />
                <p className="text-sm text-slate-500 font-medium tracking-tight">{t('noSalesDataFor', { timeframe })}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Low Stock */}
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <CardHeader className="bg-slate-50 dark:bg-slate-800/20 py-4 flex flex-row items-center justify-between border-b border-slate-200 dark:border-slate-800/50">
            <CardTitle className="text-sm font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-500 dark:text-red-400" /> {t('stockAlerts')}
            </CardTitle>
            <button onClick={() => setShowStockAlertsModal(true)} className="text-xs bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 px-3 py-1 rounded-full font-bold transition-colors">
              {t('all')}
            </button>
          </CardHeader>
          {n('low_stock_count') > data.lowStock.length && (
            <p className="px-6 py-2 text-[10px] font-bold text-slate-500 border-b border-slate-100 dark:border-slate-800">{t('lowStockShowing', { shown: data.lowStock.length, total: n('low_stock_count') })}</p>
          )}
          <CardContent className="p-0">
            {data.lowStock.length > 0 ? data.lowStock.slice(0, 5).map((item: any) => (
              <div key={item.id} className="flex justify-between items-center px-6 py-4 border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                <div>
                  <Link href={`/products/${item.id}`} className="text-sm font-bold text-slate-900 dark:text-slate-100 hover:text-red-600 dark:hover:text-red-400 transition-colors">{item.name}</Link>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                    {item.category}{allShopAccess && item.shopName ? ` · ${item.shopName}` : ''}
                  </p>
                </div>
                <span className="text-xs font-black text-red-600 dark:text-red-400 bg-red-500/10 dark:bg-red-400/10 px-2.5 py-1 rounded-full border border-red-200 dark:border-red-400/20">
                  {t('leftSuffix', { count: item.current_stock })}
                </span>
              </div>
            )) : (
              <div className="py-10 text-center">
                <p className="text-sm text-slate-500 font-medium tracking-tight">{t('stockHealthy')}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Bills */}
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <CardHeader className="bg-slate-50 dark:bg-slate-800/20 py-4 flex flex-row items-center justify-between border-b border-slate-200 dark:border-slate-800/50">
            <CardTitle className="text-sm font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2">
              <IndianRupee size={16} className="text-indigo-500 dark:text-indigo-400" /> {t('recentInvoices')}
            </CardTitle>
            <Link href="/billing/invoices" className="text-xs bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20 px-3 py-1 rounded-full font-bold transition-colors">
              {t('all')}
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {data.recentBills.length > 0 ? data.recentBills.slice(0, 5).map((bill: any) => (
              <Link 
                key={bill.id} 
                href={`/billing/invoices/${bill.id}`}
                className="flex justify-between items-center px-6 py-4 border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group"
              >
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-tighter group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {bill.customer_name || t('walkInCustomer')}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded font-mono">
                      {bill.invoice_number || `INV-${bill.id.substring(0, 6)}`}
                    </span>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                      {getFormattedPaymentType(bill.payment_type, bill.payment_details)}
                    </span>
                    {allShopAccess && bill.shopName && (
                      <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider">
                        {bill.shopName}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-black text-slate-900 dark:text-slate-100">
                    ₹{(bill.total_amount || 0).toLocaleString()}
                  </span>
                  <Eye size={14} className="text-slate-400 dark:text-slate-600 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors" />
                </div>
              </Link>
            )) : (
              <div className="py-10 text-center">
                <p className="text-sm text-slate-500 font-medium tracking-tight">{t('noRecentBillingActivity')}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Second Row: Fast & {t('slowMovingItems')} */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* {t('fastMovingItems')} */}
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col">
          <CardHeader className="bg-slate-50 dark:bg-slate-800/20 py-4 flex flex-row items-center justify-between border-b border-slate-200 dark:border-slate-800/50">
            <CardTitle className="text-sm font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2">
              <Sparkles size={16} className="text-blue-500 dark:text-blue-400" /> {t('topMovingProducts')}
            </CardTitle>
          </CardHeader>
          <p className="px-6 py-2 text-[10px] leading-snug text-slate-500 border-b border-slate-100 dark:border-slate-800/50">{t('topMovingNote')}</p>
          <CardContent className="p-0 flex-1 overflow-y-auto max-h-[350px]">
            {data.fastMoving?.length > 0 ? data.fastMoving.map((item: any, idx: number) => (
              <div key={idx} className="flex justify-between items-center px-6 py-4 border-b border-slate-100 dark:border-slate-800/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                <div>
                  <Link href={`/products/${item.id}`} className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors flex items-center gap-1">
                    {item.name}
                  </Link>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">
                    {item.category}{allShopAccess && item.shopName ? ` · ${item.shopName}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-slate-900 dark:text-slate-100">{item.qty} {item.unit || t('unitNone')}</p>
                  <p className="text-[10px] text-blue-600 dark:text-blue-500/80 font-bold">₹{item.value.toLocaleString('en-IN')} {t('revSuffix')}</p>
                </div>
              </div>
            )) : (
              <div className="py-12 flex flex-col items-center justify-center text-center">
                <Package size={24} className="text-slate-400 dark:text-slate-700 mb-2" />
                <p className="text-sm text-slate-500 font-medium tracking-tight">{t('noFastMovingItems')}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* {t('slowMovingItems')} */}
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col">
          <CardHeader className="bg-slate-50 dark:bg-slate-800/20 py-4 flex flex-row items-center justify-between border-b border-slate-200 dark:border-slate-800/50">
            <CardTitle className="text-sm font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2">
              <Package size={16} className="text-orange-500 dark:text-orange-400" /> {t('leastSoldProducts')}
            </CardTitle>
          </CardHeader>
          <p className="px-6 py-2 text-[10px] leading-snug text-slate-500 border-b border-slate-100 dark:border-slate-800/50">{t('leastSoldNote')}</p>
          <CardContent className="p-0 flex-1 overflow-y-auto max-h-[350px]">
            {data.slowMoving?.length > 0 ? data.slowMoving.map((item: any, idx: number) => (
              <div key={idx} className="flex justify-between items-center px-6 py-4 border-b border-slate-100 dark:border-slate-800/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                <div>
                  <Link href={`/products/${item.id}`} className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors flex items-center gap-1">
                    {item.name}
                  </Link>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">
                    {item.category}{allShopAccess && item.shopName ? ` · ${item.shopName}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-slate-900 dark:text-slate-100">
                    {item.qty === 0 ? <span className="text-red-500">{t('soldQty', { qty: 0, unit: item.unit || t('unitNone') })}</span> : t('soldQty', { qty: item.qty, unit: item.unit || t('unitNone') })}
                  </p>
                  <p className="text-[10px] text-orange-600 dark:text-orange-500/80 font-bold">{t('inStockQty', { qty: item.current_stock, unit: item.unit || t('unitNone') })}</p>
                </div>
              </div>
            )) : (
              <div className="py-12 flex flex-col items-center justify-center text-center">
                <CheckCircle size={24} className="text-emerald-400 dark:text-emerald-700 mb-2" />
                <p className="text-sm text-slate-500 font-medium tracking-tight">{t('noSlowMovingItems')}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Third Row: Returns Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col lg:col-span-2">
          <CardHeader className="bg-slate-50 dark:bg-slate-800/20 py-4 flex flex-row items-center justify-between border-b border-slate-200 dark:border-slate-800/50">
            <CardTitle className="text-sm font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2">
              <RefreshCw size={16} className="text-purple-500 dark:text-purple-400" /> {t('materialReturns')} ({timeframe})
            </CardTitle>
            <Link href="/returns" className="text-xs bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 px-3 py-1 rounded-full font-bold transition-colors">
              {t('manageReturns')}
            </Link>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-y-auto max-h-[350px]">
            {data.returnsByReason?.length > 0 ? (
              <div className="p-6">
                <div className="flex flex-col gap-4">
                  {data.returnsByReason.map((item: any, idx: number) => {
                    const percent = Math.round((item.amount / (n('returns_amount') || 1)) * 100);
                    return (
                      <div key={idx} className="flex items-center gap-4">
                        <div className="flex-1">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-bold text-slate-900 dark:text-slate-100 capitalize">{item.reason}</span>
                            <span className="text-xs font-bold text-slate-500">{percent}% (₹{item.amount.toLocaleString('en-IN')})</span>
                          </div>
                          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                            <div className="bg-purple-500 h-2 rounded-full" style={{ width: `${percent}%` }}></div>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1">{item.count} items returned for this reason</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="py-12 flex flex-col items-center justify-center text-center">
                <CheckCircle size={24} className="text-emerald-400 dark:text-emerald-700 mb-2" />
                <p className="text-sm text-slate-500 font-medium tracking-tight">{t('noReturns')}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      </>)}

      {/* {t('topProducts')} Modal */}
      {showTopProductsModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/20 shrink-0">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <TrendingUp className="text-emerald-500" /> {t('all')} {t('topProducts')}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium">{t('sortedByRevenue', { timeframe })}</p>
              </div>
              <button 
                onClick={() => setShowTopProductsModal(false)}
                className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-red-500/20 hover:text-red-600 dark:hover:text-red-400 rounded-xl transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-0 overflow-y-auto flex-1">
              {loadingFullTop ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <RefreshCw className="animate-spin text-emerald-500 mb-4" size={32} />
                  <p className="text-slate-500 dark:text-slate-400 font-medium">{t('loadingFullList')}</p>
                </div>
              ) : fullTopProducts.length > 0 ? (
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 text-xs uppercase sticky top-0 backdrop-blur-md z-10">
                    <tr>
                      <th className="px-6 py-4 font-bold">{t('rankHeader')}</th>
                      <th className="px-6 py-4 font-bold">{t('productHeader')}</th>
                      <th className="px-6 py-4 font-bold">{t('categoryHeader')}</th>
                      {allShopAccess && <th className="px-6 py-4 font-bold">Shop</th>}
                      <th className="px-6 py-4 font-bold text-right">{t('revenueHeader')}</th>
                      <th className="px-6 py-4 font-bold text-right">{t('unitsSoldHeader')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
                    {fullTopProducts.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                        <td className="px-6 py-4">
                          <span className={cn(
                            "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-black",
                            idx === 0 ? "bg-amber-500/20 text-amber-600 dark:text-amber-500" :
                            idx === 1 ? "bg-slate-300/20 text-slate-600 dark:text-slate-300" :
                            idx === 2 ? "bg-amber-700/20 text-amber-700 dark:text-amber-600" :
                            "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-500"
                          )}>
                            {idx + 1}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <Link href={`/products/${item.id}`} className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                            {item.name}
                          </Link>
                        </td>
                        <td className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{item.category}</td>
                        {allShopAccess && (
                          <td className="px-6 py-4 text-xs font-bold text-indigo-600 dark:text-indigo-400">{item.shopName || '-'}</td>
                        )}
                        <td className="px-6 py-4 text-sm font-black text-slate-900 dark:text-slate-100 text-right">₹{item.value.toLocaleString('en-IN')}</td>
                        <td className="px-6 py-4 text-sm font-bold text-emerald-600 dark:text-emerald-500/80 text-right">{item.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="py-20 flex flex-col items-center justify-center text-center">
                  <Package size={48} className="text-slate-300 dark:text-slate-800 mb-4" />
                  <p className="text-lg text-slate-600 dark:text-slate-300 font-bold">{t('noProductsFound')}</p>
                  <p className="text-sm text-slate-500 font-medium mt-1">{t('noSalesInTimeframe')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stock Alerts Modal */}
      {showStockAlertsModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/20 shrink-0">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <AlertTriangle className="text-red-500" /> {t('all')} {t('stockAlerts')}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium">{t('itemsAtMinStockLevel')}</p>
              </div>
              <button 
                onClick={() => setShowStockAlertsModal(false)}
                className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-red-500/20 hover:text-red-600 dark:hover:text-red-400 rounded-xl transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-0 overflow-y-auto flex-1">
              {loadingFullAlerts ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <RefreshCw className="animate-spin text-red-500 mb-4" size={32} />
                  <p className="text-slate-500 dark:text-slate-400 font-medium">{t('checkingInventory')}</p>
                </div>
              ) : fullStockAlerts.length > 0 ? (
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 text-[10px] uppercase sticky top-0 backdrop-blur-md z-10 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-6 py-4 font-black">{t('productHeader')}</th>
                      <th className="px-6 py-4 font-black text-center">{t('inStockHeader')}</th>
                      <th className="px-6 py-4 font-black text-center">{t('minLevelHeader')}</th>
                      <th className="px-6 py-4 font-black">{t('refillAmountHeader')}</th>
                      <th className="px-6 py-4 font-black text-right">{t('actionHeader')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
                    {fullStockAlerts.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                        <td className="px-6 py-4">
                          <Link href={`/products/${item.id}`} className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">
                            {item.name}
                          </Link>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                            {item.category}{allShopAccess && item.shopName ? ` · ${item.shopName}` : ''}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={cn(
                            "text-sm font-black",
                            item.current_stock <= 0 ? "text-red-500" : "text-orange-500"
                          )}>
                            {item.current_stock}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-slate-500 dark:text-slate-600 text-center">{item.min_stock}</td>
                        <td className="px-6 py-4">
                          <input 
                            type="number" 
                            placeholder={t('qtyPlaceholder')}
                            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-white w-24 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all"
                            value={refillValues[item.id] || ''}
                            onChange={e => setRefillValues({...refillValues, [item.id]: e.target.value})}
                          />
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => handleQuickFill(item.id)}
                            disabled={refillLoading === item.id || !refillValues[item.id]}
                            className="bg-emerald-500 text-white dark:text-slate-900 px-4 py-1.5 rounded-lg text-xs font-black hover:bg-emerald-400 disabled:opacity-20 disabled:cursor-not-allowed transition-all active:scale-95"
                          >
                            {refillLoading === item.id ? <RefreshCw size={14} className="animate-spin mx-auto" /> : t('refillBtn')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="py-20 flex flex-col items-center justify-center text-center">
                  <Package size={48} className="text-slate-300 dark:text-slate-800 mb-4" />
                  <p className="text-lg text-slate-600 dark:text-slate-300 font-bold">{t('noStockAlerts')}</p>
                  <p className="text-sm text-slate-500 font-medium mt-1">{t('inventoryHealthy')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="w-8 h-8 animate-spin rounded-full border-b-2 border-emerald-500" /></div>}>
      <DashboardInner />
    </Suspense>
  );
}
