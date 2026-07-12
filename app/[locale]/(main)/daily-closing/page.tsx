'use client';

import { useState, useEffect } from 'react';
import { Lock, History, IndianRupee, Loader2, ArrowRight } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function DailyClosingPage() {
  const [closings, setClosings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [closingCash, setClosingCash] = useState('');
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchClosings();
  }, []);

  async function fetchClosings() {
    try {
      const res = await api.get('/cashbook/closing');
      setClosings(res.data);
    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleClose(e: React.FormEvent) {
    e.preventDefault();
    if (!closingCash) return;
    setSaving(true);
    try {
      await api.post('/cashbook/closing', {
        date,
        closingCash: parseFloat(closingCash)
      });
      toast.success('Galla Closed Successfully!');
      setShowModal(false);
      fetchClosings();
    } catch(e: any) {
      toast.error(e.response?.data?.detail || 'Failed to close day');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto animate-in fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm border border-indigo-200 dark:border-indigo-800">
            <Lock size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Daily Closing (Galla)</h1>
            <p className="text-sm text-slate-500 font-medium mt-1">Reconcile and close your daily cash register</p>
          </div>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm active:scale-95"
        >
          Close Today's Galla <ArrowRight size={16} />
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center gap-2 text-sm font-bold text-slate-500">
          <History size={16} /> Past Closings
        </div>
        {loading ? (
          <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-indigo-500" /></div>
        ) : closings.length === 0 ? (
          <div className="p-12 text-center text-slate-500 font-bold">No daily closings recorded yet.</div>
        ) : (
          <table className="w-full text-left whitespace-nowrap">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-xs text-slate-500 uppercase tracking-wider font-bold">
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Opening</th>
                <th className="px-6 py-4">Sales/In</th>
                <th className="px-6 py-4">Expenses/Out</th>
                <th className="px-6 py-4 text-indigo-600">Expected</th>
                <th className="px-6 py-4">Actual (Galla)</th>
                <th className="px-6 py-4 text-right">Difference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {closings.map(c => {
                const expected = c.openingCash + c.cashSales + c.cashCollection + c.cashDeposits - c.cashExpenses;
                return (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-6 py-4 font-bold text-sm text-slate-700 dark:text-slate-300">
                      {new Date(c.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium">₹{c.openingCash}</td>
                    <td className="px-6 py-4 text-sm font-medium text-emerald-600">+₹{(c.cashSales + c.cashCollection + c.cashDeposits)}</td>
                    <td className="px-6 py-4 text-sm font-medium text-rose-600">-₹{c.cashExpenses}</td>
                    <td className="px-6 py-4 text-sm font-bold text-indigo-600">₹{expected}</td>
                    <td className="px-6 py-4 text-sm font-black">₹{c.closingCash}</td>
                    <td className={`px-6 py-4 text-sm font-black text-right ${c.difference < 0 ? 'text-rose-500' : c.difference > 0 ? 'text-emerald-500' : 'text-slate-500'}`}>
                      {c.difference > 0 ? '+' : ''}{c.difference === 0 ? '-' : `₹${c.difference}`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <form onSubmit={handleClose} className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 text-center">
              <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900 mx-auto rounded-full flex items-center justify-center text-indigo-600 mb-3">
                <Lock size={24} />
              </div>
              <h2 className="text-xl font-black">Close Galla</h2>
              <p className="text-sm text-slate-500 mt-1">Enter actual physical cash.</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Date</label>
                <input type="date" required value={date} onChange={e=>setDate(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Physical Cash in Drawer (₹)</label>
                <div className="relative">
                  <IndianRupee size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="number" required min="0" step="0.5" value={closingCash} onChange={e=>setClosingCash(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-12 pr-4 py-3 font-black text-lg outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0.00" />
                </div>
              </div>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800 rounded-xl">Cancel</button>
              <button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2">
                {saving ? <Loader2 className="animate-spin w-4 h-4"/> : <Lock size={16} />} Save Closing
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
