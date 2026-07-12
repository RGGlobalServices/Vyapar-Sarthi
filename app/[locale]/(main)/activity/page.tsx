'use client';

import { useState, useEffect } from 'react';
import { Activity, Clock, FileText, ShoppingBag, Users, Coins, ArrowRight, Loader2, DollarSign, UploadCloud } from 'lucide-react';
import api from '@/lib/api';

export default function ActivityTimelinePage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  async function fetchLogs() {
    try {
      const res = await api.get('/activity?take=100');
      setLogs(res.data);
    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const getIcon = (action: string) => {
    if (action.includes('bill') || action.includes('sale')) return <ShoppingBag size={18} className="text-emerald-500" />;
    if (action.includes('expense')) return <FileText size={18} className="text-rose-500" />;
    if (action.includes('staff') || action.includes('salary')) return <Users size={18} className="text-indigo-500" />;
    if (action.includes('payment')) return <DollarSign size={18} className="text-blue-500" />;
    if (action.includes('closing')) return <Coins size={18} className="text-amber-500" />;
    if (action.includes('import')) return <UploadCloud size={18} className="text-purple-500" />;
    return <Activity size={18} className="text-slate-500" />;
  };

  const getFormat = (action: string, details: any) => {
    switch (action) {
      case 'bill_created': return `Generated Bill ${details.invoice} for ₹${details.total}`;
      case 'expense_added': return `Recorded Expense: ${details.category} (₹${details.amount})`;
      case 'staff_added': return `Added new staff: ${details.name} (${details.role})`;
      case 'salary_paid': return `Paid Salary to ${details.staffName} for ${details.monthYear} (₹${details.amount})`;
      case 'advance_salary_given': return `Given Advance Salary to ${details.staffName} (₹${details.amount})`;
      case 'payment_collected': return `Collected ₹${details.amount} from ${details.entityType} ${details.name}`;
      case 'payment_given': return `Paid ₹${details.amount} to ${details.entityType} ${details.name}`;
      case 'daily_closed': return `Closed Daily Register (${details.date}) with Actual ₹${details.actual}`;
      case 'import_completed': return `Imported ${details.importType}: ${details.created || 0} created, ${details.updated || 0} updated${details.errorCount ? `, ${details.errorCount} failed` : ''}`;
      default: return `Action: ${action}`;
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto animate-in fade-in">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center text-blue-600 shadow-sm border border-blue-200 dark:border-blue-800">
          <Clock size={24} />
        </div>
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Activity Timeline</h1>
          <p className="text-sm text-slate-500 font-medium mt-1">Chronological record of all business operations.</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm relative">
        <div className="absolute left-10 top-10 bottom-10 w-px bg-slate-200 dark:bg-slate-800" />
        
        {loading ? (
          <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-blue-500" /></div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-slate-500 font-bold">No activity recorded yet.</div>
        ) : (
          <div className="space-y-6 relative">
            {logs.map((log) => (
              <div key={log.id} className="flex gap-4 group">
                <div className="relative z-10 w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-700 flex items-center justify-center group-hover:scale-110 group-hover:border-blue-500 transition-all shrink-0">
                  {getIcon(log.action)}
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 flex-1 group-hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-bold text-slate-900 dark:text-white text-sm">{getFormat(log.action, log.details)}</h3>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 bg-white dark:bg-slate-900 px-2 py-1 rounded shadow-sm border border-slate-100 dark:border-slate-800">
                      {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-slate-500">
                    {new Date(log.createdAt).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
