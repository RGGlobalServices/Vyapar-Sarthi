'use client';

import { useState, useEffect } from 'react';
import { useBusinessStore } from '@/lib/businessStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Box, ShoppingCart, TrendingUp, DollarSign, PackageOpen, AlertOctagon, Download, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { exportReportPDF } from '@/lib/pdfExport';

export default function WholesaleReportsPage() {
  const { profile } = useBusinessStore();
  const [activeTab, setActiveTab] = useState('valuation');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await api.get('/reports/wholesale');
        setData(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (profile.subscriptionPlan !== 'wholesale') {
    return <div className="p-10 text-center">Udyog Plan Required</div>;
  }

  const tabs = [
    { id: 'valuation', label: 'Stock Valuation', icon: DollarSign },
    { id: 'expiry', label: 'Expiry Report', icon: AlertOctagon },
    { id: 'purchases', label: 'Purchase Report', icon: ShoppingCart },
    { id: 'sales', label: 'Sales & Profit', icon: TrendingUp },
  ];

  const handleExport = () => {
    // Generate CSV for active tab
    if (!data) return;
    let csv = '';
    
    if (activeTab === 'valuation') {
      csv = 'Product,SKU,Quantity,Unit Cost,Total Value\n';
      data.valuation.forEach((v: any) => {
        csv += `${v.name},${v.sku || ''},${v.current_stock},${v.wholesale_cost},${v.current_stock * v.wholesale_cost}\n`;
      });
    } else if (activeTab === 'expiry') {
      csv = 'Product,Batch,Quantity,Expiry Date\n';
      data.expiry.forEach((e: any) => {
        csv += `${e.product.name},${e.batchNumber || ''},${e.quantity},${new Date(e.expiryDate).toLocaleDateString()}\n`;
      });
    } else if (activeTab === 'purchases') {
      csv = 'Date,Invoice,Supplier,Amount\n';
      data.purchases.forEach((p: any) => {
        csv += `${new Date(p.date).toLocaleDateString()},${p.invoiceNumber},${p.supplier?.name},${p.totalAmount}\n`;
      });
    } else if (activeTab === 'sales') {
      csv = 'Date,Invoice,Amount,Profit\n';
      data.sales.forEach((s: any) => {
        csv += `${new Date(s.createdAt).toLocaleDateString()},${s.invoice_number},${s.totalAmount},${s.totalProfit}\n`;
      });
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report_${activeTab}_${new Date().getTime()}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Box className="text-emerald-400" /> Udyog Reports
          </h1>
          <p className="text-slate-400 text-sm mt-1">Detailed inventory and financial reports.</p>
        </div>
        <button onClick={handleExport} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 text-slate-900 font-bold rounded-xl hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/20">
          <Download size={18} /> Export CSV
        </button>
      </div>

      <div className="flex overflow-x-auto gap-2 pb-2 hide-scrollbar">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm whitespace-nowrap transition-colors",
              activeTab === tab.id ? "bg-emerald-500 text-slate-900 shadow-lg shadow-emerald-500/20" : "bg-slate-900 text-slate-400 border border-slate-800 hover:bg-slate-800 hover:text-slate-200"
            )}
          >
            <tab.icon size={16} /> {tab.label}
          </button>
        ))}
      </div>

      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>
          ) : !data ? (
            <div className="p-20 text-center text-slate-500">Failed to load reports</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-950 text-slate-400 text-xs uppercase font-medium">
                  {activeTab === 'valuation' && (
                    <tr>
                      <th className="px-5 py-4">Product Name</th>
                      <th className="px-5 py-4">SKU / Code</th>
                      <th className="px-5 py-4 text-right">In Stock</th>
                      <th className="px-5 py-4 text-right">Unit Cost</th>
                      <th className="px-5 py-4 text-right font-bold text-emerald-400">Total Value</th>
                    </tr>
                  )}
                  {activeTab === 'expiry' && (
                    <tr>
                      <th className="px-5 py-4">Product Name</th>
                      <th className="px-5 py-4">Batch No</th>
                      <th className="px-5 py-4 text-right">Qty Left</th>
                      <th className="px-5 py-4 text-right">Expiry Date</th>
                      <th className="px-5 py-4">Status</th>
                    </tr>
                  )}
                  {activeTab === 'purchases' && (
                    <tr>
                      <th className="px-5 py-4">Date</th>
                      <th className="px-5 py-4">Invoice No</th>
                      <th className="px-5 py-4">Supplier</th>
                      <th className="px-5 py-4 text-right">Amount</th>
                    </tr>
                  )}
                  {activeTab === 'sales' && (
                    <tr>
                      <th className="px-5 py-4">Date</th>
                      <th className="px-5 py-4">Invoice No</th>
                      <th className="px-5 py-4 text-right">Sales Amount</th>
                      <th className="px-5 py-4 text-right">Profit</th>
                      <th className="px-5 py-4 text-right">Margin %</th>
                    </tr>
                  )}
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {activeTab === 'valuation' && data.valuation.map((v: any) => (
                    <tr key={v.id} className="hover:bg-slate-800/30">
                      <td className="px-5 py-4 font-bold text-white">{v.name}</td>
                      <td className="px-5 py-4 font-mono text-xs">{v.sku || '-'}</td>
                      <td className="px-5 py-4 text-right">{v.current_stock}</td>
                      <td className="px-5 py-4 text-right">₹{v.wholesale_cost || 0}</td>
                      <td className="px-5 py-4 text-right font-black text-emerald-400">₹{(v.current_stock * (v.wholesale_cost || 0)).toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                  
                  {activeTab === 'expiry' && data.expiry.map((e: any) => {
                    const daysLeft = Math.ceil((new Date(e.expiryDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
                    return (
                      <tr key={e.id} className="hover:bg-slate-800/30">
                        <td className="px-5 py-4 font-bold text-white">{e.product.name}</td>
                        <td className="px-5 py-4 font-mono text-xs">{e.batchNumber || '-'}</td>
                        <td className="px-5 py-4 text-right font-bold text-amber-500">{e.quantity}</td>
                        <td className="px-5 py-4 text-right">{new Date(e.expiryDate).toLocaleDateString()}</td>
                        <td className="px-5 py-4">
                          {daysLeft < 0 ? <span className="text-rose-500 font-bold bg-rose-500/10 px-2 py-1 rounded">Expired</span> : 
                           daysLeft <= 30 ? <span className="text-amber-500 font-bold bg-amber-500/10 px-2 py-1 rounded">Expires in {daysLeft} days</span> :
                           <span className="text-emerald-500 font-bold bg-emerald-500/10 px-2 py-1 rounded">Valid</span>}
                        </td>
                      </tr>
                    );
                  })}

                  {activeTab === 'purchases' && data.purchases.map((p: any) => (
                    <tr key={p.id} className="hover:bg-slate-800/30">
                      <td className="px-5 py-4">{new Date(p.date).toLocaleDateString()}</td>
                      <td className="px-5 py-4 font-mono text-xs">{p.invoiceNumber || '-'}</td>
                      <td className="px-5 py-4 font-bold text-white">{p.supplier?.name || '-'}</td>
                      <td className="px-5 py-4 text-right font-black text-blue-400">₹{p.totalAmount.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}

                  {activeTab === 'sales' && data.sales.map((s: any) => {
                    const margin = s.totalAmount > 0 ? (s.totalProfit / s.totalAmount) * 100 : 0;
                    return (
                      <tr key={s.id} className="hover:bg-slate-800/30">
                        <td className="px-5 py-4">{new Date(s.createdAt).toLocaleDateString()}</td>
                        <td className="px-5 py-4 font-mono text-xs">{s.invoice_number || '-'}</td>
                        <td className="px-5 py-4 text-right font-black text-white">₹{s.totalAmount.toLocaleString('en-IN')}</td>
                        <td className="px-5 py-4 text-right font-black text-emerald-400">₹{s.totalProfit.toLocaleString('en-IN')}</td>
                        <td className="px-5 py-4 text-right font-medium text-slate-400">{margin.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
