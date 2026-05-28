'use client';

import { useState, useEffect } from 'react';
import { Eye, EyeOff, ShoppingBag, Loader2, AlertCircle, ArrowLeft, CheckCircle2, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocale } from 'next-intl';
import api from '@/lib/api';


type View = 'login' | 'forgot' | 'forgot-sent';

export default function LoginPage() {
  const locale = useLocale();
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<View>('login');

  useEffect(() => {
    setMounted(true);
  }, []);

  const [form, setForm]       = useState({ email: '', password: '' });
  const [show, setShow]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const [forgotEmail, setForgotEmail]     = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError]     = useState('');

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email || !form.password) { setError('Please fill in all fields.'); return; }
    setLoading(true);
    setError('');

    try {
      const resp = await api.post('/auth/login', {
        email: form.email,
        password: form.password,
        shop_name: 'test' // Backend uses UserCreate for login input, expects shop_name but ignores it
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
      setError(err.response?.data?.detail || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  }


  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    if (!forgotEmail) { setForgotError('Please enter your email.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forgotEmail)) { setForgotError('Enter a valid email address.'); return; }
    setForgotLoading(true);
    setForgotError('');

    try {
      await api.post('/auth/forgot-password', { email: forgotEmail });
      setView('forgot-sent');
    } catch (err: any) {
      setForgotError(err.response?.data?.detail || 'Failed to send reset email. Please try again.');
    } finally {
      setForgotLoading(false);
    }
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

  if (!mounted) {
    return <div suppressHydrationWarning className="min-h-screen bg-slate-950 flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
    </div>;
  }

  /* ── Forgot sent ── */
  if (view === 'forgot-sent') {
    return (
      <div className="min-h-screen flex">
        {leftPanel}
        <div className="flex-1 flex items-center justify-center p-6 bg-slate-950">
          <div className="w-full max-w-sm text-center space-y-6">
            <div className="w-16 h-16 bg-emerald-500/15 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 size={32} className="text-emerald-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-50">Check your email</h2>
              <p className="text-slate-400 text-sm mt-2">
                We sent a password reset link to<br />
                <span className="text-emerald-400 font-semibold">{forgotEmail}</span>
              </p>
            </div>
            <p className="text-slate-600 text-xs">Didn&apos;t receive it? Check your spam folder.</p>
            <button onClick={() => { setView('login'); setForgotEmail(''); }}
              className="flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 transition-colors mx-auto">
              <ArrowLeft size={14} /> Back to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Forgot form ── */
  if (view === 'forgot') {
    return (
      <div className="min-h-screen flex">
        {leftPanel}
        <div className="flex-1 flex items-center justify-center p-6 bg-slate-950">
          <div className="w-full max-w-sm space-y-8">
            <div className="flex items-center gap-3 lg:hidden">
              <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
                <ShoppingBag size={20} className="text-slate-900" />
              </div>
              <span className="text-xl font-black text-slate-50">Vyapar Sarthi</span>
            </div>
            <div>
              <button onClick={() => { setView('login'); setForgotError(''); }}
                className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 text-sm mb-4 transition-colors">
                <ArrowLeft size={14} /> Back to sign in
              </button>
              <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mb-4">
                <Mail size={20} className="text-emerald-400" />
              </div>
              <h2 className="text-2xl font-bold text-slate-50">Reset your password</h2>
              <p className="text-slate-400 text-sm mt-1">Enter your email and we&apos;ll send you a reset link.</p>
            </div>
            <form onSubmit={handleForgot} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Email</label>
                <input type="email" value={forgotEmail}
                  onChange={e => { setForgotEmail(e.target.value); setForgotError(''); }}
                  placeholder="you@example.com" autoComplete="email"
                  className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 placeholder:text-slate-600 transition-colors" />
              </div>
              {forgotError && (
                <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm">
                  <AlertCircle size={15} className="flex-shrink-0" />{forgotError}
                </div>
              )}
              <button type="submit" disabled={forgotLoading}
                className={cn('w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2',
                  forgotLoading ? 'bg-emerald-600/50 text-emerald-300 cursor-not-allowed' : 'bg-emerald-500 hover:bg-emerald-400 text-slate-900 shadow-lg shadow-emerald-500/20')}>
                {forgotLoading ? <><Loader2 size={16} className="animate-spin" /> Sending…</> : 'Send Reset Link'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  /* ── Login form ── */
  return (
    <div className="min-h-screen flex">
      {leftPanel}
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-950">
        <div className="w-full max-w-sm space-y-8">

          <div className="flex items-center gap-3 lg:hidden">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
              <ShoppingBag size={20} className="text-slate-900" />
            </div>
            <span className="text-xl font-black text-slate-50">Vyapar Sarthi</span>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-slate-50">Welcome back</h2>
            <p className="text-slate-400 text-sm mt-1">Sign in to your store account</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Email</label>
              <input name="email" type="email" value={form.email} onChange={handleChange}
                placeholder="you@example.com" autoComplete="email"
                className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 placeholder:text-slate-600 transition-colors" />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Password</label>
                <button type="button" onClick={() => { setView('forgot'); setForgotEmail(form.email); setForgotError(''); }}
                  className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input name="password" type={show ? 'text' : 'password'} value={form.password}
                  onChange={handleChange} placeholder="••••••••" autoComplete="current-password"
                  className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 placeholder:text-slate-600 transition-colors" />
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
                loading ? 'bg-emerald-600/50 text-emerald-300 cursor-not-allowed' : 'bg-emerald-500 hover:bg-emerald-400 text-slate-900 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30')}>
              {loading ? <><Loader2 size={16} className="animate-spin" /> Signing in…</> : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500">
            New to Vyapar Sarthi?{' '}
            <button onClick={() => window.location.href = `${process.env.NEXT_PUBLIC_LANDING_URL || 'http://localhost:5173'}/payment.html`}
              className="text-emerald-400 hover:text-emerald-300 font-semibold transition-colors">
              Create account
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
