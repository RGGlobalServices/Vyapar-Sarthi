'use client';
import {useState, useEffect} from 'react';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import dynamic from 'next/dynamic';
import {Calendar, Download, FileText, Loader2} from 'lucide-react';
import {cn} from '@/lib/utils';
import api from '@/lib/api';
import {useTranslations} from 'next-intl';
import { exportReportPDF } from '@/lib/pdfExport';
import { useAuthStore } from '@/lib/store';
import { useBusinessStore } from '@/lib/businessStore';

const TopProductsPieChart = dynamic(() => import('@/components/TopProductsPieChart'), { ssr: false });
const ReportsChart = dynamic(() => import('@/components/ReportsChart'), {
  ssr: false,
  loading: () => (
    <div className="lg:col-span-3 h-[472px] bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />
  ),
});

export default function ReportsPage() {
  const t = useTranslations('Reports');
  const { user } = useAuthStore();
  const { profile } = useBusinessStore();
  const [loading, setLoading] = useState(true);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [data, setData] = useState<{
    trend: any[],
    topProducts: { items: any[], total: number, currency: boolean },
    categories: { items: any[], total: number, currency: boolean }
  }>({
    trend: [],
    topProducts: { items: [], total: 0, currency: true },
    categories: { items: [], total: 0, currency: true }
  });

  const [activeTab, setActiveTab] = useState<'revenue' | 'qty' | 'category'>('revenue');

  useEffect(() => {
    const fetchReport = async () => {
      try {
        setLoading(true);
        const [trendRes, topRevRes, topQtyRes, topCatRes] = await Promise.all([
          api.get('/reports/sales-trend'),
          api.get('/reports/top-products?group_by=revenue&limit=10'),
          api.get('/reports/top-products?group_by=quantity&limit=10'),
          api.get('/reports/top-products?group_by=category&limit=10'),
        ]);

        setData({
          trend: trendRes.data,
          topProducts: topRevRes.data,
          categories: topCatRes.data,
          // We can store qty here too if we want a full cache, or just refetch.
          // For simplicity we will stick to fetching once and saving them all if needed.
        });
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
      const res = await api.get(`/reports/top-products?group_by=${tab === 'qty' ? 'quantity' : tab}&limit=10`);
      if (tab === 'category') {
        setData(prev => ({ ...prev, categories: res.data }));
      } else {
        setData(prev => ({ ...prev, topProducts: res.data }));
      }
    } catch(err) {}
  };

  const handleExportCSV = async () => {
    try {
      const res = await api.get('/reports/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
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
        <div className="flex gap-2">
          <button className="bg-slate-800 text-slate-200 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-700 transition-colors">
            <Calendar size={18} />
            {t('last7Days') || 'Last 7 Days'}
          </button>
          
          <button 
            onClick={handleExportPDF}
            disabled={exportingPDF}
            className="bg-blue-500 text-slate-900 px-4 py-2 rounded-lg flex items-center gap-2 font-bold hover:bg-blue-400 transition-all active:scale-95 shadow-lg shadow-blue-500/20 disabled:opacity-50"
          >
            {exportingPDF ? <Loader2 size={18} className="animate-spin"/> : <FileText size={18} />}
            PDF
          </button>

          <button 
            onClick={handleExportCSV}
            className="bg-emerald-500 text-slate-900 px-4 py-2 rounded-lg flex items-center gap-2 font-bold hover:bg-emerald-400 transition-all active:scale-95 shadow-lg shadow-emerald-500/20"
          >
            <Download size={18} />
            CSV
          </button>
        </div>
      </div>

      {/* Full width chart at top */}
      <ReportsChart
        data={(data.trend || []).map((d: any) => ({
          name: typeof d.date === 'string' ? d.date.slice(5) : d.date,
          sales: d.sales ?? d.total ?? 0,
          profit: d.profit ?? 0,
        }))}
        title={t('salesVsProfit') || 'Sales vs Profit'}
        salesLabel={t('sales') || 'Sales'}
        profitLabel={t('profit') || 'Profit'}
      />

      <div className="grid grid-cols-1 gap-6 mt-6">
        <Card className="bg-slate-900 border-slate-800 shadow-xl overflow-hidden">
          <CardHeader className="bg-slate-800/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle className="text-slate-200 xl:text-lg font-bold uppercase tracking-wider">
              {t('topSelling') || 'Smart Insights & Analytics'}
            </CardTitle>
            
            {/* Tabs for Top Products logic */}
            <div className="flex bg-slate-950 rounded-lg p-1 border border-slate-800">
              {(['revenue', 'qty', 'category'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => handleTabChange(mode)}
                  className={cn(
                    'px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide transition-all',
                    activeTab === mode 
                      ? 'bg-emerald-500 text-slate-900 shadow-sm' 
                      : 'text-slate-500 hover:text-slate-300'
                  )}
                >
                  By {mode}
                </button>
              ))}
            </div>
          </CardHeader>

          <CardContent className="p-6">
            <TopProductsPieChart 
              items={activeTab === 'category' ? data.categories.items : data.topProducts.items} 
              total={activeTab === 'category' ? data.categories.total : data.topProducts.total}
              currency={activeTab === 'category' ? data.categories.currency : data.topProducts.currency}
              valueLabel={activeTab === 'qty' ? 'Quantity' : 'Revenue'}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
