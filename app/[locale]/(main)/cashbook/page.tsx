'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import api from '@/lib/api';
import { Wallet, Search, Loader2, ArrowUpRight, ArrowDownRight, IndianRupee } from 'lucide-react';

export default function CashBookPage() {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchEntries();
  }, [date]);

  async function fetchEntries() {
    setLoading(true);
    try {
      const res = await api.get(`/cashbook?date=${date}`);
      setEntries(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const inFlows = entries.filter(e => ['sale', 'collection', 'opening_balance', 'deposit'].includes(e.type)).reduce((sum, e) => sum + e.amount, 0);
  const outFlows = entries.filter(e => ['purchase', 'expense', 'withdrawal'].includes(e.type)).reduce((sum, e) => sum + e.amount, 0);
  const balance = inFlows - outFlows;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-sm border border-emerald-200 dark:border-emerald-800">
            <Wallet size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Daily Cash Book</h1>
            <p className="text-sm text-slate-500 font-medium mt-1">Track all your cash flow operations.</p>
          </div>
        </div>
        <input 
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 text-sm font-bold shadow-sm outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 flex items-center justify-center"><ArrowUpRight size={20}/></div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cash IN</p>
            <p className="text-2xl font-black text-emerald-600">₹{inFlows.toLocaleString()}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-600 flex items-center justify-center"><ArrowDownRight size={20}/></div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cash OUT</p>
            <p className="text-2xl font-black text-rose-600">₹{outFlows.toLocaleString()}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex items-center gap-4 border-b-4 border-b-indigo-500">
          <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 flex items-center justify-center"><IndianRupee size={20}/></div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Net Balance</p>
            <p className="text-2xl font-black text-indigo-600">₹{balance.toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-emerald-500" /></div>
        ) : entries.length === 0 ? (
          <div className="p-12 text-center text-slate-500 font-bold">No cash movements for this date.</div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 uppercase font-bold tracking-wider">
                <th className="px-6 py-4">Time</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Description</th>
                <th className="px-6 py-4 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {entries.map(e => {
                const isOut = ['purchase', 'expense', 'withdrawal'].includes(e.type);
                return (
                  <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-6 py-4 text-sm font-medium">{new Date(e.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">{e.type.replace('_', ' ')}</td>
                    <td className="px-6 py-4 text-sm font-medium">{e.description || '-'}</td>
                    <td className={`px-6 py-4 text-sm font-black text-right ${isOut ? 'text-rose-500' : 'text-emerald-500'}`}>
                      {isOut ? '-' : '+'} ₹{e.amount.toLocaleString()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
