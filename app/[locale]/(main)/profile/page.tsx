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
  const { user, updateUser } = useAuthStore();
  const router = useRouter();
  const locale = useLocale();

  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [status, setStatus]     = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [shop, setShop]         = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit Email
  const [emailOpen, setEmailOpen]       = useState(false);
  const [newEmail, setNewEmail]         = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailShowPwd, setEmailShowPwd] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError]     = useState('');
  const [emailOk, setEmailOk]           = useState(false);

  // Change password
  const [cpOpen, setCpOpen]         = useState(false);
  const [cpCurrent, setCpCurrent]   = useState('');
  const [cpNew, setCpNew]           = useState('');
  const [cpConfirm, setCpConfirm]   = useState('');
  const [cpShow, setCpShow]         = useState(false);
  const [cpLoading, setCpLoading]   = useState(false);
  const [cpError, setCpError]       = useState('');
  const [cpOk, setCpOk]             = useState(false);

  // Forgot password
  const [fpOpen, setFpOpen]           = useState(false);
  const [fpStep, setFpStep]           = useState<'idle' | 'otp' | 'reset'>('idle');
  const [fpOtp, setFpOtp]             = useState('');
  const [fpResetToken, setFpResetToken] = useState('');
  const [fpLoading, setFpLoading]     = useState(false);
  const [fpError, setFpError]         = useState('');

  useEffect(() => {
    if (user?.email) {
      setNewEmail(user.email);
    }
  }, [user?.email]);

  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError('');
    setEmailOk(false);

    const trimmed = newEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!trimmed || !emailRegex.test(trimmed)) {
      setEmailError('Please enter a valid email address.');
      return;
    }

    if (trimmed === user?.email?.toLowerCase()) {
      setEmailError('New email address is identical to your current email.');
      return;
    }

    if (!emailPassword) {
      setEmailError('Current password is required to change your email.');
      return;
    }

    setEmailLoading(true);
    try {
      const res = await api.patch('/user/profile', {
        email: trimmed,
        currentPassword: emailPassword
      });

      const updatedEmail = res.data?.user?.email || trimmed;
      updateUser({ email: updatedEmail });
      setEmailOk(true);
      setEmailPassword('');
      showStatus('success', 'Email address updated successfully!');
      setTimeout(() => {
        setEmailOk(false);
        setEmailOpen(false);
      }, 2000);
    } catch (err: any) {
      setEmailError(err.response?.data?.detail || 'Failed to update email address.');
    } finally {
      setEmailLoading(false);
    }
  };

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
      const bType = profile.businessType || (profile as any).business_type || 'kirana';
      setShop({
        id: profile.id,
        name: profile.shopName,
        address: profile.address,
        mobile: profile.mobile,
        logo_url: profile.logoUrl,
        business_type: bType,
        businessType: bType,
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

  const handleSendOtp = async () => {
    setFpLoading(true); setFpError('');
    try {
      await api.post('/auth/forgot-password', { email: user?.email });
      setFpStep('otp');
    } catch (err: any) {
      setFpError(err.response?.data?.detail || 'Failed to send OTP.');
    } finally { setFpLoading(false); }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fpOtp || fpOtp.length !== 6) { setFpError('Enter the 6-digit OTP.'); return; }
    setFpLoading(true); setFpError('');
    try {
      const resp = await api.post('/auth/verify-otp', { email: user?.email, otp: fpOtp });
      setFpResetToken(resp.data.resetToken);
      setFpStep('reset');
    } catch (err: any) {
      setFpError(err.response?.data?.detail || 'Incorrect OTP.');
    } finally { setFpLoading(false); }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cpNew || cpNew.length < 6) { setFpError('Password must be at least 6 characters.'); return; }
    if (cpNew !== cpConfirm) { setFpError('Passwords do not match.'); return; }
    setFpLoading(true); setFpError('');
    try {
      await api.post('/auth/reset-password', { resetToken: fpResetToken, newPassword: cpNew });
      setCpOk(true); // Re-use cpOk for success message
      setFpOpen(false); setCpOpen(false); setFpStep('idle');
      setCpNew(''); setCpConfirm(''); setFpOtp('');
      setTimeout(() => setCpOk(false), 2000);
    } catch (err: any) {
      setFpError(err.response?.data?.detail || 'Failed to reset password.');
    } finally { setFpLoading(false); }
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
                      value={shop?.business_type || shop?.businessType || 'kirana'}
                      onChange={e => {
                        const val = e.target.value;
                        setShop(s => ({ ...s, business_type: val, businessType: val }));
                      }}>
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
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
                  <User size={20} className="text-blue-500" /> {t('personalInfo')}
                </CardTitle>
                <button
                  type="button"
                  onClick={() => {
                    setEmailOpen(v => !v);
                    setEmailError('');
                    setEmailOk(false);
                    if (user?.email) setNewEmail(user.email);
                  }}
                  className="text-xs font-bold text-emerald-500 hover:text-emerald-400 transition-colors"
                >
                  {emailOpen ? t('cancel') : 'Edit Email'}
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              </div>

              {/* Email Update Form */}
              {emailOpen && (
                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 animate-in slide-in-from-top-2">
                  {emailOk ? (
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl px-4 py-3 text-sm">
                      <CheckCircle size={15} /> Email address updated successfully!
                    </div>
                  ) : (
                    <form onSubmit={handleUpdateEmail} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase">New Email Address</label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                            <input
                              type="email"
                              required
                              value={newEmail}
                              onChange={e => { setNewEmail(e.target.value); setEmailError(''); }}
                              placeholder="name@example.com"
                              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-slate-900 dark:text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none text-sm transition-colors"
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase">Current Password</label>
                          <div className="relative">
                            <input
                              type={emailShowPwd ? 'text' : 'password'}
                              required
                              value={emailPassword}
                              onChange={e => { setEmailPassword(e.target.value); setEmailError(''); }}
                              placeholder="Required for security"
                              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 px-4 pr-10 text-slate-900 dark:text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none text-sm transition-colors"
                            />
                            <button
                              type="button"
                              onClick={() => setEmailShowPwd(v => !v)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                            >
                              {emailShowPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                        </div>
                      </div>

                      {emailError && (
                        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-4 py-3 text-sm">
                          <AlertCircle size={14} /> {emailError}
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => { setEmailOpen(false); setEmailError(''); }}
                          className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={emailLoading}
                          className="px-6 py-2.5 rounded-xl font-bold text-sm bg-emerald-500 hover:bg-emerald-400 text-white dark:text-slate-900 flex items-center gap-2 transition-all disabled:opacity-50"
                        >
                          {emailLoading ? (
                            <>
                              <Loader2 size={15} className="animate-spin" /> Updating Email…
                            </>
                          ) : (
                            <>
                              <Save size={15} /> Update Email Address
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
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
                  <div className="flex items-center justify-between">
                    <button type="submit" disabled={cpLoading}
                      className="px-6 py-2.5 rounded-xl font-bold text-sm bg-amber-500 hover:bg-amber-400 text-white dark:text-slate-900 flex items-center gap-2 transition-all disabled:opacity-50">
                      {cpLoading ? <><Loader2 size={15} className="animate-spin" /> {t('saving')}</> : <><Lock size={15} /> {t('updatePwdBtn')}</>}
                    </button>
                    <button type="button" onClick={() => { setFpOpen(true); handleSendOtp(); }} className="text-sm font-bold text-emerald-500 hover:text-emerald-600 transition-colors">
                      Forgot Password?
                    </button>
                  </div>
                </form>
            )}
            
            {/* Forgot Password Flow */}
            {fpOpen && (
              <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <ShieldCheck size={18} className="text-emerald-500" /> Reset Password via Email
                  </h3>
                  <button onClick={() => { setFpOpen(false); setFpStep('idle'); setFpError(''); }} className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white font-bold">
                    Cancel
                  </button>
                </div>
                
                {fpStep === 'otp' && (
                  <form onSubmit={handleVerifyOtp} className="space-y-4">
                    <p className="text-sm text-slate-500">We've sent a 6-digit OTP to <b>{user?.email}</b>. Please enter it below.</p>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase">Enter OTP</label>
                      <input type="text" maxLength={6} value={fpOtp}
                        onChange={e => { setFpOtp(e.target.value.replace(/\D/g, '')); setFpError(''); }}
                        placeholder="123456"
                        className="w-full sm:w-1/2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 px-4 text-slate-900 dark:text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none text-sm transition-colors text-center tracking-[0.5em] font-mono" />
                    </div>
                    {fpError && (
                      <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
                        <AlertCircle size={14} /> {fpError}
                      </div>
                    )}
                    <button type="submit" disabled={fpLoading || fpOtp.length !== 6}
                      className="px-6 py-2.5 rounded-xl font-bold text-sm bg-emerald-500 hover:bg-emerald-400 text-white dark:text-slate-900 transition-all disabled:opacity-50">
                      {fpLoading ? 'Verifying...' : 'Verify OTP'}
                    </button>
                  </form>
                )}

                {fpStep === 'reset' && (
                  <form onSubmit={handleResetPassword} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase">New Password</label>
                        <input type={cpShow ? 'text' : 'password'} value={cpNew}
                          onChange={e => { setCpNew(e.target.value); setFpError(''); }}
                          placeholder="New password"
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 px-4 text-slate-900 dark:text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none text-sm transition-colors" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase">Confirm Password</label>
                        <input type={cpShow ? 'text' : 'password'} value={cpConfirm}
                          onChange={e => { setCpConfirm(e.target.value); setFpError(''); }}
                          placeholder="Confirm new password"
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 px-4 text-slate-900 dark:text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none text-sm transition-colors" />
                      </div>
                    </div>
                    {fpError && (
                      <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
                        <AlertCircle size={14} /> {fpError}
                      </div>
                    )}
                    <button type="submit" disabled={fpLoading}
                      className="px-6 py-2.5 rounded-xl font-bold text-sm bg-emerald-500 hover:bg-emerald-400 text-white dark:text-slate-900 transition-all disabled:opacity-50">
                      {fpLoading ? 'Saving...' : 'Set New Password'}
                    </button>
                  </form>
                )}

                {fpStep === 'idle' && fpLoading && (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 size={15} className="animate-spin" /> Sending OTP to {user?.email}...
                  </div>
                )}
              </div>
            )}
          </CardContent>
        )}
      </Card>


    </div>
  );
}
