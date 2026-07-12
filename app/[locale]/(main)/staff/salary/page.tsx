'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import api from '@/lib/api';
import { IndianRupee, Loader2, ArrowRight, UserPlus, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SalaryPage() {
  const [salaries, setSalaries] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [salRes, staffRes] = await Promise.all([
        api.get('/staff/salary'),
        api.get('/staff')
      ]);
      setSalaries(salRes.data);
      setStaff(staffRes.data);
    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto animate-in fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-2xl flex items-center justify-center text-purple-600 shadow-sm border border-purple-200 dark:border-purple-800">
            <IndianRupee size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Salary & Payroll</h1>
            <p className="text-sm text-slate-500 font-medium mt-1">Manage staff payouts and advance tracking</p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden mb-8">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-500">
            <Clock size={16} /> Recent Payouts
          </div>
        </div>
        {loading ? (
          <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-purple-500" /></div>
        ) : salaries.length === 0 ? (
          <div className="p-12 text-center text-slate-500 font-bold">No salaries paid yet.</div>
        ) : (
          <table className="w-full text-left whitespace-nowrap">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-xs text-slate-500 uppercase tracking-wider font-bold">
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Staff</th>
                <th className="px-6 py-4">Month/Year</th>
                <th className="px-6 py-4">Mode</th>
                <th className="px-6 py-4 text-right">Net Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {salaries.map(s => (
                <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-6 py-4 text-sm font-medium">{new Date(s.paidAt).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-sm font-bold text-slate-900 dark:text-white">{s.staff?.name}</td>
                  <td className="px-6 py-4 text-sm font-medium">{s.monthYear}</td>
                  <td className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">{s.paymentMode}</td>
                  <td className="px-6 py-4 text-sm font-black text-emerald-600 text-right">₹{s.netAmount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
