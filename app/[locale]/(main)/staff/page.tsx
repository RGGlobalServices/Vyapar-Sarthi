'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Briefcase, UserPlus, Users, CheckCircle2, XCircle, Clock, Search, ChevronRight, User } from 'lucide-react';

export default function StaffPage() {
  const t = useTranslations('Staff');
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadStaff();
  }, [activeShopId]);

  async function loadStaff() {
    setLoading(true);
    try {
      const res = await api.get('/staff');
      setStaffList(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const filtered = staffList.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.mobile.includes(search));

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white flex items-center gap-3">
            <Briefcase className="text-indigo-500" size={32} />
            {t('title')}
          </h1>
          <p className="text-slate-500 font-medium mt-1">{t('desc')}</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <Link href="/staff/attendance" className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2.5 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
            <CheckCircle2 size={18} /> Attendance
          </Link>
          <Link href="/staff/new" className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-indigo-500 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-500/20">
            <UserPlus size={18} /> {t('addStaff')}
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl border-b-4 border-b-indigo-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Users size={14} className="text-indigo-500" /> {t('totalStaff')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-900 dark:text-white">{staffList.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder={t('searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow text-sm font-medium"
            />
          </div>
        </div>
        
        {loading ? (
          <div className="p-12 flex justify-center">
            <div className="w-8 h-8 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Users size={48} className="mx-auto mb-4 text-slate-300 dark:text-slate-700" />
            <p className="font-bold text-lg text-slate-900 dark:text-white">No staff found</p>
            <p className="text-sm">Click "{t('addStaff')}" to create a new profile.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
            {filtered.map(staff => (
              <Link href={`/staff/${staff.id}`} key={staff.id} className="flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                    {staff.photoUrl ? (
                      <img src={staff.photoUrl} alt={staff.name} className="w-full h-full object-cover" />
                    ) : (
                      <User size={24} className="text-slate-400" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 dark:text-white text-base group-hover:text-indigo-500 transition-colors">{staff.name}</h3>
                    <p className="text-xs font-bold text-slate-500 flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-slate-600 dark:text-slate-400">{staff.mobile}</span>
                      <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                      <span className="bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold">
                        {staff.role || 'Other'}
                      </span>
                      <span className="uppercase tracking-wider text-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-600 dark:text-slate-400 font-bold">
                        {staff.salaryType}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-right">
                  <div className="hidden sm:block">
                    <p className="text-sm font-black text-slate-900 dark:text-white">₹{staff.salaryAmount.toLocaleString('en-IN')}</p>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{staff.salaryType === 'daily' ? 'Per Day' : 'Per Month'}</p>
                  </div>
                  <ChevronRight size={20} className="text-slate-300 dark:text-slate-600 group-hover:text-indigo-500 transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
