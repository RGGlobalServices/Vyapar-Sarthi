'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Briefcase, UserPlus, Users, CheckCircle2, XCircle, Clock, Search, ChevronRight, User, IndianRupee, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';

type KpiFilter = null | 'active' | 'present_today' | 'absent_today' | 'on_leave';

export default function StaffPage() {
  const t = useTranslations('Staff');
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [summary, setSummary] = useState<any>(null);
  const [kpiFilter, setKpiFilter] = useState<KpiFilter>(null);
  // Populated once a KPI tile needing today's attendance is clicked, so the
  // list can actually filter by it — the plain staff list has no attendance
  // fields of its own.
  const [todayAttendanceByStaff, setTodayAttendanceByStaff] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    loadStaff();
    loadSummary();
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

  async function loadSummary() {
    try {
      const res = await api.get('/staff/dashboard-summary');
      setSummary(res.data);
    } catch (e) {
      console.error(e);
    }
  }

  async function toggleKpiFilter(filter: KpiFilter) {
    const next = kpiFilter === filter ? null : filter;
    setKpiFilter(next);
    if (next && (next === 'present_today' || next === 'absent_today' || next === 'on_leave') && !todayAttendanceByStaff) {
      try {
        const today = new Date().toISOString().split('T')[0];
        const res = await api.get(`/staff/attendance?date=${today}`);
        const map: Record<string, string> = {};
        for (const row of res.data || []) map[row.staffId] = (row.status || '').toLowerCase();
        setTodayAttendanceByStaff(map);
      } catch (e) { console.error(e); }
    }
  }

  const filtered = staffList
    .filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.mobile.includes(search))
    .filter(s => {
      if (!kpiFilter) return true;
      if (kpiFilter === 'active') return (s.status || 'active') === 'active';
      if (!todayAttendanceByStaff) return true; // still loading
      const status = todayAttendanceByStaff[s.id];
      if (kpiFilter === 'present_today') return status === 'present' || status === 'half day';
      if (kpiFilter === 'absent_today') return status === 'absent';
      if (kpiFilter === 'on_leave') return status === 'leave';
      return true;
    });

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
            <CheckCircle2 size={18} /> {t('attendance')}
          </Link>
          <Link href="/staff/new" className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-indigo-500 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-500/20">
            <UserPlus size={18} /> {t('addStaff')}
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {/* Total Staff — not clickable, it's the unfiltered baseline. */}
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl border-b-4 border-b-indigo-500 p-4">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5 mb-1">
            <Users size={13} className="text-indigo-500" /> {t('totalStaff')}
          </p>
          <div className="text-2xl font-black text-slate-900 dark:text-white">{staffList.length}</div>
        </Card>

        <button onClick={() => toggleKpiFilter('active')} className="text-left">
          <Card className={cn("bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl border-b-4 border-b-emerald-500 p-4 h-full transition-shadow", kpiFilter === 'active' && "ring-2 ring-emerald-500")}>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5 mb-1">
              <CheckCircle2 size={13} className="text-emerald-500" /> {t('activeStaff')}
            </p>
            <div className="text-2xl font-black text-slate-900 dark:text-white">{summary?.active_staff ?? '—'}</div>
          </Card>
        </button>

        <button onClick={() => toggleKpiFilter('present_today')} className="text-left">
          <Card className={cn("bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl border-b-4 border-b-sky-500 p-4 h-full transition-shadow", kpiFilter === 'present_today' && "ring-2 ring-sky-500")}>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5 mb-1">
              <Clock size={13} className="text-sky-500" /> {t('presentToday')}
            </p>
            <div className="text-2xl font-black text-slate-900 dark:text-white">{summary?.present_today ?? '—'}</div>
          </Card>
        </button>

        <button onClick={() => toggleKpiFilter('absent_today')} className="text-left">
          <Card className={cn("bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl border-b-4 border-b-red-500 p-4 h-full transition-shadow", kpiFilter === 'absent_today' && "ring-2 ring-red-500")}>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5 mb-1">
              <XCircle size={13} className="text-red-500" /> {t('absentToday')}
            </p>
            <div className="text-2xl font-black text-slate-900 dark:text-white">{summary?.absent_today ?? '—'}</div>
          </Card>
        </button>

        {/* Only shown once someone's actually used leave tracking — an
            always-zero tile for a shop that's never marked a Leave is just
            noise. */}
        {!!summary?.on_leave_today && (
          <button onClick={() => toggleKpiFilter('on_leave')} className="text-left">
            <Card className={cn("bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl border-b-4 border-b-amber-500 p-4 h-full transition-shadow", kpiFilter === 'on_leave' && "ring-2 ring-amber-500")}>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5 mb-1">
                <Clock size={13} className="text-amber-500" /> {t('onLeave')}
              </p>
              <div className="text-2xl font-black text-slate-900 dark:text-white">{summary.on_leave_today}</div>
            </Card>
          </button>
        )}

        {!!summary?.total_monthly_payroll && (
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl border-b-4 border-b-indigo-500 p-4">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5 mb-1">
              <IndianRupee size={13} className="text-indigo-500" /> {t('totalMonthlyPayroll')}
            </p>
            <div className="text-xl font-black text-slate-900 dark:text-white">₹{summary.total_monthly_payroll.toLocaleString('en-IN')}</div>
          </Card>
        )}

        {!!summary?.payroll_paid && (
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl border-b-4 border-b-emerald-500 p-4">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5 mb-1">
              <Wallet size={13} className="text-emerald-500" /> {t('payrollPaid')}
            </p>
            <div className="text-xl font-black text-slate-900 dark:text-white">₹{summary.payroll_paid.toLocaleString('en-IN')}</div>
          </Card>
        )}

        {!!summary?.payroll_due && (
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl border-b-4 border-b-amber-500 p-4">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5 mb-1">
              <Wallet size={13} className="text-amber-500" /> {t('payrollDue')}
            </p>
            <div className="text-xl font-black text-slate-900 dark:text-white">₹{summary.payroll_due.toLocaleString('en-IN')}</div>
          </Card>
        )}
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
            <p className="font-bold text-lg text-slate-900 dark:text-white">{t('noStaffFound')}</p>
            <p className="text-sm">{t('clickAddStaff')}</p>
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
                        {staff.role || t('other')}
                      </span>
                      <span className="uppercase tracking-wider text-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-600 dark:text-slate-400 font-bold">
                        {staff.salaryType === 'daily' ? t('daily') : t('monthly')}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-right">
                  <div className="hidden sm:block">
                    <p className="text-sm font-black text-slate-900 dark:text-white">₹{staff.salaryAmount.toLocaleString('en-IN')}</p>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{staff.salaryType === 'daily' ? t('perDay') : t('perMonth')}</p>
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
