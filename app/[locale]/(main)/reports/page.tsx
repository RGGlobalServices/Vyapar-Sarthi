'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  TrendingUp, IndianRupee, Percent, Package, Users, ShoppingCart,
  FileText, Download, Loader2, BarChart3, PieChart, Receipt,
  Wallet, ArrowUpRight, ArrowDownRight, AlertTriangle, Box, Scale
} from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { useBusinessStore } from '@/lib/businessStore';
import { ExportButton } from '@/lib/hooks/useExport';

const ReportFilterBar = dynamic(() => import('@/components/reports/ReportFilterBar'), { ssr: false });
const DrillDownChart = dynamic(() => import('@/components/reports/DrillDownChart'), { ssr: false });
const ReportTable = dynamic(() => import('@/components/reports/ReportTable'), { ssr: false });

type Tab = 'sales' | 'purchases' | 'stock' | 'financials' | 'expenses' | 'crm' | 'staff';

const TABS: { id: Tab; label: string; icon: any; plans?: string[] }[] = [
  { id: 'sales', label: 'Sales', icon: TrendingUp },
  { id: 'financials', label: 'Financials', icon: Scale },
  { id: 'stock', label: 'Stock', icon: Package },
  { id: 'expenses', label: 'Expenses', icon: Wallet },
  { id: 'crm', label: 'CRM', icon: Users },
  { id: 'purchases', label: 'Purchases', icon: ShoppingCart, plans: ['wholesale'] },
  { id: 'staff', label: 'Staff', icon: FileText },
];

function KPICard({ label, value, sub, icon: Icon, color = 'emerald', trend }: any) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600',
    blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600',
    amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600',
    rose: 'bg-rose-100 dark:bg-rose-900/30 text-rose-600',
    purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600',
    indigo: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600',
    slate: 'bg-slate-100 dark:bg-slate-800 text-slate-600',
  };
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorMap[color]}`}>
          <Icon size={18} />
        </div>
        {trend !== undefined && (
          <span className={`flex items-center gap-0.5 text-xs font-bold ${trend >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
            {trend >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-black text-slate-900 dark:text-white leading-tight">{value}</p>
      {sub && <p className="text-xs text-slate-500 font-medium mt-1">{sub}</p>}
    </div>
  );
}

function SectionCard({ title, children, actions }: any) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
        <h3 className="font-black text-sm text-slate-700 dark:text-slate-200 uppercase tracking-wider">{title}</h3>
        {actions}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

