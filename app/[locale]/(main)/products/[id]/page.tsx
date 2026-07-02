'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useTranslations } from 'next-intl';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/routing';
import { 
  ArrowLeft, Package, TrendingUp, IndianRupee, 
  Calendar, RefreshCw, BarChart3
} from 'lucide-react';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';

const DashboardCharts = dynamic(() => import('@/components/DashboardCharts'), {
  ssr: false,
  loading: () => <div className="h-[300px] bg-slate-900/50 rounded-xl animate-pulse border border-slate-800" />,
});

export default function ProductInsightsPage({ params }: { params: Promise<{ locale: string, id: string }> }) {
  const unwrappedParams = use(params);
  const productId = unwrappedParams.id;
  const t = useTranslations('Dashboard'); // Reuse some translations if needed

  const [loading, setLoading] = useState(true);
  const [insightData, setInsightData] = useState<any>(null);
  
  const [timeframe, setTimeframe] = useState('Last 7 Days');
  const [customDates, setCustomDates] = useState({ start: '', end: '' });
  const [appliedCustomDates, setAppliedCustomDates] = useState({ start: '', end: '' });

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
      start.setDate(1); 
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

  const loadInsights = useCallback(async () => {
    setLoading(true);
    const { start_date, end_date } = getDates();
    try {
      const res = await api.get(`/reports/product-insights/${productId}?start_date=${start_date}&end_date=${end_date}`);
      setInsightData(res.data);
    } catch (e) {
      console.error("Failed to load product insights", e);
    } finally {
      setLoading(false);
    }
  }, [getDates, productId]);

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  if (loading && !insightData) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)]">
        <RefreshCw className="animate-spin text-emerald-500 mb-4" size={40} />
        <p className="text-slate-400 font-medium">Loading insights...</p>
      </div>
    );
  }

  if (!insightData) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-center">
        <Package size={48} className="text-slate-800 mb-4" />
        <p className="text-lg text-slate-300 font-bold">Product not found</p>
        <Link href="/" className="text-emerald-500 hover:text-emerald-400 mt-4 font-medium flex items-center gap-2">
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>
      </div>
    );
  }

  const { product, stats, trend, recentSales } = insightData;

  // Format trend data for chart if DashboardCharts component supports it
  // DashboardCharts usually takes series array.
  // Wait, the existing DashboardCharts takes an array of series or data.
  // We'll create a custom simple rendering or rely on what's available.

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-slate-800 pb-6">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-2">
              {product.name}
            </h1>
            <p className="text-emerald-500 text-sm font-bold uppercase tracking-wider mt-1">{product.category}</p>
          </div>
        </div>
        
        {/* Timeframe Controls */}
        <div className="flex flex-col items-end gap-3">
          <div className="flex flex-wrap gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 shadow-sm">
            {['Last 7 Days', 'Weekly', 'Monthly', 'Custom'].map(tf => (
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
          {timeframe === 'Custom' && (
            <div className="flex items-center gap-2 bg-slate-900 p-1.5 rounded-xl border border-slate-800 shadow-sm animate-in fade-in slide-in-from-top-2">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Product Details Card */}
        <Card className="bg-slate-900 border-slate-800 rounded-2xl overflow-hidden flex flex-col">
          <CardHeader className="bg-slate-800/20 py-4 border-b border-slate-800/50">
            <CardTitle className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Package size={16} className="text-indigo-400" /> Inventory Details
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Current Stock</p>
                <p className="text-2xl font-black text-white">{product.stock} <span className="text-sm text-slate-400 font-medium">{product.unit}</span></p>
              </div>
              <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Min. Stock</p>
                <p className="text-2xl font-black text-slate-300">{product.minStock}</p>
              </div>
            </div>
            <div className="space-y-3 pt-2">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <span className="text-sm text-slate-400 font-medium">Selling Price</span>
                <span className="text-sm font-bold text-white">₹{(product.price || product.sellingPrice || 0).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <span className="text-sm text-slate-400 font-medium">Wholesale Cost</span>
                <span className="text-sm font-bold text-amber-400">₹{(product.cost || product.wholesaleCost || 0).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400 font-medium">Profit Margin</span>
                <span className="text-sm font-bold text-emerald-400">
                  {(product.cost || product.wholesaleCost) > 0 ? ((((product.price || product.sellingPrice || 0) - (product.cost || product.wholesaleCost || 0)) / (product.cost || product.wholesaleCost || 1)) * 100).toFixed(1) : 0}%
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Insight Stats */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-slate-900 border-slate-800 rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center justify-between">
                Total Revenue
                <IndianRupee size={14} className="text-emerald-500" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black text-white">₹{stats.revenue.toLocaleString('en-IN')}</div>
              <p className="text-xs font-medium text-emerald-500/80 mt-1">For selected timeframe</p>
            </CardContent>
          </Card>
          
          <Card className="bg-slate-900 border-slate-800 rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center justify-between">
                Units Sold
                <TrendingUp size={14} className="text-indigo-500" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black text-white">{stats.unitsSold}</div>
              <p className="text-xs font-medium text-slate-500 mt-1">units moved</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800 rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center justify-between">
                Total Profit
                <BarChart3 size={14} className="text-amber-500" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black text-white">₹{stats.profit.toLocaleString('en-IN')}</div>
              <p className="text-xs font-medium text-slate-500 mt-1">from sales</p>
            </CardContent>
          </Card>

          {/* Daily Trend Table / Simple Chart */}
          <Card className="md:col-span-3 bg-slate-900 border-slate-800 rounded-2xl overflow-hidden">
            <CardHeader className="bg-slate-800/20 py-4 border-b border-slate-800/50">
              <CardTitle className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Calendar size={16} className="text-blue-400" /> Daily Sales Trend
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {trend.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-800/30 text-slate-400 text-[10px] uppercase tracking-widest">
                      <tr>
                        <th className="px-6 py-3 font-bold">Date</th>
                        <th className="px-6 py-3 font-bold text-right">Units Sold</th>
                        <th className="px-6 py-3 font-bold text-right">Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {trend.map((t: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-800/20 transition-colors">
                          <td className="px-6 py-3 text-sm font-bold text-slate-200">{t.date}</td>
                          <td className="px-6 py-3 text-sm font-bold text-emerald-400 text-right">{t.qty}</td>
                          <td className="px-6 py-3 text-sm font-black text-white text-right">₹{t.revenue.toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-12 text-center">
                  <p className="text-sm text-slate-500 font-medium">No daily sales to show</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Recent Transactions List */}
      <Card className="bg-slate-900 border-slate-800 rounded-2xl overflow-hidden">
        <CardHeader className="bg-slate-800/20 py-4 border-b border-slate-800/50">
          <CardTitle className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-400" /> Recent Sales Involving this Product
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recentSales.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-800/30 text-slate-400 text-[10px] uppercase tracking-widest">
                  <tr>
                    <th className="px-6 py-3 font-bold">Date & Time</th>
                    <th className="px-6 py-3 font-bold text-right">Quantity</th>
                    <th className="px-6 py-3 font-bold text-right">Price per unit</th>
                    <th className="px-6 py-3 font-bold text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {recentSales.map((s: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-800/20 transition-colors">
                      <td className="px-6 py-4 text-sm font-medium text-slate-300">{s.date}</td>
                      <td className="px-6 py-4 text-sm font-bold text-emerald-400 text-right">{s.qty}</td>
                      <td className="px-6 py-4 text-sm font-medium text-slate-400 text-right">₹{s.price.toLocaleString('en-IN')}</td>
                      <td className="px-6 py-4 text-sm font-black text-white text-right">₹{s.total.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center">
              <p className="text-sm text-slate-500 font-medium">No recent transactions to show</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
