'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import {
  Eye, EyeOff, ShoppingBag, Loader2, AlertCircle,
  CheckCircle2, ArrowRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { PAYMENT_URL } from '@/lib/config';
import GoogleSignInButton from '@/components/GoogleSignInButton';

interface Form {
  ownerName: string;
  mobile: string;
  email: string;
  password: string;
  confirm: string;
}

const INITIAL: Form = {
  ownerName: '',
  mobile: '',
  email: '',
  password: '',
  confirm: '',
};

function StrengthBar({ password }: { password: string }) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  const colors = ['', 'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-emerald-500'];
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  if (!password) return null;
  return (
    <div className="space-y-1.5 mt-1.5">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className={cn('h-1 flex-1 rounded-full transition-colors', i <= score ? colors[score] : 'bg-slate-700')} />
        ))}
      </div>
      <p className={cn('text-[11px] font-medium', score <= 1 ? 'text-red-400' : score === 2 ? 'text-orange-400' : score === 3 ? 'text-yellow-400' : 'text-emerald-400')}>
        {labels[score]}
      </p>
    </div>
  );
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
  return null;
}

export default function SignupPage() {
  const locale = useLocale();
  const [form, setForm] = useState<Form>(INITIAL);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [referralCode, setReferralCode] = useState('');

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref')?.trim().toUpperCase();
    if (ref) setReferralCode(ref);
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  }

  function validate(): string {
    if (!form.ownerName.trim()) return 'Your name is required.';
    if (!/^\d{10}$/.test(form.mobile)) return 'Enter a valid 10-digit mobile number.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Enter a valid email.';
    if (form.password.length < 6) return 'Password must be at least 6 characters.';
    if (form.password !== form.confirm) return 'Passwords do not match.';
    return '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }

    setLoading(true);
    setError('');

    try {
      // Store name and business type are deliberately left unset here — the
      // account is personal-info-only at signup. /auth/register defaults the
      // shop to "{email prefix}'s Shop" / businessType "kirana" when they're
      // omitted, and the shopkeeper fills in the real values from Profile once
      // they're back in the app after picking a plan.
      const resp = await api.post('/auth/register', {
        email: form.email,
        password: form.password,
        full_name: form.ownerName,
        mobile: form.mobile,
        paid_plan: getCookie('ks_paid_plan'),
        paid_txnid: getCookie('ks_paid_txnid')
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
          mobile: form.mobile,
        }));

        if (referralCode) {
          try {
            await api.post('/referrals/apply', { referral_code: referralCode });
          } catch (refErr) {
            console.warn('Account created, but referral could not be applied', refErr);
          }
        }

        // Redirect to plan selection — new users must pick a plan before using the app.
        // In development mode, go directly to the dashboard, where Profile is where
        // they set their real store name and business type.
        const isDev = process.env.NODE_ENV === 'development';
        window.location.href = isDev ? `/${locale}` : PAYMENT_URL;
      } else {
        setError('Account created but no session returned. Please sign in.');
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div suppressHydrationWarning className="min-h-screen flex bg-slate-950">
      {/* ── Left branding ── */}
      <div className="hidden lg:flex lg:w-4/12 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 flex-col items-center justify-center p-12 relative overflow-hidden border-r border-slate-800">
        <div className="absolute w-80 h-80 rounded-full bg-emerald-500/5 -top-10 -right-10" />
        <div className="relative z-10 space-y-6 max-w-xs">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-xl shadow-emerald-500/30">
              <ShoppingBag size={24} className="text-slate-900" />
            </div>
            <div>
              <p className="text-lg font-black text-slate-50">Vyapar Sarthi</p>
              <p className="text-emerald-400 text-xs font-medium">AI Store Management</p>
            </div>
          </div>
          <h2 className="text-2xl font-bold text-slate-100 leading-snug">
            Set up your Account<br />
            <span className="text-emerald-400">in under a minute.</span>
          </h2>
          <div className="space-y-4 pt-4">
            {[
              'AI-powered inventory management',
              'Multi-lingual support',
              'Professional GST billing',
              'Smart udhar reminders'
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
                <span className="text-slate-400">{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right form ── */}
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-950 overflow-y-auto min-h-screen">
        <div className="w-full max-w-sm">
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            <div className="text-center md:text-left">
              <h2 className="text-3xl font-black text-slate-50 tracking-tight">Create Account</h2>
              <p className="text-slate-500 text-sm mt-1 font-medium">
                Just your details for now — you'll set up your store once you're in.
              </p>
              {referralCode && (
                <p className="mt-3 inline-flex rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300">
                  Referral code applied: {referralCode}
                </p>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Your Name">
                <input name="ownerName" value={form.ownerName} onChange={handleChange}
                  placeholder="e.g. Ramesh Patil" className={inputCls} />
              </Field>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Mobile Number">
                  <input name="mobile" type="tel" value={form.mobile} onChange={handleChange}
                    placeholder="10-digit number" maxLength={10} className={inputCls} />
                </Field>
                <Field label="Email">
                  <input name="email" type="email" value={form.email} onChange={handleChange}
                    placeholder="you@example.com" autoComplete="email" className={inputCls} />
                </Field>
              </div>

              <Field label="Password">
                <div className="relative">
                  <input name="password" type={showPw ? 'text' : 'password'} value={form.password}
                    onChange={handleChange} placeholder="Min. 6 characters" autoComplete="new-password"
                    className={cn(inputCls, 'pr-11')} />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <StrengthBar password={form.password} />
              </Field>

              <Field label="Confirm Password">
                <input name="confirm" type="password" value={form.confirm} onChange={handleChange}
                  placeholder="Repeat password"
                  className={cn(inputCls, form.confirm && form.confirm !== form.password && 'border-red-500/60 focus:border-red-500')} />
              </Field>

              {error && (
                <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm">
                  <AlertCircle size={15} className="flex-shrink-0" />{error}
                </div>
              )}

              <button type="submit" disabled={loading}
                className={cn(
                  'w-full py-4 rounded-xl font-black text-sm transition-all shadow-lg flex items-center justify-center gap-2 active:scale-95',
                  loading
                    ? 'bg-slate-800 text-slate-600'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
                )}>
                {loading ? <Loader2 className="animate-spin" size={18} /> : <>Create Account <ArrowRight size={18} /></>}
              </button>
            </form>
            {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
              <>
                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-800" /></div>
                  <div className="relative flex justify-center text-xs"><span className="bg-slate-950 px-3 text-slate-500">or sign up with</span></div>
                </div>
                <GoogleSignInButton />
              </>
            )}
          </div>

          <p className="text-center text-sm text-slate-500 mt-10">
            Already have an account?{' '}
            <button onClick={() => window.location.href = `/${locale}/login`}
              className="text-emerald-400 hover:text-emerald-300 font-black transition-colors underline-offset-4 hover:underline">
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

const inputCls = 'w-full bg-slate-900 border border-slate-800 text-slate-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 placeholder:text-slate-600 transition-all font-medium';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">
        {label}
      </label>
      {children}
    </div>
  );
}
