'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useSearchParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import dynamic from 'next/dynamic';
import { Link } from '@/i18n/routing';
import {
  TrendingUp, Wallet, AlertTriangle, ShoppingCart,
  Package, IndianRupee, Calendar, Eye, EyeOff, RefreshCw, X,
  Sparkles, CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { planLabel } from '@/lib/planGates';
import { useBusinessStore } from '@/lib/businessStore';
import UpcomingEventsCard from '@/components/UpcomingEventsCard';

const DashboardCharts = dynamic(() => import('@/components/DashboardCharts'), {
  ssr: false,
  loading: () => <div className="h-[300px] bg-slate-900/50 rounded-xl animate-pulse border border-slate-800" />,
});

function DashboardInner() {
  const t = useTranslations('Dashboard');
  const locale = useLocale();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { fetchProfile } = useBusinessStore();

  const [paymentBanner, setPaymentBanner] = useState<{ plan: string } | null>(null);

  // Detect payment success redirect from PayU
  useEffect(() => {
    if (searchParams.get('payment_success') === '1') {
      const plan = searchParams.get('plan') || 'shop';
      setPaymentBanner({ plan });
      fetchProfile(); // refresh subscription plan in store
      // Clean URL without reload
      router.replace(`/${locale}`, { scroll: false });
      setTimeout(() => setPaymentBanner(null), 8000);
    }
  }, []);

  const [stats, setStats] = useState({
    today_sales: 0,
    today_profit: 0,
    total_udhar: 0,
    low_stock_count: 0
  });
  const [data, setData] = useState<any>({
    salesTrend: [],
    lowStock: [],
    recentBills: [],
    topProducts: []
  });
  const [loading, setLoading] = useState(true);
  const [showProfit, setShowProfit] = useState(true);

  const [timeframe, setTimeframe] = useState('Today');
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
        note: 'Quick refill from dashboard'
      });
      
      // Refresh data
      initData();
      loadFullStockAlerts();
      
      // Clear value
      setRefillValues(prev => {
        const next = { ...prev };
        delete next[productId];
        return next;
      });
    } catch (e) {
      console.error("Failed to refill stock", e);
      alert("Failed to update stock");
    } finally {
      setRefillLoading(null);
    }
  };

  const getDates = useCallback(() => {
    const end = new Date();
    let start = new Date();
    if (timeframe === 'Last 7 Days') {
      start.setDate(end.getDate() - 6);
    } else if (timeframe === 'Weekly') {
      const day = end.getDay();
      const diff = end.getDate() - day + (day === 0 ? -6 : 1);
      start.setDate(diff);
    } else if (timeframe === 'Monthly') {
      start.setDate(1); // Start of month
    } else if (timeframe === 'Custom') {
      if (appliedCustomDates.start && appliedCustomDates.end) {
        return { start_date: appliedCustomDates.start, end_date: appliedCustomDates.end };
      }
    }
    
    const formatDate = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    return { 
      start_date: formatDate(start), 
      end_date: formatDate(end) 
    };
  }, [timeframe, appliedCustomDates]);

  const initData = useCallback(async (showSpinner = true, forceRefresh = false) => {
    if (showSpinner) {
      setLoading(true);
    }
    const { start_date, end_date } = getDates();
    try {
      const res = await api.get(`/reports/dashboard?start_date=${start_date}&end_date=${end_date}${forceRefresh ? '&refresh=true' : ''}`);
      const payload = res.data;
      
      if (payload.summary) {
        setStats({
          today_sales: payload.summary.today_sales ?? 0,
          today_profit: payload.summary.today_profit ?? 0,
          total_udhar: payload.summary.total_udhar ?? 0,
          low_stock_count: payload.summary.low_stock_count ?? 0
        });
      }

      setData({
        lowStock: payload.lowStock || [],
        recentBills: payload.recentBills || [],
        salesTrend: [], // Lazy loaded/calculated
        topProducts: payload.topProducts || []
      });
    } catch (e: any) {
      console.error("Dashboard init error:", e);
      // Detailed error log
      const status = e.response?.status || e.status || 500;
      const errorData = e.response?.data || e.data || {};
      const errorMessage = e.message || errorData.detail || (typeof e === 'string' ? e : "Unknown error");
      
      console.error("Dashboard init detail:", {
        status,
        message: errorMessage,
        data: errorData,
        fullError: e
      });
    } finally {
      if (showSpinner) {
        setLoading(false);
      }
    }
  }, [getDates]);

  const loadFullTopProducts = async () => {
    setLoadingFullTop(true);
    const { start_date, end_date } = getDates();
    try {
      const res = await api.get(`/reports/top-products?limit=50&start_date=${start_date}&end_date=${end_date}`);
      setFullTopProducts(res.data.items || []);
    } catch (e) {
      console.error("Failed to load full top products", e);
    } finally {
      setLoadingFullTop(false);
    }
  };

  const loadFullStockAlerts = async () => {
    setLoadingFullAlerts(true);
    try {
      // The current low-stock endpoint might be limited to 5. 
      // We should check if we need a different endpoint or a limit param.
      // Based on backend reports.py: get_low_stock is .limit(5).
      // I should update backend to allow custom limit or have an "all" version.
      const res = await api.get('/reports/low-stock?limit=100');
      setFullStockAlerts(res.data || []);
    } catch (e) {
      console.error("Failed to load full stock alerts", e);
    } finally {
      setLoadingFullAlerts(false);
    }
  };

  useEffect(() => {
    if (showTopProductsModal && fullTopProducts.length === 0) {
      loadFullTopProducts();
    }
  }, [showTopProductsModal, fullTopProducts.length]);

  useEffect(() => {
    if (showStockAlertsModal && fullStockAlerts.length === 0) {
      loadFullStockAlerts();
    }
  }, [showStockAlertsModal, fullStockAlerts.length]);

  useEffect(() => {
    initData(true, false);
    const onFocus = () => initData(false, false); // silent refresh
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [initData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <RefreshCw className="animate-spin text-emerald-500" size={40} />
      </div>
    );
  }

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
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">{t('title')}</h1>
          <p className="text-slate-500 text-sm font-medium">Business health at a glance</p>
        </div>
        <div className="flex flex-col md:items-end gap-3 w-full md:w-auto">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full">
            <div className="flex flex-wrap gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 shadow-sm">
              {['Today', 'Last 7 Days', 'Weekly', 'Monthly', 'Custom'].map(tf => (
                <button 
                  key={tf} 
                  onClick={() => setTimeframe(tf)} 
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all", 
                    timeframe === tf ? "bg-emerald-500 text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  {tf}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowProfit(!showProfit)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border shadow-sm',
                showProfit 
                  ? 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white' 
                  : 'bg-emerald-600 border-emerald-500 text-white'
              )}
            >
              {showProfit ? <EyeOff size={14} /> : <Eye size={14} />}
              {showProfit ? 'Hide Profit' : 'Show Profit'}
            </button>
          </div>
          {timeframe === 'Custom' && (
            <div className="flex flex-wrap items-center gap-2 bg-slate-900 p-1.5 rounded-xl border border-slate-800 shadow-sm animate-in fade-in slide-in-from-top-2">
              <input 
                type="date" 
                className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500" 
                value={customDates.start} 
                onChange={e => setCustomDates({...customDates, start: e.target.value})} 
              />
              <span className="text-slate-500 text-xs font-medium">to</span>
              <input 
                type="date" 
                className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500" 
                value={customDates.end} 
                onChange={e => setCustomDates({...customDates, end: e.target.value})} 
              />
              <button 
                onClick={() => setAppliedCustomDates(customDates)}
                className="bg-emerald-500 text-slate-900 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-400 transition-colors shadow-sm ml-1"
                disabled={!customDates.start || !customDates.end}
              >
                Apply
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title={t('todaySales')} 
          value={`₹ ${stats.today_sales.toLocaleString('en-IN')}`} 
          icon={<TrendingUp className="text-emerald-500" />} 
        />
        {showProfit && (
          <StatCard 
            title={t('todayProfit')} 
            value={`₹ ${stats.today_profit.toLocaleString('en-IN')}`} 
            icon={<ShoppingCart className="text-indigo-500" />} 
          />
        )}
        <StatCard 
          title={t('totalUdhar')} 
          value={`₹ ${stats.total_udhar.toLocaleString('en-IN')}`} 
          icon={<Wallet className="text-orange-500" />} 
        />
        <StatCard 
          title={t('lowStock')} 
          value={stats.low_stock_count.toString()} 
          icon={<AlertTriangle className="text-red-500" />} 
        />
      </div>

      {/* Upcoming calendar events */}
      <UpcomingEventsCard />

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Products */}
        <Card className="bg-slate-900 border-slate-800 rounded-2xl overflow-hidden flex flex-col">
          <CardHeader className="bg-slate-800/20 py-4 flex flex-row items-center justify-between border-b border-slate-800/50">
            <CardTitle className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <TrendingUp size={16} className="text-emerald-400" /> Top Products
            </CardTitle>
            <button onClick={() => setShowTopProductsModal(true)} className="text-xs bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 px-3 py-1 rounded-full font-bold transition-colors">
              All
            </button>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-y-auto">
            {data.topProducts?.length > 0 ? data.topProducts.map((item: any, idx: number) => (
              <div key={idx} className="flex justify-between items-center px-6 py-4 border-b border-slate-800/50 last:border-0 hover:bg-slate-800/30 transition-colors group">
                <div>
                  <Link href={`/products/${item.id}`} className="text-sm font-bold text-slate-100 group-hover:text-emerald-400 transition-colors flex items-center gap-1">
                    {item.name}
                  </Link>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">{item.category}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-slate-100">₹{item.value.toLocaleString('en-IN')}</p>
                  <p className="text-[10px] text-emerald-500/80 font-bold">{item.qty} units</p>
                </div>
              </div>
            )) : (
              <div className="py-12 flex flex-col items-center justify-center text-center">
                <Package size={24} className="text-slate-700 mb-2" />
                <p className="text-sm text-slate-500 font-medium tracking-tight">No sales data for {timeframe}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Low Stock */}
        <Card className="bg-slate-900 border-slate-800 rounded-2xl overflow-hidden">
          <CardHeader className="bg-slate-800/20 py-4 flex flex-row items-center justify-between border-b border-slate-800/50">
            <CardTitle className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-400" /> Stock Alerts
            </CardTitle>
            <button onClick={() => setShowStockAlertsModal(true)} className="text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 px-3 py-1 rounded-full font-bold transition-colors">
              All
            </button>
          </CardHeader>
          <CardContent className="p-0">
            {data.lowStock.length > 0 ? data.lowStock.slice(0, 5).map((item: any) => (
              <div key={item.id} className="flex justify-between items-center px-6 py-4 border-b border-slate-800 last:border-0 hover:bg-slate-800/30 transition-colors">
                <div>
                  <Link href={`/products/${item.id}`} className="text-sm font-bold text-slate-100 hover:text-red-400 transition-colors">{item.name}</Link>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{item.category}</p>
                </div>
                <span className="text-xs font-black text-red-400 bg-red-400/10 px-2.5 py-1 rounded-full border border-red-400/20">
                  {item.current_stock} Left
                </span>
              </div>
            )) : (
              <div className="py-10 text-center">
                <p className="text-sm text-slate-500 font-medium tracking-tight">Stock levels are healthy</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Bills */}
        <Card className="bg-slate-900 border-slate-800 rounded-2xl overflow-hidden">
          <CardHeader className="bg-slate-800/20 py-4 flex flex-row items-center justify-between border-b border-slate-800/50">
            <CardTitle className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <IndianRupee size={16} className="text-indigo-400" /> Recent Invoices
            </CardTitle>
            <Link href="/billing/invoices" className="text-xs bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 px-3 py-1 rounded-full font-bold transition-colors">
              All
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {data.recentBills.length > 0 ? data.recentBills.slice(0, 5).map((bill: any) => (
              <Link 
                key={bill.id} 
                href={`/billing/invoices/${bill.id}`}
                className="flex justify-between items-center px-6 py-4 border-b border-slate-800 last:border-0 hover:bg-slate-800/30 transition-colors group"
              >
                <div>
                  <p className="text-sm font-bold text-slate-100 uppercase tracking-tighter group-hover:text-indigo-400 transition-colors">
                    {bill.invoice_number || `INV-${bill.id.substring(0, 6)}`}
                  </p>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{bill.payment_type}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-black text-slate-100">
                    ₹{bill.total_amount.toLocaleString()}
                  </span>
                  <Eye size={14} className="text-slate-600 group-hover:text-indigo-400 transition-colors" />
                </div>
              </Link>
            )) : (
              <div className="py-10 text-center">
                <p className="text-sm text-slate-500 font-medium tracking-tight">No recent billing activity</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Products Modal */}
      {showTopProductsModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-800 bg-slate-800/20 rounded-t-2xl">
              <div>
                <h2 className="text-xl font-black text-slate-100 flex items-center gap-2">
                  <TrendingUp className="text-emerald-500" /> All Top Selling Products
                </h2>
                <p className="text-sm text-slate-400 mt-1 font-medium">Sorted by highest revenue ({timeframe})</p>
              </div>
              <button 
                onClick={() => setShowTopProductsModal(false)}
                className="p-2 bg-slate-800 text-slate-400 hover:text-white hover:bg-red-500/20 hover:text-red-400 rounded-xl transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-0 overflow-y-auto flex-1">
              {loadingFullTop ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <RefreshCw className="animate-spin text-emerald-500 mb-4" size={32} />
                  <p className="text-slate-400 font-medium">Loading full list...</p>
                </div>
              ) : fullTopProducts.length > 0 ? (
                <table className="w-full text-left">
                  <thead className="bg-slate-800/50 text-slate-400 text-xs uppercase sticky top-0 backdrop-blur-md z-10">
                    <tr>
                      <th className="px-6 py-4 font-bold">Rank</th>
                      <th className="px-6 py-4 font-bold">Product</th>
                      <th className="px-6 py-4 font-bold">Category</th>
                      <th className="px-6 py-4 font-bold text-right">Revenue</th>
                      <th className="px-6 py-4 font-bold text-right">Units Sold</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {fullTopProducts.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30 transition-colors group">
                        <td className="px-6 py-4">
                          <span className={cn(
                            "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-black",
                            idx === 0 ? "bg-amber-500/20 text-amber-500" :
                            idx === 1 ? "bg-slate-300/20 text-slate-300" :
                            idx === 2 ? "bg-amber-700/20 text-amber-600" :
                            "bg-slate-800 text-slate-500"
                          )}>
                            {idx + 1}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <Link href={`/products/${item.id}`} className="text-sm font-bold text-slate-100 group-hover:text-emerald-400 transition-colors">
                            {item.name}
                          </Link>
                        </td>
                        <td className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">{item.category}</td>
                        <td className="px-6 py-4 text-sm font-black text-slate-100 text-right">₹{item.value.toLocaleString('en-IN')}</td>
                        <td className="px-6 py-4 text-sm font-bold text-emerald-500/80 text-right">{item.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="py-20 flex flex-col items-center justify-center text-center">
                  <Package size={48} className="text-slate-800 mb-4" />
                  <p className="text-lg text-slate-300 font-bold">No products found</p>
                  <p className="text-sm text-slate-500 font-medium mt-1">There were no sales in the selected timeframe.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stock Alerts Modal */}
      {showStockAlertsModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-800 bg-slate-800/20 rounded-t-2xl">
              <div>
                <h2 className="text-xl font-black text-slate-100 flex items-center gap-2">
                  <AlertTriangle className="text-red-500" /> All Stock Alerts
                </h2>
                <p className="text-sm text-slate-400 mt-1 font-medium">Items that have reached minimum stock levels</p>
              </div>
              <button 
                onClick={() => setShowStockAlertsModal(false)}
                className="p-2 bg-slate-800 text-slate-400 hover:text-white hover:bg-red-500/20 hover:text-red-400 rounded-xl transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-0 overflow-y-auto flex-1">
              {loadingFullAlerts ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <RefreshCw className="animate-spin text-red-500 mb-4" size={32} />
                  <p className="text-slate-400 font-medium">Checking inventory...</p>
                </div>
              ) : fullStockAlerts.length > 0 ? (
                <table className="w-full text-left">
                  <thead className="bg-slate-800/50 text-slate-400 text-[10px] uppercase sticky top-0 backdrop-blur-md z-10 border-b border-slate-800">
                    <tr>
                      <th className="px-6 py-4 font-black">Product</th>
                      <th className="px-6 py-4 font-black text-center">In Stock</th>
                      <th className="px-6 py-4 font-black text-center">Min Level</th>
                      <th className="px-6 py-4 font-black">Refill Amount</th>
                      <th className="px-6 py-4 font-black text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {fullStockAlerts.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30 transition-colors group">
                        <td className="px-6 py-4">
                          <Link href={`/products/${item.id}`} className="text-sm font-bold text-slate-100 group-hover:text-red-400 transition-colors">
                            {item.name}
                          </Link>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{item.category}</p>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={cn(
                            "text-sm font-black",
                            item.current_stock <= 0 ? "text-red-500" : "text-orange-500"
                          )}>
                            {item.current_stock}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-slate-600 text-center">{item.min_stock}</td>
                        <td className="px-6 py-4">
                          <input 
                            type="number" 
                            placeholder="+ Qty"
                            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white w-24 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all"
                            value={refillValues[item.id] || ''}
                            onChange={e => setRefillValues({...refillValues, [item.id]: e.target.value})}
                          />
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => handleQuickFill(item.id)}
                            disabled={refillLoading === item.id || !refillValues[item.id]}
                            className="bg-emerald-500 text-slate-900 px-4 py-1.5 rounded-lg text-xs font-black hover:bg-emerald-400 disabled:opacity-20 disabled:cursor-not-allowed transition-all active:scale-95"
                          >
                            {refillLoading === item.id ? <RefreshCw size={14} className="animate-spin mx-auto" /> : 'Refill'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="py-20 flex flex-col items-center justify-center text-center">
                  <Package size={48} className="text-slate-800 mb-4" />
                  <p className="text-lg text-slate-300 font-bold">No stock alerts</p>
                  <p className="text-sm text-slate-500 font-medium mt-1">Your inventory levels are healthy.</p>
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

function StatCard({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <Card className="bg-slate-900 border-slate-800 rounded-2xl border-b-4 border-slate-800 hover:border-emerald-500/50 transition-all duration-300">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-black text-slate-50 tracking-tighter">{value}</div>
      </CardContent>
    </Card>
  );
}
