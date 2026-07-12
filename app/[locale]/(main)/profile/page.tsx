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
import { ALL_BUSINESS_TYPES } from '@/lib/businessConfig';


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



  useEffect(() => {
    (async () => {
      try {
        await fetchProfile();
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
        package_type: profile.packageType,
        gst: profile.gst || '',
        pan: profile.pan || '',
      });
    }
  }, [profile]);

  const showStatus = (type: 'success' | 'error', message: string) => {
    setStatus({ type, message });
    if (type === 'success') setTimeout(() => setStatus(null), 3000);
  };

  const handleSave = async () => {
    if (!shop?.name?.trim()) {
      showStatus('error', t('nameRequired'));
      return;
    }
    setSaving(true);
    try {
      await updateProfile({
        shopName: shop.name, address: shop.address,
        mobile: shop.mobile, logoUrl: shop.logo_url, businessType: shop.business_type,
        packageType: shop.package_type,
        gst: shop.gst, pan: shop.pan,
      });
      fetchProfile(); // Force re-fetch to ensure all components receive updated states
      showStatus('success', t('updateSuccess'));
    } catch { showStatus('error', t('updateError')); }
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
    } catch { showStatus('error', t('uploadFailed')); }
    finally { setUploading(false); }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setCpError('');
    if (!cpCurrent) { setCpError(t('enterCurrentPwd')); return; }
    if (!cpNew || cpNew.length < 6) { setCpError(t('minPwdLen')); return; }
    if (cpNew !== cpConfirm) { setCpError(t('pwdMismatch')); return; }
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

  if (loading) return <div className="p-10 text-center text-slate-500">Loading profile...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.push(`/${locale}/`)}
          className="p-2 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{t('title')}</h1>
          <p className="text-slate-500 dark:text-slate-400">{t('subtitle')}</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50">
          {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
          {saving ? t('saving') : t('saveChanges')}
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
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 md:col-span-1 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-widest text-slate-500">{t('branding')}</CardTitle>
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
              <button onClick={() => !uploading && fileInputRef.current?.click()} disabled={uploading}
                className="absolute -bottom-2 -right-2 w-10 h-10 bg-emerald-500 text-slate-900 rounded-xl flex items-center justify-center shadow-xl hover:bg-emerald-400 transition-all active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed">
                <Camera size={20} />
              </button>
              <input type="file" ref={fileInputRef} onChange={handleLogoUpload} disabled={uploading} accept="image/*" className="hidden" />
            </div>
            <div className="text-center">
              <p className="font-bold text-slate-900 dark:text-slate-200">{t('businessLogo')}</p>
            </div>
          </CardContent>
        </Card>

        {/* Business + Owner details */}
        <div className="md:col-span-2 space-y-6">
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
                <Store size={20} className="text-emerald-500" /> {t('businessInfo')}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">{t('shopName')}</label>
                <div className="relative">
                  <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input type="text"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-slate-900 dark:text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors"
                    value={shop?.name || ''} onChange={e => setShop({ ...shop, name: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">{t('address')}</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 text-slate-500" size={18} />
                  <textarea rows={3}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-slate-900 dark:text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none resize-none transition-colors"
                    value={shop?.address || ''} onChange={e => setShop({ ...shop, address: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">{t('mobile')}</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input type="tel"
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-slate-900 dark:text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors"
                      value={shop?.mobile || ''} onChange={e => setShop({ ...shop, mobile: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Business Category</label>
                  <div className="relative">
                    <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <select
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-slate-900 dark:text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none appearance-none transition-colors"
                      value={shop?.business_type || 'kirana'} onChange={e => setShop({ ...shop, business_type: e.target.value })}>
                      <option value="" disabled>{t('selectType')}</option>
                      {ALL_BUSINESS_TYPES.map(config => (
                        <option key={config.type} value={config.type}>
                          {config.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Package Type</label>
                  <div className="relative">
                    <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <select disabled
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-slate-500 dark:text-slate-400 focus:ring-1 focus:ring-emerald-500 outline-none appearance-none transition-colors opacity-80 cursor-not-allowed"
                      value={shop?.package_type || 'vyapar'} onChange={e => setShop({ ...shop, package_type: e.target.value })}>
                      <option value="vyapar">Vyapar Package</option>
                      <option value="wholesale">Udyog Package</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">{t('gstin')}</label>
                  <div className="relative">
                    <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input type="text" placeholder={t('optional')}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-slate-900 dark:text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors"
                      value={shop?.gst || ''} onChange={e => setShop({ ...shop, gst: e.target.value.toUpperCase() })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">{t('pan')}</label>
                  <div className="relative">
                    <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input type="text" placeholder={t('optional')}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-slate-900 dark:text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors"
                      value={shop?.pan || ''} onChange={e => setShop({ ...shop, pan: e.target.value.toUpperCase() })} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
                <User size={20} className="text-blue-500" /> {t('personalInfo')}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">{t('fullName')}</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input type="text" disabled
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-slate-500 dark:text-slate-400 outline-none opacity-80 dark:opacity-60 transition-colors"
                    value={user?.name || ''} />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">{t('email')}</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input type="email" disabled
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-slate-500 dark:text-slate-400 outline-none opacity-80 dark:opacity-60 transition-colors"
                    value={user?.email || ''} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Change Password */}
      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
              <KeyRound size={20} className="text-amber-500 dark:text-amber-400" /> {t('changePassword')}
            </CardTitle>
            <button onClick={() => { setCpOpen(v => !v); setCpError(''); setCpOk(false); }}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
              {cpOpen ? t('cancel') : t('change')}
            </button>
          </div>
        </CardHeader>
        {cpOpen && (
          <CardContent>
            {cpOk ? (
              <div className="flex items-center gap-2 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 text-sm">
                <CheckCircle size={15} /> {t('pwdSuccess')}
              </div>
            ) : (
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">{t('currentPassword')}</label>
                    <div className="relative">
                      <input type={cpShow ? 'text' : 'password'} value={cpCurrent}
                        onChange={e => { setCpCurrent(e.target.value); setCpError(''); }}
                        placeholder={t('currentPwdPlaceholder')}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 px-4 pr-10 text-slate-900 dark:text-slate-200 focus:ring-1 focus:ring-amber-500 outline-none text-sm transition-colors" />
                      <button type="button" onClick={() => setCpShow(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                        {cpShow ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">{t('newPassword')}</label>
                    <input type={cpShow ? 'text' : 'password'} value={cpNew}
                      onChange={e => { setCpNew(e.target.value); setCpError(''); }}
                      placeholder={t('newPwdPlaceholder')}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 px-4 text-slate-900 dark:text-slate-200 focus:ring-1 focus:ring-amber-500 outline-none text-sm transition-colors" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">{t('confirmPassword')}</label>
                    <input type={cpShow ? 'text' : 'password'} value={cpConfirm}
                      onChange={e => { setCpConfirm(e.target.value); setCpError(''); }}
                      placeholder={t('confirmPwdPlaceholder')}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 px-4 text-slate-900 dark:text-slate-200 focus:ring-1 focus:ring-amber-500 outline-none text-sm transition-colors" />
                  </div>
                </div>
                {cpError && (
                  <div className="flex items-center gap-2 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-4 py-3 text-sm">
                    <AlertCircle size={14} /> {cpError}
                  </div>
                )}
                <button type="submit" disabled={cpLoading}
                  className="px-6 py-2.5 rounded-xl font-bold text-sm bg-amber-500 hover:bg-amber-400 text-white dark:text-slate-900 flex items-center gap-2 transition-all disabled:opacity-50">
                  {cpLoading ? <><Loader2 size={15} className="animate-spin" /> {t('saving')}</> : <><Lock size={15} /> {t('updatePwdBtn')}</>}
                </button>
              </form>
            )}
          </CardContent>
        )}
      </Card>


    </div>
  );
}
