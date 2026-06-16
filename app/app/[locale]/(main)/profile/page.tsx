'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  User, Building, Mail, Phone, MapPin, Camera,
  Save, Loader2, CheckCircle, Store, Briefcase,
  ArrowLeft, Lock, Eye, EyeOff, TrendingUp, ShieldCheck,
  KeyRound, AlertCircle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/store';
import { useBusinessStore } from '@/lib/businessStore';
import { uploadInvoiceToSupabase } from '@/lib/supabaseStorage';

type ProfitData = { totalRevenue: number; totalProfit: number; saleCount: number } | null;

export default function ProfilePage() {
  const t = useTranslations('Profile');
  const { profile, fetchProfile, updateProfile } = useBusinessStore();
  const { user } = useAuthStore();
  const router = useRouter();
  const locale = useLocale();

  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [status, setStatus]     = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [shop, setShop]         = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Change password
  const [cpOpen, setCpOpen]         = useState(false);
  const [cpCurrent, setCpCurrent]   = useState('');
  const [cpNew, setCpNew]           = useState('');
  const [cpConfirm, setCpConfirm]   = useState('');
  const [cpShow, setCpShow]         = useState(false);
  const [cpLoading, setCpLoading]   = useState(false);
  const [cpError, setCpError]       = useState('');
  const [cpOk, setCpOk]             = useState(false);

  // Today's profit
  const [profitOpen, setProfitOpen]   = useState(false);
  const [profitPwd, setProfitPwd]     = useState('');
  const [profitShow, setProfitShow]   = useState(false);
  const [profitLoading, setProfitLoading] = useState(false);
  const [profitError, setProfitError]   = useState('');
  const [profitData, setProfitData]     = useState<ProfitData>(null);
  const [hasProfitPwd, setHasProfitPwd] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await fetchProfile();
        const upRes = await api.get('/user/profile');
        setHasProfitPwd(!!upRes.data.hasProfitPassword);
      } catch {}
      finally { setLoading(false); }
    })();
  }, [fetchProfile]);

  useEffect(() => {
    if (profile) {
      setShop({
        id: profile.id,
        name: profile.shopName,
        address: profile.address,
        mobile: profile.mobile,
        logo_url: profile.logoUrl,
        business_type: profile.businessType,
      });
    }
  }, [profile]);

  const showStatus = (type: 'success' | 'error', message: string) => {
    setStatus({ type, message });
    if (type === 'success') setTimeout(() => setStatus(null), 3000);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({
        shopName: shop.name, address: shop.address,
        mobile: shop.mobile, logoUrl: shop.logo_url, businessType: shop.business_type,
      });
      showStatus('success', 'Profile updated successfully');
    } catch { showStatus('error', 'Failed to update profile'); }
    finally { setSaving(false); }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fileName = `logo-${shop?.id || 'default'}-${Date.now()}.png`;
      const publicUrl = await uploadInvoiceToSupabase(file, fileName, file.type);
      if (publicUrl) {
        setShop({ ...shop, logo_url: publicUrl });
        await updateProfile({ logoUrl: publicUrl });
      }
    } catch { alert('Failed to upload logo'); }
    finally { setUploading(false); }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setCpError('');
    if (!cpCurrent) { setCpError('Enter your current password.'); return; }
    if (!cpNew || cpNew.length < 6) { setCpError('New password must be at least 6 characters.'); return; }
    if (cpNew !== cpConfirm) { setCpError('Passwords do not match.'); return; }
    setCpLoading(true);
    try {
      await api.patch('/user/profile', { currentPassword: cpCurrent, newPassword: cpNew });
      setCpOk(true);
      setCpCurrent(''); setCpNew(''); setCpConfirm('');
      setTimeout(() => { setCpOk(false); setCpOpen(false); }, 2000);
    } catch (err: any) {
      setCpError(err.response?.data?.detail || 'Failed to change password.');
    } finally { setCpLoading(false); }
  };

  const handleViewProfit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profitPwd) { setProfitError('Enter your profit password.'); return; }
    setProfitLoading(true); setProfitError('');
    try {
      const res = await api.post('/shop/today-profit', { password: profitPwd });
      setProfitData(res.data);
      setProfitPwd('');
    } catch (err: any) {
      setProfitError(err.response?.data?.detail || 'Incorrect password.');
    } finally { setProfitLoading(false); }
  };

  if (loading) return <div className="p-10 text-center text-slate-500">Loading profile...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.push(`/${locale}/`)}
          className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-all">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-3xl font-black text-white tracking-tight">Profile Manager</h1>
          <p className="text-slate-400">Manage your personal and business identity</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50">
          {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
          Save Changes
        </button>
      </div>

      {status && (
        <div className={cn(
          'p-4 rounded-xl flex items-center gap-3 animate-in slide-in-from-top-2',
          status.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20',
        )}>
          <CheckCircle size={18} />
          <span className="font-medium">{status.message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Branding */}
        <Card className="bg-slate-900 border-slate-800 md:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-widest text-slate-500">Branding</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6">
            <div className="relative group">
              <div className="w-32 h-32 rounded-3xl bg-slate-800 border-2 border-dashed border-slate-700 flex items-center justify-center overflow-hidden transition-all group-hover:border-emerald-500/50">
                {shop?.logo_url ? (
                  <img
                    src={`${shop.logo_url}${shop.logo_url.includes('?') ? '&' : '?'}v=${Date.now()}`}
                    alt="Logo" className="w-full h-full object-contain p-2"
                    onError={(e) => {
                      if (shop.logo_url && !shop.logo_url.includes('/public/')) {
                        (e.target as HTMLImageElement).src = shop.logo_url.replace('/v1/object/', '/v1/object/public/');
                      }
                    }} />
                ) : (
                  <Building size={48} className="text-slate-600" />
                )}
                {uploading && (
                  <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center">
                    <Loader2 className="animate-spin text-emerald-500" />
                  </div>
                )}
              </div>
              <button onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-2 -right-2 w-10 h-10 bg-emerald-500 text-slate-900 rounded-xl flex items-center justify-center shadow-xl hover:bg-emerald-400 transition-all active:scale-90">
                <Camera size={20} />
              </button>
              <input type="file" ref={fileInputRef} onChange={handleLogoUpload} accept="image/*" className="hidden" />
            </div>
            <div className="text-center">
              <p className="font-bold text-slate-200">Business Logo</p>
              <p className="text-xs text-slate-500 mt-1">Shown on bills &amp; invoices</p>
            </div>
          </CardContent>
        </Card>

        {/* Business + Owner details */}
        <div className="md:col-span-2 space-y-6">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Store size={20} className="text-emerald-500" /> Business Information
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Store Name</label>
                <div className="relative">
                  <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input type="text"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none"
                    value={shop?.name || ''} onChange={e => setShop({ ...shop, name: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Business Address</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 text-slate-500" size={18} />
                  <textarea rows={3}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
                    value={shop?.address || ''} onChange={e => setShop({ ...shop, address: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Business Contact</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input type="tel"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none"
                      value={shop?.mobile || ''} onChange={e => setShop({ ...shop, mobile: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Business Type</label>
                  <div className="relative">
                    <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <select
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none appearance-none"
                      value={shop?.business_type || 'kirana'} onChange={e => setShop({ ...shop, business_type: e.target.value })}>
                      <option value="kirana">Kirana / Grocery</option>
                      <option value="medical">Medical / Pharmacy</option>
                      <option value="electronics">Electronics</option>
                      <option value="clothes">Clothes / Boutique</option>
                      <option value="general">General Store</option>
                    </select>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <User size={20} className="text-blue-500" /> Owner Information
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Owner Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input type="text" disabled
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-slate-400 outline-none opacity-60"
                    value={user?.name || ''} />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input type="email" disabled
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-slate-400 outline-none opacity-60"
                    value={user?.email || ''} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Change Password */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-white">
              <KeyRound size={20} className="text-amber-400" /> Change Password
            </CardTitle>
            <button onClick={() => { setCpOpen(v => !v); setCpError(''); setCpOk(false); }}
              className="text-xs text-slate-400 hover:text-white transition-colors">
              {cpOpen ? 'Cancel' : 'Change'}
            </button>
          </div>
        </CardHeader>
        {cpOpen && (
          <CardContent>
            {cpOk ? (
              <div className="flex items-center gap-2 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 text-sm">
                <CheckCircle size={15} /> Password changed successfully!
              </div>
            ) : (
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">Current Password</label>
                    <div className="relative">
                      <input type={cpShow ? 'text' : 'password'} value={cpCurrent}
                        onChange={e => { setCpCurrent(e.target.value); setCpError(''); }}
                        placeholder="Current password"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-4 pr-10 text-slate-200 focus:ring-1 focus:ring-amber-500 outline-none text-sm" />
                      <button type="button" onClick={() => setCpShow(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                        {cpShow ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">New Password</label>
                    <input type={cpShow ? 'text' : 'password'} value={cpNew}
                      onChange={e => { setCpNew(e.target.value); setCpError(''); }}
                      placeholder="Min 6 characters"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-4 text-slate-200 focus:ring-1 focus:ring-amber-500 outline-none text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">Confirm Password</label>
                    <input type={cpShow ? 'text' : 'password'} value={cpConfirm}
                      onChange={e => { setCpConfirm(e.target.value); setCpError(''); }}
                      placeholder="Repeat new password"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-4 text-slate-200 focus:ring-1 focus:ring-amber-500 outline-none text-sm" />
                  </div>
                </div>
                {cpError && (
                  <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm">
                    <AlertCircle size={14} /> {cpError}
                  </div>
                )}
                <button type="submit" disabled={cpLoading}
                  className="px-6 py-2.5 rounded-xl font-bold text-sm bg-amber-500 hover:bg-amber-400 text-slate-900 flex items-center gap-2 transition-all disabled:opacity-50">
                  {cpLoading ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><Lock size={15} /> Update Password</>}
                </button>
              </form>
            )}
          </CardContent>
        )}
      </Card>

      {/* Today's Profit (password-protected) */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-white">
              <TrendingUp size={20} className="text-emerald-400" /> Today&apos;s Profit
            </CardTitle>
            {!profitData && (
              <button onClick={() => { setProfitOpen(v => !v); setProfitError(''); setProfitPwd(''); }}
                className="text-xs text-slate-400 hover:text-white transition-colors">
                {profitOpen ? 'Cancel' : 'View'}
              </button>
            )}
            {profitData && (
              <button onClick={() => { setProfitData(null); setProfitOpen(false); }}
                className="text-xs text-slate-400 hover:text-white transition-colors">Hide</button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!hasProfitPwd && !profitData && (
            <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-sm">
              <ShieldCheck size={16} className="flex-shrink-0" />
              <span>No profit password set. Go to your <strong>landing page profile</strong> to set one for security.</span>
            </div>
          )}

          {hasProfitPwd && !profitData && profitOpen && (
            <form onSubmit={handleViewProfit} className="flex items-end gap-3">
              <div className="flex-1 space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase">Profit Password</label>
                <div className="relative">
                  <input type={profitShow ? 'text' : 'password'} value={profitPwd}
                    onChange={e => { setProfitPwd(e.target.value); setProfitError(''); }}
                    placeholder="Enter profit password"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-4 pr-10 text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none text-sm" />
                  <button type="button" onClick={() => setProfitShow(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                    {profitShow ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {profitError && (
                  <p className="text-red-400 text-xs flex items-center gap-1"><AlertCircle size={12} />{profitError}</p>
                )}
              </div>
              <button type="submit" disabled={profitLoading}
                className="px-5 py-2.5 rounded-xl font-bold text-sm bg-emerald-500 hover:bg-emerald-400 text-slate-900 flex items-center gap-2 transition-all disabled:opacity-50">
                {profitLoading ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />}
                {profitLoading ? 'Checking…' : 'Show'}
              </button>
            </form>
          )}

          {hasProfitPwd && !profitData && !profitOpen && (
            <div className="flex items-center gap-3 py-2 text-slate-500 text-sm">
              <Lock size={16} /> Today&apos;s profit is hidden. Click <strong className="text-slate-300 ml-1">View</strong> to unlock.
            </div>
          )}

          {profitData && (
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-slate-800/60 rounded-xl p-4 text-center">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Revenue</p>
                <p className="text-xl font-black text-white">₹{profitData.totalRevenue.toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
                <p className="text-xs text-emerald-400 uppercase tracking-wider mb-1">Profit</p>
                <p className="text-xl font-black text-emerald-400">₹{profitData.totalProfit.toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-slate-800/60 rounded-xl p-4 text-center">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Bills</p>
                <p className="text-xl font-black text-white">{profitData.saleCount}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
