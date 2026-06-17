'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/routing';
import { IndianRupee, Search, Filter, ArrowLeft, RefreshCw, Eye, Calendar, User } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AllInvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');

  useEffect(() => {
    const fetchInvoices = async () => {
      try {
        const res = await api.get('/billing/');
        setInvoices(res.data);
      } catch (err) {
        console.error('Failed to fetch invoices', err);
      } finally {
        setLoading(false);
      }
    };
    fetchInvoices();
  }, []);

  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch = inv.id.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === 'All' || inv.payment_type === filter;
    return matchesSearch && matchesFilter;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] gap-4">
        <RefreshCw className="animate-spin text-emerald-500" size={40} />
        <p className="text-slate-400 font-medium">Loading your records...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-500 pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 hover:text-white transition-all shadow-sm">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight">Invoice History</h1>
            <p className="text-slate-500 text-sm font-medium">View and manage all your store sales</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-500 transition-colors" size={18} />
            <input 
              type="text" 
              placeholder="Search by ID..." 
              className="bg-slate-900 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 w-full md:w-64 transition-all"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select 
            className="bg-slate-900 border border-slate-800 rounded-xl py-2.5 px-4 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all cursor-pointer"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          >
            <option value="All">All Payments</option>
            <option value="Cash">Cash</option>
            <option value="UPI">UPI</option>
            <option value="Udhar">Udhar</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <Card className="bg-slate-900 border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-800/40 text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4">Invoice ID</th>
                  <th className="px-6 py-4">Date & Time</th>
                  <th className="px-6 py-4">Payment</th>
                  <th className="px-6 py-4 text-right">Amount</th>
                  <th className="px-6 py-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filteredInvoices.length > 0 ? filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-800/30 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center border border-slate-700">
                          <IndianRupee size={14} className="text-emerald-500" />
                        </div>
                        <span className="text-sm font-bold text-slate-100 uppercase tracking-tighter">INV-{inv.id.substring(0, 8)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-slate-200">{new Date(inv.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        <span className="text-[10px] text-slate-500 font-bold">{new Date(inv.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border",
                        inv.payment_type === 'Cash' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                        inv.payment_type === 'UPI' ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" :
                        "bg-orange-500/10 text-orange-400 border-orange-500/20"
                      )}>
                        {inv.payment_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm font-black text-slate-100">₹{inv.total_amount.toLocaleString('en-IN')}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center">
                        <Link 
                          href={`/billing/invoices/${inv.id}`}
                          className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-emerald-500 text-slate-400 hover:text-slate-900 rounded-lg text-xs font-bold transition-all"
                        >
                          <Eye size={14} />
                          Details
                        </Link>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5} className="py-20 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Filter size={40} className="text-slate-800" />
                        <p className="text-slate-400 font-bold text-lg tracking-tight">No invoices found</p>
                        <p className="text-slate-600 text-sm">Try adjusting your search or filters.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      
      <div className="text-center">
        <p className="text-slate-600 text-[10px] font-bold uppercase tracking-widest">End of History · {filteredInvoices.length} Records</p>
      </div>
    </div>
  );
}
