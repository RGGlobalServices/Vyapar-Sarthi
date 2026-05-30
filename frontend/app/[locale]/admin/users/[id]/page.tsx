'use client';

import { useState, useEffect } from 'react';
import { useParams, useLocale } from 'next-intl';
import api from '@/lib/api';
import { Shield, ArrowLeft, RefreshCw, Ban, CheckCircle, Trash2, Package, Users, Phone, Calendar, Store, Globe, Gift, Ticket, IndianRupee, Mail, Clock, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

function getAdminAuth() {
  if (typeof window === 'undefined') return null;
  try { const raw = localStorage.getItem('ks_admin_auth'); if (!raw) return null; return JSON.parse(raw); } catch { return null; }
}

interface UserDetail {
  id: number;
  email: string;
  name: string;
  storeName: string;
  mobile: string;
  businessType: string;
  isActive: boolean;
  createdAt: string;
  shop: any;
  referralCode: any;
  referralsGiven: any[];
  referralsReceived: any[];
  ticketCount: number;
}

export default function AdminUserDetailPage() {
  const locale = useLocale();
  const params = useParams();
  const userId = params.id as string;

  const [auth, setAuth] = useState<any>(null);
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [planForm, setPlanForm] = useState({ plan: '', status: '', expiryDays: '' });
  const [showPlanForm, setShowPlanForm] = useState(false);

  useEffect(() => {
    const a = getAdminAuth();
    if (!a) { window.location.href = `/${locale}/admin/login`; return; }
    setAuth(a);
    fetchUser();
  }, [userId]);

  async function fetchUser() {
    setLoading(true);
    try {
      const res = await api.get(`/admin/users/${userId}`);
      setUser(res.data);
    } catch (err: any) {
      if (err.response?.status === 401) {
        localStorage.removeItem('ks_admin_auth');
        window.location.href = `/${locale}/admin/login`;
      }
    } finally {
      setLoading(false);
    }
  }

  async function toggleStatus() {
    if (!user) return;
    setActionLoading('status');
    try {
      await api.patch(`/admin/users/${user.id}/status`, { isActive: !user.isActive });
      setUser(prev => prev ? { ...prev, isActive: !prev.isActive } : null);
    } catch { alert('Failed to update status'); }
    finally { setActionLoading(''); }
  }

  async function handleDelete() {
    if (!user || !confirm('Permanently delete this user and all their data?')) return;
    setActionLoading('delete');
    try {
      await api.delete(`/admin/users/${user.id}`);
      window.location.href = `/${locale}/admin/users`;
    } catch { alert('Failed to delete'); }
    finally { setActionLoading(''); }
  }

  async function handleSubscriptionAction(action: 'barrier' | 'activate') {
    if (!user) return;
    setActionLoading(`sub_${action}`);
    try {
      await api.post(`/admin/users/${user.id}/subscription-action`, { action });
      fetchUser();
    } catch { alert('Failed to update subscription'); }
    finally { setActionLoading(''); }
  }

  async function handleUpdatePlan(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setActionLoading('plan');
    try {
      await api.patch(`/admin/users/${user.id}/plan`, {
        plan: planForm.plan || undefined,
        status: planForm.status || undefined,
        expiryDays: planForm.expiryDays ? parseInt(planForm.expiryDays) : undefined,
      });
      setShowPlanForm(false);
      setPlanForm({ plan: '', status: '', expiryDays: '' });
      fetchUser();
    } catch { alert('Failed to update plan'); }
    finally { setActionLoading(''); }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <RefreshCw className="animate-spin text-indigo-500" size={40} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-400">User not found</p>
      </div>
    );
  }

  const shop = user.shop;

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href={`/${locale}/admin/users`}
              className="p-2 bg-slate-900 border border-slate-700 text-slate-400 hover:text-white rounded-xl transition-colors">
              <ArrowLeft size={18} />
            </a>
            <div>
              <h1 className="text-2xl font-black text-slate-50">{user.name}</h1>
              <p className="text-slate-500 text-xs font-medium">User ID: {user.id}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowPlanForm(true)}
              className="bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 px-4 py-2 rounded-xl text-sm font-semibold transition-all">
              Update Plan
            </button>
            <button onClick={toggleStatus} disabled={actionLoading === 'status'}
              className={cn('px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2', user.isActive ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20')}>
              {actionLoading === 'status' ? <RefreshCw size={14} className="animate-spin" /> : user.isActive ? <Ban size={14} /> : <CheckCircle size={14} />}
              {user.isActive ? 'Block' : 'Activate'}
            </button>
            <button onClick={handleDelete} disabled={actionLoading === 'delete'}
              className="bg-red-500/10 text-red-400 hover:bg-red-500/20 px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2">
              {actionLoading === 'delete' ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Delete
            </button>
          </div>
        </div>

        {/* User Info Card */}
        <Card className="bg-slate-900 border-slate-800 rounded-2xl">
          <CardHeader className="border-b border-slate-800 py-4">
            <CardTitle className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Users size={16} className="text-indigo-400" /> User Information
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Mail size={16} className="text-slate-600" />
                <div>
                  <p className="text-xs text-slate-500 font-semibold">Email</p>
                  <p className="text-sm font-bold text-slate-100">{user.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Phone size={16} className="text-slate-600" />
                <div>
                  <p className="text-xs text-slate-500 font-semibold">Mobile</p>
                  <p className="text-sm font-bold text-slate-100">{user.mobile || '-'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Store size={16} className="text-slate-600" />
                <div>
                  <p className="text-xs text-slate-500 font-semibold">Store Name</p>
                  <p className="text-sm font-bold text-slate-100">{user.storeName || '-'}</p>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Globe size={16} className="text-slate-600" />
                <div>
                  <p className="text-xs text-slate-500 font-semibold">Business Type</p>
                  <p className="text-sm font-bold text-slate-100 capitalize">{user.businessType || '-'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Calendar size={16} className="text-slate-600" />
                <div>
                  <p className="text-xs text-slate-500 font-semibold">Joined</p>
                  <p className="text-sm font-bold text-slate-100">{new Date(user.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Ticket size={16} className="text-slate-600" />
                <div>
                  <p className="text-xs text-slate-500 font-semibold">Support Tickets</p>
                  <p className="text-sm font-bold text-slate-100">{user.ticketCount}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Subscription Info */}
        {shop && (
          <Card className="bg-slate-900 border-slate-800 rounded-2xl">
            <CardHeader className="border-b border-slate-800 py-4">
              <CardTitle className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <IndianRupee size={16} className="text-emerald-400" /> Subscription
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="text-xs text-slate-500 font-semibold">Plan</p>
                <p className="text-sm font-black text-slate-100 mt-1 capitalize">{shop.subscriptionPlan || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold">Status</p>
                <span className={cn('inline-block mt-1 text-xs font-black px-3 py-1 rounded-full', shop.subscriptionStatus === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : shop.subscriptionStatus === 'barrier' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-slate-700 text-slate-400')}>
                  {shop.subscriptionStatus || 'N/A'}
                </span>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold">Expiry</p>
                <p className="text-sm font-bold text-slate-100 mt-1">{shop.subscriptionExpiry ? new Date(shop.subscriptionExpiry).toLocaleDateString() : '-'}</p>
              </div>
            </CardContent>
            <div className="px-6 pb-6 flex gap-2">
              <button onClick={() => handleSubscriptionAction('barrier')} disabled={actionLoading === 'sub_barrier'}
                className="bg-red-500/10 text-red-400 hover:bg-red-500/20 px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2">
                {actionLoading === 'sub_barrier' ? <RefreshCw size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
                Set Barrier
              </button>
              <button onClick={() => handleSubscriptionAction('activate')} disabled={actionLoading === 'sub_activate'}
                className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2">
                {actionLoading === 'sub_activate' ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                Activate
              </button>
            </div>
          </Card>
        )}

        {/* Products & Customers Summary */}
        {shop && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="bg-slate-900 border-slate-800 rounded-2xl">
              <CardHeader className="border-b border-slate-800 py-4">
                <CardTitle className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <Package size={16} className="text-cyan-400" /> Products ({shop.products?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 max-h-60 overflow-y-auto">
                {shop.products?.length > 0 ? shop.products.map((p: any) => (
                  <div key={p.id} className="flex justify-between items-center px-6 py-3 border-b border-slate-800/50 last:border-0">
                    <p className="text-sm font-semibold text-slate-200">{p.name}</p>
                    <span className={cn('text-xs font-black', p.currentStock <= p.minStock ? 'text-red-400' : 'text-slate-400')}>
                      {p.currentStock} / {p.minStock}
                    </span>
                  </div>
                )) : <p className="text-sm text-slate-500 text-center py-8">No products</p>}
              </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-800 rounded-2xl">
              <CardHeader className="border-b border-slate-800 py-4">
                <CardTitle className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <Users size={16} className="text-amber-400" /> Customers ({shop.customers?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 max-h-60 overflow-y-auto">
                {shop.customers?.length > 0 ? shop.customers.map((c: any) => (
                  <div key={c.id} className="flex justify-between items-center px-6 py-3 border-b border-slate-800/50 last:border-0">
                    <div>
                      <p className="text-sm font-semibold text-slate-200">{c.name}</p>
                      <p className="text-xs text-slate-500">{c.mobile}</p>
                    </div>
                    <span className="text-xs font-black text-orange-400">₹{c.totalDue}</span>
                  </div>
                )) : <p className="text-sm text-slate-500 text-center py-8">No customers</p>}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Referrals */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="bg-slate-900 border-slate-800 rounded-2xl">
            <CardHeader className="border-b border-slate-800 py-4">
              <CardTitle className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Gift size={16} className="text-purple-400" /> Referrals Given ({user.referralsGiven?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 max-h-60 overflow-y-auto">
              {user.referralsGiven?.length > 0 ? user.referralsGiven.map((r: any, idx: number) => (
                <div key={idx} className="px-6 py-3 border-b border-slate-800/50 last:border-0">
                  <p className="text-sm font-semibold text-slate-200">{r.referred?.name || r.referred?.email || 'Unknown'}</p>
                  <p className="text-xs text-slate-500">{r.referred?.email} &middot; {r.status}</p>
                </div>
              )) : <p className="text-sm text-slate-500 text-center py-8">No referrals given</p>}
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800 rounded-2xl">
            <CardHeader className="border-b border-slate-800 py-4">
              <CardTitle className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Gift size={16} className="text-pink-400" /> Referrals Received ({user.referralsReceived?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 max-h-60 overflow-y-auto">
              {user.referralsReceived?.length > 0 ? user.referralsReceived.map((r: any, idx: number) => (
                <div key={idx} className="px-6 py-3 border-b border-slate-800/50 last:border-0">
                  <p className="text-sm font-semibold text-slate-200">{r.referrer?.name || r.referrer?.email || 'Unknown'}</p>
                  <p className="text-xs text-slate-500">{r.referrer?.email}</p>
                </div>
              )) : <p className="text-sm text-slate-500 text-center py-8">No referrals received</p>}
            </CardContent>
          </Card>
        </div>

        {/* Referral Code */}
        {user.referralCode && (
          <Card className="bg-slate-900 border-slate-800 rounded-2xl">
            <CardHeader className="border-b border-slate-800 py-4">
              <CardTitle className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Gift size={16} className="text-emerald-400" /> Referral Code
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-lg font-black text-emerald-400">{user.referralCode.code}</p>
              <p className="text-xs text-slate-500 mt-1">Total Referrals: {user.referralCode.totalReferrals}</p>
            </CardContent>
          </Card>
        )}

        {/* Update Plan Modal */}
        {showPlanForm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between p-6 border-b border-slate-800">
                <h2 className="text-lg font-black text-slate-100">Update Subscription</h2>
                <button onClick={() => setShowPlanForm(false)} className="p-2 bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors">
                  <AlertTriangle size={18} />
                </button>
              </div>
              <form onSubmit={handleUpdatePlan} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Plan</label>
                  <select value={planForm.plan} onChange={e => setPlanForm(f => ({ ...f, plan: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500">
                    <option value="">Keep current</option>
                    <option value="basic">Basic</option>
                    <option value="professional">Professional</option>
                    <option value="business">Business</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</label>
                  <select value={planForm.status} onChange={e => setPlanForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500">
                    <option value="">Keep current</option>
                    <option value="active">Active</option>
                    <option value="barrier">Barrier</option>
                    <option value="expired">Expired</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Extend Expiry (days)</label>
                  <input type="number" value={planForm.expiryDays} onChange={e => setPlanForm(f => ({ ...f, expiryDays: e.target.value }))}
                    placeholder="e.g. 30"
                    className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 placeholder:text-slate-600" />
                </div>
                <button type="submit" disabled={actionLoading === 'plan'}
                  className="w-full bg-indigo-500 text-slate-900 py-3 rounded-xl font-bold text-sm hover:bg-indigo-400 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                  {actionLoading === 'plan' ? <><RefreshCw size={16} className="animate-spin" /> Updating…</> : 'Update Subscription'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
