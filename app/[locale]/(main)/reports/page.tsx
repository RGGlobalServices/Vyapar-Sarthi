'use client';
import {useState, useEffect} from 'react';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import dynamic from 'next/dynamic';
import {Calendar, Download, FileText, Loader2, History, IndianRupee, TrendingUp, Percent, X, Box} from 'lucide-react';
import Link from 'next/link';
import {cn} from '@/lib/utils';
import api from '@/lib/api';
import {useTranslations} from 'next-intl';
import { exportReportPDF } from '@/lib/pdfExport';
import { useAuthStore } from '@/lib/store';
import { useBusinessStore } from '@/lib/businessStore';

const TopProductsPieChart = dynamic(() => import('@/components/TopProductsPieChart'), { ssr: false });
const SalesAnalyticsChart = dynamic(() => import('@/components/SalesAnalyticsChart'), {
  ssr: false,
  loading: () => (
    <div className="lg:col-span-3 h-[472px] bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl animate-pulse" />
  ),
});

let cachedReportsData: any = null;

export default function ReportsPage() {
  const t = useTranslations('Reports');
  const { user } = useAuthStore();
  const { profile } = useBusinessStore();
  const [loading, setLoading] = useState(cachedReportsData === null);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [data, setData] = useState<{
    trend: any[],
    topProducts: { items: any[], total: number, currency: boolean },
    categories: { items: any[], total: number, currency: boolean },
    kpis: { revenue: number, profit: number, margin: number }
  }>(cachedReportsData || {
    trend: [],
    topProducts: { items: [], total: 0, currency: true },
    categories: { items: [], total: 0, currency: true },
    kpis: { revenue: 0, profit: 0, margin: 0 }
  });

  const [activeTab, setActiveTab] = useState<'revenue' | 'qty' | 'category'>('revenue');
  const [showFullModal, setShowFullModal] = useState(false);
  const [fullListLoading, setFullListLoading] = useState(false);
  const [fullList, setFullList] = useState<any[]>([]);

  // Calculate default dates
  const getDates = () => {
    const today = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 6);
    return {
      start_date: sevenDaysAgo.toISOString().split('T')[0],
      end_date: today.toISOString().split('T')[0]
    };
  };

  useEffect(() => {
    const fetchReport = async () => {
      if (cachedReportsData === null) {
        setLoading(true);
      }
      try {
        const { start_date, end_date } = getDates();

        const [trendRes, topRevRes, topQtyRes, topCatRes] = await Promise.all([
          api.get('/reports/sales-trend'),
          api.get(`/reports/top-products?group_by=revenue&limit=10&start_date=${start_date}&end_date=${end_date}`),
          api.get(`/reports/top-products?group_by=quantity&limit=10&start_date=${start_date}&end_date=${end_date}`),
          api.get(`/reports/top-products?group_by=category&limit=10&start_date=${start_date}&end_date=${end_date}`),
        ]);

        const totalRev = trendRes.data.reduce((sum: number, d: any) => sum + (d.sales ?? d.total ?? 0), 0);
        const totalProf = trendRes.data.reduce((sum: number, d: any) => sum + (d.profit ?? 0), 0);
        const margin = totalRev > 0 ? (totalProf / totalRev) * 100 : 0;

        const payload = {
          trend: trendRes.data,
          topProducts: topRevRes.data,
          categories: topCatRes.data,
          kpis: { revenue: totalRev, profit: totalProf, margin }
        };
        setData(payload);
        cachedReportsData = payload;
      } catch (err) {
        console.error('Failed to fetch business report:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, []);

  const handleTabChange = async (tab: 'revenue' | 'qty' | 'category') => {
    setActiveTab(tab);
    try {
      const { start_date, end_date } = getDates();
      const res = await api.get(`/reports/top-products?group_by=${tab === 'qty' ? 'quantity' : tab}&limit=10&start_date=${start_date}&end_date=${end_date}`);
      if (tab === 'category') {
        setData(prev => ({ ...prev, categories: res.data }));
      } else {
        setData(prev => ({ ...prev, topProducts: res.data }));
      }
    } catch(err) {}
  };

  useEffect(() => {
    if (showFullModal) {
      const fetchFullList = async () => {
        setFullListLoading(true);
        try {
          const { start_date, end_date } = getDates();
          const groupParam = activeTab === 'qty' ? 'quantity' : activeTab;
          const res = await api.get(`/reports/top-products?group_by=${groupParam}&limit=100&start_date=${start_date}&end_date=${end_date}`);
          setFullList(res.data.items || []);
        } catch (err) {
          console.error(err);
        } finally {
          setFullListLoading(false);
        }
      };
      fetchFullList();
    } else {
      setFullList([]); // clear on close
    }
  }, [showFullModal, activeTab]);

  const handleExportCSV = async () => {
    try {
      let csvString = "Section,Item/Date,Revenue (INR),Secondary Value (Profit/Qty)\n";
      
      csvString += "\n--- SALES TREND ---\n";
      data.trend.forEach((t: any) => {
        csvString += `Trend,${typeof t.date === 'string' ? t.date : ''},${t.sales ?? t.total ?? 0},${t.profit ?? 0}\n`;
      });
      
      csvString += "\n--- TOP PRODUCTS ---\n";
      data.topProducts.items.forEach((p: any) => {
        csvString += `Product,"${(p.name || '').replace(/"/g, '""')}",${p.value ?? 0},${p.qty ?? 0}\n`;
      });

      csvString += "\n--- TOP CATEGORIES ---\n";
      data.categories.items.forEach((c: any) => {
        csvString += `Category,"${(c.name || '').replace(/"/g, '""')}",${c.value ?? 0},${c.qty ?? 0}\n`;
      });

      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Business_Report_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Export CSV failed:', err);
      alert('Failed to export report CSV');
    }
  };

  const handleExportPDF = async () => {
    setExportingPDF(true);
    try {
      await exportReportPDF({
        shopName: user?.storeName || 'Store',
        dateRange: 'Last 30 Days',
        trendData: data.trend,
        topProducts: data.topProducts.items,
        categories: data.categories.items
      });
    } catch (e) {
      console.error(e);
      alert('Failed to generate PDF');
    } finally {
      setExportingPDF(false);
    }
  };

  if (loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <Loader2 className="animate-spin text-emerald-500" size={40} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-emerald-500">{t('title') || 'Business Reports'}</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/en/reports/sales-history" className="bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-4 py-2 rounded-lg flex items-center gap-2 border border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-200 dark:hover:bg-emerald-500/40 transition-colors font-bold shadow-sm">
            <History size={18} />
            {t('deepSales') || 'Deep Sales Analysis'}
          </Link>
          {profile.subscriptionPlan === 'wholesale' && (
            <Link href="/en/reports/wholesale" className="bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 px-4 py-2 rounded-lg flex items-center gap-2 border border-amber-200 dark:border-amber-500/30 hover:bg-amber-200 dark:hover:bg-amber-500/40 transition-colors font-bold shadow-sm">
              <Box size={18} />
              Udyog Reports Suite
            </Link>
          )}
          <button className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg flex items-center gap-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm">
            <Calendar size={18} />
            {t('last7Days') || 'Last 7 Days'}
          </button>
          
          <button 
            onClick={handleExportPDF}
            disabled={exportingPDF}
            className="bg-blue-500 text-white dark:text-slate-900 px-4 py-2 rounded-lg flex items-center gap-2 font-bold hover:bg-blue-400 transition-all active:scale-95 shadow-lg shadow-blue-500/20 disabled:opacity-50"
          >
            {exportingPDF ? <Loader2 size={18} className="animate-spin"/> : <FileText size={18} />}
            PDF
          </button>

          <button 
            onClick={handleExportCSV}
            className="bg-emerald-500 text-white dark:text-slate-900 px-4 py-2 rounded-lg flex items-center gap-2 font-bold hover:bg-emerald-400 transition-all active:scale-95 shadow-lg shadow-emerald-500/20"
          >
            <Download size={18} />
            CSV
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-lg shadow-slate-200/40 dark:shadow-black/40 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
            <IndianRupee size={28} strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">{t('totalRevenue') || 'Total Revenue'}</p>
            <p className="text-2xl font-black text-slate-900 dark:text-slate-100">
              ₹{data.kpis?.revenue?.toLocaleString('en-IN', { maximumFractionDigits: 0 }) || 0}
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-lg shadow-slate-200/40 dark:shadow-black/40 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
            <TrendingUp size={28} strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">{t('totalProfit') || 'Total Profit'}</p>
            <p className="text-2xl font-black text-slate-900 dark:text-slate-100">
              ₹{data.kpis?.profit?.toLocaleString('en-IN', { maximumFractionDigits: 0 }) || 0}
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-lg shadow-slate-200/40 dark:shadow-black/40 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
            <Percent size={28} strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">{t('profitMargin') || 'Profit Margin'}</p>
            <p className="text-2xl font-black text-slate-900 dark:text-slate-100">
              {data.kpis?.margin?.toFixed(1) || 0}%
            </p>
          </div>
        </div>
      </div>

      {/* Full width chart at top */}
      <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800/60 rounded-3xl p-6 shadow-2xl shadow-slate-200/40 dark:shadow-black/40">
        <SalesAnalyticsChart
          data={(data.trend || []).map((d: any) => ({
            date: typeof d.date === 'string' ? d.date.slice(5) : d.date,
            sales: d.sales ?? d.total ?? 0,
            profit: d.profit ?? 0,
          }))}
          title={t('salesVsProfit') || 'Sales vs Profit'}
          salesLabel={t('sales') || 'Sales'}
          profitLabel={t('profit') || 'Profit'}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 mt-6">
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
          <CardHeader className="bg-slate-50 dark:bg-slate-800/20 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800/0">
            <CardTitle className="text-slate-900 dark:text-slate-200 xl:text-lg font-bold uppercase tracking-wider">
              {t('topSelling') || 'Smart Insights & Analytics'}
            </CardTitle>
            
            {/* Tabs for Top Products logic */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex bg-slate-100 dark:bg-slate-950 rounded-lg p-1 border border-slate-200 dark:border-slate-800">
                {(['revenue', 'qty', 'category'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => handleTabChange(mode)}
                    className={cn(
                      'px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide transition-all',
                      activeTab === mode 
                        ? 'bg-emerald-500 text-white dark:text-slate-900 shadow-sm' 
                        : 'text-slate-500 hover:text-slate-900 dark:text-slate-500 dark:hover:text-slate-300'
                    )}
                  >
                    By {mode}
                  </button>
                ))}
              </div>
              <button 
                onClick={() => setShowFullModal(true)}
                className="text-xs bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 px-4 py-1.5 rounded-lg font-bold transition-colors"
              >
                View All
              </button>
            </div>
          </CardHeader>

          <CardContent className="p-6">
            <TopProductsPieChart 
              items={(activeTab === 'category' ? data.categories.items : data.topProducts.items).map(item => ({
                ...item,
                percentage: (activeTab === 'category' ? data.categories.total : data.topProducts.total) > 0 
                  ? Number(((item.value / (activeTab === 'category' ? data.categories.total : data.topProducts.total)) * 100).toFixed(1))
                  : 0
              }))} 
              total={activeTab === 'category' ? data.categories.total : data.topProducts.total}
              currency={activeTab === 'category' ? data.categories.currency : data.topProducts.currency}
              title={activeTab === 'category' ? 'Top Categories' : 'Top Products'}
              valueLabel={activeTab === 'qty' ? 'Quantity' : 'Revenue'}
            />
          </CardContent>
        </Card>
      </div>

      {/* Full List Modal */}
      {showFullModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/20 shrink-0">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <TrendingUp className="text-emerald-500" /> Full {activeTab === 'category' ? 'Categories' : 'Products'} List
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium">Ranked by highest {activeTab === 'qty' ? 'quantity' : 'revenue'}</p>
              </div>
              <button 
                onClick={() => setShowFullModal(false)}
                className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-red-500/20 hover:text-red-600 dark:hover:text-red-400 rounded-xl transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-0 overflow-y-auto flex-1">
              {fullListLoading ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <Loader2 className="animate-spin text-emerald-500 mb-4" size={32} />
                  <p className="text-slate-500 dark:text-slate-400 font-medium">Loading full list...</p>
                </div>
              ) : fullList.length > 0 ? (
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 text-xs uppercase sticky top-0 backdrop-blur-md z-10">
                    <tr>
                      <th className="px-6 py-4 font-bold">Rank</th>
                      <th className="px-6 py-4 font-bold">{activeTab === 'category' ? 'Category' : 'Product'}</th>
                      <th className="px-6 py-4 font-bold text-right">Revenue</th>
                      <th className="px-6 py-4 font-bold text-right">Units Sold</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
                    {fullList.map((item, idx) => (
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
                        <td className="px-6 py-4 text-sm font-bold text-slate-900 dark:text-slate-100">
                          {item.name}
                        </td>
                        <td className="px-6 py-4 text-sm font-black text-slate-900 dark:text-slate-100 text-right">₹{item.value.toLocaleString('en-IN')}</td>
                        <td className="px-6 py-4 text-sm font-bold text-emerald-600 dark:text-emerald-500/80 text-right">{item.qty ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="py-20 flex flex-col items-center justify-center text-center">
                  <FileText size={48} className="text-slate-300 dark:text-slate-800 mb-4" />
                  <p className="text-lg text-slate-600 dark:text-slate-300 font-bold">No data found</p>
                  <p className="text-sm text-slate-500 font-medium mt-1">There were no sales in the selected timeframe.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
