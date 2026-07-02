'use client';
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Download, TrendingUp, Package, History, X, Calendar, IndianRupee, PackageOpen, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import dynamic from 'next/dynamic';
import { useBusinessStore } from '@/lib/businessStore';
import * as XLSX from 'xlsx';
import Link from 'next/link';

// Use modern stylish charts
const SalesAnalyticsChart = dynamic(() => import('@/components/SalesAnalyticsChart'), {
  ssr: false,
  loading: () => <div className="h-[450px] w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl animate-pulse" />
});

const SalesFlowChart = dynamic(() => import('@/components/analytics/SalesFlowChart'), {
  ssr: false,
  loading: () => <div className="h-[300px] w-full bg-slate-100 dark:bg-slate-900 rounded-3xl animate-pulse" />
});

const StockHealthBarChart = dynamic(() => import('@/components/analytics/StockHealthBarChart'), {
  ssr: false,
  loading: () => <div className="h-[300px] w-full bg-slate-100 dark:bg-slate-900 rounded-3xl animate-pulse" />
});

export default function SalesHistoryPage() {
  const t = useTranslations('Reports'); // Or specific translation namespace
  const { profile } = useBusinessStore();
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<'day' | 'week' | 'month' | 'quarter' | 'year'>('month');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  
  const [data, setData] = useState<{
    kpis: { totalRevenue: number, totalProfit: number, totalUdhar: number, averageOrderValue: number, stockValuation: number, lowStockAlerts: number },
    trend: { date: string, sales: number, profit: number }[],
    paymentFlow: { name: string, value: number }[],
    stockHealth: { name: string, salesVelocity: number, currentStock: number }[]
  }>({ 
    kpis: { totalRevenue: 0, totalProfit: 0, totalUdhar: 0, averageOrderValue: 0, stockValuation: 0, lowStockAlerts: 0 },
    trend: [], 
    paymentFlow: [],
    stockHealth: []
  });

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      try {
        let url = `/reports/deep-analytics?timeframe=${timeframe}`;
        if (startDate && endDate) {
          url += `&startDate=${startDate}&endDate=${endDate}`;
        } else if (startDate) {
          url += `&startDate=${startDate}`;
        }
        const res = await api.get(url);
        setData(res.data);
      } catch (err) {
        console.error('Failed to fetch sales history:', err);
      } finally {
        setLoading(false);
      }
    };
    // Fetch when timeframe or valid date ranges change
    if ((startDate && endDate) || (!startDate && !endDate)) {
      fetchHistory();
    }
  }, [timeframe, startDate, endDate]);

  const handleExportExcel = () => {
    if (!data.trend.length && !data.stockHealth.length) return;
    
    // Create Workbook
    const wb = XLSX.utils.book_new();

    // Sheet 1: KPIs
    const kpiWs = XLSX.utils.json_to_sheet([{
      'Total Revenue': data.kpis.totalRevenue,
      'Total Profit': data.kpis.totalProfit,
      'Total Udhar (Credit)': data.kpis.totalUdhar,
      'Average Order Value': data.kpis.averageOrderValue,
      'Stock Valuation': data.kpis.stockValuation,
      'Low Stock Alerts': data.kpis.lowStockAlerts
    }]);
    XLSX.utils.book_append_sheet(wb, kpiWs, 'Executive Summary');

    // Sheet 2: Trend
    if (data.trend.length) {
      const trendWs = XLSX.utils.json_to_sheet(data.trend.map(t => ({
        'Date': t.date,
        'Revenue': t.sales,
        'Profit': t.profit
      })));
      XLSX.utils.book_append_sheet(wb, trendWs, 'Sales Trend');
    }

    // Sheet 3: Stock Health
    if (data.stockHealth.length) {
      const stockWs = XLSX.utils.json_to_sheet(data.stockHealth.map(s => ({
        'Product Name': s.name,
        'Sales Velocity': s.salesVelocity,
        'Current Stock Level': s.currentStock
      })));
      XLSX.utils.book_append_sheet(wb, stockWs, 'Stock Health');
    }

    // Sheet 4: Payment Flows
    if (data.paymentFlow.length) {
      const flowWs = XLSX.utils.json_to_sheet(data.paymentFlow.map(f => ({
        'Payment Method': f.name,
        'Total Collected': f.value
      })));
      XLSX.utils.book_append_sheet(wb, flowWs, 'Payment Flow');
    }
    
    // Save
    XLSX.writeFile(wb, `Deep_Analytics_Pro_Report_${timeframe}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: (profile as any)?.currency || 'INR', maximumFractionDigits: 0 }).format(val);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Link href="/en/reports" className="text-emerald-500 hover:text-emerald-600 flex items-center gap-2 text-sm font-bold mb-2">
            &larr; Back to Reports
          </Link>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-3">
            <History className="text-emerald-500" size={32} />
            Sales Analysis Dashboard
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Deep dive into your past sales trends and product performance.</p>
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={handleExportExcel}
            disabled={loading || data.trend.length === 0}
            className="bg-emerald-500 text-white dark:text-slate-900 px-4 py-2 rounded-lg flex items-center gap-2 font-bold hover:bg-emerald-400 transition-all active:scale-95 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
          >
            <Download size={18} />
            Export Excel
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col xl:flex-row gap-4 xl:items-center">
        {/* Timeframe Selector */}
        <div className="flex flex-wrap gap-2 bg-slate-100 dark:bg-slate-800/50 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700/50 w-fit">
          {(['day', 'week', 'month', 'quarter', 'year'] as const).map(tf => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={cn(
                'px-5 py-2 rounded-lg text-sm font-bold capitalize transition-all',
                timeframe === tf 
                  ? 'bg-white dark:bg-slate-900 text-emerald-500 shadow-md ring-1 ring-slate-200 dark:ring-slate-700' 
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              )}
            >
              By {tf}
            </button>
          ))}
        </div>

        {/* Date Range Picker */}
        <div className="flex items-center gap-3 bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-700/50 shadow-sm w-fit transition-all focus-within:border-emerald-500/50 focus-within:ring-2 focus-within:ring-emerald-500/20">
          <Calendar size={18} className="text-emerald-500 ml-2" />
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-2">
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)} 
              className="bg-transparent border-none text-sm font-medium text-slate-700 dark:text-slate-300 focus:ring-0 outline-none py-1.5 cursor-pointer w-[120px]"
            />
            <span className="text-slate-400 font-bold px-1">→</span>
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)} 
              className="bg-transparent border-none text-sm font-medium text-slate-700 dark:text-slate-300 focus:ring-0 outline-none py-1.5 cursor-pointer w-[120px]"
            />
          </div>
          {(startDate || endDate) && (
            <button onClick={() => { setStartDate(''); setEndDate(''); }} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-slate-400 hover:text-red-500 transition-colors mr-1">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="h-[50vh] flex items-center justify-center">
          <Loader2 className="animate-spin text-emerald-500" size={40} />
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* KPI Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-lg shadow-slate-200/40 dark:shadow-black/40 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <IndianRupee size={24} strokeWidth={2.5} />
                </div>
                <span className="text-xs font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 rounded-full">+ Total Revenue</span>
              </div>
              <p className="text-3xl font-black text-slate-900 dark:text-slate-100">{formatCurrency(data.kpis.totalRevenue)}</p>
            </div>

            <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-lg shadow-slate-200/40 dark:shadow-black/40 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <TrendingUp size={24} strokeWidth={2.5} />
                </div>
                <span className="text-xs font-bold text-blue-500 bg-blue-50 dark:bg-blue-500/10 px-2 py-1 rounded-full">+ Gross Profit</span>
              </div>
              <p className="text-3xl font-black text-slate-900 dark:text-slate-100">{formatCurrency(data.kpis.totalProfit)}</p>
            </div>

            <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-lg shadow-slate-200/40 dark:shadow-black/40 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                  <AlertTriangle size={24} strokeWidth={2.5} />
                </div>
                <span className="text-xs font-bold text-rose-500 bg-rose-50 dark:bg-rose-500/10 px-2 py-1 rounded-full">- Outstanding Udhar</span>
              </div>
              <p className="text-3xl font-black text-slate-900 dark:text-slate-100">{formatCurrency(data.kpis.totalUdhar)}</p>
            </div>

            <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-lg shadow-slate-200/40 dark:shadow-black/40 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <PackageOpen size={24} strokeWidth={2.5} />
                </div>
                <span className="text-xs font-bold text-amber-500 bg-amber-50 dark:bg-amber-500/10 px-2 py-1 rounded-full">= Stock Value</span>
              </div>
              <p className="text-3xl font-black text-slate-900 dark:text-slate-100">{formatCurrency(data.kpis.stockValuation)}</p>
            </div>
          </div>

          {/* Trend Chart */}
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800/60 rounded-3xl p-6 shadow-2xl shadow-slate-200/40 dark:shadow-black/40">
            <SalesAnalyticsChart
              data={data.trend}
              title={`Sales & Profit Trend (${timeframe})`}
              salesLabel="Revenue"
              profitLabel="Profit"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SalesFlowChart data={data.paymentFlow} title="Payment Flow" />
            <StockHealthBarChart data={data.stockHealth} title="Velocity vs Stock Health" />
          </div>
        </div>
      )}
    </div>
  );
}
