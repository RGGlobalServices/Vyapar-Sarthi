'use client';

import { useState, useEffect } from 'react';
import { useRouter } from '@/i18n/routing';
import { useLocale } from 'next-intl';
import api from '@/lib/api';
import { Shield, Users, Store, ChartBar, RefreshCw, UserPlus, Gift, IndianRupee, Activity, TrendingUp, LogOut, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function getAdminAuth() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('ks_admin_auth');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export default function AdminDashboard() {
  const locale = useLocale();
  const router = useRouter();
  const [adminAuth, setAdminAuth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<any>(null);
  const [period, setPeriod] = useState('all');

  useEffect(() => {
    const auth = getAdminAuth();
    if (!auth) {
      window.location.href = `/${locale}/admin/login`;
      return;
    }
    setAdminAuth(auth);
    fetchAnalytics(auth.access_token);
  }, []);

  async function fetchAnalytics(token: string, p = period) {
    setLoading(true);
    try {
      const res = await api.get(`/admin/analytics?period=${p}`);
      setAnalytics(res.data);
    } catch (err: any) {
      if (err.response?.status === 401) {
        localStorage.removeItem('ks_admin_auth');
        window.location.href = `/${locale}/admin/login`;
      }
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem('ks_admin_auth');
    window.location.href = `/${locale}/admin/login`;
  }

  if (loading && !analytics) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <RefreshCw className="animate-spin text-indigo-500" size={40} />
      </div>
    );
  }

  const planStats: Record<string, number> = analytics?.planStats || {};
  const statusStats: Record<string, number> = analytics?.statusStats || {};

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Shield size={20} className="text-slate-900" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-50">Admin Panel</h1>
              <p className="text-slate-500 text-xs font-medium">{adminAuth?.admin?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a href={`/${locale}/admin/users`}
              className="flex items-center gap-2 bg-slate-900 border border-slate-700 text-slate-300 hover:text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors">
              <Users size={16} /> Manage Users
            </a>
            <button onClick={handleLogout}
              className="flex items-center gap-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 px-4 py-2 rounded-xl text-sm font-semibold transition-colors">
              <LogOut size={16} /> Logout
            </button>
          </div>
        </div>

        {/* Period Selector */}
        <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800 w-fit">
          {['all', 'yearly', 'monthly', 'daily'].map(p => (
            <button key={p} onClick={() => { setPeriod(p); fetchAnalytics(adminAuth.access_token, p); }}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${period === p ? 'bg-indigo-500 text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>
              {p === 'all' ? 'All Time' : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard title="Total Users" value={analytics?.totalUsers || 0} icon={<Users className="text-indigo-500" />} accent="indigo" />
          <StatCard title="Active Users" value={analytics?.activeUsers || 0} icon={<Activity className="text-emerald-500" />} accent="emerald" />
          <StatCard title="Blocked Users" value={analytics?.blockedUsers || 0} icon={<UserPlus className="text-red-500" />} accent="red" />
          <StatCard title="Total Shops" value={analytics?.totalShops || 0} icon={<Store className="text-cyan-500" />} accent="cyan" />
          <StatCard title="Total Referrals" value={analytics?.totalReferrals || 0} icon={<Gift className="text-amber-500" />} accent="amber" />
          <StatCard title="Completed Referrals" value={analytics?.completedReferrals || 0} icon={<TrendingUp className="text-emerald-500" />} accent="emerald" />
          <StatCard title="Total Revenue" value={`₹${(analytics?.totalRevenue || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} icon={<IndianRupee className="text-green-500" />} accent="green" />
          <StatCard title="New Users" value={analytics?.newUsers || 0} icon={<UserPlus className="text-blue-500" />} accent="blue" />
        </div>

        {/* Plan & Status Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-slate-900 border-slate-800 rounded-2xl">
            <CardHeader className="border-b border-slate-800 py-4">
              <CardTitle className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <ChartBar size={16} className="text-indigo-400" /> Subscription Plans
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {Object.keys(planStats).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(planStats).map(([plan, count]) => (
                    <div key={plan} className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-300 capitalize">{plan}</span>
                      <div className="flex items-center gap-3">
                        <div className="w-32 bg-slate-800 rounded-full h-2 overflow-hidden">
                          <div className="bg-indigo-500 h-full rounded-full transition-all"
                            style={{ width: `${(count as number / Math.max(...Object.values(planStats))) * 100}%` }} />
                        </div>
                        <span className="text-sm font-black text-slate-100 w-8 text-right">{count as number}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 text-center py-4">No plan data</p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800 rounded-2xl">
            <CardHeader className="border-b border-slate-800 py-4">
              <CardTitle className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Activity size={16} className="text-emerald-400" /> Subscription Status
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {Object.keys(statusStats).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(statusStats).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-300 capitalize">{status}</span>
                      <div className="flex items-center gap-3">
                        <div className="w-32 bg-slate-800 rounded-full h-2 overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${status === 'active' ? 'bg-emerald-500' : status === 'barrier' ? 'bg-red-500' : 'bg-amber-500'}`}
                            style={{ width: `${(count as number / Math.max(...Object.values(statusStats))) * 100}%` }} />
                        </div>
                        <span className="text-sm font-black text-slate-100 w-8 text-right">{count as number}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 text-center py-4">No status data</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, accent }: { title: string; value: any; icon: React.ReactNode; accent: string }) {
  const borderColor = {
    indigo: 'hover:border-indigo-500/50',
    emerald: 'hover:border-emerald-500/50',
    red: 'hover:border-red-500/50',
    cyan: 'hover:border-cyan-500/50',
    amber: 'hover:border-amber-500/50',
    green: 'hover:border-green-500/50',
    blue: 'hover:border-blue-500/50',
  }[accent] || 'hover:border-indigo-500/50';

  return (
    <Card className={`bg-slate-900 border-slate-800 rounded-2xl border-b-4 border-slate-800 ${borderColor} transition-all duration-300`}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-black text-slate-50 tracking-tighter">{typeof value === 'number' ? value.toLocaleString('en-IN') : value}</div>
      </CardContent>
    </Card>
  );
}