// ── SALES TAB ──────────────────────────────────────────────────────────────
function SalesTab({ filters }: { filters: any }) {
  const { activeShopId } = useBusinessStore();
  const [data, setData] = useState<any>(null);
  const [byProduct, setByProduct] = useState<any>(null);
  const [byCategory, setByCategory] = useState<any>(null);
  const [byPayment, setByPayment] = useState<any>(null);
  const [byCustomer, setByCustomer] = useState<any>(null);
  const [gstReport, setGstReport] = useState<any>(null);
  const [gstRegister, setGstRegister] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<'overview' | 'products' | 'categories' | 'customers' | 'payment' | 'gst'>('overview');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = `start_date=${filters.startDate}&end_date=${filters.endDate}&group_by=${filters.groupBy}`;
      const [trend, prod, cat, pay, cust, gstRes, gstRegRes] = await Promise.all([
        api.get(`/reports/engine?module=sales&report_type=trend&${qs}`),
        api.get(`/reports/engine?module=sales&report_type=by_product&${qs}`),
        api.get(`/reports/engine?module=sales&report_type=by_category&${qs}`),
        api.get(`/reports/engine?module=sales&report_type=by_payment&${qs}`),
        api.get(`/reports/engine?module=sales&report_type=by_customer&${qs}`),
        api.get(`/reports/engine?module=sales&report_type=gst&${qs}`),
        api.get(`/reports/engine?module=sales&report_type=gst_register&${qs}`),
      ]);
      setData(trend.data);
      setByProduct(prod.data);
      setByCategory(cat.data);
      setByPayment(pay.data);
      setByCustomer(cust.data);
      setGstReport(gstRes.data);
      setGstRegister(gstRegRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [filters, activeShopId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-emerald-500" size={32} /></div>;

  const summary = data?.summary || {};
  const fmt = (n: number) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  const subTabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'products', label: 'By Product' },
    { id: 'categories', label: 'By Category' },
    { id: 'customers', label: 'By Customer' },
    { id: 'payment', label: 'By Payment' },
    { id: 'gst', label: 'GST' },
  ];

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Total Revenue" value={fmt(summary.revenue || 0)} icon={IndianRupee} color="emerald" />
        <KPICard label="Gross Profit" value={fmt(summary.profit || 0)} icon={TrendingUp} color="blue" />
        <KPICard label="Profit Margin" value={`${(summary.margin || 0).toFixed(1)}%`} icon={Percent} color="amber" />
        <KPICard label="Total Bills" value={(summary.count || 0).toLocaleString()} icon={Receipt} color="purple"
          sub={`₹${summary.outstanding?.toLocaleString('en-IN', { maximumFractionDigits: 0 }) || 0} outstanding`} />
      </div>

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-2">
        {subTabs.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id as any)}
            className={`px-4 py-2 text-xs font-bold rounded-full transition-all ${subTab === t.id ? 'bg-emerald-500 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'overview' && data?.trend && (
        <SectionCard title="Revenue & Profit Trend"
          actions={<ExportButton columns={[{ key: 'date', label: 'Date' }, { key: 'revenue', label: 'Revenue', type: 'currency' }, { key: 'profit', label: 'Profit', type: 'currency' }]} data={data.trend} filename="sales_trend" />}>
          <DrillDownChart type="area" data={data.trend} xKey="date"
            yKeys={[{ key: 'revenue', label: 'Revenue', color: '#10b981' }, { key: 'profit', label: 'Profit', color: '#3b82f6' }]} height={300} />
        </SectionCard>
      )}

      {subTab === 'products' && byProduct?.rows && (
        <SectionCard title="Sales by Product"
          actions={<ExportButton columns={[{ key: 'name', label: 'Product' }, { key: 'category', label: 'Category' }, { key: 'revenue', label: 'Revenue', type: 'currency' }, { key: 'profit', label: 'Profit', type: 'currency' }, { key: 'qty', label: 'Qty', type: 'number' }]} data={byProduct.rows} filename="sales_by_product" />}>
          <ReportTable
            columns={[
              { key: 'name', label: 'Product', sortable: true },
              { key: 'category', label: 'Category', type: 'badge', sortable: true },
              { key: 'revenue', label: 'Revenue', type: 'currency', sortable: true, align: 'right' },
              { key: 'profit', label: 'Profit', type: 'currency', sortable: true, align: 'right' },
              { key: 'qty', label: 'Qty Sold', type: 'number', sortable: true, align: 'right' },
              { key: 'bill_count', label: 'Bills', type: 'number', sortable: true, align: 'right' },
            ]}
            rows={byProduct.rows} maxHeight="480px" />
        </SectionCard>
      )}

      {subTab === 'categories' && byCategory?.rows && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SectionCard title="Revenue by Category">
            <DrillDownChart type="pie" data={byCategory.rows.slice(0, 8)} xKey="category"
              yKeys={[{ key: 'revenue', label: 'Revenue' }]} height={280} />
          </SectionCard>
          <SectionCard title="Category Breakdown"
            actions={<ExportButton columns={[{ key: 'category', label: 'Category' }, { key: 'revenue', label: 'Revenue', type: 'currency' }, { key: 'qty', label: 'Qty', type: 'number' }]} data={byCategory.rows} filename="sales_by_category" />}>
            <ReportTable columns={[
              { key: 'category', label: 'Category', sortable: true },
              { key: 'revenue', label: 'Revenue', type: 'currency', sortable: true, align: 'right' },
              { key: 'profit', label: 'Profit', type: 'currency', sortable: true, align: 'right' },
              { key: 'qty', label: 'Units', type: 'number', sortable: true, align: 'right' },
            ]} rows={byCategory.rows} maxHeight="280px" />
          </SectionCard>
        </div>
      )}

      {subTab === 'customers' && byCustomer?.rows && (
        <SectionCard title="Top Customers by Revenue"
          actions={<ExportButton columns={[{ key: 'name', label: 'Customer' }, { key: 'mobile', label: 'Mobile' }, { key: 'total_spent', label: 'Total Spent', type: 'currency' }, { key: 'outstanding', label: 'Outstanding', type: 'currency' }]} data={byCustomer.rows} filename="sales_by_customer" />}>
          <ReportTable columns={[
            { key: 'name', label: 'Customer', sortable: true },
            { key: 'mobile', label: 'Mobile' },
            { key: 'total_spent', label: 'Total Spent', type: 'currency', sortable: true, align: 'right' },
            { key: 'contributed_profit', label: 'Profit', type: 'currency', sortable: true, align: 'right' },
            { key: 'bill_count', label: 'Bills', type: 'number', sortable: true, align: 'right' },
            { key: 'outstanding', label: 'Outstanding', type: 'currency', sortable: true, align: 'right' },
          ]} rows={byCustomer.rows} maxHeight="480px" />
        </SectionCard>
      )}

      {subTab === 'payment' && byPayment?.rows && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SectionCard title="Collection by Mode">
            <DrillDownChart type="pie" data={byPayment.rows} xKey="method"
              yKeys={[{ key: 'revenue', label: 'Revenue' }]} height={260} />
          </SectionCard>
          <SectionCard
            title="Payment Mode Breakdown"
            actions={<ExportButton
              columns={[
                { key: 'method', label: 'Method' },
                { key: 'revenue', label: 'Billed', type: 'currency' },
                { key: 'collected', label: 'Collected', type: 'currency' },
                { key: 'count', label: 'Bills', type: 'number' },
              ]}
              data={byPayment.rows}
              filename="payment_mode_breakdown"
              title="Payment Mode Breakdown"
            />}
          >
            <ReportTable columns={[
              { key: 'method', label: 'Method', type: 'badge' },
              { key: 'revenue', label: 'Billed', type: 'currency', sortable: true, align: 'right' },
              { key: 'collected', label: 'Collected', type: 'currency', sortable: true, align: 'right' },
              { key: 'count', label: 'Bills', type: 'number', sortable: true, align: 'right' },
            ]} rows={byPayment.rows} />
          </SectionCard>
        </div>
      )}

      {subTab === 'gst' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KPICard label="Taxable Value" value={fmt(gstReport?.totalTaxable || 0)} icon={IndianRupee} color="indigo" />
            <KPICard label="Total GST Collected" value={fmt(gstReport?.totalGst || 0)} icon={TrendingUp} color="indigo" />
            <KPICard label="GST Invoices" value={String(gstReport?.gstInvoiceCount || 0)} icon={IndianRupee} color="blue" />
          </div>
          <SectionCard
            title="GST Summary (rate-wise)"
            actions={gstReport?.rows?.length ? <ExportButton
              columns={[
                { key: 'gst_rate', label: 'GST Rate %', type: 'number' },
                { key: 'taxable_value', label: 'Taxable Value', type: 'currency' },
                { key: 'cgst', label: 'CGST', type: 'currency' },
                { key: 'sgst', label: 'SGST', type: 'currency' },
                { key: 'gst_amount', label: 'Total GST', type: 'currency' },
              ]}
              data={gstReport.rows}
              filename="gst_summary"
              title="GST Summary"
            /> : undefined}
          >
            {gstReport?.rows?.length ? (
              <ReportTable columns={[
                { key: 'gst_rate', label: 'Rate %', type: 'number', align: 'right' },
                { key: 'taxable_value', label: 'Taxable Value', type: 'currency', sortable: true, align: 'right' },
                { key: 'cgst', label: 'CGST', type: 'currency', align: 'right' },
                { key: 'sgst', label: 'SGST', type: 'currency', align: 'right' },
                { key: 'gst_amount', label: 'Total GST', type: 'currency', sortable: true, align: 'right' },
              ]} rows={gstReport.rows} />
            ) : gstReport?.gstInvoiceCount > 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">
                {gstReport.gstInvoiceCount} GST invoice{gstReport.gstInvoiceCount > 1 ? 's' : ''} this period, but none of the products sold have a GST% set — so there's no rate to break down by.
                See the GST Register below for the invoice-wise total, or add GST% to your products for a full rate-wise summary.
              </p>
            ) : (
              <p className="text-sm text-slate-500 py-8 text-center">No GST invoices in this period. Create a bill with GST Invoice selected to see the summary here.</p>
            )}
          </SectionCard>
          <p className="text-[11px] text-slate-400">CGST/SGST shown for same-state sales. Inter-state (IGST) invoices contribute to Total GST but are split as IGST on the invoice itself.</p>

          <SectionCard
            title="GST Register (Invoice-wise)"
            actions={gstRegister?.rows?.length ? <ExportButton
              columns={[
                { key: 'date', label: 'Date', type: 'date' },
                { key: 'invoice_number', label: 'Invoice No.' },
                { key: 'customer_name', label: 'Customer' },
                { key: 'customer_gstin', label: 'Customer GSTIN' },
                { key: 'taxable_value', label: 'Taxable Value', type: 'currency' },
                { key: 'cgst', label: 'CGST', type: 'currency' },
                { key: 'sgst', label: 'SGST', type: 'currency' },
                { key: 'igst', label: 'IGST', type: 'currency' },
                { key: 'total_gst', label: 'Total GST', type: 'currency' },
                { key: 'total_amount', label: 'Invoice Total', type: 'currency' },
              ]}
              data={gstRegister.rows}
              filename="gst_register"
              title="GST Register"
            /> : undefined}
          >
            {gstRegister?.rows?.length ? (
              <ReportTable columns={[
                { key: 'date', label: 'Date', type: 'date', sortable: true },
                { key: 'invoice_number', label: 'Invoice No.' },
                { key: 'customer_name', label: 'Customer' },
                { key: 'customer_gstin', label: 'GSTIN' },
                { key: 'taxable_value', label: 'Taxable', type: 'currency', sortable: true, align: 'right' },
                { key: 'cgst', label: 'CGST', type: 'currency', align: 'right' },
                { key: 'sgst', label: 'SGST', type: 'currency', align: 'right' },
                { key: 'igst', label: 'IGST', type: 'currency', align: 'right' },
                { key: 'total_gst', label: 'Total GST', type: 'currency', sortable: true, align: 'right' },
              ]} rows={gstRegister.rows} maxHeight="420px" />
            ) : (
              <p className="text-sm text-slate-500 py-8 text-center">No GST invoices in this period.</p>
            )}
          </SectionCard>
        </div>
      )}
    </div>
  );
}

// ── FINANCIALS TAB ─────────────────────────────────────────────────────────
function FinancialsTab({ filters }: { filters: any }) {
  const { activeShopId } = useBusinessStore();
  const [pnl, setPnl] = useState<any>(null);
  const [daybook, setDaybook] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<'pnl' | 'daybook' | 'cashflow'>('pnl');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = `start_date=${filters.startDate}&end_date=${filters.endDate}`;
      const [pnlRes, dbRes] = await Promise.all([
        api.get(`/reports/engine?module=financials&report_type=pnl&${qs}`),
        api.get(`/reports/engine?module=financials&report_type=daybook&${qs}`),
      ]);
      setPnl(pnlRes.data);
      setDaybook(dbRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [filters, activeShopId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-emerald-500" size={32} /></div>;

  const fmt = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  // Single source for both the P&L statement's rows and its CSV export.
  const pnlRows = pnl ? [
    { label: 'Gross Revenue (Sales)', value: pnl.revenue, bold: false, indent: false, positive: true },
    { label: 'Cost of Goods Sold', value: pnl.revenue - pnl.gross_profit, bold: false, indent: true, positive: false },
    { label: 'Gross Profit', value: pnl.gross_profit, bold: true, indent: false, positive: pnl.gross_profit >= 0 },
    { label: 'Operating Expenses', value: pnl.expenses, bold: false, indent: true, positive: false },
    { label: 'Staff Salaries', value: pnl.salaries, bold: false, indent: true, positive: false },
    { label: 'Total Overheads', value: pnl.total_overhead, bold: true, indent: false, positive: false },
    { label: 'Net Profit / Loss', value: pnl.net_profit, bold: true, indent: false, positive: pnl.net_profit >= 0, highlight: true },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {[{ id: 'pnl', label: 'P&L Statement' }, { id: 'daybook', label: 'Day Book' }].map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id as any)}
            className={`px-4 py-2 text-xs font-bold rounded-full transition-all ${subTab === t.id ? 'bg-emerald-500 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'pnl' && pnl && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard label="Gross Revenue" value={fmt(pnl.revenue)} icon={IndianRupee} color="emerald" />
            <KPICard label="Gross Profit" value={fmt(pnl.gross_profit)} icon={TrendingUp} color="blue" sub={`${(pnl.gross_margin || 0).toFixed(1)}% margin`} />
            <KPICard label="Total Overhead" value={fmt(pnl.total_overhead)} icon={Wallet} color="rose" sub={`₹${(pnl.expenses || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })} expenses + ₹${(pnl.salaries || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })} salary`} />
            <KPICard label="Net Profit" value={fmt(pnl.net_profit)} icon={BarChart3}
              color={pnl.net_profit >= 0 ? 'emerald' : 'rose'}
              sub={`${(pnl.net_margin || 0).toFixed(1)}% net margin`} />
          </div>
          <SectionCard
            title="Profit & Loss Statement"
            actions={<ExportButton
              columns={[{ key: 'label', label: 'Line Item' }, { key: 'value', label: 'Amount', type: 'currency' }]}
              data={pnlRows.map(r => ({ label: r.label, value: r.positive ? r.value : -Math.abs(r.value || 0) }))}
              filename="profit_and_loss"
              title="Profit & Loss Statement"
            />}
          >
            <div className="space-y-0 divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {pnlRows.map((row, i) => (
                <div key={i} className={`flex justify-between items-center py-3 px-2 ${row.highlight ? 'bg-emerald-50 dark:bg-emerald-900/20 rounded-xl' : ''} ${row.indent ? 'ml-4' : ''}`}>
                  <span className={`${row.bold ? 'font-black text-slate-900 dark:text-white' : 'font-medium text-slate-600 dark:text-slate-400'}`}>
                    {row.label}
                  </span>
                  <span className={`font-black tabular-nums ${row.highlight ? (row.positive ? 'text-emerald-600' : 'text-rose-500') : row.bold ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                    {row.positive ? '+' : '-'}{fmt(Math.abs(row.value || 0))}
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>
        </>
      )}

      {subTab === 'daybook' && daybook && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <KPICard label="Total Inflows" value={`₹${(daybook.inflow_total || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} icon={ArrowUpRight} color="emerald" />
            <KPICard label="Total Outflows" value={`₹${(daybook.outflow_total || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} icon={ArrowDownRight} color="rose" />
            <KPICard label="Net Balance" value={`₹${(daybook.net_balance || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} icon={Scale}
              color={daybook.net_balance >= 0 ? 'emerald' : 'rose'} />
          </div>
          <SectionCard title="Cash Book Entries"
            actions={<ExportButton columns={[{ key: 'type', label: 'Type' }, { key: 'amount', label: 'Amount', type: 'currency' }, { key: 'description', label: 'Description' }, { key: 'createdAt', label: 'Date', type: 'date' }]} data={daybook.entries || []} filename="daybook" />}>
            <ReportTable
              columns={[
                { key: 'type', label: 'Type', type: 'badge', sortable: true },
                { key: 'amount', label: 'Amount', type: 'currency', sortable: true, align: 'right' },
                { key: 'description', label: 'Description' },
                { key: 'createdAt', label: 'Date', type: 'date', sortable: true },
              ]}
              rows={daybook.entries || []} maxHeight="480px" />
          </SectionCard>
        </>
      )}
    </div>
  );
}

// ── STOCK TAB ─────────────────────────────────────────────────────────────
function StockTab({ filters }: { filters: any }) {
  const { activeShopId } = useBusinessStore();
  const [data, setData] = useState<any>(null);
  const [valuation, setValuation] = useState<any>(null);
  const [deadStock, setDeadStock] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<'current' | 'valuation' | 'dead' | 'movement'>('current');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = `start_date=${filters.startDate}&end_date=${filters.endDate}`;
      const [curr, val, dead] = await Promise.all([
        api.get(`/reports/engine?module=stock&report_type=current&${qs}`),
        api.get(`/reports/engine?module=stock&report_type=valuation&${qs}`),
        api.get(`/reports/engine?module=stock&report_type=dead_stock&${qs}`),
      ]);
      setData(curr.data);
      setValuation(val.data);
      setDeadStock(dead.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [filters, activeShopId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-emerald-500" size={32} /></div>;

  const summary = data?.summary || {};
  const fmt = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-6">
      <div className="flex gap-2 flex-wrap">
        {[{ id: 'current', label: 'Current Stock' }, { id: 'valuation', label: 'Valuation' }, { id: 'dead', label: 'Dead Stock' }].map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id as any)}
            className={`px-4 py-2 text-xs font-bold rounded-full transition-all ${subTab === t.id ? 'bg-emerald-500 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'current' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard label="Total Products" value={(summary.totalProducts || 0).toLocaleString()} icon={Package} color="blue" />
            <KPICard label="Stock Value" value={fmt(summary.totalValue || 0)} icon={IndianRupee} color="emerald" />
            <KPICard label="Low Stock" value={(summary.lowCount || 0).toLocaleString()} icon={AlertTriangle} color="amber" />
            <KPICard label="Out of Stock" value={(summary.outCount || 0).toLocaleString()} icon={AlertTriangle} color="rose" />
          </div>
          <SectionCard title="Stock Status"
            actions={<ExportButton columns={[{ key: 'name', label: 'Product' }, { key: 'category', label: 'Category' }, { key: 'current_stock', label: 'Stock', type: 'number' }, { key: 'min_stock', label: 'Min Stock', type: 'number' }, { key: 'stock_value', label: 'Value', type: 'currency' }]} data={data?.rows || []} filename="stock_report" />}>
            <ReportTable
              columns={[
                { key: 'name', label: 'Product', sortable: true },
                { key: 'category', label: 'Category', type: 'badge', sortable: true },
                { key: 'current_stock', label: 'Current Stock', type: 'number', sortable: true, align: 'right' },
                { key: 'min_stock', label: 'Min Stock', type: 'number', sortable: true, align: 'right' },
                { key: 'stock_value', label: 'Stock Value', type: 'currency', sortable: true, align: 'right' },
                { key: 'status', label: 'Status', type: 'badge' },
              ]}
              rows={data?.rows || []} maxHeight="480px" />
          </SectionCard>
        </>
      )}

      {subTab === 'valuation' && valuation?.rows && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SectionCard title="Stock Value by Category">
            <DrillDownChart type="bar" data={valuation.rows} xKey="category"
              yKeys={[{ key: 'stock_value', label: 'Value', color: '#10b981' }]} height={300} />
          </SectionCard>
          <SectionCard
            title="Valuation Breakdown"
            actions={<ExportButton
              columns={[
                { key: 'category', label: 'Category' },
                { key: 'product_count', label: 'Products', type: 'number' },
                { key: 'total_qty', label: 'Qty', type: 'number' },
                { key: 'stock_value', label: 'Value', type: 'currency' },
              ]}
              data={valuation.rows}
              filename="stock_valuation"
              title="Stock Valuation"
            />}
          >
            <ReportTable columns={[
              { key: 'category', label: 'Category', sortable: true },
              { key: 'product_count', label: 'Products', type: 'number', sortable: true, align: 'right' },
              { key: 'total_qty', label: 'Qty', type: 'number', sortable: true, align: 'right' },
              { key: 'stock_value', label: 'Value', type: 'currency', sortable: true, align: 'right' },
            ]} rows={valuation.rows} maxHeight="300px" />
          </SectionCard>
        </div>
      )}

      {subTab === 'dead' && deadStock?.rows && (
        <SectionCard title="Dead Stock (No Sales in Period)"
          actions={<ExportButton columns={[{ key: 'name', label: 'Product' }, { key: 'category', label: 'Category' }, { key: 'current_stock', label: 'Stock', type: 'number' }, { key: 'tied_value', label: 'Tied Value', type: 'currency' }]} data={deadStock.rows} filename="dead_stock" />}>
          <ReportTable
            columns={[
              { key: 'name', label: 'Product', sortable: true },
              { key: 'category', label: 'Category', type: 'badge' },
              { key: 'current_stock', label: 'Stock', type: 'number', sortable: true, align: 'right' },
              { key: 'tied_value', label: 'Tied Capital', type: 'currency', sortable: true, align: 'right' },
            ]}
            rows={deadStock.rows} maxHeight="480px"
            emptyMessage="No dead stock found — all products sold in the selected period." />
        </SectionCard>
      )}
    </div>
  );
}

// ── EXPENSES TAB ──────────────────────────────────────────────────────────
function ExpensesTab({ filters }: { filters: any }) {
  const { activeShopId } = useBusinessStore();
  const [data, setData] = useState<any>(null);
  const [byCategory, setByCategory] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = `start_date=${filters.startDate}&end_date=${filters.endDate}`;
      const [trend, cat] = await Promise.all([
        api.get(`/reports/engine?module=expenses&report_type=trend&${qs}`),
        api.get(`/reports/engine?module=expenses&report_type=by_category&${qs}`),
      ]);
      setData(trend.data);
      setByCategory(cat.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [filters, activeShopId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-emerald-500" size={32} /></div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <KPICard label="Total Expenses" value={`₹${(data?.summary?.total || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} icon={Wallet} color="rose" />
        <KPICard label="Total Transactions" value={(data?.summary?.count || 0).toLocaleString()} icon={Receipt} color="slate" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard
          title="Daily Expense Trend"
          actions={data?.trend?.length ? <ExportButton
            columns={[{ key: 'date', label: 'Date', type: 'date' }, { key: 'amount', label: 'Expenses', type: 'currency' }]}
            data={data.trend}
            filename="daily_expense_trend"
            title="Daily Expense Trend"
          /> : undefined}
        >
          <DrillDownChart type="bar" data={data?.trend || []} xKey="date"
            yKeys={[{ key: 'amount', label: 'Expenses', color: '#ef4444' }]} height={240} />
        </SectionCard>
        <SectionCard
          title="By Category"
          actions={byCategory?.rows?.length ? <ExportButton
            columns={[{ key: 'category', label: 'Category' }, { key: 'amount', label: 'Amount', type: 'currency' }]}
            data={byCategory.rows}
            filename="expenses_by_category"
            title="Expenses by Category"
          /> : undefined}
        >
          <DrillDownChart type="pie" data={byCategory?.rows || []} xKey="category"
            yKeys={[{ key: 'amount', label: 'Amount' }]} height={240} />
        </SectionCard>
      </div>
      <SectionCard title="All Expenses"
        actions={<ExportButton columns={[{ key: 'category', label: 'Category' }, { key: 'amount', label: 'Amount', type: 'currency' }, { key: 'paymentMode', label: 'Mode' }, { key: 'description', label: 'Description' }, { key: 'createdAt', label: 'Date', type: 'date' }]} data={data?.expenses || []} filename="expenses" />}>
        <ReportTable
          columns={[
            { key: 'category', label: 'Category', type: 'badge', sortable: true },
            { key: 'amount', label: 'Amount', type: 'currency', sortable: true, align: 'right' },
            { key: 'paymentMode', label: 'Mode', type: 'badge' },
            { key: 'description', label: 'Description' },
            { key: 'createdAt', label: 'Date', type: 'date', sortable: true },
          ]}
          rows={data?.expenses || []} maxHeight="400px" />
      </SectionCard>
    </div>
  );
}

// ── CRM TAB ───────────────────────────────────────────────────────────────
function CRMTab({ filters }: { filters: any }) {
  const { activeShopId } = useBusinessStore();
  const { profile } = useBusinessStore();
  const isUdyog = profile?.subscriptionPlan === 'wholesale';
  const [outstanding, setOutstanding] = useState<any>(null);
  const [suppliers, setSuppliers] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = `start_date=${filters.startDate}&end_date=${filters.endDate}`;
      const [cust, sup] = await Promise.all([
        api.get(`/reports/engine?module=crm&report_type=outstanding&entity_type=customer&${qs}`),
        isUdyog
          ? api.get(`/reports/engine?module=crm&report_type=outstanding&entity_type=supplier&${qs}`)
          : Promise.resolve({ data: null }),
      ]);
      setOutstanding(cust.data);
      setSuppliers(sup.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [filters, isUdyog, activeShopId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-emerald-500" size={32} /></div>;

  return (
    <div className="space-y-6">
      <div className={cn('grid gap-4', isUdyog ? 'grid-cols-2' : 'grid-cols-1')}>
        <KPICard label="Customer Outstanding" value={`₹${(outstanding?.summary?.total || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} icon={Users} color="rose" sub={`${outstanding?.summary?.count || 0} customers with dues`} />
        {isUdyog && (
          <KPICard label="Supplier Payable" value={`₹${(suppliers?.summary?.total || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} icon={ShoppingCart} color="amber" sub={`${suppliers?.summary?.count || 0} suppliers`} />
        )}
      </div>
      <div className={cn('grid grid-cols-1 gap-6', isUdyog && 'lg:grid-cols-2')}>
        <SectionCard title="Outstanding Customers"
          actions={<ExportButton columns={[{ key: 'name', label: 'Customer' }, { key: 'mobile', label: 'Mobile' }, { key: 'totalDue', label: 'Outstanding', type: 'currency' }]} data={outstanding?.rows || []} filename="outstanding_customers" />}>
          <ReportTable
            columns={[
              { key: 'name', label: 'Customer', sortable: true },
              { key: 'mobile', label: 'Mobile' },
              { key: 'totalDue', label: 'Outstanding', type: 'currency', sortable: true, align: 'right' },
              { key: 'creditLimit', label: 'Credit Limit', type: 'currency', align: 'right' },
            ]}
            rows={outstanding?.rows || []} maxHeight="380px" />
        </SectionCard>
        {isUdyog && (
          <SectionCard title="Outstanding Suppliers"
            actions={<ExportButton columns={[{ key: 'name', label: 'Supplier' }, { key: 'mobile', label: 'Mobile' }, { key: 'balance', label: 'Payable', type: 'currency' }]} data={suppliers?.rows || []} filename="outstanding_suppliers" />}>
            <ReportTable
              columns={[
                { key: 'name', label: 'Supplier', sortable: true },
                { key: 'mobile', label: 'Mobile' },
                { key: 'balance', label: 'Payable', type: 'currency', sortable: true, align: 'right' },
              ]}
              rows={suppliers?.rows || []} maxHeight="380px" />
          </SectionCard>
        )}
      </div>
    </div>
  );
}

// ── STAFF TAB ─────────────────────────────────────────────────────────────
function StaffTab({ filters }: { filters: any }) {
  const { activeShopId } = useBusinessStore();
  const [payroll, setPayroll] = useState<any>(null);
  const [attendance, setAttendance] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = `start_date=${filters.startDate}&end_date=${filters.endDate}`;
      const [pay, att] = await Promise.all([
        api.get(`/reports/engine?module=staff&report_type=payroll&${qs}`),
        api.get(`/reports/engine?module=staff&report_type=attendance&${qs}`),
      ]);
      setPayroll(pay.data);
      setAttendance(att.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [filters, activeShopId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-emerald-500" size={32} /></div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <KPICard label="Total Salaries Paid" value={`₹${(payroll?.summary?.total || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} icon={IndianRupee} color="purple" />
        <KPICard label="Present Days" value={(attendance?.summary?.present || 0).toLocaleString()} icon={Users} color="emerald" />
        <KPICard label="Absent Days" value={(attendance?.summary?.absent || 0).toLocaleString()} icon={AlertTriangle} color="rose" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Salary Payroll"
          actions={<ExportButton columns={[{ key: 'monthYear', label: 'Period' }, { key: 'netAmount', label: 'Amount', type: 'currency' }, { key: 'paymentMode', label: 'Mode' }, { key: 'paidAt', label: 'Date', type: 'date' }]} data={payroll?.rows || []} filename="payroll" />}>
          <ReportTable
            columns={[
              { key: 'staff', label: 'Staff', sortable: false },
              { key: 'monthYear', label: 'Period', type: 'badge', sortable: true },
              { key: 'netAmount', label: 'Net Paid', type: 'currency', sortable: true, align: 'right' },
              { key: 'paymentMode', label: 'Mode', type: 'badge' },
              { key: 'paidAt', label: 'Date', type: 'date', sortable: true },
            ]}
            rows={(payroll?.rows || []).map((r: any) => ({ ...r, staff: r.staff?.name || '—' }))}
            maxHeight="380px" />
        </SectionCard>
        <SectionCard
          title="Attendance Log"
          actions={<ExportButton
            columns={[
              { key: 'staff', label: 'Staff' },
              { key: 'date', label: 'Date', type: 'date' },
              { key: 'status', label: 'Status' },
              { key: 'notes', label: 'Notes' },
            ]}
            data={(attendance?.rows || []).map((r: any) => ({ ...r, staff: r.staff?.name || '—', notes: r.reason || '' }))}
            filename="attendance_log"
            title="Attendance Log"
          />}
        >
          <ReportTable
            columns={[
              { key: 'staff', label: 'Staff', sortable: false },
              { key: 'date', label: 'Date', type: 'date', sortable: true },
              { key: 'status', label: 'Status', type: 'badge', sortable: true },
              { key: 'notes', label: 'Notes' },
            ]}
            rows={(attendance?.rows || []).map((r: any) => ({ ...r, staff: r.staff?.name || '—', notes: r.reason || '' }))}
            maxHeight="380px" />
        </SectionCard>
      </div>
    </div>
  );
}

// ── PURCHASES TAB ─────────────────────────────────────────────────────────
function PurchasesTab({ filters }: { filters: any }) {
  const { activeShopId } = useBusinessStore();
  const [data, setData] = useState<any>(null);
  const [bySupplier, setBySupplier] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = `start_date=${filters.startDate}&end_date=${filters.endDate}`;
      const [trend, sup] = await Promise.all([
        api.get(`/reports/engine?module=purchases&report_type=trend&${qs}`),
        api.get(`/reports/engine?module=purchases&report_type=by_supplier&${qs}`),
      ]);
      setData(trend.data);
      setBySupplier(sup.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [filters, activeShopId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-emerald-500" size={32} /></div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <KPICard label="Total Cost" value={`₹${(data?.summary?.cost || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} icon={ShoppingCart} color="rose" />
        <KPICard label="Total GST" value={`₹${(data?.summary?.gst || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} icon={Percent} color="amber" />
        <KPICard label="Invoices" value={(data?.summary?.count || 0).toLocaleString()} icon={Receipt} color="slate" />
      </div>
      <SectionCard title="Purchase Trend">
        <DrillDownChart type="bar" data={data?.trend || []} xKey="date"
          yKeys={[{ key: 'cost', label: 'Cost', color: '#ef4444' }, { key: 'gst', label: 'GST', color: '#f59e0b' }]} height={260} />
      </SectionCard>
      <SectionCard title="By Supplier"
        actions={<ExportButton columns={[{ key: 'supplier', label: 'Supplier' }, { key: 'cost', label: 'Cost', type: 'currency' }, { key: 'gst', label: 'GST', type: 'currency' }, { key: 'count', label: 'Invoices', type: 'number' }]} data={(bySupplier?.rows || []).map((r: any) => ({ supplier: r.supplier?.name || '—', cost: r.cost, gst: r.gst, count: r.count }))} filename="purchase_by_supplier" />}>
        <ReportTable
          columns={[
            { key: 'supplier', label: 'Supplier' },
            { key: 'cost', label: 'Total Cost', type: 'currency', sortable: true, align: 'right' },
            { key: 'gst', label: 'GST Paid', type: 'currency', sortable: true, align: 'right' },
            { key: 'count', label: 'Invoices', type: 'number', sortable: true, align: 'right' },
          ]}
          rows={(bySupplier?.rows || []).map((r: any) => ({ ...r, supplier: r.supplier?.name || '—' }))}
          maxHeight="380px" />
      </SectionCard>
    </div>
  );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const { profile } = useBusinessStore();
  const [activeTab, setActiveTab] = useState<Tab>('sales');
  const [filters, setFilters] = useState({
    startDate: (() => { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().split('T')[0]; })(),
    endDate: new Date().toISOString().split('T')[0],
    groupBy: 'day' as 'day' | 'week' | 'month',
  });

  const availableTabs = TABS.filter(t => !t.plans || t.plans.includes(profile?.subscriptionPlan || ''));

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm border border-emerald-200 dark:border-emerald-800">
            <BarChart3 size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Reports & Analytics</h1>
            <p className="text-sm text-slate-500 font-medium mt-0.5">Real-time business intelligence dashboard</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <ReportFilterBar onChange={setFilters} showPaymentMode />

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-1 bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800">
        {availableTabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex-1 min-w-[80px] justify-center',
                activeTab === tab.id
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-slate-700'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              )}>
              <Icon size={15} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'sales' && <SalesTab filters={filters} />}
      {activeTab === 'financials' && <FinancialsTab filters={filters} />}
      {activeTab === 'stock' && <StockTab filters={filters} />}
      {activeTab === 'expenses' && <ExpensesTab filters={filters} />}
      {activeTab === 'crm' && <CRMTab filters={filters} />}
      {activeTab === 'staff' && <StaffTab filters={filters} />}
      {activeTab === 'purchases' && <PurchasesTab filters={filters} />}
    </div>
  );
}
