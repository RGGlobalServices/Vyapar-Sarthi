'use client';

import { useState } from 'react';
import {
  Eye, EyeOff, ShoppingBag, Loader2, AlertCircle, ArrowLeft,
  CheckCircle2, Mail, KeyRound, Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocale } from 'next-intl';
import api from '@/lib/api';
import GoogleSignInButton from '@/components/GoogleSignInButton';

type View = 'login' | 'forgot' | 'otp' | 'reset' | 'done';

export default function LoginPage() {
  const locale = useLocale();
  const [view, setView] = useState<View>('login');

  // Login state
  const [form, setForm]       = useState({ email: '', password: '' });
  const [show, setShow]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  // Forgot-password flow state
  const [fpEmail, setFpEmail]         = useState('');
  const [fpOtp, setFpOtp]             = useState('');
  const [fpResetToken, setFpResetToken] = useState('');
  const [fpNewPwd, setFpNewPwd]       = useState('');
  const [fpShowPwd, setFpShowPwd]     = useState(false);
  const [fpLoading, setFpLoading]     = useState(false);
  const [fpError, setFpError]         = useState('');

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email || !form.password) { setError('Please fill in all fields.'); return; }
    setLoading(true); setError('');
    try {
      const resp = await api.post('/auth/login', {
        email: form.email,
        password: form.password,
        shop_name: 'test',
      });
      const { access_token, user } = resp.data;
      if (access_token && user) {
        document.cookie = `ks_auth=1; path=/; max-age=${60 * 60 * 24 * 7}`;
        localStorage.setItem('ks_auth', JSON.stringify({
          access_token,
          user_id: user.id,
          email: user.email,
          name: user.name,
          storeName: user.storeName,
          mobile: user.mobile ?? '',
        }));
        const next = new URLSearchParams(window.location.search).get('next');
        window.location.href = next || `/${locale}/`;
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Wrong email or password. Please try again.');
    } finally { setLoading(false); }
  }

  // Step 1: Send OTP
  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!fpEmail) { setFpError('Please enter your email.'); return; }
    setFpLoading(true); setFpError('');
    try {
      await api.post('/auth/forgot-password', { email: fpEmail });
      setView('otp');
    } catch (err: any) {
      setFpError(err.response?.data?.detail || 'Failed to send OTP. Please try again.');
    } finally { setFpLoading(false); }
  }

  // Step 2: Verify OTP
  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!fpOtp || fpOtp.length !== 6) { setFpError('Enter the 6-digit OTP from your email.'); return; }
    setFpLoading(true); setFpError('');
    try {
      const resp = await api.post('/auth/verify-otp', { email: fpEmail, otp: fpOtp });
      setFpResetToken(resp.data.resetToken);
      setView('reset');
    } catch (err: any) {
      setFpError(err.response?.data?.detail || 'Incorrect OTP. Please try again.');
    } finally { setFpLoading(false); }
  }

  // Step 3: Reset password
  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!fpNewPwd || fpNewPwd.length < 6) { setFpError('Password must be at least 6 characters.'); return; }
    setFpLoading(true); setFpError('');
    try {
      await api.post('/auth/reset-password', { resetToken: fpResetToken, newPassword: fpNewPwd });
      setView('done');
    } catch (err: any) {
      setFpError(err.response?.data?.detail || 'Failed to reset password. Please try again.');
    } finally { setFpLoading(false); }
  }

  function restartForgot() {
    setView('forgot'); setFpOtp(''); setFpResetToken(''); setFpNewPwd(''); setFpError('');
  }

  const leftPanel = (
    <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 flex-col items-center justify-center p-12 relative overflow-hidden">
      <div className="absolute w-96 h-96 rounded-full bg-emerald-500/5 -top-20 -left-20" />
      <div className="absolute w-64 h-64 rounded-full bg-emerald-500/10 bottom-10 right-10" />
      <div className="relative z-10 text-center space-y-6 max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-14 h-14 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-2xl shadow-emerald-500/30">
            <ShoppingBag size={28} className="text-slate-900" />
          </div>
          <div className="text-left">
            <h1 className="text-2xl font-black text-slate-50">Vyapar Sarthi</h1>
            <p className="text-emerald-400 text-sm font-medium">Store Management</p>
          </div>
        </div>
        <h2 className="text-3xl font-bold text-slate-100 leading-tight">
          Manage your store<br /><span className="text-emerald-400">smarter, faster.</span>
        </h2>
        <p className="text-slate-400 text-base leading-relaxed">
          Track inventory, bills, udhar, and get AI-powered insights — all in one place.
        </p>
        <div className="grid grid-cols-2 gap-4 mt-8">
          {[
            { label: 'Billing', desc: 'Fast checkout' },
            { label: 'Stock', desc: 'Live tracking' },
            { label: 'Udhar', desc: 'Ledger book' },
            { label: 'AI Help', desc: 'Smart insights' },
          ].map(f => (
            <div key={f.label} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3 text-left">
              <p className="text-emerald-400 font-semibold text-sm">{f.label}</p>
              <p className="text-slate-500 text-xs">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const mobileHeader = (
    <div className="flex items-center gap-3 lg:hidden">
      <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
        <ShoppingBag size={20} className="text-slate-900" />
      </div>
      <span className="text-xl font-black text-slate-50">Vyapar Sarthi</span>
    </div>
  );

  /* ── Done ── */
  if (view === 'done') {
    return (
      <div suppressHydrationWarning className="min-h-screen flex">
        {leftPanel}
        <div className="flex-1 flex items-center justify-center p-6 bg-slate-950">
          <div className="w-full max-w-sm text-center space-y-6">
            <div className="w-16 h-16 bg-emerald-500/15 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 size={32} className="text-emerald-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-50">Password reset!</h2>
              <p className="text-slate-400 text-sm mt-2">Your password has been changed successfully.</p>
            </div>
            <button
              onClick={() => { setView('login'); setFpEmail(''); setFpOtp(''); setFpNewPwd(''); setFpError(''); }}
              className="w-full py-3 rounded-xl font-bold text-sm bg-emerald-500 hover:bg-emerald-400 text-slate-900 transition-all">
              Sign In with New Password
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Reset password (step 3) ── */
  if (view === 'reset') {
    return (
      <div suppressHydrationWarning className="min-h-screen flex">
        {leftPanel}
        <div className="flex-1 flex items-center justify-center p-6 bg-slate-950">
          <div className="w-full max-w-sm space-y-8">
            {mobileHeader}
            <div>
              <button onClick={restartForgot}
                className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 text-sm mb-4 transition-colors">
                <ArrowLeft size={14} /> Back
              </button>
              <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mb-4">
                <Lock size={20} className="text-emerald-400" />
              </div>
              <h2 className="text-2xl font-bold text-slate-50">Set new password</h2>
              <p className="text-slate-400 text-sm mt-1">Choose a strong password for your account.</p>
            </div>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">New Password</label>
                <div className="relative">
                  <input
                    type={fpShowPwd ? 'text' : 'password'}
                    value={fpNewPwd}
                    onChange={e => { setFpNewPwd(e.target.value); setFpError(''); }}
                    placeholder="At least 6 characters"
                    className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 placeholder:text-slate-600 transition-colors" />
                  <button type="button" onClick={() => setFpShowPwd(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                    {fpShowPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              {fpError && (
                <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm">
                  <AlertCircle size={15} className="flex-shrink-0" />{fpError}
                </div>
              )}
              <button type="submit" disabled={fpLoading}
                className={cn('w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2',
                  fpLoading ? 'bg-emerald-600/50 text-emerald-300 cursor-not-allowed' : 'bg-emerald-500 hover:bg-emerald-400 text-slate-900 shadow-lg shadow-emerald-500/20')}>
                {fpLoading ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : 'Reset Password'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  /* ── OTP entry (step 2) ── */
  if (view === 'otp') {
    return (
      <div suppressHydrationWarning className="min-h-screen flex">
        {leftPanel}
        <div className="flex-1 flex items-center justify-center p-6 bg-slate-950">
          <div className="w-full max-w-sm space-y-8">
            {mobileHeader}
            <div>
              <button onClick={() => { setView('forgot'); setFpError(''); }}
                className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 text-sm mb-4 transition-colors">
                <ArrowLeft size={14} /> Back
              </button>
              <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mb-4">
                <KeyRound size={20} className="text-emerald-400" />
              </div>
              <h2 className="text-2xl font-bold text-slate-50">Enter OTP</h2>
              <p className="text-slate-400 text-sm mt-1">
                We sent a 6-digit code to <span className="text-emerald-400 font-semibold">{fpEmail}</span>
              </p>
            </div>
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">6-Digit OTP</label>
                <input
                  type="text" inputMode="numeric" maxLength={6}
                  value={fpOtp}
                  onChange={e => { setFpOtp(e.target.value.replace(/\D/g, '')); setFpError(''); }}
                  placeholder="______"
                  className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-4 py-3 text-center tracking-[0.5em] text-xl font-mono focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 placeholder:tracking-normal placeholder:text-slate-600 transition-colors" />
              </div>
              {fpError && (
                <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm">
                  <AlertCircle size={15} className="flex-shrink-0" />{fpError}
                </div>
              )}
              <button type="submit" disabled={fpLoading}
                className={cn('w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2',
                  fpLoading ? 'bg-emerald-600/50 text-emerald-300 cursor-not-allowed' : 'bg-emerald-500 hover:bg-emerald-400 text-slate-900 shadow-lg shadow-emerald-500/20')}>
                {fpLoading ? <><Loader2 size={16} className="animate-spin" /> Verifying…</> : 'Verify OTP'}
              </button>
              <p className="text-center text-xs text-slate-500">
                Didn&apos;t get it?{' '}
                <button type="button" onClick={restartForgot} className="text-emerald-400 hover:text-emerald-300 transition-colors">
                  Resend OTP
                </button>
              </p>
            </form>
          </div>
        </div>
      </div>
    );
  }

  /* ── Forgot (step 1: email) ── */
  if (view === 'forgot') {
    return (
      <div suppressHydrationWarning className="min-h-screen flex">
        {leftPanel}
        <div className="flex-1 flex items-center justify-center p-6 bg-slate-950">
          <div className="w-full max-w-sm space-y-8">
            {mobileHeader}
            <div>
              <button onClick={() => { setView('login'); setFpError(''); }}
                className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 text-sm mb-4 transition-colors">
                <ArrowLeft size={14} /> Back to sign in
              </button>
              <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mb-4">
                <Mail size={20} className="text-emerald-500 dark:text-emerald-400" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Reset your password</h2>
              <p className="text-slate-400 text-sm mt-1">Enter your email and we&apos;ll send a 6-digit OTP.</p>
            </div>
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Email</label>
                <input type="email" value={fpEmail}
                  onChange={e => { setFpEmail(e.target.value); setFpError(''); }}
                  placeholder="you@example.com" autoComplete="email"
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 placeholder:text-slate-400 dark:placeholder:text-slate-600 transition-colors" />
              </div>
              {fpError && (
                <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm">
                  <AlertCircle size={15} className="flex-shrink-0" />{fpError}
                </div>
              )}
              <button type="submit" disabled={fpLoading}
                className={cn('w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2',
                  fpLoading ? 'bg-emerald-600/50 text-emerald-300 cursor-not-allowed' : 'bg-emerald-500 hover:bg-emerald-400 text-white dark:text-slate-900 shadow-lg shadow-emerald-500/20')}>
                {fpLoading ? <><Loader2 size={16} className="animate-spin" /> Sending…</> : 'Send OTP'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  /* ── Login form ── */
  return (
    <div suppressHydrationWarning className="min-h-screen flex">
      {leftPanel}
      <div className="flex-1 flex items-center justify-center p-6 bg-white dark:bg-slate-950">
        <div className="w-full max-w-sm space-y-8">
          {mobileHeader}
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Welcome back</h2>
            <p className="text-slate-400 text-sm mt-1">Sign in to your store account</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Email</label>
              <input name="email" type="email" value={form.email} onChange={handleChange}
                placeholder="you@example.com" autoComplete="email"
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 placeholder:text-slate-400 dark:placeholder:text-slate-600 transition-colors" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Password</label>
                <button type="button" onClick={() => { setView('forgot'); setFpEmail(form.email); setFpError(''); }}
                  className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input name="password" type={show ? 'text' : 'password'} value={form.password}
                  onChange={handleChange} placeholder="••••••••" autoComplete="current-password"
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 placeholder:text-slate-400 dark:placeholder:text-slate-600 transition-colors" />
                <button type="button" onClick={() => setShow(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {error && (
              <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm">
                <AlertCircle size={15} className="flex-shrink-0" />{error}
              </div>
            )}
            <button type="submit" disabled={loading}
              className={cn('w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2',
                loading ? 'bg-emerald-600/50 text-emerald-300 cursor-not-allowed' : 'bg-emerald-500 hover:bg-emerald-400 text-white dark:text-slate-900 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30')}>
              {loading ? <><Loader2 size={16} className="animate-spin" /> Signing in…</> : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center space-y-3">
            <p className="text-sm text-slate-400">
              Don&apos;t have an account?{' '}
              <a href="https://vyaparsarthii.com" className="text-emerald-400 hover:text-emerald-300 font-bold transition-colors">
                Create Account
              </a>
            </p>
            <p className="text-xs">
              <a href="https://vyaparsarthii.com" className="text-slate-500 hover:text-slate-400 underline transition-colors flex items-center justify-center gap-1">
                <ArrowLeft size={12} /> Return to Website
              </a>
            </p>
          </div>

          <GoogleAuthDivider />
          <GoogleSignInButton />
        </div>
      </div>
    </div>
  );
}

// Small "or continue with" divider, shown only when Google sign-in is configured.
function GoogleAuthDivider() {
  if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) return null;
  return (
    <div className="relative my-5">
      <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200 dark:border-slate-700" /></div>
      <div className="relative flex justify-center text-xs">
        <span className="bg-white dark:bg-slate-950 px-3 text-slate-500">or continue with</span>
      </div>
    </div>
  );
}
